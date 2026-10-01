import { useEffect, useState } from "react";
import type { BrowserTrajectoryEntry, BrowserModelInputSummary } from "../../../packages/browser/src/index";
import { browserApi } from "./api";
import { ModelInputInspector } from "./model-input-inspector";
import { requestResult } from "./trajectory-presentation";

export function TrajectoryRecords({ goalId, runId, entries, refresh, selectEvent, target, showSteps, showRequests, onCalls, selectedSequence, query, category }: { onCalls: (calls: BrowserModelInputSummary[]) => void; selectedSequence: number | null; query: string; category: string; goalId: string; runId: string; entries: readonly BrowserTrajectoryEntry[]; refresh: unknown; selectEvent: (entry: BrowserTrajectoryEntry) => void; target: { callId: string | null; tab: string; nonce: number } | null; showSteps: boolean; showRequests: boolean }) {
  const [calls, setCalls] = useState<BrowserModelInputSummary[]>([]);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [total, setTotal] = useState(0);
  const [expandedRetries, setExpandedRetries] = useState<string[]>([]);
  const [selected, setSelected] = useState<{ callId: string | null; tab: string } | null>(null);
  useEffect(() => { setSelected(target); }, [target]);
  useEffect(() => { setOffset(0); setCalls([]); setSelected(null); setExpandedRetries([]); }, [runId]);
  useEffect(() => {
    const controller = new AbortController(); setError(false);
    void browserApi.modelInputs(goalId, runId, offset, controller.signal, query).then(result => {
      if (!controller.signal.aborted) { setCalls(result.calls); setNextOffset(result.nextOffset); setTotal(result.total); }
    }).catch(() => { if (!controller.signal.aborted) { setError(true); setCalls([]); } });
    return () => controller.abort();
  }, [goalId, runId, offset, refresh, query]);
  useEffect(() => { setOffset(0); }, [query]);
  useEffect(() => { onCalls(calls); }, [calls, onCalls]);
  type RecordRow = { id: string; role: string; text: string; time: string; step?: number; entry?: BrowserTrajectoryEntry; call?: BrowserModelInputSummary; tab?: string; input?: string; result?: string; request?: boolean; promptCallId?: string; status?: string; retryKey?: string };
  const rows: RecordRow[] = [];
  const visibleCalls = (category === "All events" || category === "decision" || category === "memory" ? calls : []).filter(call => entries.length === 0 || entries.some(entry => entry.executionUnitId === call.executionUnitId));
  const results = new Map(calls.map(call => [call.callId, requestResult(call, calls, entries, !query && category === "All events")]));
  const rejectedCalls = new Map(calls.filter(call => results.get(call.callId)?.status === "rejected").map(call => [results.get(call.callId)!.entry!.sequence, call]));
  for (const call of visibleCalls) {
    if (call.firstSystem || call.systemChanged) rows.push({ id: `${call.callId}:system`, role: "System", text: call.firstSystem ? "Initial system prompt" : "System prompt updated", result: call.systemVersion.slice(0, 8), time: call.occurredAt, step: call.stepIndex, call, tab: call.firstSystem ? "System Prompt" : "Diff" });
    for (const message of call.messages) rows.push({ id: `${call.callId}:${message.index}`, role: message.role === "assistant" ? "Assistant" : message.source === "conversation" ? "User" : "Context", text: message.source === "working_context" ? "Working context updated" : contextPreview(message.preview), time: call.occurredAt, step: call.stepIndex, call });
    rows.push({ id: `${call.callId}:request`, role: "Request", text: `${call.stage} · ${results.get(call.callId)!.label}`, time: call.occurredAt, step: call.stepIndex, call, request: true, status: results.get(call.callId)!.status });
    if (call.omittedMessageCount > 0) rows.push({ id: `${call.callId}:more`, role: "Context", text: `${call.omittedMessageCount} more input messages · Open complete request`, time: call.occurredAt, step: call.stepIndex, call });
  }
  for (const entry of entries) {
    if (entry.sequence !== selectedSequence && entry.eventType === "model_context_frame" && visibleCalls.some(call => call.callId === entry.modelCallId)) continue;
    if (entry.sequence !== selectedSequence && !query && category === "All events" && (["state_committed", "action_staged", "observation_recorded"].includes(entry.eventType) || entry.category === "commit")) continue;
    if (entry.eventType === "tool_finished" && entries.some(start => start.eventType === "tool_started" && start.actionId === entry.actionId)) continue;
    rows.push({ id: entry.eventId, role: entry.category === "tool" ? "Tool" : entry.eventType === "decision_received" ? "Assistant" : entry.eventType === "think_completed" ? "Thinking" : entry.eventType === "model_context_frame" || entry.category === "memory" ? "Context" : "Run",
      text: entry.inputPreview !== undefined ? entry.title.replace("tool_started: ", "") : entry.eventType === "run_completed" ? "Run completed" : entry.preview,
      time: entry.occurredAt, step: entry.stepIndex, entry, input: entry.inputPreview, result: entry.resultPreview,
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
  const stepStarts = new Set(rows.filter((row, index) => row.step !== undefined && (index === 0 || rows[index - 1]?.step !== row.step)).map(row => row.id));
  const renderRow = (row: RecordRow) => <div className={`ct-record ${row.status ?? ""}`} key={row.id}>
    <div className="ct-gutter">{showSteps && row.step !== undefined && stepStarts.has(row.id) && <span>Step {row.step}</span>}{showRequests && row.request && <button className="ct-request-dot" aria-label={row.entry ? `View prompt for event ${row.entry.sequence}` : `Inspect model request ${row.call!.callId}`} onClick={() => setSelected({ callId: row.call?.callId ?? row.promptCallId ?? row.entry?.modelCallId ?? null, tab: "Messages" })}/>}</div>
    <button id={row.entry ? `trajectory-event-${row.entry.sequence}` : undefined} className="ct-record-body" aria-pressed={row.entry?.sequence === selectedSequence} onClick={() => row.entry ? (setSelected(null), selectEvent(row.entry)) : setSelected({ callId: row.call!.callId, tab: row.tab ?? "Messages" })}><span className={`ct-badge ${row.role.toLowerCase()}`}>{row.role}</span><span className="ct-preview"><strong>{row.text}</strong>{row.input && <code>{row.input}</code>}{row.result && <><span className="ct-arrow">→</span><code className="ct-output">{row.result}</code></>}</span></button>
  </div>;
  return <>
    <div className="mi-input-status">{error ? <span role="alert">Could not read model inputs. Refresh to retry.</span> : total === 0 ? query ? "No saved model inputs match this search." : "Historical model inputs not recorded." : `${offset + 1}–${offset + calls.length} / ${total} saved model inputs · Independent of Snapshot commits`}{total > 100 && <span><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Earlier inputs</button><button disabled={nextOffset === null} onClick={() => setOffset(nextOffset!)}>Later inputs</button></span>}</div>
    {chunks.map(chunk => {
      if (!chunk.retry) return chunk.rows.map(renderRow);
      const peers = visibleCalls.filter(call => `${call.executionUnitId}:${call.stage}` === chunk.key);
      const last = peers.at(-1)!;
      const rejection = [...peers].reverse().map(call => results.get(call.callId)).find(result => result?.status === "rejected")!;
      const expanded = expandedRetries.includes(chunk.key) || !!query || chunk.rows.some(row => row.entry?.sequence === selectedSequence);
      return <section className="ct-retry" key={chunk.key} aria-label={`Step ${last.stepIndex} ${last.stage} attempts`}>
        <div className="ct-retry-header"><button className="ct-retry-toggle" aria-expanded={expanded} onClick={() => setExpandedRetries(previous => expanded ? previous.filter(key => key !== chunk.key) : [...previous, chunk.key])}><span>{expanded ? "▾" : "▸"}</span><strong>Step {last.stepIndex} / {last.stage}</strong><span>{peers.length} attempts · {results.get(last.callId)!.label}</span><span className="ct-retry-error">{rejection.entry!.preview}</span></button><button className="ct-retry-prompt" onClick={() => setSelected({ callId: last.callId, tab: "Messages" })}>Last prompt</button></div>
        {expanded && chunk.rows.map(renderRow)}
      </section>;
    })}
    {selected && <ModelInputInspector key={`${selected.callId}:${selected.tab}`} goalId={goalId} runId={runId} callId={selected.callId} initialTab={selected.tab} result={selected.callId ? results.get(selected.callId) : undefined} onViewResult={entry => { setSelected(null); selectEvent(entry); }} onClose={() => setSelected(null)}/>}
  </>;
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
