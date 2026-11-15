import type {
  BrowserActivityPage,
  BrowserGoalEvent,
  BrowserGoalList,
  BrowserGoalSessionEnvelope,
  BrowserGoalSessionStateEnvelope,
  BrowserInteractionDetailResult,
  BrowserSessionState,
  SessionMetricsSnapshot,
} from "../../../../../packages/web-contracts/src/index";
import {
  createDefaultModelCatalog,
  createDefaultWorkspaceContext,
} from "../default-fixtures";
import type { FixtureScenario } from "../fixture-types";

const WAITING_GOAL_ID = "goal-session-waiting";
const WAITING_RUN_ID = "run-payment-1";
const WAITING_INTERACTION_ID = "interaction-ask-1";

const waitingSessionState: BrowserSessionState = {
  goalId: WAITING_GOAL_ID,
  runId: WAITING_RUN_ID,
  runStatus: "waiting",
  mode: "normal",
  commitRevision: 1,
  queueRevision: 1,
  queuePaused: false,
  pendingMessageCount: 0,
  pendingSteerCount: 0,
  messages: {
    count: 2,
    recent: [
      {
        messageId: "msg-user-1",
        role: "user",
        runId: WAITING_RUN_ID,
        position: { afterSequence: 0, order: 0 },
        sourceKind: "user_input",
        sourceId: "input-1",
      },
      {
        messageId: "msg-asst-1",
        role: "assistant",
        runId: WAITING_RUN_ID,
        position: { afterSequence: 1, order: 0 },
        sourceKind: "model_output",
        sourceId: "call-1",
      },
    ],
  },
  needsRecovery: false,
  executionOwner: true,
  waitingFor: "ask_user",
  interaction: {
    interactionId: WAITING_INTERACTION_ID,
    kind: "question",
    runId: WAITING_RUN_ID,
  },
};

const waitingSessionEnvelope: BrowserGoalSessionEnvelope = {
  goal: {
    goalId: WAITING_GOAL_ID,
    intent: "Integrate payment processing module with Stripe and PayPal",
    currentRunId: WAITING_RUN_ID,
    runStatus: "waiting",
    currentRunMode: "normal",
    messages: [
      {
        messageId: "msg-user-1",
        role: "user",
        runId: WAITING_RUN_ID,
        position: { afterSequence: 0, order: 0 },
        content: "Please integrate payment processing module with Stripe and PayPal",
      },
      {
        messageId: "msg-asst-1",
        role: "assistant",
        runId: WAITING_RUN_ID,
        position: { afterSequence: 1, order: 0 },
        content: "I have reviewed the gateway requirements and need your preference before proceeding.",
      },
    ],
    runs: [
      {
        runId: WAITING_RUN_ID,
        status: "waiting",
        stepCount: 1,
        steps: [],
        current: true,
      },
    ],
    interaction: {
      goalId: WAITING_GOAL_ID,
      runId: WAITING_RUN_ID,
      kind: "question",
      interactionId: WAITING_INTERACTION_ID,
      decisions: ["answer_questions", "reply_to_question", "skip_question"],
      truncated: false,
    },
    historyTruncated: false,
  },
  session: waitingSessionState,
};

const waitingStateEnvelope: BrowserGoalSessionStateEnvelope = {
  goal: {
    goalId: WAITING_GOAL_ID,
    intent: "Integrate payment processing module with Stripe and PayPal",
    currentRunId: WAITING_RUN_ID,
    runStatus: "waiting",
    currentRunMode: "normal",
    currentRunStepCount: 1,
    history: {
      messages: { included: false, source: "activity" },
      steps: { included: false, source: "activity" },
      stages: { included: false, source: "activity" },
    },
    interaction: {
      goalId: WAITING_GOAL_ID,
      runId: WAITING_RUN_ID,
      kind: "question",
      interactionId: WAITING_INTERACTION_ID,
      decisions: ["answer_questions", "reply_to_question", "skip_question"],
      truncated: false,
    },
  },
  session: waitingSessionState,
};

const waitingInteractionDetail: BrowserInteractionDetailResult = {
  ok: true,
  goalId: WAITING_GOAL_ID,
  runId: WAITING_RUN_ID,
  interactionId: WAITING_INTERACTION_ID,
  detail: {
    kind: "question",
    mode: "execution",
    questions: [
      {
        id: "q-gateway",
        header: "Payment Gateways",
        question: "Which payment gateways should be enabled for this environment?",
        options: [
          { id: "opt-stripe", label: "Stripe", description: "Direct credit card & ACH processing" },
          { id: "opt-paypal", label: "PayPal", description: "Express checkout buttons" },
        ],
        multiSelect: false,
      },
    ],
  },
};

const waitingActivityPage: BrowserActivityPage = {
  goalId: WAITING_GOAL_ID,
  limit: 50,
  items: [
    {
      type: "message",
      itemId: "item-msg-1",
      messageId: "msg-user-1",
      role: "user",
      runId: WAITING_RUN_ID,
      position: { runId: WAITING_RUN_ID, runOrder: 0, sequence: 1, itemKind: "message", order: 0 },
      content: "Please integrate payment processing module with Stripe and PayPal",
      contentLength: 64,
      truncated: false,
    },
    {
      type: "fact",
      itemId: "item-fact-1",
      eventId: "evt-waiting-1",
      runId: WAITING_RUN_ID,
      position: { runId: WAITING_RUN_ID, runOrder: 0, sequence: 2, itemKind: "fact", order: 0 },
      eventType: "run_waiting",
      title: "Waiting for user feedback on payment gateway choice",
    },
  ],
  runs: [
    {
      runId: WAITING_RUN_ID,
      status: "waiting",
      current: true,
      runOrder: 0,
      committedThroughSequence: 2,
    },
  ],
  window: [],
  gaps: [],
  range: {
    olderAvailable: false,
    newerAvailable: false,
  },
  stages: [],
  actionGroups: [],
};

const waitingEvents: readonly BrowserGoalEvent[] = [
  {
    type: "state_sync",
    goalId: WAITING_GOAL_ID,
    state: waitingSessionState,
  },
];

/** 等待人机交互问答的 Session 场景。 */
export const sessionWaitingScenario: FixtureScenario = {
  id: "session-waiting",
  description: "Session waiting for user to answer questions",
  workspace: {
    data: createDefaultWorkspaceContext(),
  },
  goals: {
    data: {
      goals: [
        {
          goalId: WAITING_GOAL_ID,
          runId: WAITING_RUN_ID,
          intent: "Integrate payment processing module with Stripe and PayPal",
          workflowPhase: "paused",
          runStatus: "waiting",
          updatedAt: "2026-01-01T12:00:00.000Z",
          archived: false,
        },
      ],
      unreadableCount: 0,
    },
  },
  goalSessionEnvelopes: {
    [WAITING_GOAL_ID]: { data: waitingSessionEnvelope },
  },
  goalSessionStateEnvelopes: {
    [WAITING_GOAL_ID]: { data: waitingStateEnvelope },
  },
  activities: {
    [WAITING_GOAL_ID]: { data: waitingActivityPage },
  },
  interactionDetails: {
    [`${WAITING_GOAL_ID}:${WAITING_RUN_ID}:${WAITING_INTERACTION_ID}`]: {
      data: waitingInteractionDetail,
    },
    [WAITING_GOAL_ID]: { data: waitingInteractionDetail },
  },
  events: {
    [WAITING_GOAL_ID]: { initialEvents: waitingEvents },
  },
  models: {
    data: createDefaultModelCatalog(),
  },
};

/** 带 Context 占用结算的 Session 指标场景，用于验证主行比例与可访问详情。 */
export const sessionContextMetricsScenario: FixtureScenario = {
  ...sessionWaitingScenario,
  id: "session-context-metrics",
  description: "Session metrics bar with an estimated context usage on a configured work window",
  metrics: {
    [WAITING_GOAL_ID]: {
      data: metricsSnapshot({
        usedPercent: 0.62,
        capacityTokens: 200000,
        source: "configured",
        estimated: true,
      }),
    },
  },
};

/** 已知窗口容量但尚无已结算用量的 Session 指标场景。 */
export const sessionContextUnavailableScenario: FixtureScenario = {
  ...sessionWaitingScenario,
  id: "session-context-unavailable",
  description: "Session metrics with a known window capacity and no settled usage",
  metrics: {
    [WAITING_GOAL_ID]: {
      data: metricsSnapshot(null, { capacityTokens: 1_000_000, source: "model" }),
    },
  },
};

function metricsSnapshot(
  contextUsage: SessionMetricsSnapshot["contextUsage"],
  contextCapacity: SessionMetricsSnapshot["contextCapacity"] = contextUsage === null || contextUsage === undefined
    ? null
    : { capacityTokens: contextUsage.capacityTokens, source: contextUsage.source },
): SessionMetricsSnapshot {
  return {
    goalId: WAITING_GOAL_ID,
    roundCount: 1,
    stepCount: 3,
    reportedCalls: 2,
    missingCalls: 0,
    inputTokens: 120000,
    outputTokens: 4000,
    coverage: "complete",
    cacheMeasuredCalls: 0,
    cacheExcludedCalls: 2,
    cacheHitRate: null,
    throughputMeasuredCalls: 0,
    throughputExcludedCalls: 2,
    tokensPerSecond: null,
    contextCapacity,
    contextUsage,
    runs: [],
  };
}
