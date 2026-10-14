import { EventSummary } from "./trajectory-event-summary";
import { requestResult } from "./trajectory-presentation";
import { Fragment, useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Check, ChevronRight, Copy, FileText, Hand, Layers, Minus, Plus, RotateCcw, Search, Terminal, X, Zap } from "lucide-react";
import type {
  BrowserGoalSession,
  BrowserModelInputSummary,
  BrowserTrajectoryDetail,
  BrowserTrajectoryEntry,
  BrowserTrajectoryPage,
  BrowserTrajectoryRun,
} from "../../../packages/web-contracts/src/index";
import { BrowserApiError, browserApi } from "./api";
import "./trajectory.css";
import { TrajectoryRecords } from "./trajectory-records";
import { ModelInputInspector, type ModelInputSelection } from "./model-input-inspector";
import { EMPTY_TRAJECTORY_PAGE_WINDOW, receiveTrajectoryPage, viewedThrough } from "./trajectory-page-window";
import { resolveActiveDetailTab } from "./trajectory-tab-memory";
import { isEventMatched } from "./trajectory-event-filter";
import { MIN_ZOOM, MAX_ZOOM, MIN_VIEW_WIDTH, MAX_VIEW_WIDTH, clampViewport, shiftViewport, scaleViewport } from "./trajectory-viewport";

type Target = { runId: string; executionUnitId: string; nonce: number };
type Inspection = { kind: "event"; sequence: number } | { kind: "input"; input: ModelInputSelection; nonce: number };
type WindowQuery = { after?: number; before?: number; executionUnitId?: string };
const categoryLabels = ["All events", "lifecycle", "decision", "memory", "action", "tool", "observation", "terminal", "commit"];
const groupOf = (entry: BrowserTrajectoryEntry) => entry.executionUnitId !== undefined && entry.stepIndex !== undefined ? entry.executionUnitId : "run";
const laneOf = (entry: BrowserTrajectoryEntry) => ["tool", "action", "observation"].includes(entry.category) ? "tool" : ["decision", "memory"].includes(entry.category) ? "decision" : "lifecycle";
const json = (value: unknown) => JSON.stringify(value, null, 2);
const detailSummary = (event: BrowserTrajectoryDetail["event"]) => event.eventType === "model_repair_attempt_started"
  ? event.payload.attempt === 1 ? "Initial model request; no output has been rejected." : "Retry after rejected model output."
  : event.eventType.replaceAll("_", " ");
const detailTitle = (event: BrowserTrajectoryDetail["event"]) => event.eventType === "model_repair_attempt_started"
  ? event.payload.attempt === 1 ? "Model request" : "Output retry"
  : event.eventType === "model_repair_feedback_recorded" ? "Output rejected"
  : event.eventType === "execution_error" ? "Execution stopped" : event.eventType;
const inspectionTitle = (entry: BrowserTrajectoryEntry | undefined, detail: BrowserTrajectoryDetail | null) =>
  entry?.eventType === "tool_started" ? entry.title.replace(/^tool_started: /, "") : detail ? detailTitle(detail.event) : entry?.title ?? "Event details";

export function Trajectory({ session, target }: { session: BrowserGoalSession; target: Target | null }) {
  const [inputCalls, setInputCalls] = useState<BrowserModelInputSummary[]>([]);
  const [showSteps, setShowSteps] = useState(true);
  const [showRequests, setShowRequests] = useState(true);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const inputNonce = useRef(0);
  const selected = inspection?.kind === "event" ? inspection.sequence : null;
  const selectedInput = inspection?.kind === "input" ? inspection.input : null;
  const [runId, setRunId] = useState(target?.runId ?? session.currentRunId);
  const [runs, setRuns] = useState<BrowserTrajectoryRun[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [page, setPage] = useState<BrowserTrajectoryPage | null>(null);
  const [pageWindow, setPageWindow] = useState(EMPTY_TRAJECTORY_PAGE_WINDOW);
  const loadedPages = pageWindow.pages;
  const viewPageIndex = pageWindow.viewIndex;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All events");
  const [windowQuery, setWindowQuery] = useState<WindowQuery>(target === null ? {} : { executionUnitId: target.executionUnitId });
  const [range, setRange] = useState<[number, number] | null>(null);
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const [viewport, setViewport] = useState<[number, number]>([0, 1]);
  const [panMode, setPanMode] = useState(false);
  const [panning, setPanning] = useState(false);
  const [duration, setDuration] = useState(true);
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [detail, setDetail] = useState<BrowserTrajectoryDetail | null>(null);
  const [recordsRevealVersion, setRecordsRevealVersion] = useState(0);
  const [preferredDetailTab, setPreferredDetailTab] = useState<string | null>("Summary");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [copyStatus, setCopyStatus] = useState("Copy JSON");
  const ledger = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const panStart = useRef<{ fraction: number; viewport: [number, number] } | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const follow = useRef(target === null);
  const inspectionRef = useRef<Inspection | null>(null);
  const savedScroll = useRef(0);
  const pageRef = useRef<BrowserTrajectoryPage | null>(null);
  const pageScopeRef = useRef<string | null>(null);
  const pageNavigation = useRef<"replace" | "prepend" | "append">("replace");
  const focusTarget = useRef<number | null>(null);
  const pageFocusCandidates = useRef<number[] | null>(null);
  inspectionRef.current = inspection;
  pageRef.current = page;
  const pageScope = JSON.stringify({
    goalId: session.goalId,
    runId,
    search,
    category,
    range,
    executionUnitId: windowQuery.executionUnitId ?? null,
    refresh,
  });

  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      const isHorizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const anchor = bounds.width > 0 ? Math.max(0, Math.min(1, (event.clientX - bounds.left) / (bounds.width * .98))) : 0.5;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.width : 1;
      if (isHorizontal || event.shiftKey) {
        const delta = (event.deltaX || event.deltaY) * unit / (bounds.width || 1);
        setViewport(current => shiftViewport(current, delta * (current[1] - current[0])));
      } else {
        const factor = Math.exp(Math.max(-0.5, Math.min(0.5, event.deltaY * unit * .0025)));
        setViewport(current => scaleViewport(current, factor, anchor));
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => setSearch(query), 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogError(null);
    void (async () => {
      const all: BrowserTrajectoryRun[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const result = await browserApi.trajectoryRuns(session.goalId, offset, controller.signal);
        all.push(...result.runs); offset = result.nextOffset;
      }
      if (!controller.signal.aborted) setRuns(all);
    })().catch(reason => { if (!controller.signal.aborted) setCatalogError(errorText(reason)); });
    return () => controller.abort();
  }, [session, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    const scopeChanged = pageScopeRef.current !== pageScope;
    if (scopeChanged) {
      pageScopeRef.current = pageScope;
      pageNavigation.current = "replace";
      focusTarget.current = null;
      pageFocusCandidates.current = null;
      setPageWindow(EMPTY_TRAJECTORY_PAGE_WINDOW);
    }
    const navigation = scopeChanged ? "replace" : pageNavigation.current;
    pageNavigation.current = "replace";
    const params = new URLSearchParams({ runId });
    if (search) params.set("q", search);
    if (category !== "All events") params.set("category", category);
    if (range) { params.set("fromSequence", String(range[0])); params.set("toSequence", String(range[1])); }
    if (windowQuery.executionUnitId) params.set("executionUnitId", windowQuery.executionUnitId);
    else if (follow.current && pageRef.current?.run.runId === runId && pageRef.current.nextCursor === null && !search && category === "All events" && range === null) {
      params.set("before", String(Number.MAX_SAFE_INTEGER));
    } else if (windowQuery.before !== undefined) params.set("before", String(windowQuery.before));
    else if (windowQuery.after !== undefined) params.set("after", String(windowQuery.after));
    setLoading(true); setError(null);
    void browserApi.trajectory(session.goalId, params, controller.signal).then(next => {
      if (controller.signal.aborted) return;
      setPage(next);
      setPageWindow(current => receiveTrajectoryPage(current, next, navigation));
      if (navigation === "prepend") {
        pageFocusCandidates.current = next.entries.map(entry => entry.sequence);
      } else if (navigation === "append") {
        pageFocusCandidates.current = next.entries.map(entry => entry.sequence);
      }
      if (next.locatedSequence !== null && inspectionRef.current === null) {
        focusTarget.current = next.locatedSequence;
        setInspection({ kind: "event", sequence: next.locatedSequence });
      }
    }).catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [session, runId, search, category, range, windowQuery, refresh, pageScope]);

  useEffect(() => {
    if (selected === null) { setDetail(null); return; }
    const controller = new AbortController();
    setDetailLoading(true); setDetailError(null); setDetail(null); setCopyStatus("Copy JSON");
    void browserApi.trajectoryDetail(session.goalId, runId, selected, controller.signal).then(next => {
      if (!controller.signal.aborted) setDetail(next);
    }).catch(reason => { if (!controller.signal.aborted) setDetailError(errorText(reason)); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [session, runId, selected, refresh]);

  useEffect(() => {
    if (!ledger.current) return;
    const targetSequence = focusTarget.current ?? pageFocusCandidates.current?.find(sequence =>
      document.getElementById(`trajectory-event-${sequence}`) !== null,
    ) ?? null;
    if (targetSequence !== null) {
      const record = document.getElementById(`trajectory-event-${targetSequence}`);
      const container = ledger.current;
      if (record && container) {
        const offset = record.getBoundingClientRect().top - container.getBoundingClientRect().top;
        container.scrollTop = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + offset));
        savedScroll.current = container.scrollTop;
        record.focus({ preventScroll: true });
        focusTarget.current = null;
        pageFocusCandidates.current = null;
      }
    } else if (follow.current && !range && !search && category === "All events" && page?.nextCursor === null) ledger.current.scrollTop = ledger.current.scrollHeight;
    else ledger.current.scrollTop = savedScroll.current;
  }, [page, selected, allCollapsed, pageWindow, recordsRevealVersion]);

  const entries = page?.run.runId === runId
    ? [...new Map(loadedPages
      .filter(loaded => loaded.run.runId === runId)
      .flatMap(loaded => loaded.entries)
      .map(entry => [entry.sequence, entry] as const))
      .values()]
      .sort((left, right) => left.sequence - right.sequence)
    : [];
  useEffect(() => {
    if (loading || page?.run.runId !== runId || inspection?.kind !== "event" || entries.length === 0) return;
    if (!entries.some(entry => entry.sequence === inspection.sequence)) setInspection(null);
  }, [loading, pageWindow, page, runId, inspection, entries.length]);
  const canPage = windowQuery.executionUnitId === undefined;
  const earlierCursor = canPage ? loadedPages[0]?.previousCursor ?? null : null;
  const laterCursor = canPage ? loadedPages.at(-1)?.nextCursor ?? null : null;
  const canMoveEarlier = canPage && (viewPageIndex > 0 || earlierCursor !== null);
  const canMoveLater = canPage && (viewPageIndex < loadedPages.length - 1 || laterCursor !== null);
  const currentPosition = viewedThrough(pageWindow);
  const groups = [...new Set(entries.map(groupOf))];
  const blocks: { group: string; records: BrowserTrajectoryEntry[] }[] = [];
  for (const entry of entries) {
    const group = groupOf(entry);
    const previous = blocks.at(-1);
    if (previous?.group === group) previous.records.push(entry);
    else blocks.push({ group, records: [entry] });
  }
  const selectedEntry = entries.find(entry => entry.sequence === selected);
  const inspectedCall = inputCalls.find(call => call.callId === selectedInput?.callId);
  const inspectedResult = inspectedCall ? requestResult(inspectedCall, inputCalls, entries, !search && category === "All events") : undefined;
  const selectedModelCallId = selectedEntry?.modelCallId ?? inputCalls.find(call => requestResult(call, inputCalls, entries, !search && category === "All events").entry?.sequence === selectedEntry?.sequence)?.callId;
  const times = entries.map(entry => Date.parse(entry.occurredAt));
  const validTimes = times.length > 1 && times.every(Number.isFinite) && times.every((time, index) => index === 0 || time >= times[index - 1]! ) && times.at(-1)! > times[0]!;
  const timed = duration && validTimes;
  const first = entries[0]; const last = entries.at(-1);
  const position = (entry: BrowserTrajectoryEntry) => timed ? (Date.parse(entry.occurredAt) - times[0]!) / (times.at(-1)! - times[0]!) : (entry.sequence - (first?.sequence ?? 0)) / Math.max(1, (last?.sequence ?? 0) - (first?.sequence ?? 0));
  const viewWidth = viewport[1] - viewport[0];
  const viewPosition = (value: number) => (value - viewport[0]) / viewWidth;
  const visibleSeconds = timed ? (times.at(-1)! - times[0]!) * viewWidth / 1000 : 0;
  const timeDigits = visibleSeconds < 1 ? 3 : visibleSeconds < 10 ? 2 : 1;
  const zoomed = Math.abs(viewWidth - 1) > 0.001 || Math.abs(viewport[0]) > 0.001;
  useEffect(() => {
    setViewport([0, 1]); setDraft(null); dragStart.current = null; panStart.current = null; setPanning(false);
  }, [runId, timed, first?.eventId]);
  const selectedRun = runs.find(run => run.runId === runId) ?? page?.run;

  function select(entry: BrowserTrajectoryEntry) {
    follow.current = false; focusTarget.current = entry.sequence; pageFocusCandidates.current = null;
    setInspection({ kind: "event", sequence: entry.sequence }); setPreferredDetailTab("Summary");
  }
  function selectTimeline(entry: BrowserTrajectoryEntry) {
    follow.current = false; focusTarget.current = entry.sequence; pageFocusCandidates.current = null;
    setInspection({ kind: "event", sequence: entry.sequence });
  }
  function navigateAdjacent(entry: BrowserTrajectoryEntry) {
    follow.current = false; focusTarget.current = null; pageFocusCandidates.current = null;
    setInspection({ kind: "event", sequence: entry.sequence });
  }
  function inspectInput(input: ModelInputSelection) {
    follow.current = false;
    setInspection({ kind: "input", input, nonce: ++inputNonce.current });
  }
  function switchRun(id: string) {
    pageFocusCandidates.current = null;
    setInputCalls([]); setRunId(id); setPage(null); setPageWindow(EMPTY_TRAJECTORY_PAGE_WINDOW); setInspection(null); setDetail(null); setWindowQuery({}); setRange(null); setQuery(""); setSearch(""); setCategory("All events"); setAllCollapsed(false);
    follow.current = true; savedScroll.current = 0;
  }
  function resetWindow() { follow.current = false; savedScroll.current = 0; setViewport([0, 1]); setWindowQuery({}); }
  function loadEarlier() {
    focusTarget.current = null;
    pageFocusCandidates.current = null;
    if (viewPageIndex > 0) {
      pageFocusCandidates.current = loadedPages[viewPageIndex - 1]?.entries.map(entry => entry.sequence) ?? null;
      setPageWindow(current => ({ ...current, viewIndex: Math.max(0, current.viewIndex - 1) }));
      follow.current = false;
      return;
    }
    if (earlierCursor === null) return;
    follow.current = false;
    pageNavigation.current = "prepend";
    setWindowQuery({ before: earlierCursor });
  }
  function loadLater() {
    focusTarget.current = null;
    pageFocusCandidates.current = null;
    if (viewPageIndex < loadedPages.length - 1) {
      pageFocusCandidates.current = loadedPages[viewPageIndex + 1]?.entries.map(entry => entry.sequence) ?? null;
      setPageWindow(current => ({ ...current, viewIndex: Math.min(current.pages.length - 1, current.viewIndex + 1) }));
      follow.current = false;
      return;
    }
    if (laterCursor === null) return;
    follow.current = false;
    pageNavigation.current = "append";
    setWindowQuery({ after: laterCursor });
  }
  function fraction(event: PointerEvent<HTMLDivElement>) { const bounds = event.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(1, (event.clientX - bounds.left) / (bounds.width * .98))); }
  function finishRange(event: PointerEvent<HTMLDivElement>) {
    if (panStart.current !== null) {
      panStart.current = null; setPanning(false);
      return;
    }
    if (dragStart.current !== null) {
      const start = dragStart.current; const end = fraction(event);
      if (Math.abs(start - end) > .015) {
        const chosen = entries.filter(entry => viewPosition(position(entry)) >= Math.min(start, end) && viewPosition(position(entry)) <= Math.max(start, end));
        if (chosen.length) { setInspection(null); setRange([chosen[0]!.sequence, chosen.at(-1)!.sequence]); resetWindow(); }
      }
    }
    dragStart.current = null; setDraft(null);
  }
  async function copy() {
    if (!detail) return;
    try { await navigator.clipboard.writeText(json(detail.event)); setCopyStatus("Copied"); }
    catch { setCopyStatus("Copy failed"); }
  }
  const detailTabs = ["Summary", ...(detail?.input !== undefined ? ["Input"] : []), ...(detail?.result !== undefined || detail?.toolFinished !== undefined ? ["Result"] : []), "Timing", "Raw"];
  const activeTab = resolveActiveDetailTab(detailTabs, preferredDetailTab);
  const eventStatus = detail?.event.eventType === "execution_error" || detail?.event.eventType === "run_failed" || detail?.event.eventType === "model_repair_feedback_recorded" ? "Failed"
    : detail?.observationConfirmed && detail.toolFinished ? "Observation committed"
    : selectedEntry?.eventType === "tool_started" ? "Started"
    : selectedEntry?.eventType === "run_completed" ? "Completed"
    : "Recorded";
  return <div className="trajectory-view compact-real trace-workbench" aria-label="Run trajectory" aria-busy={loading}>
    <div className="tr-runbar"><div className="tr-page-title"><h2>Execution trajectory</h2><span>Inspect what the agent saw and called</span></div><select id="trajectory-run-select" name="runId" aria-label="Select trajectory run" value={runId} onChange={event => switchRun(event.target.value)}>
      {runs.length === 0 && <option value={runId}>{runId.slice(0, 12)}</option>}
      {runs.map((run, index) => <option key={run.runId} value={run.runId}>{run.current ? "Current Run" : `Earlier Run ${runs.length - index}`} · {run.runId.slice(0, 8)}</option>)}
    </select><span className={`tr-status ${selectedRun?.status === "failed" ? "failed" : ""}`}>{selectedRun?.status ?? "Loading"}</span><span className="tr-event-count">{page?.committedCount ?? "—"} committed events</span></div>
    {(error || catalogError) && <div role="alert" className="tr-feedback">{error ?? catalogError}{page && " Displayed data has not been updated."}<button onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
    <div className="tr-overview-controls"><div className="tr-overview-heading"><strong>Run overview</strong><span className="tr-coverage" role="status">{loading ? "Loading committed trajectory…" : `${first ? `#${first.sequence}–#${last!.sequence}` : "no events"} · ${entries.length} of ${page?.total ?? 0} matches`}{!timed && " · Sequence view"}</span></div>
      <div className="tr-legend" aria-hidden="true"><span className="input">Input</span><span className="model">Model</span><span className="tool">Tools</span></div>
      <div className="tr-zoom-controls" role="group" aria-label="Timeline navigation">
        <button aria-label="Switch timeline scale" aria-pressed={timed} className={timed ? "enabled" : ""} disabled={!validTimes} title={validTimes ? "Switch between recorded time and event sequence" : "Recorded timing unavailable; showing sequence"} onClick={() => setDuration(!duration)}><span className="tr-toggle"/></button>
        <button aria-label="Zoom out timeline" title="Zoom out (−)" disabled={viewWidth >= MAX_VIEW_WIDTH - 0.0001 || entries.length < 2} onClick={() => setViewport(current => scaleViewport(current, 2, .5))}><Minus size={12}/></button>
        <span className="tr-zoom-level" aria-live="polite">{Number((1 / viewWidth).toFixed(1))}×</span>
        <button aria-label="Zoom in timeline" title="Zoom in (+); scroll over the timeline to zoom at the pointer" disabled={viewWidth <= MIN_VIEW_WIDTH + 0.0001 || entries.length < 2} onClick={() => setViewport(current => scaleViewport(current, .5, .5))}><Plus size={12}/></button>
        <button aria-label="Pan timeline" aria-pressed={panMode} title="Drag to pan; Shift + drag also pans" disabled={entries.length < 2} onClick={() => setPanMode(!panMode)}><Hand size={12}/></button>
        <button aria-label="Reset timeline zoom" title="Show the full page range (Home)" disabled={!zoomed} onClick={() => setViewport([0, 1])}><RotateCcw size={12}/></button>
      </div>
    </div>
    <section className="tr-overview" aria-label="Trajectory overview"><div className="tr-lane-labels"><span>Input</span><span>Model</span><span>Tools</span></div><div ref={plot} className={`tr-plot ${panMode ? "pan-mode" : ""} ${panning ? "panning" : ""}`} tabIndex={0} aria-label="Trajectory timeline" title="Scroll to zoom; Shift + drag or horizontal scroll to pan; drag to filter a range; Escape to clear" onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      if (["+", "=", "-", "ArrowLeft", "ArrowRight", "Home", "Escape"].includes(event.key)) event.preventDefault();
      if (event.key === "+" || event.key === "=") setViewport(current => scaleViewport(current, .5, .5));
      else if (event.key === "-") setViewport(current => scaleViewport(current, 2, .5));
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") setViewport(current => shiftViewport(current, (current[1] - current[0]) * (event.key === "ArrowLeft" ? -.2 : .2)));
      else if (event.key === "Home") setViewport([0, 1]);
      else if (event.key === "Escape") { setRange(null); setDraft(null); resetWindow(); }
    }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        suppressClick.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
        if (panMode || event.shiftKey) { panStart.current = { fraction: fraction(event), viewport }; setPanning(true); }
        else dragStart.current = fraction(event);
      }} onPointerMove={event => {
        if (panStart.current !== null) {
          const start = panStart.current;
          const delta = start.fraction - fraction(event);
          if (Math.abs(delta) > .003) suppressClick.current = true;
          setViewport(shiftViewport(start.viewport, delta * (start.viewport[1] - start.viewport[0])));
        } else if (dragStart.current !== null) setDraft([Math.min(dragStart.current, fraction(event)), Math.max(dragStart.current, fraction(event))]);
      }} onPointerUp={finishRange} onPointerCancel={() => { dragStart.current = null; panStart.current = null; setPanning(false); setDraft(null); }} onDoubleClick={() => { setRange(null); resetWindow(); }}>
      <div className="tr-grid">{[0,25,50,75,100].map(n => <span key={n} style={{left: `${n}%`}}/>)}</div>
      {entries.filter(entry => entry.category !== "commit" && entry.category !== "observation" && entry.eventType !== "tool_finished").map(entry => {
        const end = timed && entry.eventType === "tool_started" && entry.actionId !== undefined ? entries.find(candidate => candidate.eventType === "tool_finished" && candidate.actionId === entry.actionId) : undefined;
        const left = viewPosition(position(entry)); const right = end ? viewPosition(position(end)) : left;
        if (right < 0 || left > 1) return null;
        const matched = !search && category === "All events" ? true : isEventMatched(entry, search, category);
        return <button key={entry.eventId} aria-label={`Locate trajectory event ${entry.sequence}`} title={`#${entry.sequence} ${entry.title}`} className={`tr-span ${laneOf(entry)} ${selected === entry.sequence ? "selected" : ""} ${entry.eventType === "run_failed" ? "error" : ""} ${!matched ? "dimmed" : ""}`} style={{left: `${Math.max(0, left)*98}%`, width: `${Math.max(.7, (Math.min(1, right)-Math.max(0, left))*98)}%`, top: laneOf(entry) === "tool" ? 62 : laneOf(entry) === "decision" ? 37 : 12}} onPointerDown={event => { suppressClick.current = false; if (!panMode && !event.shiftKey) event.stopPropagation(); }} onClick={() => { if (!suppressClick.current) selectTimeline(entry); }}/>;
      })}
      {inputCalls.filter(call => entries.some(entry => entry.executionUnitId !== undefined && entry.executionUnitId === call.executionUnitId)).map(call => {
        const linked = entries.find(entry => entry.modelCallId === call.callId) ?? entries.find(entry => entry.executionUnitId === call.executionUnitId)!;
        const fraction = viewPosition(timed ? (Date.parse(call.occurredAt) - times[0]!) / (times.at(-1)! - times[0]!) : position(linked));
        return !Number.isFinite(fraction) || fraction < 0 || fraction > 1 ? null : <button key={call.callId} className={`tr-span model-input ${selectedInput?.callId === call.callId ? "selected" : ""}`} aria-label={`Inspect input ${call.callId}`} title={`${call.stage} input · Step ${call.stepIndex}`} style={{left: `${fraction * 98}%`, width: '.7%', top: 12}} onPointerDown={event => { suppressClick.current = false; if (!panMode && !event.shiftKey) event.stopPropagation(); }} onClick={() => { if (!suppressClick.current) inspectInput({ callId: call.callId, tab: "Messages" }); }}/>;
      })}
      {draft && <div className="tr-range" style={{left: `${draft[0]*98}%`, width: `${(draft[1]-draft[0])*98}%`}}/>}
      <div className="tr-ruler">{[0,.25,.5,.75,1].map(n => <span key={n} style={{left: `${n*98}%`}}>{timed ? `${((times.at(-1)!-times[0]!)*(viewport[0]+viewWidth*n)/1000).toFixed(timeDigits)}s` : first ? Math.round(first.sequence + (last!.sequence-first.sequence)*(viewport[0]+viewWidth*n)) : "—"}</span>)}</div>
    </div></section>
    <div className={`tr-ledger-layout ${inspection || (allCollapsed && entries.length > 0) ? "has-inspector" : ""}`}><section className="tr-ledger" aria-label="Trajectory events">
      <div className="tr-toolbar"><label className="tr-search" htmlFor="trajectory-search"><Search size={14}/><input id="trajectory-search" name="search" aria-label="Search trajectory" maxLength={500} placeholder="Search events, tools, files…" value={query} onChange={event => { setQuery(event.target.value); setInspection(null); resetWindow(); }}/>{query && <button aria-label="Clear trajectory search" onClick={() => { setQuery(""); setInspection(null); resetWindow(); }}><X size={12}/></button>}</label>
        <select id="trajectory-category-select" name="category" aria-label="Filter trajectory events" value={category} onChange={event => { setCategory(event.target.value); setInspection(null); resetWindow(); }}>{categoryLabels.map(label => <option key={label}>{label}</option>)}</select>
        <button aria-pressed={showSteps} onClick={() => setShowSteps(!showSteps)}>⊟ Steps</button><button aria-pressed={showRequests} onClick={() => setShowRequests(!showRequests)}>⊟ Requests</button>
      </div>
      <div className="tr-records" ref={ledger} onScroll={event => { savedScroll.current = event.currentTarget.scrollTop; follow.current = inspection === null && !query && category === "All events" && !range && event.currentTarget.scrollHeight - event.currentTarget.scrollTop - event.currentTarget.clientHeight < 30; }}>
      <TrajectoryRecords goalId={session.goalId} runId={runId} entries={entries} refresh={session} selectEvent={select} selectedInput={selectedInput} selectInput={inspectInput} showSteps={showSteps} showRequests={showRequests} onCalls={setInputCalls} onRevealSelection={() => setRecordsRevealVersion(version => version + 1)} selectedSequence={selected} query={search} category={category} onAllStepsCollapsedChange={setAllCollapsed}/>
      {!loading && !error && entries.length === 0 && <div className="tr-empty">{page?.committedCount === 0 ? "No committed trajectory yet." : "No events match this view."}<button onClick={() => { setQuery(""); setSearch(""); setCategory("All events"); setRange(null); resetWindow(); setRefresh(value => value + 1); }}>{page?.committedCount === 0 ? "Refresh" : "Clear filters"}</button></div>}
    </div><footer className="tr-ledger-foot">
      <div className="tr-page-control" role="group" aria-label="Trajectory pagination">
        <button className="tr-page-arrow" aria-label="Earlier events" title="Earlier events" disabled={loading || !canMoveEarlier} onClick={loadEarlier}><ArrowLeft size={14}/></button>
        <span className="tr-page-count" aria-live="polite" aria-label={`Viewing through ${currentPosition} of ${page?.total ?? "unknown"} events`}>{currentPosition} / {page?.total ?? "—"}</span>
        <button className="tr-page-arrow" aria-label="Later events" title="Later events" disabled={loading || !canMoveLater} onClick={loadLater}><ArrowRight size={14}/></button>
      </div>
      {range && <button onClick={() => { setRange(null); resetWindow(); }}>Clear range</button>}
      <button className="tr-latest" disabled={loading} onClick={() => { focusTarget.current = null; pageFocusCandidates.current = null; follow.current = true; setQuery(""); setSearch(""); setCategory("All events"); setRange(null); setInspection(null); setWindowQuery({ before: Number.MAX_SAFE_INTEGER }); }}><ArrowDown size={12}/>Latest</button>
    </footer></section>
    {inspection?.kind === "input" && <ModelInputInspector key={inspection.input.callId} goalId={session.goalId} runId={runId} selection={inspection.input} selectionVersion={inspection.nonce} result={inspectedResult} onViewResult={selectTimeline} onClose={() => setInspection(null)}/>}
    {allCollapsed && entries.length > 0 ? (
      <section className="tr-inspector tr-inspector-empty" aria-label="Trajectory event details"><div className="tr-empty-guidance"><p>所有步骤已收起，请展开步骤以查看事件</p></div></section>
    ) : selected !== null ? (
      <section className="tr-inspector" aria-label="Trajectory event details"><header><span>Event #{selected}</span><div className="tr-detail-nav"><button aria-label="Previous trajectory event" disabled={!selectedEntry || entries.indexOf(selectedEntry) <= 0} onClick={() => navigateAdjacent(entries[entries.indexOf(selectedEntry!)-1]!)}><ArrowLeft size={14}/></button><button aria-label="Next trajectory event" disabled={!selectedEntry || entries.indexOf(selectedEntry) >= entries.length-1} onClick={() => navigateAdjacent(entries[entries.indexOf(selectedEntry!)+1]!)}><ArrowRight size={14}/></button><button aria-label="Close trajectory details" onClick={() => setInspection(null)}><X size={15}/></button></div></header><div className="tr-detail-title"><h3>{inspectionTitle(selectedEntry, detail)}</h3><p>{selectedEntry?.preview ?? "Recorded trajectory event"}</p><code>{detail?.event.eventId}</code></div><div className="tr-detail-context">{selectedEntry && (!search && category === "All events" ? false : !isEventMatched(selectedEntry, search, category)) && <div className="tr-outside-badge-wrap"><span className="tr-outside-badge">Event outside active filter</span></div>}<div><span>Step</span><strong>{selectedEntry?.stepIndex === undefined ? "Run" : `Step ${selectedEntry.stepIndex}`}</strong></div><div><span>Kind</span><strong>{selectedEntry?.category ?? "Event"}</strong></div><div><span>Status</span><strong>{eventStatus}</strong></div></div><div className="tr-detail-tabs">{detailTabs.map(tab => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setPreferredDetailTab(tab)}>{tab}</button>)}</div>
      <div className="tr-detail-body">{detailLoading ? <p role="status">Loading recorded details…</p> : detailError ? <p role="alert">{detailError}</p> : detail && (activeTab === "Raw" ? <pre>{json(detail.event)}</pre> : activeTab === "Input" ? <><h4>Recorded input</h4><pre>{json(detail.input)}</pre></> : activeTab === "Result" ? <><h4>{detail.observationConfirmed ? "Committed observation" : "Tool finished · Observation not confirmed"}</h4><pre>{json(detail.result ?? detail.toolFinished?.payload.observation)}</pre></> : activeTab === "Timing" ? <><h4>Recorded timing</h4><dl><div><dt>Event time</dt><dd>{detail.event.occurredAt}</dd></div><div><dt>Tool started</dt><dd>{detail.toolStartedAt ?? "Unavailable"}</dd></div><div><dt>Tool finished</dt><dd>{detail.toolFinishedAt ?? "Unavailable"}</dd></div><div><dt>Tool duration</dt><dd>{detail.toolDurationMs === null ? "Unavailable" : `${detail.toolDurationMs} ms`}</dd></div><div><dt>Model duration</dt><dd>Unavailable</dd></div></dl></> : <>{!["model_repair_feedback_recorded", "execution_error"].includes(detail.event.eventType) && <p>{detailSummary(detail.event)}</p>}{(selectedModelCallId !== undefined || ["decision_received", "think_completed", "model_context_frame"].includes(detail.event.eventType)) && <button className="mi-open" onClick={() => inspectInput({ callId: selectedModelCallId ?? null, tab: "Messages" })}>View model prompt</button>}<EventSummary event={detail.event}/>{(detail.toolFinished || detail.input !== undefined) && <p>{detail.observationConfirmed ? "Observation committed" : "Observation not confirmed"}</p>}{selectedEntry?.parentActionId !== undefined && selectedEntry.callIndex !== undefined && <div className="relationship"><h4>Execution relationship</h4><p>This tool call ran inside <strong>execute_program</strong> (call {selectedEntry.callIndex + 1}). Parent action: <code>{selectedEntry.parentActionId}</code></p></div>}<dl><div><dt>Sequence</dt><dd>{detail.event.sequence}</dd></div><div><dt>Phase</dt><dd>{detail.event.phase}</dd></div><div><dt>Action</dt><dd>{selectedEntry?.actionId ?? detail.event.actionId ?? "Unavailable"}</dd></div></dl></>)}</div>
      <footer><button disabled={!detail || detailLoading} onClick={() => void copy()}><Copy size={12}/>{copyStatus}</button><span>{selectedEntry ? `#${entries.indexOf(selectedEntry) + 1} of ${entries.length} loaded` : "Event outside loaded window"}</span></footer>
    </section>) : null}
    </div><footer className="tr-source"><FileText size={12}/><span title={`${session.goalId}/${runId}.jsonl`}>{runId.slice(0,8)}…jsonl</span><span>Snapshot committed boundary #{page?.run.committedThroughSequence ?? "—"}</span></footer>
  </div>;
}



function errorText(reason: unknown): string {
  if (reason instanceof BrowserApiError) {
    if (reason.status === 401 || reason.status === 403) return "Access expired. Reopen the URL printed by lazygoal web.";
    if (reason.code === "trajectory_detail_too_large") return "This event exceeds the 256 KiB detail limit. Complete Raw is unavailable.";
    if (reason.code === "step_trajectory_unavailable") return "This Step has no committed trajectory to locate.";
    if (reason.status === 404) return "The requested Goal, Run, or event is unavailable.";
  }
  return "Could not read the committed trajectory. Retry the request.";
}
