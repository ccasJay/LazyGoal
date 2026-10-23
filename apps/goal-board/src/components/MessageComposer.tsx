import { Command, CommandList, CommandItem } from "./ui/command";
import { Button } from "./ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "./ui/input-group";
import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowUp, ChevronDown, Folder, Pause, Play } from "lucide-react";
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
 * Goal 会话的单一消息输入与 Run 主操作。
 *
 * @remarks
 * 普通工作状态下，空输入触发暂停、带文本输入消息；Run 可恢复时，空输入恢复原 Run，
 * 带文本仍排入后续 Run；终态下仅发送新消息。
 */
export function MessageComposer({
  busy,
  running = false,
  recoverable = false,
  stopping = false,
  sendDisabled = false,
  recoveryActionLabel = "Resume Run",
  placeholder,
  textareaLabel = "Message the Goal",
  describedBy,
  footerControls,
  onSubmit,
  onInterrupt,
  onResume,
  autoFocus = false,
  showHint = true,
}: {
  busy: boolean;
  running?: boolean;
  /** Run 不在当前 Runtime 进程执行时，空输入主按钮恢复同一 Run。 */
  recoverable?: boolean;
  stopping?: boolean;
  sendDisabled?: boolean;
  /** 可恢复 Run 主按钮的动作名称；清理已受理的停止时显示对应文案。 */
  recoveryActionLabel?: string;
  placeholder: string;
  /** 文本框的可访问名称；等待交互时的队列输入使用明确的排队用途。 */
  textareaLabel?: string;
  /** 文本框的补充说明元素 id；用于关联“不会回答当前请求”等说明。 */
  describedBy?: string;
  onSubmit: (content: string) => Promise<boolean>;
  /** 运行中且输入框为空时，唯一主按钮将此操作作为暂停当前 Run。 */
  onInterrupt?: () => Promise<void>;
  /** 可恢复 Run 且输入框为空时，由唯一主按钮恢复当前 Run。 */
  onResume?: () => Promise<void>;
  footerControls?: ReactNode;
  autoFocus?: boolean;
  showHint?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [selectedCommand, setSelectedCommand] = useState(0);
  const [commandMenuClosed, setCommandMenuClosed] = useState(false);
  const inspection = slashCommands.inspect(draft);
  const candidates = !running && !recoverable && inspection.kind === "candidates" && !commandMenuClosed ? inspection.candidates : [];
  const activeCandidate = candidates[Math.min(selectedCommand, candidates.length - 1)];
  const hasDraft = draft.trim().length > 0;

  async function submit(content = draft) {
    if (busy || !content.trim()) return;
    const submittedDraft = draft;
    if (await onSubmit(content)) {
      setDraft((current) => (current === submittedDraft ? "" : current));
      setCommandMenuClosed(false);
      setSelectedCommand(0);
    }
  }

  async function activatePrimaryAction() {
    if (recoverable && !hasDraft) {
      if (!busy && !stopping && onResume !== undefined) await onResume();
      return;
    }
    if (running && !hasDraft) {
      if (!busy && !stopping && onInterrupt !== undefined) await onInterrupt();
      return;
    }
    await submit();
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
            id="message-composer-draft"
            name="message"
            aria-label={textareaLabel}
            aria-describedby={describedBy}
            aria-keyshortcuts="Enter Shift+Enter"
            title="Enter to send · Shift + Enter for a new line"
            placeholder={placeholder}
            autoFocus={autoFocus}
            value={draft}
            disabled={busy}
            onChange={(event) => {
              setDraft(event.target.value);
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
                type="button"
                className={`send${running ? " is-running" : ""}${stopping ? " is-stopping" : ""}`}
                aria-label={
                  stopping
                    ? "Pausing Run"
                    : busy
                      ? recoverable && !hasDraft ? "Recovering Run" : "Sending message"
                      : recoverable && !hasDraft
                        ? recoveryActionLabel
                        : running && !hasDraft
                          ? "Pause Run"
                          : "Send message"
                }
                title={
                  stopping
                    ? "Pausing this Run"
                    : recoverable && !hasDraft
                      ? recoveryActionLabel
                      : running && !hasDraft
                        ? "Pause this Run"
                        : "Send message"
                }
                disabled={
                  busy || sendDisabled || (
                    recoverable
                      ? !hasDraft && (stopping || onResume === undefined)
                      : running
                        ? !hasDraft && (stopping || onInterrupt === undefined)
                        : !hasDraft
                  )
                }
                onClick={() => void activatePrimaryAction()}
              >
                {busy || stopping ? (
                  <span className="loading-mark small" />
                ) : recoverable && !hasDraft ? (
                  <Play size={14} />
                ) : running && !hasDraft ? (
                  <Pause size={15} />
                ) : (
                  <ArrowUp size={16} />
                )}
              </Button>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </form>
      {showHint && <div className="composer-hint">Enter to send · Shift + Enter for a new line</div>}
    </>
  );
}

