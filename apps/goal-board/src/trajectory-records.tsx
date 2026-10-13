import { useEffect, useRef, useState } from "react";
import type { BrowserTrajectoryEntry, BrowserModelInputSummary } from "../../../packages/web-contracts/src/index";
import { browserApi } from "./api";
import type { ModelInputSelection } from "./model-input-inspector";
import { displayStepBySequence } from "./trajectory-display-step";
import { requestResult } from "./trajectory-presentation";
import { isEventMatched } from "./trajectory-event-filter";

/** 读取轨迹输入摘要并发出选择请求；详情选择及互斥关系由父组件持有。 */
export function TrajectoryRecords({ goalId, runId, entries, refresh, selectEvent, selectedInput, selectInput, showSteps, showRequests, onCalls, onRevealSelection, selectedSequence, query, category, onAllStepsCollapsedChange }: { onCalls: (calls: BrowserModelInputSummary[]) => void; onRevealSelection: () => void; selectedSequence: number | null; query: string; category: string; goalId: string; runId: string; entries: readonly BrowserTrajectoryEntry[]; refresh: unknown; selectEvent: (entry: BrowserTrajectoryEntry) => void; selectedInput: ModelInputSelection | null; selectInput: (input: ModelInputSelection) => void; showSteps: boolean; showRequests: boolean; onAllStepsCollapsedChange?: (allCollapsed: boolean) => void }) {
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
  const previousFilterRef = useRef<{ query: string; category: string }>({ query, category });
  useEffect(() => { setOffset(0); setCalls([]); setExpandedRetries([]); setCollapsedRetries([]); setCollapsedSteps([]); }, [runId]);
  useEffect(() => {
    const controller = new AbortController(); setError(false);
    void browserApi.modelInputs(goalId, runId, offset, controller.signal, query).then(result => {
      if (!controller.signal.aborted) { setCalls(result.calls); setNextOffset(result.nextOffset); setTotal(result.total); }
    }).catch(() => { if (!controller.signal.aborted) { setError(true); setCalls([]); } });
    return () => controller.abort();
  }, [goalId, runId, offset, refresh, query, retry]);
  useEffect(() => { setOffset(0); }, [query]);
  useEffect(() => { onCalls(calls); }, [calls, onCalls]);
  type RecordRow = { id: string; role: string; text: string; time: string; step?: number; entry?: BrowserTrajectoryEntry; call?: BrowserModelInputSummary; tab?: string; messageIndex?: number; input?: string; result?: string; request?: boolean; promptCallId?: string; status?: string; retryKey?: string };
  const rows: RecordRow[] = [];
  const visibleCalls = (category === "All events" || category === "decision" || category === "memory" ? calls : []).filter(call => entries.length === 0 || entries.some(entry => call.executionUnitId === undefined || entry.executionUnitId === call.executionUnitId));
  const results = new Map(calls.map(call => [call.callId, requestResult(call, calls, entries, !query && category === "All events")]));
  const rejectedCalls = new Map(calls.filter(call => results.get(call.callId)?.status === "rejected").map(call => [results.get(call.callId)!.entry!.sequence, call]));
  const displaySteps = displayStepBySequence(entries);
  for (const call of visibleCalls) {
    if (call.firstSystem || call.systemChanged) rows.push({ id: `${call.callId}:system`, role: "System", text: call.firstSystem ? "Initial system prompt" : "System prompt updated", result: call.systemVersion.slice(0, 8), time: call.occurredAt, step: call.stepIndex, call, tab: call.firstSystem ? "System Prompt" : "Diff" });
    for (const message of call.messages) rows.push({ id: `${call.callId}:${message.index}`, role: message.role === "assistant" ? "Assistant" : message.role === "tool" ? "Tool" : message.source === "conversation" || message.source === "native_history" && message.role === "user" ? "User" : "Context", text: message.source === "working_context" ? "Working context updated" : contextPreview(message.preview), time: call.occurredAt, step: call.stepIndex, call, messageIndex: message.index });
    rows.push({ id: `${call.callId}:request`, role: "Request", text: `${call.stage} · ${results.get(call.callId)!.label}`, time: call.occurredAt, step: call.stepIndex, call, request: true, status: results.get(call.callId)!.status });
    if (call.omittedMessageCount > 0) rows.push({ id: `${call.callId}:more`, role: "Context", text: `${call.omittedMessageCount} more input messages · Open complete request`, time: call.occurredAt, step: call.stepIndex, call });
  }
  for (const entry of entries) {
    if (entry.sequence !== selectedSequence && entry.eventType === "model_context_frame" && visibleCalls.some(call => call.callId === entry.modelCallId)) continue;
    if (entry.sequence !== selectedSequence && !query && category === "All events" && (["state_committed", "action_staged", "observation_recorded"].includes(entry.eventType) || entry.category === "commit")) continue;
    if (entry.eventType === "tool_finished" && entries.some(start => start.eventType === "tool_started" && start.actionId === entry.actionId)) continue;
    rows.push({ id: entry.eventId, role: entry.category === "tool" ? "Tool" : entry.eventType === "decision_received" ? "Assistant" : entry.eventType === "think_completed" ? "Thinking" : entry.eventType === "model_context_frame" || entry.category === "memory" ? "Context" : "Run",
      text: eventLabel(entry),
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
    if (row.retryKey && previous?.key === row.retryKey) previous.rows.push(row);
    else chunks.push({ key: row.retryKey ?? row.id, rows: [row], retry: row.retryKey !== undefined });
  }
  const renderRow = (row: RecordRow) => {
    const selected = row.entry
      ? row.entry.sequence === selectedSequence
      : (row.request || row.tab !== undefined || row.messageIndex !== undefined) && selectedInput?.callId === row.call?.callId && selectedInput?.tab === (row.tab ?? "Messages") && selectedInput?.messageIndex === row.messageIndex;
    return <div role="option" aria-selected={selected} className={`ct-record ${row.status ?? ""} ${selected ? "selected" : ""} ${row.entry?.parentActionId !== undefined && row.entry.callIndex !== undefined ? "child" : ""}`} key={row.id}>
      <div className="ct-gutter"><span className="ct-sequence">{row.entry?.sequence ?? "·"}</span>{showRequests && row.request && <button className="ct-request-dot" aria-label={row.entry ? `View prompt for event ${row.entry.sequence}` : `Inspect model request ${row.call!.callId}`} onClick={() => selectInput({ callId: row.call?.callId ?? row.promptCallId ?? row.entry?.modelCallId ?? null, tab: "Messages" })}/>}</div>
      <button id={row.entry ? `trajectory-event-${row.entry.sequence}` : undefined} className="ct-record-body" aria-pressed={selected} onClick={() => row.entry ? selectEvent(row.entry) : selectInput({ callId: row.call!.callId, tab: row.tab ?? "Messages", messageIndex: row.messageIndex })}>
        <span className="ct-preview"><span className={`ct-badge ${row.role.toLowerCase()}`}>{row.role}</span><span className="ct-event-text"><strong>{row.text}</strong>{row.entry?.parentActionId !== undefined && row.entry.callIndex !== undefined && <small title={`Program ${row.entry.parentActionId}`}>Program call {row.entry.callIndex + 1}</small>}</span></span>
        <time className="ct-time" dateTime={row.time} title={row.time}>{formatEventTime(row.time)}</time>
        <span className="ct-detail">{row.entry?.resultPreview ?? row.result ?? row.entry?.inputPreview ?? row.input ?? row.entry?.preview ?? ""}</span>
      </button>
    </div>;
  };
  const renderChunk = (chunk: (typeof chunks)[number]) => {
    if (!chunk.retry) return chunk.rows.map(renderRow);
    const peers = visibleCalls.filter(call => `${call.executionUnitId}:${call.stage}` === chunk.key);
    const last = peers.at(-1)!;
    const rejection = [...peers].reverse().map(call => results.get(call.callId)).find(result => result?.status === "rejected")!;
    const selectedInside = chunk.rows.some(row => row.entry?.sequence === selectedSequence || row.call?.callId === selectedInput?.callId);
    const expanded = !collapsedRetries.includes(chunk.key) && (expandedRetries.includes(chunk.key) || !!query || selectedInside);
    return <section className="ct-retry" key={chunk.key} aria-label={`Step ${last.stepIndex} ${last.stage} attempts`}>
      <div className="ct-retry-header"><button className="ct-retry-toggle" aria-expanded={expanded} onClick={() => {
        setCollapsedRetries(current => expanded ? [...current, chunk.key] : current.filter(key => key !== chunk.key));
        setExpandedRetries(current => expanded ? current.filter(key => key !== chunk.key) : [...current, chunk.key]);
      }}><span>{expanded ? "▾" : "▸"}</span><strong>Step {last.stepIndex} / {last.stage}</strong><span>{peers.length} attempts · {results.get(last.callId)!.label}</span><span className="ct-retry-error">{rejection.entry!.preview}</span></button><button className="ct-retry-prompt" onClick={() => selectInput({ callId: last.callId, tab: "Messages" })}>Last prompt</button></div>
      {expanded && chunk.rows.map(renderRow)}
    </section>;
  };
  const stepGroups: { key: string; step?: number; chunks: typeof chunks }[] = [];
  for (const chunk of chunks) {
    const step = chunk.rows[0]?.step;
    const previous = stepGroups.at(-1);
    if (previous && previous.step === step) previous.chunks.push(chunk);
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
    const filterChanged = prev.query !== query || prev.category !== category;
    previousFilterRef.current = { query, category };
    if (!filterChanged) return;
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedCategory = category.trim();
    if (!normalizedQuery && normalizedCategory === "All events") return;
    const matchedStepKeys = new Set<string>();
    for (const group of stepGroups) {
      if (group.step === undefined) continue;
      const hasMatch = group.chunks.some(chunk => chunk.rows.some(row => {
        if (row.entry) return isEventMatched(row.entry, query, category);
        if (row.call) return (normalizedCategory === "All events" || normalizedCategory === "decision" || normalizedCategory === "memory") && (normalizedQuery === "" || `${row.call.stage} ${row.text}`.toLowerCase().includes(normalizedQuery));
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
  }, [query, category, stepGroups]);
  function toggleStep(key: string, group: (typeof stepGroups)[number]) {
    setCollapsedSteps(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
  }
  return <>
    <div className="mi-input-status">{error ? <span role="alert">Model inputs could not be loaded. Committed events are still available. <button onClick={() => setRetry(value => value + 1)}>Retry inputs</button></span> : total === 0 ? query ? "No saved model inputs match this search." : "Historical model inputs not recorded." : `${offset + 1}–${offset + calls.length} / ${total} saved model inputs · Independent of Snapshot commits`}{total > 100 && <span><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Earlier inputs</button><button disabled={nextOffset === null} onClick={() => setOffset(nextOffset!)}>Later inputs</button></span>}</div>
    <div className="ct-column-head" aria-hidden="true"><span>#</span><span>Event</span><span>Time</span><span>Detail</span></div>
    <div className="ct-record-list" role="listbox" aria-label="Recorded events">
      {showSteps ? stepGroups.map(group => group.step === undefined
        ? <div className="ct-run-records" key={group.key}>{group.chunks.map(renderChunk)}</div>
        : <section className="ct-step-group" key={group.key}>
            <button className="ct-step-header" aria-expanded={!collapsedSteps.includes(group.key)} onClick={() => toggleStep(group.key, group)}><span aria-hidden="true">{collapsedSteps.includes(group.key) ? "▸" : "▾"}</span><strong>Step {group.step}</strong><small>{group.chunks.reduce((count, chunk) => count + chunk.rows.length, 0)} records</small></button>
            {!collapsedSteps.includes(group.key) && group.chunks.map(renderChunk)}
          </section>) : chunks.map(renderChunk)}
    </div>
  </>;
}

function eventLabel(entry: BrowserTrajectoryEntry): string {
  if (entry.eventType === "tool_started") return entry.title.replace(/^tool_started: /, "");
  if (entry.eventType === "run_completed") return "Run completed";
  return entry.eventType.replaceAll("_", " ");
}

function formatEventTime(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString("en-GB", { hour12: false }) : "—";
}

function contextPreview(preview: string): string {
  if (preview.startsWith('{"source":"runtime_feedback"')) {
    const attempt = /"attempt":(\d+)/.exec(preview)?.[1];
    return `Output correction${attempt ? ` after attempt ${attempt}` : ""} · Open prompt for details`;
  }
  const section = /^\[Dynamic section(?: update)?: ([^;]+);/.exec(preview);
  if (!section) return preview;
  const labels: Record<string, string> = { run_mode: "Run mode", authorized_tools: "Authorized tools", working_memory: "Working memory" };
  return `${labels[section[1]!] ?? section[1]} · ${preview.startsWith("[Dynamic section update:") ? "Updated instructions" : "Instructions"}`;
}
