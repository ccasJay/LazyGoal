import React from "react";
import { Spinner } from "@inkjs/ui";

/**
 * 全仓唯一渲染 `@inkjs/ui` `Spinner` 的共享原语。
 *
 * @remarks
 * 各屏幕通过 `label` 传入按当前 phase 派生的语义化文案，不再各自直接渲染
 * `Spinner`，以保证同屏进度指示器单一与文案一致。该组件不判断何时显示，
 * 由调用方决定是否渲染；`busy` 或运行中的 Spinner 只在屏幕唯一位置出现。
 *
 * @example
 * ```tsx
 * {busy ? <StatusSpinner label="Creating goal..." /> : null}
 * ```
 */
export interface StatusSpinnerProps {
    /** 进度指示器文案，由调用方按当前 phase 提供。 */
    readonly label: string;
}

/**
 * 渲染带语义化文案的单个 Spinner。
 *
 * @param props - 见 {@link StatusSpinnerProps}。
 * @returns Ink 渲染树。
 */
export function StatusSpinner({ label }: StatusSpinnerProps): React.JSX.Element {
    return <Spinner label={label} />;
}
