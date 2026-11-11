import type {
  BrowserActionReview,
  BrowserControlIntentCommand,
  BrowserControlReceipt,
  BrowserControlSnapshot,
  BrowserGoalEvent,
  BrowserPendingAction,
  BrowserSessionInputReceipt,
} from "../../../packages/web-contracts/src/index";
import { applyControlEvent, createControlState, selectControlGoal, type ControlState } from "../src/control/reducer";

export function sessionState(revision: number): BrowserControlSnapshot["session"] {
  return {
    goalId: "goal-1",
    runId: "run-1",
    runStatus: "waiting",
    mode: "normal",
    commitRevision: revision,
    queueRevision: 0,
    queuePaused: false,
    pendingMessageCount: 0,
    pendingSteerCount: 0,
    needsRecovery: false,
    executionOwner: true,
    messages: { count: 0, recent: [] },
  };
}

export function controlSnapshot(
  options: {
    readonly pendingAction?: BrowserPendingAction;
    readonly interactionRequestId?: string;
    readonly interactionActionId?: string;
    readonly revision?: number;
  } = {},
): BrowserControlSnapshot {
  const session = sessionState(options.revision ?? 1);
  return {
    goal: {
      goalId: "goal-1",
      intent: "验证控制状态",
      currentRunId: "run-1",
      runStatus: "waiting",
      currentRunMode: "normal",
      currentRunStepCount: 1,
      history: {
        messages: { included: false, source: "activity" },
        steps: { included: false, source: "activity" },
        stages: { included: false, source: "activity" },
      },
      ...(options.pendingAction === undefined ? {} : { pendingAction: options.pendingAction }),
      ...(options.interactionRequestId === undefined || options.interactionActionId === undefined ? {} : {
        interaction: {
          goalId: "goal-1",
          runId: "run-1",
          kind: "action_approval" as const,
          interactionId: `action_approval:${options.interactionRequestId}`,
          requestId: options.interactionRequestId,
          actionId: options.interactionActionId,
          decisions: ["approve_action" as const, "reject_action" as const],
          truncated: false,
        },
      }),
    },
    session: options.interactionRequestId === undefined || options.interactionActionId === undefined
      ? session
      : {
          ...session,
          waitingFor: "action_approval",
          interaction: {
            interactionId: `action_approval:${options.interactionRequestId}`,
            kind: "action_approval",
            runId: "run-1",
            requestId: options.interactionRequestId,
            actionId: options.interactionActionId,
          },
        },
  };
}

export function pendingAction(actionId: string): BrowserPendingAction {
  return {
    actionId,
    toolId: "write_file",
    status: "awaiting_approval",
    inputPreview: "{\"path\":\"a.ts\"}",
    inputPreviewTruncated: false,
  };
}

export function stateWith(snapshot: BrowserControlSnapshot): ControlState {
  return applyControlEvent(selectControlGoal(createControlState(), snapshot.goal.goalId), {
    type: "state_sync",
    goalId: snapshot.goal.goalId,
    state: snapshot.session,
    snapshot,
  } satisfies BrowserGoalEvent);
}

export function reviewFor(actionId: string, reviewRef: string): BrowserActionReview {
  return {
    actionId,
    toolId: "write_file",
    originalInput: { path: "a.ts" },
    finalInput: { path: "a.ts" },
    changed: false,
    scope: "action",
    availableScopes: ["action", "goal", "workspace"],
    capability: { network: "none", extraFiles: [], targetPaths: ["a.ts"] },
    requiresSandboxApproval: false,
    reviewRef,
  };
}

export function actionReviewIntent(intentId: string, actionId: string): BrowserControlIntentCommand {
  return { kind: "action_review", intentId, goalId: "goal-1", runId: "run-1", actionId };
}

export function respondIntent(intentId: string, inputId: string, requestId: string): BrowserControlIntentCommand {
  return {
    kind: "session_input",
    intentId,
    goalId: "goal-1",
    input: {
      kind: "respond",
      inputId,
      runId: "run-1",
      requestId,
      response: { kind: "approve_action", actionId: "action-1", scope: "action" },
    },
  };
}

export function inputReceipt(inputId: string): BrowserSessionInputReceipt {
  return {
    goalId: "goal-1",
    inputId,
    kind: "respond",
    sequence: 1,
    status: "pending",
    admittedAtRevision: 1,
  };
}

export function acceptedReview(intentId: string, review: BrowserActionReview): BrowserControlReceipt {
  return {
    intentId,
    status: "accepted",
    result: { kind: "action_review", result: { ok: true, goalId: "goal-1", runId: "run-1", review } },
  };
}

export function acceptedInput(intentId: string, inputId: string): BrowserControlReceipt {
  return {
    intentId,
    status: "accepted",
    result: { kind: "session_input", result: { ok: true, existing: false, receipt: inputReceipt(inputId) } },
  };
}

export function appliedInputEvent(inputId: string): BrowserGoalEvent {
  return {
    type: "input_result",
    goalId: "goal-1",
    outcome: {
      goalId: "goal-1",
      inputId,
      kind: "respond",
      ok: true,
      receipt: { ...inputReceipt(inputId), status: "applied" },
    },
  };
}
