import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

/**
 * 已过滤 Goal 选项的键盘列表。
 *
 * @remarks
 * 保持传入顺序并让焦点始终处于可见窗口内。初始焦点由 Goal ID 指定，未命中
 * 时使用首项。过滤条件改变时调用方重新挂载；终端尺寸改变时保留当前焦点。
 *
 * @example
 * <GoalList options={options} visibleOptionCount={5} isDisabled={false}
 *   initialGoalId="goal-1" onChange={selectGoal} />
 */
export interface GoalListProps {
    /** 有序摘要；标题占一行，description 可换行，value 为唯一 Goal ID。 */
    readonly options: readonly {
        readonly label: string;
        readonly value: string;
        readonly description?: string;
    }[];
    /** 同时展示的选项数量，至少为 1。 */
    readonly visibleOptionCount: number;
    /** 搜索编辑或异步读取期间禁用全部列表按键。 */
    readonly isDisabled: boolean;
    /** 初始聚焦的 Goal ID。 */
    readonly initialGoalId?: string;
    /** Enter 确认当前焦点；业务提交去重由调用方负责。 */
    readonly onChange: (goalId: string) => void;
}

/** 渲染可分页、可恢复焦点的 Goal 列表。 */
export function GoalList({
    options, visibleOptionCount, isDisabled, initialGoalId, onChange,
}: GoalListProps): React.JSX.Element {
    const [focusedValue, setFocusedValue] = useState(initialGoalId ?? options[0]?.value);
    const focusedIndex = Math.max(0, options.findIndex((option) => option.value === focusedValue));
    const count = Math.min(visibleOptionCount, options.length);
    const start = Math.max(0, Math.min(focusedIndex - Math.floor(count / 2), options.length - count));

    useInput((input, key) => {
        let index = focusedIndex;
        const move = (next: number) => {
            index = Math.max(0, Math.min(next, options.length - 1));
            setFocusedValue(options[index]?.value);
        };
        if (key.return) {
            const option = options[index];
            if (option !== undefined) onChange(option.value);
        } else if (key.downArrow) move(index + 1);
        else if (key.upArrow) move(index - 1);
        else if (key.pageDown) move(index + count);
        else if (key.pageUp) move(index - count);
        else if (key.home) move(0);
        else if (key.end) move(options.length - 1);
        else if (!key.ctrl && !key.meta) {
            for (const action of input) {
                if (action === "j") move(index + 1);
                else if (action === "k") move(index - 1);
            }
        }
    }, { isActive: !isDisabled });

    return (
        <Box flexDirection="column">
            {options.slice(start, start + count).map((option, index) => {
                const focused = !isDisabled && start + index === focusedIndex;
                return (
                    <Box key={option.value}>
                        <Text {...(focused ? { color: "cyan" } : {})}>{focused ? "❯ " : "  "}</Text>
                        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
                            <Text bold={focused} wrap="truncate-end"
                                {...(focused ? { color: "cyan" } : {})}>{option.label}</Text>
                            {option.description === undefined ? null : (
                                <Text dimColor>{option.description}</Text>
                            )}
                        </Box>
                    </Box>
                );
            })}
            <Text dimColor wrap="truncate-end">{options.length === 0 ? 0 : focusedIndex + 1} / {options.length}
                {options.length > count ? "  PgUp/PgDn" : ""}</Text>
        </Box>
    );
}
