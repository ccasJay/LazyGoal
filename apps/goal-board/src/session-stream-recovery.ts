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
