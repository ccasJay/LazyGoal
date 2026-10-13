import { Folder, GitBranch } from "lucide-react";
import type { BrowserWorkspaceContext } from "../../../../packages/web-contracts/src/index";

export function WorkspaceContext({
  context,
  error,
}: {
  context: BrowserWorkspaceContext | null;
  error: boolean;
}) {
  const branch = context === null
    ? (error ? "Branch unavailable" : "Loading branch…")
    : context.branch ?? (context.worktreeRoot === null ? "No Git branch" : "Detached HEAD");
  const path = context?.worktreeRoot ?? context?.workspaceRoot;
  const worktree = path?.split(/[\\/]/).filter(Boolean).at(-1) ?? path
    ?? (error ? "Worktree unavailable" : "Loading worktree…");

  return (
    <div className="session-workspace" aria-label="Execution workspace">
      <span className="workspace-branch" title={branch} aria-label={`Branch: ${branch}`}>
        <GitBranch size={13} />
        <span>{branch}</span>
      </span>
      <span className="workspace-divider" aria-hidden="true">/</span>
      <span
        className="workspace-location"
        title={path ?? "Reload the session to retry."}
        aria-label={`${context?.worktreeRoot === null ? "Workspace" : "Worktree"}: ${path ?? worktree}`}
      >
        <Folder size={13} />
        <span>{worktree}</span>
      </span>
    </div>
  );
}

