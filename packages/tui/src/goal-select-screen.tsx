import React, { useCallback, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { TextInput } from "@inkjs/ui";
import wrapAnsi from "wrap-ansi";

import type { GoalCatalogEntry } from "../../runtime/src/index";
import type { UiError } from "./types";
import { useSubmitGate } from "./use-submit-gate";
import { ErrorLine } from "./error-line";
import { StatusSpinner } from "./status-spinner";
import { truncateId } from "./format";
import { useTerminalSize } from "./use-terminal-size";
import { GoalList } from "./goal-list";

/**
 * GoalSelectScreen 的渲染与恢复命令回调边界。
 *
 * @remarks
 * Screen 保留 Catalog 返回的顺序，不自行按时间或状态排序；每个选项只携带
 * `goalId`，完整 Goal 快照由 SessionController 在确认后恢复。busy 时选择器
 * 停用，避免同一个键盘确认产生多个恢复命令。
 * 搜索仅过滤内存摘要，不改变 Catalog 顺序或读取完整快照。
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
    /** 列表交互模式（默认为 resume；inspect 为轨迹复盘历史查看）。 */
    readonly mode?: "resume" | "inspect";
    /** 用户确认后恢复指定 Goal 的回调。 */
    readonly onSelect: (goalId: string) => void | Promise<void>;
    /** Esc 返回主页；忙碌期间禁用。未提供时隐藏该提示。 */
    readonly onBack?: () => void;
    /** q 退出进程；编辑搜索词时 q 作为普通字符。 */
    readonly onExit?: () => void;
    /** 返回列表时优先聚焦的 Goal；当前过滤结果不包含该项时聚焦首项。 */
    readonly initialGoalId?: string;
}

/**
 * 渲染可恢复 Goal 选择界面或轨迹历史选择界面。
 *
 * @param props - Catalog 条目、错误状态与选择回调。
 * @returns Ink 渲染树。
 */
export function GoalSelectScreen({
    goals,
    busy,
    error,
    mode = "resume",
    onSelect,
    onBack,
    onExit,
    initialGoalId,
}: GoalSelectScreenProps): React.JSX.Element {
    const selectGate = useSubmitGate(busy, goals);
    const { columns, rows } = useTerminalSize();
    const [query, setQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const contentWidth = Math.max(1, columns - 4);
    const gap = rows < 20 ? 0 : 1;

    useInput((input, key) => {
        if (busy) return;
        if (key.escape) {
            if (searching || query.length > 0) {
                setQuery("");
                setSearching(false);
            } else {
                onBack?.();
            }
        } else if (!searching && input === "/") {
            setSearching(true);
        } else if (!searching && input === "q") {
            onExit?.();
        }
    });

    const options = useMemo(
        () => goals.filter((entry) => [entry.intent, entry.goalId, entry.runStatus, entry.workflowPhase]
            .join(" ").toLowerCase().includes(query.trim().toLowerCase())).map((entry) => ({
            label: formatGoalEntry(entry, mode),
            description: wrapAnsi([
                mode === "resume" ? `phase=${entry.workflowPhase}  run=${entry.runStatus}` : entry.runStatus,
                truncateId(entry.goalId),
                entry.updatedAt,
            ].join("  "), contentWidth, { hard: true, trim: false }),
            value: entry.goalId,
        })),
        [goals, mode, query, contentWidth],
    );
    const optionHeight = options.reduce((height, option) => Math.max(height,
        1 + option.description.split("\n").length), 1);
    const navigationHint = searching
        ? "Type to filter. Enter to browse. Esc to clear."
        : "↑/↓ Select  Enter Open  / Search";
    const backHint = (searching || query.length > 0 ? "Esc Clear search  " : onBack === undefined ? "" : "Esc Main Menu  ")
        + (searching ? "Ctrl+C Exit" : onExit === undefined ? "Press Ctrl+C to exit." : "q Exit");
    const hintHeight = [navigationHint, backHint].reduce((height, hint) => height
        + wrapAnsi(hint, Math.max(1, columns - 2), { hard: true }).split("\n").length, 0);
    const visibleOptionCount = Math.max(1, Math.min(8,
        Math.floor((rows - 5 - gap * 4 - hintHeight) / optionHeight)));

    const handleSelect = useCallback((goalId: string) => {
        selectGate.attempt(() => {
            void onSelect(goalId);
        });
    }, [onSelect, selectGate]);

    const errorView = selectGate.validationError !== undefined
        ? { message: selectGate.validationError }
        : error === undefined
            ? undefined
            : { code: error.code, message: error.message };

    const isInspect = mode === "inspect";

    return (
        <Box flexDirection="column" gap={gap} width={columns} paddingX={1}>
            <Text bold color="cyan">
                {isInspect ? "Inspect Goal Trajectory" : "Resume a Goal"}
            </Text>
            {errorView === undefined ? null : <ErrorLine error={errorView} />}
            {searching ? (
                <Box>
                    <Text color="cyan">/ </Text>
                    <TextInput defaultValue={query} isDisabled={busy}
                        placeholder="Search title, ID or status..." onChange={setQuery}
                        onSubmit={() => setSearching(false)} />
                </Box>
            ) : <Text dimColor>{options.length} / {goals.length} Goals{query ? " matching: " + query : ""}</Text>}
            {busy && goals.length === 0 ? null : goals.length === 0 ? (
                <Box flexDirection="column" gap={1}>
                    {errorView === undefined
                        ? <Text>{isInspect ? "No Goal history found." : "No resumable Goals found."}</Text>
                        : null}
                    <Text dimColor>{isInspect ? "Run a Goal or benchmark to record a trajectory." : "Start a new Goal from the Main Menu."}</Text>
                </Box>
            ) : options.length === 0 ? (
                <Text>No matching Goals. Press Esc to clear the search.</Text>
            ) : (
                <Box flexDirection="column">
                    <GoalList
                        key={query}
                        isDisabled={busy || searching}
                        options={options}
                        {...(initialGoalId !== undefined && options.some((option) => option.value === initialGoalId)
                            ? { initialGoalId } : {})}
                        visibleOptionCount={visibleOptionCount}
                        onChange={handleSelect}
                    />
                </Box>
            )}
            {busy ? <StatusSpinner label={isInspect ? "Loading trajectory..." : "Resuming goal..."} /> : null}
            <Text dimColor>{navigationHint}</Text>
            <Text dimColor>{backHint}</Text>
        </Box>
    );
}

function formatGoalEntry(
    entry: GoalCatalogEntry,
    mode: "resume" | "inspect" = "resume",
): string {
    if (mode === "inspect") {
        const label = entry.intent.startsWith("[")
            ? entry.intent
            : `[Goal] ${entry.intent}`;
        return label.replace(/\s+/g, " ").trim();
    }

    return entry.intent.replace(/\s+/g, " ").trim();
}
