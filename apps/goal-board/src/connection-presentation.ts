/**
 * 连接展示状态。
 *
 * @remarks
 * `linked` 表示已建立连接并收到权威同步；`reconnecting` 表示连接中断或尚未完成首次
 * 同步；`stale` 表示连接仍在但最后确认的状态可能过期。三者都不能表示 Run 失败或完成。
 */
export type ConnectionState = "linked" | "reconnecting" | "stale";

/**
 * 一次渲染使用的连接展示投影。
 *
 * @remarks
 * 所有界面共用这一份结论：断线或过期时保留最后已知内容，但依赖最新状态的新决定不可用。
 *
 * @example
 * ```ts
 * const connection = selectConnectionPresentation({ connected: true, synced: true, stale: false });
 * connection.label; // "Connected"
 * ```
 */
export interface ConnectionPresentation {
  /** 当前连接展示状态。 */
  readonly state: ConnectionState;
  /** 用户可见的简短说明。 */
  readonly label: string;
  /** 是否允许依赖最新状态的新决定。 */
  readonly allowsNewDecisions: boolean;
  /** 最后确认的状态是否可能已经过期。 */
  readonly isOutdated: boolean;
  /** 非 `linked` 状态仍展示最后确认的内容。 */
  readonly retainsLastKnown: true;
}

/** 派生连接展示所需的事实。 */
export interface ConnectionFacts {
  /** 观察连接是否仍然建立。 */
  readonly connected: boolean;
  /** 本次连接是否已收到权威同步。 */
  readonly synced: boolean;
  /** 最后确认的状态是否可能过期。 */
  readonly stale: boolean;
}

/**
 * 派生连接展示。
 *
 * @remarks
 * 断线优先于过期报告；连接已建立但尚未完成首次同步时报告 `reconnecting`。停止既有
 * Run 等安全操作不受该结论限制，调用方仍按工作台动作各自判断。
 *
 * @param facts - 连接与同步事实。
 * @returns 单一连接展示结论。
 * @example
 * ```ts
 * selectConnectionPresentation({ connected: false, synced: true, stale: true }).state; // "reconnecting"
 * ```
 */
export function selectConnectionPresentation(facts: ConnectionFacts): ConnectionPresentation {
  const isOutdated = facts.stale;
  if (!facts.connected) {
    return { state: "reconnecting", label: "Reconnecting", allowsNewDecisions: false, isOutdated, retainsLastKnown: true };
  }
  if (!facts.synced) {
    return { state: "reconnecting", label: "Connecting", allowsNewDecisions: false, isOutdated, retainsLastKnown: true };
  }
  if (facts.stale) {
    return { state: "stale", label: "State out of date", allowsNewDecisions: false, isOutdated, retainsLastKnown: true };
  }
  return { state: "linked", label: "Connected", allowsNewDecisions: true, isOutdated: false, retainsLastKnown: true };
}
