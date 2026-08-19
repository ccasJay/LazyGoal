import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentProfile } from "../../runtime/src/agent-profile";
import { createGoal } from "../../runtime/src/domain";
import type {
    Goal,
    GoalMessage,
    PendingAction,
    StepRecord,
} from "../../runtime/src/domain";
import { InMemoryGoalStore } from "../../storage/src/index";
import type { ToolDefinition } from "../../runtime/src/tool";
import {
    buildPreparationRequest,
    buildStepRequest,
    buildStepUserMessage,
    buildWorkingContext,
    buildWorkingContextMessage,
    PREPARATION_RESULT_PROTOCOL,
    STEP_RESULT_PROTOCOL,
} from "../src/prompt";

const intent = "完成示例任务";
const task = {
    objective: "实现三阶段上下文",
    completionCriteria: ["请求顺序稳定", "控制消息不持久化"],
};
const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "你是一个严谨的执行代理。",
    instructions: ["先检查输入", "再给出下一步"],
    toolIds: [],
};

function createPreparationGoal(
    phase: "gathering_context" | "planning" = "gathering_context",
    messages: readonly GoalMessage[] = [],
): Goal {
    const goal = createGoal({
        id: "goal-1",
        intent,
        profile,
        messages,
        runId: "run-1",
    });

    if (phase === "gathering_context") {
        return goal;
    }

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "planning",
                preparation: { status: "active" },
            },
        },
    };
}

function createExecutingGoal(options: {
    readonly maxSteps?: number;
    readonly messages?: readonly GoalMessage[];
    readonly stepCount?: number;
    readonly previousStep?: StepRecord;
    readonly checkpoint?: string;
    readonly pendingAction?: PendingAction;
} = {}): Goal {
    const goal = createGoal({
        id: "goal-1",
        intent,
        profile,
        runId: "run-1",
        ...(options.messages === undefined
            ? {}
            : { messages: options.messages }),
        ...(options.maxSteps === undefined
            ? {}
            : { maxSteps: options.maxSteps }),
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task,
            },
            run: {
                ...goal.state.run,
                status: "running",
                stepCount: options.stepCount ?? 0,
                ...(options.checkpoint === undefined
                    ? {}
                    : { checkpoint: options.checkpoint }),
                ...(options.previousStep === undefined
                    ? {}
                    : { lastStep: options.previousStep }),
                ...(options.pendingAction === undefined
                    ? {}
                    : { pendingAction: options.pendingAction }),
            },
        },
    };
}

test("buildWorkingContext 按 gathering、planning、executing 三阶段派生", () => {
    assert.deepEqual(buildWorkingContext(createPreparationGoal()), {
        phase: "gathering_context",
        intent,
    });
    assert.deepEqual(buildWorkingContext(createPreparationGoal("planning")), {
        phase: "planning",
        intent,
    });
    assert.deepEqual(buildWorkingContext(createExecutingGoal()), {
        phase: "executing",
        intent,
        task,
        execution: { stepCount: 0 },
    });
});

test("executing WorkingContext 只投影正数 maxSteps 和最近 previousStep", () => {
    const previousStep: StepRecord = {
        kind: "legacy",
        result: { kind: "continue", summary: "已完成输入检查" },
    };
    const goal = createExecutingGoal({
        maxSteps: 4,
        stepCount: 1,
        previousStep,
    });
    const context = buildWorkingContext(goal);

    assert.deepEqual(context, {
        phase: "executing",
        intent,
        task,
        execution: {
            stepCount: 1,
            maxSteps: 4,
            previousStep,
        },
    });
    assert.notStrictEqual(
        context.phase === "executing" ? context.task : undefined,
        goal.state.workflow.phase === "executing"
            ? goal.state.workflow.task
            : undefined,
    );
    assert.notStrictEqual(
        context.phase === "executing"
            ? context.execution.previousStep
            : undefined,
        goal.state.run.lastStep,
    );
});

test("executing WorkingContext 投影 checkpoint、最近 Action Step 和 pendingAction", () => {
    const previousStep: StepRecord = {
        kind: "action",
        action: {
            actionId: "action-1",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        observation: {
            kind: "success",
            output: "完成",
            summary: "已读取 README.md",
        },
    };
    const pendingAction: PendingAction = {
        action: {
            actionId: "action-2",
            toolId: "read_file",
            input: { path: "package.json" },
        },
        status: "approved",
    };
    const goal = createExecutingGoal({
        stepCount: 1,
        checkpoint: "已吸收 README 内容",
        previousStep,
        pendingAction,
    });

    const context = buildWorkingContext(goal);

    assert.deepEqual(
        context.phase === "executing" ? context.execution : undefined,
        {
            stepCount: 1,
            checkpoint: "已吸收 README 内容",
            previousStep,
            pendingAction,
        },
    );
    assert.notStrictEqual(
        context.phase === "executing"
            ? context.execution.pendingAction
            : undefined,
        pendingAction,
    );
});

test("请求顺序固定为 system、真实历史、当前 Working Context", () => {
    const messages: readonly GoalMessage[] = [
        { role: "user", content: "补充的真实输入" },
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "真实响应",
        },
    ];
    const goal = createExecutingGoal({ messages });
    const request = buildStepRequest(goal);

    assert.match(request.messages[0]?.content ?? "", /你是一个严谨的执行代理/);
    assert.match(request.messages[0]?.content ?? "", /1\. 先检查输入/);
    assert.ok(
        (request.messages[0]?.content ?? "").includes(STEP_RESULT_PROTOCOL),
    );
    assert.deepEqual(
        request.messages.slice(1, -1),
        goal.state.messages.map(({ role, content }) => ({ role, content })),
    );
    assert.deepEqual(
        JSON.parse(request.messages.at(-1)?.content ?? ""),
        buildWorkingContext(goal),
    );
    assert.deepEqual(buildStepUserMessage(goal), buildWorkingContextMessage(goal));
});

test("执行请求只展示调用方传入的授权 ToolDefinition", () => {
    const goal = createExecutingGoal();
    const tool: ToolDefinition = {
        id: "read_file",
        description: "读取工作区内文本文件",
        inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
        },
    };
    const request = buildStepRequest(goal, [tool]);
    const systemContent = request.messages[0]?.content ?? "";

    assert.match(systemContent, /read_file/);
    assert.match(systemContent, /读取工作区内文本文件/);
    assert.match(systemContent, /AgentDecision/);
});

test("Preparation 请求按当前 phase 选择协议并使用同一消息顺序", () => {
    for (const phase of ["gathering_context", "planning"] as const) {
        const goal = createPreparationGoal(phase, [
            {
                role: "assistant",
                assistant: { profileId: "profile-1" },
                content: "已记录的真实问题",
            },
            { role: "user", content: "已记录的真实回答" },
        ]);
        const request = buildPreparationRequest(goal);

        assert.ok(
            (request.messages[0]?.content ?? "").includes(
                PREPARATION_RESULT_PROTOCOL[phase],
            ),
        );
        assert.deepEqual(
            request.messages.slice(1, -1),
            goal.state.messages.map(({ role, content }) => ({ role, content })),
        );
        assert.deepEqual(
            JSON.parse(request.messages.at(-1)?.content ?? ""),
            { phase, intent },
        );
    }
});

test("保存恢复后真实消息及 assistant 来源不变，控制消息不进入快照", async () => {
    const store = new InMemoryGoalStore();
    const goal = createExecutingGoal({
        messages: [
            {
                role: "assistant",
                assistant: { profileId: "profile-1" },
                content: "需要补充部署环境",
            },
            { role: "user", content: "部署到 Linux" },
        ],
    });
    await store.save(goal);
    const restored = await store.restore(goal.id);

    assert.ok(restored !== undefined);
    const messagesBeforeRequest = JSON.stringify(restored.state.messages);
    const request = buildStepRequest(restored);
    const controlContent = request.messages.at(-1)?.content ?? "";

    assert.deepEqual(restored.state.messages, goal.state.messages);
    assert.equal(JSON.stringify(restored.state.messages), messagesBeforeRequest);
    assert.deepEqual(restored.state.messages[1], {
        role: "assistant",
        assistant: { profileId: "profile-1" },
        content: "需要补充部署环境",
    });
    assert.equal(
        restored.state.messages.some(({ content }) => content === controlContent),
        false,
    );
});

test("Builder 拒绝 waiting Preparation 和非 running executing Goal", () => {
    const gathering = createPreparationGoal();
    const waiting: Goal = {
        ...gathering,
        state: {
            ...gathering.state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "waiting_input" },
            },
        },
    };
    const executing = createExecutingGoal();
    const created: Goal = {
        ...executing,
        state: {
            ...executing.state,
            run: { ...executing.state.run, status: "created" },
        },
    };

    assert.throws(() => buildPreparationRequest(waiting), /active preparation/);
    assert.throws(() => buildStepRequest(created), /running executing/);
});
