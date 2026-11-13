import { Button } from "./components/ui/button";
import { Label } from "./components/ui/label";
import { useState } from "react";
import { Check, Circle, Clock3, Shield, Trash2, X } from "lucide-react";

import type {
  BrowserGoalSession,
  BrowserGoalSessionState,
  BrowserPermissionExemptionSummary,
} from "../../../packages/web-contracts/src/index";
import {
  ActionInteractionRegion,
  QuestionInteractionRegion,
  TaskApprovalRegion,
  type AcceptedDecisionSummary,
} from "./interaction-panel";
import type { ControlIntents } from "./hooks/useControlIntents";
import {
  permissionExemptionStatusLabel,
  permissionExtraFileLabel,
  permissionNetworkLabel,
} from "./permission-profile";

type SessionTab = "Activity" | "Plan" | "Details";

export function GoalDetails({
  session,
  tab,
  exemptions,
  exemptionsLoading,
  exemptionsError,
  revokingExemptionId,
  onRevokeExemption,
  onDelete,
  deleteBusy = false,
}: {
  session: BrowserGoalSession;
  tab: Exclude<SessionTab, "Activity">;
  exemptions: readonly BrowserPermissionExemptionSummary[];
  exemptionsLoading: boolean;
  exemptionsError: string | null;
  revokingExemptionId: string | null;
  onRevokeExemption: (exemption: BrowserPermissionExemptionSummary) => void;
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
      <Label className="field-label">Objective</Label>
      <p className="objective-text">{session.intent}</p>
      <dl className="property-list">
        <div>
          <dt>Run status</dt>
          <dd>{runStatusLabel(session.runStatus)}</dd>
        </div>
        {session.execution && (
          <div>
            <dt>Execution state</dt>
            <dd>{session.execution.state === "active" ? "Active" : session.execution.state === "recoverable" ? "Recoverable" : "Inactive"}</dd>
          </div>
        )}
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
      <section className="exemption-panel" aria-labelledby="exemption-panel-title">
        <div className="panel-heading">
          <h3 id="exemption-panel-title">Permission exemptions</h3>
          <span>{exemptions.length}</span>
        </div>
        <p className="exemption-intro">
          Out-of-boundary access that stays allowed for this Goal and this project.
        </p>
        {exemptionsLoading ? <div className="panel-empty">Loading exemptions…</div>
          : exemptionsError ? <div className="exemption-error" role="alert">{exemptionsError}</div>
            : exemptions.length === 0 ? <div className="panel-empty">No out-of-boundary access is allowed right now.</div>
              : <ul className="exemption-list">{exemptions.map((exemption) => (
                <li key={exemption.id}>
                  <div className="exemption-copy">
                    <strong><Shield size={13} aria-hidden="true" /> {permissionNetworkLabel(exemption.network)}</strong>
                    <span>
                      {`${exemption.scope === "goal" ? "This Goal" : "This Project"}, ${permissionExemptionStatusLabel(exemption.status)}`}
                    </span>
                    {exemption.extraFiles.map((file) => (
                      <code key={`${file.access}:${file.canonicalPath}`}>{permissionExtraFileLabel(file)}</code>
                    ))}
                  </div>
                  {exemption.status === "active" && <Button variant="ghost" size="sm"
                    type="button"
                    className="exemption-revoke"
                    disabled={revokingExemptionId !== null}
                    aria-label={`Revoke ${exemption.scope === "goal" ? "Goal" : "project"} permission exemption`}
                    onClick={() => onRevokeExemption(exemption)}
                  >{revokingExemptionId === exemption.id ? "Revoking…" : "Revoke"}</Button>}
                </li>
              ))}</ul>}
      </section>
      {onDelete && <section className="goal-delete-panel">
        <div><strong>Local record</strong><p>Remove this Goal and its saved run history from this workspace.</p></div>
        <Button variant="ghost" size="sm" type="button" className={confirmDelete ? "is-confirming" : ""} disabled={deleteBusy || !(session.runStatus === "completed" || session.runStatus === "failed" || session.runStatus === "cancelled")} onPointerLeave={(event) => { if (event.pointerType === "mouse" && !deleteBusy) setConfirmDelete(false); }} onClick={() => { if (confirmDelete) onDelete(); else setConfirmDelete(true); }}><Trash2 size={14} /> {deleteBusy ? "Deleting…" : confirmDelete ? "Confirm" : "Delete goal"}</Button>
      </section>}
      {session.historyTruncated && (
        <div className="info-box">Some session content is omitted from this view.</div>
      )}
    </div>
  );
}

/**
 * 当前等待交互的统一区域入口。
 *
 * @remarks
 * 只按窄状态 DTO 中已提交的类型化交互视图分派具体请求视图，不读取历史正文、阶段或步骤；
 * 没有等待时不渲染。停止按钮由各区域独立提供，普通消息的排队输入由外层外壳负责。
 *
 * @param props - 当前等待状态、提交忙碌态和决定完成通知。
 * @returns 对应问题、任务审批或 Action 审批视图；没有交互等待时返回 `null`。
 * @example
 * ```tsx
 * <WaitingInteraction session={goalState} busy={false} stopping={false}
 *   onInterrupt={interrupt} onRefreshSession={refresh} onDecisionAccepted={recordDecision} />
 * ```
 */
export function WaitingInteraction({
  session,
  busy,
  stopping,
  control,
  onInterrupt,
  onRefreshSession,
  onDecisionAccepted,
}: {
  session: BrowserGoalSessionState;
  busy: boolean;
  stopping: boolean;
  control: ControlIntents;
  onInterrupt: () => Promise<void>;
  onRefreshSession: () => Promise<void>;
  onDecisionAccepted: (summary: AcceptedDecisionSummary) => void;
}) {
  const view = session.interaction;
  if (view === undefined) return null;
  const chrome = { label: view.kind, busy, stopping };
  switch (view.kind) {
    case "question":
      return (
        <QuestionInteractionRegion
          key={`${view.runId}:${view.interactionId}`}
          view={view}
          chrome={chrome}
          control={control}
          onRefreshSession={onRefreshSession}
          onInterrupt={onInterrupt}
          onDecisionAccepted={onDecisionAccepted}
        />
      );
    case "task_approval":
      return (
        <TaskApprovalRegion
          key={`${view.runId}:${view.interactionId}`}
          view={view}
          chrome={chrome}
          control={control}
          onRefreshSession={onRefreshSession}
          onInterrupt={onInterrupt}
          onDecisionAccepted={onDecisionAccepted}
        />
      );
    case "action_approval":
    case "action_recovery":
      return (
        <ActionInteractionRegion
          key={`${view.runId}:${view.interactionId}`}
          view={view}
          summary={session.pendingAction}
          chrome={chrome}
          control={control}
          onRefreshSession={onRefreshSession}
          onInterrupt={onInterrupt}
          onDecisionAccepted={onDecisionAccepted}
        />
      );
  }
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
