import React, { useCallback, useMemo, useState } from "react";
import { Box, Text } from "ink";
import { TextInput } from "@inkjs/ui";

import {
    createSlashCommandRegistry,
    modelCommandDefinition,
    planCommandDefinition,
    type ModelCommandEffect,
    type SlashCommandRegistry,
} from "../../slash-command/src/index.js";

/**
 * 命令感知文本输入框属性契约。
 *
 * @remarks
 * 扩展常规文本输入属性，提供实时 Slash Command 候选提示、命令派发回调和错误拒绝拦截。
 *
 * @example
 * ```tsx
 * <CommandAwareTextInput
 *   isDisabled={busy}
 *   placeholder="Type /model or a regular message..."
 *   onSubmit={text => console.log("Text:", text)}
 *   onCommandEffect={effect => console.log("Effect:", effect)}
 * />
 * ```
 */
export interface CommandAwareTextInputProps {
    /** 控件是否处于禁用状态。 */
    readonly isDisabled?: boolean | undefined;
    /** 空文本时的占位文字。 */
    readonly placeholder?: string | undefined;
    /** 初始默认输入内容。 */
    readonly defaultValue?: string | undefined;
    /** 自动补全建议列表。 */
    readonly suggestions?: string[] | undefined;
    /** 输入内容变更回调。 */
    readonly onChange?: ((value: string) => void) | undefined;
    /**
     * 普通文本或转义文本提交回调。
     *
     * @remarks
     * 当输入为斜杠命令时，本回调绝对不会被触发。
     * 若输入为 `//` 转义，本回调接收已去除首个 `/` 后的真实文本。
     */
    readonly onSubmit: (content: string) => void | Promise<void>;
    /** 命令成功派发时产生的副作用回调。 */
    readonly onCommandEffect?: ((effect: ModelCommandEffect) => void | Promise<void>) | undefined;
    /** 可选注入的 SlashCommandRegistry 实例；缺省时默认注册 `/model`。 */
    readonly registry?: SlashCommandRegistry<ModelCommandEffect> | undefined;
    /** 命令被拒绝时的错误提示回调。 */
    readonly onError?: ((message: string) => void) | undefined;
}

/**
 * 具备 Slash Command 发现与派发能力的统一单行文本输入组件。
 *
 * @remarks
 * 实时监控键入内容：
 * - 若首个非空白字符为 `/`，展示可用命令及前缀过滤候选；
 * - 提交合法命令时，通过 `onCommandEffect` 派发领域副作用，不触发 `onSubmit`，避免命令文本进入 Goal 对话；
 * - 提交未知命令或非法参数时，就地渲染拒绝提示并阻止提交；
 * - 提交 `//` 时移除一个 `/` 并作为普通文本提交；
 * - 普通文本提交原样传递给 `onSubmit`。
 *
 * @param props - 文本输入属性与命令回调。
 * @returns Ink 渲染树。
 */
export function CommandAwareTextInput({
    isDisabled,
    placeholder,
    defaultValue,
    suggestions,
    onChange,
    onSubmit,
    onCommandEffect,
    registry,
    onError,
}: CommandAwareTextInputProps): React.JSX.Element {
    const defaultRegistry = useMemo(() => {
        const reg = createSlashCommandRegistry<ModelCommandEffect>();
        reg.register(modelCommandDefinition);
        reg.register(planCommandDefinition);
        return reg;
    }, []);

    const activeRegistry = registry ?? defaultRegistry;
    const [currentValue, setCurrentValue] = useState(defaultValue ?? "");
    const [rejectionError, setRejectionError] = useState<string | undefined>(undefined);
    const lastValueRef = React.useRef(defaultValue ?? "");

    const inspection = useMemo(() => {
        return activeRegistry.inspect(currentValue);
    }, [activeRegistry, currentValue]);

    const handleChange = useCallback((val: string) => {
        if (val !== lastValueRef.current) {
            lastValueRef.current = val;
            setCurrentValue(val);
            setRejectionError(undefined);
            onChange?.(val);
        }
    }, [onChange]);

    const handleSubmit = useCallback(async (val: string) => {
        const result = await activeRegistry.dispatch(val);
        if (result.kind === "text") {
            setRejectionError(undefined);
            void onSubmit(val);
        } else if (result.kind === "escaped_text") {
            setRejectionError(undefined);
            void onSubmit(result.content);
        } else if (result.kind === "executed") {
            setRejectionError(undefined);
            void onCommandEffect?.(result.effect);
        } else if (result.kind === "rejected") {
            setRejectionError(result.message);
            onError?.(result.message);
        }
    }, [activeRegistry, onCommandEffect, onError, onSubmit]);

    return (
        <Box flexDirection="column">
            {rejectionError !== undefined ? (
                <Text color="red">Error: {rejectionError}</Text>
            ) : null}
            {inspection.kind === "candidates" && inspection.candidates.length > 0 ? (
                <Box flexDirection="column">
                    <Text dimColor>Available commands:</Text>
                    {inspection.candidates.map((c) => (
                        <Text key={c.name}>
                            <Text color="cyan">{c.usage}</Text>
                            <Text dimColor> - {c.description}</Text>
                        </Text>
                    ))}
                </Box>
            ) : null}
            <TextInput
                {...(isDisabled === undefined ? {} : { isDisabled })}
                {...(placeholder === undefined ? {} : { placeholder })}
                {...(defaultValue === undefined ? {} : { defaultValue })}
                {...(suggestions === undefined ? {} : { suggestions })}
                onChange={handleChange}
                onSubmit={handleSubmit}
            />
        </Box>
    );
}
