import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 为交互面板提供一次性提交闸门。
 *
 * @remarks
 * 闸门在 `busy` 期间拒绝重复提交，在一次合法提交后立即锁定，直到父组件
 * 把 `busy` 复位或 `resetKey` 变化。`value` 存在时会先执行 trim 后的空白校验；
 * 具体错误文案仍由调用方传入。该 Hook 只管理锁和本地校验错误，不解释业务命令。
 *
 * @param busy - 父组件是否正在处理上一条命令。
 * @param resetKey - 当前交互对象的稳定身份；变化时清除锁和本地错误。
 * @returns 提交尝试函数、清除错误函数和当前本地校验错误。
 * @example
 * ```tsx
 * const gate = useSubmitGate(busy, goalId);
 * gate.attempt(() => onSubmit(value), {
 *     value,
 *     emptyMessage: "Message must not be empty",
 * });
 * ```
 */
export function useSubmitGate(
    busy: boolean,
    resetKey: unknown,
): {
    readonly validationError: string | undefined;
    readonly clearError: () => void;
    readonly attempt: (
        action: () => void,
        options?: {
            readonly value?: string;
            readonly emptyMessage?: string;
        },
    ) => void;
} {
    const [validationError, setValidationError] = useState<string>();
    const submitLock = useRef(false);

    useEffect(() => {
        submitLock.current = false;
        setValidationError(undefined);
    }, [resetKey]);

    useEffect(() => {
        if (!busy) {
            submitLock.current = false;
        }
    }, [busy]);

    const clearError = useCallback(() => {
        setValidationError(undefined);
    }, []);

    const attempt = useCallback((
        action: () => void,
        options: {
            readonly value?: string;
            readonly emptyMessage?: string;
        } = {},
    ) => {
        if (busy || submitLock.current) {
            return;
        }

        if (
            options.value !== undefined
            && options.value.trim().length === 0
        ) {
            setValidationError(options.emptyMessage ?? "Value must not be empty");
            return;
        }

        submitLock.current = true;
        setValidationError(undefined);
        action();
    }, [busy]);

    return { validationError, clearError, attempt };
}
