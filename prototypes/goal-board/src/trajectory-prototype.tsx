import { Fragment, useRef, useState, type PointerEvent } from "react";
import { createRoot } from "react-dom/client";
import { ArrowDown, ArrowLeft, Check, ChevronRight, Copy, FileText, Folder, GitBranch, Layers, LayoutGrid, Maximize2, Minimize2, Search, Terminal, X, Zap } from "lucide-react";
import "./trajectory-prototype.css";

type Category = "Lifecycle" | "Decision" | "Tool" | "State";
type Entry = { sequence: number; time: string; type: string; category: Category; title: string; description: string; payload: Record<string, unknown> };
const goalId = "714a07ed-b165-4e81-844a-5622cdeb0775";
const runs = [
  { id: "12e8e636-bda5-43b7-bf33-63548576623b", label: "Run 4", status: "Completed", date: "Sep 30, 14:32", duration: "42s" },
  { id: "83ef90a1-0423-4c07-a7e9-53ea736d0bc1", label: "Run 3", status: "Failed", date: "Sep 30, 14:28", duration: "8s" },
];
const entries: Entry[] = [
  { sequence: 1, time: "14:32:00", type: "run_started", category: "Lifecycle", title: "Run started", description: "Analyze the LazyGoal architecture", payload: {} },
  { sequence: 2, time: "14:32:02", type: "decision_received", category: "Decision", title: "Inspect the workspace", description: "Locate packages and architecture documents.", payload: { thought: "Inspect the repository structure before tracing module responsibilities.", decision: { type: "tool_call", toolId: "shell", input: { command: "ls packages && ls docs/architecture" } } } },
  { sequence: 3, time: "14:32:03", type: "tool_started", category: "Tool", title: "shell", description: "ls packages && ls docs/architecture", payload: { actionId: "action-01", toolId: "shell", input: { command: "ls packages && ls docs/architecture" } } },
  { sequence: 4, time: "14:32:04", type: "tool_finished", category: "Tool", title: "shell returned", description: "Package structure and architecture files", payload: { actionId: "action-01", toolId: "shell", observation: { stdout: "agent/    browser/    contracts/    execution-stream/\nhttp/     llm/        runtime/      sandbox/\nstorage/  tools/      tui/\n\nagent.md  browser.md  contracts.md  runtime.md", exitCode: 0 } } },
  { sequence: 5, time: "14:32:06", type: "state_committed", category: "State", title: "State saved", description: "Execution progress committed", payload: { committedThroughSequence: 4 } },
  { sequence: 6, time: "14:32:12", type: "decision_received", category: "Decision", title: "Trace the execution lifecycle", description: "Read the Runtime architecture document.", payload: { thought: "Follow Goal scheduling, action execution, and recovery ownership.", decision: { type: "tool_call", toolId: "read_file", input: { path: "docs/architecture/runtime.md" } } } },
  { sequence: 7, time: "14:32:13", type: "tool_started", category: "Tool", title: "read_file", description: "docs/architecture/runtime.md", payload: { actionId: "action-02", toolId: "read_file", input: { path: "docs/architecture/runtime.md" } } },
  { sequence: 8, time: "14:32:14", type: "tool_finished", category: "Tool", title: "read_file returned", description: "Runtime lifecycle and persistence boundaries", payload: { actionId: "action-02", toolId: "read_file", observation: { content: "# Runtime\n\nLazyGoal runs each Goal through a resumable execution lifecycle.\n\nThe Runtime owns scheduling and the Action / Observation loop.\nStorage implements the persistence ports for snapshots and trajectories.\nThe agent package constructs prompts and executes model steps." } } },
  { sequence: 9, time: "14:32:39", type: "decision_received", category: "Decision", title: "Architecture analysis ready", description: "Summarize module responsibilities and data flow.", payload: { thought: "The main boundaries are Runtime orchestration, Agent model execution, and Storage persistence.", decision: { type: "complete", summary: "LazyGoal separates goal lifecycle, model decisions, tool execution, and durable state into dedicated workspaces." } } },
  { sequence: 10, time: "14:32:42", type: "run_completed", category: "Lifecycle", title: "Run completed", description: "Architecture analysis delivered", payload: { summary: "LazyGoal separates goal lifecycle, model decisions, tool execution, and durable state into dedicated workspaces." } },
];
const failed: Entry[] = [
  { ...entries[0]!, time: "14:28:00" },
  { ...entries[1]!, time: "14:28:02" },
  { sequence: 3, time: "14:28:08", type: "run_failed", category: "Lifecycle", title: "Run failed", description: "Model request timed out", payload: { reason: "The model request timed out before a response was received." } },
];
function eventJson(entry: Entry, runId: string) {
  return JSON.stringify({ eventSchemaVersion: 1, eventId: `demo-event-${entry.sequence}`, goalId, runId, sequence: entry.sequence, occurredAt: `2026-09-30T${entry.time}+08:00`, phase: "executing", eventType: entry.type, payload: { type: entry.type, ...entry.payload } }, null, 2);
}
function stepOf(entry: Entry) {
  return entry.sequence === 1 ? 0 : entry.sequence < 6 ? 1 : entry.sequence < 9 ? 2 : 3;
}
function secondsOf(entry: Entry) {
  const [hours, minutes, seconds] = entry.time.split(":").map(Number);
  return hours! * 3600 + minutes! * 60 + seconds!;
}
function App() {
  const [runIndex, setRunIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All events");
  const [detailTab, setDetailTab] = useState("Summary");
  const [wide, setWide] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [tab, setTab] = useState("Trajectory");
  const [open, setOpen] = useState(true);
  const [duration, setDuration] = useState(true);
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const dragStart = useRef<number | null>(null);
  const run = runs[runIndex]!;
  const data = runIndex === 0 ? entries : failed;
  const elapsed = secondsOf(data.at(-1)!) - secondsOf(data[0]!);
  const positionOf = (entry: Entry) => duration
    ? (secondsOf(entry) - secondsOf(data[0]!)) / elapsed
    : (entry.sequence - 1) / (data.length - 1);
  const visible = data.filter(e => (filter === "All events" || e.category === filter)
    && `${e.title} ${e.type} ${e.description} ${JSON.stringify(e.payload)}`.toLowerCase().includes(query.toLowerCase())
    && (range === null || positionOf(e) >= range[0] && positionOf(e) <= range[1]));
  const entry = data.find(e => e.sequence === selected);
  const groups = [...new Set(visible.map(stepOf))];
  const toolStart = entry?.payload.actionId === undefined ? undefined : data.find(e => e.type === "tool_started" && e.payload.actionId === entry.payload.actionId);
  const toolResult = entry?.payload.actionId === undefined ? undefined : data.find(e => e.type === "tool_finished" && e.payload.actionId === entry.payload.actionId);
  const input = toolStart?.payload.input ?? (entry?.payload.decision as {input?: unknown} | undefined)?.input;
  const result = toolResult?.payload.observation as {stdout?: string; content?: string; exitCode?: number} | undefined;
  const activeRange = draft ?? range;
  const allCollapsed = groups.filter(g => g > 0).every(g => collapsed.includes(g));
  function selectEvent(sequence: number) {
    setSelected(sequence); setDetailTab("Summary"); setCopied(false); setCopyError(false);
    const event = data.find(e => e.sequence === sequence)!;
    setCollapsed(current => current.filter(step => step !== stepOf(event)));
  }
  async function copy() {
    if (!entry) return;
    try { await navigator.clipboard.writeText(eventJson(entry, run.id)); setCopied(true); setCopyError(false); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopyError(true); }
  }
  function fraction(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - bounds.left) / (bounds.width * .98)));
  }
  return <div className="tp-app">
    <aside className="tp-sidebar"><div className="tp-brand"><Zap size={22}/> LazyGoal</div><div className="tp-workspace"><span>LG</span><div>Local workspace<small>Current project</small></div></div><p className="tp-muted">Workspace</p><button className="tp-nav" onClick={() => setOpen(false)}><LayoutGrid size={16}/>All goals <span>3</span></button><div className="tp-sidebar-foot"><i/>Local Runtime<small>UI prototype · Sample data</small></div></aside>
    <main><header className="tp-top"><Folder size={15}/> Workspace <ChevronRight size={13}/> Goals <ChevronRight size={13}/><strong>Analyze LazyGoal architecture</strong><span className="tp-demo">Prototype</span></header>
      <div className={`tp-workbench ${wide && open ? "tp-wide" : ""}`}><section className="tp-board"><h1>Goals <small>3</small></h1><p>Choose a Goal to open its saved session.</p><div className="tp-board-tabs"><LayoutGrid size={14}/> Board</div><h4><i/>Completed <small>3</small></h4><button className="tp-goal" onClick={() => setOpen(true)}><span className="tp-goal-icon"><Check size={15}/></span><strong>Analyze LazyGoal architecture</strong><p>Map modules, execution, and recovery.</p><footer>4 runs <span>Sep 30</span></footer></button><div className="tp-goal tp-dim"><strong>Review tool permissions</strong><p>Check workspace access boundaries.</p><footer>1 run <span>Sep 29</span></footer></div></section>
      {open && <section className={`tp-session ${wide ? "" : "tp-compact"}`} aria-label="Goal session">
        <div className="tp-session-head"><i/><span>714a07ed-b16</span><ChevronRight size={12}/><span>Session</span><div/><button title={wide ? "Compact view" : "Expand view"} aria-label={wide ? "Compact view" : "Expand view"} onClick={() => setWide(!wide)}>{wide ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button><button aria-label="Close session" onClick={() => setOpen(false)}><X size={17}/></button></div>
        <div className="tp-project"><GitBranch size={14}/> dev <span>/</span><Folder size={14}/>LazyGoal</div><div className="tp-tabs">{["Activity", "Trajectory"].map(t => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}<span className="tp-sample">Sample data</span></div>
        {tab === "Activity" ? <div className="tp-activity"><h2>Architecture analysis</h2><p>The Runtime owns Goal scheduling and execution. The Agent constructs model requests. Tools run workspace actions, while Storage persists snapshots and the trajectory.</p><button onClick={() => setTab("Trajectory")}><Layers size={15}/> Inspect the execution trajectory</button></div> : <>
          <div className="tr-runbar"><select aria-label="Select run" value={runIndex} onChange={e => { setRunIndex(Number(e.target.value)); setSelected(null); setRange(null); setCollapsed([]); setQuery(""); setFilter("All events"); }}>{runs.map((r,i) => <option key={r.id} value={i}>{r.label}{i === 0 ? " (latest)" : ""}</option>)}</select><span className={`tr-status ${runIndex ? "failed" : ""}`}>{runIndex ? <X size={12}/> : <Check size={12}/>} {run.status}</span><span>{run.duration}</span><span className="tr-date">{run.date}</span><span className="tr-event-count">{data.length} events</span></div>
          <div className="tr-toolbar"><button className={duration ? "enabled" : ""} aria-pressed={duration} onClick={() => { setDuration(!duration); setRange(null); }} title="Switch between recorded time and event sequence"><span className="tr-toggle"/>Duration</button><button onClick={() => setCollapsed(allCollapsed ? [] : groups.filter(g => g > 0))} aria-label={allCollapsed ? "Expand steps" : "Collapse steps"}><Layers size={13}/>Steps <span>{allCollapsed ? "+" : "−"}</span></button><select aria-label="Filter events" value={filter} onChange={e => setFilter(e.target.value)}>{["All events", "Decision", "Tool", "State", "Lifecycle"].map(f => <option key={f}>{f}</option>)}</select><label className="tr-search"><Search size={13}/><input aria-label="Search trajectory" placeholder="Search" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={12}/></button>}</label></div>
          <section className="tr-overview" aria-label="Trajectory overview"><div className="tr-lane-labels"><span>Run</span><span>Agent</span><span>Tools</span></div><div className="tr-plot" tabIndex={0} aria-label="Drag to focus a time range; Escape to clear" onKeyDown={e => { if (e.key === "Escape") { setRange(null); setDraft(null); } }} onPointerDown={e => { dragStart.current = fraction(e); setDraft(null); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (dragStart.current !== null) setDraft([Math.min(dragStart.current,fraction(e)),Math.max(dragStart.current,fraction(e))]); }} onPointerUp={e => { if (dragStart.current !== null) { const start = dragStart.current; const end = fraction(e); setRange(Math.abs(end-start) > .015 ? [Math.min(start,end),Math.max(start,end)] : null); } dragStart.current = null; setDraft(null); }} onPointerCancel={() => { dragStart.current = null; setDraft(null); }} onDoubleClick={() => setRange(null)}>
            <div className="tr-grid">{[0,25,50,75,100].map(n => <span key={n} style={{left:`${n}%`}}/>)}</div>
            {data.filter(e => e.category !== "State" && e.type !== "tool_finished").map(e => { const end = e.type === "tool_started" ? data.find(other => other.type === "tool_finished" && other.payload.actionId === e.payload.actionId) : e.category === "Decision" ? data.find(other => other.sequence === e.sequence + 1) : undefined; const pos = positionOf(e); return <button key={e.sequence} title={`#${e.sequence} ${e.title} · ${e.time}`} aria-label={`Locate event ${e.sequence}: ${e.title}`} className={`tr-span ${e.category.toLowerCase()} ${(selected === e.sequence || entry?.payload.actionId !== undefined && entry.payload.actionId === e.payload.actionId) ? "selected" : ""} ${!visible.includes(e) ? "faded" : ""} ${e.type === "run_failed" ? "error" : ""}`} style={{left:`${pos * 98}%`,width:`${end ? Math.max(1,(positionOf(end)-pos)*98) : .7}%`,top:e.category === "Tool" ? 39 : e.category === "Decision" ? 24 : 9}} onPointerDown={event => event.stopPropagation()} onClick={() => { setRange(null); setQuery(""); setFilter("All events"); selectEvent(e.sequence); window.requestAnimationFrame(() => document.getElementById(`event-${e.sequence}`)?.scrollIntoView({block:"nearest"})); }}/>; })}
            {activeRange && <div className="tr-range" style={{left:`${activeRange[0]*98}%`,width:`${(activeRange[1]-activeRange[0])*98}%`}}/>}
            <div className="tr-ruler">{[0,.25,.5,.75,1].map(n => <span key={n} style={{left:`${n*98}%`}}>{duration ? `${Math.round(elapsed*n)}s` : Math.round(1+(data.length-1)*n)}</span>)}</div>
          </div></section>
          <div className="tr-ledger-layout"><section className="tr-ledger" aria-label="Trajectory events"><div className="tr-table-head"><span>#</span><span>Event</span><span>Content</span></div><div className="tr-records">{groups.map(step => <Fragment key={step}><div className={`tr-step ${step === 0 ? "tr-run-boundary" : ""}`}><button onClick={() => setCollapsed(current => current.includes(step) ? current.filter(s => s !== step) : [...current,step])} aria-expanded={!collapsed.includes(step)}><ChevronRight size={12} className={collapsed.includes(step) ? "" : "rotated"}/>{step === 0 ? run.label : `Step ${step}`}</button><span>{step === 0 ? "Execution started" : runIndex ? "Inspect workspace" : ["", "Inspect workspace", "Trace execution", "Deliver analysis"][step]}</span><small>{visible.filter(e => stepOf(e) === step).length} events</small></div>{!collapsed.includes(step) && visible.filter(e => stepOf(e) === step).map(e => <button id={`event-${e.sequence}`} key={e.sequence} className={`tr-row ${e.category.toLowerCase()} ${e.sequence === selected ? "selected" : ""} ${e.type === "run_failed" ? "error" : ""}`} aria-pressed={selected === e.sequence} onClick={() => selectEvent(e.sequence)}><span className="tr-index">{e.sequence}</span><span className="tr-event-label">{e.category === "Tool" ? <Terminal size={12}/> : e.category === "Decision" ? <Zap size={12}/> : e.category === "State" ? <Layers size={12}/> : e.type === "run_failed" ? <X size={12}/> : <Check size={12}/>}<span>{e.category === "Decision" ? "Agent" : e.category === "Lifecycle" ? "Run" : e.category}</span></span><span className="tr-row-content"><strong>{e.title}</strong>{e.type !== "tool_started" && <span>{e.description}</span>}{e.type === "tool_started" && <code>{JSON.stringify(e.payload.input)}</code>}</span></button>)}</Fragment>)}{visible.length === 0 && <div className="tr-empty">No events match this view.<button onClick={() => { setQuery(""); setFilter("All events"); setRange(null); }}>Clear filters</button></div>}</div><footer className="tr-ledger-foot"><span>{visible.length} / {data.length} events</span>{range && <button onClick={() => setRange(null)}>Clear range <X size={11}/></button>}<button onClick={() => { setRange(null); setQuery(""); setFilter("All events"); selectEvent(data.at(-1)!.sequence); window.requestAnimationFrame(() => document.getElementById(`event-${data.at(-1)!.sequence}`)?.scrollIntoView({block:"nearest"})); }}><ArrowDown size={12}/>Latest</button></footer></section>
          {entry && <section className="tr-inspector" aria-label="Event details"><header><span className={`tr-detail-category ${entry.category.toLowerCase()}`}>{entry.category === "Decision" ? <Zap size={13}/> : entry.category === "Tool" ? <Terminal size={13}/> : <Layers size={13}/>} {entry.category}</span><span>{run.label}{stepOf(entry) > 0 ? ` / Step ${stepOf(entry)}` : ""}</span><button aria-label="Close event details" onClick={() => setSelected(null)}><X size={15}/></button></header><div className="tr-detail-title"><h3>{entry.title}</h3><code>{entry.type}</code></div><div className="tr-detail-tabs">{["Summary", ...(input !== undefined ? ["Input"] : []), ...(result ? ["Result"] : []), "Timing", "Raw"].map(t => <button key={t} className={detailTab === t ? "active" : ""} onClick={() => setDetailTab(t)}>{t}</button>)}</div><div className="tr-detail-body">{detailTab === "Raw" ? <pre>{eventJson(entry,run.id)}</pre> : detailTab === "Input" ? <><h4>Tool input</h4><pre>{JSON.stringify(input,null,2)}</pre></> : detailTab === "Result" && result ? <><h4>Recorded output</h4><pre>{result.stdout ?? result.content ?? JSON.stringify(result,null,2)}</pre>{result.exitCode !== undefined && <div className="tr-exit"><Check size={12}/>Exit code {result.exitCode}</div>}</> : detailTab === "Timing" ? <><h4>Recorded timing</h4><dl><div><dt>Event time</dt><dd>{entry.time} GMT+8</dd></div><div><dt>Offset in run</dt><dd>+{secondsOf(entry)-secondsOf(data[0]!)}s</dd></div>{toolStart && toolResult && <><div><dt>Tool started</dt><dd>{toolStart.time}</dd></div><div><dt>Tool finished</dt><dd>{toolResult.time}</dd></div><div><dt>Tool duration</dt><dd>{secondsOf(toolResult)-secondsOf(toolStart)}s</dd></div></>}<div><dt>Source</dt><dd>Sample timestamps</dd></div></dl></> : <><p className="tr-detail-summary">{entry.description}</p>{entry.payload.thought !== undefined && <><h4>Recorded thought</h4><p>{String(entry.payload.thought)}</p></>}{result && <><h4>Result preview</h4><pre>{result.stdout ?? result.content ?? JSON.stringify(result,null,2)}</pre></>}{input !== undefined && !result && <><h4>Input preview</h4><pre>{JSON.stringify(input,null,2)}</pre></>}{entry.payload.reason !== undefined && <p className="tr-error-copy">{String(entry.payload.reason)}</p>}{entry.payload.summary !== undefined && <p>{String(entry.payload.summary)}</p>}<dl><div><dt>Sequence</dt><dd>{entry.sequence}</dd></div><div><dt>Time</dt><dd>{entry.time} GMT+8</dd></div><div><dt>Phase</dt><dd>Executing</dd></div>{entry.payload.actionId !== undefined && <div><dt>Action</dt><dd>{String(entry.payload.actionId)}</dd></div>}</dl></>}</div><footer><button aria-label="Copy event JSON" onClick={copy}>{copied ? <Check size={12}/> : <Copy size={12}/>} {copyError ? "Copy failed" : copied ? "Copied" : "Copy JSON"}</button><div/><button disabled={entry.sequence === 1} aria-label="Previous event" onClick={() => selectEvent(entry.sequence-1)}><ArrowLeft size={14}/></button><button disabled={entry.sequence === data.length} aria-label="Next event" onClick={() => selectEvent(entry.sequence+1)}><ChevronRight size={14}/></button></footer></section>}
          </div><footer className="tr-source"><FileText size={12}/><span title={`${goalId}/${run.id}.jsonl`}>{run.id.slice(0,8)}…jsonl</span><span>Local sample · No backend connection</span></footer>
        </>}
      </section>}</div></main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
