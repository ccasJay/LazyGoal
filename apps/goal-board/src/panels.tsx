import { useState } from "react";
import { Check, Circle, CircleHelp, Clock3, Eye, Shield, Trash2, X, Zap } from "lucide-react";

import type {
  BrowserGoalInteractionCommand,
  BrowserGoalSession,
  BrowserToolGrantSummary,
} from "../../../packages/browser/src/index";
import { BrowserApiError, browserApi } from "./api";

type SessionTab = "Activity" | "Plan" | "Details";

export function GoalDetails({
  session,
  tab,
  grants,
  grantsLoading,
  grantsError,
  revokingGrantId,
  onRevokeGrant,
  onDelete,
  deleteBusy = false,
}: {
  session: BrowserGoalSession;
  tab: Exclude<SessionTab, "Activity">;
  grants: readonly BrowserToolGrantSummary[];
  grantsLoading: boolean;
  grantsError: string | null;
  revokingGrantId: string | null;
  onRevokeGrant: (grant: BrowserToolGrantSummary) => void;
  onDelete?: () => void;
  deleteBusy?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (tab === "Plan") {
    const plan = session.goalPlan;
    if (plan === undefined) return null;
    return (
      <div className="detail-panel">
        <div className="panel-heading">
          <h3>Execution plan</h3>
          <span>Revision {plan.revision}</span>
        </div>
        {plan.items.length === 0 ? (
          <div className="panel-empty">No plan items are saved for this Goal.</div>
        ) : (
          <ol className="plan-list">
            {plan.items.map((item) => (
              <li key={item.id} className={item.status === "completed" ? "done" : ""}>
                <span className="plan-marker">
                  {item.status === "completed" ? <Check size={14} />
                    : item.status === "in_progress" ? <Clock3 size={14} />
                      : item.status === "cancelled" ? <X size={14} />
                        : <Circle size={14} />}
                </span>
                <div>
                  <strong>{item.content}</strong>
                  <small>{planStatus(item.status)}</small>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  const currentRun = session.runs.find((run) => run.current);
  return (
    <div className="detail-panel">
      <div className="panel-heading">
        <h3>Goal details</h3>
        <span>{session.goalId}</span>
      </div>
      <label className="field-label">Objective</label>
      <p className="objective-text">{session.intent}</p>
      <dl className="property-list">
        <div>
          <dt>Run status</dt>
          <dd>{runStatusLabel(session.runStatus)}</dd>
        </div>
        <div>
          <dt>Current Run</dt>
          <dd>{session.currentRunId}</dd>
        </div>
        <div>
          <dt>Runtime steps</dt>
          <dd>{currentRun?.stepCount ?? 0}</dd>
        </div>
        <div>
          <dt>Earlier Runs</dt>
          <dd>{session.runs.filter((run) => !run.current).length}</dd>
        </div>
        <div>
          <dt>Saved messages</dt>
          <dd>{session.messages.length}</dd>
        </div>
      </dl>
      <section className="grant-panel" aria-labelledby="grant-panel-title">
        <div className="panel-heading">
          <h3 id="grant-panel-title">Tool permissions</h3>
          <span>{grants.length}</span>
        </div>
        <p className="grant-intro">Permissions granted for this Goal and this project.</p>
        {grantsLoading ? <div className="panel-empty">Loading permissions…</div>
          : grantsError ? <div className="grant-error" role="alert">{grantsError}</div>
            : grants.length === 0 ? <div className="panel-empty">No ongoing permissions.</div>
              : <ul className="grant-list">{grants.map((grant) => (
                <li key={grant.grantId}>
                  <div className="grant-copy">
                    <strong><Shield size={13} /> {grant.toolId}</strong>
                    <span>{grant.scope === "goal" ? "This Goal" : "This project"} · {grant.status}</span>
                    {grant.targetPath && <code>{grant.targetPath}</code>}
                  </div>
                  {grant.status === "active" && <button
                    className="grant-revoke"
                    disabled={revokingGrantId !== null}
                    aria-label={`Revoke ${grant.toolId} permission`}
                    onClick={() => onRevokeGrant(grant)}
                  >{revokingGrantId === grant.grantId ? "Revoking…" : "Revoke"}</button>}
                </li>
              ))}</ul>}
      </section>
      {onDelete && <section className="goal-delete-panel">
        <div><strong>Local record</strong><p>Remove this Goal and its saved run history from this workspace.</p></div>
        <button type="button" className={confirmDelete ? "is-confirming" : ""} disabled={deleteBusy || !(session.runStatus === "completed" || session.runStatus === "failed" || session.runStatus === "cancelled")} onPointerLeave={(event) => { if (event.pointerType === "mouse" && !deleteBusy) setConfirmDelete(false); }} onClick={() => { if (confirmDelete) onDelete(); else setConfirmDelete(true); }}><Trash2 size={14} /> {deleteBusy ? "Deleting…" : confirmDelete ? "Confirm" : "Delete goal"}</button>
      </section>}
      {session.historyTruncated && (
        <div className="info-box">Some session content is omitted from this view.</div>
      )}
    </div>
  );
}

export function WaitingInteraction({
  session,
  busy,
  onSubmit,
}: {
  session: BrowserGoalSession;
  busy: boolean;
  onSubmit: (command: BrowserGoalInteractionCommand) => void;
}) {
  const interaction = session.pendingInteraction;
  if (interaction?.kind === "ask_user") {
    return (
      <AskUserForm
        key={`${session.currentRunId}:${interaction.requestId}`}
        session={session}
        busy={busy}
        onSubmit={onSubmit}
      />
    );
  }
  if (interaction?.kind === "task_approval") {
    return (
      <TaskApprovalForm
        key={`${session.currentRunId}:${interaction.requestId}`}
        session={session}
        busy={busy}
        onSubmit={onSubmit}
      />
    );
  }
  const action = session.pendingAction;
  if (action !== undefined && action.status !== "approved") {
    return (
      <ActionApprovalForm
        key={`${session.currentRunId}:${action.actionId}`}
        session={session}
        busy={busy}
        onSubmit={onSubmit}
      />
    );
  }
  return null;
}

function AskUserForm({
  session,
  busy,
  onSubmit,
}: {
  session: BrowserGoalSession;
  busy: boolean;
  onSubmit: (command: BrowserGoalInteractionCommand) => void;
}) {
  const interaction = session.pendingInteraction;
  if (interaction?.kind !== "ask_user") return null;
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const canSubmit = interaction.questions.length > 0 && interaction.questions.every((question) =>
    (selected[question.id]?.length ?? 0) > 0 || (otherText[question.id]?.trim().length ?? 0) > 0);

  return (
    <section className="approval structured-form">
      <div className="approval-heading">
        <CircleHelp size={15} />
        <strong>Your answer is needed</strong>
      </div>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          kind: "answer_ask_user",
          runId: session.currentRunId,
          requestId: interaction.requestId,
          answers: interaction.questions.map((question) => ({
            questionId: question.id,
            optionIds: selected[question.id] ?? [],
            ...(otherText[question.id]?.trim()
              ? { otherText: otherText[question.id]!.trim() }
              : {}),
          })),
        });
      }}>
        {interaction.questions.map((question) => (
          <fieldset className="question" key={question.id}>
            <legend>{question.header}</legend>
            <p>{question.question}</p>
            <div className="question-options">
              {question.options.map((option) => {
                const checked = (selected[question.id] ?? []).includes(option.id);
                return (
                  <label className="answer-option" key={option.id}>
                    <input
                      type={question.multiSelect ? "checkbox" : "radio"}
                      name={`question-${question.id}`}
                      checked={checked}
                      disabled={busy}
                      onChange={() => setSelected((current) => {
                        const previous = current[question.id] ?? [];
                        const next = question.multiSelect
                          ? checked
                            ? previous.filter((id) => id !== option.id)
                            : [...previous, option.id]
                          : [option.id];
                        return { ...current, [question.id]: next };
                      })}
                    />
                    <span>{option.label}
                      {option.description && <small>{option.description}</small>}
                    </span>
                  </label>
                );
              })}
            </div>
            <label className="other-answer">
              <span>Other answer</span>
              <input
                value={otherText[question.id] ?? ""}
                disabled={busy}
                onChange={(event) => setOtherText((current) => ({
                  ...current,
                  [question.id]: event.target.value,
                }))}
              />
            </label>
          </fieldset>
        ))}
        <button className="approval-primary" disabled={busy || !canSubmit} type="submit">
          <Check size={13} /> Submit answer
        </button>
      </form>
    </section>
  );
}

function TaskApprovalForm({
  session,
  busy,
  onSubmit,
}: {
  session: BrowserGoalSession;
  busy: boolean;
  onSubmit: (command: BrowserGoalInteractionCommand) => void;
}) {
  const interaction = session.pendingInteraction;
  const [feedback, setFeedback] = useState("");
  if (interaction?.kind !== "task_approval") return null;

  return (
    <section className="approval structured-form">
      <div className="approval-heading">
        <CircleHelp size={15} />
        <strong>Review the proposed task</strong>
      </div>
      <p>{interaction.approvalRequest}</p>
      <h4>{interaction.objective}</h4>
      {interaction.completionCriteria.length > 0 && (
        <ul className="criteria-list">
          {interaction.completionCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}
        </ul>
      )}
      <button
        className="approval-primary"
        disabled={busy}
        onClick={() => onSubmit({
          kind: "approve_task",
          runId: session.currentRunId,
          requestId: interaction.requestId,
        })}
      >
        <Check size={13} /> Approve task
      </button>
      <form className="feedback-form" onSubmit={(event) => {
        event.preventDefault();
        if (!feedback.trim()) return;
        onSubmit({
          kind: "feedback_task",
          runId: session.currentRunId,
          requestId: interaction.requestId,
          feedback: feedback.trim(),
        });
      }}>
        <label htmlFor="task-feedback">Or send feedback</label>
        <textarea
          id="task-feedback"
          value={feedback}
          disabled={busy}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="Describe what should change…"
        />
        <button disabled={busy || !feedback.trim()} type="submit">Send feedback</button>
      </form>
    </section>
  );
}

function ActionApprovalForm({
  session,
  busy,
  onSubmit,
}: {
  session: BrowserGoalSession;
  busy: boolean;
  onSubmit: (command: BrowserGoalInteractionCommand) => void;
}) {
  const action = session.pendingAction;
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"action" | "goal" | "workspace">("action");
  const [fullInput, setFullInput] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  if (action === undefined || action.status === "approved") return null;
  const pendingAction = action;
  const recovery = pendingAction.status === "outcome_unknown";
  const persistentDisabled = recovery || busy || (pendingAction.inputPreviewTruncated && fullInput === null);
  const pathAuthorization = pendingAction.targetPath !== undefined
    && (pendingAction.toolId === "write_file" || pendingAction.toolId === "edit_file");

  async function revealFullInput() {
    if (fullInput !== null || detailsLoading) return;
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const details = await browserApi.readActionDetails(session.goalId, session.currentRunId, pendingAction.actionId);
      if (!details.ok) throw new BrowserApiError(details.error, 409, true);
      setFullInput(JSON.stringify(details.input, null, 2));
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : "Action details could not be loaded.");
    } finally { setDetailsLoading(false); }
  }

  return (
    <section className="approval structured-form action-approval">
      <div className="approval-heading">
        <CircleHelp size={15} />
        <strong>{recovery ? "Action result needs review" : "Your approval is needed"}</strong>
        <span className="action-summary"><Zap size={13} />{action.toolId}</span>
      </div>
      {recovery && <p>The previous result could not be confirmed. Review this action before choosing what to do.</p>}
      {action.parentProgram && <p>Program <code>{action.parentProgram.actionId}</code>, call {action.parentProgram.callNumber}. Review this operation on its own merits.</p>}
      <div className="action-input-preview">
        <label>{action.inputSummary !== undefined ? action.toolId === "bash" ? "Command" : "Target" : "Tool input"}</label>
        <pre>{action.inputSummary ?? action.inputPreview}</pre>
        {action.inputPreviewTruncated && fullInput === null && <p>Preview shortened. View the complete input before granting ongoing permission.</p>}
        <button className="action-details-toggle" disabled={detailsLoading} onClick={() => {
          if (fullInput === null) void revealFullInput();
          else { setFullInput(null); if (pendingAction.inputPreviewTruncated) setScope("action"); }
        }}>
          <Eye size={13} /> {detailsLoading ? "Loading…" : fullInput === null ? "View complete input" : "Hide complete input"}
        </button>
        {detailsError && <span className="grant-error" role="alert">{detailsError}</span>}
        {fullInput !== null && <pre className="action-input-full">{fullInput}</pre>}
      </div>
      {pathAuthorization && <p className="path-permission-note">
        Ongoing permission for <code>{action.targetPath}</code> also allows later writes to this path with different content.
      </p>}
      {!recovery && <fieldset className="approval-scopes" disabled={busy}>
        <legend>Allow this action</legend>
        <label><input type="radio" name={`scope-${action.actionId}`} checked={scope === "action"} onChange={() => setScope("action")} />
          <span><strong>Once</strong><small>Approve this action only.</small></span></label>
        <label className={persistentDisabled ? "is-disabled" : ""}>
          <input type="radio" name={`scope-${action.actionId}`} checked={scope === "goal"} disabled={persistentDisabled} onChange={() => setScope("goal")} />
          <span><strong>This Goal</strong><small>Allow matching actions in this session.</small></span>
        </label>
        <label className={persistentDisabled ? "is-disabled" : ""}>
          <input type="radio" name={`scope-${action.actionId}`} checked={scope === "workspace"} disabled={persistentDisabled} onChange={() => setScope("workspace")} />
          <span><strong>This project</strong><small>Allow matching actions in future Goals.</small></span>
        </label>
      </fieldset>}
      <div className="action-approval-actions">
        <button
          className="approval-primary"
          disabled={busy}
          onClick={() => onSubmit({
            kind: "approve_action",
            runId: session.currentRunId,
            actionId: action.actionId,
            scope: recovery ? "action" : scope,
          })}
        >
          <Check size={13} /> {busy ? "Saving approval…" : recovery ? "Approve action" : scope === "goal" ? "Approve for this Goal" : scope === "workspace" ? "Approve for this project" : "Approve once"}
        </button>
        <details className="action-rejection">
          <summary>Reject action</summary>
          <form className="feedback-form" onSubmit={(event) => {
            event.preventDefault();
            if (!reason.trim()) return;
            onSubmit({
              kind: "reject_action",
              runId: session.currentRunId,
              actionId: action.actionId,
              reason: reason.trim(),
            });
          }}>
            <label htmlFor="action-reason">Reason for rejecting</label>
            <textarea
              id="action-reason"
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this action should not run…"
            />
            <button disabled={busy || !reason.trim()} type="submit">Reject action</button>
          </form>
        </details>
      </div>
    </section>
  );
}

function planStatus(status: string): string {
  switch (status) {
    case "in_progress": return "In progress";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    default: return "Pending";
  }
}

export function runStatusLabel(status: BrowserGoalSession["runStatus"]): string {
  switch (status) {
    case "created": return "Ready";
    case "running": return "Running";
    case "waiting": return "Needs input";
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "cancelled": return "Cancelled";
  }
}
