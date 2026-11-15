/**
 * Worker 执行通道不可用的失败类别。
 *
 * @remarks
 * 类别只用于服务端诊断：`registration` 表示注册或 socket 路径无法建立，`start` 表示
 * 子进程启动失败，`handshake` 表示身份握手不一致，`control-channel` 表示既有通道
 * 断开或写入失败。浏览器只看到统一的 `execution_unavailable`。
 */
export type WorkerExecutionFailureKind = "registration" | "start" | "handshake" | "control-channel";

/**
 * 本机执行通道不可用，Goal 无法交给 Worker 构造。
 *
 * @remarks
 * 该错误只表示环境或通道问题，不表示 Goal 或输入本身无效；调用方应把它映射为可重试
 * 的创建失败，而不是通用内部错误。错误信息只用于服务端日志，不包含内部路径或堆栈，
 * 也不返回浏览器。
 *
 * @example
 * ```ts
 * throw new WorkerExecutionUnavailableError("start", "Worker process exited before the identity handshake");
 * ```
 */
export class WorkerExecutionUnavailableError extends Error {
    readonly code = "WORKER_EXECUTION_UNAVAILABLE" as const;

    /**
     * @param kind - 失败类别，用于区分注册、启动、握手与通道问题。
     * @param message - 面向服务端日志的有界诊断文本。
     */
    constructor(
        readonly kind: WorkerExecutionFailureKind,
        message: string,
    ) {
        super(message);
        this.name = "WorkerExecutionUnavailableError";
    }
}

/**
 * Worker 明确拒绝构造 Goal。
 *
 * @remarks
 * 通道与进程都可用，拒绝来自 Worker 自身的构造结果或响应形状，因此属于未分类的内部
 * 创建失败，不表示执行环境不可用。
 *
 * @example
 * ```ts
 * throw new WorkerGoalCreationRejectedError("Worker Goal creation failed: creation-failed");
 * ```
 */
export class WorkerGoalCreationRejectedError extends Error {
    readonly code = "WORKER_GOAL_CREATION_REJECTED" as const;

    /** @param message - 面向服务端日志的有界诊断文本。 */
    constructor(message: string) {
        super(message);
        this.name = "WorkerGoalCreationRejectedError";
    }
}
