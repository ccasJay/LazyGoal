import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
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
import type {
    ModelConversationMessage,
    ModelContextLookupResult,
    ModelInferenceView,
    ModelPreparationInputEvidence,
    PromptContext,
} from "../src/model-inference-view";

const PATH_INPUT_CONTRACT = contract.object({ path: contract.string() });
import type { ContextCompactor } from "../src/context-compactor";
import type { PromptBundleRenderer } from "../src/prompting/types";
import { buildPreparationRequest, buildStepRequest } from "../src/prompt";
import {
    createDefaultPromptBundleRenderer,
    createModelContextBudgetPolicy,
    DropOldestContextCompactor,
    TrajectoryModelContextAssembler,
} from "../src/index";
import { ModelInferenceProjector } from "../src/model-inference-projector";
import type { TrajectoryModelContextAssemblyInput } from "../src/trajectory-model-context-assembler";
import { currentProtocols, currentWorkingMemory } from "./current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();

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

class PassthroughTrajectoryAssembler extends TrajectoryModelContextAssembler {
    constructor() {
        super({
            policy: createModelContextBudgetPolicy({ modelInputBudget: 10_000 }),
        });
    }

    override async assemble(
        input: TrajectoryModelContextAssemblyInput,
    ): Promise<ModelInferenceView> {
        return {
            ...input.view,
            trajectoryContext: {
                measuredAs: "character",
                softOverflow: false,
                hot: [],
                warm: [],
                budget: {
                    measuredAs: "character",
                    modelInputBudget: 10_000,
                    responseReserve: 1_000,
                    fixedInput: { unit: "character", count: 0 },
                    historyBudget: 9_000,
                    warmBudget: 2_250,
                    hotBudget: 6_750,
                    softOverflow: false,
                },
            },
        };
    }
}

const trajectoryContextAssembler = new PassthroughTrajectoryAssembler();

async function stepRequest(
    goal: Goal,
    tools: readonly ToolDefinition[] = [],
    requestRenderer: PromptBundleRenderer = renderer,
    lookupResult?: ModelContextLookupResult,
) {
    return buildStepRequest(
        goal,
        tools,
        requestRenderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
        lookupResult,
    );
}

async function preparationRequest(
    goal: Goal,
    tools: readonly ToolDefinition[] = [],
    requestRenderer: PromptBundleRenderer = renderer,
    preparationInputEvidence?: readonly ModelPreparationInputEvidence[],
    requestCompactor: ContextCompactor<ModelConversationMessage> = contextCompactor,
) {
    return buildPreparationRequest(
        goal,
        tools,
        requestRenderer,
        requestCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
        undefined,
        undefined,
        preparationInputEvidence,
    );
}

test("请求顺序固定为 system、真实历史、当前 Working Context", async () => {
    const messages: readonly GoalMessage[] = [
        { role: "user", content: "补充的真实输入" },
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "真实响应",
        },
    ];
    const goal = createExecutingGoal({ messages });
    const request = await stepRequest(goal);

    assert.match(request.messages[0]?.content ?? "", /你是一个严谨的执行代理/);
    assert.match(request.messages[0]?.content ?? "", /1\. 先检查输入/);
    assert.ok((request.messages[0]?.content ?? "").includes(
        "Active Phase Protocol: executing (structured@1; trajectory-layered@1; bm25-lite@1)",
    ));
    assert.deepEqual(
        request.messages.slice(1, -1),
        goal.state.messages.map(({ role, content }) => ({ role, content })),
    );
    const control = JSON.parse(request.messages.at(-1)?.content ?? "") as {
        readonly phase: string;
        readonly intent: string;
        readonly workingMemory: unknown;
        readonly trajectoryContext: unknown;
        readonly contextEpoch: unknown;
    };
    const workingContext = new ModelInferenceProjector().projectWorkingContext(goal);
    assert.equal(control.phase, workingContext.phase);
    assert.equal("intent" in control, false);
    assert.equal("task" in control, false);
    assert.equal("contextEpoch" in control, false);
    assert.deepEqual(control.workingMemory, currentWorkingMemory);
    assert.ok(control.trajectoryContext !== undefined);
});

test("执行请求只展示调用方传入的授权 ToolDefinition", async () => {
    const goal = createExecutingGoal();
    const tool: ToolDefinition = {
        id: "read_file",
        description: "读取工作区内文本文件",
        inputContract: PATH_INPUT_CONTRACT,
    };
    const request = await stepRequest(goal, [tool]);
    const systemContent = request.messages[0]?.content ?? "";

    assert.match(systemContent, /read_file/);
    assert.match(systemContent, /读取工作区内文本文件/);
    assert.match(systemContent, /Active Phase Protocol: executing/);
});

test("下一轮请求把已提交 Lookup Result 作为历史瞬时输入传给模型", async () => {
    const goal = createExecutingGoal();
    const lookupResult: ModelContextLookupResult = {
        status: "not_found",
        lookupId: "lookup-next-round",
        committedThroughSequence: 7,
        reason: "no_context_match",
    };
    const request = await stepRequest(goal, [], renderer, lookupResult);
    const control = JSON.parse(request.messages.at(-1)?.content ?? "") as {
        readonly contextLookupResult?: ModelContextLookupResult;
    };

    assert.deepEqual(control.contextLookupResult, lookupResult);
    assert.match(
        request.messages[0]?.content ?? "",
        /Historical execution and rationale may use Context Lookup/,
    );
});

test("Context Epoch 按 Conversation 原始索引过滤，而不是按裁剪后位置过滤", async () => {
    const base = createExecutingGoal({
        messages: [
            {
                role: "assistant",
                assistant: { profileId: "profile-1" },
                content: "旧阶段响应",
            },
            { role: "user", content: "当前阶段输入" },
            {
                role: "assistant",
                assistant: { profileId: "profile-1" },
                content: "当前阶段响应",
            },
        ],
    });
    const goal: Goal = {
        ...base,
        state: {
            ...base.state,
            run: {
                ...base.state.run,
                contextEpoch: {
                    ...base.state.run.contextEpoch,
                    number: 1,
                    conversationStartIndex: 2,
                    openedAtSequence: 1,
                },
            },
        },
    };

    const request = await stepRequest(goal);

    assert.deepEqual(request.messages.slice(1, -1), [
        { role: "user", content: "当前阶段输入" },
        { role: "assistant", content: "当前阶段响应" },
    ]);
});

test("Preparation 请求按当前 phase 选择协议并使用同一消息顺序", async () => {
    for (const phase of ["gathering_context", "planning"] as const) {
        const goal = createPreparationGoal(phase, [
            {
                role: "assistant",
                assistant: { profileId: "profile-1" },
                content: "已记录的真实问题",
            },
            { role: "user", content: "已记录的真实回答" },
        ]);
        const request = await preparationRequest(goal);
        const systemContent = request.messages[0]?.content ?? "";

        assert.ok(systemContent.includes(`Active Phase Protocol: ${phase}`));
        assert.deepEqual(
            request.messages.slice(1, -1),
            goal.state.messages.map(({ role, content }) => ({ role, content })),
        );
        const control = JSON.parse(request.messages.at(-1)?.content ?? "") as {
            readonly phase: string;
            readonly intent: string;
            readonly workingMemory: unknown;
            readonly trajectoryContext: unknown;
            readonly contextEpoch: unknown;
        };
        assert.deepEqual({ phase: control.phase, intent: control.intent }, { phase, intent });
        assert.deepEqual(control.workingMemory, currentWorkingMemory);
        assert.ok(control.trajectoryContext !== undefined);
        assert.ok(control.contextEpoch !== undefined);
    }
});

test("裁剪后的 Preparation 请求保留原始索引并过滤不可见 provenance", async () => {
    const goal = createPreparationGoal("planning", [
        { role: "user", content: "旧约束" },
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "旧响应",
        },
        { role: "user", content: "当前约束" },
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "当前响应",
        },
    ]);
    const evidence: readonly ModelPreparationInputEvidence[] = [
        { sequence: 3, messageIndex: 1, contentHash: "sha256:hidden" },
        { sequence: 4, messageIndex: 3, contentHash: "sha256:visible" },
    ];

    const request = await preparationRequest(
        goal,
        [],
        renderer,
        evidence,
        new DropOldestContextCompactor(8),
    );
    const control = JSON.parse(request.messages.at(-1)?.content ?? "");

    assert.deepEqual(request.messages.slice(1, -1), [
        { role: "user", content: "当前约束" },
        { role: "assistant", content: "当前响应" },
    ]);
    assert.deepEqual(control.visibleConversationMessageMap, [
        { visibleIndex: 0, sourceMessageIndex: 3 },
        { visibleIndex: 1, sourceMessageIndex: 4 },
    ]);
    assert.deepEqual(control.preparationInputEvidence, [{
        sequence: 4,
        messageIndex: 3,
        contentHash: "sha256:visible",
    }]);
});

test("Preparation 只在 planning 阶段投影调用方提供的 ToolDefinition", async () => {
    const tools: readonly ToolDefinition[] = [{
        id: "read_file",
        description: "读取文件",
        inputContract: PATH_INPUT_CONTRACT,
    }];
    const contexts: PromptContext[] = [];
    const capturingRenderer: PromptBundleRenderer = {
        render(context) {
            contexts.push(context);
            return "captured";
        },
    };

    await preparationRequest(createPreparationGoal("gathering_context"), tools, capturingRenderer);
    const gatheringContexts = contexts.splice(0);
    await preparationRequest(createPreparationGoal("planning"), tools, capturingRenderer);

    assert.ok(gatheringContexts.length > 0);
    assert.ok(gatheringContexts.every((context) => context.authorizedTools.length === 0));
    assert.ok(contexts.length > 0);
    assert.ok(contexts.every((context) => context.authorizedTools.length === 1));
    assert.notStrictEqual(contexts[0]?.authorizedTools[0], tools[0]);
    assert.notStrictEqual(contexts[0]?.authorizedTools[0]?.inputSchema, PATH_INPUT_CONTRACT);
    assert.equal(Object.isFrozen(contexts[0]?.authorizedTools[0]?.inputSchema), true);
});

test("Trajectory Assembler 只替换当前调用的分层 Context，不写入真实消息", async () => {
    const goal = createExecutingGoal({
        messages: [
            { role: "user", content: "补充输入" },
            {
                role: "assistant",
                assistant: { profileId: "profile-1" },
                content: "真实响应",
            },
        ],
        pendingAction: {
            status: "approved",
            action: {
                actionId: "action-current",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
    });
    const before = JSON.stringify(goal.state.messages);
    const request = await stepRequest(goal);
    const control = JSON.parse(request.messages.at(-1)?.content ?? "{}");

    assert.deepEqual(control.trajectoryContext.hot, []);
    assert.equal("softOverflow" in control.trajectoryContext, false);
    assert.equal("budget" in control.trajectoryContext, false);
    assert.deepEqual(goal.state.messages, JSON.parse(before));
    assert.deepEqual(control.execution.pendingAction, goal.state.run.pendingAction);
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
    const request = await stepRequest(restored);
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

test("Builder 拒绝 waiting Preparation 和非 running executing Goal", async () => {
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

    await assert.rejects(preparationRequest(waiting), /active preparation/);
    await assert.rejects(stepRequest(created), /running executing/);
});
