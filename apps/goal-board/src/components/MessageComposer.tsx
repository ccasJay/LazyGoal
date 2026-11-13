import { Command, CommandList, CommandItem } from "./ui/command";
import { Button } from "./ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "./ui/input-group";
import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowUp, ChevronDown, Folder } from "lucide-react";
import { slashCommands } from "../types";
import { resolveComposerKey } from "../session-controls";

export function InboxIcon() {
  return (
    <div className="empty-icon">
      <Folder size={26} />
    </div>
  );
}

export function CurrentModelControl({
  label,
  enabled,
  onClick,
}: {
  label: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" size="sm"
      type="button"
      className="current-model-control"
      disabled={!enabled}
      aria-label={`Current model: ${label}${enabled ? ". Change model" : ""}`}
      title={enabled ? label : `${label}. Change model after the current action settles or the Run finishes.`}
      onClick={onClick}
    >
      <span>Model</span>
      <strong>{label}</strong>
      {enabled && <ChevronDown size={11} />}
    </Button>
  );
}

/**
 * 文本输入框，用于新 Goal 首个意图或手动 Goal 的终态续接。
 *
 * @remarks 成功提交后仅清理与本次提交一致的草稿；是否允许提交由调用方按后端续接资格
 * 与连接状态决定，本组件不自行推断来源或结算状态。
 */
export function MessageComposer({
  busy,
  sendDisabled = false,
  placeholder,
  textareaLabel = "Goal intent",
  describedBy,
  footerControls,
  onSubmit,
  autoFocus = false,
  showHint = true,
  draftValue,
  onDraftChange,
  submitLabels,
}: {
  busy: boolean;
  sendDisabled?: boolean;
  placeholder: string;
  textareaLabel?: string;
  describedBy?: string;
  onSubmit: (content: string) => Promise<boolean>;
  footerControls?: ReactNode;
  autoFocus?: boolean;
  showHint?: boolean;
  draftValue: string;
  onDraftChange: React.Dispatch<React.SetStateAction<string>>;
  submitLabels?: { readonly idle: string; readonly busy: string; readonly empty?: string };
}) {
  const [selectedCommand, setSelectedCommand] = useState(0);
  const [commandMenuClosed, setCommandMenuClosed] = useState(false);
  const inspection = slashCommands.inspect(draftValue);
  const candidates = inspection.kind === "candidates" && !commandMenuClosed ? inspection.candidates : [];
  const activeCandidate = candidates[Math.min(selectedCommand, candidates.length - 1)];
  const hasDraft = draftValue.trim().length > 0;
  const submitLabel = busy
    ? (submitLabels?.busy ?? "Submitting Goal")
    : hasDraft ? (submitLabels?.idle ?? "Start Goal") : (submitLabels?.empty ?? submitLabels?.idle ?? "Start Goal");

  async function submit(content = draftValue) {
    if (busy || !content.trim()) return;
    const submittedDraft = draftValue;
    if (await onSubmit(content)) {
      onDraftChange((current) => (current === submittedDraft ? "" : current));
      setCommandMenuClosed(false);
      setSelectedCommand(0);
    }
  }

  return (
    <>
      {candidates.length > 0 && (
        <Command shouldFilter={false} value={activeCandidate?.name ?? ""} className="command-candidates"><CommandList aria-label="Available commands">
          {candidates.map((candidate, index) => (
            <CommandItem value={candidate.name}
              aria-selected={index === Math.min(selectedCommand, candidates.length - 1)}
              className={`command-candidate ${index === Math.min(selectedCommand, candidates.length - 1) ? "active" : ""}`}
              key={candidate.name}
              disabled={busy}
              onMouseDown={(event) => event.preventDefault()}
              onSelect={() => void submit(candidate.usage)}
            >
              <span className="command-candidate-name">{candidate.usage}</span>
              <span className="command-candidate-description">{candidate.description}</span>
            </CommandItem>
          ))}
        </CommandList></Command>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <InputGroup className="composer">
          <InputGroupTextarea
            id="goal-intent-draft"
            name="intent"
            rows={1}
            aria-label={textareaLabel}
            aria-describedby={describedBy}
            aria-keyshortcuts="Enter Shift+Enter"
            title="Enter to send, Shift + Enter for a new line"
            placeholder={placeholder}
            autoFocus={autoFocus}
            value={draftValue}
            disabled={busy}
            onChange={(event) => {
              onDraftChange(event.target.value);
              setSelectedCommand(0);
              setCommandMenuClosed(false);
            }}
            onKeyDown={(event) => {
              if (candidates.length > 0 && !event.nativeEvent.isComposing) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelectedCommand((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + candidates.length) % candidates.length);
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (activeCandidate !== undefined) void submit(activeCandidate.usage);
                  return;
                }
              }
              if (event.key === "Escape" && candidates.length > 0) {
                event.preventDefault();
                setCommandMenuClosed(true);
                return;
              }
              const outcome = resolveComposerKey({
                key: event.key,
                shiftKey: event.shiftKey,
                isComposing: event.nativeEvent.isComposing,
              });
              if (outcome.kind === "submit") {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <InputGroupAddon align="block-end" className="composer-tools">
            <div className="composer-controls">{footerControls}</div>
            <div className="composer-actions">
              <Button variant="ghost" size="sm"
                type="submit"
                className="send"
                aria-label={submitLabel}
                title={submitLabel}
                disabled={busy || sendDisabled || !hasDraft}
              >
                {busy ? <span className="loading-mark small" /> : <ArrowUp size={16} />}
              </Button>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </form>
      {showHint && <div className="composer-hint">Enter to submit, Shift + Enter for a new line</div>}
    </>
  );
}
