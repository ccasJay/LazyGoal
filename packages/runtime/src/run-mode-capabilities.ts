import type { RunMode } from "./domain";

const GOAL_PLAN_WRITABLE_BY_MODE: Readonly<Record<RunMode, boolean>> = {
    normal: false,
    plan: true,
};

/**
 * 判定指定 Run 模式是否拥有 GoalPlan 写入能力。
 *
 * @param mode - 当前 Run 的持久化模式。
 * @returns 该模式获授权更新 GoalPlan 时返回 `true`。
 *
 * @example
 * ```ts
 * const writable = canUpdateGoalPlan("plan");
 * ```
 */
export function canUpdateGoalPlan(mode: RunMode): boolean {
    return GOAL_PLAN_WRITABLE_BY_MODE[mode];
}
