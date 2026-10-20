/**
 * 会话观察的同步、新鲜度与释放语义。
 *
 * @remarks
 * 这里只描述观察层的行为：连接建立后先消费权威同步、断线时保留最后确认的正式内容
 * 并标记可能过期、以及卸载观察时释放哪些本地资源。真实执行、授权与已受理输入仍由
 * Runtime 决定；释放观察不发送 Interrupt，也不撤销已受理输入或关闭宿主 Runtime。
 */

/**
 * 一次会话观察的同步与新鲜度状态。
 *
 * @remarks
 * `synced` 表示本次连接已经收到权威同步；`stale` 表示最后确认的内容可能过期，
 * 依赖最新状态的新决定应当受限。
 */
export interface StreamRecoveryState {
  /** 是否已收到本次连接的权威同步。 */
  readonly synced: boolean;
  /** 最后确认的正式内容是否可能过期。 */
  readonly stale: boolean;
}

/** 新建观察时的初始同步状态。 */
export const INITIAL_STREAM_RECOVERY_STATE: StreamRecoveryState = { synced: false, stale: false };

/**
 * 更新观察的同步与新鲜度状态。
 *
 * @remarks
 * 权威同步清除过期标记；单纯断开或读取失败只标记过期，不伪造执行失败、取消，也不
 * 清除最后确认的正式内容与当前草稿。
 *
 * @param current - 当前状态。
 * @param event - 观察事件。
 * @returns 更新后的状态。
 * @example
 * ```ts
 * reduceStreamRecovery(INITIAL_STREAM_RECOVERY_STATE, { kind: "state_sync" }).stale; // false
 * ```
 */
export function reduceStreamRecovery(
  current: StreamRecoveryState,
  event:
    | { readonly kind: "connected" }
    | { readonly kind: "state_sync" }
    | { readonly kind: "disconnected" }
    | { readonly kind: "failed" },
): StreamRecoveryState {
  switch (event.kind) {
    case "connected":
      return { synced: current.synced, stale: current.stale };
    case "state_sync":
      return { synced: true, stale: false };
    case "disconnected":
    case "failed":
      return { synced: current.synced, stale: true };
  }
}

/**
 * 判断当前是否允许依赖最新状态的新决定。
 *
 * @remarks
 * 过期期间禁止 Steer 与 Resume 一类以当前 Run 或提交修订为前提的决定；停止既有
 * Run 属于安全操作，不受该限制。
 *
 * @param state - 当前同步与新鲜度状态。
 * @returns 是否允许依赖最新状态的新决定。
 * @example
 * ```ts
 * allowsLatestStateDecision({ synced: true, stale: true }); // false
 * ```
 */
export function allowsLatestStateDecision(state: StreamRecoveryState): boolean {
  return !state.stale;
}

/**
 * 释放一次观察时必须回收的本地资源。
 *
 * @remarks
 * 释放只覆盖浏览器本地的订阅、请求、合并帧与观察资源；它不发送 Interrupt，不撤销
 * 已受理输入，也不关闭宿主 Runtime。
 */
export interface ObservationRelease {
  /** 中止本视图尚未完成的本地读取。 */
  readonly abortLocalReads: true;
  /** 取消尚未提交的合并帧。 */
  readonly cancelPendingFrames: true;
  /** 断开本视图的 Goal 范围订阅。 */
  readonly detachSubscription: true;
  /** 不发送 Interrupt。 */
  readonly sendInterrupt: false;
  /** 不撤销已受理输入。 */
  readonly revokeAcceptedInputs: false;
  /** 不关闭宿主 Runtime。 */
  readonly closeHostRuntime: false;
}

/**
 * 生成一次观察释放应当执行的动作集合。
 *
 * @remarks
 * 该集合是纯声明：调用方按此释放浏览器本地资源，不得据此中断 Runtime 执行。
 *
 * @returns 释放动作集合。
 * @example
 * ```ts
 * releaseObservation().sendInterrupt; // false
 * ```
 */
export function releaseObservation(): ObservationRelease {
  return {
    abortLocalReads: true,
    cancelPendingFrames: true,
    detachSubscription: true,
    sendInterrupt: false,
    revokeAcceptedInputs: false,
    closeHostRuntime: false,
  };
}

/**
 * 判断一次迟到回调是否仍属于当前视图。
 *
 * @remarks
 * 切换 Goal 后旧请求、旧帧与延迟回调必须被拒绝，避免把旧目标的结果写进新视图。
 *
 * @param targetGoalId - 回调发起时的 Goal 身份。
 * @param currentGoalId - 当前视图的 Goal 身份；未选择 Goal 时为 `null`。
 * @returns 是否仍属于当前视图。
 * @example
 * ```ts
 * ownsViewEvent("goal-1", "goal-1"); // true
 * ```
 */
export function ownsViewEvent(targetGoalId: string, currentGoalId: string | null): boolean {
  return currentGoalId === targetGoalId;
}
