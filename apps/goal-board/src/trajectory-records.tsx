import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./components/ui/collapsible";
import { Button } from "./components/ui/button";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BrowserTrajectoryEntry, BrowserModelInputSummary } from "../../../packages/web-contracts/src/index";
import { browserApi } from "./api";
import type { ModelInputSelection } from "./model-input-inspector";
import { displayStepBySequence } from "./trajectory-display-step";
import { requestResult } from "./trajectory-presentation";
import { isEventMatched } from "./trajectory-event-filter";

/** 读取轨迹输入摘要并发出选择请求；详情选择及互斥关系由父组件持有。 */
export function TrajectoryRecords({ goalId, runId, entries, unverifiedPageBoundarySequences, refresh, selectEvent, selectedInput, selectInput, showSteps, showRequests, onCalls, onRevealSelection, selectedSequence, category, onAllStepsCollapsedChange }: { onCalls: (calls: BrowserModelInputSummary[]) => void; onRevealSelection: () => void; selectedSequence: number | null; category: string; goalId: string; runId: string; entries: readonly BrowserTrajectoryEntry[]; unverifiedPageBoundarySequences: readonly number[]; refresh: unknown; selectEvent: (entry: BrowserTrajectoryEntry) => void; selectedInput: ModelInputSelection | null; selectInput: (input: ModelInputSelection) => void; showSteps: boolean; showRequests: boolean; onAllStepsCollapsedChange?: (allCollapsed: boolean) => void }) {
  const [calls, setCalls] = useState<BrowserModelInputSummary[]>([]);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [total, setTotal] = useState(0);
  const [expandedRetries, setExpandedRetries] = useState<string[]>([]);
  const [collapsedRetries, setCollapsedRetries] = useState<string[]>([]);
  const [collapsedSteps, setCollapsedSteps] = useState<string[]>([]);
  const previousSelectionRef = useRef<{ sequence: number | null; callId: string | null | undefined }>({ sequence: selectedSequence, callId: selectedInput?.callId });
  const previousFilterRef = useRef<{ category: string }>({ category });
  useEffect(() => { setOffset(0); setCalls([]); setExpandedRetries([]); setCollapsedRetries([]); setCollapsedSteps([]); }, [runId]);
  useEffect(() => {
    const controller = new AbortController(); setError(false);
    void browserApi.modelInputs(goalId, runId, offset, controller.signal).then(result => {
      if (!controller.signal.aborted) { setCalls([...result.calls]); setNextOffset(result.nextOffset); setTotal(result.total); }
    }).catch(() => { if (!controller.signal.aborted) { setError(true); setCalls([]); } });
    return () => controller.abort();
  }, [goalId, runId, offset, refresh, retry]);
  useEffect(() => { setOffset(0); }, [category]);
  useEffect(() => { onCalls(calls); }, [calls, onCalls]);
  type RecordRow = { id: string; text: string; time: string; step?: number; entry?: BrowserTrajectoryEntry; call?: BrowserModelInputSummary; tab?: string; messageIndex?: number; input?: string; result?: string; request?: boolean; promptCallId?: string; status?: string; retryKey?: string; pageBoundaryBefore?: true };
  const rows: RecordRow[] = [];
  const visibleCalls = (category === "All events" || category === "decision" || category === "memory" ? calls : []).filter(call => entries.length === 0 || entries.some(entry => call.executionUnitId === undefined || entry.executionUnitId === call.executionUnitId));
  const results = new Map(calls.map(call => [call.callId, requestResult(call, calls, entries, category === "All events")]));
  const rejectedCalls = new Map(calls.filter(call => results.get(call.callId)?.status === "rejected").map(call => [results.get(call.callId)!.entry!.sequence, call]));
  const displaySteps = displayStepBySequence(entries);
  for (const call of visibleCalls) {
    const result = results.get(call.callId)!;
    const messageCount = call.messages.length + call.omittedMessageCount;
    rows.push({
      id: `${call.callId}:prompt`,
      text: `${call.stage}, ${messageCount} message${messageCount === 1 ? "" : "s"}, ${result.label}`,
      result: call.firstSystem
        ? "Initial system prompt"
        : call.systemChanged ? "System prompt updated" : `System ${call.systemVersion.slice(0, 8)}`,
      time: call.occurredAt,
      step: call.stepIndex,
      call,
      tab: "Messages",
      request: true,
      status: result.status,
    });
  }
  for (const entry of entries) {
    if (entry.sequence !== selectedSequence && entry.eventType === "model_context_frame" && visibleCalls.some(call => call.callId === entry.modelCallId)) continue;
    if (entry.sequence !== selectedSequence && category === "All events" && (["state_committed", "action_staged", "observation_recorded"].includes(entry.eventType) || entry.category === "commit")) continue;
    if (entry.eventType === "tool_finished" && entries.some(start => start.eventType === "tool_started" && start.actionId === entry.actionId)) continue;
    rows.push({ id: entry.eventId, text: eventLabel(entry),
      time: entry.occurredAt, step: displaySteps.get(entry.sequence), entry, input: entry.inputPreview, result: entry.resultPreview,
      request: entry.eventType === "decision_received" || entry.eventType === "think_completed" || rejectedCalls.has(entry.sequence), promptCallId: rejectedCalls.get(entry.sequence)?.callId, status: entry.eventType === "model_repair_feedback_recorded" || entry.eventType === "execution_error" ? "rejected" : undefined });
  }
  const events = rows.filter(row => row.entry !== undefined);
  const inputs = rows.filter(row => row.call !== undefined);
  const slots = new Map<number, RecordRow[]>();
  for (const call of visibleCalls) {
    let index = events.findIndex(row => row.entry?.modelCallId === call.callId);
    if (index < 0) index = events.findIndex(row => Date.parse(row.time) >= Date.parse(call.occurredAt));
    if (index < 0) index = events.length;
    slots.set(index, [...(slots.get(index) ?? []), ...inputs.filter(row => row.call?.callId === call.callId)]);
  }
  rows.length = 0;
  for (let index = 0; index <= events.length; index++) {
    rows.push(...(slots.get(index) ?? []));
    if (events[index]) rows.push(events[index]!);
  }
  let pageBoundaryIndex = 0;
  const pageBoundaries = [...unverifiedPageBoundarySequences].sort((left, right) => left - right);
  for (const row of rows) {
    if (row.entry === undefined) continue;
    const boundary = pageBoundaries[pageBoundaryIndex];
    if (boundary !== undefined && row.entry.sequence >= boundary) {
      row.pageBoundaryBefore = true;
      pageBoundaryIndex += 1;
    }
  }
  const retryKeys = new Set(visibleCalls.filter(call => call.executionUnitId && results.get(call.callId)?.status === "rejected" && visibleCalls.filter(other => other.executionUnitId === call.executionUnitId && other.stage === call.stage).length > 1).map(call => `${call.executionUnitId}:${call.stage}`));
  for (const row of rows) {
    const unit = row.call?.executionUnitId ?? row.entry?.executionUnitId;
    const stage = row.call?.stage ?? row.entry?.modelStage;
    const key = `${unit}:${stage}`;
    const first = visibleCalls.find(call => `${call.executionUnitId}:${call.stage}` === key);
    const initialInput = row.call?.callId === first?.callId && !row.request && !row.id.endsWith(":more");
    const initialAttempt = row.entry?.eventType === "model_repair_attempt_started" && first !== undefined && Date.parse(row.time) <= Date.parse(first.occurredAt);
    if (retryKeys.has(key) && !initialInput && !initialAttempt) row.retryKey = key;
  }
  const chunks: { key: string; rows: RecordRow[]; retry: boolean }[] = [];
  for (const row of rows) {
    const previous = chunks.at(-1);
    if (row.retryKey && previous?.key === row.retryKey && row.pageBoundaryBefore !== true) previous.rows.push(row);
    else chunks.push({ key: row.retryKey ?? row.id, rows: [row], retry: row.retryKey !== undefined });
  }
  const renderRow = (row: RecordRow) => {
    const selected = row.entry
      ? row.entry.sequence === selectedSequence
      : (row.request || row.tab !== undefined || row.messageIndex !== undefined) && selectedInput?.callId === row.call?.callId && selectedInput?.tab === (row.tab ?? "Messages") && selectedInput?.messageIndex === row.messageIndex;
    const handleSelect = () => {
      if (row.entry) {
        selectEvent(row.entry);
      } else {
        selectInput({ callId: row.call!.callId, tab: row.tab ?? "Messages", messageIndex: row.messageIndex });
      }
    };
    return <div className={`ct-record ${row.status ?? ""} ${selected ? "selected" : ""} ${row.entry?.parentActionId !== undefined && row.entry.callIndex !== undefined ? "child" : ""}`} key={row.id} onClick={handleSelect}>
      <div className="ct-gutter"><span className="ct-sequence">{row.entry?.sequence ?? "—"}</span>{showRequests && row.request && <Button variant="ghost" size="sm" className="ct-request-dot" aria-label={row.entry ? `View prompt for event ${row.entry.sequence}` : `Inspect model request ${row.call!.callId}`} onClick={(event) => { event.stopPropagation(); selectInput({ callId: row.call?.callId ?? row.promptCallId ?? row.entry?.modelCallId ?? null, tab: "Messages" }); }}/>}</div>
      <Button variant="ghost" size="sm" id={row.entry ? `trajectory-event-${row.entry.sequence}` : undefined} className="ct-record-body" aria-pressed={selected} aria-label={row.call ? `Inspect model request ${row.call.callId}` : undefined} onClick={(event) => { event.stopPropagation(); handleSelect(); }}>
        <span className="ct-preview"><span className="ct-event-text"><strong>{row.text}</strong>{row.entry?.parentActionId !== undefined && row.entry.callIndex !== undefined && <small title={`Program ${row.entry.parentActionId}`}>Program call {row.entry.callIndex + 1}</small>}</span></span>
        <time className="ct-time" dateTime={row.time} title={row.time}>{formatEventTime(row.time)}</time>
        <span className="ct-detail">{row.entry?.resultPreview ?? row.result ?? row.entry?.inputPreview ?? row.input ?? row.entry?.preview ?? ""}</span>
      </Button>
    </div>;
  };
  const renderChunk = (chunk: (typeof chunks)[number]) => {
    if (!chunk.retry) return chunk.rows.map(renderRow);
    const peers = visibleCalls.filter(call => `${call.executionUnitId}:${call.stage}` === chunk.key);
    const last = peers.at(-1)!;
    const rejection = [...peers].reverse().map(call => results.get(call.callId)).find(result => result?.status === "rejected")!;
    const selectedInside = chunk.rows.some(row => row.entry?.sequence === selectedSequence || row.call?.callId === selectedInput?.callId);
    const expanded = !collapsedRetries.includes(chunk.key) && (expandedRetries.includes(chunk.key) || selectedInside);
    return <Collapsible asChild key={chunk.key} open={expanded} onOpenChange={(nextOpen) => {
        setCollapsedRetries(current => nextOpen ? current.filter(key => key !== chunk.key) : current.includes(chunk.key) ? current : [...current, chunk.key]);
        setExpandedRetries(current => nextOpen ? current.includes(chunk.key) ? current : [...current, chunk.key] : current.filter(key => key !== chunk.key));
      }}><section className="ct-retry" aria-label={`Step ${last.stepIndex} ${last.stage} attempts`}>
      <div className="ct-retry-header"><CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="ct-retry-toggle"><ChevronRight aria-hidden="true" className={`ct-chevron ${expanded ? "rotated" : ""}`}/><strong>Step {last.stepIndex} / {last.stage}</strong><span>{peers.length} attempts, {results.get(last.callId)!.label}</span><span className="ct-retry-error">{rejection.entry!.preview}</span></Button></CollapsibleTrigger><Button variant="ghost" size="sm" className="ct-retry-prompt" onClick={() => selectInput({ callId: last.callId, tab: "Messages" })}>Last prompt</Button></div>
      <CollapsibleContent>{chunk.rows.map(renderRow)}</CollapsibleContent>
    </section></Collapsible>;
  };
  const stepGroups: { key: string; step?: number; chunks: typeof chunks }[] = [];
  for (const chunk of chunks) {
    const step = chunk.rows[0]?.step;
    const previous = stepGroups.at(-1);
    const pageBoundaryBefore = chunk.rows.some((row) => row.pageBoundaryBefore === true);
    if (previous && previous.step === step && !pageBoundaryBefore) previous.chunks.push(chunk);
    else stepGroups.push({ key: `${step ?? "run"}:${chunk.rows[0]!.id}`, ...(step === undefined ? {} : { step }), chunks: [chunk] });
  }
  const nonRunGroups = stepGroups.filter(g => g.step !== undefined);
  const isAllCollapsed = showSteps && nonRunGroups.length > 0 && nonRunGroups.every(g => collapsedSteps.includes(g.key));
  useEffect(() => {
    onAllStepsCollapsedChange?.(isAllCollapsed);
  }, [isAllCollapsed, onAllStepsCollapsedChange]);
  useEffect(() => {
    const prev = previousSelectionRef.current;
    const selectionChanged = prev.sequence !== selectedSequence || prev.callId !== selectedInput?.callId;
    previousSelectionRef.current = { sequence: selectedSequence, callId: selectedInput?.callId };
    if (!selectionChanged || (selectedSequence === null && !selectedInput?.callId)) return;
    const isSelected = (row: RecordRow) => row.entry?.sequence === selectedSequence || row.call?.callId === selectedInput?.callId;
    const selectedStep = stepGroups.find(group => group.step !== undefined && collapsedSteps.includes(group.key) && group.chunks.some(chunk => chunk.rows.some(isSelected)));
    const selectedRetry = chunks.find(chunk => chunk.retry && collapsedRetries.includes(chunk.key) && chunk.rows.some(isSelected));
    if (!selectedStep && !selectedRetry) return;
    if (selectedStep) setCollapsedSteps(current => current.filter(key => key !== selectedStep.key));
    if (selectedRetry) setCollapsedRetries(current => current.filter(key => key !== selectedRetry.key));
    onRevealSelection();
  }, [selectedSequence, selectedInput?.callId, stepGroups, chunks, onRevealSelection]);
  useEffect(() => {
    const prev = previousFilterRef.current;
    const filterChanged = prev.category !== category;
    previousFilterRef.current = { category };
    if (!filterChanged) return;
    const normalizedCategory = category.trim();
    if (normalizedCategory === "All events") return;
    const matchedStepKeys = new Set<string>();
    for (const group of stepGroups) {
      if (group.step === undefined) continue;
      const hasMatch = group.chunks.some(chunk => chunk.rows.some(row => {
        if (row.entry) return isEventMatched(row.entry, category);
        if (row.call) return normalizedCategory === "decision" || normalizedCategory === "memory";
        return false;
      }));
      if (hasMatch) matchedStepKeys.add(group.key);
    }
    if (matchedStepKeys.size > 0) {
      setCollapsedSteps(current => {
        const next = current.filter(key => !matchedStepKeys.has(key));
        return next.length === current.length ? current : next;
      });
    }
  }, [category, stepGroups]);
  return <>
    <div className="mi-input-status">{error ? <span role="alert">Model inputs could not be loaded. <Button variant="ghost" size="sm" onClick={() => setRetry(value => value + 1)}>Retry inputs</Button></span> : total === 0 ? "Historical model inputs not recorded." : `${offset + 1}–${offset + calls.length} / ${total} saved model inputs`}{total > 100 && <span><Button variant="ghost" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Earlier inputs</Button><Button variant="ghost" size="sm" disabled={nextOffset === null} onClick={() => setOffset(nextOffset!)}>Later inputs</Button></span>}</div>
    <div className="ct-column-head" aria-hidden="true"><span>#</span><span>Event</span><span>Time</span><span>Detail</span></div>
    <div className="ct-record-list">
      {showSteps ? stepGroups.map(group => group.step === undefined
        ? <div className="ct-run-records" key={group.key}>{group.chunks.map(renderChunk)}</div>
        : <Collapsible asChild key={group.key} open={!collapsedSteps.includes(group.key)} onOpenChange={(nextOpen) => setCollapsedSteps(current => nextOpen ? current.filter(key => key !== group.key) : current.includes(group.key) ? current : [...current, group.key])}><section className="ct-step-group">
            <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="ct-step-header"><ChevronRight aria-hidden="true" className={`ct-chevron ${collapsedSteps.includes(group.key) ? "" : "rotated"}`}/><strong>Step {group.step}</strong><small>{group.chunks.reduce((count, chunk) => count + chunk.rows.length, 0)} records</small></Button></CollapsibleTrigger>
            <CollapsibleContent>{group.chunks.map(renderChunk)}</CollapsibleContent>
          </section></Collapsible>) : chunks.map(renderChunk)}
    </div>
  </>;
}

function eventLabel(entry: BrowserTrajectoryEntry): string {
  if (entry.eventType === "think_requested") return "Think requested";
  if (entry.eventType === "think_completed") return "Think completed";
  if (entry.eventType === "tool_started") return entry.title.replace(/^tool_started: /, "");
  if (entry.eventType === "run_completed") return "Run completed";
  const label = entry.title || entry.eventType;
  if (!label.includes("_")) return label;
  return label.replaceAll("_", " ").replace(/^./, character => character.toUpperCase());
}

function formatEventTime(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString("en-GB", { hour12: false }) : "—";
}
