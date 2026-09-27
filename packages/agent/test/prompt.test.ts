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
    WebSearchTool,
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
} from "../src/model-inference-view";

const PATH_INPUT_CONTRACT = contract.object({ path: contract.string() });
import type { ContextCompactor } from "../src/context-compactor";
import type { PromptBundleRenderer } from "../src/prompting/types";
import { buildStepRequest } from "../src/prompt";
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
    completionCriteria: [{ text: "请求顺序稳定" }, { text: "控制消息不持久化" }],
};
const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "你是一个严谨的执行代理。",
    instructions: ["先检查输入", "再给出下一步"],
    toolIds: [],
};

function createUnapprovedGoal(
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
        mode: "plan",
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...goal.state.run,
                status: "running",
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

                mode: "plan", approvedTask: task,
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

async function stepPlan(
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

async function executingRequest(
    goal: Goal,
    tools: readonly ToolDefinition[] = [],
    requestRenderer: PromptBundleRenderer = renderer,
) {
    return stepRequest(goal, tools, requestRenderer);
}

test("请求按固定 system、真实历史、动态 section、本轮 Working Context 排列", async () => {
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
        "Active Decide Instructions: structured@1; trajectory-layered@1; bm25-lite@1",
    ));
    const firstDynamicIndex = request.messages.findIndex((message) => message.content.includes("section: run_mode"));
    assert.ok(firstDynamicIndex > 1);
    assert.ok(request.messages.slice(1, firstDynamicIndex).every((message) => message.role !== "system"));
    assert.ok(request.messages.slice(firstDynamicIndex, -1).some((message) => message.content.includes("section: approved_task")));
    assert.ok(request.messages.slice(firstDynamicIndex, -1).some((message) => message.content.includes("section: working_memory")));
    const control = JSON.parse(request.messages.at(-1)?.content ?? "") as {
        readonly phase: string;
        readonly trajectoryContext: unknown;
    };
    const workingContext = new ModelInferenceProjector().projectWorkingContext(goal);
    assert.equal(control.phase, workingContext.phase);
    assert.equal("intent" in control, false);
    assert.equal("task" in control, false);
    assert.equal("contextEpoch" in control, false);
    assert.equal("workingMemory" in control, false);
    assert.ok(control.trajectoryContext !== undefined);
});

test("执行请求只展示调用方传入的授权 ToolDefinition", async () => {
    const goal = createExecutingGoal();
    const tool: ToolDefinition = {
        id: "read_file",
        description: "读取工作区内文本文件",
        inputContract: PATH_INPUT_CONTRACT,
        isReadOnly: true,
    };
    const request = await stepRequest(goal, [tool]);
    const systemContent = request.messages[0]?.content ?? "";
    const dynamicText = request.messages.slice(1, -1).map((message) => message.content).join("\n");

    assert.doesNotMatch(systemContent, /read_file/);
    assert.match(dynamicText, /read_file/);
    assert.match(dynamicText, /读取工作区内文本文件/);
    assert.ok(request.tools?.some((definition) => definition.id === "read_file"));
    assert.match(systemContent, /Active Decide Instructions:/);
});

const CURRENT_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
    {
        id: BASH_TOOL_ID,
        description: "在 workspaceRoot 内以 bash 执行命令并返回截断后的 stdout/stderr",
        inputContract: BASH_INPUT_CONTRACT,
        isReadOnly: false,
    },
    {
        id: READ_FILE_TOOL_ID,
        description: "读取 workspaceRoot 内的 UTF-8 文本文件",
        inputContract: READ_FILE_INPUT_CONTRACT,
        isReadOnly: true,
    },
    {
        id: WRITE_FILE_TOOL_ID,
        description: "写入 workspaceRoot 内的 UTF-8 文本文件（覆盖已有内容）",
        inputContract: WRITE_FILE_INPUT_CONTRACT,
        isReadOnly: false,
    },
    {
        id: EDIT_FILE_TOOL_ID,
        description: "对 workspaceRoot 内的 UTF-8 文本文件执行唯一匹配的字符串替换",
        inputContract: EDIT_FILE_INPUT_CONTRACT,
        isReadOnly: false,
    },
    {
        id: GREP_TOOL_ID,
        description: "在 workspaceRoot 内按正则搜索文本文件并返回带行号的匹配行",
        inputContract: GREP_INPUT_CONTRACT,
        isReadOnly: true,
    },
    {
        id: ALFWORLD_RESET_TOOL_ID,
        description: "初始化固定 ALFWorld TextWorld 任务会话",
        inputContract: ALFWORLD_RESET_INPUT_CONTRACT,
        isReadOnly: false,
    },
    {
        id: ALFWORLD_STEP_TOOL_ID,
        description: "向活动 ALFWorld TextWorld 会话提交一条命令",
        inputContract: ALFWORLD_STEP_INPUT_CONTRACT,
        isReadOnly: false,
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

    const toolsMarker = "Authorized business Tool definitions (only these business Tool IDs may be requested; system tools are declared separately for this request):\n";
    const toolsContent = first.messages.find((message) => message.content.includes("section: authorized_tools"))?.content ?? "";
    const toolsOffset = toolsContent.indexOf(toolsMarker);

    assert.notEqual(toolsOffset, -1);
    const projectedTools = JSON.parse(
        toolsContent.slice(toolsOffset + toolsMarker.length),
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

    const unapprovedRequest = await executingRequest(
        createUnapprovedGoal(),
        [...CURRENT_TOOL_DEFINITIONS].reverse(),
    );
    const unapprovedToolsContent = unapprovedRequest.messages.find((message) => message.content.includes("section: authorized_tools"))?.content ?? "";
    const unapprovedToolsOffset = unapprovedToolsContent.indexOf(toolsMarker);

    assert.notEqual(unapprovedToolsOffset, -1);
    const unapprovedProjectedTools = JSON.parse(
        unapprovedToolsContent.slice(unapprovedToolsOffset + toolsMarker.length),
    );
    assert.deepEqual(
        unapprovedProjectedTools.map((t: { id: string }) => t.id),
        CURRENT_TOOL_DEFINITIONS.map((tool) => tool.id).sort(),
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
        /A historical lookup can locate prior events or rationale, but cannot establish the current state/,
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

    assert.deepEqual(request.messages.slice(1, 3), [
        { role: "user", content: "当前阶段输入" },
        { role: "assistant", content: "当前阶段响应" },
    ]);
    assert.ok(request.messages.slice(3, -1).some((message) => message.content.includes("section: run_mode")));
});

test("Plan 未批准时保留全部已授权 ToolDefinition", async () => {
    const readOnlyTool: ToolDefinition = {
        id: "read_file",
        description: "读取文件",
        inputContract: PATH_INPUT_CONTRACT,
        isReadOnly: true,
    };
    const writeTool: ToolDefinition = {
        id: "write_file",
        description: "写入文件",
        inputContract: PATH_INPUT_CONTRACT,
        isReadOnly: false,
    };
    const tools: readonly ToolDefinition[] = [readOnlyTool, writeTool];
    const views: ModelInferenceView[] = [];
    const capturingRenderer: PromptBundleRenderer = {
        render() {
            return "captured";
        },
        renderDynamicSections(view) {
            views.push(view);
            return [];
        },
    };

    await stepRequest(createUnapprovedGoal(), tools, capturingRenderer);

    assert.ok(views.length > 0);
    assert.ok(views.every((view) => view.dynamicContext.authorizedTools.length === 2));
    assert.deepEqual(views[0]?.dynamicContext.authorizedTools.map((tool) => tool.id), ["read_file", "write_file"]);
    assert.notStrictEqual(views[0]?.dynamicContext.authorizedTools[0], readOnlyTool);
    assert.notStrictEqual(views[0]?.dynamicContext.authorizedTools[0]?.inputSchema, PATH_INPUT_CONTRACT);
    assert.equal(Object.isFrozen(views[0]?.dynamicContext.authorizedTools[0]?.inputSchema), true);
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

test("Builder 拒绝非 executing 或非 running 的 Goal", async () => {
    const wrongPhase: Goal = {
        ...createExecutingGoal(),
        state: {
            ...createExecutingGoal().state,
            workflow: {
                ...createExecutingGoal().state.workflow,
                phase: "invalid_phase" as any,
            },
        },
    };
    const created: Goal = {
        ...createExecutingGoal(),
        state: {
            ...createExecutingGoal().state,
            run: { ...createExecutingGoal().state.run, status: "created" },
        },
    };

    await assert.rejects(stepRequest(wrongPhase), /Goal must be in executing phase/);
    await assert.rejects(stepRequest(created), /running executing/);
});

test("请求构建返回成对的 request 与 bundle，未批准与已批准状态分别匹配对应 Schema", async () => {
    const unapprovedGoal = createUnapprovedGoal();
    const executingGoal = createExecutingGoal();

    // 1. 未批准任务（读取事实并提出任务）
    const unapprovedPlan = await buildStepRequest(
        unapprovedGoal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
    );
    assert.equal(unapprovedPlan.bundle.name, "plan_mode_unapproved_executing_agent_decision");
    assert.ok(unapprovedPlan.request.messages.length > 0);

    // 2. 已批准执行
    const executingPlan = await buildStepRequest(
        executingGoal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
    );
    assert.equal(executingPlan.bundle.name, "plan_mode_approved_executing_agent_decision");
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
    assert.deepEqual(
        prunedPlan.request.tools?.map((tool) => tool.id),
        ["system_context_checkpoint"],
    );
    assert.deepEqual(
        prunedPlan.toolDeclarations.map((tool) => tool.id),
        ["system_context_checkpoint"],
    );
    // 验证注入的 Shape Guide 也切换为 checkpoint
    const lastPayload = JSON.parse(prunedPlan.request.messages.at(-1)!.content);
    assert.equal(typeof lastPayload.responseShapeGuide, "string");
    assert.match(lastPayload.responseShapeGuide, /checkpoint/);
});

test("buildStepRequest populates structuredOutput in strict mode and omits in prompt_only mode", async () => {
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

    const unapprovedGoal = createUnapprovedGoal();
    const strictUnapprovedPlan = await buildStepRequest(
        unapprovedGoal,
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
    assert.ok(strictUnapprovedPlan.request.structuredOutput !== undefined);
    assert.equal(strictUnapprovedPlan.request.structuredOutput.name, strictUnapprovedPlan.bundle.name);
    assert.deepEqual(strictUnapprovedPlan.request.structuredOutput.schema, strictUnapprovedPlan.bundle.jsonSchema);

    const promptOnlyUnapprovedPlan = await buildStepRequest(
        unapprovedGoal,
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
    assert.equal(promptOnlyUnapprovedPlan.request.structuredOutput, undefined);
});

test("buildStepRequest 在 Plan 提案前不按 isReadOnly 过滤 Profile 已授权工具", async () => {
    const mixedTools: readonly ToolDefinition[] = [
        // 1. 内置只读工具
        {
            id: READ_FILE_TOOL_ID,
            description: "读取文件",
            inputContract: READ_FILE_INPUT_CONTRACT,
            isReadOnly: true,
        },
        new WebSearchTool().definition,
        // 2. 自定义扩展只读工具（模拟未来新增工具）
        {
            id: "custom_doc_search",
            description: "检索技术文档",
            inputContract: contract.object({ keyword: contract.string() }),
            isReadOnly: true,
        },
        // 3. 写操作与副作用工具
        {
            id: WRITE_FILE_TOOL_ID,
            description: "写入文件",
            inputContract: WRITE_FILE_INPUT_CONTRACT,
            isReadOnly: false,
        },
        {
            id: BASH_TOOL_ID,
            description: "执行 shell 命令",
            inputContract: BASH_INPUT_CONTRACT,
            isReadOnly: false,
        },
        // 4. 未声明只读性的扩展工具；传入列表表示已由 Profile 授权。
        {
            id: "unknown_side_effect_tool",
            description: "未知工具",
            inputContract: contract.object({}),
            isReadOnly: false,
        },
    ];

    const unapprovedGoal = createUnapprovedGoal();
    const plan = await buildStepRequest(
        unapprovedGoal,
        mixedTools,
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        trajectoryContextAssembler,
    );

    const dynamicText = plan.request.messages.slice(1, -1).map((message) => message.content).join("\n");
    for (const id of ["read_file", "web_search", "custom_doc_search", "write_file", "bash", "unknown_side_effect_tool"]) {
        assert.ok(dynamicText.includes(id), `Profile 已授权的 ${id} 应保持暴露`);
    }
});

test("GoalPlan Tool 仅在 Plan Mode 暴露，已存在的计划在普通模式仍投影", async () => {
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-plan-1",
        intent,
        profile,
        runId: "run-plan-1",
        mode: "plan",
    });
    const goal: Goal = {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
            },
            goalPlan: {
                revision: 1,
                items: [{
                    id: "todo-1",
                    content: "检查现有实现",
                    position: 0,
                    status: "pending",
                }],
            },
            run: { ...created.state.run, status: "running" , mode: "plan", approvedTask: task },
        },
    };

    const plan = await stepPlan(goal);
    assert.ok(plan.toolDeclarations.some((declaration) => declaration.id === "system_update_goal_plan"));
    const planSection = plan.request.messages.find((message) => message.content.includes("section: goal_plan"))?.content ?? "";
    assert.match(planSection, /GoalPlan \(read-only projection/);
    assert.match(planSection, /todo-1/);

    const createdNormal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-normal-1",
        intent,
        profile,
        runId: "run-normal-1",
    });
    const normal = await stepPlan({
        ...createdNormal,
        state: {
            ...createdNormal.state,
            goalPlan: { revision: 1, items: [{ id: "todo-1", content: "普通模式可见", position: 0, status: "pending" }] },
            run: { ...createdNormal.state.run, status: "running" },
        },
    });
    assert.equal(normal.toolDeclarations.some((declaration) => declaration.id === "system_update_goal_plan"), false);
    const normalSection = normal.request.messages.find((message) => message.content.includes("section: goal_plan"))?.content ?? "";
    assert.match(normalSection, /GoalPlan \(read-only projection/);
    assert.match(normalSection, /普通模式可见/);
    assert.doesNotMatch(normalSection, /system_update_goal_plan/);
});
