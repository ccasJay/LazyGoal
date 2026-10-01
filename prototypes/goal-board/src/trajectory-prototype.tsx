import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, ChevronRight, Folder, GitBranch, Layers, LayoutGrid, Maximize2, Minimize2, X, Zap } from "lucide-react";
import "./trajectory-prototype.css";
import { CompactTrajectoryPrototype } from "./compact-trajectory-prototype";

type Category = "Lifecycle" | "Decision" | "Tool" | "State";
type Entry = { sequence: number; time: string; type: string; category: Category; title: string; description: string; payload: Record<string, unknown> };
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
function stepOf(entry: Entry) {
  return entry.sequence === 1 ? 0 : entry.sequence < 6 ? 1 : entry.sequence < 9 ? 2 : 3;
}
function App() {
  const [runIndex, setRunIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [wide, setWide] = useState(true);
  const [tab, setTab] = useState("Trajectory");
  const [open, setOpen] = useState(true);
  const run = runs[runIndex]!;
  const data = runIndex === 0 ? entries : failed;
  function locateEvent(sequence: number) { setSelected(sequence); setTab("Trajectory"); }
  return <div className="tp-app">
    <aside className="tp-sidebar"><div className="tp-brand"><Zap size={22}/> LazyGoal</div><div className="tp-workspace"><span>LG</span><div>Local workspace<small>Current project</small></div></div><p className="tp-muted">Workspace</p><button className="tp-nav" onClick={() => setOpen(false)}><LayoutGrid size={16}/>All goals <span>3</span></button><div className="tp-sidebar-foot"><i/>Local Runtime<small>UI prototype · Sample data</small></div></aside>
    <main><header className="tp-top"><Folder size={15}/> Workspace <ChevronRight size={13}/> Goals <ChevronRight size={13}/><strong>Analyze LazyGoal architecture</strong><span className="tp-demo">Prototype</span></header>
      <div className={`tp-workbench ${wide && open ? "tp-wide" : ""}`}><section className="tp-board"><h1>Goals <small>3</small></h1><p>Choose a Goal to open its saved session.</p><div className="tp-board-tabs"><LayoutGrid size={14}/> Board</div><h4><i/>Completed <small>3</small></h4><button className="tp-goal" onClick={() => setOpen(true)}><span className="tp-goal-icon"><Check size={15}/></span><strong>Analyze LazyGoal architecture</strong><p>Map modules, execution, and recovery.</p><footer>4 runs <span>Sep 30</span></footer></button><div className="tp-goal tp-dim"><strong>Review tool permissions</strong><p>Check workspace access boundaries.</p><footer>1 run <span>Sep 29</span></footer></div></section>
      {open && <section className={`tp-session ${wide ? "" : "tp-compact"}`} aria-label="Goal session">
        <div className="tp-session-head"><i/><span>714a07ed-b16</span><ChevronRight size={12}/><span>Session</span><div/><button title={wide ? "Compact view" : "Expand view"} aria-label={wide ? "Compact view" : "Expand view"} onClick={() => setWide(!wide)}>{wide ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button><button aria-label="Close session" onClick={() => setOpen(false)}><X size={17}/></button></div>
        <div className="tp-project"><GitBranch size={14}/> dev <span>/</span><Folder size={14}/>LazyGoal</div><div className="tp-tabs">{["Activity", "Trajectory"].map(t => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}<span className="tp-sample">Sample data</span></div>
        {tab === "Activity" ? <div className="tp-activity">
          <header><h2>Architecture analysis</h2><span>{run.label} / {run.status}</span></header>
          <p>Follow each decision and inspect its recorded tool input and output.</p>
          {[...new Set(data.map(stepOf))].filter(step => step > 0).map(step => {
            const records = data.filter(event => stepOf(event) === step);
            const decision = records.find(event => event.category === "Decision")!;
            return <details className="tp-activity-step" key={`${run.id}-${step}`}>
              <summary><ChevronRight size={14}/><span>Step {step}</span><strong>{decision.title}</strong><small>{records.length} events</small></summary>
              <div className="tp-activity-content">
                <p>{decision.description}</p>
                {decision.payload.thought !== undefined && <section><h3>Recorded thought</h3><p>{String(decision.payload.thought)}</p></section>}
                {records.filter(event => event.category === "Tool").map(event => <section key={event.sequence}><h3>{event.title}</h3><pre>{JSON.stringify(event.payload.input ?? event.payload.observation, null, 2)}</pre></section>)}
                {records.filter(event => event.type === "run_failed" || event.type === "run_completed").map(event => <p key={event.sequence} className={event.type === "run_failed" ? "tr-error-copy" : ""}>{event.description}</p>)}
                {decision.payload.summary !== undefined && <p>{String(decision.payload.summary)}</p>}
                <footer><button aria-label={`View Step ${step} in trajectory`} onClick={() => locateEvent(decision.sequence)}><Layers size={14}/>View in trajectory<ChevronRight size={13}/></button></footer>
              </div>
            </details>;
          })}
        </div> : <CompactTrajectoryPrototype key={`${runIndex}:${selected}`} runIndex={runIndex} target={selected} onRunChange={value => { setRunIndex(value); setSelected(null); }}/>}
      </section>}</div></main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
