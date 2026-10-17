import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, CornerDownLeft, Search, X } from "lucide-react";
import type { BrowserGoalListItem } from "../../../../packages/web-contracts/src/index";
import { Modal } from "../modal";
import { cardStatusPresentation, statusClass, statusFromRun } from "../types";

/** 在当前工作区已读取的 Goal 中按标题查找；选择只导航，不创建或执行 Run。 */
export function GoalSearch({ goals, onSelect, onClose }: {
  goals: readonly BrowserGoalListItem[];
  onSelect: (goalId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listId = useId();
  const matches = goals.filter(goal => goal.intent.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const activeIndex = Math.min(selectedIndex, Math.max(0, matches.length - 1));
  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [listId, activeIndex, query]);
  const choose = (id: string) => { onSelect(id); onClose(); };

  return (
    <Modal label="Search goals" className="goal-search-dialog" onClose={onClose}>
      <div className="goal-search-input-row">
        <Search size={18} aria-hidden="true" />
        <input
          data-modal-autofocus
          aria-label="Search saved goals"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={matches.length ? `${listId}-${activeIndex}` : undefined}
          placeholder="Search goals…"
          value={query}
          onChange={event => { setQuery(event.target.value); setSelectedIndex(0); }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (matches.length) setSelectedIndex((activeIndex + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
            } else if (event.key === "Enter" && matches[activeIndex]) {
              event.preventDefault();
              choose(matches[activeIndex].goalId);
            }
          }}
        />
        <button className="icon" aria-label="Close goal search" onClick={onClose}><X size={16} /></button>
      </div>
      <p className="goal-search-label" aria-live="polite">{query.trim() ? `${matches.length} matching goals` : "Recent goals"}</p>
      <div className="goal-search-results" id={listId} role="listbox" aria-label="Saved goals">
        {matches.map((goal, index) => (
          <button
            id={`${listId}-${index}`}
            key={goal.goalId}
            role="option"
            aria-selected={index === activeIndex}
            tabIndex={-1}
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => choose(goal.goalId)}
          >
            <span className={`status-dot ${statusClass(statusFromRun(goal.runStatus))}`} />
            <span className="goal-search-result-title">{goal.intent}</span>
            <span className="goal-search-result-status">{goal.archived ? "Archived" : cardStatusPresentation(goal.runStatus).label}</span>
            {index === activeIndex && <CornerDownLeft size={13} aria-hidden="true" />}
          </button>
        ))}
      </div>
      {matches.length === 0 && <div className="goal-search-empty">{goals.length ? "No matching goals. Try a different title." : "No saved goals yet. Create a goal to get started."}</div>}
      <footer className="goal-search-footer"><span><ArrowUp size={12} /><ArrowDown size={12} />Navigate</span><span><CornerDownLeft size={12} />Open</span><span><kbd>Esc</kbd>Close</span></footer>
    </Modal>
  );
}
