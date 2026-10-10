import {
  BookOpen,
  Clock3,
  FilePenLine,
  Search,
  Terminal,
  Zap,
} from "lucide-react";
import type { BrowserSessionStep } from "../../../../packages/web-contracts/src/index";

export function stepActivity(step: BrowserSessionStep) {
  const executed = step.status === "completed" || step.status === "failed";
  const target = step.inputSummary;
  if (step.toolId === "bash") {
    const command = step.bashExecution?.command.replace(/\s+/g, " ").trim();
    return { icon: Terminal, label: `${executed ? "Ran" : "Run"} ${command || "a command"}` };
  }
  if (step.toolId === "read_file") return { icon: BookOpen, label: `Read ${target || "a file"}` };
  if (step.toolId === "write_file")
    return {
      icon: FilePenLine,
      label: `${step.status === "completed" ? "Wrote" : "Write"} ${target || "a file"}`,
    };
  if (step.toolId === "edit_file")
    return {
      icon: FilePenLine,
      label: `${step.status === "completed" ? "Edited" : "Edit"} ${target || "a file"}`,
    };
  if (step.toolId === "grep" || step.toolId === "web_search")
    return {
      icon: Search,
      label: target
        ? `${executed ? "Searched" : "Search"} for ${target}`
        : `${executed ? "Searched" : "Search"} ${step.toolId === "grep" ? "files" : "the web"}`,
    };
  if (step.toolId === "web_fetch")
    return { icon: BookOpen, label: `${executed ? "Fetched" : "Fetch"} ${target || "a page"}` };
  return {
    icon: step.decisionKind === "request_think" ? Clock3 : Zap,
    label: step.toolId ?? step.decisionKind ?? `Step ${step.stepIndex}`,
  };
}

