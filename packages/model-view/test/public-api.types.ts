/**
 * model-view 表示契约的消费验证。
 *
 * @remarks
 * 本文件只做类型级验证：用本包公共入口的表示类型构造代表性值，证明 Prompt、请求与
 * 历史消费者无需导入 Runtime、投影器或 Reducer 即可引用模型输入与历史结果 DTO。
 * 它由根 TypeScript 检查发现，不注册运行时测试；字段值域与实现结果的兼容证据由
 * `packages/model-context/test/` 的投影与组装测试提供。
 */

import type { ModelContextBudgetPlan } from "../../context-budget/src/index";
import type { ContextLookupMatchedField } from "../../context-retrieval/src/index";
import type { ContextLookupFilters, ContextLookupOperation } from "../../model-contracts/src/index";
import type {
    ModelContextLookupResult,
    ModelConversationMessage,
    ModelExecutionUnitProjection,
    ModelInferenceView,
    ModelProfileView,
    ModelTrajectoryContext,
    ModelTrajectoryEvent,
    NativeModelExchange,
    PromptContext,
    StepDynamicPayload,
    VisibleConversationMessageMapEntry,
    WarmCompactEntry,
} from "../src/index";

const profile: ModelProfileView = {
    id: "profile-1",
    systemPrompt: "system",
    instructions: ["step"],
};

const prompt: PromptContext = {
    promptBundleVersion: 1,
    phase: "executing",
    stage: "decide",
    profile,
    memoryProtocol: { kind: "structured", version: 1 },
    modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
};

const conversationMessage: ModelConversationMessage = {
    role: "user",
    content: "hello",
    sourceMessageIndex: 0,
};

const conversationMap: VisibleConversationMessageMapEntry = {
    visibleIndex: 0,
    sourceMessageIndex: 3,
};

const operation: ContextLookupOperation = "history_search";
const filters: ContextLookupFilters = { toolIds: ["read_file"] };
const matchedField: ContextLookupMatchedField = "path";

const lookupResult: ModelContextLookupResult = {
    status: "found",
    sourceScope: "goal_history",
    limitations: "Only committed Goal history was searched.",
    lookupId: "lookup-1",
    committedThroughSequence: 4,
    matches: [{
        documentId: "doc-1",
        goalId: "goal-1",
        runId: "run-1",
        firstSequence: 3,
        lastSequence: 4,
        matchedFields: [matchedField],
        score: 1,
        preview: "src/index.ts",
        truncated: false,
        historical: true,
        sourceEventIds: ["event-3"],
    }],
    truncated: false,
    freshness: {
        kind: "historical",
        committedThroughSequence: 4,
        warning: "Re-observe current state.",
    },
    operation,
};

const trajectoryEvent: ModelTrajectoryEvent = {
    eventId: "event-1",
    sequence: 2,
    eventType: "tool_finished",
    phase: "executing",
    goalId: "goal-1",
    runId: "run-1",
    executionUnitId: "unit-1",
    actionId: "action-1",
    payload: { type: "tool_finished" },
};

const nativeExchange: NativeModelExchange = {
    conversationPosition: 1,
    responseSequence: 2,
    settledThroughSequence: 5,
    messages: [conversationMessage],
};

const executionUnit: ModelExecutionUnitProjection = {
    executionUnitId: "unit-1",
    goalId: "goal-1",
    runId: "run-1",
    phase: "executing",
    firstSequence: 1,
    lastSequence: 2,
    events: [trajectoryEvent],
    nativeExchanges: [nativeExchange],
};

const warmEntry: WarmCompactEntry = {
    id: "finding-1",
    kind: "finding",
    summary: "finding",
    status: "active",
    lossy: true,
    evidenceSequences: [1],
    firstSequence: 1,
    lastSequence: 1,
    lastAccessedSequence: 1,
    reinforcementCount: 1,
    sourceHash: "sha256:finding",
};

const budget: ModelContextBudgetPlan = {
    measuredAs: "character",
    modelInputBudget: 100,
    responseReserve: 10,
    fixedInput: { unit: "character", count: 5 },
    historyBudget: 85,
    warmBudget: 21,
    hotBudget: 64,
    softOverflow: false,
};

const trajectoryContext: ModelTrajectoryContext = {
    measuredAs: "character",
    softOverflow: false,
    hot: [executionUnit],
    warm: [warmEntry],
    budget,
};

const dynamicPayload: StepDynamicPayload = {
    phase: "executing",
    execution: { stepCount: 1 },
    trajectoryContext: {
        hot: trajectoryContext.hot,
        warm: trajectoryContext.warm,
    },
    contextLookupResult: lookupResult,
};

const view: ModelInferenceView = {
    prompt,
    dynamicContext: {
        runMode: "normal",
        goalPlanWritable: false,
        authorizedTools: [{ id: "read_file", description: "read" }],
    },
    conversation: [conversationMessage],
    workingContext: { phase: "executing", intent: "demo", execution: { stepCount: 0 } },
    workingMemory: {
        protocolVersion: 1,
        derivedThroughSequence: 0,
        facts: [],
        hypotheses: [],
        blockers: [],
    },
    trajectoryContext,
    contextEpoch: {
        protocolVersion: 1,
        epochNumber: 0,
        conversationStartIndex: 0,
        openedAtSequence: 0,
        control: { status: "active" },
    },
};

/** 供类型检查消费的代表性值；不在运行时使用。 */
export const PUBLIC_API_SAMPLES = {
    prompt,
    conversationMessage,
    conversationMap,
    filters,
    lookupResult,
    executionUnit,
    trajectoryContext,
    dynamicPayload,
    view,
} as const;
