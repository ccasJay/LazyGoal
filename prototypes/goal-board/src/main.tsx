import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Folder,
  GitBranch,
  LayoutGrid,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Plus,
  Search,
  Terminal,
  X,
  Zap,
  PanelLeftClose,
  Play,
  Pause,
} from "lucide-react";
import "./style.css";
import { GoalDetails, SettingsDialog } from "./panels";
import { Settings2, List, SlidersHorizontal, Inbox } from "lucide-react";

type Status = "Ready" | "Running" | "Needs input" | "Completed";
type Message = {
  role: "user" | "agent" | "tool";
  text: string;
  detail?: string;
};
type Goal = {
  id: number;
  title: string;
  description: string;
  status: Status;
  steps: number;
  total: number;
  tag: string;
  messages: Message[];
  stream?: string;
  streamPaused?: boolean;
  pendingKind?: "approval" | "answer" | undefined;
};
const initialGoals: Goal[] = [
  {
    id: 24,
    title: "Add resumable goal sessions",
    description: "Restore a goal exactly where it left off.",
    status: "Running",
    steps: 3,
    total: 5,
    tag: "Runtime",
    messages: [
      {
        role: "user",
        text: "Add resumable goal sessions. Preserve the conversation and continue from the last committed step after a restart.",
      },
      {
        role: "agent",
        text: "I’ll follow the existing snapshot boundary so recovery preserves both the execution state and conversation history.",
      },
      {
        role: "tool",
        text: "Read session-controller.ts",
        detail:
          "SessionController hydrates committed messages and steps from the latest Goal snapshot.\n\nRecovery must not replay a tool action that has already been committed.",
      },
      {
        role: "agent",
        text: "The session already restores committed messages. I’m checking the handoff between snapshot recovery and the next execution step.",
      },
      {
        role: "tool",
        text: "Inspect recovery tests",
        detail:
          '$ rg "restore|resume" packages/runtime/test\n\nFound recovery coverage for checkpoints, pending approvals, and completed steps.',
      },
    ],
    stream:
      "I’m adding a recovery scenario that interrupts the session after a committed step. The resumed session should keep its history, skip completed work, and continue with the next action.",
  },
  {
    id: 23,
    title: "Stream tool activity into the timeline",
    description: "Show live output as each tool runs.",
    status: "Running",
    steps: 2,
    total: 4,
    tag: "Session",
    messages: [
      { role: "user", text: "Show tool activity in the session timeline." },
      {
        role: "agent",
        text: "I’m tracing tool events through the execution stream.",
      },
    ],
    stream:
      "The live activity belongs in the session tail. Once the step commits, it becomes a stable timeline entry without duplicating the output.",
  },
  {
    id: 22,
    title: "Approve the execution plan",
    description: "Review the proposed workspace changes.",
    status: "Needs input",
    pendingKind: "approval",
    steps: 1,
    total: 4,
    tag: "Planning",
    messages: [
      { role: "user", text: "Improve workspace configuration discovery." },
      {
        role: "agent",
        text: "I propose using the current workspace identity to discover its configuration, then adding a focused recovery check. Please approve this plan or send feedback before I continue.",
      },
    ],
  },
  {
    id: 21,
    title: "Clarify benchmark output location",
    description: "Choose where evaluation reports should go.",
    status: "Needs input",
    pendingKind: "answer",
    steps: 1,
    total: 3,
    tag: "Benchmarks",
    messages: [
      {
        role: "agent",
        text: "Should evaluation reports stay inside the workspace data directory? Send your preferred location to continue.",
      },
    ],
  },
  {
    id: 20,
    title: "Improve completion evidence",
    description: "Make every completed goal verifiable.",
    status: "Ready",
    steps: 0,
    total: 3,
    tag: "Runtime",
    messages: [
      {
        role: "user",
        text: "Improve the presentation of completion evidence.",
      },
    ],
  },
  {
    id: 19,
    title: "Polish empty session states",
    description: "Give new goals a clear starting point.",
    status: "Ready",
    steps: 0,
    total: 2,
    tag: "Session",
    messages: [{ role: "user", text: "Polish empty session states." }],
  },
  {
    id: 18,
    title: "Unify model profile selection",
    description: "Use the same profile across a goal session.",
    status: "Completed",
    steps: 4,
    total: 4,
    tag: "Models",
    messages: [
      { role: "user", text: "Unify model profile selection." },
      {
        role: "agent",
        text: "The prototype goal is complete. Profile selection is consistent across this sample session. All four example checks passed.",
      },
    ],
  },
  {
    id: 17,
    title: "Document snapshot ownership",
    description: "Clarify the persistence boundary.",
    status: "Completed",
    steps: 2,
    total: 2,
    tag: "Docs",
    messages: [
      {
        role: "agent",
        text: "The sample documentation task is complete. Snapshot ownership and recovery boundaries are documented.",
      },
    ],
  },
];
const statuses: Status[] = ["Ready", "Running", "Needs input", "Completed"];
const statusClass = (status: Status) => status.toLowerCase().replace(" ", "-");

function App() {
  const [goals, setGoals] = useState(initialGoals);
  const [selected, setSelected] = useState<number | null>(() =>
    window.innerWidth <= 760 ? null : 24,
  );
  const [sessionTab, setSessionTab] = useState<"Activity" | "Plan" | "Details">(
    "Activity",
  );
  const [view, setView] = useState<"board" | "list">("board");
  const [settings, setSettings] = useState(false);
  const [compact, setCompact] = useState(false);
  const [showTools, setShowTools] = useState(true);
  const [agent, setAgent] = useState("Default agent");
  const [project, setProject] = useState("LazyGoal");
  const [goalProjects, setGoalProjects] = useState<Record<number, string>>({});
  const [category, setCategory] = useState("All categories");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [width, setWidth] = useState(440);
  const [newGoal, setNewGoal] = useState(false);
  const [title, setTitle] = useState("");
  const [follow, setFollow] = useState(true);
  const timeline = useRef<HTMLDivElement>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const goal = goals.find((g) => g.id === selected);
  const draft = goal ? (drafts[goal.id] ?? "") : "";
  const visible = goals.filter(
    (g) =>
      `${g.title} ${g.tag}`.toLowerCase().includes(search.toLowerCase()) &&
      (!filter || g.status === "Needs input") &&
      (project === "All projects" ||
        (goalProjects[g.id] ?? "LazyGoal") === project) &&
      (category === "All categories" || g.tag === category),
  );

  function toggleGoalSelection(goalId: number) {
    setSelected((current) => (current === goalId ? null : goalId));
    setExpanded(false);
  }

  useEffect(() => {
    const timer = window.setInterval(
      () =>
        setGoals((current) =>
          current.map((g) => {
            if (!g.stream || g.status !== "Running" || g.streamPaused) return g;
            const amount = Math.min(4, g.stream.length);
            const messages = [...g.messages];
            const last = messages[messages.length - 1];
            if (last?.role === "agent" && last.detail === "stream")
              messages[messages.length - 1] = {
                ...last,
                text: last.text + g.stream.slice(0, amount),
              };
            else
              messages.push({
                role: "agent",
                text: g.stream.slice(0, amount),
                detail: "stream",
              });
            return { ...g, messages, stream: g.stream.slice(amount) };
          }),
        ),
      65,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (follow && timeline.current)
      timeline.current.scrollTop = timeline.current.scrollHeight;
  }, [goal?.messages, follow, selected]);
  useEffect(() => {
    setFollow(true);
    setSessionTab("Activity");
  }, [selected]);
  useEffect(() => {
    if (newGoal) {
      modal.current?.showModal();
      modal.current?.querySelector("textarea")?.focus();
    } else modal.current?.close();
  }, [newGoal]);

  function send(text: string) {
    if (!goal || !text.trim()) return;
    setSessionTab("Activity");
    setGoals((current) =>
      current.map((g) =>
        g.id === goal.id
          ? {
              ...g,
              status: "Running",
              streamPaused: false,
              pendingKind: undefined,
              messages: [...g.messages, { role: "user", text: text.trim() }],
              stream:
                "I’ve received your direction. In the connected version, the Runtime will continue this goal here. This preview demonstrates the same streaming session experience using sample output.",
            }
          : g,
      ),
    );
    setDrafts((current) => ({ ...current, [goal.id]: "" }));
    setFollow(true);
  }
  function startGoal() {
    if (!goal || goal.status !== "Ready") return;
    setGoals((current) =>
      current.map((g) =>
        g.id === goal.id
          ? {
              ...g,
              status: "Running",
              stream:
                "I’ve started this goal. The sample session will now show how live progress appears in the timeline.",
            }
          : g,
      ),
    );
  }
  function createGoal() {
    if (!title.trim()) return;
    const id = Math.max(...goals.map((g) => g.id)) + 1;
    setGoals((current) => [
      ...current,
      {
        id,
        title: title.trim(),
        description: "Ready to start a new session.",
        status: "Ready",
        steps: 0,
        total: 1,
        tag: "New goal",
        messages: [{ role: "user", text: title.trim() }],
      },
    ]);
    setGoalProjects((current) => ({
      ...current,
      [id]: project === "All projects" ? "LazyGoal" : project,
    }));
    setCategory("All categories");
    setSelected(id);
    setSearch("");
    setFilter(false);
    setTitle("");
    setNewGoal(false);
  }

  return (
    <div className={"app " + (compact ? "compact" : "")}>
      {sidebar && (
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-icon">
              <Zap size={19} fill="currentColor" />
            </span>
            LazyGoal
            <button
              className="icon muted"
              aria-label="Hide sidebar"
              onClick={() => setSidebar(false)}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
          <div className="workspace">
            <span className="workspace-avatar">S</span>
            <div>
              Sawyer’s workspace<small>Personal workspace</small>
            </div>
          </div>
          <div className="nav-label">Workspace</div>
          <button
            className={"nav " + (!filter ? "selected" : "")}
            onClick={() => {
              setSearch("");
              setFilter(false);
              setProject("All projects");
              setCategory("All categories");
            }}
          >
            <LayoutGrid size={16} />
            All goals<span>{goals.length}</span>
          </button>
          <button
            className={"nav " + (filter ? "active" : "")}
            onClick={() => setFilter(!filter)}
          >
            <CircleHelp size={16} />
            Needs input
            <span className="amber">
              {goals.filter((g) => g.status === "Needs input").length}
            </span>
          </button>
          <div className="nav-label projects-label">Projects</div>
          <label className="project-picker">
            <Folder size={15} />
            <select
              aria-label="Select project"
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setSelected(null);
                setExpanded(false);
                setSearch("");
                setFilter(false);
                setCategory("All categories");
              }}
            >
              <option>All projects</option>
              <option>LazyGoal</option>
              <option>Sandbox</option>
            </select>
          </label>
          <div className="project-path">
            {project === "All projects"
              ? "2 local projects"
              : "~/Project/" + project}
          </div>
          <button
            className="nav settings-nav"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={16} />
            Settings
          </button>
          <div className="sidebar-bottom">
            <div className="prototype-label">
              <span className="dot" />
              Interactive prototype
            </div>
            <p>
              Sample goals · local preview
              <br />
              Changes reset on refresh
            </p>
            <div className="profile">
              <span className="avatar">SL</span>
              <div>
                Sawyer Lau<small>Personal account</small>
              </div>
            </div>
          </div>
        </aside>
      )}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            {!sidebar && (
              <button
                className="icon"
                aria-label="Show sidebar"
                onClick={() => setSidebar(true)}
              >
                <LayoutGrid size={16} />
              </button>
            )}
            <Folder size={15} />
            <span>{project}</span>
            <ChevronRight size={13} />
            <strong>Goals</strong>
          </div>
          <div className="header-actions">
            <span className="preview-badge">UI preview</span>
            <button
              className="icon"
              aria-label="Open settings"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={16} />
            </button>
          </div>
        </header>
        <div className="content">
          {(!expanded || !goal) && (
            <section className="board-area">
              <div className="board-title">
                <div>
                  <h1>
                    Goals{" "}
                    <span>
                      {
                        goals.filter(
                          (g) =>
                            project === "All projects" ||
                            (goalProjects[g.id] ?? "LazyGoal") === project,
                        ).length
                      }
                    </span>
                  </h1>
                  <p>A little direction. Steady progress.</p>
                </div>
                <button className="primary" onClick={() => setNewGoal(true)}>
                  <Plus size={15} />
                  New goal
                </button>
              </div>
              <div className="toolbar">
                <div className="view-switch" aria-label="Goal view">
                  <button
                    aria-pressed={view === "board"}
                    onClick={() => setView("board")}
                  >
                    <LayoutGrid size={14} />
                    Board
                  </button>
                  <button
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <List size={14} />
                    List
                  </button>
                </div>
                <button
                  className={"filter " + (filter ? "on" : "")}
                  onClick={() => setFilter(!filter)}
                >
                  <CircleHelp size={13} />
                  Needs input
                </button>
                <label className="search">
                  <Search size={14} />
                  <input
                    aria-label="Search goals"
                    placeholder="Search goals…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="filter-row">
                <SlidersHorizontal size={13} />
                <select
                  aria-label="Filter category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option>All categories</option>
                  {Array.from(new Set(goals.map((g) => g.tag))).map((tag) => (
                    <option key={tag}>{tag}</option>
                  ))}
                </select>
                <span>{visible.length} goals</span>
                {(search || filter || category !== "All categories") && (
                  <button
                    onClick={() => {
                      setSearch("");
                      setFilter(false);
                      setCategory("All categories");
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
              {visible.length === 0 ? (
                <div className="board-empty">
                  <Inbox size={30} />
                  <h2>
                    {project === "Sandbox" && !search && !filter
                      ? "A fresh workspace"
                      : "No matching goals"}
                  </h2>
                  <p>Create a goal or adjust your filters to get started.</p>
                  <button className="primary" onClick={() => setNewGoal(true)}>
                    <Plus size={14} />
                    New goal
                  </button>
                </div>
              ) : view === "list" ? (
                <div className="goal-table">
                  <div className="list-heading">
                    <span>Goal</span>
                    <span>Status</span>
                    <span>Progress</span>
                  </div>
                  {visible.map((g) => (
                    <button
                      key={g.id}
                      className={
                        "goal-row " + (selected === g.id ? "active" : "")
                      }
                      onClick={() => toggleGoalSelection(g.id)}
                    >
                      <span>
                        <small>LG-{g.id}</small>
                        <strong>{g.title}</strong>
                        <em>{g.tag}</em>
                      </span>
                      <span className={"status-pill " + statusClass(g.status)}>
                        <span className="status-dot" />
                        {g.status}
                      </span>
                      <span>
                        {g.steps}/{g.total}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="board">
                  {statuses.map((status) => (
                    <section
                      className={"column " + statusClass(status)}
                      key={status}
                    >
                      <div className="column-heading">
                        <span className="status-dot" />
                        <h2>{status}</h2>
                        <span className="count">
                          {visible.filter((g) => g.status === status).length}
                        </span>
                      </div>
                      <div className="cards">
                        {visible
                          .filter((g) => g.status === status)
                          .map((g) => (
                            <button
                              key={g.id}
                              className={
                                "goal-card " +
                                (g.id === selected ? "is-selected" : "")
                              }
                              onClick={() => toggleGoalSelection(g.id)}
                              aria-pressed={g.id === selected}
                            >
                              <div className="card-meta">
                                <span>LG-{g.id}</span>
                                {g.streamPaused ? (
                                  <span className="paused-mini">
                                    <Pause size={11} />
                                    Paused
                                  </span>
                                ) : g.status === "Running" ? (
                                  <span className="live-mini">
                                    <span />
                                    Live
                                  </span>
                                ) : g.status === "Completed" ? (
                                  <Check size={13} />
                                ) : (
                                  <MoreHorizontal size={15} />
                                )}
                              </div>
                              <h3>{g.title}</h3>
                              <p>{g.description}</p>
                              {g.status === "Needs input" && (
                                <div className="attention">
                                  <CircleHelp size={12} />
                                  {g.pendingKind === "approval"
                                    ? "Plan approval requested"
                                    : "Waiting for your answer"}
                                </div>
                              )}
                              <div className="card-footer">
                                <span className="tag">{g.tag}</span>
                                <span>
                                  {g.steps}/{g.total}
                                  <span className="mini-progress">
                                    <i
                                      style={{
                                        width: `${(g.steps / g.total) * 100}%`,
                                      }}
                                    />
                                  </span>
                                </span>
                              </div>
                            </button>
                          ))}
                        {visible.filter((g) => g.status === status).length ===
                          0 && (
                          <div className="empty-column">No goals here</div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              <footer className="board-footer">
                <span>
                  <span className="dot blue" />
                  {goals.filter((g) => g.status === "Running").length} goals
                  running
                </span>
                <span>
                  Select a goal to open its session <ChevronRight size={12} />
                </span>
              </footer>
            </section>
          )}
          {goal && (
            <>
              <div
                className="resize-handle"
                role="separator"
                aria-label="Resize session"
                aria-orientation="vertical"
                aria-valuenow={width}
                aria-valuemin={340}
                aria-valuemax={720}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    setWidth((w) =>
                      Math.max(
                        340,
                        Math.min(720, w + (e.key === "ArrowLeft" ? 20 : -20)),
                      ),
                    );
                  }
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    setWidth(
                      Math.max(
                        340,
                        Math.min(720, window.innerWidth - e.clientX),
                      ),
                    );
                }}
                onPointerUp={(e) =>
                  e.currentTarget.releasePointerCapture(e.pointerId)
                }
              />
              <section
                className={"session " + (expanded ? "expanded" : "")}
                style={{ width: expanded ? "100%" : width }}
              >
                <header className="session-header">
                  <span>
                    <span
                      className={"status-dot " + statusClass(goal.status)}
                    />
                    LG-{goal.id}
                    <ChevronRight size={12} />
                    Session
                  </span>
                  <div>
                    <button
                      className="icon"
                      aria-label={
                        expanded ? "Collapse session" : "Expand session"
                      }
                      onClick={() => setExpanded(!expanded)}
                    >
                      {expanded ? (
                        <Minimize2 size={15} />
                      ) : (
                        <Maximize2 size={15} />
                      )}
                    </button>
                    <button
                      className="icon"
                      aria-label="Close session"
                      onClick={() => {
                        setSelected(null);
                        setExpanded(false);
                      }}
                    >
                      <X size={17} />
                    </button>
                  </div>
                </header>
                <div className="session-intro">
                  <h2>{goal.title}</h2>
                  <div>
                    <span className={"status-pill " + statusClass(goal.status)}>
                      <span className="status-dot" />
                      {goal.status}
                    </span>
                    <span>
                      <GitBranch size={12} />
                      main
                    </span>
                    <span>
                      <Clock3 size={12} />
                      Run 01
                    </span>
                  </div>
                </div>
                <div className="session-tabs">
                  <div className="session-tab-buttons">
                    {(["Activity", "Plan", "Details"] as const).map((tab) => (
                      <button
                        key={tab}
                        aria-pressed={sessionTab === tab}
                        onClick={() => setSessionTab(tab)}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <span className="step-count">
                    {goal.steps} of {goal.total} steps
                  </span>
                </div>
                {sessionTab !== "Activity" ? (
                  <GoalDetails goal={goal} tab={sessionTab} />
                ) : (
                  <>
                    <div className="activity-filter">
                      <label>
                        <input
                          type="checkbox"
                          checked={showTools}
                          onChange={(e) => setShowTools(e.target.checked)}
                        />
                        Tool activity
                      </label>
                      <span>{goal.messages.length} events</span>
                    </div>
                    <div
                      className="timeline"
                      ref={timeline}
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        setFollow(
                          el.scrollHeight - el.scrollTop - el.clientHeight < 60,
                        );
                      }}
                    >
                      <div className="timeline-date">
                        <span />
                        Today
                        <span />
                      </div>
                      {goal.messages.map((message, index) =>
                        message.role === "tool" ? (
                          showTools && (
                            <details className="tool-event" key={index}>
                              <summary>
                                <Terminal size={13} />
                                <span>{message.text}</span>
                                <Check size={12} />
                                <ChevronRight
                                  className="tool-chevron"
                                  size={13}
                                />
                              </summary>
                              <pre>{message.detail}</pre>
                            </details>
                          )
                        ) : (
                          <article
                            className={"message " + message.role}
                            key={index}
                          >
                            <div className="message-heading">
                              <span
                                className={"message-avatar " + message.role}
                              >
                                {message.role === "user" ? (
                                  "S"
                                ) : (
                                  <Zap size={12} />
                                )}
                              </span>
                              <strong>
                                {message.role === "user" ? "You" : "LazyGoal"}
                              </strong>
                              <small>
                                {message.role === "user" ? "Just now" : "Agent"}
                              </small>
                            </div>
                            <div className="message-body">
                              {message.text}
                              {message.detail === "stream" &&
                                index === goal.messages.length - 1 &&
                                goal.stream && <span className="cursor" />}
                            </div>
                          </article>
                        ),
                      )}
                      {goal.status === "Running" && (
                        <div className="live-status">
                          <span className="pulse" />
                          {goal.streamPaused
                            ? "Preview stream paused"
                            : goal.stream
                              ? "Working on your goal…"
                              : "Demo stream finished"}
                          <span>Sample session</span>
                        </div>
                      )}
                      {goal.status === "Completed" && (
                        <div className="completion">
                          <Check size={14} />
                          Goal completed
                        </div>
                      )}
                    </div>
                  </>
                )}
                {sessionTab === "Activity" && !follow && (
                  <button className="jump" onClick={() => setFollow(true)}>
                    <ArrowDown size={13} />
                    Back to latest
                  </button>
                )}
                <div className="composer-area">
                  {goal.status === "Needs input" && goal.pendingKind && (
                    <div className="approval">
                      <div>
                        <CircleHelp size={15} />
                        <strong>
                          {goal.pendingKind === "approval"
                            ? "Your approval is needed"
                            : "Your answer is needed"}
                        </strong>
                      </div>
                      <p>
                        {goal.pendingKind === "approval"
                          ? "Review the proposed plan above to continue."
                          : "Reply below to give the agent direction."}
                      </p>
                      {goal.pendingKind === "approval" && (
                        <button
                          onClick={() =>
                            send("Approved. Continue with this plan.")
                          }
                        >
                          <Check size={13} />
                          Approve plan
                        </button>
                      )}
                    </div>
                  )}
                  {goal.status === "Ready" && (
                    <button className="start-goal" onClick={startGoal}>
                      <Play size={13} />
                      Start goal
                    </button>
                  )}
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      send(draft);
                    }}
                  >
                    <textarea
                      aria-label="Message the goal"
                      placeholder={
                        goal.status === "Completed"
                          ? "Continue this goal…"
                          : "Give direction or ask a question…"
                      }
                      value={draft}
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [goal.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          send(draft);
                        }
                      }}
                    />
                    <div className="composer-tools">
                      <span>
                        <Zap size={12} />
                        {agent}
                      </span>
                      {goal.stream && goal.status === "Running" ? (
                        <button
                          type="button"
                          className="send"
                          aria-label={
                            goal.streamPaused
                              ? "Resume demo stream"
                              : "Pause demo stream"
                          }
                          onClick={() =>
                            setGoals((current) =>
                              current.map((g) =>
                                g.id === goal.id
                                  ? { ...g, streamPaused: !g.streamPaused }
                                  : g,
                              ),
                            )
                          }
                        >
                          {goal.streamPaused ? (
                            <Play size={14} />
                          ) : (
                            <Pause size={14} />
                          )}
                        </button>
                      ) : (
                        <button
                          type="submit"
                          className="send"
                          aria-label="Send message"
                          disabled={!draft.trim()}
                        >
                          <ArrowUp size={16} />
                        </button>
                      )}
                    </div>
                  </form>
                  <div className="composer-hint">
                    Enter to send · Shift + Enter for a new line
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
      <SettingsDialog
        open={settings}
        onClose={() => setSettings(false)}
        compact={compact}
        setCompact={setCompact}
        showTools={showTools}
        setShowTools={setShowTools}
        agent={agent}
        setAgent={setAgent}
      />
      <dialog
        ref={modal}
        onCancel={() => setNewGoal(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setNewGoal(false);
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createGoal();
          }}
        >
          <div className="dialog-heading">
            <h2>New goal</h2>
            <button
              type="button"
              className="icon"
              aria-label="Close new goal"
              onClick={() => setNewGoal(false)}
            >
              <X size={18} />
            </button>
          </div>
          <p>What would you like to accomplish?</p>
          <div className="creation-context">
            <Folder size={13} />
            {project === "All projects" ? "LazyGoal" : project}
            <span>{agent}</span>
          </div>
          <textarea
            autoFocus
            aria-label="Goal objective"
            placeholder="Describe your goal…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <small>This preview stores goals until you refresh.</small>
          <button className="primary" disabled={!title.trim()} type="submit">
            <Plus size={14} />
            Create goal
          </button>
        </form>
      </dialog>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
