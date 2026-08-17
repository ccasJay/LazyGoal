/**
 * 一次 Goal 推进调用共享的进程控制信号。
 *
 * @remarks
 * `signal` 只表达调用生命周期，不属于 Goal 领域状态，也不会写入快照。
 * 调用链中的每一层都必须在外部调用前以及异步调用返回后检查它；一旦中止，
 * 必须抛出 {@link ExecutionAbortedError}，不得把中止转换成业务失败或新的领域状态。
 *
 * @example
 * ```ts
 * const control: ExecutionControl = { signal: new AbortController().signal };
 * await coordinator.advance(ref, control);
 * ```
 */
export interface ExecutionControl {
    /** 当前调用的可选中止信号。 */
    readonly signal?: AbortSignal;
}

/** 中止控制流使用的稳定错误代码。 */
export const EXECUTION_ABORTED_ERROR_CODE = "EXECUTION_ABORTED" as const;

/**
 * 表示本次执行因外部关闭或中止信号停止，而不是业务执行失败。
 *
 * @remarks
 * 该错误必须沿调用链原样传播。上层关闭协调器可以识别它并结束进程；Runner
 * 不得为它生成 `fail` Step、`execution_error`、`cancelled` 或新的 Goal 快照。
 *
 * @example
 * ```ts
 * try {
 *     throwIfAborted(control);
 * } catch (error) {
 *     if (error instanceof ExecutionAbortedError) {
 *         // 交给关闭流程处理
 *     }
 * }
 * ```
 */
export class ExecutionAbortedError extends Error {
    readonly code = EXECUTION_ABORTED_ERROR_CODE;

    /** @param message - 可选的内部诊断文本，不面向 TUI 用户展示。 */
    constructor(message = "Execution aborted") {
        super(message);
        this.name = "ExecutionAbortedError";
    }
}

/**
 * 判断异常是否为执行中止错误。
 *
 * @param error - 待判断的任意异常值。
 * @returns 若异常来自本协议，则返回 `true`。
 *
 * @example
 * ```ts
 * if (isExecutionAbortedError(error)) {
 *     return;
 * }
 * ```
 */
export function isExecutionAbortedError(
    error: unknown,
): error is ExecutionAbortedError {
    return (
        error instanceof ExecutionAbortedError
        || (
            error instanceof Error
            && error.name === "ExecutionAbortedError"
            && "code" in error
            && error.code === EXECUTION_ABORTED_ERROR_CODE
        )
    );
}

/**
 * 在继续执行前检查中止信号。
 *
 * @param control - 当前调用共享的执行控制；也接受裸 `AbortSignal` 以便边界
 *   适配器在不构造对象时安全复用该检查。
 * @throws ExecutionAbortedError 当信号已经被中止时抛出。
 *
 * @example
 * ```ts
 * throwIfAborted({ signal: controller.signal });
 * ```
 */
export function throwIfAborted(
    control?: ExecutionControl | AbortSignal,
): void {
    const signal = control !== undefined && "aborted" in control
        ? control as AbortSignal
        : control?.signal;

    if (signal?.aborted) {
        throw new ExecutionAbortedError();
    }
}
