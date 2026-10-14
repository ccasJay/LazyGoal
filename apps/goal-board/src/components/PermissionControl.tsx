import { useEffect, useRef } from "react";
import { Check, ChevronDown, Shield, Zap } from "lucide-react";
import type { BrowserToolGrantSummary } from "../../../../packages/web-contracts/src/index";

export function PermissionControl({
  open,
  onToggle,
  onClose,
  mode,
  modeError,
  modeBusy,
  onChooseMode,
  grants,
  grantsLoading,
  grantsError,
  hasGoal,
  revokingGrantId,
  onRevokeGrant,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  mode: "default" | "yolo" | null;
  modeError: string | null;
  modeBusy: boolean;
  onChooseMode: (mode: "default" | "yolo") => void;
  grants: readonly BrowserToolGrantSummary[];
  grantsLoading: boolean;
  grantsError: string | null;
  hasGoal: boolean;
  revokingGrantId: string | null;
  onRevokeGrant: (grant: BrowserToolGrantSummary) => void;
}) {
  const controlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !controlRef.current?.contains(event.target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  return (
    <div className="permission-control" ref={controlRef}>
      <button
        type="button"
        className={`permission-trigger ${mode === "yolo" ? "yolo" : ""}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <Shield size={13} />
        <span>Permission{mode === null ? "" : ` · ${mode === "yolo" ? "YOLO" : "Default"}`}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <section className="permission-popover" aria-label="Project permissions">
          <fieldset className="permission-modes" aria-label="Execution mode" disabled={modeBusy || mode === null}>
            <label className={mode === "default" ? "selected" : ""} htmlFor="permission-mode-default">
              <input
                id="permission-mode-default"
                type="radio"
                name="project-permission-mode"
                checked={mode === "default"}
                onChange={() => onChooseMode("default")}
              />
              <Shield size={16} aria-hidden="true" />
              <span>
                <strong>Default</strong>
                <small>Review actions that need approval.</small>
              </span>
              {mode === "default" && <Check className="permission-selected-icon" size={15} aria-hidden="true" />}
            </label>
            <label className={mode === "yolo" ? "selected" : ""} htmlFor="permission-mode-yolo">
              <input
                id="permission-mode-yolo"
                type="radio"
                name="project-permission-mode"
                checked={mode === "yolo"}
                onChange={() => onChooseMode("yolo")}
              />
              <Zap size={16} aria-hidden="true" />
              <span>
                <strong>YOLO</strong>
                <small>Automatically approve eligible tools. Sandbox limits still apply.</small>
              </span>
              {mode === "yolo" && <Check className="permission-selected-icon" size={15} aria-hidden="true" />}
            </label>
          </fieldset>
          {modeError && (
            <p className="permission-error" role="alert">
              {modeError}
            </p>
          )}
          <details className="permission-grants">
            <summary>Saved permissions{grants.length > 0 ? ` (${grants.length})` : ""}</summary>
            <div className="permission-grants-content">
              {!hasGoal ? (
                <p>Select a Goal to review or revoke its saved permissions.</p>
              ) : grantsLoading ? (
                <p>Loading permissions…</p>
              ) : grantsError ? (
                <p className="permission-error" role="alert">
                  {grantsError}
                </p>
              ) : grants.length === 0 ? (
                <p>No ongoing permissions.</p>
              ) : (
                <ul>
                  {grants.map((grant) => (
                    <li key={grant.grantId}>
                      <div className="permission-grant-copy">
                        <strong>
                          {grant.kind === "sandbox" ? "Sandbox · " : ""}
                          {grant.toolId}
                        </strong>
                        <span>
                          {grant.scope === "goal" ? "This Goal" : "This project"} · {grant.status}
                        </span>
                        {grant.kind === "sandbox" && grant.command && <code>{grant.command}</code>}
                        {grant.targetPath && <code>{grant.targetPath}</code>}
                        {grant.kind === "sandbox" && (
                          <span>{grant.network === "all_outbound" ? "All outbound network" : "No network"}</span>
                        )}
                        {grant.extraFiles?.map((file) => (
                          <code key={`${file.canonicalPath}:${file.access}`}>
                            {file.access} · {file.canonicalPath}
                            {file.kind === "directory_tree" ? "/…" : ""}
                          </code>
                        ))}
                      </div>
                      {grant.status === "active" && (
                        <button
                          type="button"
                          className="permission-revoke"
                          disabled={revokingGrantId !== null}
                          onClick={() => onRevokeGrant(grant)}
                        >
                          {revokingGrantId === grant.grantId ? "Revoking…" : "Revoke"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

