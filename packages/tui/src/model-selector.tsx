import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";

import type { LlmModelDescriptor } from "../../llm/src/model-catalog.js";
import type { UiError, UiModelSelectState } from "./types.js";
import { ErrorLine } from "./error-line.js";
import { StatusSpinner } from "./status-spinner.js";

/**
 * ModelSelector 界面组件的属性契约。
 *
 * @remarks
 * 负责展示可用模型列表、当前激活项、不可选原因与上下文容量，
 * 并支持方向键导航、Enter 确认与 ESC 取消。
 *
 * @example
 * ```tsx
 * <ModelSelector
 *   currentModelId="gpt-4o"
 *   state={{ status: "loading", generation: 1 }}
 *   busy={false}
 *   onSelect={handleSelect}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export interface ModelSelectorProps {
    /** 当前生效的模型 ID。 */
    readonly currentModelId: string;
    /** 异步目录状态：loading、list 或 error。 */
    readonly state: UiModelSelectState;
    /** Controller 当前是否处于异步切换忙碌状态。 */
    readonly busy: boolean;
    /** 外部错误信息。 */
    readonly error?: UiError | undefined;
    /** 用户确认可选择模型后的回调。 */
    readonly onSelect: (model: LlmModelDescriptor) => void | Promise<void>;
    /** 用户按 ESC 取消选择的回调。 */
    readonly onCancel: () => void | Promise<void>;
}

/**
 * 渲染模型选择器界面，支持键盘导航、可取消加载及不可选拦截。
 *
 * @param props - 包含当前模型 ID、三态目录状态与交互回调。
 * @returns Ink 渲染树。
 */
export function ModelSelector({
    currentModelId,
    state,
    busy,
    error,
    onSelect,
    onCancel,
}: ModelSelectorProps): React.JSX.Element {
    const models = useMemo(() => {
        return state.status === "list" ? state.models : [];
    }, [state]);

    const initialIndex = useMemo(() => {
        const found = models.findIndex((m) => m.id === currentModelId);
        return found >= 0 ? found : 0;
    }, [models, currentModelId]);

    const [selectedIndex, setSelectedIndex] = useState(initialIndex);
    const [localError, setLocalError] = useState<string | undefined>(undefined);

    useEffect(() => {
        setSelectedIndex(initialIndex);
    }, [initialIndex]);

    useInput((input, key) => {
        if (busy) {
            return;
        }

        if (key.escape) {
            void onCancel();
            return;
        }

        if (state.status !== "list" || models.length === 0) {
            return;
        }

        if (key.upArrow) {
            setLocalError(undefined);
            setSelectedIndex((prev) => Math.max(0, prev - 1));
            return;
        }

        if (key.downArrow) {
            setLocalError(undefined);
            setSelectedIndex((prev) => Math.min(models.length - 1, prev + 1));
            return;
        }

        if (key.return) {
            const selected = models[selectedIndex];
            if (selected === undefined) {
                return;
            }

            if (!selected.selectable) {
                setLocalError(selected.unavailableReason ?? "This model is not selectable in current mode.");
                return;
            }

            setLocalError(undefined);
            void onSelect(selected);
        }
    });

    const activeError = localError !== undefined
        ? { message: localError }
        : error !== undefined
            ? { code: error.code, message: error.message }
            : state.status === "error"
                ? { code: state.error.code, message: state.error.message }
                : undefined;

    return (
        <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
                <Text bold color="cyan">Select Language Model</Text>
                <Text dimColor>[↑/↓: Navigate, Enter: Select, ESC: Cancel]</Text>
            </Box>

            {activeError !== undefined ? <ErrorLine error={activeError} /> : null}

            {state.status === "loading" ? (
                <Box marginY={1}>
                    <StatusSpinner label="Fetching available models... (Press ESC to cancel)" />
                </Box>
            ) : null}

            {state.status === "error" ? (
                <Box marginY={1}>
                    <Text dimColor>Press ESC to return.</Text>
                </Box>
            ) : null}

            {state.status === "list" ? (
                <Box flexDirection="column" gap={1}>
                    {state.warning !== undefined ? (
                        <Text color="yellow">Notice: {state.warning}</Text>
                    ) : null}

                    {models.length === 0 ? (
                        <Text dimColor>No models available.</Text>
                    ) : (
                        <Box flexDirection="column">
                            {models.map((model, index) => {
                                const isFocused = index === selectedIndex;
                                const isCurrent = model.id === currentModelId;
                                const prefix = isFocused ? "> " : "  ";
                                const currentTag = isCurrent ? " (current)" : "";
                                const disabledTag = !model.selectable ? " [Unavailable]" : "";
                                const capacity = model.contextWindowTokens !== undefined
                                    ? ` [${Math.round(model.contextWindowTokens / 1024)}k]`
                                    : "";

                                return (
                                    <Box key={model.id}>
                                        <Text
                                            bold={isFocused}
                                            {...(!model.selectable ? { color: "gray" as const } : isFocused ? { color: "green" as const } : {})}
                                        >
                                            {prefix}
                                            {model.displayName}
                                            <Text dimColor> ({model.id})</Text>
                                            {capacity}
                                            {currentTag}
                                            {disabledTag}
                                        </Text>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}

                    {models[selectedIndex] !== undefined ? (
                        <Box flexDirection="column" marginTop={1}>
                            <Text dimColor>
                                Availability: {models[selectedIndex].availabilitySource} | Metadata: {models[selectedIndex].metadataSource}
                            </Text>
                            {!models[selectedIndex].selectable && models[selectedIndex].unavailableReason ? (
                                <Text color="red">
                                    Reason: {models[selectedIndex].unavailableReason}
                                </Text>
                            ) : null}
                        </Box>
                    ) : null}
                </Box>
            ) : null}

            {busy ? <StatusSpinner label="Switching model..." /> : null}
        </Box>
    );
}
