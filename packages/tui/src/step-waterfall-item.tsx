import React from "react";
import { Box, Text } from "ink";
import type { UiStepSummary } from "./types";

/** 单个步骤摘要在单行显示时的最大字符阈值。 */
export const MAX_STEP_SUMMARY_CHARS = 80;

/**
 * 将多行或超长文本规范化为单行并在超过阈值时安全截断。
 *
 * @param text - 待截断的原始摘要文本。
 * @param maxLength - 最大允许字符长度，默认 80。
 * @returns 去除换行符并在超长时添加省略符的单行文本。
 *
 * @example
 * ```ts
 * truncateSummary("hello\nworld", 20); // "hello world"
 * truncateSummary("a".repeat(100), 10); // "aaaaaaaaaa…"
 * ```
 */
export function truncateSummary(text: string, maxLength = MAX_STEP_SUMMARY_CHARS): string {
    const singleLine = text.replace(/\s+/g, " ").trim();
    if (singleLine.length <= maxLength) {
        return singleLine;
    }
    return `${singleLine.slice(0, maxLength)}…`;
}

/**
 * `StepWaterfallItem` 组件属性。
 *
 * @remarks
 * 仅用于 Ink `<Static>` 内部渲染单个已持久化提交的步骤历史记录。
 *
 * @example
 * ```tsx
 * <StepWaterfallItem
 *   step={{
 *     stepNumber: 1,
 *     toolId: "read_file",
 *     actionId: "act-1",
 *     status: "success",
 *     inputSummary: "src/index.ts",
 *     outputSummary: "Read 100 lines",
 *   }}
 * />
 * ```
 */
export interface StepWaterfallItemProps {
    /** 步骤摘要轻量投影。 */
    readonly step: UiStepSummary;
}

/**
 * 渲染单个已完成步骤的紧凑单行条目。
 *
 * @param props - 见 {@link StepWaterfallItemProps}。
 * @returns Ink 渲染元素。
 */
export function StepWaterfallItem({ step }: StepWaterfallItemProps): React.JSX.Element {
    const isSuccess = step.status === "success";
    const input = step.inputSummary !== undefined ? truncateSummary(step.inputSummary) : undefined;
    const output = step.outputSummary !== undefined ? truncateSummary(step.outputSummary) : undefined;

    return (
        <Box flexDirection="row" gap={1}>
            <Text color={isSuccess ? "green" : "red"}>
                {isSuccess ? "✔" : "✖"}
            </Text>
            <Text bold>
                Step {step.stepNumber}: [{step.toolId}]
            </Text>
            {input !== undefined ? <Text color="cyan">{input}</Text> : null}
            {output !== undefined ? (
                <Text dimColor color={isSuccess ? "gray" : "red"}>
                    ({output})
                </Text>
            ) : null}
        </Box>
    );
}
