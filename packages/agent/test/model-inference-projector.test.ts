import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentProfile } from "../../runtime/src/agent-profile";
import { createEmptyWorkingMemory, createGoal } from "../../runtime/src/domain";
import type {
    Goal,
    GoalMessage,
    PendingAction,
    StepRecord,
    WorkingMemory,
} from "../../runtime/src/domain";
import type { ToolDefinition } from "../../runtime/src/tool";
import { computeContentHash } from "../../runtime/src/trajectory";
import { currentProtocols, currentWorkingMemory } from "./current-fixtures";
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
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-1",
        intent,
        profile,
        messages,
        runId: "run-1",
    });

    if (phase === "gathering_context") return goal;

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
    readonly pendingAction?: PendingAction;
} = {}): Goal {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-1",
        intent,
        profile,
        runId: "run-1",
        ...(options.messages === undefined ? {} : { messages: options.messages }),
        ...(options.maxSteps === undefined ? {} : { maxSteps: options.maxSteps }),
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

function project(
    goal: Goal,
    tools: readonly ToolDefinition[] = [],
    memory: WorkingMemory = currentWorkingMemory,
) {
    return projector.project(goal, tools, memory);
}

test("Projector 按阶段投影当前 PromptContext、Conversation 与 Working Context", () => {
    for (const phase of ["gathering_context", "planning"] as const) {
        const view = project(createPreparationGoal(phase, [
            {
                role: "assistant",
                assistant: { profileId: "profile-1" },
                content: "已记录的问题",
            },
        ]));

        assert.deepEqual(Object.keys(view).sort(), [
            "contextEpoch",
            "conversation",
            "prompt",
            "workingContext",
            "workingMemory",
        ].sort());
        assert.equal(view.prompt.promptBundleVersion, 1);
        assert.deepEqual(view.prompt.memoryProtocol, currentProtocols.memoryProtocol);
        assert.deepEqual(view.prompt.modelContextProtocol, currentProtocols.modelContextProtocol);
        assert.deepEqual(view.prompt.contextRetrievalProtocol, currentProtocols.contextRetrievalProtocol);
        assert.equal(view.prompt.phase, phase);
        assert.equal(view.prompt.profile.id, "profile-1");
        assert.deepEqual(view.workingContext, { phase, intent });
        assert.deepEqual(view.workingMemory, currentWorkingMemory);
        assert.equal(view.contextEpoch.epochNumber, 0);
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
    const view = project(createExecutingGoal({
        maxSteps: 4,
        stepCount: 1,
        previousStep,
        pendingAction,
    }), [toolDefinition()]);

    assert.equal(view.prompt.phase, "executing");
    assert.deepEqual(view.conversation, [{
        role: "user",
        content: intent,
        sourceMessageIndex: 0,
    }]);
    assert.deepEqual(view.workingContext, {
        phase: "executing",
        intent,
        task,
        execution: {
            stepCount: 1,
            maxSteps: 4,
            previousStep,
            pendingAction,
        },
    });
    assert.deepEqual(view.prompt.authorizedTools[0], {
        id: "read_file",
        description: "读取工作区内文本文件",
        inputSchema: toolDefinition().inputSchema,
    });
});

test("Projector 投影结果与 Runtime Goal 不共享可变对象", () => {
    const previousStep: StepRecord = {
        kind: "decision",
        result: {
            kind: "wait",
            reason: "等待补充信息",
        },
    };
    const goal = createExecutingGoal({
        maxSteps: 4,
        stepCount: 1,
        previousStep,
    });
    const view = project(goal, [toolDefinition()]);

    assert.notStrictEqual(view.prompt.profile, goal.definition.profile);
    assert.notStrictEqual(view.conversation, goal.state.messages);
    assert.notStrictEqual(view.workingMemory, currentWorkingMemory);
    assert.notStrictEqual(view.workingContext, goal.state.workflow);
    assert.notStrictEqual(view.workingContext.phase === "executing"
        ? view.workingContext.execution.previousStep
        : undefined, previousStep);
});

test("Projector 递归冻结模型输入 DTO", () => {
    const view = project(createExecutingGoal(), [toolDefinition()]);

    assert.ok(Object.isFrozen(view.prompt));
    assert.ok(Object.isFrozen(view.prompt.profile));
    assert.ok(Object.isFrozen(view.prompt.profile.instructions));
    assert.ok(Object.isFrozen(view.prompt.authorizedTools));
    assert.ok(Object.isFrozen(view.prompt.authorizedTools[0]?.inputSchema));
    assert.ok(Object.isFrozen(view.workingMemory));
    assert.ok(Object.isFrozen(view.contextEpoch));
});

test("Projector 按 Tool ID 代码单元顺序升序排序并拒绝重复 ID", () => {
    const view = project(createExecutingGoal(), [
        toolDefinition("zebra"),
        toolDefinition("apple"),
        toolDefinition("mango"),
    ]);
    assert.deepEqual(
        view.prompt.authorizedTools.map((tool) => tool.id),
        ["apple", "mango", "zebra"],
    );

    assert.throws(
        () => project(createExecutingGoal(), [toolDefinition(), toolDefinition()]),
        /重复的 Tool ID：read_file/,
    );
});

test("Projector 不修改 Goal 且不泄漏 Snapshot 或瞬时资源字段", () => {
    const goal = createExecutingGoal({
        maxSteps: 4,
        stepCount: 2,
        previousStep: {
            kind: "decision",
            result: {
                kind: "complete",
                summary: "结束",
                completionEvidence: [{ criterionIndex: 0, evidenceSequences: [1] }],
            },
        },
    });
    const before = JSON.stringify(goal);
    const view = project(goal);

    assert.equal(JSON.stringify(goal), before);
    assert.equal("schemaVersion" in view, false);
    assert.equal("metadata" in view, false);
    assert.equal("runId" in view.prompt, false);
    assert.equal("status" in view.workingContext, false);
    assert.equal("stopReason" in view.workingContext, false);
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

    assert.throws(() => project(waiting), /active preparation/);
    assert.throws(() => project(created), /running executing/);
});

test("Projector 投影并冻结 structured@1 Working Memory", () => {
    const memory: WorkingMemory = {
        ...createEmptyWorkingMemory(12, { eventId: "patch-12", sequence: 12 }),
        facts: [{
            id: "fact-1",
            kind: "fact",
            subject: "配置文件",
            predicate: "存在",
            value: true,
            stability: "stable",
            evidenceSequences: [10],
            reinforcementCount: 1,
            lastEvidenceSequence: 10,
            source: "tool_projector",
            originPhase: "gathering_context",
            originSequence: 12,
            scope: "goal",
            updatedAtSequence: 12,
        }],
    };
    const view = project(createPreparationGoal(), [], memory);

    assert.deepEqual(view.workingMemory, memory);
    assert.notStrictEqual(view.workingMemory, memory);
    assert.ok(Object.isFrozen(view.workingMemory));
    assert.throws(
        () => projector.project(createPreparationGoal(), [], undefined),
        /requires a WorkingMemory projection/,
    );
});

test("Projector 投影当前 bm25-lite@1 的历史 Lookup Result", () => {
    const goal = createPreparationGoal();
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
        currentWorkingMemory,
        undefined,
        result,
    );

    assert.equal(view.contextLookupResult?.status, "found");
    assert.equal(view.contextLookupResult?.lookupId, "lookup-1");
    assert.equal(view.contextLookupResult?.freshness.kind, "historical");
    assert.ok(Object.isFrozen(view.contextLookupResult));
    assert.notStrictEqual(view.contextLookupResult, result);
});

test("Projector 保留 Conversation 原始索引并投影 Preparation provenance", () => {
    const goal = createPreparationGoal("planning", [
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "已记录约束",
        },
        { role: "user", content: "只使用 PostgreSQL" },
    ]);
    const evidence = [{
        sequence: 7,
        messageIndex: 2,
        contentHash: computeContentHash("只使用 PostgreSQL"),
    }] as const;

    const view = projector.project(
        goal,
        [],
        currentWorkingMemory,
        undefined,
        undefined,
        evidence,
    );

    assert.deepEqual(view.conversation, [
        { role: "user", content: intent, sourceMessageIndex: 0 },
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "已记录约束",
            sourceMessageIndex: 1,
        },
        { role: "user", content: "只使用 PostgreSQL", sourceMessageIndex: 2 },
    ]);
    assert.deepEqual(view.preparationInputEvidence, evidence);
    assert.notStrictEqual(view.preparationInputEvidence, evidence);
    assert.ok(Object.isFrozen(view.preparationInputEvidence));
    assert.equal("content" in (view.preparationInputEvidence?.[0] ?? {}), false);
});

test("Projector 在 executing 阶段拒绝任何 Preparation provenance 字段", () => {
    assert.throws(
        () => projector.project(
            createExecutingGoal(),
            [],
            currentWorkingMemory,
            undefined,
            undefined,
            [],
        ),
        /Preparation input evidence requires a preparation phase/,
    );
});
