import type { BrowserTrajectoryEntry } from "../../../packages/web-contracts/src/index";

/**
 * 判定轨迹事件条目是否匹配当前的类别过滤。
 *
 * @remarks
 * 用于时间轴刻度的双态投影与详情检查器中“未命中当前过滤”状态徽章的显隐控制。
 * 纯内存计算，不发起网络请求且不产生副作用。
 *
 * @param entry - 待检查的轨迹事件条目。
 * @param category - 用户选中的事件类别（如 "All events", "tool", "decision", "commit" 等）。
 * @returns 当事件满足类别要求时返回 `true`。
 *
 * @example
 * ```ts
 * const matched = isEventMatched(entry, "tool");
 * if (!matched) {
 *   // 应用弱化样式 (opacity: 0.25)
 * }
 * ```
 */
export function isEventMatched(
  entry: BrowserTrajectoryEntry,
  category: string,
): boolean {
  const normalizedCategory = category.trim();
  return normalizedCategory === "All events" || entry.category === normalizedCategory;
}
