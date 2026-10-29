import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Alert } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { NativeSelect } from "./components/ui/native-select";
import { EventSummary } from "./trajectory-event-summary";
import { requestResult } from "./trajectory-presentation";
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Copy, FileText, ListTree, Search, X } from "lucide-react";
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
import { useInspectorFocus } from "./use-inspector-focus";
import { TrajectoryTimeline } from "./trajectory-timeline";
import { primaryTimelineEntries, timelineTimesValid, type TrajectoryTimelineMode, type TrajectoryTimelineRange } from "./trajectory-timeline-model";

type Target = { runId: string; executionUnitId: string; nonce: number };
type Inspection = { kind: "event"; sequence: number } | { kind: "input"; input: ModelInputSelection; nonce: number };
type WindowQuery = { after?: number; before?: number; executionUnitId?: string };
const categoryLabels = ["All events", "lifecycle", "decision", "memory", "action", "tool", "observation", "terminal", "commit"];
const json = (value: unknown) => JSON.stringify(value, null, 2);
const detailSummary = (event: BrowserTrajectoryDetail["event"]) => event.eventType === "model_repair_attempt_started"
  ? (event.payload as Readonly<Record<string, unknown>>).attempt === 1 ? "Initial model request; no output has been rejected." : "Retry after rejected model output."
  : event.eventType.replaceAll("_", " ");
const detailTitle = (event: BrowserTrajectoryDetail["event"]) => event.eventType === "model_repair_attempt_started"
  ? (event.payload as Readonly<Record<string, unknown>>).attempt === 1 ? "Model request" : "Output retry"
  : event.eventType === "model_repair_feedback_recorded" ? "Output rejected"
  : event.eventType === "think_requested" ? "Think requested"
  : event.eventType === "think_completed" ? "Think completed"
  : event.eventType === "execution_error" ? "Execution stopped" : event.eventType;
const inspectionTitle = (entry: BrowserTrajectoryEntry | undefined, detail: BrowserTrajectoryDetail | null) =>
  entry?.eventType === "tool_started" ? entry.title.replace(/^tool_started: /, "") : detail ? detailTitle(detail.event) : entry?.title ?? "Event details";

export function Trajectory({ session, target }: { session: BrowserGoalSession; target: Target | null }) {
  const [inputCalls, setInputCalls] = useState<BrowserModelInputSummary[]>([]);
  const [showSteps, setShowSteps] = useState(true);
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
  const [timelineMode, setTimelineMode] = useState<TrajectoryTimelineMode>("sequence");
  const [timelineCompact, setTimelineCompact] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
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
  const [narrow, setNarrow] = useState(false);
  const ledger = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
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

  const inspectorFocus = useInspectorFocus({
    open: inspection?.kind === "event" && !allCollapsed,
    modal: narrow,
    onClose: () => setInspection(null),
  });

  useEffect(() => {
    const element = root.current;
    if (element === null) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? element.getBoundingClientRect().width;
      const next = width <= 900;
      setNarrow(current => current === next ? current : next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const entries = page?.run.runId === runId
    ? [...new Map(loadedPages
      .filter(loaded => loaded.run.runId === runId)
      .flatMap(loaded => loaded.entries)
      .map(entry => [entry.sequence, entry] as const))
      .values()]
      .sort((left, right) => left.sequence - right.sequence)
    : [];
  const unverifiedPageBoundarySequences = loadedPages.slice(1).flatMap((loaded, index) => {
    const first = loaded.entries[0];
    return first !== undefined && pageWindow.verifiedAdjacentPages[index] !== true ? [first.sequence] : [];
  });
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
  const selectedEntry = entries.find(entry => entry.sequence === selected);
  const inspectedCall = inputCalls.find(call => call.callId === selectedInput?.callId);
  const inspectedResult = inspectedCall ? requestResult(inspectedCall, inputCalls, entries, !search && category === "All events") : undefined;
  const selectedModelCallId = selectedEntry?.modelCallId ?? inputCalls.find(call => requestResult(call, inputCalls, entries, !search && category === "All events").entry?.sequence === selectedEntry?.sequence)?.callId;
  const validTimes = timelineTimesValid(primaryTimelineEntries(entries));
  const timelineSelection = selected ?? (selectedInput === null
    ? null
    : entries.find(entry => entry.modelCallId === selectedInput.callId)?.sequence ?? null);
  const timelineRange: TrajectoryTimelineRange | null = range === null
    ? null
    : { fromSequence: range[0], toSequence: range[1] };
  useEffect(() => {
    if (timelineMode === "time" && !validTimes) setTimelineMode("sequence");
  }, [timelineMode, validTimes]);
  const selectedRun = runs.find(run => run.runId === runId) ?? page?.run;
  const eventMatched = (entry: BrowserTrajectoryEntry) => !search && category === "All events"
    ? true
    : isEventMatched(entry, search, category);

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
  function changeTimelineRange(next: TrajectoryTimelineRange | null) {
    follow.current = false;
    setInspection(null);
    if (next === null) {
      setRange(null);
      setWindowQuery({});
      return;
    }
    setRange([next.fromSequence, next.toSequence]);
    savedScroll.current = 0;
    setWindowQuery({});
  }
  function switchRun(id: string) {
    pageFocusCandidates.current = null;
    setInputCalls([]); setRunId(id); setPage(null); setPageWindow(EMPTY_TRAJECTORY_PAGE_WINDOW); setInspection(null); setDetail(null); setWindowQuery({}); setRange(null); setQuery(""); setSearch(""); setCategory("All events"); setAllCollapsed(false);
    setTimelineMode("sequence"); setTimelineCompact(false); setTimelineZoom(1);
    follow.current = true; savedScroll.current = 0;
  }
  function resetWindow() { follow.current = false; savedScroll.current = 0; setWindowQuery({}); }
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
    : selectedEntry?.eventType === "model_repair_attempt_started" ? "Attempt"
    : selectedEntry?.eventType === "run_completed" ? "Completed"
    : "Recorded";
  const firstEntry = entries[0];
  const lastEntry = entries.at(-1);
  const coverage = loading
    ? "Loading committed trajectory…"
    : `${firstEntry ? `#${firstEntry.sequence}–#${lastEntry!.sequence}` : "no events"}, ${entries.length} of ${page?.total ?? 0} matches`;
  return <div ref={root} className="trajectory-view compact-real trace-workbench" aria-label="Run trajectory" aria-busy={loading}>
    <div className="tr-runbar"><div className="tr-page-title"><h2>Execution trajectory</h2><span>Inspect what the agent saw and called</span></div><NativeSelect id="trajectory-run-select" name="runId" aria-label="Select trajectory run" value={runId} onChange={event => switchRun(event.target.value)}>
      {runs.length === 0 && <option value={runId}>{runId.slice(0, 12)}</option>}
      {runs.map((run, index) => <option key={run.runId} value={run.runId}>{run.current ? "Current Run" : `Earlier Run ${runs.length - index}`}, {run.runId.slice(0, 8)}</option>)}
    </NativeSelect><span className={`tr-status ${selectedRun?.status === "failed" ? "failed" : ""}`}>{selectedRun?.status ?? "Loading"}</span><span className="tr-event-count">{page?.committedCount ?? "—"} committed events</span></div>
    {(error || catalogError) && <Alert variant="destructive" className="tr-feedback rounded-none border-x-0 border-t-0">{error ?? catalogError}{page && " Displayed data has not been updated."}<Button variant="ghost" size="sm" onClick={() => setRefresh(value => value + 1)}>Retry</Button></Alert>}
    <TrajectoryTimeline
      entries={entries}
      mode={timelineMode}
      compact={timelineCompact}
      zoom={timelineZoom}
      selectedSequence={timelineSelection}
      range={timelineRange}
      isMatched={eventMatched}
      onSelect={selectTimeline}
      onRangeChange={changeTimelineRange}
      onZoomChange={value => setTimelineZoom(Math.max(1, Math.min(4, value)))}
    />
    <div className="tr-toolbar">
      <div className="tr-search"><Search size={14}/><Input id="trajectory-search" name="search" aria-label="Search trajectory" maxLength={500} placeholder="Search events, tools, files…" value={query} onChange={event => { setQuery(event.target.value); setInspection(null); resetWindow(); }}/>{query && <Button variant="ghost" size="sm" aria-label="Clear trajectory search" onClick={() => { setQuery(""); setInspection(null); resetWindow(); }}><X size={12}/></Button>}</div>
      <NativeSelect id="trajectory-category-select" name="category" aria-label="Filter trajectory events" value={category} onChange={event => { setCategory(event.target.value); setInspection(null); resetWindow(); }}>{categoryLabels.map(label => <option key={label}>{label}</option>)}</NativeSelect>
      <Button variant="ghost" size="sm" className="tr-steps-toggle" aria-pressed={showSteps} onClick={() => setShowSteps(!showSteps)}><ListTree size={14} aria-hidden="true"/>Steps</Button>
      <div className="tr-timeline-controls" role="group" aria-label="Timeline projection">
        <div className="tr-segmented">
          <button aria-pressed={timelineMode === "time"} disabled={!validTimes} title={validTimes ? "Use recorded time" : "Recorded timing unavailable"} onClick={() => { setTimelineMode("time"); setTimelineCompact(false); setTimelineZoom(1); }}>Time</button>
          <button aria-pressed={timelineMode === "sequence"} onClick={() => { setTimelineMode("sequence"); setTimelineCompact(false); setTimelineZoom(1); }}>Sequence</button>
        </div>
        {timelineMode === "sequence" && <button className="tr-compact-toggle" aria-pressed={timelineCompact} onClick={() => setTimelineCompact(value => !value)}>Compact</button>}
        {timelineMode === "sequence" && timelineZoom > 1.001 && <button className="tr-fit" aria-label="Reset timeline zoom" onClick={() => setTimelineZoom(1)}>Fit</button>}
        {timelineMode === "sequence" && <span className="tr-zoom-level" aria-live="polite">{`${Number(timelineZoom.toFixed(1))}×`}</span>}
      </div>
      <span className="tr-coverage" role="status">{coverage}</span>
    </div>
    <div className={`tr-ledger-layout ${inspection || (allCollapsed && entries.length > 0) ? "has-inspector" : ""}`}><section className="tr-ledger" aria-label="Trajectory events">
      <div className="tr-records" ref={ledger} onScroll={event => { savedScroll.current = event.currentTarget.scrollTop; follow.current = inspection === null && !query && category === "All events" && !range && event.currentTarget.scrollHeight - event.currentTarget.scrollTop - event.currentTarget.clientHeight < 30; }}>
      <TrajectoryRecords goalId={session.goalId} runId={runId} entries={entries} unverifiedPageBoundarySequences={unverifiedPageBoundarySequences} refresh={session} selectEvent={select} selectedInput={selectedInput} selectInput={inspectInput} showSteps={showSteps} showRequests={false} onCalls={setInputCalls} onRevealSelection={() => setRecordsRevealVersion(version => version + 1)} selectedSequence={selected} query={search} category={category} onAllStepsCollapsedChange={setAllCollapsed}/>
      {!loading && !error && entries.length === 0 && <div className="tr-empty">{page?.committedCount === 0 ? "No committed trajectory yet." : "No events match this view."}<Button variant="ghost" size="sm" onClick={() => { setQuery(""); setSearch(""); setCategory("All events"); setRange(null); resetWindow(); setRefresh(value => value + 1); }}>{page?.committedCount === 0 ? "Refresh" : "Clear filters"}</Button></div>}
    </div><footer className="tr-ledger-foot">
      <div className="tr-page-control" role="group" aria-label="Trajectory pagination">
        <Button variant="ghost" size="icon" className="tr-page-arrow" aria-label="Earlier events" title="Earlier events" disabled={loading || !canMoveEarlier} onClick={loadEarlier}><ArrowLeft size={14}/></Button>
        <span className="tr-page-count" aria-live="polite" aria-label={`Viewing through ${currentPosition} of ${page?.total ?? "unknown"} events`}>{currentPosition} / {page?.total ?? "—"}</span>
        <Button variant="ghost" size="icon" className="tr-page-arrow" aria-label="Later events" title="Later events" disabled={loading || !canMoveLater} onClick={loadLater}><ArrowRight size={14}/></Button>
      </div>
      {range && <Button variant="ghost" size="sm" onClick={() => { setRange(null); resetWindow(); setInspection(null); }}>Clear range</Button>}
      <Button variant="ghost" size="sm" className="tr-latest" disabled={loading} onClick={() => { focusTarget.current = null; pageFocusCandidates.current = null; follow.current = true; setQuery(""); setSearch(""); setCategory("All events"); setRange(null); setInspection(null); setTimelineZoom(1); setTimelineCompact(false); setWindowQuery({ before: Number.MAX_SAFE_INTEGER }); }}><ArrowDown size={12}/>Latest</Button>
    </footer></section>
    {inspection !== null && <div className="tr-scrim" aria-hidden="true" onClick={() => setInspection(null)}/>}
    {inspection?.kind === "input" && <ModelInputInspector key={inspection.input.callId} goalId={session.goalId} runId={runId} selection={inspection.input} selectionVersion={inspection.nonce} result={inspectedResult} onViewResult={selectTimeline} narrow={narrow} onClose={() => setInspection(null)}/>}
    {allCollapsed && entries.length > 0 ? (
      <section className="tr-inspector tr-inspector-empty" aria-label="Trajectory event details"><div className="tr-empty-guidance"><p>All steps are collapsed. Expand a step to see its events.</p></div></section>
    ) : selected !== null ? (
      <section ref={inspectorFocus} tabIndex={narrow ? -1 : undefined} role={narrow ? "dialog" : undefined} aria-modal={narrow ? true : undefined} className="tr-inspector" aria-label="Trajectory event details"><header><span>Event #{selected}</span><div className="tr-detail-nav"><Button variant="ghost" size="icon" aria-label="Previous trajectory event" disabled={!selectedEntry || entries.indexOf(selectedEntry) <= 0} onClick={() => navigateAdjacent(entries[entries.indexOf(selectedEntry!)-1]!)}><ArrowLeft size={14}/></Button><Button variant="ghost" size="icon" aria-label="Next trajectory event" disabled={!selectedEntry || entries.indexOf(selectedEntry) >= entries.length-1} onClick={() => navigateAdjacent(entries[entries.indexOf(selectedEntry!)+1]!)}><ArrowRight size={14}/></Button><Button variant="ghost" size="icon" aria-label="Close trajectory details" onClick={() => setInspection(null)}><X size={15}/></Button></div></header><div className="tr-detail-title"><h3>{inspectionTitle(selectedEntry, detail)}</h3><p>{selectedEntry?.preview ?? "Recorded trajectory event"}</p><code>{detail?.event.eventId}</code></div><div className="tr-detail-context">{selectedEntry && (!search && category === "All events" ? false : !isEventMatched(selectedEntry, search, category)) && <div className="tr-outside-badge-wrap"><Badge variant="outline" className="tr-outside-badge">Event outside active filter</Badge></div>}<div><span>Step</span><strong>{selectedEntry?.stepIndex === undefined ? "Run" : `Step ${selectedEntry.stepIndex}`}</strong></div><div><span>Kind</span><strong>{selectedEntry?.category ?? "Event"}</strong></div><div><span>Status</span><strong>{eventStatus}</strong></div></div><Tabs className="tr-detail-tabs-region" value={activeTab} onValueChange={value => setPreferredDetailTab(value as typeof activeTab)}><TabsList className="tr-detail-tabs" aria-label="Event detail tabs">{detailTabs.map(tab => <TabsTrigger key={tab} value={tab} onClick={() => setPreferredDetailTab(tab)} className={activeTab === tab ? "active" : ""}>{tab}</TabsTrigger>)}</TabsList><TabsContent value={activeTab} forceMount className="tr-detail-panel">
      <div className="tr-detail-body">{detailLoading ? <p role="status">Loading recorded details…</p> : detailError ? <p role="alert">{detailError}</p> : detail && (activeTab === "Raw" ? <pre>{json(detail.event)}</pre> : activeTab === "Input" ? <><h4>Recorded input</h4><pre>{json(detail.input)}</pre></> : activeTab === "Result" ? <><h4>{detail.observationConfirmed ? "Committed observation" : "Tool finished, Observation not confirmed"}</h4><pre>{json(detail.result ?? detail.toolFinished?.payload.observation)}</pre></> : activeTab === "Timing" ? <><h4>Recorded timing</h4><dl><div><dt>Event time</dt><dd>{detail.event.occurredAt}</dd></div><div><dt>Tool started</dt><dd>{detail.toolStartedAt ?? "Unavailable"}</dd></div><div><dt>Tool finished</dt><dd>{detail.toolFinishedAt ?? "Unavailable"}</dd></div><div><dt>Tool duration</dt><dd>{detail.toolDurationMs === null ? "Unavailable" : `${detail.toolDurationMs} ms`}</dd></div><div><dt>Model duration</dt><dd>Unavailable</dd></div></dl></> : <>{!["model_repair_feedback_recorded", "model_repair_attempt_started", "execution_error"].includes(detail.event.eventType) && <p>{detailSummary(detail.event)}</p>}{(selectedModelCallId !== undefined || ["decision_received", "think_completed", "model_context_frame"].includes(detail.event.eventType)) && <Button variant="ghost" size="sm" className="mi-open" onClick={() => inspectInput({ callId: selectedModelCallId ?? null, tab: "Messages" })}>View model prompt</Button>}<EventSummary event={detail.event}/>{(detail.toolFinished || detail.input !== undefined) && <p>{detail.observationConfirmed ? "Observation committed" : "Observation not confirmed"}</p>}{selectedEntry?.parentActionId !== undefined && selectedEntry.callIndex !== undefined && <div className="relationship"><h4>Execution relationship</h4><p>This tool call ran inside <strong>execute_program</strong> (call {selectedEntry.callIndex + 1}). Parent action: <code>{selectedEntry.parentActionId}</code></p></div>}<dl><div><dt>Sequence</dt><dd>{detail.event.sequence}</dd></div><div><dt>Phase</dt><dd>{detail.event.phase}</dd></div><div><dt>Action</dt><dd>{selectedEntry?.actionId ?? detail.event.actionId ?? "Unavailable"}</dd></div></dl></>)}</div>
      </TabsContent></Tabs>
      <footer><Button variant="ghost" size="sm" disabled={!detail || detailLoading} onClick={() => void copy()}><Copy size={12}/>{copyStatus}</Button><span>{selectedEntry ? `#${entries.indexOf(selectedEntry) + 1} of ${entries.length} loaded` : "Event outside loaded window"}</span></footer>
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
