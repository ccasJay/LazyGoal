import React, { useCallback, useMemo } from "react";
import { Box, Text } from "ink";
import { Select, Spinner } from "@inkjs/ui";

import type { GoalCatalogEntry } from "../../runtime/src/index";
import type { UiError } from "./types";
import { useSubmitGate } from "./use-submit-gate";

/**
 * GoalSelectScreen 的渲染与恢复命令回调边界。
 *
 * @remarks
 * Screen 保留 Catalog 返回的顺序，不自行按时间或状态排序；每个选项只携带
 * `goalId`，完整 Goal 快照由 SessionController 在确认后恢复。busy 时选择器
 * 停用，避免同一个键盘确认产生多个恢复命令。
 *
 * @example
 * ```tsx
 * <GoalSelectScreen
 *   goals={catalogEntries}
 *   busy={false}
 *   onSelect={goalId => controller.dispatch({ kind: "selectGoal", goalId })}
 * />
 * ```
 */
export interface GoalSelectScreenProps {
    /** Catalog 按最近更新时间返回的可恢复 Goal 摘要。 */
    readonly goals: readonly GoalCatalogEntry[];
    /** Controller 当前是否正在读取或恢复 Goal。 */
    readonly busy: boolean;
    /** Catalog 或恢复流程最近一次稳定错误。 */
    readonly error?: UiError;
    /** 用户确认后恢复指定 Goal 的回调。 */
    readonly onSelect: (goalId: string) => void | Promise<void>;
}

/**
 * 渲染可恢复 Goal 选择界面。
 *
 * @param props - Catalog 条目、错误状态与选择回调。
 * @returns Ink 渲染树。
 */
export function GoalSelectScreen({
    goals,
    busy,
    error,
    onSelect,
}: GoalSelectScreenProps): React.JSX.Element {
    const selectGate = useSubmitGate(busy, goals);

    const options = useMemo(
        () => goals.map((entry) => ({
            label: formatGoalEntry(entry),
            value: entry.goalId,
        })),
        [goals],
    );

    const handleSelect = useCallback((goalId: string) => {
        selectGate.attempt(() => {
            void onSelect(goalId);
        }, {
            value: goalId,
            emptyMessage: "Goal ID must not be empty",
        });
    }, [onSelect, selectGate]);

    const visibleError = selectGate.validationError ?? error?.message;

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold color="cyan">Resume a Goal</Text>
            {visibleError !== undefined
                ? <Text color="red">
                    Error{error === undefined ? "" : ` [${error.code}]`}: {visibleError}
                </Text>
                : null}
            {goals.length === 0 ? (
                <Box flexDirection="column" gap={1}>
                    {visibleError === undefined
                        ? <Text>No resumable Goals found.</Text>
                        : null}
                    <Text dimColor>Press Ctrl+C to exit.</Text>
                </Box>
            ) : (
                <Box flexDirection="column" gap={1}>
                    <Text>Select a Goal to resume:</Text>
                    <Select
                        isDisabled={busy}
                        options={options}
                        visibleOptionCount={Math.min(8, options.length)}
                        onChange={handleSelect}
                    />
                </Box>
            )}
            {busy ? <Spinner label="Working..." /> : null}
        </Box>
    );
}

function formatGoalEntry(entry: GoalCatalogEntry): string {
    return [
        entry.goalId,
        summarizeIntent(entry.intent),
        `phase=${entry.workflowPhase}`,
        `run=${entry.runStatus}`,
        `updated=${entry.updatedAt}`,
    ].join(" | ");
}

function summarizeIntent(intent: string, maxLength = 72): string {
    const normalized = intent.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 1)}…`;
}
