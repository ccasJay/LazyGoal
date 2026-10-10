import type { BrowserTrajectoryEntry } from "../../../packages/web-contracts/src/index";

/**
 * 判定轨迹事件条目是否匹配当前的检索条件与类别过滤。
 *
 * @remarks
 * 用于时间轴泳道刻度的双态投影（高亮与半透明弱化）以及详情检查器中“未命中当前过滤”状态徽章的显隐控制。
 * 纯内存计算，不发起网络请求且不产生副作用。
 *
 * @param entry - 待检查的轨迹事件条目。
 * @param query - 用户输入的检索关键字（支持空格分隔与大小写不敏感匹配）。
 * @param category - 用户选中的事件类别（如 "All events", "tool", "decision", "commit" 等）。
 * @returns 当事件同时满足类别要求与检索关键字时返回 `true`；若任意一项不满足则返回 `false`。
 *
 * @example
 * ```ts
 * const matched = isEventMatched(entry, "read_file", "tool");
 * if (!matched) {
 *   // 应用弱化样式 (opacity: 0.25)
 * }
 * ```
 */
export function isEventMatched(
  entry: BrowserTrajectoryEntry,
  query: string,
  category: string,
): boolean {
  const normalizedCategory = category.trim();
  if (normalizedCategory !== "All events" && entry.category !== normalizedCategory) {
    return false;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const searchableParts = [
    String(entry.sequence),
    entry.title,
    entry.category,
    entry.eventType,
    entry.preview ?? "",
    entry.inputPreview ?? "",
    entry.resultPreview ?? "",
    entry.actionId ?? "",
  ];

  const haystack = searchableParts.join(" ").toLowerCase();
  return haystack.includes(normalizedQuery);
}
