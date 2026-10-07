import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import { createGoal } from "../../runtime/src/domain";
import type { Goal } from "../../runtime/src/domain";
import type { GoalPlan } from "../../runtime/src/goal-plan";
import type { ToolDefinition } from "../../tool-core/src/index";
import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    createEmptyWorkingMemory,
} from "../../runtime/src/index";
import type {
    ModelContextFramePayload,
    ModelContextSectionUpdate,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../../runtime/src/index";
import {
    CharacterModelInputEstimator,
    createModelCapabilities,
    createModelContextBudgetPolicy,
    createTokenModelInputEstimator,
    DropOldestContextCompactor,
    ModelContextHardOverflowError,
    ModelInferenceProjector,
    TrajectoryModelContextAssembler,
} from "../src/index";
import type { ModelCapabilities } from "../src/model-context-budget";
import { buildStepRequest } from "../src/prompt";
import { createDefaultPromptBundleRenderer } from "../src/prompting/default-bundles";
import type { DynamicSectionMessage } from "../src/prompting/dynamic-section-registry";
import type { ModelConversationMessage } from "../src/model-inference-view";
import { currentProtocols } from "./current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
const profile = {
    id: "section-recovery-profile",
    systemPrompt: "section recovery test",
    instructions: [],
    toolIds: ["read_file"],
};
const readTool: ToolDefinition = {
    id: "read_file",
    description: "读取当前文件",
    inputContract: contract.object({ path: contract.string() }),
    isReadOnly: true,
};
const compactor = new DropOldestContextCompactor();
const policy = createModelContextBudgetPolicy({ modelInputBudget: 500_000 }, new CharacterModelInputEstimator());

class MemoryTrajectoryStore implements TrajectoryStore {
    constructor(readonly events: readonly TrajectoryEvent[]) {}

    async append(): Promise<Readonly<TrajectoryEvent>> {
        throw new Error("test store is read-only");
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence),
        );
    }

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        return classifyTrajectoryTail(await this.read(query), committedThroughSequence);
    }
}

function createPlan(text: string, revision: number): GoalPlan {
    return {
        revision,
        items: [{ id: "todo-plan", content: text, position: 0, status: "pending" }],
    };
}

function createRunningGoal(input: {
    readonly plan?: GoalPlan;
    readonly boundary?: number;
    readonly epoch?: number;
    readonly conversation?: readonly ModelConversationMessage[];
} = {}): Goal {
    const base = createGoal({
        ...currentProtocols,
        id: "section-recovery-goal",
        runId: "section-recovery-run",
        promptBundleVersion: 1,
        intent: "在已提交状态上恢复上下文",
        profile,
        maxSteps: 100,
        messages: input.conversation ?? [],
    });
    const run = {
        ...base.state.run,
        status: "running" as const,
        mode: "normal" as const,
        committedThroughSequence: input.boundary ?? 0,
        contextEpoch: {
            ...base.state.run.contextEpoch,
            number: input.epoch ?? 0,
            conversationStartIndex: 0,
        },
    };
    return {
        ...base,
        state: {
            ...base.state,
            workflow: { phase: "executing" },
            run,
            ...(input.plan === undefined ? {} : { goalPlan: input.plan }),
        },
    };
}

function projectSections(goal: Goal, stage: "decide" | "think"): readonly DynamicSectionMessage[] {
    const view = new ModelInferenceProjector().project(
        goal,
        [readTool],
        createEmptyWorkingMemory(),
        undefined,
        undefined,
        stage,
    );
    return renderer.renderDynamicSections(view);
}

function activeUpdate(section: DynamicSectionMessage): ModelContextSectionUpdate {
    return {
        sectionId: section.sectionId,
        order: section.order,
        source: section.source,
        role: section.role,
        templateId: section.templateId,
        status: "active",
        projection: section.projection as ModelContextSectionUpdate["projection"],
        content: section.content,
    };
}

function frameEvent(
    goal: Goal,
    sequence: number,
    payload: Omit<ModelContextFramePayload, "type"> & { readonly type?: "model_context_frame" },
): TrajectoryEvent {
    const draft: TrajectoryEventDraft = {
        goalId: goal.id,
        runId: goal.state.run.id,
        phase: "executing",
        eventType: "model_context_frame",
        payload: {
            type: "model_context_frame",
            stage: payload.stage,
            epochNumber: payload.epochNumber,
            conversationPosition: payload.conversationPosition,
            sections: payload.sections,
        },
    };
    return allocateImmutableEvent(draft, sequence, `section-frame-${sequence}`) as TrajectoryEvent;
}

function frameFor(
    goal: Goal,
    sequence: number,
    stage: "decide" | "think",
    sections: readonly ModelContextSectionUpdate[],
    epochNumber = goal.state.run.contextEpoch.number,
): TrajectoryEvent {
    return frameEvent(goal, sequence, {
        stage,
        epochNumber,
        conversationPosition: goal.state.messages.length,
        sections,
    });
}

async function build(
    goal: Goal,
    events: readonly TrajectoryEvent[],
    stage: "decide" | "think" = "decide",
    modelCapabilities?: ModelCapabilities,
) {
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore: new MemoryTrajectoryStore(events),
        policy,
    });
    return buildStepRequest(
        goal,
        [readTool],
        renderer,
        compactor,
        undefined,
        createEmptyWorkingMemory(),
        assembler,
        undefined,
        modelCapabilities,
        "prompt_only",
        stage,
        stage === "think" ? { thinkGoal: "确认当前 GoalPlan 与任务的关系" } : undefined,
    );
}

test("Decide 與 Think 分别从本阶段已提交 frame 恢复，不共享比较基线", async () => {
    const priorGoal = createRunningGoal({ plan: createPlan("旧计划", 1) });
    const goal = createRunningGoal({ plan: createPlan("当前计划", 2), boundary: 2 });
    const oldPlan = projectSections(priorGoal, "decide").find((section) => section.sectionId === "goal_plan");
    const currentPlan = projectSections(goal, "decide").find((section) => section.sectionId === "goal_plan");
    assert.ok(oldPlan);
    assert.ok(currentPlan);
    const events = [
        frameFor(goal, 1, "think", [activeUpdate(currentPlan)]),
        frameFor(goal, 2, "decide", [activeUpdate(oldPlan)]),
    ];

    const think = await build(goal, events, "think");
    const decide = await build(goal, events, "decide");
    const thinkPlanMessage = think.request.messages.find((message) =>
        message.content.includes("GoalPlan (read-only projection"),
    );
    const decidePlanMessage = decide.request.messages.find((message) =>
        message.content.includes("GoalPlan (read-only projection"),
    );

    assert.match(thinkPlanMessage?.content ?? "", /当前计划/);
    assert.doesNotMatch(thinkPlanMessage?.content ?? "", /operation: replace/);
    assert.match(decidePlanMessage?.content ?? "", /operation: replace/);
    assert.match(decidePlanMessage?.content ?? "", /当前计划/);
    assert.equal(think.modelContextFrame.stage, "think");
    assert.equal(decide.modelContextFrame.stage, "decide");
    assert.equal(think.request.tools, undefined);
    assert.doesNotMatch(think.request.messages.at(-1)?.content ?? "", /responseShapeGuide/);
    assert.ok(think.request.messages.some((message) => message.content.includes("确认当前 GoalPlan 与任务的关系")));
    assert.deepEqual(think.request.messages, (await build(goal, events, "think")).request.messages);
});

test("无基线、旧 Epoch 與未提交 tail 都会重新完整注入当前 Section", async () => {
    const goal = createRunningGoal({ plan: createPlan("当前计划", 2), boundary: 1, epoch: 1 });
    const currentPlan = projectSections(goal, "decide").find((section) => section.sectionId === "goal_plan");
    assert.ok(currentPlan);
    const staleOrUncommitted = [
        frameFor(goal, 1, "decide", [activeUpdate(currentPlan)], 0),
        frameFor(goal, 2, "decide", [activeUpdate(currentPlan)], 1),
    ];

    const plan = await build(goal, staleOrUncommitted);
    const planMessage = plan.request.messages.find((message) =>
        message.content.includes("GoalPlan (read-only projection"),
    );

    assert.ok(planMessage);
    assert.doesNotMatch(planMessage.content, /operation: replace/);
    assert.match(planMessage.content, /当前计划/);
    assert.ok(plan.modelContextFrame.sections.some((section) => section.sectionId === "goal_plan"));
});

test("已提交的未知 Section 身份在请求生成前失败", async () => {
    const goal = createRunningGoal({ boundary: 1 });
    const unknown: ModelContextSectionUpdate = {
        sectionId: "not_registered",
        order: 90,
        source: "OldRuntimeState",
        role: "user",
        templateId: "old-state@1",
        status: "active",
        projection: { value: true },
        content: "旧状态",
    };

    await assert.rejects(
        build(goal, [frameFor(goal, 1, "decide", [unknown])]),
        /unregistered section/,
    );
});

test("会话裁剪后保留当前状态、Step 输入与逐请求工具 Schema", async () => {
    const conversation: ModelConversationMessage[] = [];
    for (let index = 0; index < 24; index += 1) {
        conversation.push(
            { role: "user", content: `历史请求 ${index} ${"u".repeat(1_200)}`, sourceMessageIndex: index * 2 },
            {
                role: "assistant",
                assistant: { profileId: profile.id },
                content: `历史响应 ${index} ${"a".repeat(1_200)}`,
                sourceMessageIndex: index * 2 + 1,
            },
        );
    }
    const goal = createRunningGoal({
        plan: createPlan("当前计划", 2),
        boundary: 1,
        conversation,
    });
    const currentPlan = projectSections(goal, "decide").find((section) => section.sectionId === "goal_plan");
    assert.ok(currentPlan);
    const event = frameFor(goal, 1, "decide", [activeUpdate(currentPlan)]);
    const characterTokenEstimator = createTokenModelInputEstimator((input) =>
        new CharacterModelInputEstimator().estimate(input),
    );
    const capabilities = createModelCapabilities({
        contextWindowTokens: 90_000,
        maxOutputTokens: 5_000,
        tokenEstimator: characterTokenEstimator,
    });

    const plan = await build(goal, [event], "decide", capabilities);
    const actualConversation = plan.request.messages.filter((message) =>
        message.content.startsWith("历史请求 ") || message.content.startsWith("历史响应 "),
    );
    const workingContext = JSON.parse(plan.request.messages.at(-1)?.content ?? "{}");
    const runModeFrame = plan.modelContextFrame.sections.find((section) => section.sectionId === "run_mode");

    assert.ok(actualConversation.length > 0);
    assert.ok(actualConversation.length < conversation.length);
    assert.equal(workingContext.checkpointRequired, true);
    assert.equal((runModeFrame?.projection as { checkpointRequired?: boolean } | undefined)?.checkpointRequired, true);
    assert.ok(plan.request.tools?.some((tool) => tool.id === "system_context_checkpoint"));
});

test("必需动态状态超过最终请求预算时在调用前失败", async () => {
    const goal = createRunningGoal({ plan: createPlan("当前计划", 2) });
    const tinyBudgetEstimator = createTokenModelInputEstimator((input) =>
        new CharacterModelInputEstimator().estimate(input),
    );
    const capabilities = createModelCapabilities({
        contextWindowTokens: 2_000,
        maxOutputTokens: 500,
        tokenEstimator: tinyBudgetEstimator,
    });

    await assert.rejects(build(goal, [], "decide", capabilities), ModelContextHardOverflowError);
});
