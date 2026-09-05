import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import {
    BASH_INPUT_CONTRACT,
    BASH_MAX_TIMEOUT_MS,
    BASH_TOOL_ID,
    EDIT_FILE_INPUT_CONTRACT,
    EDIT_FILE_TOOL_ID,
    GREP_INPUT_CONTRACT,
    GREP_TOOL_ID,
    READ_FILE_INPUT_CONTRACT,
    READ_FILE_TOOL_ID,
    WRITE_FILE_INPUT_CONTRACT,
    WRITE_FILE_TOOL_ID,
} from "../../tools/src/index";
import {
    ALFWORLD_RESET_INPUT_CONTRACT,
    ALFWORLD_RESET_TOOL_ID,
    ALFWORLD_STEP_INPUT_CONTRACT,
    ALFWORLD_STEP_TOOL_ID,
} from "../../../benchmarks/alfworld/src/alfworld-tools";
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
    const plan = await buildStepRequest(
        goal,
        tools,
        requestRenderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
        lookupResult,
    );
    return plan.request;
}

async function preparationRequest(
    goal: Goal,
    tools: readonly ToolDefinition[] = [],
    requestRenderer: PromptBundleRenderer = renderer,
    preparationInputEvidence?: readonly ModelPreparationInputEvidence[],
    requestCompactor: ContextCompactor<ModelConversationMessage> = contextCompactor,
) {
    const plan = await buildPreparationRequest(
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
    return plan.request;
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

const CURRENT_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
    {
        id: BASH_TOOL_ID,
        description: "在 workspaceRoot 内以 bash 执行命令并返回截断后的 stdout/stderr",
        inputContract: BASH_INPUT_CONTRACT,
    },
    {
        id: READ_FILE_TOOL_ID,
        description: "读取 workspaceRoot 内的 UTF-8 文本文件",
        inputContract: READ_FILE_INPUT_CONTRACT,
    },
    {
        id: WRITE_FILE_TOOL_ID,
        description: "写入 workspaceRoot 内的 UTF-8 文本文件（覆盖已有内容）",
        inputContract: WRITE_FILE_INPUT_CONTRACT,
    },
    {
        id: EDIT_FILE_TOOL_ID,
        description: "对 workspaceRoot 内的 UTF-8 文本文件执行唯一匹配的字符串替换",
        inputContract: EDIT_FILE_INPUT_CONTRACT,
    },
    {
        id: GREP_TOOL_ID,
        description: "在 workspaceRoot 内按正则搜索文本文件并返回带行号的匹配行",
        inputContract: GREP_INPUT_CONTRACT,
    },
    {
        id: ALFWORLD_RESET_TOOL_ID,
        description: "初始化固定 ALFWorld TextWorld 任务会话",
        inputContract: ALFWORLD_RESET_INPUT_CONTRACT,
    },
    {
        id: ALFWORLD_STEP_TOOL_ID,
        description: "向活动 ALFWorld TextWorld 会话提交一条命令",
        inputContract: ALFWORLD_STEP_INPUT_CONTRACT,
    },
];

test("Prompt 使用 Contract 生成字符稳定且不含 AST 的 Tool Schema", async () => {
    const goal = createExecutingGoal();

    const first = await stepRequest(goal, CURRENT_TOOL_DEFINITIONS);
    const second = await stepRequest(goal, [...CURRENT_TOOL_DEFINITIONS].reverse());
    const firstSystemContent = first.messages[0]?.content ?? "";
    const secondSystemContent = second.messages[0]?.content ?? "";

    assert.equal(firstSystemContent, secondSystemContent);
    assert.equal(
        firstSystemContent.includes("https://json-schema.org/draft/2020-12/schema"),
        false,
    );

    const toolsMarker = [
        "Authorized Tool definitions (only these Tool IDs may be requested):",
        "",
    ].join("\n");
    const toolsOffset = firstSystemContent.lastIndexOf(toolsMarker);

    assert.notEqual(toolsOffset, -1);
    const serializedToolsSection = firstSystemContent.slice(toolsOffset);
    const projectedTools = JSON.parse(
        firstSystemContent.slice(toolsOffset + toolsMarker.length),
    );
    assert.equal(JSON.stringify(projectedTools).includes('"kind"'), false);
    assert.deepEqual(
        projectedTools,
        [
            {
                id: ALFWORLD_RESET_TOOL_ID,
                description: "初始化固定 ALFWorld TextWorld 任务会话",
                inputSchema: {
                    type: "object",
                    properties: {},
                    additionalProperties: false,
                },
            },
            {
                id: ALFWORLD_STEP_TOOL_ID,
                description: "向活动 ALFWorld TextWorld 会话提交一条命令",
                inputSchema: {
                    type: "object",
                    properties: { command: { type: "string" } },
                    required: ["command"],
                    additionalProperties: false,
                },
            },
            {
                id: BASH_TOOL_ID,
                description: "在 workspaceRoot 内以 bash 执行命令并返回截断后的 stdout/stderr",
                inputSchema: {
                    type: "object",
                    properties: {
                        command: { type: "string" },
                        timeoutMs: {
                            type: "integer",
                            minimum: 1,
                            maximum: BASH_MAX_TIMEOUT_MS,
                        },
                    },
                    required: ["command"],
                    additionalProperties: false,
                },
            },
            {
                id: EDIT_FILE_TOOL_ID,
                description: "对 workspaceRoot 内的 UTF-8 文本文件执行唯一匹配的字符串替换",
                inputSchema: {
                    type: "object",
                    properties: {
                        newString: { type: "string" },
                        oldString: { type: "string" },
                        path: { type: "string" },
                    },
                    required: ["path", "oldString", "newString"],
                    additionalProperties: false,
                },
            },
            {
                id: GREP_TOOL_ID,
                description: "在 workspaceRoot 内按正则搜索文本文件并返回带行号的匹配行",
                inputSchema: {
                    type: "object",
                    properties: {
                        ignoreCase: { type: "boolean" },
                        path: { type: "string" },
                        pattern: { type: "string" },
                    },
                    required: ["pattern"],
                    additionalProperties: false,
                },
            },
            {
                id: READ_FILE_TOOL_ID,
                description: "读取 workspaceRoot 内的 UTF-8 文本文件",
                inputSchema: {
                    type: "object",
                    properties: { path: { type: "string" } },
                    required: ["path"],
                    additionalProperties: false,
                },
            },
            {
                id: WRITE_FILE_TOOL_ID,
                description: "写入 workspaceRoot 内的 UTF-8 文本文件（覆盖已有内容）",
                inputSchema: {
                    type: "object",
                    properties: {
                        content: { type: "string" },
                        path: { type: "string" },
                    },
                    required: ["path", "content"],
                    additionalProperties: false,
                },
            },
        ],
    );

    const planningRequest = await preparationRequest(
        createPreparationGoal("planning"),
        [...CURRENT_TOOL_DEFINITIONS].reverse(),
    );
    const planningSystemContent = planningRequest.messages[0]?.content ?? "";
    const planningToolsOffset = planningSystemContent.lastIndexOf(toolsMarker);

    assert.notEqual(planningToolsOffset, -1);
    assert.equal(
        planningSystemContent.slice(planningToolsOffset),
        serializedToolsSection,
    );

    const gatheringRequest = await preparationRequest(
        createPreparationGoal("gathering_context"),
        CURRENT_TOOL_DEFINITIONS,
    );
    const gatheringSystemContent = gatheringRequest.messages[0]?.content ?? "";
    const gatheringToolsOffset = gatheringSystemContent.lastIndexOf(toolsMarker);

    assert.notEqual(gatheringToolsOffset, -1);
    assert.deepEqual(
        JSON.parse(gatheringSystemContent.slice(gatheringToolsOffset + toolsMarker.length)),
        [],
    );
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

test("请求构建返回成对的 request 与 bundle，且阶段分支严格独占", async () => {
    const gatheringGoal = createPreparationGoal();
    const planningGoal: Goal = {
        ...gatheringGoal,
        state: {
            ...gatheringGoal.state,
            workflow: {
                phase: "planning",
                preparation: { status: "active" },
            },
        },
    };
    const executingGoal = createExecutingGoal();

    // 1. gathering 计划
    const gatheringPlan = await buildPreparationRequest(
        gatheringGoal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
    );
    assert.equal(gatheringPlan.bundle.name, "gathering_preparation_result");
    assert.ok(gatheringPlan.request.messages.length > 0);

    // 2. planning 计划
    const planningPlan = await buildPreparationRequest(
        planningGoal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
    );
    assert.equal(planningPlan.bundle.name, "planning_preparation_result");

    // 3. executing 计划
    const executingPlan = await buildStepRequest(
        executingGoal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
    );
    assert.equal(executingPlan.bundle.name, "executing_agent_decision");
});

test("prompt-only 模式在尾部动态控制消息末尾注入 Shape Guide，strict 模式不注入", async () => {
    const executingGoal = createExecutingGoal();

    // strict 模式
    const strictPlan = await buildStepRequest(
        executingGoal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
        undefined,
        undefined,
        "strict",
    );
    const strictLast = JSON.parse(strictPlan.request.messages.at(-1)!.content);
    assert.equal("responseShapeGuide" in strictLast, false);

    // prompt_only 模式
    const promptOnlyPlan = await buildStepRequest(
        executingGoal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
        undefined,
        undefined,
        "prompt_only",
    );
    const promptOnlyLast = JSON.parse(promptOnlyPlan.request.messages.at(-1)!.content);
    assert.equal(typeof promptOnlyLast.responseShapeGuide, "string");
    assert.match(promptOnlyLast.responseShapeGuide, /Respond with a JSON object/);
    assert.match(promptOnlyLast.responseShapeGuide, /"result"/);
});

test("会话历史被预算裁剪时，请求计划单向切换为 checkpoint Bundle", async () => {
    // 构造一个会话历史很多、预算很小的场景触发 TokenBudgetPlanner 裁剪
    const longMessages: GoalMessage[] = Array.from({ length: 20 }, (_, i) => {
        if (i % 2 === 0) {
            return {
                role: "user" as const,
                content: `这是很长的一段历史消息内容，用于超出模型输入上下文预算，消息编号为 ${i}，包含大量冗余字符测试文本。`.repeat(100),
            };
        }
        return {
            role: "assistant" as const,
            assistant: { profileId: profile.id },
            content: `这是很长的一段助手回复内容，用于超出模型输入上下文预算，消息编号为 ${i}，包含大量冗余字符测试文本。`.repeat(100),
        };
    });
    const executingGoal = createExecutingGoal({ messages: longMessages });

    // 限制 contextWindow 适度，迫使 conversationPruned = true 但权威上下文不 overflow
    const tightCapabilities = {
        contextWindowTokens: 10000,
        maxOutputTokens: 1000,
        tokenEstimator: {
            unit: "token" as const,
            estimate: (input: unknown) => Math.ceil(JSON.stringify(input).length / 4),
        },
    };

    const prunedPlan = await buildStepRequest(
        executingGoal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
        undefined,
        tightCapabilities,
        "prompt_only",
    );

    // 验证 bundle 单向切换为 checkpoint
    assert.equal(prunedPlan.bundle.name, "context_checkpoint_result");
    // 验证注入的 Shape Guide 也切换为 checkpoint
    const lastPayload = JSON.parse(prunedPlan.request.messages.at(-1)!.content);
    assert.equal(typeof lastPayload.responseShapeGuide, "string");
    assert.match(lastPayload.responseShapeGuide, /checkpoint/);
});

test("buildStepRequest and buildPreparationRequest populate structuredOutput in strict mode and omit in prompt_only mode", async () => {
    const goal = createExecutingGoal();
    const strictStepPlan = await buildStepRequest(
        goal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
        undefined,
        undefined,
        "strict",
    );
    assert.ok(strictStepPlan.request.structuredOutput !== undefined);
    assert.equal(strictStepPlan.request.structuredOutput.name, strictStepPlan.bundle.name);
    assert.deepEqual(strictStepPlan.request.structuredOutput.schema, strictStepPlan.bundle.jsonSchema);

    const promptOnlyStepPlan = await buildStepRequest(
        goal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
        undefined,
        undefined,
        "prompt_only",
    );
    assert.equal(promptOnlyStepPlan.request.structuredOutput, undefined);

    const prepGoal = createPreparationGoal("gathering_context");
    const strictPrepPlan = await buildPreparationRequest(
        prepGoal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
        undefined,
        undefined,
        undefined,
        "strict",
    );
    assert.ok(strictPrepPlan.request.structuredOutput !== undefined);
    assert.equal(strictPrepPlan.request.structuredOutput.name, strictPrepPlan.bundle.name);
    assert.deepEqual(strictPrepPlan.request.structuredOutput.schema, strictPrepPlan.bundle.jsonSchema);

    const promptOnlyPrepPlan = await buildPreparationRequest(
        prepGoal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
        undefined,
        undefined,
        undefined,
        "prompt_only",
    );
    assert.equal(promptOnlyPrepPlan.request.structuredOutput, undefined);
});

