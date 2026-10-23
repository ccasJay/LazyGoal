import { useRef, useState } from "react";
import type { BrowserGoalListItem } from "../../../../packages/web-contracts/src/index";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup } from "./ui/command";
import { Badge } from "./ui/badge";
import { cardStatusPresentation, statusClass, statusFromRun } from "../types";

/** 在已读取的 Goal 中按标题查找；Command 管理键盘导航，选择只导航。 */
export function GoalSearch({ goals, onSelect, onClose }: {
  goals: readonly BrowserGoalListItem[];
  onSelect: (goalId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const opener = useRef(typeof document === "undefined" ? null : document.activeElement);
  const matches = goals.filter(goal => goal.intent.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="goal-search-dialog p-0" aria-describedby={undefined} onCloseAutoFocus={event => {
      event.preventDefault();
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    }}>
      <DialogTitle className="sr-only">Search goals</DialogTitle>
      <Command shouldFilter={false} loop>
        <CommandInput aria-label="Search saved goals" placeholder="Search goals…" value={query} onValueChange={setQuery} />
        <CommandList aria-label="Saved goals">
          <CommandEmpty>{goals.length ? "No matching goals. Try a different title." : "No saved goals yet. Create a goal to get started."}</CommandEmpty>
          <CommandGroup heading={query.trim() ? `${matches.length} matching goals` : "Recent goals"}>
            {matches.map(goal => <CommandItem key={goal.goalId} value={goal.goalId} onSelect={() => { onSelect(goal.goalId); onClose(); }}>
              <span className={`status-dot ${statusClass(statusFromRun(goal.runStatus))}`} />
              <span className="flex-1 truncate">{goal.intent}</span>
              <Badge variant="outline">{goal.archived ? "Archived" : cardStatusPresentation(goal.runStatus).label}</Badge>
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </DialogContent>
  </Dialog>;
}
