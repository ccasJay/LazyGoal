import type {
  BrowserControlEvent,
  BrowserControlIntentCommand,
  BrowserControlReceipt,
  BrowserControlScope,
  BrowserControlSnapshot,
  BrowserGoalEvent,
  BrowserRunStatus,
  BrowserSessionInputOutcome,
} from "../../../../packages/web-contracts/src/index";
import type { ControlIntentState, ControlResources, ControlState } from "./types";
import { applyToolActivityEvent } from "./tool-activity";

const MAX_CONTROL_INTENTS = 64;

/**
 * 创建尚未同步的控制状态。
 *
 * @returns 无快照、无意图、无资源投影且未连接的初始状态。
 * @example
 * ```ts
 * const state = createControlState();
 * ```
 */
export function createControlState(): ControlState {
  return {
    snapshot: null,
    intents: [],
    toolActivities: [],
    resources: {},
    connection: { connected: false, synced: false, staleScopes: [] },
  };
}

/**
 * 登记一条新的控制意图。
 *
 * @remarks
 * 同一 `intentId` 只保留首次登记的冻结载荷；重复登记（包括携带不同载荷）不会
 * 改写原意图或重置其生命周期。载荷冲突由命令入口在提交前拒绝。
 *
 * @param state - 当前控制状态。
 * @param intent - 待提交的控制意图。
 * @returns 追加意图后的状态，或原状态。
 * @example
 * ```ts
 * const next = beginControlIntent(state, intent);
 * ```
 */
export function beginControlIntent(state: ControlState, intent: BrowserControlIntentCommand): ControlState {
  if (state.intents.some((entry) => entry.intent.intentId === intent.intentId)) return state;
  const intents = [...state.intents, { intent, phase: "pending" as const }];
  return { ...state, intents: intents.slice(-MAX_CONTROL_INTENTS) };
}

/**
 * 用受理收据结算意图。
 *
 * @remarks
 * 同步提交类命令在 `accepted`／`existing` 时直接进入 `applied`；`create_session`、
 * `session_input` 与只读 `action_review` 停在 `accepted`，等待应用事实。未知收据
 * 只进入 `unknown`，不得当作成功。
 *
 * @param state - 当前控制状态。
 * @param receipt - 命令入口返回的受理收据。
 * @returns 更新后的状态；未知意图身份时原样返回。
 * @example
 * ```ts
 * const next = settleControlIntent(state, receipt);
 * ```
 */
export function settleControlIntent(state: ControlState, receipt: BrowserControlReceipt): ControlState {
  const index = state.intents.findIndex((entry) => entry.intent.intentId === receipt.intentId);
  if (index < 0) return state;
  const entry = state.intents[index]!;
  return replaceIntent(state, index, {
    ...entry,
    phase: phaseAfterReceipt(entry.intent, receipt),
    receipt,
  });
}

/**
 * 记录一次未知结果的核验结论。
 *
 * @remarks
 * `applied` 结算为成功；`not_applied` 与 `unknown` 保持可核验状态，页面可继续
 * 等待或用原身份重试。本函数不发起请求，也不改写冻结载荷。
 *
 * @param state - 当前控制状态。
 * @param intentId - 被核验的意图身份。
 * @param verification - 核验结论。
 * @returns 更新后的状态；未知意图身份时原样返回。
 * @example
 * ```ts
 * const next = verifyControlIntent(state, intentId, "applied");
 * ```
 */
export function verifyControlIntent(
  state: ControlState,
  intentId: string,
  verification: "applied" | "not_applied" | "unknown",
): ControlState {
  const index = state.intents.findIndex((entry) => entry.intent.intentId === intentId);
  if (index < 0) return state;
  const entry = state.intents[index]!;
  return replaceIntent(state, index, {
    ...entry,
    phase: verification === "applied" ? "applied" : "unknown",
    verification,
  });
}

/**
 * 应用一条 Goal 控制事件。
 *
 * @remarks
 * 只处理控制事实；生成正文、正式消息与候选内容保持既有内容路径。低修订
 * `state_sync` 不覆盖更高修订的已确认快照，重复或乱序事件按稳定身份与作用域去重。
 *
 * @param state - 当前控制状态。
 * @param event - Goal SSE 事件。
 * @returns 更新后的状态；内容事件原样返回。
 * @example
 * ```ts
 * const next = applyControlEvent(state, event);
 * ```
 */
export function applyControlEvent(state: ControlState, event: BrowserGoalEvent): ControlState {
  switch (event.type) {
    case "state_sync":
      return applyStateSync(state, event.snapshot);
    case "input_result":
      return applyInputOutcome(state, event.outcome);
    case "state_committed":
      return markControlScopesStale(state, event.changed);
    case "run_status_changed":
      return applyRunStatus(state, event.runId, event.status);
    case "run_result":
      return applyRunStatus(state, event.runId, event.result);
    case "interaction_opened":
      return applyInteractionOpened(state, event);
    case "interaction_settled":
      return applyInteractionSettled(state, event);
    case "tool_activity":
      return { ...state, toolActivities: applyToolActivityEvent(state.toolActivities, event.activity) };
    case "stream_fault":
      return {
        ...state,
        connection: {
          ...state.connection,
          connected: true,
          staleScopes: unionScopes(state.connection.staleScopes, event.resync),
        },
      };
    case "closed":
      return { ...state, connection: { ...state.connection, connected: false, synced: false } };
    default:
      return state;
  }
}

/**
 * 标记作用域已重新读取。
 *
 * @param state - 当前控制状态。
 * @param scopes - 已完成定向读取的作用域。
 * @returns 从失效集合移除这些作用域后的状态。
 * @example
 * ```ts
 * const next = markControlScopesFresh(state, ["activity"]);
 * ```
 */
export function markControlScopesFresh(
  state: ControlState,
  scopes: readonly BrowserControlScope[],
): ControlState {
  const staleScopes = state.connection.staleScopes.filter((scope) => !scopes.includes(scope));
  return staleScopes.length === state.connection.staleScopes.length
    ? state
    : { ...state, connection: { ...state.connection, staleScopes } };
}

/**
 * 合并独立资源投影。
 *
 * @param state - 当前控制状态。
 * @param patch - 已重新读取的资源；省略字段保持原值。
 * @returns 更新资源后的状态。
 * @example
 * ```ts
 * const next = mergeControlResources(state, { grants: [] });
 * ```
 */
export function mergeControlResources(
  state: ControlState,
  patch: Partial<ControlResources>,
): ControlState {
  return {
    ...state,
    resources: {
      ...state.resources,
      ...(patch.goals === undefined ? {} : { goals: patch.goals }),
      ...(patch.grants === undefined ? {} : { grants: patch.grants }),
      ...(patch.permission === undefined ? {} : { permission: patch.permission }),
      ...(patch.model === undefined ? {} : { model: patch.model }),
    },
  };
}

function replaceIntent(state: ControlState, index: number, entry: ControlIntentState): ControlState {
  const intents = [...state.intents];
  intents[index] = entry;
  return { ...state, intents };
}

function phaseAfterReceipt(
  intent: BrowserControlIntentCommand,
  receipt: BrowserControlReceipt,
): ControlIntentState["phase"] {
  if (receipt.status === "unknown") return "unknown";
  if (receipt.status === "rejected") return "rejected";
  return intent.kind === "create_session" || intent.kind === "session_input" || intent.kind === "action_review"
    ? "accepted"
    : "applied";
}

function applyStateSync(state: ControlState, snapshot: BrowserControlSnapshot | undefined): ControlState {
  if (snapshot === undefined) {
    return {
      ...state,
      connection: {
        connected: true,
        synced: state.snapshot !== null,
        staleScopes: unionScopes(
          state.connection.staleScopes.filter((scope) => scope !== "session"),
          ["session"],
        ),
      },
    };
  }
  const current = state.snapshot;
  const stale = current !== null && snapshot.session.commitRevision < current.session.commitRevision;
  const nextSnapshot = stale ? current : snapshot;
  return {
    ...state,
    snapshot: nextSnapshot,
    intents: reconcileIntents(state.intents, nextSnapshot),
    connection: {
      connected: true,
      synced: true,
      staleScopes: state.connection.staleScopes.filter((scope) => scope !== "session"),
    },
  };
}

function reconcileIntents(
  intents: readonly ControlIntentState[],
  snapshot: BrowserControlSnapshot,
): readonly ControlIntentState[] {
  return intents.map((entry) => {
    if (entry.phase !== "accepted") return entry;
    if (entry.intent.kind === "create_session" && entry.intent.goalId === snapshot.goal.goalId) {
      return { ...entry, phase: "applied" };
    }
    if (entry.intent.kind === "session_input") {
      const inputId = entry.intent.input.inputId;
      const pending = snapshot.goal.pendingMessages?.some((message) => message.inputId === inputId) === true
        || snapshot.goal.pendingSteers?.some((steer) => steer.messageId === inputId) === true;
      if (pending) return entry;
      const applied = snapshot.session.messages.recent.some(
        (message) => message.sourceKind === "user_input" && message.sourceId === inputId,
      );
      if (applied) return { ...entry, phase: "applied" };
    }
    return entry;
  });
}

function applyInputOutcome(state: ControlState, outcome: BrowserSessionInputOutcome): ControlState {
  const index = state.intents.findIndex(
    (entry) => entry.intent.kind === "session_input" && entry.intent.input.inputId === outcome.inputId,
  );
  if (index < 0) return state;
  const entry = state.intents[index]!;
  if (entry.phase === "applied" || entry.phase === "rejected") return state;
  const phase: ControlIntentState["phase"] = outcome.ok
    ? outcome.receipt?.status === "applied" ? "applied" : "accepted"
    : "rejected";
  return replaceIntent(state, index, { ...entry, phase });
}

function applyRunStatus(
  state: ControlState,
  runId: string,
  status: BrowserRunStatus,
): ControlState {
  if (state.snapshot === null || state.snapshot.session.runId !== runId) return state;
  return {
    ...state,
    snapshot: {
      goal: { ...state.snapshot.goal, runStatus: status },
      session: { ...state.snapshot.session, runStatus: status },
    },
  };
}

function applyInteractionOpened(
  state: ControlState,
  event: Extract<BrowserControlEvent, { readonly type: "interaction_opened" }>,
): ControlState {
  if (state.snapshot === null || state.snapshot.session.runId !== event.runId) return state;
  return {
    ...state,
    snapshot: {
      ...state.snapshot,
      session: {
        ...state.snapshot.session,
        waitingFor: waitingForOf(event.kind),
        interaction: {
          interactionId: event.interactionId,
          kind: event.kind,
          runId: event.runId,
        },
      },
    },
  };
}

function applyInteractionSettled(
  state: ControlState,
  event: Extract<BrowserControlEvent, { readonly type: "interaction_settled" }>,
): ControlState {
  if (state.snapshot === null) return state;
  const { session, goal } = state.snapshot;
  const settledSession = session.interaction?.interactionId === event.interactionId;
  const settledGoal = goal.interaction?.interactionId === event.interactionId;
  if (!settledSession && !settledGoal) return state;
  const { interaction: _goalInteraction, ...goalRest } = goal;
  const { interaction: _sessionInteraction, waitingFor: _waitingFor, ...sessionRest } = session;
  return {
    ...state,
    snapshot: {
      goal: settledGoal ? goalRest : goal,
      session: settledSession ? sessionRest : session,
    },
  };
}

function waitingForOf(
  kind: Extract<BrowserControlEvent, { readonly type: "interaction_opened" }>["kind"],
): NonNullable<NonNullable<ControlState["snapshot"]>["session"]["waitingFor"]> {
  return kind === "question" ? "ask_user" : kind;
}

function markControlScopesStale(
  state: ControlState,
  scopes: readonly BrowserControlScope[],
): ControlState {
  const staleScopes = unionScopes(state.connection.staleScopes, scopes);
  return staleScopes.length === state.connection.staleScopes.length
    ? state
    : { ...state, connection: { ...state.connection, staleScopes } };
}

function unionScopes(
  current: readonly BrowserControlScope[],
  added: readonly BrowserControlScope[],
): readonly BrowserControlScope[] {
  const scopes = new Set(current);
  for (const scope of added) scopes.add(scope);
  return scopes.size === current.length ? current : [...scopes];
}
