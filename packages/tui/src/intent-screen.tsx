import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text } from "ink";
import { Spinner, TextInput } from "@inkjs/ui";

import type { UiError } from "./types";

/**
 * IntentScreen 的渲染与命令回调边界。
 *
 * @remarks
 * Screen 只负责编辑和校验 intent，不生成 Goal ID，也不直接访问 Runtime。
 * 合法提交原文交给 `onSubmit`；空白输入停留在当前控件并显示英文提示。
 *
 * @example
 * ```tsx
 * <IntentScreen busy={false} onSubmit={intent => controller.dispatch({
 *   kind: "create",
 *   intent,
 * })} />
 * ```
 */
export interface IntentScreenProps {
    /** Controller 当前是否正在处理命令。 */
    readonly busy: boolean;
    /** Controller 最近一次业务错误。 */
    readonly error?: UiError;
    /** 合法 intent 提交回调；Screen 不等待或解释其返回值。 */
    readonly onSubmit: (intent: string) => void | Promise<void>;
}

/**
 * 新 Goal 的英文 intent 输入界面。
 *
 * @param props - busy、错误状态与创建命令回调。
 * @returns Ink 渲染树。
 */
export function IntentScreen({
    busy,
    error,
    onSubmit,
}: IntentScreenProps): React.JSX.Element {
    const [validationError, setValidationError] = useState<string>();
    const submitLock = useRef(false);

    useEffect(() => {
        if (!busy) {
            submitLock.current = false;
        }
    }, [busy]);

    const handleSubmit = useCallback((value: string) => {
        if (busy || submitLock.current) {
            return;
        }

        if (value.trim().length === 0) {
            setValidationError("Intent must not be empty");
            return;
        }

        submitLock.current = true;
        setValidationError(undefined);
        void onSubmit(value);
    }, [busy, onSubmit]);

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold color="cyan">LazyGoal</Text>
            <Text>What would you like to accomplish?</Text>
            {validationError === undefined && error !== undefined
                ? <Text color="red">Error: {error.message}</Text>
                : null}
            {validationError !== undefined
                ? <Text color="red">Error: {validationError}</Text>
                : null}
            <TextInput
                isDisabled={busy}
                placeholder="Describe your goal..."
                onSubmit={handleSubmit}
            />
            {busy ? <Spinner label="Working..." /> : null}
        </Box>
    );
}
