import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertCircle, Archive, ArrowLeft, Check, ChevronRight, Folder, MoreHorizontal, Plus, RotateCcw, Search, Trash2, Zap } from "lucide-react";
import "./delete-goal-prototype.css";

type Status = "Ready" | "Running" | "Needs input" | "Completed" | "Stopped";
type Goal = { id: string; title: string; status: Status; steps: number; runs: number; date: string; input: string; output: string };

const initialGoals: Goal[] = [
  { id: "07827e8f-bd1e-4921-8e91-cf367eb4fe71", title: "Audit the five workspace tools and their tests", status: "Completed", steps: 7, runs: 1, date: "Oct 3", input: "174.6K", output: "6.6K" },
  { id: "53334e02-8405-4522-a9f9-7073de353ab3", title: "Compare tool contracts with implementation", status: "Completed", steps: 10, runs: 1, date: "Oct 3", input: "281.7K", output: "8.7K" },
  { id: "f302272c-18a5-46c9-a0ee-90c461602f9d", title: "Review PTC resource limits", status: "Completed", steps: 12, runs: 2, date: "Oct 2", input: "357.8K", output: "7.2K" },
  { id: "a0f4abe5-6ad4-4497-9c2d-73e605136805", title: "Inspect an interrupted model request", status: "Stopped", steps: 3, runs: 1, date: "Oct 1", input: "173.1K", output: "3.3K" },
  { id: "waiting-goal-example", title: "Decide how to handle a permission request", status: "Needs input", steps: 4, runs: 1, date: "Oct 3", input: "42.3K", output: "2.1K" },
  { id: "running-goal-example", title: "Trace Runtime recovery behavior", status: "Running", steps: 6, runs: 1, date: "Oct 3", input: "96.2K", output: "4.5K" },
];

const statuses: Status[] = ["Ready", "Running", "Needs input", "Completed", "Stopped"];
const canDelete = (goal: Goal) => goal.status === "Completed" || goal.status === "Stopped";

function App() {
  const [goals, setGoals] = useState(initialGoals);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  const [undoArchiveId, setUndoArchiveId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = goals.find((goal) => goal.id === selectedId);
  const activeGoals = goals.filter((goal) => !archivedIds.includes(goal.id));
  const visibleGoals = activeGoals.filter((goal) => goal.title.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!menuId) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeOptions();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const trigger = menuRef.current?.querySelector<HTMLElement>("[data-options-trigger]");
        closeOptions();
        window.requestAnimationFrame(() => trigger?.focus());
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuId]);

  function closeOptions() {
    setMenuId(null);
    setConfirmId(null);
  }

  function requestDelete(goalId: string) {
    const goal = goals.find((item) => item.id === goalId);
    if (!goal || !canDelete(goal) || deleting) return;
    if (confirmId === goalId) deleteGoal(goal);
    else setConfirmId(goalId);
  }

  function deleteGoal(candidate: Goal) {
    setDeleting(true);
    window.setTimeout(() => {
      setDeleting(false);
      if (failNext) {
        setFailNext(false);
        setConfirmId(null);
        setUndoArchiveId(null);
        setToast("Deletion failed. Try again.");
        return;
      }
      setGoals((current) => current.filter((goal) => goal.id !== candidate.id));
      if (selectedId === candidate.id) setSelectedId(null);
      closeOptions();
      setUndoArchiveId(null);
      setToast("Goal deleted");
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".dg-toolbar h1")?.focus());
      window.setTimeout(() => setToast(""), 4000);
    }, 650);
  }

  function archiveGoal(goal: Goal) {
    if (!canDelete(goal) || deleting) return;
    setArchivedIds((current) => [...current, goal.id]);
    closeOptions();
    setUndoArchiveId(goal.id);
    setToast("Goal archived");
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".dg-toolbar h1")?.focus());
  }

  function reset() {
    setGoals(initialGoals);
    setSelectedId(null);
    setMenuId(null);
    setConfirmId(null);
    setToast("");
    setArchivedIds([]);
    setUndoArchiveId(null);
  }

  return (
    <div className="dg-app">
      <header className="dg-topbar">
        <div className="dg-brand"><span className="dg-brand-mark"><Zap size={17} fill="currentColor" /></span><strong>LazyGoal</strong></div>
        <div className="dg-breadcrumb"><Folder size={15} /><span>Workspace</span><ChevronRight size={13} /><span>Goals</span>{selected && <><ChevronRight size={13} /><strong>{selected.title}</strong></>}</div>
        <span className="dg-prototype">Interaction prototype</span>
        <button className="dg-new" type="button" disabled><Plus size={15} /> New goal</button>
      </header>

      <main className="dg-main">
        {selected ? (
          <section className="dg-detail" aria-label="Goal details">
            <div className="dg-detail-top"><button type="button" onClick={() => setSelectedId(null)}><ArrowLeft size={16} /> All goals</button><span>{selected.status}</span></div>
            <div className="dg-detail-content">
              <h1>{selected.title}</h1>
              <p className="dg-id">{selected.id}</p>
              <div className="dg-detail-stats"><div><span>Current status</span><strong>{selected.status}</strong></div><div><span>Runs</span><strong>{selected.runs}</strong></div><div><span>Committed steps</span><strong>{selected.steps}</strong></div><div><span>Last updated</span><strong>{selected.date}</strong></div></div>
              <section className="dg-records"><div><h2>Local record</h2><p>Remove this Goal and its saved run history from this workspace.</p></div><button type="button" className={`dg-delete-link ${confirmId === selected.id ? "is-confirming" : ""}`} disabled={!canDelete(selected) || deleting} onPointerLeave={(event) => { if (event.pointerType === "mouse" && !deleting) setConfirmId(null); }} onClick={() => requestDelete(selected.id)}><Trash2 size={16} /> {deleting ? "Deleting…" : confirmId === selected.id ? "Confirm" : "Delete goal"}</button></section>
              {!canDelete(selected) && <p className="dg-unavailable"><AlertCircle size={15} /> Only completed or stopped Goals can be deleted.</p>}
            </div>
          </section>
        ) : (
          <>
            <div className="dg-toolbar"><h1 tabIndex={-1}>All goals <span>{activeGoals.length}</span></h1><label className="dg-search"><Search size={15} /><input aria-label="Search goals" placeholder="Search goals…" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
            <div className="dg-board">
              {statuses.map((status) => {
                const group = visibleGoals.filter((goal) => goal.status === status);
                return <section className="dg-column" key={status} aria-label={`${status} goals`}><header><span className={`dg-dot ${status.toLowerCase().replace(" ", "-")}`} /><h2>{status}</h2><span>{group.length}</span></header><div className="dg-cards">{group.length === 0 ? <div className="dg-empty">No goals here</div> : group.map((goal) => <article className="dg-card" key={goal.id}>
                  <button className="dg-card-open" type="button" onClick={() => setSelectedId(goal.id)} aria-label={`Open ${goal.title}`}><h3>{goal.title}</h3><div className="dg-card-metrics"><span>{goal.steps} steps</span><span>{goal.input} in / {goal.output} out</span></div><footer><span><i className={`dg-dot ${status.toLowerCase().replace(" ", "-")}`} />{status}</span><time>{goal.date}</time></footer></button>
                  <div className={`dg-card-menu ${menuId === goal.id ? "is-expanded" : ""}`} ref={menuId === goal.id ? menuRef : undefined} onPointerLeave={(event) => { if (event.pointerType === "mouse" && menuId === goal.id) closeOptions(); }}>
                    <button data-options-trigger type="button" aria-label={`More options for ${goal.title}`} aria-expanded={menuId === goal.id} tabIndex={menuId === goal.id ? -1 : 0} aria-hidden={menuId === goal.id || undefined} onClick={() => { setConfirmId(null); setMenuId(goal.id); }}><MoreHorizontal size={18} /></button>
                    {menuId === goal.id && <div className="dg-menu" role="group" aria-label={`Options for ${goal.title}`}>
                      <button type="button" disabled={!canDelete(goal) || deleting} title={!canDelete(goal) ? "Available after this Goal ends." : undefined} onClick={() => archiveGoal(goal)}><Archive size={14} /> Archive</button>
                      <button type="button" className={`danger ${confirmId === goal.id ? "is-confirming" : ""}`} disabled={!canDelete(goal) || deleting} title={!canDelete(goal) ? "Available after this Goal ends." : undefined} onClick={() => requestDelete(goal.id)}><Trash2 size={14} /> {deleting && confirmId === goal.id ? "Deleting…" : confirmId === goal.id ? "Confirm" : "Delete"}</button>
                    </div>}
                  </div>
                </article>)}</div></section>;
              })}
            </div>
          </>
        )}
      </main>

      <div className="dg-demo-controls"><span>Demo controls</span><label><input type="checkbox" checked={failNext} onChange={(event) => setFailNext(event.target.checked)} /> Fail next deletion</label><button type="button" onClick={reset}><RotateCcw size={13} /> Reset sample goals</button></div>
      {toast && <div className={`dg-toast ${toast.startsWith("Deletion failed") ? "is-error" : ""}`} role="status">{toast.startsWith("Deletion failed") ? <AlertCircle size={16} /> : <Check size={16} />} {toast}{undoArchiveId && <button type="button" onClick={() => { setArchivedIds((current) => current.filter((id) => id !== undoArchiveId)); setUndoArchiveId(null); setToast(""); }}>Undo</button>}</div>}

    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
