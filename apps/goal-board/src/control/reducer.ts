import type {
  BrowserControlIntentCommand,
  BrowserControlReceipt,
  BrowserControlScope,
  BrowserControlSnapshot,
  BrowserGoalEvent,
  BrowserSessionInputOutcome,
} from "../../../../packages/web-contracts/src/index";
import type { ControlConnection, ControlIntentState, ControlResources, ControlState } from "./types";
import { applyToolActivityEvent } from "./tool-activity";

const MAX_CONTROL_INTENTS = 64;
const DISCONNECTED: ControlConnection = {
  connected: false, synced: false, stale: false, syncRevision: null, staleScopes: [],
};

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
    view: null,
    snapshot: null,
    requiredSessionRevision: 0,
    intents: [],
    toolActivities: [],
    resources: {},
    connection: DISCONNECTED,
  };
}

/** 切换所观察的 Goal。控制意图与独立资源继续保留，旧视图身份失效。 */
export function selectControlGoal(state: ControlState, goalId: string | null): ControlState {
  if ((state.view?.goalId ?? null) === goalId) return state;
  return {
    ...state,
    view: goalId === null ? null : { goalId },
    snapshot: null,
    requiredSessionRevision: 0,
    toolActivities: [],
    connection: DISCONNECTED,
  };
}

/** 断开当前 SSE 连接，保留最后确认的内容。 */
export function disconnectControlStream(state: ControlState): ControlState {
  return {
    ...state,
    connection: { ...state.connection, connected: false, synced: false, stale: true, syncRevision: null },
  };
}

/** 接纳当前视图的完整控制投影。返回原状态表示投影无法用于确认状态。 */
export function acceptControlSnapshot(state: ControlState, snapshot: BrowserControlSnapshot): ControlState {
  const { goal, session } = snapshot;
  const current = state.snapshot?.session;
  if (state.view?.goalId !== goal.goalId || session.goalId !== goal.goalId
    || session.runId !== goal.currentRunId
    || (current?.commitRevision === session.commitRevision && current.runId !== session.runId)
    || session.commitRevision < Math.max(state.requiredSessionRevision, current?.commitRevision ?? 0, state.connection.syncRevision ?? 0)) return state;
  const { connection } = state;
  const synced = connection.connected && connection.syncRevision !== null
    && session.commitRevision >= connection.syncRevision;
  return {
    ...state,
    snapshot,
    intents: reconcileIntents(state.intents, snapshot),
    toolActivities: state.snapshot?.session.runId === session.runId ? state.toolActivities : [],
    connection: {
      ...connection,
      synced,
      stale: synced ? false : connection.stale,
      staleScopes: connection.staleScopes.filter((scope) => scope !== "session"),
    },
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
  const interaction = state.snapshot?.goal.interaction;
  const entry: ControlIntentState = {
    intent,
    phase: "pending",
    ...(intent.kind === "action_review" && state.view !== null && interaction?.actionId === intent.actionId
      && interaction.runId === intent.runId && interaction.goalId === intent.goalId
      ? { reviewTarget: { view: state.view, interactionId: interaction.interactionId } } : {}),
  };
  const intents = [...state.intents, entry];
  return { ...state, intents: intents.slice(-MAX_CONTROL_INTENTS) };
}

/**
 * 取指定种类的待处理意图。
 *
 * @remarks
 * 用于从唯一控制状态派生按钮忙碌态，避免钩子各自保存 busy 标记。
 *
 * @param state - 当前控制状态。
 * @param kind - 意图种类。
 * @returns 该种类的第一条待处理意图；没有时返回 `undefined`。
 * @example
 * ```ts
 * const pending = pendingIntentOfKind(state, "exemption_revoke");
 * ```
 */
export function pendingIntentOfKind<K extends BrowserControlIntentCommand["kind"]>(
  state: ControlState,
  kind: K,
): Extract<BrowserControlIntentCommand, { readonly kind: K }> | undefined {
  const entry = state.intents.find((candidate) => candidate.phase === "pending" && candidate.intent.kind === kind);
  if (entry === undefined || entry.intent.kind !== kind) return undefined;
  return entry.intent as Extract<BrowserControlIntentCommand, { readonly kind: K }>;
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
 * 移除一条不再等待核验的意图。
 *
 * @remarks
 * 只清除本客户端展示状态；不撤回服务端已受理的输入，也不改变任何 Runtime 事实。
 *
 * @param state - 当前控制状态。
 * @param intentId - 要移除的意图身份。
 * @returns 移除后的状态；未知身份时原样返回。
 * @example
 * ```ts
 * const next = discardControlIntent(state, intentId);
 * ```
 */
export function discardControlIntent(state: ControlState, intentId: string): ControlState {
  const intents = state.intents.filter((entry) => entry.intent.intentId !== intentId);
  return intents.length === state.intents.length ? state : { ...state, intents };
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
  if (state.view?.goalId !== event.goalId) return state;
  switch (event.type) {
    case "state_sync":
      return applyStateSync(state, event);
    case "input_result":
      return applyInputOutcome(state, event.outcome);
    case "state_committed":
      return invalidateCommittedScopes(state, event.changed, event.commitRevision);
    case "run_status_changed":
    case "run_result":
      if (state.snapshot?.session.runId !== event.runId) return state;
      return event.commitRevision === undefined
        ? markControlScopesStale(state, ["session"])
        : invalidateCommittedScopes(state, ["session"], event.commitRevision);
    case "interaction_opened":
      return state.snapshot?.session.runId === event.runId ? markControlScopesStale(state, ["session"]) : state;
    case "interaction_settled":
      return state.snapshot?.session.runId === event.runId
        && state.snapshot.goal.interaction?.interactionId === event.interactionId
        ? markControlScopesStale(state, ["session"]) : state;
    case "tool_activity":
      return state.snapshot?.session.runId === event.runId
        ? { ...state, toolActivities: applyToolActivityEvent(state.toolActivities, event.activity) } : state;
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
      return disconnectControlStream(state);
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
  const staleScopes = state.connection.staleScopes.filter((scope) => scope === "session" || !scopes.includes(scope));
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
 * const next = mergeControlResources(state, { exemptions: [] });
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
      ...(patch.exemptions === undefined ? {} : { exemptions: patch.exemptions }),
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

function applyStateSync(
  state: ControlState,
  event: Extract<BrowserGoalEvent, { readonly type: "state_sync" }>,
): ControlState {
  if (event.state.goalId !== event.goalId) return state;
  const revision = event.state.commitRevision;
  const current = state.snapshot?.session.commitRevision ?? 0;
  if (state.connection.synced && revision < current) return state;
  const syncRevision = Math.max(state.connection.syncRevision ?? 0, revision);
  const connecting = {
    ...state,
    connection: { ...state.connection, connected: true, synced: false, syncRevision },
  };
  if (event.snapshot?.session.commitRevision === revision && event.snapshot.session.runId === event.state.runId) {
    const next = acceptControlSnapshot(connecting, event.snapshot);
    if (next !== connecting) return next;
  }
  return markControlScopesStale(connecting, ["session"]);
}

function invalidateCommittedScopes(
  state: ControlState,
  scopes: readonly BrowserControlScope[],
  revision: number,
): ControlState {
  if (revision <= (state.snapshot?.session.commitRevision ?? -1)) {
    return markControlScopesStale(state, scopes.filter((scope) => scope !== "session"));
  }
  const stale = markControlScopesStale(state, scopes);
  return scopes.includes("session") && revision > stale.requiredSessionRevision
    ? { ...stale, requiredSessionRevision: revision }
    : stale;
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
    if (entry.intent.kind === "session_input" && entry.intent.goalId === snapshot.goal.goalId) {
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
    (entry) => entry.intent.kind === "session_input" && entry.intent.goalId === outcome.goalId
      && entry.intent.input.inputId === outcome.inputId,
  );
  if (index < 0) return state;
  const entry = state.intents[index]!;
  if (entry.phase === "applied" || entry.phase === "rejected") return state;
  const phase: ControlIntentState["phase"] = outcome.ok
    ? outcome.receipt?.status === "applied" ? "applied" : "accepted"
    : "rejected";
  return replaceIntent(state, index, { ...entry, phase });
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
