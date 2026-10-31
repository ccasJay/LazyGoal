/**
 * Agent 能力拆包的行为对照数据构造器。
 *
 * @remarks
 * 该模块只构造确定性场景并返回可比较的规范化 JSON 对象；它不写入文件。
 * `component-extraction-baseline.generate.ts` 用它生成
 * `fixtures/component-extraction-baseline/baseline.json`，
 * `component-extraction-baseline.test.ts` 用它重新计算并与基线比较。
 * 回归测试不覆盖基线文件；基线只能在迁移前由生成脚本显式更新。
 *
 * 规范化只处理随机调用身份，保留调用身份与 frame 的配对关系；不清理消息内容、
 * 顺序、工具声明、契约、预算数值或错误分类。
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { LLMAdapter } from "../../llm-core/src/index";
import type { LLMRequest, LLMResponse } from "../../llm-core/src/index";
import { toolCallResponse } from "../../llm-core/test/response-fixtures";
import type { NativeConversationIdentity } from "../../model-contracts/src/index";
import { createGoal } from "../../runtime/src/domain";
import type { Goal, GoalMessage } from "../../runtime/src/domain";
import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
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
import type { AnyBoundToolDefinition } from "../../tool-core/src/index";
import { createTestToolDefinition, objectInputSchema } from "../../tool-core/test/binding-fixtures";
import { createEmptyWorkingMemory } from "../../working-memory/src/index";
import type { AgentProfile } from "../../runtime/src/agent-profile";
import {
    LLMStepExecutor,
    MutableModelBinding,
    createModelExecutionBinding,
} from "../src/index";
import { planDynamicSectionUpdates } from "../../model-request/src/index";
import {
    DEFAULT_PROMPT_TEMPLATE_ASSETS,
    createDefaultPromptBundleRenderer,
} from "../../prompt-bundle/src/index";
import { normalizeNewlines } from "../../prompt-renderer/src/index";
import {
    ModelInferenceProjector,
    TrajectoryModelContextAssembler,
} from "../../model-context/src/index";
import {
    CharacterModelInputEstimator,
    ContextSelector,
    DropOldestContextCompactor,
    ModelContextHardOverflowError,
    TokenBudgetPlanner,
    compareCodeUnits,
    createModelContextBudgetPolicy,
    stableJson,
    truncateThought,
} from "../../context-budget/src/index";
import type { DynamicSectionMessage } from "../../prompt-renderer/src/index";
import { buildStepRequest } from "../../model-request/src/index";
import type { StepPromptStageContext } from "../../model-request/src/index";
import { currentProtocols, currentWorkingMemory } from "../../agent/test/current-fixtures";
import { testAssistantMessage, testUserMessage } from "../../runtime/test/current-fixtures";

const BASELINE_PROFILE: AgentProfile = {
    id: "baseline-profile",
    systemPrompt: "你是一个严谨的执行代理。",
    instructions: ["先检查输入", "再给出下一步"],
    toolIds: ["read_file"],
};

const READ_TOOL: AnyBoundToolDefinition = createTestToolDefinition("read_file", objectInputSchema({
    path: { type: "string" },
}), { description: "Read a file from workspaceRoot.", isReadOnly: true });

const NATIVE_IDENTITY: NativeConversationIdentity = {
    provider: "google",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-3.6-flash-high",
    protocol: "gemini-content",
};

const BASELINE_MESSAGES: readonly GoalMessage[] = [
    testUserMessage("请读取 README 并总结。", {
        runId: "baseline-run",
        messageId: "msg-baseline-user-1",
        source: { kind: "user_input", inputId: "input-baseline-1" },
    }),
    testAssistantMessage("我先读取 README。", {
        profileId: BASELINE_PROFILE.id,
        runId: "baseline-run",
        messageId: "msg-baseline-assistant-1",
        source: { kind: "model_text", modelCallId: "call-baseline-1", blockIndex: 0 },
    }),
];

function createBaselineGoal(options: {
    readonly approvedTask?: boolean;
    readonly messages?: readonly GoalMessage[];
} = {}): Goal {
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "baseline-goal",
        runId: "baseline-run",
        intent: "完成基线任务",
        profile: BASELINE_PROFILE,
        mode: "plan",
        messages: options.messages ?? [],
    });
    const run = {
        ...created.state.run,
        status: "running" as const,
        mode: "plan" as const,
        exposedToolIds: ["read_file"],
        ...(options.approvedTask === false
            ? {}
            : {
                approvedTask: {
                    objective: "读取 README 并给出简短摘要",
                    completionCriteria: [{ text: "摘要引用 README 内容" }],
                },
            }),
    };
    return {
        ...created,
        state: {
            ...created.state,
            workflow: { phase: "executing" },
            run,
        },
    };
}

class MemoryTrajectoryStore implements TrajectoryStore {
    constructor(readonly events: readonly TrajectoryEvent[]) {}

    async append(): Promise<Readonly<TrajectoryEvent>> {
        throw new Error("baseline store is read-only");
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

function createAssembler(events: readonly TrajectoryEvent[] = []): TrajectoryModelContextAssembler {
    return new TrajectoryModelContextAssembler({
        trajectoryStore: new MemoryTrajectoryStore(events),
        policy: createModelContextBudgetPolicy(
            { modelInputBudget: 500_000 },
            new CharacterModelInputEstimator(),
        ),
    });
}

function createPlan(text: string, revision: number) {
    return {
        revision,
        items: [{ id: "todo-plan", content: text, position: 0, status: "pending" as const }],
    };
}

function createSectionGoal(input: {
    readonly plan?: ReturnType<typeof createPlan>;
    readonly boundary?: number;
} = {}): Goal {
    const base = createBaselineGoal({ messages: [] });
    const run = {
        ...base.state.run,
        committedThroughSequence: input.boundary ?? 0,
    };
    return {
        ...base,
        state: {
            ...base.state,
            run,
            ...(input.plan === undefined ? {} : { goalPlan: input.plan }),
        },
    };
}

function projectSections(
    renderer: Awaited<ReturnType<typeof createDefaultPromptBundleRenderer>>,
    goal: Goal,
    stage: "decide" | "think",
): readonly DynamicSectionMessage[] {
    const view = new ModelInferenceProjector().project(
        goal,
        [READ_TOOL],
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

function frameFor(
    goal: Goal,
    sequence: number,
    stage: "decide" | "think",
    sections: readonly ModelContextSectionUpdate[],
): TrajectoryEvent {
    const draft: TrajectoryEventDraft = {
        goalId: goal.id,
        runId: goal.state.run.id,
        phase: "executing",
        eventType: "model_context_frame",
        payload: {
            type: "model_context_frame",
            stage,
            epochNumber: goal.state.run.contextEpoch.number,
            conversationPosition: goal.state.messages.length,
            sections,
        } satisfies ModelContextFramePayload,
    };
    return allocateImmutableEvent(draft, sequence, `baseline-frame-${sequence}`) as TrajectoryEvent;
}

class ScriptedDecideAdapter implements LLMAdapter {
    readonly structuredOutputMode = "strict" as const;
    readonly requests: LLMRequest[] = [];

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.requests.push(request);
        return toolCallResponse({
            callId: "baseline-call",
            toolId: "read_file",
            argumentsJson: JSON.stringify({ path: "README.md" }),
        });
    }
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** 只规范化随机身份，保留其在配对字段中的一致性。 */
function normalizeIdentities(value: unknown): unknown {
    if (typeof value === "string") {
        return value.replace(UUID_PATTERN, "<uuid>");
    }
    if (Array.isArray(value)) {
        return value.map(normalizeIdentities);
    }
    if (value !== null && typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value)) {
            result[key] = normalizeIdentities(entry);
        }
        return result;
    }
    return value;
}

function toComparable(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value)) as unknown;
}

let defaultRenderer: Awaited<ReturnType<typeof createDefaultPromptBundleRenderer>> | undefined;

async function ensureDefaultRenderer() {
    if (defaultRenderer === undefined) {
        defaultRenderer = await createDefaultPromptBundleRenderer();
    }
    return defaultRenderer;
}

async function buildDecideScenario(
    goal: Goal,
    stageContext: StepPromptStageContext | undefined,
    nativeIdentity?: NativeConversationIdentity,
) {
    const renderer = await ensureDefaultRenderer();
    return buildStepRequest(
        goal,
        [READ_TOOL],
        renderer,
        new DropOldestContextCompactor(),
        undefined,
        currentWorkingMemory,
        createAssembler(),
        undefined,
        undefined,
        "strict",
        "decide",
        stageContext,
        nativeIdentity,
    );
}

async function buildThinkScenario(goal: Goal) {
    const renderer = await ensureDefaultRenderer();
    return buildStepRequest(
        goal,
        [READ_TOOL],
        renderer,
        new DropOldestContextCompactor(),
        undefined,
        currentWorkingMemory,
        createAssembler(),
        undefined,
        undefined,
        "prompt_only",
        "think",
        { thinkGoal: "确认当前执行路线" },
    );
}

function requestSummary(plan: {
    readonly request: LLMRequest;
    readonly bundle: { readonly name: string; readonly shapeGuide: string; readonly jsonSchema: unknown };
    readonly toolDeclarations: readonly { readonly id: string }[];
    readonly modelContextFrame: Omit<ModelContextFramePayload, "type">;
}) {
    return {
        request: plan.request,
        bundle: {
            name: plan.bundle.name,
            shapeGuide: plan.bundle.shapeGuide,
            jsonSchema: plan.bundle.jsonSchema,
        },
        toolDeclarationIds: plan.toolDeclarations.map((declaration) => declaration.id),
        modelContextFrame: plan.modelContextFrame,
    };
}

async function sectionScenario() {
    const renderer = await ensureDefaultRenderer();
    const priorGoal = createSectionGoal({ plan: createPlan("旧计划", 1) });
    const goal = createSectionGoal({ plan: createPlan("当前计划", 2), boundary: 2 });
    const oldPlan = projectSections(renderer, priorGoal, "decide").find(
        (section) => section.sectionId === "goal_plan",
    );
    const currentPlan = projectSections(renderer, goal, "decide").find(
        (section) => section.sectionId === "goal_plan",
    );
    if (oldPlan === undefined || currentPlan === undefined) {
        throw new Error("baseline scenario requires goal_plan sections");
    }
    const events = [
        frameFor(goal, 1, "think", [activeUpdate(currentPlan)]),
        frameFor(goal, 2, "decide", [activeUpdate(oldPlan)]),
    ];
    const assembler = createAssembler(events);
    const build = (stage: "decide" | "think") => buildStepRequest(
        goal,
        [READ_TOOL],
        renderer,
        new DropOldestContextCompactor(),
        undefined,
        currentWorkingMemory,
        assembler,
        undefined,
        undefined,
        "prompt_only",
        stage,
        stage === "think" ? { thinkGoal: "确认当前 GoalPlan 与任务的关系" } : undefined,
    );
    const think = await build("think");
    const decide = await build("decide");
    const diffPlan = planDynamicSectionUpdates(
        renderer.dynamicSectionIdentities(),
        projectSections(renderer, goal, "decide"),
        [{
            type: "model_context_frame",
            stage: "decide",
            epochNumber: goal.state.run.contextEpoch.number,
            conversationPosition: goal.state.messages.length,
            sections: [activeUpdate(oldPlan)],
        }],
    );
    return {
        think: requestSummary(think),
        decide: requestSummary(decide),
        diffPlan: {
            requestMessages: diffPlan.requestMessages,
            frameSections: diffPlan.frameSections,
        },
    };
}

async function budgetScenario() {
    const policy = createModelContextBudgetPolicy({
        modelInputBudget: 1_000,
        responseReserve: 100,
        warmShare: 0.25,
    });
    const plan = policy.plan({ fixedInput: { task: "baseline", nested: [1, 2, 3] } });
    const reallocated = policy.reallocateHotBudget(plan, 100);
    const planner = new TokenBudgetPlanner({
        contextWindowTokens: 8_192,
        maxOutputTokens: 2_048,
        tokenEstimator: {
            unit: "token",
            estimate: (input: unknown) => JSON.stringify(input).length,
        },
    });
    const measured = planner.measure({ messages: [{ role: "user", content: "预算计量" }] });
    const compactor = new DropOldestContextCompactor(7);
    const compactorUnits = [
        { items: ["oldest"], characterCount: 5 },
        { items: ["middle"], characterCount: 4 },
        { items: ["newest"], characterCount: 3 },
    ];
    const compacted = await compactor.compact(compactorUnits);
    const oversized = await compactor.compact([
        { items: ["old"], characterCount: 1 },
        { items: ["oversized"], characterCount: 10 },
    ]);
    const thought = truncateThought("推演".repeat(4_000), { maxChars: 100 });
    const selector = new ContextSelector(planner);
    const selection = selector.select({
        authority: { task: "authority" },
        latestConversation: { id: "latest", value: "latest" },
        olderConversation: [{ id: "older", value: "older" }],
        render: (parts) => parts,
    });
    let hardOverflowCode: string | undefined;
    let hardOverflowName: string | undefined;
    try {
        selector.select({
            authority: { task: "x".repeat(10_000) },
            latestConversation: { id: "latest", value: "latest" },
            render: (parts) => parts,
        });
    } catch (error) {
        if (error instanceof ModelContextHardOverflowError) {
            hardOverflowCode = error.code;
            hardOverflowName = error.name;
        } else {
            throw error;
        }
    }
    return {
        plan,
        reallocated,
        measured,
        compacted,
        oversized,
        thought,
        selection,
        hardOverflow: { code: hardOverflowCode, name: hardOverflowName },
        stableJson: stableJson({ zebra: 1, apple: [3, 1, 2], mango: { b: 2, a: 1 } }),
        compareCodeUnits: [
            compareCodeUnits("apple", "banana"),
            compareCodeUnits("a", "a"),
            compareCodeUnits("b", "a"),
        ],
    };
}

async function executionConsequenceScenario() {
    const goal = createBaselineGoal({ approvedTask: true, messages: BASELINE_MESSAGES });
    const decideAdapter = new ScriptedDecideAdapter();
    let thinkCalls = 0;
    const thinkAdapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate(): Promise<LLMResponse> {
            thinkCalls += 1;
            throw new Error("baseline Think adapter must not be called");
        },
    };
    const binding = createModelExecutionBinding({
        generation: 1,
        selection: {
            provider: "openai",
            modelId: "gpt-4o",
            structuredOutputMode: "two_stage",
            inputEstimator: { kind: "character-v1" },
        },
        thinkAdapter,
        decideAdapter,
        trajectoryStore: new MemoryTrajectoryStore([]),
    });
    const executor = new LLMStepExecutor({
        bindingProvider: new MutableModelBinding(binding),
        renderer: await ensureDefaultRenderer(),
        contextCompactor: new DropOldestContextCompactor(),
    });
    const result = await executor.decide({
        goal,
        authorizedTools: [READ_TOOL],
        workingMemory: currentWorkingMemory,
        thinkHistory: [],
    });
    return {
        result,
        thinkCalls,
        adapterRequest: decideAdapter.requests[0],
    };
}

async function templateScenario() {
    const templates = await Promise.all(
        DEFAULT_PROMPT_TEMPLATE_ASSETS.map(async (asset) => ({
            id: asset.id,
            body: normalizeNewlines(await readFile(fileURLToPath(asset.sourceUrl), "utf8")),
        })),
    );
    templates.sort((left, right) => compareCodeUnits(left.id, right.id));
    return templates;
}

/**
 * 构造完整的行为对照数据。
 *
 * @returns 含模板正文、来源指纹与全部确定性场景的规范化 JSON 对象。
 */
export async function buildComponentExtractionBaseline(): Promise<Record<string, unknown>> {
    const templates = await templateScenario();
    const approvedGoal = createBaselineGoal({ approvedTask: true, messages: BASELINE_MESSAGES });
    const unapprovedGoal = createBaselineGoal({ approvedTask: false, messages: BASELINE_MESSAGES });
    const feedbackGoal = createBaselineGoal({ approvedTask: true, messages: BASELINE_MESSAGES });
    const feedback = {
        goalId: feedbackGoal.id,
        runId: feedbackGoal.state.run.id,
        executionUnitId: "baseline-unit",
        stepOrdinal: 1,
        stage: "decide" as const,
        origin: "output_contract" as const,
        code: "INVALID_LLM_RESPONSE",
        attempt: 2,
        issues: [{ code: "invalid_json", path: [] as const, message: "Return valid JSON." }],
        constraints: ["Follow the active response schema."],
    };

    const scenarios = {
        decideRequest: requestSummary(await buildDecideScenario(approvedGoal, { allowThink: true, thinkHistory: [] })),
        thinkRequest: requestSummary(await buildThinkScenario(approvedGoal)),
        unapprovedRequest: requestSummary(await buildDecideScenario(unapprovedGoal, undefined)),
        nativeDecideRequest: requestSummary(
            await buildDecideScenario(approvedGoal, { allowThink: true, thinkHistory: [] }, NATIVE_IDENTITY),
        ),
        feedbackRequest: requestSummary(
            await buildDecideScenario(feedbackGoal, {
                allowThink: true,
                thinkHistory: [],
                runtimeFeedback: feedback,
            }),
        ),
        sectionRecovery: await sectionScenario(),
        budget: await budgetScenario(),
        executionConsequence: await executionConsequenceScenario(),
    };

    const sourceFingerprint = `sha256:${createHash("sha256").update(JSON.stringify({
        templates,
        profile: BASELINE_PROFILE,
        tools: [READ_TOOL],
        approvedGoal,
        unapprovedGoal,
        feedback,
        nativeIdentity: NATIVE_IDENTITY,
    })).digest("hex")}`;

    return toComparable(normalizeIdentities({
        version: 1,
        sourceFingerprint,
        scenarios,
        templates,
    })) as Record<string, unknown>;
}
