/**
 * 已知进程会话生命周期失败的稳定阶段分类。
 *
 * @remarks
 * `admission` 覆盖关闭、额度与历史上限拒绝；`persistence` 覆盖记录读写失败；
 * `spawn` 覆盖创建子进程失败；`output`/`stop`/`settlement` 分别覆盖输出追加、
 * 终止请求与终态结算失败。
 */
export type ProcessFailureStage =
    | "admission"
    | "spawn"
    | "persistence"
    | "output"
    | "stop"
    | "settlement";

/** 进程会话生命周期失败使用的稳定错误代码。 */
export const PROCESS_SESSION_ERROR_CODE = "PROCESS_SESSION_FAILED" as const;

/**
 * 构造 `ProcessSessionError` 时的可选上下文。
 *
 * @remarks
 * `cause` 与 `cleanupError` 分别保留原始故障和清理故障，供调用方诊断时不丢失任一原因。
 *
 * @example
 * ```ts
 * const options: ProcessSessionErrorOptions = {
 *   stage: "spawn",
 *   goalId: "goal-1",
 *   cause: spawnError,
 * };
 * ```
 */
export interface ProcessSessionErrorOptions {
    /** 失败阶段分类。 */
    readonly stage: ProcessFailureStage;
    /** 失败所属的 Goal 标识；装配阶段未知时省略。 */
    readonly goalId?: string | undefined;
    /** 失败所属的进程标识；尚未分配时省略。 */
    readonly processId?: string | undefined;
    /** 原始原因；错误被包装时保留，不使用清理故障覆盖。 */
    readonly cause?: unknown;
    /** 同一失败发生后清理步骤自身的故障；保留供调用方诊断。 */
    readonly cleanupError?: unknown;
}

/**
 * 管理器已知的进程会话生命周期失败。
 *
 * @remarks
 * 携带稳定阶段分类与会话身份，用于区分启动、持久化、输出、停止与结算失败。
 * `cause` 始终保留原始故障；`cleanupError` 只记录清理步骤的附加故障，两者不互相覆盖。
 * 失败可能发生在已产生副作用之后，不能由失败返回推断命令未运行。
 *
 * @example
 * ```ts
 * try {
 *   await manager.startProcess({ goalId, command, cwd });
 * } catch (error) {
 *   if (error instanceof ProcessSessionError) {
 *     console.error(error.stage, error.processId, error.message);
 *   }
 * }
 * ```
 */
export class ProcessSessionError extends Error {
    readonly code = PROCESS_SESSION_ERROR_CODE;
    readonly stage: ProcessFailureStage;
    readonly goalId: string | undefined;
    readonly processId: string | undefined;
    readonly cleanupError: unknown;

    constructor(message: string, options: ProcessSessionErrorOptions) {
        super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
        this.name = "ProcessSessionError";
        this.stage = options.stage;
        this.goalId = options.goalId;
        this.processId = options.processId;
        this.cleanupError = options.cleanupError;
    }
}
