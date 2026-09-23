import { useEffect, useRef } from "react";
import { Check, Circle, Clock3, Settings2, X } from "lucide-react";

type GoalSummary = {
  id: number;
  title: string;
  description: string;
  status: string;
  steps: number;
  total: number;
  tag: string;
};

export function GoalDetails({
  goal,
  tab,
}: {
  goal: GoalSummary;
  tab: "Plan" | "Details";
}) {
  const stages = [
    "Understand the objective",
    "Inspect the workspace",
    "Implement the changes",
    "Verify the result",
    "Summarize the outcome",
  ];
  return (
    <div className="detail-panel" key={goal.id}>
      {tab === "Plan" ? (
        <>
          <div className="panel-heading">
            <h3>Execution plan</h3>
            <span>
              {goal.steps}/{goal.total}
            </span>
          </div>
          <p className="panel-description">
            Sample milestones for this goal. Execution updates the plan as work
            progresses.
          </p>
          <progress
            aria-label="Goal progress"
            value={goal.steps}
            max={goal.total}
          />
          <ol className="plan-list">
            {Array.from({ length: goal.total }, (_, i) => (
              <li key={i} className={i < goal.steps ? "done" : ""}>
                <span className="plan-marker">
                  {i < goal.steps ? (
                    <Check size={14} />
                  ) : i === goal.steps && goal.status === "Running" ? (
                    <Clock3 size={14} />
                  ) : (
                    <Circle size={14} />
                  )}
                </span>
                <div>
                  <strong>{stages[Math.min(i, stages.length - 1)]}</strong>
                  <small>
                    {i < goal.steps
                      ? "Completed"
                      : i === goal.steps && goal.status === "Running"
                        ? "In progress"
                        : "Pending"}
                  </small>
                </div>
              </li>
            ))}
          </ol>
          <div className="info-box">
            Plan progress is separate from permission to execute. Review
            approval requests in Activity.
          </div>
        </>
      ) : (
        <>
          <div className="panel-heading">
            <h3>Goal details</h3>
            <span>LG-{goal.id}</span>
          </div>
          <label className="field-label">Objective</label>
          <p className="objective-text">{goal.title}</p>
          <p className="panel-description">{goal.description}</p>
          <dl className="property-list">
            <div>
              <dt>Status</dt>
              <dd>{goal.status}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{goal.tag}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>Run 01</dd>
            </div>
            <div>
              <dt>Progress</dt>
              <dd>
                {goal.steps} of {goal.total} steps
              </dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>Browser memory</dd>
            </div>
          </dl>
          <h3 className="section-title">Completion criteria</h3>
          <div className="criterion">
            <Circle size={14} />
            <span>The objective is met and its result can be verified.</span>
          </div>
          <div className="info-box">
            This is a UI preview. Plan items and completion criteria are
            illustrative, not Runtime records.
          </div>
        </>
      )}
    </div>
  );
}

export function SettingsDialog({
  open,
  onClose,
  compact,
  setCompact,
  showTools,
  setShowTools,
  agent,
  setAgent,
}: {
  open: boolean;
  onClose: () => void;
  compact: boolean;
  setCompact: (value: boolean) => void;
  showTools: boolean;
  setShowTools: (value: boolean) => void;
  agent: string;
  setAgent: (value: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="settings-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>
          <Settings2 size={19} />
          Workspace settings
        </h2>
        <button className="icon" aria-label="Close settings" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p>Make this workspace feel like yours.</p>
      <h3 className="section-title">Appearance</h3>
      <label className="setting-row">
        <span>
          <strong>Compact cards</strong>
          <small>Keep equal card sizes with less space between rows.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={compact}
          onChange={(e) => setCompact(e.target.checked)}
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>Show tool activity</strong>
          <small>Include tool calls in the session waterfall.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={showTools}
          onChange={(e) => setShowTools(e.target.checked)}
        />
      </label>
      <h3 className="section-title">Agent profile</h3>
      <label className="field-label" htmlFor="profile-setting">
        Default profile
      </label>
      <select
        id="profile-setting"
        value={agent}
        onChange={(e) => setAgent(e.target.value)}
      >
        <option>Default agent</option>
        <option>Code reviewer</option>
        <option>Research assistant</option>
      </select>
      <div className="info-box">
        Profile selection changes the preview label only. No model requests are
        made. Preferences reset on refresh.
      </div>
      <button className="primary" onClick={onClose}>
        Done
      </button>
    </dialog>
  );
}
