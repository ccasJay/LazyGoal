import type { BrowserTrajectoryEntry } from "../../../packages/web-contracts/src/index";

/**
 * Trajectory 概览轨道的投影模式。
 *
 * @remarks
 * `sequence` 忽略事件之间的时间空档，为每个事件分配等宽 slot；`time` 按记录时间
 * 将整段 Run 映射到可用宽度。两种模式都保证内容宽度不小于视口宽度。
 */
export type TrajectoryTimelineMode = "sequence" | "time";

/**
 * 轨道上的连续事件区间，边界使用已提交事件的 sequence。
 *
 * @example
 * ```ts
 * const range: TrajectoryTimelineRange = { fromSequence: 2, toSequence: 8 };
 * ```
 */
export interface TrajectoryTimelineRange {
  readonly fromSequence: number;
  readonly toSequence: number;
}

/**
 * 单条事件在轨道内容中的像素位置。
 *
 * @example
 * ```ts
 * const span: TrajectoryTimelineSpan = { left: 12, width: 8, top: 21 };
 * ```
 */
export interface TrajectoryTimelineSpan {
  readonly left: number;
  readonly width: number;
  readonly top: number;
}

/** 轨道三行泳道的固定几何。 */
export const TRACE_TIMELINE_GEOMETRY = {
  padding: 4,
  barWidth: 8,
} as const;

/**
 * 判断事件是否属于主轨迹流，而不是被列表默认收起的提交或观察事实。
 *
 * @param entry - 已提交轨迹事件。
 * @returns 事件应出现在概览轨道和主记录流中时为 `true`。
 * @example
 * ```ts
 * if (isPrimaryTimelineEntry(entry)) rows.push(entry);
 * ```
 */
export function isPrimaryTimelineEntry(entry: BrowserTrajectoryEntry): boolean {
  if (entry.category === "commit") return false;
  if (entry.eventType === "state_committed") return false;
  if (entry.eventType === "action_staged") return false;
  if (entry.eventType === "observation_recorded") return false;
  if (entry.eventType === "tool_finished") return false;
  return true;
}

/**
 * 提取概览轨道使用的主事件序列，保留传入顺序。
 *
 * @param entries - 当前已加载的轨迹事件。
 * @returns 过滤后的只读事件数组。
 * @example
 * ```ts
 * const timelineEntries = primaryTimelineEntries(page.entries);
 * ```
 */
export function primaryTimelineEntries(
  entries: readonly BrowserTrajectoryEntry[],
): readonly BrowserTrajectoryEntry[] {
  return entries.filter(isPrimaryTimelineEntry);
}

/**
 * 判断事件时间是否足以支撑按真实时间投影。
 *
 * @param entries - 当前已加载的轨迹事件。
 * @returns 至少两个有效、单调不减且跨度大于零时为 `true`。
 * @example
 * ```ts
 * const canShowTime = timelineTimesValid(entries);
 * ```
 */
export function timelineTimesValid(entries: readonly BrowserTrajectoryEntry[]): boolean {
  if (entries.length < 2) return false;
  let previous = Number.NEGATIVE_INFINITY;
  let first = Number.NaN;
  let last = Number.NaN;
  for (const entry of entries) {
    const time = Date.parse(entry.occurredAt);
    if (!Number.isFinite(time) || time < previous) return false;
    if (Number.isNaN(first)) first = time;
    last = time;
    previous = time;
  }
  return last > first;
}

/**
 * 将事件映射到输入、模型或工具泳道。
 *
 * @param entry - 已提交轨迹事件。
 * @returns 对应的泳道名称。
 * @example
 * ```ts
 * const lane = timelineLane(entry);
 * ```
 */
export function timelineLane(entry: BrowserTrajectoryEntry): "context" | "model" | "tools" {
  if (entry.category === "tool" || entry.category === "action") return "tools";
  if (entry.category === "decision" || entry.category === "memory") return "model";
  return "context";
}

/**
 * 返回事件在 50px 轨道内的顶部偏移。
 *
 * @param entry - 已提交轨迹事件。
 * @returns 对应泳道的顶部像素偏移。
 * @example
 * ```ts
 * const top = timelineLaneTop(entry);
 * ```
 */
export function timelineLaneTop(entry: BrowserTrajectoryEntry): number {
  const lane = timelineLane(entry);
  return 7 + (lane === "model" ? 14 : lane === "tools" ? 28 : 0);
}

/**
 * 计算轨道内容宽度，保证任何模式下都不小于视口宽度。
 *
 * @param viewportWidth - 可见轨道宽度。
 * @param mode - 当前投影模式。
 * @param zoom - Sequence 模式的放大倍率；Time 模式忽略。
 * @returns 不小于 `viewportWidth` 的内容宽度。
 * @example
 * ```ts
 * const width = timelineContentWidth(900, "sequence", 2);
 * ```
 */
export function timelineContentWidth(
  viewportWidth: number,
  mode: TrajectoryTimelineMode,
  zoom: number,
): number {
  const width = Math.max(1, viewportWidth);
  if (mode === "time") return width;
  return Math.max(width, Math.round(width * Math.max(1, zoom)));
}

function sequenceSpan(
  index: number,
  count: number,
  width: number,
  compact: boolean,
): TrajectoryTimelineSpan {
  const geometry = TRACE_TIMELINE_GEOMETRY;
  const usable = Math.max(1, width - geometry.padding * 2);
  const slot = usable / Math.max(1, count);
  const gap = count > 1 ? Math.min(2, Math.max(.5, slot * .08)) : 0;
  const compactWidth = Math.max(2, Math.min(geometry.barWidth, slot - gap));
  if (compact) {
    const center = count <= 1
      ? geometry.padding + usable / 2
      : geometry.padding + compactWidth / 2 + index / (count - 1) * (usable - compactWidth);
    return { left: center - compactWidth / 2, width: compactWidth, top: 0 };
  }
  const left = index === 0 ? geometry.padding : geometry.padding + index * slot + gap / 2;
  const right = index === count - 1 ? width - geometry.padding : geometry.padding + (index + 1) * slot - gap / 2;
  return { left, width: Math.max(2, right - left), top: 0 };
}

/**
 * 计算单个事件在轨道内容中的像素位置。
 *
 * @param entry - 已提交轨迹事件。
 * @param index - 事件在主事件序列中的索引。
 * @param entries - 完整主事件序列。
 * @param mode - 当前投影模式。
 * @param compact - Sequence 模式是否使用紧凑标记。
 * @param width - 轨道内容宽度。
 * @returns 事件块的左边界、宽度和顶部偏移。
 * @example
 * ```ts
 * const span = timelineSpan(entry, 0, entries, "sequence", false, 900);
 * ```
 */
export function timelineSpan(
  entry: BrowserTrajectoryEntry,
  index: number,
  entries: readonly BrowserTrajectoryEntry[],
  mode: TrajectoryTimelineMode,
  compact: boolean,
  width: number,
): TrajectoryTimelineSpan {
  const geometry = TRACE_TIMELINE_GEOMETRY;
  const top = timelineLaneTop(entry);
  if (mode === "time" && timelineTimesValid(entries)) {
    const first = Date.parse(entries[0]!.occurredAt);
    const last = Date.parse(entries.at(-1)!.occurredAt);
    const usable = Math.max(1, width - geometry.padding * 2);
    const center = geometry.padding + (Date.parse(entry.occurredAt) - first) / (last - first) * usable;
    return {
      left: Math.max(geometry.padding, Math.min(width - geometry.padding - geometry.barWidth, center - geometry.barWidth / 2)),
      width: geometry.barWidth,
      top,
    };
  }
  return { ...sequenceSpan(index, entries.length, width, compact), top };
}

/**
 * 把一次水平拖拽转换成事件序号区间。
 *
 * @param entries - 完整主事件序列。
 * @param mode - 当前投影模式。
 * @param compact - Sequence 模式是否使用紧凑标记。
 * @param width - 轨道内容宽度。
 * @param startX - 拖拽起点在内容坐标中的位置。
 * @param endX - 拖拽终点在内容坐标中的位置。
 * @returns 起止事件 sequence；区间内没有事件时返回 `null`。
 * @example
 * ```ts
 * const range = timelineSequenceRange(entries, "sequence", false, 900, 120, 420);
 * ```
 */
export function timelineSequenceRange(
  entries: readonly BrowserTrajectoryEntry[],
  mode: TrajectoryTimelineMode,
  compact: boolean,
  width: number,
  startX: number,
  endX: number,
): TrajectoryTimelineRange | null {
  const left = Math.min(startX, endX);
  const right = Math.max(startX, endX);
  let from: number | null = null;
  let to: number | null = null;
  entries.forEach((entry, index) => {
    const span = timelineSpan(entry, index, entries, mode, compact, width);
    const center = span.left + span.width / 2;
    if (center < left || center > right) return;
    from = from === null ? entry.sequence : Math.min(from, entry.sequence);
    to = to === null ? entry.sequence : Math.max(to, entry.sequence);
  });
  return from === null || to === null ? null : { fromSequence: from, toSequence: to };
}

/**
 * 计算相邻 Step 的边界位置，用于轨道上的细竖线。
 *
 * @param entries - 完整主事件序列。
 * @param mode - 当前投影模式。
 * @param compact - Sequence 模式是否使用紧凑标记。
 * @param width - 轨道内容宽度。
 * @returns 每个新 Step 首个事件的位置。
 * @example
 * ```ts
 * const boundaries = timelineStepBoundaries(entries, "sequence", false, 900);
 * ```
 */
export function timelineStepBoundaries(
  entries: readonly BrowserTrajectoryEntry[],
  mode: TrajectoryTimelineMode,
  compact: boolean,
  width: number,
): readonly number[] {
  const seen = new Set<number>();
  const boundaries: number[] = [];
  entries.forEach((entry, index) => {
    if (entry.stepIndex === undefined || entry.stepIndex === 0 || seen.has(entry.stepIndex)) return;
    seen.add(entry.stepIndex);
    boundaries.push(timelineSpan(entry, index, entries, mode, compact, width).left);
  });
  return boundaries;
}
