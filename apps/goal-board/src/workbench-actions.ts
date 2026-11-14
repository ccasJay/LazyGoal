import type { BrowserGoalSessionState } from "../../../packages/web-contracts/src/index";
import type { ControlIntentState } from "./control/types";

/** 工作台动作的稳定身份。 */
export type WorkbenchActionId = "send_message" | "steer" | "stop" | "resume";

/** 动作在界面上的分组。 */
export type WorkbenchActionGroup = "message" | "run";

/**
 * 动作不可用的稳定原因。
 *
 * @remarks
 * 原因用于解释当前渲染为什么禁用动作，不是授权判断。执行入口仍必须按控制协议
 * 重新校验目标、Run、连接与在途命令。
 */
export type WorkbenchUnavailableReason =
  | "no-goal-selected"
  | "session-unreadable"
  | "command-in-flight"
  | "connection-reconnecting"
  | "state-stale"
  | "send-unavailable"
  | "run-not-running"
  | "interaction-pending"
  | "stop-in-progress"
  | "recovery-unavailable";

/**
 * 一个动作在本次渲染中的可用性。
 *
 * @remarks
 * `available: true` 只表示渲染时没有已知阻断条件，不代表已授权；不可用分支必须
 * 携带原因，供界面展示与测试断言。
 *
 * @example
 * ```ts
 * const action: WorkbenchAction = { id: "stop", label: "Pause Run", group: "run", available: false, reason: "command-in-flight" };
 * ```
 */
export type WorkbenchAction =
  | {
      readonly id: WorkbenchActionId;
      readonly label: string;
      readonly group: WorkbenchActionGroup;
      readonly available: true;
    }
  | {
      readonly id: WorkbenchActionId;
      readonly label: string;
      readonly group: WorkbenchActionGroup;
      readonly available: false;
      readonly reason: WorkbenchUnavailableReason;
    };

/** 按稳定身份索引的动作集合。 */
export type WorkbenchActions = Readonly<Record<WorkbenchActionId, WorkbenchAction>>;

/**
 * 派生动作可用性所需的当前事实。
 *
 * @remarks
 * `connected` 与 `stale` 来自连接观察，`busy` 来自在途控制意图，`sessionUnreadable`
 * 表示会话读取失败。派生只读这些值，不缓存结果，也不修改任何控制状态。
 *
 * @example
 * ```ts
 * const actions = selectWorkbenchActions({
 *   session, busy: false, connected: true, stale: false,
 *   sessionUnreadable: false, canSendText: true, stopping: false,
 * });
 * ```
 */
export interface WorkbenchActionContext {
  /** 当前选中的 Goal 会话；未选择 Goal 时为 `null`。 */
  readonly session: BrowserGoalSessionState | null;
  /** 是否有尚未结算的控制意图。 */
  readonly busy: boolean;
  /** 观察连接是否仍然建立。 */
  readonly connected: boolean;
  /** 最后确认的状态是否可能过期。 */
  readonly stale: boolean;
  /** 当前会话是否读取失败。 */
  readonly sessionUnreadable: boolean;
  /** 当前状态是否允许发送文本。 */
  readonly canSendText: boolean;
  /** 当前 Run 是否已受理停止请求。 */
  readonly stopping: boolean;
}

/**
 * 派生当前可用的工作台动作。
 *
 * @remarks
 * 需要最新状态的新决定在连接重建或状态过期时不可用；停止既有 Run 属于安全操作，
 * 不受这两项限制。返回结果只描述本次渲染，不构成授权。
 *
 * @param context - 当前会话、连接与在途命令事实。
 * @returns 按身份索引的四个动作。
 * @example
 * ```ts
 * const actions = selectWorkbenchActions(context);
 * if (!actions.steer.available) console.log(workbenchReasonText(actions.steer.reason));
 * ```
 */
export function selectWorkbenchActions(context: WorkbenchActionContext): WorkbenchActions {
  const liveReason = liveStateReason(context);
  const runStatus = context.session?.runStatus;
  const interruption = context.session?.interruption;
  return {
    send_message: action("send_message", "Send message", "message",
      liveReason ?? (context.canSendText ? undefined : "send-unavailable")),
    steer: action("steer", "Steer", "run",
      liveReason
      ?? (runStatus !== "running" ? "run-not-running"
        : interruption !== undefined && interruption.status !== "finished" ? "interaction-pending"
          : undefined)),
    stop: action("stop", "Pause Run", "run",
      sharedReason(context)
      ?? (runStatus !== "running" && runStatus !== "waiting" ? "run-not-running"
        : context.stopping ? "stop-in-progress" : undefined)),
    resume: action("resume", "Resume Run", "run",
      liveReason
      ?? (context.session?.execution?.state === "recoverable" ? undefined : "recovery-unavailable")),
  };
}

/**
 * 把稳定原因转换成用户可见说明。
 *
 * @param reason - 不可用原因。
 * @returns 英文说明，用于按钮标题或可访问描述。
 * @example
 * ```ts
 * workbenchReasonText("state-stale"); // "State may be out of date until the next sync."
 * ```
 */
export function workbenchReasonText(reason: WorkbenchUnavailableReason): string {
  switch (reason) {
    case "no-goal-selected": return "Select a Goal first.";
    case "session-unreadable": return "Reload this Goal before changing it.";
    case "command-in-flight": return "Wait for the current command to finish.";
    case "connection-reconnecting": return "Reconnecting to the local service.";
    case "state-stale": return "State may be out of date until the next sync.";
    case "send-unavailable": return "This Goal cannot accept a message in its current state.";
    case "run-not-running": return "This action needs a running Run.";
    case "interaction-pending": return "Finish the current stop request first.";
    case "stop-in-progress": return "This Run is already stopping.";
    case "recovery-unavailable": return "This Run is not recoverable in this process.";
  }
}

/**
 * 一条结果不明、需要按原身份核验的动作提交。
 *
 * @remarks
 * `intentId` 是原提交身份；核验、重试与放弃都必须沿用它，不得生成新身份。
 *
 * @example
 * ```ts
 * const unresolved: UnverifiedWorkbenchAction = { intentId: "intent-1", actionId: "stop", label: "Pause Run" };
 * ```
 */
export interface UnverifiedWorkbenchAction {
  /** 原控制意图身份。 */
  readonly intentId: string;
  /** 对应的动作身份。 */
  readonly actionId: WorkbenchActionId;
  /** 展示名称。 */
  readonly label: string;
}

/**
 * 把未结算的控制意图投影为结果不明的动作。
 *
 * @remarks
 * 只投影 `unknown` 阶段且属于工作台动作的会话输入；应答、队列控制与其他命令由各自
 * 所有者展示。返回顺序沿用意图提交顺序。
 *
 * @param intents - 当前控制意图列表。
 * @returns 结果不明的动作列表；没有时为数组。
 * @example
 * ```ts
 * const unresolved = selectUnverifiedWorkbenchActions(state.intents);
 * ```
 */
export function selectUnverifiedWorkbenchActions(
  intents: readonly ControlIntentState[],
): readonly UnverifiedWorkbenchAction[] {
  const unresolved: UnverifiedWorkbenchAction[] = [];
  for (const entry of intents) {
    if (entry.phase !== "unknown" || entry.intent.kind !== "session_input") continue;
    const mapped = unverifiedActionOf(entry.intent.input.kind);
    if (mapped !== undefined) unresolved.push({ intentId: entry.intent.intentId, ...mapped });
  }
  return unresolved;
}

function unverifiedActionOf(
  kind: "message" | "steer" | "interrupt" | "respond" | "resume" | "queue_control" | "compact",
): { readonly actionId: WorkbenchActionId; readonly label: string } | undefined {
  switch (kind) {
    case "message": return { actionId: "send_message", label: "Message" };
    case "steer": return { actionId: "steer", label: "Steer" };
    case "interrupt": return { actionId: "stop", label: "Pause Run" };
    case "resume": return { actionId: "resume", label: "Resume Run" };
    default: return undefined;
  }
}

function action(
  id: WorkbenchActionId,
  label: string,
  group: WorkbenchActionGroup,
  reason: WorkbenchUnavailableReason | undefined,
): WorkbenchAction {
  return reason === undefined ? { id, label, group, available: true } : { id, label, group, available: false, reason };
}

function sharedReason(context: WorkbenchActionContext): WorkbenchUnavailableReason | undefined {
  if (context.session === null) return "no-goal-selected";
  if (context.sessionUnreadable) return "session-unreadable";
  return context.busy ? "command-in-flight" : undefined;
}

function liveStateReason(context: WorkbenchActionContext): WorkbenchUnavailableReason | undefined {
  const shared = sharedReason(context);
  if (shared !== undefined) return shared;
  if (!context.connected) return "connection-reconnecting";
  return context.stale ? "state-stale" : undefined;
}
