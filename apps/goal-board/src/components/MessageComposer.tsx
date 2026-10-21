import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowUp, ChevronDown, Folder } from "lucide-react";
import { slashCommands } from "../types";

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
    <button
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
    </button>
  );
}

export function MessageComposer({
  busy,
  running = false,
  stopping = false,
  sendDisabled = false,
  placeholder,
  textareaLabel = "Message the Goal",
  describedBy,
  footerControls,
  onSubmit,
  pendingSteers = [],
  onSteer,
  onQueue,
  onInterrupt,
  autoFocus = false,
  showHint = true,
}: {
  busy: boolean;
  running?: boolean;
  stopping?: boolean;
  sendDisabled?: boolean;
  placeholder: string;
  /** 文本框的可访问名称；等待交互时的队列输入使用明确的排队用途。 */
  textareaLabel?: string;
  /** 文本框的补充说明元素 id；用于关联“不会回答当前请求”等说明。 */
  describedBy?: string;
  onSubmit: (content: string) => Promise<boolean>;
  pendingSteers?: readonly { readonly messageId: string; readonly content: string }[];
  onSteer?: (content: string) => Promise<boolean>;
  onQueue?: (content: string) => Promise<boolean>;
  onInterrupt?: () => Promise<void>;
  footerControls?: ReactNode;
  autoFocus?: boolean;
  showHint?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [selectedCommand, setSelectedCommand] = useState(0);
  const [commandMenuClosed, setCommandMenuClosed] = useState(false);
  const [runSendOptionsOpen, setRunSendOptionsOpen] = useState(false);
  const inspection = slashCommands.inspect(draft);
  const candidates = !running && inspection.kind === "candidates" && !commandMenuClosed ? inspection.candidates : [];
  const activeCandidate = candidates[Math.min(selectedCommand, candidates.length - 1)];

  async function submit(content = draft) {
    if (busy || !content.trim()) return;
    if (running) {
      setRunSendOptionsOpen(true);
      return;
    }
    const submittedDraft = draft;
    if (await onSubmit(content)) {
      setDraft((current) => (current === submittedDraft ? "" : current));
      setCommandMenuClosed(false);
      setSelectedCommand(0);
    }
  }

  async function chooseSteer() {
    if (!onSteer || busy || !draft.trim()) return;
    const submittedDraft = draft;
    if (await onSteer(submittedDraft)) {
      setDraft((current) => (current === submittedDraft ? "" : current));
      setRunSendOptionsOpen(false);
    }
  }

  async function chooseQueue(): Promise<void> {
    if (!onQueue || !draft.trim()) return;
    const submittedDraft = draft;
    if (await onQueue(submittedDraft)) {
      setDraft((current) => (current === submittedDraft ? "" : current));
      setRunSendOptionsOpen(false);
    }
  }

  return (
    <>
      {running && pendingSteers.length > 0 && (
        <div className="pending-steers" aria-label="Pending Steer messages">
          <strong>Steer · waiting for next model call</strong>
          <ol>
            {pendingSteers.map((item, index) => (
              <li key={item.messageId}>
                {index + 1}. {item.content}
              </li>
            ))}
          </ol>
        </div>
      )}
      {candidates.length > 0 && (
        <div className="command-candidates" role="listbox" aria-label="Available commands">
          {candidates.map((candidate, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === Math.min(selectedCommand, candidates.length - 1)}
              className={`command-candidate ${index === Math.min(selectedCommand, candidates.length - 1) ? "active" : ""}`}
              key={candidate.name}
              disabled={busy}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void submit(candidate.usage)}
            >
              <span className="command-candidate-name">{candidate.usage}</span>
              <span className="command-candidate-description">{candidate.description}</span>
            </button>
          ))}
        </div>
      )}
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          id="message-composer-draft"
          name="message"
          aria-label={textareaLabel}
          aria-describedby={describedBy}
          aria-keyshortcuts="Enter Shift+Enter"
          title={running ? "This Run is in progress." : "Enter to send · Shift + Enter for a new line"}
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={draft}
          disabled={busy || (running && stopping)}
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
            if (event.key === "Escape" && runSendOptionsOpen) {
              event.preventDefault();
              setRunSendOptionsOpen(false);
              return;
            }
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composer-tools">
          <div className="composer-controls">{footerControls}</div>
          {running && runSendOptionsOpen && draft.trim() ? (
            <div className="run-send-options" role="group" aria-label="Choose message action">
              <button type="button" disabled={busy} onClick={() => void chooseSteer()}>
                Steer
              </button>
              <button type="button" disabled={busy} onClick={() => void chooseQueue()}>
                Queue
              </button>
            </div>
          ) : (
            <button
              type={running ? "button" : "submit"}
              className={`send ${running ? "is-running" : ""} ${running && stopping ? "is-stopping" : ""}`}
              aria-label={
                running
                  ? stopping
                    ? "Stopping Run"
                    : draft.trim()
                    ? "Choose Steer or Queue"
                    : "Interrupt Run"
                  : busy
                  ? "Sending message"
                  : "Send message"
              }
              title={
                running
                  ? stopping
                    ? "Stopping Run"
                    : draft.trim()
                    ? "Choose Steer or Queue"
                    : "Interrupt this Run"
                  : undefined
              }
              disabled={busy || (running && stopping) || sendDisabled || (!running && !draft.trim())}
              onClick={running ? () => (draft.trim() ? setRunSendOptionsOpen(true) : void onInterrupt?.()) : undefined}
            >
              {running ? (
                <>
                  {stopping ? (
                    <span className="run-spinner stopping" aria-hidden="true" />
                  ) : (
                    <span className="run-spinner" aria-hidden="true" />
                  )}
                  {stopping ? "Stopping" : "Running"}
                </>
              ) : busy ? (
                <span className="loading-mark small" />
              ) : (
                <ArrowUp size={16} />
              )}
            </button>
          )}
        </div>
      </form>
      {showHint && <div className="composer-hint">Enter to send · Shift + Enter for a new line</div>}
    </>
  );
}

