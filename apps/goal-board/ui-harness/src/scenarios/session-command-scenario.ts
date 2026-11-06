import type {
  BrowserActivityItem,
  BrowserActivityPage,
  BrowserActivityRunContext,
  BrowserControlIntentCommand,
  BrowserControlReceipt,
  BrowserGoalActivityEvent,
  BrowserGoalSession,
  BrowserGoalSessionEnvelope,
  BrowserGoalSessionState,
  BrowserGoalSessionStateEnvelope,
  BrowserSessionMessage,
  BrowserRunStatus,
  BrowserSessionRun,
  BrowserSessionState,
} from "../../../../../packages/web-contracts/src/index";
import { createDefaultModelCatalog, createDefaultWorkspaceContext } from "../default-fixtures";
import type { FixtureControlContext, FixtureScenario } from "../fixture-types";

const GOAL_ID = "goal-session-command";
const INTENT = "Set up OAuth authentication for the API";
const INITIAL_RUN_ID = "run-command-1";
const SENT_RUN_ID = "run-command-2";
const ACTION_ID = "action-command-1";
const EXECUTION_UNIT_ID = "unit-command-1";
const FIXED_TIME = "2026-01-01T12:00:00.000Z";

const STREAM_CHUNKS = [
  "I checked the OAuth callback path ",
  "and rotated the client secret. ",
] as const;
const POST_TOOL_CHUNKS = [
  "The deployment checklist ",
  "is ready for review.",
] as const;
const STREAM_TEXT = `${STREAM_CHUNKS.join("")} ${POST_TOOL_CHUNKS.join("")}`;

const MODEL_START_MS = 300;
const STREAM_START_MS = 900;
const STREAM_INTERVAL_MS = 200;
const TOOL_START_MS = 1900;
const TOOL_FINISH_MS = 2600;
const POST_TOOL_STREAM_START_MS = 3000;
/** 用户消息提交后推进到终态的延迟，用于验证事件驱动刷新而不是提交后的同步重读。 */
const COMPLETION_DELAY_MS = 4200;

const initialUserMessage: BrowserSessionMessage = {
  messageId: "msg-command-user-1",
  role: "user",
  runId: INITIAL_RUN_ID,
  position: { afterSequence: 0, order: 0 },
  content: "Set up OAuth authentication for the API.",
};

const initialAssistantMessage: BrowserSessionMessage = {
  messageId: "msg-command-assistant-1",
  role: "assistant",
  runId: INITIAL_RUN_ID,
  position: { afterSequence: 1, order: 0 },
  content: "OAuth authentication is configured. Send the next instruction when ready.",
};

const sentUserMessageId = "msg-command-user-2";
const sentAssistantMessageId = "msg-command-assistant-2";

function sentAssistantMessage(): BrowserSessionMessage {
  return {
    messageId: sentAssistantMessageId,
    role: "assistant",
    runId: SENT_RUN_ID,
    position: { afterSequence: 3, order: 0 },
    content: STREAM_TEXT,
  };
}

function initialStateMessages(): BrowserSessionState["messages"]["recent"] {
  return [
    {
      messageId: initialUserMessage.messageId,
      role: "user",
      runId: INITIAL_RUN_ID,
      position: initialUserMessage.position,
      sourceKind: "user_input",
      sourceId: "input-command-1",
    },
    {
      messageId: initialAssistantMessage.messageId,
      role: "assistant",
      runId: INITIAL_RUN_ID,
      position: initialAssistantMessage.position,
      sourceKind: "model_output",
      sourceId: "call-command-1",
    },
  ];
}

function sentStateMessage(assistant: boolean): BrowserSessionState["messages"]["recent"][number] {
  return assistant
    ? {
        messageId: sentAssistantMessageId,
        role: "assistant",
        runId: SENT_RUN_ID,
        position: { afterSequence: 3, order: 0 },
        sourceKind: "model_output",
        sourceId: "call-command-2",
      }
    : {
        messageId: sentUserMessageId,
        role: "user",
        runId: SENT_RUN_ID,
        position: { afterSequence: 2, order: 0 },
        sourceKind: "user_input",
        sourceId: "input-command-2",
      };
}

function sessionMessages(sentContent: string | null, assistant: boolean): readonly BrowserSessionMessage[] {
  if (sentContent === null) return [initialUserMessage, initialAssistantMessage];
  const messages: BrowserSessionMessage[] = [
    initialUserMessage,
    initialAssistantMessage,
    {
      messageId: sentUserMessageId,
      role: "user",
      runId: SENT_RUN_ID,
      position: { afterSequence: 2, order: 0 },
      content: sentContent,
    },
  ];
  if (assistant) messages.push(sentAssistantMessage());
  return messages;
}

function activityItems(sentContent: string | null, assistant: boolean): readonly BrowserActivityItem[] {
  const items: BrowserActivityItem[] = [
    {
      type: "message",
      itemId: "item-command-user-1",
      messageId: initialUserMessage.messageId,
      role: "user",
      runId: INITIAL_RUN_ID,
      position: { runId: INITIAL_RUN_ID, runOrder: 0, sequence: 1, itemKind: "message", order: 0 },
      content: initialUserMessage.content,
      contentLength: initialUserMessage.content.length,
      truncated: false,
    },
    {
      type: "fact",
      itemId: "item-command-fact-1",
      eventId: "evt-command-1",
      runId: INITIAL_RUN_ID,
      position: { runId: INITIAL_RUN_ID, runOrder: 0, sequence: 2, itemKind: "fact", order: 0 },
      eventType: "run_completed",
      title: "OAuth authentication configured",
    },
  ];
  if (sentContent !== null) {
    items.push({
      type: "message",
      itemId: "item-command-user-2",
      messageId: sentUserMessageId,
      role: "user",
      runId: SENT_RUN_ID,
      position: { runId: SENT_RUN_ID, runOrder: 1, sequence: 1, itemKind: "message", order: 0 },
      content: sentContent,
      contentLength: sentContent.length,
      truncated: false,
    });
  }
  if (assistant) {
    items.push({
      type: "message",
      itemId: "item-command-assistant-2",
      messageId: sentAssistantMessageId,
      role: "assistant",
      runId: SENT_RUN_ID,
      position: { runId: SENT_RUN_ID, runOrder: 1, sequence: 2, itemKind: "message", order: 0 },
      content: STREAM_TEXT,
      contentLength: STREAM_TEXT.length,
      truncated: false,
    });
  }
  return items;
}

function activityPage(
  sentContent: string | null,
  runStatus: "running" | "completed",
  assistant = false,
): BrowserActivityPage {
  const items = activityItems(sentContent, assistant);
  const runs: BrowserActivityRunContext[] = [
    {
      runId: INITIAL_RUN_ID,
      status: "completed",
      current: sentContent === null,
      runOrder: 0,
      committedThroughSequence: 2,
    },
  ];
  const window = [
    {
      runId: INITIAL_RUN_ID,
      messageCount: 1,
      throughMessageId: initialUserMessage.messageId,
      committedThroughSequence: 2,
    },
  ];
  if (sentContent !== null) {
    runs.push({
      runId: SENT_RUN_ID,
      status: runStatus,
      current: true,
      runOrder: 1,
      committedThroughSequence: assistant ? 2 : 1,
    });
    window.push({
      runId: SENT_RUN_ID,
      messageCount: assistant ? 2 : 1,
      throughMessageId: assistant ? sentAssistantMessageId : sentUserMessageId,
      committedThroughSequence: assistant ? 2 : 1,
    });
  }

  return {
    goalId: GOAL_ID,
    limit: 50,
    items,
    runs,
    window,
    gaps: [],
    range: {
      first: items[0]?.position,
      last: items[items.length - 1]?.position,
      olderAvailable: false,
      newerAvailable: false,
    },
    stages: [],
    actionGroups: [],
  };
}

function goalSession(
  sentContent: string | null,
  runStatus: "running" | "completed",
  assistant: boolean,
): BrowserGoalSession {
  const runs: BrowserSessionRun[] = [
    {
      runId: INITIAL_RUN_ID,
      status: "completed",
      stepCount: 1,
      steps: [],
      current: sentContent === null,
    },
  ];
  if (sentContent !== null) {
    runs.push({
      runId: SENT_RUN_ID,
      status: runStatus,
      stepCount: assistant ? 1 : 0,
      steps: [],
      current: true,
    });
  }

  return {
    goalId: GOAL_ID,
    intent: INTENT,
    currentRunId: sentContent === null ? INITIAL_RUN_ID : SENT_RUN_ID,
    runStatus: sentContent === null ? "completed" : runStatus,
    currentRunMode: "normal",
    messages: sessionMessages(sentContent, assistant),
    runs,
    historyTruncated: false,
  };
}

function sessionState(
  sentContent: string | null,
  runStatus: "running" | "completed",
  assistant: boolean,
): BrowserSessionState {
  const recent = [...initialStateMessages()];
  if (sentContent !== null) {
    recent.push(sentStateMessage(false));
    if (assistant) recent.push(sentStateMessage(true));
  }

  return {
    goalId: GOAL_ID,
    runId: sentContent === null ? INITIAL_RUN_ID : SENT_RUN_ID,
    runStatus: sentContent === null ? "completed" : runStatus,
    mode: "normal",
    commitRevision: sentContent === null ? 1 : assistant ? 4 : 2,
    queueRevision: 1,
    queuePaused: false,
    pendingMessageCount: 0,
    pendingSteerCount: 0,
    messages: { count: recent.length, recent },
    needsRecovery: false,
    executionOwner: true,
  };
}

function sessionEnvelope(
  sentContent: string | null,
  runStatus: "running" | "completed",
  assistant: boolean,
): BrowserGoalSessionEnvelope {
  return {
    goal: goalSession(sentContent, runStatus, assistant),
    session: sessionState(sentContent, runStatus, assistant),
  };
}

function sessionStateEnvelope(
  sentContent: string | null,
  runStatus: "running" | "completed",
  assistant: boolean,
): BrowserGoalSessionStateEnvelope {
  const goal = goalSession(sentContent, runStatus, assistant);
  return {
    goal: {
      goalId: goal.goalId,
      intent: goal.intent,
      currentRunId: goal.currentRunId,
      runStatus: goal.runStatus,
      currentRunMode: goal.currentRunMode,
      currentRunStepCount: goal.runs[goal.runs.length - 1]?.stepCount ?? 0,
      history: {
        messages: { included: false, source: "activity" },
        steps: { included: false, source: "activity" },
        stages: { included: false, source: "activity" },
      },
    },
    session: sessionState(sentContent, runStatus, assistant),
  };
}

function scenarioFor(
  sentContent: string | null,
  runStatus: "running" | "completed",
  assistant: boolean,
): FixtureScenario {
  const items = activityItems(sentContent, assistant);
  const effectiveStatus = sentContent === null ? "completed" : runStatus;
  return {
    id: "session-command",
    description: "Completed session that accepts a message and advances through a committed Run",
    workspace: { data: createDefaultWorkspaceContext() },
    goals: {
      data: {
        goals: [
          {
            goalId: GOAL_ID,
            runId: sentContent === null ? INITIAL_RUN_ID : SENT_RUN_ID,
            intent: INTENT,
            workflowPhase: effectiveStatus === "completed" ? "delivered" : "executing",
            runStatus: effectiveStatus,
            updatedAt: FIXED_TIME,
            archived: false,
            execution: {
              state: effectiveStatus === "running" ? "active" : "inactive",
              committedThroughSequence: items.length,
            },
          },
        ],
        unreadableCount: 0,
      },
    },
    goalSessionEnvelopes: {
      [GOAL_ID]: { data: sessionEnvelope(sentContent, effectiveStatus, assistant) },
    },
    goalSessionStateEnvelopes: {
      [GOAL_ID]: { data: sessionStateEnvelope(sentContent, effectiveStatus, assistant) },
    },
    activities: {
      [GOAL_ID]: { data: activityPage(sentContent, effectiveStatus, assistant) },
    },
    events: {
      [GOAL_ID]: {
        initialEvents: [{
          type: "state_sync",
          goalId: GOAL_ID,
          state: sessionState(sentContent, effectiveStatus, assistant),
        }],
      },
    },
    models: {
      data: createDefaultModelCatalog(),
    },
  };
}

function acceptedMessageReceipt(command: BrowserControlIntentCommand): BrowserControlReceipt | undefined {
  if (command.kind !== "session_input") return undefined;
  return {
    intentId: command.intentId,
    status: "accepted",
    result: {
      kind: "session_input",
      result: {
        ok: true,
        existing: false,
        receipt: {
          goalId: GOAL_ID,
          inputId: command.input.inputId,
          kind: "message",
          sequence: 1,
          status: "pending",
          admittedAtRevision: 2,
          targetRunId: SENT_RUN_ID,
        },
      },
    },
  };
}

function pushActivity(context: FixtureControlContext, activity: BrowserGoalActivityEvent): void {
  context.pushEvent(GOAL_ID, { type: "activity", goalId: GOAL_ID, runId: SENT_RUN_ID, activity });
}

function hasSentMessage(scenario: FixtureScenario): boolean {
  const messages = scenario.goalSessionEnvelopes?.[GOAL_ID]?.data?.goal.messages ?? [];
  return messages.length > 2;
}

function schedule(delayMs: number, action: () => void): void {
  const timer = setTimeout(action, delayMs);
  timer.unref?.();
}

/**
 * 接受一条消息并完整播放一次 Run 工作流的 Session 场景。
 *
 * @remarks
 * 命令受理时立即提交用户消息、进入 `running` 并推送 `state_committed`，让页面读取当前状态。
 * 随后按时间推进公开事件：模型开始、正文分块、工具开始与结束，最后提交助手消息并推送终态。
 * 运行期间页面应持续显示进度与临时正文，提交内容和终态由事件驱动的定向重读到达。
 */
export const sessionCommandScenario: FixtureScenario = {
  ...scenarioFor(null, "completed", false),
  handleControl: (command, context) => {
    if (command.kind !== "session_input" || command.goalId !== GOAL_ID || command.input.kind !== "message") {
      return undefined;
    }
    if (hasSentMessage(context.getScenario())) {
      return { intentId: command.intentId, status: "rejected", error: "goal_busy", refresh: true };
    }

    const content = command.input.content;
    context.updateScenario(scenarioFor(content, "running", false));
    context.pushEvent(GOAL_ID, {
      type: "state_committed",
      goalId: GOAL_ID,
      runId: SENT_RUN_ID,
      commitRevision: 2,
      changed: ["session", "activity"],
    });

    schedule(MODEL_START_MS, () => {
      pushActivity(context, {
        kind: "model_started",
        stage: "think",
        modelCallId: "call-command-2",
        executionUnitId: EXECUTION_UNIT_ID,
        occurredAt: FIXED_TIME,
      });
    });

    let cursor = 0;
    for (const [index, chunk] of STREAM_CHUNKS.entries()) {
      schedule(STREAM_START_MS + index * STREAM_INTERVAL_MS, () => {
        cursor += 1;
        pushActivity(context, {
          kind: "assistant_text_delta",
          text: chunk,
          truncated: false,
          sourceEventId: "evt-command-stream",
          sourceCursor: cursor,
        });
      });
    }

    schedule(TOOL_START_MS, () => {
      pushActivity(context, {
        kind: "tool_started",
        sourceEventId: "evt-command-tool",
        sourceCursor: 1,
        actionId: ACTION_ID,
        executionUnitId: EXECUTION_UNIT_ID,
        toolId: "shell",
        inputSummary: "Checking the OAuth callback signature",
      });
    });

    schedule(TOOL_FINISH_MS, () => {
      pushActivity(context, {
        kind: "tool_finished",
        sourceEventId: "evt-command-tool",
        sourceCursor: 2,
        actionId: ACTION_ID,
        toolId: "shell",
        outcome: "success",
        summary: "Callback signature validated",
      });
    });

    for (const [index, chunk] of POST_TOOL_CHUNKS.entries()) {
      schedule(POST_TOOL_STREAM_START_MS + index * STREAM_INTERVAL_MS, () => {
        pushActivity(context, {
          kind: "assistant_text_delta",
          text: chunk,
          truncated: false,
          sourceEventId: "evt-command-stream-2",
          sourceCursor: index + 1,
        });
      });
    }

    schedule(COMPLETION_DELAY_MS, () => {
      context.updateScenario(scenarioFor(content, "completed", true));
      context.pushEvent(GOAL_ID, {
        type: "message_committed",
        goalId: GOAL_ID,
        runId: SENT_RUN_ID,
        message: {
          messageId: sentAssistantMessageId,
          role: "assistant",
          runId: SENT_RUN_ID,
          position: { afterSequence: 3, order: 0 },
          commitRevision: 4,
        },
      });
      context.pushEvent(GOAL_ID, {
        type: "state_committed",
        goalId: GOAL_ID,
        runId: SENT_RUN_ID,
        commitRevision: 4,
        changed: ["session", "activity"],
      });
    });

    return acceptedMessageReceipt(command);
  },
};
