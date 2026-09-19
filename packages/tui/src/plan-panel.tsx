import React from "react";
import { Box, Text } from "ink";

import type { GoalPlan } from "../../runtime/src/index";

/**
 * Plan Mode 面板的只读投影属性。
 *
 * @remarks
 * 面板只消费 Runtime 已提交的 GoalPlan；`activeRunTodoId` 仅用于标识当前 Run
 * 承接的项，不在 UI 内维护状态或推断完成条件。
 *
 * @example
 * ```tsx
 * <PlanPanel plan={goal.state.goalPlan!} activeRunTodoId={goal.state.run.todoId} />
 * ```
 */
export interface PlanPanelProps {
    /** Goal Snapshot 中的完整计划。 */
    readonly plan: GoalPlan;
    /** 当前 Run 承接的 Todo ID。 */
    readonly activeRunTodoId?: string;
}

/** 从 Goal Snapshot 渲染 Plan Mode 的 Todo 清单。 */
export function PlanPanel({ plan, activeRunTodoId }: PlanPanelProps): React.JSX.Element {
    return (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
            <Text bold color="cyan">Plan</Text>
            {plan.items.length === 0 ? (
                <Text dimColor>No Todo items yet.</Text>
            ) : plan.items.map((item) => {
                const marker = item.status === "completed"
                    ? "✓"
                    : item.status === "in_progress"
                        ? "●"
                        : item.status === "cancelled"
                            ? "×"
                            : "○";
                const active = item.id === activeRunTodoId;
                return (
                    <Text key={item.id} {...(active ? { color: "yellow" as const } : {})}>
                        {marker} {item.content}
                        {active ? " (current Run)" : ""}
                    </Text>
                );
            })}
        </Box>
    );
}
