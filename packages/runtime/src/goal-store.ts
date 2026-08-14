import type { Goal } from "./domain";

/**
 * Goal 聚合的持久化边界。
 *
 * Task 1 只使用 save 完成启动时的完整快照写入；restore 和具体实现由后续
 * GoalStore 任务提供。
 */
export interface GoalStore {
    save(goal: Goal): Promise<void>;
    restore(goalId: string): Promise<Goal | undefined>;
}
