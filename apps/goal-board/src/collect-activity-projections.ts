import type { BrowserGoalLiveEvent, BrowserSessionRun } from "../../../packages/web-contracts/src/index";
import { projectActivityGroups, type ActivityGroup } from "./activity-projector";

/**
 * 一次会话渲染所需的全部 Run 活动组投影集合。
 *
 * @remarks
 * `GoalSession` 每次渲染会对每个 Run 调用 {@link projectActivityGroups}；liveText 高频更新
 * 不得触发其重新计算，因此投影收集收敛在本纯函数内，由调用方按
 * `(goalId, runs, liveEvents)` 记忆化。`liveEvents` 只对 `current` Run 生效：
 * 非当前 Run 的临时活动不会参与投影，这与快照"仅当前 Run 提供未提交临时活动"的边界一致。
 *
 * @example
 * ```ts
 * const projections = useMemo(
 *   () => collectActivityProjections(session.runs, session.goalId, liveEvents),
 *   [session.runs, session.goalId, liveEvents],
 * );
 * const groups = projections.get(run.runId) ?? [];
 * ```
 */
export function collectActivityProjections(
  runs: readonly BrowserSessionRun[],
  goalId: string,
  liveEvents: readonly BrowserGoalLiveEvent[],
): ReadonlyMap<string, readonly ActivityGroup[]> {
  const projections = new Map<string, readonly ActivityGroup[]>();
  for (const run of runs) {
    projections.set(
      run.runId,
      projectActivityGroups({
        goalId,
        run,
        liveEvents: run.current ? liveEvents : [],
      }),
    );
  }
  return projections;
}
