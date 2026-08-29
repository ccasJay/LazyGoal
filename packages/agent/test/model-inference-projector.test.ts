import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentProfile } from "../../runtime/src/agent-profile";
import { createEmptyWorkingMemory, createGoal } from "../../runtime/src/domain";
import type {
    Goal,
    GoalMessage,
    PendingAction,
    StepRecord,
} from "../../runtime/src/domain";
import type { ToolDefinition } from "../../runtime/src/tool";
import { ModelInferenceProjector } from "../src/model-inference-projector";

const intent = "完成示例任务";
const task = {
    objective: "实现三阶段上下文",
    completionCriteria: ["请求顺序稳定", "控制消息不持久化"],
};
const profile: AgentProfile = {
    id: "profile-1",
    name: "示例 Profile",
    description: "项目测试用 Profile",
    systemPrompt: "你是一个严谨的执行代理。",
    instructions: ["先检查输入", "再给出下一步"],
    toolIds: ["read_file"],
};

const projector = new ModelInferenceProjector();

function createPreparationGoal(
    phase: "gathering_context" | "planning" = "gathering_context",
    messages: readonly GoalMessage[] = [],
): Goal {
    const goal = createGoal({
        promptBundleVersion: 1,
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
        promptBundleVersion: 1,
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

function toolDefinition(id = "read_file"): ToolDefinition {
    return {
        id,
        description: "读取工作区内文本文件",
        inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
        },
    };
}

test("Projector 按阶段投影完整 PromptContext、Conversation 与 Working Context", () => {
    for (const phase of ["gathering_context", "planning"] as const) {
        const view = projector.project(createPreparationGoal(phase, [
            {
                role: "assistant",
                assistant: { profileId: "profile-1" },
                content: "已记录的问题",
            },
        ]));

        assert.deepEqual(Object.keys(view).sort(), [
            "conversation",
            "prompt",
            "workingContext",
        ].sort());
        assert.equal(view.prompt.promptBundleVersion, 1);
        assert.equal(view.prompt.phase, phase);
        assert.equal(view.prompt.profile.id, "profile-1");
        assert.equal(view.prompt.profile.name, "示例 Profile");
        assert.equal(view.prompt.profile.description, "项目测试用 Profile");
        assert.equal(view.prompt.profile.systemPrompt, profile.systemPrompt);
        assert.deepEqual(view.prompt.profile.instructions, profile.instructions);
        assert.deepEqual(view.workingContext, { phase, intent });
    }
});

test("Projector 只投影 executing 阶段的任务与有界执行记忆", () => {
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
        maxSteps: 4,
        stepCount: 1,
        checkpoint: "已吸收 README 内容",
        previousStep,
        pendingAction,
    });
    const view = projector.project(goal, [toolDefinition()]);

    assert.equal(view.prompt.promptBundleVersion, 1);
    assert.equal(view.prompt.phase, "executing");
    assert.deepEqual(view.conversation, [{ role: "user", content: intent }]);
    assert.equal(view.prompt.authorizedTools.length, 1);
    assert.deepEqual(view.prompt.authorizedTools[0], {
        id: "read_file",
        description: "读取工作区内文本文件",
        inputSchema: toolDefinition().inputSchema,
    });

    const workingContext = view.workingContext;

    assert.equal(workingContext.phase, "executing");
    assert.equal(workingContext.intent, intent);
    assert.deepEqual(workingContext.task, {
        objective: task.objective,
        completionCriteria: task.completionCriteria,
    });
    assert.deepEqual(workingContext.execution, {
        stepCount: 1,
        maxSteps: 4,
        checkpoint: "已吸收 README 内容",
        previousStep,
        pendingAction,
    });
});

test("Projector 投影结果与 Runtime Goal 不共享可变对象", () => {
    const previousStep: StepRecord = {
        kind: "decision",
        result: {
            kind: "wait",
            checkpoint: "已完成输入检查",
            reason: "等待补充信息",
        },
    };
    const goal = createExecutingGoal({
        maxSteps: 4,
        stepCount: 1,
        previousStep,
    });
    const view = projector.project(goal, [toolDefinition()]);

    assert.notStrictEqual(view.prompt.profile, goal.definition.profile);
    assert.notStrictEqual(view.conversation, goal.state.messages);
    assert.notStrictEqual(
        view.prompt.authorizedTools[0]?.inputSchema,
        toolDefinition().inputSchema,
    );

    const workingContext = view.workingContext;

    if (workingContext.phase !== "executing") {
        assert.fail("expected executing working context");
    }

    assert.notStrictEqual(workingContext.task, goal.state.workflow.phase === "executing"
        ? goal.state.workflow.task
        : undefined);
    assert.notStrictEqual(
        workingContext.task.completionCriteria,
        goal.state.workflow.phase === "executing"
            ? goal.state.workflow.task.completionCriteria
            : undefined,
    );
    assert.notStrictEqual(workingContext.execution.previousStep, previousStep);
});

test("Projector 递归冻结 PromptContext，Renderer 无法修改模型输入", () => {
    const view = projector.project(createExecutingGoal(), [toolDefinition()]);

    assert.ok(Object.isFrozen(view.prompt));
    assert.ok(Object.isFrozen(view.prompt.profile));
    assert.ok(Object.isFrozen(view.prompt.profile.instructions));
    assert.ok(Object.isFrozen(view.prompt.authorizedTools));
    assert.ok(Object.isFrozen(view.prompt.authorizedTools[0]?.inputSchema));
});

test("Projector 按 Tool ID 代码单元顺序升序排序，与输入顺序无关", () => {
    const view = projector.project(createExecutingGoal(), [
        toolDefinition("zebra"),
        toolDefinition("apple"),
        toolDefinition("mango"),
    ]);

    assert.deepEqual(
        view.prompt.authorizedTools.map((tool) => tool.id),
        ["apple", "mango", "zebra"],
    );
});

test("Projector 拒绝重复的 Tool ID", () => {
    assert.throws(
        () => projector.project(createExecutingGoal(), [
            toolDefinition("read_file"),
            toolDefinition("read_file"),
        ]),
        /重复的 Tool ID：read_file/,
    );
});

test("Projector 不修改传入的 Runtime Goal", () => {
    const goal = createExecutingGoal({
        maxSteps: 4,
        stepCount: 2,
        previousStep: {
            kind: "decision",
            result: { kind: "complete", checkpoint: "完成", summary: "结束" },
        },
    });
    const before = JSON.stringify(goal);

    projector.project(goal, [toolDefinition()]);

    assert.equal(JSON.stringify(goal), before);
});

test("Projector 不把 Snapshot/瞬时资源字段泄漏进 View", () => {
    const view = projector.project(createExecutingGoal(), []);

    assert.equal("schemaVersion" in view, false);
    assert.equal("metadata" in view, false);
    assert.equal("runId" in view, false);
    assert.equal("goalId" in view.prompt, false);
    assert.equal("runId" in view.prompt, false);
    assert.equal("runId" in view.workingContext, false);
    assert.equal("status" in view.workingContext, false);
    assert.equal("stopReason" in view.workingContext, false);
    assert.equal(
        view.workingContext.phase === "executing"
            && "authorizedActionId" in view.workingContext,
        false,
    );
});

test("Projector 对非可推理状态保持前置条件错误", () => {
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

    assert.throws(() => projector.project(waiting), /active preparation/);
    assert.throws(() => projector.project(created), /running executing/);
});

test("Projector 为 structured@1 独立投影并冻结 Working Memory", () => {
    const structuredGoal = createGoal({
        promptBundleVersion: 4,
        memoryProtocol: { kind: "structured", version: 1 },
        id: "goal-structured",
        intent,
        profile,
        runId: "run-structured",
    });
    const memory = {
        ...createEmptyWorkingMemory(12, { eventId: "patch-12", sequence: 12 }),
        findings: [{
            id: "finding-1",
            kind: "finding" as const,
            statement: "配置文件存在",
            evidenceSequences: [10],
            originPhase: "gathering_context" as const,
            originSequence: 12,
            scope: "goal" as const,
            status: "active" as const,
        }],
    };

    const view = projector.project(structuredGoal, [], memory);

    assert.deepEqual(view.prompt.memoryProtocol, {
        kind: "structured",
        version: 1,
    });
    assert.deepEqual(view.workingMemory, memory);
    assert.notStrictEqual(view.workingMemory, memory);
    assert.ok(Object.isFrozen(view.workingMemory));
    assert.equal("checkpoint" in view.prompt, false);
    assert.throws(
        () => projector.project(structuredGoal),
        /requires a WorkingMemory projection/,
    );
});

test("Projector 只向 v6 bm25-lite Goal 投影即时历史 Lookup Result", () => {
    const goal = createGoal({
        promptBundleVersion: 6,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        id: "goal-lookup",
        intent,
        profile,
        runId: "run-lookup",
    });
    const result = {
        status: "found" as const,
        lookupId: "lookup-1",
        committedThroughSequence: 4,
        matches: [{
            documentId: "doc-1",
            goalId: goal.id,
            runId: goal.state.run.id,
            firstSequence: 3,
            lastSequence: 4,
            matchedFields: ["path" as const],
            score: 2,
            preview: "src/config.ts",
            truncated: false,
            historical: true as const,
            sourceEventIds: ["event-3"],
        }],
        truncated: false,
    };
    const view = projector.project(
        goal,
        [],
        createEmptyWorkingMemory(),
        undefined,
        result,
    );

    assert.equal(view.contextLookupResult?.status, "found");
    assert.equal(view.contextLookupResult?.lookupId, "lookup-1");
    assert.equal(view.contextLookupResult?.freshness.kind, "historical");
    assert.ok(Object.isFrozen(view.contextLookupResult));
    assert.notStrictEqual(view.contextLookupResult, result);

    const legacyGoal = createGoal({
        promptBundleVersion: 4,
        memoryProtocol: { kind: "structured", version: 1 },
        id: "goal-no-lookup",
        intent,
        profile,
        runId: "run-no-lookup",
    });
    assert.throws(
        () => projector.project(
            legacyGoal,
            [],
            createEmptyWorkingMemory(),
            undefined,
            result,
        ),
        /Context Lookup Result requires bm25-lite retrieval/,
    );
});
