import { useState } from "react";
import { Clock, Copy, Search, X } from "lucide-react";
import { PromptInspectorPrototype } from "./prompt-inspector-prototype";
import "./compact-trajectory-prototype.css";

type Row = { id: string; step: number; role: "System" | "User" | "Context" | "Assistant" | "Tool"; text: string; input?: string; output?: string; source?: string; request?: boolean; time: number };
const records: Row[] = [
  { id: "system", step: 0, role: "System", text: "Initial system prompt", source: "Prompt Bundle · System v1", time: 0 },
  { id: "user", step: 1, role: "User", text: "Analyze the LazyGoal architecture and explain the execution and recovery boundaries.", time: 0 },
  { id: "instructions", step: 1, role: "Context", text: "Workspace instructions: preserve Runtime ownership of the Goal lifecycle. Inspect source files before describing architectural boundaries.", source: "Workspace instructions", time: .2 },
  { id: "runtime", step: 1, role: "Context", text: "Current runtime context: Run mode is normal. Approved task: analyze architecture. Authorized tools: shell, read_file.", source: "RunState / approved task / authorized tool registry", time: .3 },
  { id: "agent-1", step: 1, role: "Assistant", text: "Tool call only", request: true, time: 1 },
  { id: "tool-1", step: 1, role: "Tool", text: "shell", input: '{"command":"ls packages && ls docs/architecture"}', output: "agent/ browser/ contracts/ execution-stream/ http/ llm/ runtime/ storage/ tools/ tui/ · agent.md browser.md runtime.md", time: 3 },
  { id: "memory", step: 2, role: "Context", text: "Working memory update: package boundaries located. Next focus: execution lifecycle and persistence recovery.", source: "WorkingMemory", time: 9 },
  { id: "agent-2", step: 2, role: "Assistant", text: "Tool call only", request: true, time: 11 },
  { id: "tool-2", step: 2, role: "Tool", text: "read_file", input: '{"path":"docs/architecture/runtime.md"}', output: "Runtime owns scheduling, the Action / Observation loop, Snapshot commit boundaries, and resumable execution.", time: 13 },
  { id: "agent-2b", step: 2, role: "Assistant", text: "Runtime controls state transitions; Storage implements persistence ports. Trace the Agent input assembly next.", time: 18 },
  { id: "tool-3", step: 2, role: "Tool", text: "read_file", input: '{"path":"packages/agent/src/render.ts"}', output: "renderRequest assembles system → conversation → stage messages → dynamic sections → Working Context.", time: 19 },
  { id: "system-update", step: 3, role: "System", text: "System prompt updated", output: "v1 → v2 · +2 / −1 lines", source: "Prompt Bundle · System v2", time: 35 },
  { id: "evidence", step: 3, role: "Context", text: "Completion evidence: docs/architecture/runtime.md and packages/agent/src/render.ts. Cite source paths when explaining module boundaries.", source: "WorkingMemory / completion evidence", time: 36 },
  { id: "agent-3", step: 3, role: "Assistant", text: "LazyGoal separates Runtime orchestration, Agent model execution, and Storage persistence. Each Goal resumes from its committed Snapshot and Trajectory.", request: true, time: 38 },
];

export function CompactTrajectoryPrototype({ runIndex, onRunChange, target }: { runIndex: number; onRunChange: (value: number) => void; target: number | null }) {
  const [query, setQuery] = useState("");
  const [showSteps, setShowSteps] = useState(true);
  const [showCalls, setShowCalls] = useState(true);
  const [duration, setDuration] = useState(true);
  const [selected, setSelected] = useState<Row | null>(target === null ? null : records.find(row => row.request && row.step === (target < 6 ? 1 : target < 9 ? 2 : 3)) ?? null);
  const [promptStep, setPromptStep] = useState<number | null>(null);
  const [promptTab, setPromptTab] = useState("Messages");
  const [copied, setCopied] = useState(false);
  const data = runIndex ? records.slice(0, 5) : records;
  const visible = data.filter(row => `${row.role} ${row.text} ${row.input ?? ""} ${row.output ?? ""} ${row.source ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const selectedPrompt = promptStep ?? (selected && selected.role !== "Tool" && selected.role !== "Assistant" ? Math.max(1, selected.step) : null);
  function select(row: Row) { setSelected(row); setPromptStep(null); setPromptTab(row.role === "System" ? row.id === "system" ? "System Prompt" : "Diff" : "Messages"); setCopied(false); }
  function openPrompt(step: number) { setSelected(null); setPromptStep(step); setPromptTab("Messages"); }
  return <div className="ct-view">
    <div className="ct-toolbar"><select aria-label="Select compact trajectory run" value={runIndex} onChange={event => { setSelected(null); setPromptStep(null); onRunChange(Number(event.target.value)); }}><option value={0}>Run 4 · Completed</option><option value={1}>Run 3 · Prompt not recorded</option></select><span className="ct-sample">Design preview</span><label className="ct-search"><Search size={14}/><input aria-label="Search compact trajectory" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={12}/></button>}</label></div>
    <div className="ct-controls"><button aria-pressed={duration} onClick={() => setDuration(!duration)}><Clock size={13}/>Duration</button><button aria-pressed={showSteps} onClick={() => setShowSteps(!showSteps)}>⊟ Steps</button><button aria-pressed={showCalls} onClick={() => setShowCalls(!showCalls)}>⊟ Requests</button><small>{runIndex ? "1 request" : "3 requests · 2 system versions"}</small></div>
    <div className="ct-timeline" aria-label="Compact trajectory overview"><div className="ct-lanes"><span>Input</span><span>Model</span><span>Tools</span></div><div className="ct-tracks">{data.filter(row => row.role !== "System" || row.step > 0).map((row, index) => <button key={row.id} className={`ct-span ${row.role.toLowerCase()}`} aria-label={`Locate ${row.id}`} title={row.text} style={{ left: `${duration ? row.time / 42 * 97 : index / data.length * 97}%`, top: row.role === "Tool" ? 43 : row.role === "Assistant" ? 27 : 11, width: row.role === "Assistant" ? duration ? `${Math.max(2, ((data[index + 1]?.time ?? 42) - row.time) / 42 * 97)}%` : "5%" : "3px" }} onClick={() => select(row)}/>)}<div className="ct-ruler"><span>{duration ? "0s" : "Start"}</span><span>{duration ? "21s" : "Sequence"}</span><span>{duration ? "42s" : "End"}</span></div></div></div>
    <div className="ct-content"><div className="ct-ledger" aria-label="Compact trajectory records">{visible.map((row, index) => <div className={`ct-record ${selected?.id === row.id ? "selected" : ""}`} key={row.id}>
      <div className="ct-gutter">{showSteps && row.step > 0 && (index === 0 || visible[index - 1]?.step !== row.step) ? <span>Step {row.step}</span> : null}{row.request && showCalls && <button className="ct-request-dot" aria-label={`Inspect Step ${row.step} model request`} title="View model prompt" onClick={() => openPrompt(row.step)}/>}</div>
      <button className="ct-record-body" aria-pressed={selected?.id === row.id} onClick={() => select(row)}><span className={`ct-badge ${row.role.toLowerCase()}`}>{row.role}</span><span className={`ct-preview ${row.role === "Assistant" && row.text === "Tool call only" ? "muted" : ""}`}><strong>{row.text}</strong>{row.input && <code>{row.input}</code>}{row.output && <><span className="ct-arrow">→</span><code className="ct-output">{row.output}</code></>}</span></button>
    </div>)}{visible.length === 0 && <div className="ct-empty">No records match “{query}”.<button onClick={() => setQuery("")}>Clear search</button></div>}</div>
      {selectedPrompt !== null && <PromptInspectorPrototype key={promptTab} step={selectedPrompt} missing={runIndex !== 0} initialTab={promptTab} onClose={() => { setSelected(null); setPromptStep(null); }} onStep={step => { setSelected(null); setPromptStep(step); }}/>}
      {selected && selectedPrompt === null && <section className="ct-detail" aria-label="Compact record details"><header><span className={`ct-badge ${selected.role.toLowerCase()}`}>{selected.role}</span><span>Step {selected.step}</span><button aria-label="Close record details" onClick={() => setSelected(null)}><X size={15}/></button></header><h3>{selected.role === "Tool" ? selected.text : "Assistant response"}</h3><div className="ct-detail-scroll">{selected.role === "Tool" ? <><h4>Input</h4><pre>{selected.input}</pre><h4>Result</h4><pre>{selected.output}</pre></> : <><h4>Recorded response</h4><p>{selected.text}</p></>}<small>Sample record · Design preview</small></div><footer>{selected.request && <button onClick={() => openPrompt(selected.step)}>View model prompt</button>}<button onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(selected, null, 2)); setCopied(true); } catch { setCopied(false); } }}><Copy size={12}/>{copied ? "Copied" : "Copy record"}</button></footer></section>}
    </div><footer className="ct-footer"><span>{visible.length} / {data.length} records</span><span>Sample data · No backend connection</span></footer>
  </div>;
}
