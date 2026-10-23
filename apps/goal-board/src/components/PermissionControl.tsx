import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
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

  return (
    <Popover open={open} onOpenChange={next => { if (next !== open) next ? onToggle() : onClose(); }}>
      <PopoverTrigger asChild>
      <Button variant="ghost" size="sm"
        type="button"
        className={`permission-trigger ${mode === "yolo" ? "yolo" : ""}`}
        aria-expanded={open}
      >
        <Shield size={13} />
        <span>Permission{mode === null ? "" : ` · ${mode === "yolo" ? "YOLO" : "Default"}`}</span>
        <ChevronDown size={12} />
      </Button>
      </PopoverTrigger><PopoverContent align="start" className="permission-popover" aria-label="Project permissions">
          <PermissionModeOptions mode={mode} modeBusy={modeBusy} onChooseMode={onChooseMode} />
          {modeError && (
            <p className="permission-error" role="alert">
              {modeError}
            </p>
          )}
          <Collapsible className="permission-grants">
            <CollapsibleTrigger>Saved permissions{grants.length > 0 ? ` (${grants.length})` : ""}</CollapsibleTrigger><CollapsibleContent>
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
                        <Button variant="ghost" size="sm"
                          type="button"
                          className="permission-revoke"
                          disabled={revokingGrantId !== null}
                          onClick={() => onRevokeGrant(grant)}
                        >
                          {revokingGrantId === grant.grantId ? "Revoking…" : "Revoke"}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CollapsibleContent></Collapsible>
      </PopoverContent>
    </Popover>
  );
}


/** 受控权限模式选项；由 RadioGroup 统一处理键盘与单选语义，不自行保存模式。 */
export function PermissionModeOptions({ mode, modeBusy, onChooseMode }: {
  mode: "default" | "yolo" | null;
  modeBusy: boolean;
  onChooseMode: (mode: "default" | "yolo") => void;
}) {
  return (          <RadioGroup className="permission-modes" name="project-permission-mode" aria-label="Execution mode" value={mode ?? ""} onValueChange={value => onChooseMode(value as "default" | "yolo")} disabled={modeBusy || mode === null}>
            <Label className={mode === "default" ? "selected" : ""} htmlFor="permission-mode-default">
              <RadioGroupItem id="permission-mode-default" value="default" />
              <Shield size={16} aria-hidden="true" />
              <span>
                <strong>Default</strong>
                <small>Review actions that need approval.</small>
              </span>
              {mode === "default" && <Check className="permission-selected-icon" size={15} aria-hidden="true" />}
            </Label>
            <Label className={mode === "yolo" ? "selected" : ""} htmlFor="permission-mode-yolo">
              <RadioGroupItem id="permission-mode-yolo" value="yolo" />
              <Zap size={16} aria-hidden="true" />
              <span>
                <strong>YOLO</strong>
                <small>Automatically approve eligible tools. Sandbox limits still apply.</small>
              </span>
              {mode === "yolo" && <Check className="permission-selected-icon" size={15} aria-hidden="true" />}
            </Label>
          </RadioGroup>);
}
