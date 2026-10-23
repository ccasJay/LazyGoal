import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import type { BrowserTrajectoryEntry } from "../../../packages/web-contracts/src/index";
import {
  primaryTimelineEntries,
  timelineContentWidth,
  timelineLane,
  timelineSequenceRange,
  timelineSpan,
  timelineStepBoundaries,
  timelineTimesValid,
  type TrajectoryTimelineMode,
  type TrajectoryTimelineRange,
} from "./trajectory-timeline-model";

/**
 * 概览轨道交互回调。
 *
 * @remarks
 * 选择只改变详情焦点，不修改已提交轨迹；range 变化由调用方转换为轨迹查询，
 * zoom 只改变前端投影，不重新读取事件。
 *
 * @example
 * ```tsx
 * const props: TrajectoryTimelineProps = {
 *   entries, mode: "sequence", compact: false, zoom: 1,
 *   selectedSequence: null, range: null, isMatched: () => true,
 *   onSelect() {}, onRangeChange() {}, onZoomChange() {},
 * };
 * ```
 */
export interface TrajectoryTimelineProps {
  /** 当前已加载的轨迹事件。 */
  readonly entries: readonly BrowserTrajectoryEntry[];
  /** 事件投影模式。 */
  readonly mode: TrajectoryTimelineMode;
  /** Sequence 模式是否使用紧凑标记。 */
  readonly compact: boolean;
  /** Sequence 模式放大倍率，范围 1–4。 */
  readonly zoom: number;
  /** 当前选中的事件 sequence。 */
  readonly selectedSequence: number | null;
  /** 当前服务端范围过滤边界。 */
  readonly range: TrajectoryTimelineRange | null;
  /** 判断事件是否匹配当前搜索和类别过滤。 */
  readonly isMatched: (entry: BrowserTrajectoryEntry) => boolean;
  /** 选择事件用于打开详情。 */
  readonly onSelect: (entry: BrowserTrajectoryEntry) => void;
  /** 提交或清除连续事件范围。 */
  readonly onRangeChange: (range: TrajectoryTimelineRange | null) => void;
  /** 更新 Sequence 模式倍率。 */
  readonly onZoomChange: (zoom: number) => void;
}

function eventSequenceTarget(target: EventTarget | null): number | null {
  if (!(target instanceof HTMLElement)) return null;
  const value = target.closest<HTMLElement>("[data-timeline-sequence]")?.dataset.timelineSequence;
  if (value === undefined) return null;
  const sequence = Number(value);
  return Number.isFinite(sequence) ? sequence : null;
}

/**
 * 50px 三泳道轨迹概览，提供点击选择、拖拽范围、右键平移和滚轮缩放。
 *
 * @remarks
 * Sequence 模式始终填充可视宽度，滚轮只放大不缩小到 Fit 以下；Time 模式
 * 按记录时间映射整段 Run。轨道只发出交互意图，查询与详情由父组件负责。
 *
 * @example
 * ```tsx
 * <TrajectoryTimeline
 *   entries={entries}
 *   mode="sequence"
 *   compact={false}
 *   zoom={1}
 *   selectedSequence={selected}
 *   range={range}
 *   isMatched={entry => isEventMatched(entry, query, category)}
 *   onSelect={entry => selectEvent(entry.sequence)}
 *   onRangeChange={setRange}
 *   onZoomChange={setTimelineZoom}
 * />
 * ```
 */
export function TrajectoryTimeline({
  entries,
  mode,
  compact,
  zoom,
  selectedSequence,
  range,
  isMatched,
  onSelect,
  onRangeChange,
  onZoomChange,
}: TrajectoryTimelineProps) {
  const events = useMemo(() => primaryTimelineEntries(entries), [entries]);
  const timesValid = useMemo(() => timelineTimesValid(events), [events]);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; startClientX: number; moved: boolean } | null>(null);
  const pan = useRef<{ pointerId: number; startClientX: number; startScrollLeft: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const pendingAnchor = useRef<{ fraction: number; offset: number } | null>(null);
  const width = timelineContentWidth(viewportWidth, mode, zoom);
  const selected = selectedSequence === null ? null : events.find(entry => entry.sequence === selectedSequence) ?? null;

  useEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const measure = () => setViewportWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const wheel = (event: globalThis.WheelEvent) => {
      if (mode !== "sequence") return;
      event.preventDefault();
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        element.scrollLeft += event.deltaX;
        return;
      }
      const rect = element.getBoundingClientRect();
      const anchor = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, element.clientWidth)));
      const next = Math.max(1, Math.min(4, zoom * Math.exp(-event.deltaY * .0015)));
      if (Math.abs(next - zoom) < .0001) return;
      pendingAnchor.current = { fraction: anchor, offset: event.clientX - rect.left };
      onZoomChange(next);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [mode, onZoomChange, zoom]);

  const ensureSelectedVisible = useCallback(() => {
    const element = viewport.current;
    if (element === null || selected === null) return;
    const index = events.findIndex(entry => entry.sequence === selected.sequence);
    if (index < 0) return;
    const span = timelineSpan(selected, index, events, mode, compact, width);
    const margin = 20;
    if (span.left < element.scrollLeft + margin) element.scrollLeft = Math.max(0, span.left - margin);
    else if (span.left + span.width > element.scrollLeft + element.clientWidth - margin) {
      element.scrollLeft = Math.min(element.scrollWidth - element.clientWidth, span.left + span.width - element.clientWidth + margin);
    }
  }, [compact, events, mode, selected, width]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const anchor = pendingAnchor.current;
    if (anchor !== null) {
      element.scrollLeft = Math.max(0, anchor.fraction * width - anchor.offset);
      pendingAnchor.current = null;
    }
    ensureSelectedVisible();
  }, [ensureSelectedVisible, selectedSequence, width]);

  const contentX = (clientX: number): number => {
    const rect = track.current?.getBoundingClientRect();
    if (rect === undefined) return 0;
    return Math.max(0, Math.min(width, clientX - rect.left));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const element = viewport.current;
    if (element === null) return;
    if (event.button === 2) {
      pan.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startScrollLeft: element.scrollLeft,
        moved: false,
      };
      suppressClick.current = false;
      try { element.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    const x = contentX(event.clientX);
    drag.current = { pointerId: event.pointerId, startX: x, startClientX: event.clientX, moved: false };
    suppressClick.current = false;
    try { element.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const element = viewport.current;
    if (element === null) return;
    if (pan.current !== null && pan.current.pointerId === event.pointerId) {
      const delta = event.clientX - pan.current.startClientX;
      if (Math.abs(delta) >= 3) pan.current.moved = true;
      element.scrollLeft = Math.max(0, pan.current.startScrollLeft - delta);
      return;
    }
    if (drag.current !== null && drag.current.pointerId === event.pointerId) {
      if (Math.abs(event.clientX - drag.current.startClientX) >= 3) drag.current.moved = true;
      const current = contentX(event.clientX);
      setDraft({ start: Math.min(drag.current.startX, current), end: Math.max(drag.current.startX, current) });
      setHover(null);
      return;
    }
    setHover(contentX(event.clientX));
  };

  const release = (pointerId: number) => {
    const element = viewport.current;
    if (element === null) return;
    try {
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    } catch { /* synthetic pointer */ }
  };

  const finishPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (pan.current !== null && pan.current.pointerId === event.pointerId) {
      const moved = pan.current.moved;
      pan.current = null;
      release(event.pointerId);
      if (moved) suppressClick.current = true;
      return;
    }
    if (drag.current === null || drag.current.pointerId !== event.pointerId) return;
    const startX = drag.current.startX;
    const moved = drag.current.moved;
    drag.current = null;
    release(event.pointerId);
    setDraft(null);
    if (!moved) return;
    const current = contentX(event.clientX);
    const next = timelineSequenceRange(events, mode, compact, width, startX, current);
    suppressClick.current = true;
    onRangeChange(next);
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    const sequence = eventSequenceTarget(event.target);
    if (sequence !== null) {
      const entry = events.find(item => item.sequence === sequence);
      if (entry !== undefined) onSelect(entry);
      return;
    }
    if (events.length === 0) return;
    const x = contentX(event.clientX);
    let nearest = events[0]!;
    let distance = Number.POSITIVE_INFINITY;
    events.forEach((entry, index) => {
      const span = timelineSpan(entry, index, events, mode, compact, width);
      const current = Math.abs(span.left + span.width / 2 - x);
      if (current < distance) { distance = current; nearest = entry; }
    });
    onSelect(nearest);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const visible = events.filter(isMatched);
    if (visible.length === 0) return;
    const index = visible.findIndex(entry => entry.sequence === selectedSequence);
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = visible[Math.max(0, Math.min(visible.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)))];
      if (next !== undefined) onSelect(next);
    } else if (event.key === "Home") {
      event.preventDefault();
      onSelect(visible[0]!);
    } else if (event.key === "End") {
      event.preventDefault();
      onSelect(visible.at(-1)!);
    } else if (event.key === "Escape" && range !== null) {
      event.preventDefault();
      onRangeChange(null);
    }
  };

  const boundaries = useMemo(
    () => timelineStepBoundaries(events, mode, compact, width),
    [compact, events, mode, width],
  );
  const committed = range === null
    ? null
    : (() => {
      let start = Number.POSITIVE_INFINITY;
      let end = Number.NEGATIVE_INFINITY;
      events.forEach((entry, index) => {
        if (entry.sequence < range.fromSequence || entry.sequence > range.toSequence) return;
        const span = timelineSpan(entry, index, events, mode, compact, width);
        start = Math.min(start, span.left);
        end = Math.max(end, span.left + span.width);
      });
      return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
    })();
  const visibleSelection = draft ?? committed;

  return <section className="tr-timeline" aria-label="Trajectory timeline">
    <div className="tr-timeline-labels" aria-hidden="true"><span>Context</span><span>Model</span><span>Tools</span></div>
    <div
      className="tr-plot tr-timeline-viewport"
      ref={viewport}
      data-mode={mode}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onPointerLeave={() => { if (drag.current === null && pan.current === null) setHover(null); }}
      onContextMenu={event => event.preventDefault()}
      onClick={onClick}
    >
      <div
        className="tr-timeline-track"
        ref={track}
        style={{ width }}
        tabIndex={0}
        role="application"
        aria-label="Trajectory timeline overview. Use left and right arrows to move between events. Scroll to zoom in Sequence mode. Right-drag to pan."
        onKeyDown={onKeyDown}
      >
        {boundaries.map(left => <span className="tr-timeline-boundary" key={left} style={{ left }} aria-hidden="true"/>)}
        {events.map((entry, index) => {
          const span = timelineSpan(entry, index, events, mode, compact, width);
          const lane = timelineLane(entry);
          const error = entry.eventType === "run_failed" || entry.eventType === "execution_error";
          return <button
            type="button"
            key={entry.eventId}
            tabIndex={-1}
            className={`tr-span ${lane === "model" ? "decision" : lane === "tools" ? "tool" : "lifecycle"} ${entry.sequence === selectedSequence ? "selected" : ""} ${isMatched(entry) ? "" : "dimmed"} ${error ? "error" : ""}`}
            style={{ left: span.left, top: span.top, width: span.width }}
            data-timeline-sequence={entry.sequence}
            aria-label={`Locate trajectory event ${entry.sequence}`}
            title={`#${entry.sequence} ${entry.title}`}
          />;
        })}
        {visibleSelection !== null && <span className="tr-timeline-selection" style={{ left: visibleSelection.start, width: Math.max(1, visibleSelection.end - visibleSelection.start) }} aria-hidden="true"/>}
        {hover !== null && <span className="tr-timeline-hover" style={{ left: hover }} aria-hidden="true"/>}
        {events.length === 0 && <span className="tr-timeline-empty">No committed trajectory yet.</span>}
      </div>
    </div>
  </section>;
}
