import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, X } from "lucide-react";
import type { BrowserModelInputDetail, BrowserTrajectoryEntry } from "../../../packages/browser/src/index";
import { browserApi, BrowserApiError } from "./api";
import type { RequestResult } from "./trajectory-presentation";

export function ModelInputInspector({ goalId, runId, callId, initialTab = "Messages", onClose, result, onViewResult }: { result?: RequestResult; onViewResult?: (entry: BrowserTrajectoryEntry) => void; goalId: string; runId: string; callId: string | null; initialTab?: string; onClose: () => void }) {
  const [detail, setDetail] = useState<BrowserModelInputDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(initialTab);
  const [copied, setCopied] = useState("Copy prompt");
  useEffect(() => {
    const controller = new AbortController();
    setDetail(null); setError(null); setCopied("Copy prompt");
    if (!callId) { setError("Prompt not recorded for this historical request."); return () => controller.abort(); }
    void browserApi.modelInput(goalId, runId, callId, controller.signal).then(value => { if (!controller.signal.aborted) setDetail(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof BrowserApiError && reason.status === 413 ? "Complete input exceeds the 2 MiB viewing limit." : reason instanceof BrowserApiError && reason.status === 404 ? "Prompt not recorded for this request." : reason instanceof BrowserApiError && [401, 403].includes(reason.status) ? "Access expired. Reopen lazygoal web." : "Could not read model input. Close and reopen to retry."); });
    return () => controller.abort();
  }, [goalId, runId, callId]);
  const system = detail?.call.messages.filter(message => message.role === "system").map(message => message.content).join("\n") ?? "";
  const previous = detail?.previousSystem;
  const oldLines = previous?.split("\n") ?? [], newLines = system.split("\n");
  let prefix = 0, suffix = 0;
  while (prefix < Math.min(oldLines.length, newLines.length) && oldLines[prefix] === newLines[prefix]) prefix++;
  while (suffix < Math.min(oldLines.length, newLines.length) - prefix && oldLines[oldLines.length - suffix - 1] === newLines[newLines.length - suffix - 1]) suffix++;
  const diff = [...newLines.slice(0, prefix).map(text => ({ text, kind: "same" })), ...oldLines.slice(prefix, oldLines.length - suffix).map(text => ({ text, kind: "removed" })), ...newLines.slice(prefix, newLines.length - suffix).map(text => ({ text, kind: "added" })), ...newLines.slice(newLines.length - suffix).map(text => ({ text, kind: "same" }))];
  return createPortal(<section className="tr-inspector mi-inspector" aria-label="Model prompt details"><header><span>Model input</span><span>{detail ? `Step ${detail.call.stepIndex} / ${detail.call.stage}` : "Request"}</span><button aria-label="Close prompt details" onClick={onClose}><X size={15}/></button></header><div className="tr-detail-title"><h3>{result?.label ?? "Input prepared for the model"}</h3><code>{callId ?? "Not recorded"}</code></div><div className="tr-detail-tabs">{["Messages", "System Prompt", "Diff", "Source", "Raw"].map(value => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{value}</button>)}</div>
    <div className="tr-detail-body">{error ? <p role="alert">{error}</p> : !detail ? <p role="status">Loading recorded input…</p> : <>
      {result?.entry && <div className={`mi-result ${result.status}`}><strong>{result.label}</strong><p>{result.status === "rejected" ? result.entry.preview : "A committed context frame records the accepted output."}</p>{onViewResult && <button onClick={() => onViewResult(result.entry!)}>View {result.status === "rejected" ? "rejection" : "accepted frame"} details</button>}</div>}
      <div className="mi-version"><span>System {detail.systemVersion.slice(0, 8)}</span><span>{previous === null ? "First recorded" : previous === system ? "Unchanged · version reused" : "Changed from previous request"}</span></div>
      {tab === "Messages" ? detail.call.messages.map((message, index) => <details className={`mi-message ${message.source === "conversation" ? message.role : message.role === "system" ? "system" : "context"}`} key={index} open={message.role !== "system"}><summary><span>{index + 1}</span><strong>{message.role === "system" ? "System" : message.role === "assistant" ? "Assistant" : message.source === "conversation" ? "User" : "Context"}</strong><small>{message.source} · role: {message.role}</small></summary><pre>{message.content}</pre></details>)
        : tab === "System Prompt" ? <pre>{system || "No system message in this recorded request."}</pre>
        : tab === "Diff" ? previous === null ? <p>First recorded system prompt. No earlier request in this Run.</p> : previous === system ? <p>System prompt unchanged. The saved version is reused.</p> : diff.length > 2000 ? <p>Diff exceeds 2,000 lines. View complete text in System Prompt or Raw.</p> : <><p>Compared with {detail.previousCallId}. Common prefix and suffix are preserved; the changed region is highlighted.</p><div className="mi-diff">{diff.map((line, index) => <div className={line.kind} key={index}><span>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</span><code>{line.text}</code></div>)}</div></>
        : tab === "Source" ? <><dl><div><dt>Call</dt><dd>{detail.call.callId}</dd></div><div><dt>Execution unit</dt><dd>{detail.call.executionUnitId ?? "Unavailable"}</dd></div><div><dt>Stage</dt><dd>{detail.call.stage}</dd></div><div><dt>Prepared at</dt><dd>{detail.call.occurredAt}</dd></div><div><dt>Previous request</dt><dd>{detail.previousCallId ?? "None"}</dd></div></dl><p>Recorded before the Adapter call. This record does not confirm provider receipt and is independent of Snapshot commits.</p></>
        : <pre>{JSON.stringify(detail.call, null, 2)}</pre>}
    </>}</div><footer><button disabled={!detail} onClick={async () => { try { await navigator.clipboard.writeText(tab === "System Prompt" ? system : JSON.stringify(detail?.call, null, 2)); setCopied("Copied"); } catch { setCopied("Copy failed"); } }}><Copy size={12}/>{copied}</button><div/><small>Complete saved messages</small></footer>
  </section>, document.querySelector(".trajectory-view")!);
}
