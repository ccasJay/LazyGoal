import type {
  BrowserActivityPage,
} from "../../../packages/web-contracts/src/index";
import { projectActivityGroups, type ActivityGroup } from "./activity-projector";
import type { OrderedGoalEvent } from "./live-timeline";

/**
 * 一次会话渲染所需的全部 Run 活动组投影集合。
 *
 * @remarks
 * 活动组只来自当前固定 Activity 页的已提交事实；`liveEvents` 只对 `current` Run 生效：
 * 非当前 Run 的临时活动不会参与投影，这与快照"仅当前 Run 提供未提交临时活动"的边界一致。
 * 该投影是纯函数，调用方按 `(page, goalId, liveEvents)` 记忆化，正文高频更新不会触发重算。
 *
 * @example
 * ```ts
 * const projections = useMemo(
 *   () => collectActivityProjections(activityPage, session.goalId, liveEvents),
 *   [activityPage, session.goalId, liveEvents],
 * );
 * const groups = projections.get(runId) ?? [];
 * ```
 */
export function collectActivityProjections(
  page: BrowserActivityPage,
  goalId: string,
  liveEvents: readonly OrderedGoalEvent[],
): ReadonlyMap<string, readonly ActivityGroup[]> {
  const projections = new Map<string, readonly ActivityGroup[]>();
  for (const run of page.runs) {
    projections.set(
      run.runId,
      projectActivityGroups({
        goalId,
        runId: run.runId,
        items: page.items,
        liveEvents: run.current ? liveEvents : [],
        current: run.current,
        runStatus: run.status,
      }),
    );
  }
  return projections;
}
