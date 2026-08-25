import React from "react";
import { Text } from "ink";

/**
 * 全仓唯一渲染错误文案的共享原语。
 *
 * @remarks
 * 统一各屏幕的错误展示格式：红色文本，`code` 存在时附 `[code]`，否则省略。
 * 本地校验错误包装为 `{ message }`（无 `code`）传入；业务错误透传 `UiError`
 * （`code` 必填）。该组件不决定何时显示，由调用方控制渲染条件。
 *
 * @example
 * ```tsx
 * <ErrorLine error={{ code: "INVALID_GOAL_INPUT", message: "Intent must not be empty" }} />
 * <ErrorLine error={{ message: "Message must not be empty" }} />
 * ```
 */
export interface ErrorLineProps {
    /** 要展示的错误；`code` 可选，存在时附在方括号内。 */
    readonly error: { readonly code?: string; readonly message: string };
}

/**
 * 渲染统一格式的错误文本。
 *
 * @param props - 见 {@link ErrorLineProps}。
 * @returns Ink 渲染树。
 */
export function ErrorLine({ error }: ErrorLineProps): React.JSX.Element {
    return (
        <Text color="red">
            {`Error${error.code === undefined ? "" : ` [${error.code}]`}: ${error.message}`}
        </Text>
    );
}
