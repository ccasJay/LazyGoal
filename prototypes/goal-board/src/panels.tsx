import { useState } from "react";
import { Check, Circle, CircleHelp, Clock3, X, Zap } from "lucide-react";

import type {
  BrowserGoalInteractionCommand,
  BrowserGoalSession,
} from "../../../packages/browser/src/index";

type SessionTab = "Activity" | "Plan" | "Details";

export function GoalDetails({
  session,
  tab,
}: {
  session: BrowserGoalSession;
  tab: Exclude<SessionTab, "Activity">;
}) {
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
          <dt>Committed steps</dt>
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
      {session.historyTruncated && (
        <div className="info-box">Older session history is omitted from this view.</div>
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
  if (action === undefined || action.status === "approved") return null;
  const recovery = action.status === "outcome_unknown";

  return (
    <section className="approval structured-form">
      <div className="approval-heading">
        <CircleHelp size={15} />
        <strong>{recovery ? "Action result needs review" : "Your approval is needed"}</strong>
      </div>
      <p>
        {recovery
          ? "The previous result could not be confirmed. Review this action before choosing what to do."
          : "LazyGoal wants to run a workspace action."}
      </p>
      <div className="action-summary">
        <Zap size={14} />
        <span>{action.toolId}</span>
        <small>{action.actionId}</small>
      </div>
      <button
        className="approval-primary"
        disabled={busy}
        onClick={() => onSubmit({
          kind: "approve_action",
          runId: session.currentRunId,
          actionId: action.actionId,
        })}
      >
        <Check size={13} /> Approve action
      </button>
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
        <label htmlFor="action-reason">Or reject with a reason</label>
        <textarea
          id="action-reason"
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Explain why this action should not run…"
        />
        <button disabled={busy || !reason.trim()} type="submit">Reject action</button>
      </form>
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
