import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowDown,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Brain,
  FilePenLine,
  Layers,
  Search,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import type {
  BrowserGoalListItem,
  BrowserSessionMessage,
  BrowserSessionRun,
  BrowserToolGrantSummary,
} from "../../../../packages/web-contracts/src/index";
import { GoalDetails, WaitingInteraction } from "../panels";
import type { AcceptedDecisionSummary } from "../interaction-panel";
import brandMark from "../assets/lazygoal/mark-on-light.svg?no-inline";
import { Trajectory } from "../trajectory";
import { resolveCurrentWindow, resolveExpandedWindow, resolveInitialWindow } from "../session-window";
import { sessionStatus, sessionStatusTone } from "../types";
import { useGoalSessionContext } from "../context/GoalSessionContext";
import { useRunControlContext } from "../context/RunControlContext";
import { MessageComposer, CurrentModelControl } from "./MessageComposer";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { SessionMetricsBar } from "./SessionMetricsBar";
import { PlanRouteList } from "./PlanRouteList";
import { WorkspaceContext } from "./WorkspaceContext";
import { SessionBoundary } from "./error-boundary";
import { projectActivityGroups, type ActivityGroup } from "../activity-projector";
import { collectActivityProjections } from "../collect-activity-projections";
import {
  formatRunStepsTitle,
  renderStageStatusLabel,
} from "./run-stage-utils";

/**
 * 单条已保存会话消息的 memo 展示边界。
 *
 * @remarks
 * 角色与内容字符串作为 props 以支持浅比较：liveText 等局部状态更新时，
 * 未变化的历史消息不进入 `AssistantMarkdown` 的重新解析路径。
 * 展示结构与原内联渲染一致，不引入额外 DOM 包裹层。
 */
const SessionMessage = memo(function SessionMessage({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  return (
    <article className={`message ${role}`}>
      <div className="message-heading">
        <span className={`message-avatar ${role}`}>
          {role === "user" ? "You" : <img src={brandMark} alt="" width={20} height={20} />}
        </span>
        <strong>{role === "user" ? "You" : "LazyGoal"}</strong>
      </div>
      <div className={`message-body ${role === "assistant" ? "markdown-body" : ""}`}>
        {role === "assistant" ? <AssistantMarkdown content={content} /> : content}
      </div>
    </article>
  );
});

export function GoalSession({
  activeGoal,
  boardContent,
  renderPermissionControl,
  onRevokeToolGrant,
  onDeleteGoal,
  manageBusyId,
}: {
  activeGoal?: BrowserGoalListItem;
  boardContent: ReactNode;
  renderPermissionControl: (hasGoal: boolean) => ReactNode;
  onRevokeToolGrant: (grant: BrowserToolGrantSummary) => Promise<void>;
  onDeleteGoal?: (goal: BrowserGoalListItem) => Promise<void>;
  manageBusyId: string | null;
}) {
  const {
    session,
    sessionLoading,
    sessionError,
    workspaceContext,
    workspaceContextError,
    sessionTab,
    setSessionTab,
    trajectoryTarget,
    setTrajectoryTarget,
    follow,
    setFollow,
    showTools,
    setShowTools,
    goalInfoOpen,
    setGoalInfoOpen,
    toolGrants,
    toolGrantsLoading,
    toolGrantsError,
    revokingGrantId,
    liveText,
    liveActivity,
    liveEvents,
    streamConnected,
    metricsByGoal,
    currentModelName,
    canSwitchCurrentModel,
    setModelPickerTarget,
    modelPreferenceRetry,
    retryModelPreference,
    refreshSelectedSession,
    draftSessionOpen,
    draftPlanMode,
    draftModelId,
    draftModelCatalog,
    draftModelError,
    draftModelName,
    loadDraftDefault,
  } = useGoalSessionContext();

  const {
    commandBusy,
    commandError,
    setCommandError,
    stoppingRunId,
    canSendText,
    queuedInputs,
    queuePaused,
    onContinueQueue,
    onClearQueue,
    onSubmitMessage,
    onSubmitDraftMessage,
    onSubmitSteer,
    onInterrupt,
    onSubmitResume,
  } = useRunControlContext();

  const timeline = useRef<HTMLDivElement>(null);
  const followFrame = useRef<number | null>(null);
  const currentRun = session?.runs.find((run) => run.current);
  const [draftNoticeDismissed, setDraftNoticeDismissed] = useState(false);
  const [decisionSummaries, setDecisionSummaries] = useState<readonly AcceptedDecisionSummary[]>([]);

  const projectionGoalKey = session?.goalId ?? null;
  const [expandedRunCount, setExpandedRunCount] = useState<number | null>(null);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  useEffect(() => {
    setDraftNoticeDismissed(false);
  }, [draftModelCatalog?.defaultModelNotice]);

  // 切换 Goal 时清空页面级决定摘要：新会话不复用旧请求的决定记录。
  useEffect(() => {
    setDecisionSummaries([]);
  }, [projectionGoalKey]);

  const initialWindow = useMemo(
    () =>
      session === null
        ? null
        : resolveInitialWindow(session.runs, session.messages),
    [session],
  );
  // 切换 Goal 时重置扩页状态：新会话回到初始窗口。
  useEffect(() => {
    if (projectionGoalKey === expandedGoalId) return;
    setExpandedRunCount(null);
    setExpandedGoalId(projectionGoalKey);
  }, [projectionGoalKey, expandedGoalId]);

  const visibleRunCount =
    session === null
      ? 0
      : Math.min(session.runs.length, expandedRunCount ?? initialWindow?.runCount ?? session.runs.length);
  const pendingWindowData =
    session === null
      ? null
      : resolveCurrentWindow(session.runs, session.messages, visibleRunCount);

  const handleExpandWindow = () => {
    if (session === null) return;
    const before = timeline.current?.scrollHeight ?? 0;
    setExpandedRunCount(resolveExpandedWindow(session.runs, session.messages, visibleRunCount).runCount);
    // 扩页在顶部增内容：按高度差保持当前视口位置基本不动。
    window.requestAnimationFrame(() => {
      const timelineElement = timeline.current;
      if (timelineElement === null) return;
      timelineElement.scrollTop += timelineElement.scrollHeight - before;
    });
  };

  useEffect(() => () => {
    if (followFrame.current !== null) window.cancelAnimationFrame(followFrame.current);
  }, []);

  const isWaitingApprovalOrInput =
    session !== null &&
    session.runStatus === "waiting" &&
    (session.interaction !== undefined ||
      session.pendingAction?.status === "awaiting_approval" ||
      session.pendingAction?.status === "outcome_unknown");

  /**
   * 按 `(session, liveEvents)` 记忆化的 Run 活动组投影；
   * liveText 增量不改变这两个引用，故不会重新执行 `projectActivityGroups` 投影。
   */
  const activityProjections = useMemo(
    () =>
      session === null
        ? new Map<string, readonly ActivityGroup[]>()
        : collectActivityProjections(session.runs, session.goalId, liveEvents),
    [session, liveEvents],
  );

  useEffect(() => {
    if (follow && timeline.current && followFrame.current === null) {
      // 以帧为刻度合并滚动跳变，避免每个流式增量都同步读写布局值。
      followFrame.current = window.requestAnimationFrame(() => {
        followFrame.current = null;
        if (follow && timeline.current) {
          timeline.current.scrollTop = timeline.current.scrollHeight;
        }
      });
    }
  }, [session?.messages, currentRun?.steps, liveText, follow]);

  function renderMessages(messages: readonly BrowserSessionMessage[]) {
    return messages.map((message, index) => (
      <SessionMessage
        key={`${message.runId ?? "earlier"}:${index}:${message.role}`}
        role={message.role}
        content={message.content}
      />
    ));
  }

  const sessionTabs = session?.goalPlan === undefined
    ? (["Board", "Activity", "Trajectory"] as const)
    : (["Board", "Activity", "Plan", "Trajectory"] as const);

  return (
    <section className="session">
      {goalInfoOpen && session && (
        <>
          <div
            className="goal-info-backdrop"
            aria-hidden="true"
            onClick={() => setGoalInfoOpen(false)}
          />
          <section className="goal-info-panel" aria-label="Goal information">
            <header>
              <strong>Goal information</strong>
              <button
                className="icon"
                aria-label="Close Goal information"
                onClick={() => setGoalInfoOpen(false)}
              >
                <X size={17} />
              </button>
            </header>
            <GoalDetails
              session={session}
              tab="Details"
              grants={toolGrants}
              grantsLoading={toolGrantsLoading}
              grantsError={toolGrantsError}
              revokingGrantId={revokingGrantId}
              onRevokeGrant={(grant) => void onRevokeToolGrant(grant)}
              onDelete={activeGoal ? () => void onDeleteGoal?.(activeGoal) : undefined}
              deleteBusy={manageBusyId === session.goalId}
            />
          </section>
        </>
      )}

      {draftSessionOpen ? (
        <>
          {sessionError && <div className="command-error" role="alert">
            <p>{sessionError}</p>
            <button className="secondary" onClick={() => void refreshSelectedSession()}>Reload session</button>
          </div>}
          <WorkspaceContext context={workspaceContext} error={workspaceContextError} />
          <div className="session-tabs">
            <div className="session-tab-buttons">
              <button aria-pressed="true">Activity</button>
            </div>
            <span className="stream-state">
              <span className="dot" />Local Runtime
            </span>
          </div>
          <div className="timeline draft-timeline">
            <div className="timeline-date">
              <span />No saved messages<span />
            </div>
            {draftPlanMode && (
              <div className="session-intro">Plan Mode · The first message will start a Plan Run.</div>
            )}
            <p>
              Send your first message to create a Goal and start the session. Use <code>/plan</code> for
              Plan Mode or <code>/model</code> to choose a model.
            </p>
          </div>
          {commandError && (
            <div className="command-error" role="alert">
              <span>{commandError}</span>
              <button aria-label="Dismiss error" onClick={() => setCommandError(null)}>
                <X size={13} />
              </button>
            </div>
          )}
          {draftModelCatalog?.defaultModelNotice && !draftNoticeDismissed && (
            <div className="command-notice" role="status">
              <span>
                {draftModelCatalog.defaultModelNotice === "provider_changed"
                  ? `Saved model belongs to a different provider. ${draftModelId === null ? "Choose an available model." : `Using configured default: ${draftModelName}.`}`
                  : `Saved model is unavailable. ${draftModelId === null ? "Choose an available model." : `Using configured default: ${draftModelName}.`}`}
              </span>
              <button aria-label="Dismiss notice" onClick={() => setDraftNoticeDismissed(true)}>
                <X size={13} />
              </button>
            </div>
          )}
          {draftModelCatalog !== null && draftModelId === null && (
            <div className="command-error" role="alert">
              Configured default model is unavailable. Choose another model.
            </div>
          )}
          {draftModelError !== null && (
            <div className="command-error" role="alert">
              <span>{draftModelError}</span>
              <button type="button" onClick={() => void loadDraftDefault(0)}>
                Retry
              </button>
            </div>
          )}
          <div className="composer-area">
            <MessageComposer
              key="new-goal-draft"
              autoFocus
              busy={commandBusy || (!draftSessionOpen && sessionError !== null)}
              placeholder="Message LazyGoal…"
              footerControls={
                <>
                  {renderPermissionControl(false)}
                  <CurrentModelControl
                    label={draftModelName}
                    enabled={!commandBusy}
                    onClick={() => setModelPickerTarget({ kind: "draft" })}
                  />
                </>
              }
              onSubmit={onSubmitDraftMessage}
              sendDisabled={draftModelId === null}
            />
          </div>
        </>
      ) : sessionLoading && session === null ? (
        <div className="session-empty">
          <span className="loading-mark" />
          <p>Loading the latest saved session…</p>
        </div>
      ) : sessionError && session === null ? (
        <div className="session-empty" role="alert">
          <CircleHelp size={24} />
          <p>{sessionError}</p>
          <button className="secondary" onClick={() => void refreshSelectedSession()}>
            Reload session
          </button>
        </div>
      ) : session === null ? (
        <div className="session-empty">
          <p>Loading session…</p>
        </div>
      ) : (
        <>
          {sessionError && <div className="command-error" role="alert">
            <p>{sessionError}</p>
            <button className="secondary" onClick={() => void refreshSelectedSession()}>Reload session</button>
          </div>}
          <WorkspaceContext context={workspaceContext} error={workspaceContextError} />
          {session.nextRunMode === "plan" && <div className="session-intro">Next Run · Plan Mode</div>}
          <div className="session-tabs">
            <div className="session-tab-buttons">
              {sessionTabs.map((tab) => (
                <button
                  key={tab}
                  aria-pressed={sessionTab === tab}
                  onClick={() => {
                    setTrajectoryTarget(null);
                    setSessionTab(tab);
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="session-state">
              <span className={`task-state ${sessionStatusTone(session)}`}>
                <span className="status-dot" />
                {sessionStatus(session)}
              </span>
              <span className={`stream-state ${streamConnected ? "connected" : ""}`}>
                <span className="dot" />
                {streamConnected ? "Connected" : "Reconnecting"}
              </span>
            </div>
          </div>
          {sessionTab === "Board" ? (
            boardContent
          ) : sessionTab === "Trajectory" ? (
            <SessionBoundary label="Trajectory view" onReload={() => void refreshSelectedSession()}>
              <Trajectory
                key={`${session.goalId}:${trajectoryTarget?.nonce ?? "browse"}`}
                session={session}
                target={trajectoryTarget}
              />
            </SessionBoundary>
          ) : sessionTab === "Plan" ? (
            <GoalDetails
              session={session}
              tab="Plan"
              grants={toolGrants}
              grantsLoading={toolGrantsLoading}
              grantsError={toolGrantsError}
              revokingGrantId={revokingGrantId}
              onRevokeGrant={(grant) => void onRevokeToolGrant(grant)}
            />
          ) : (
            <>
              <div className="activity-filter">
                <label htmlFor="filter-execution-steps">
                  <input
                    id="filter-execution-steps"
                    name="showTools"
                    type="checkbox"
                    checked={showTools}
                    onChange={(event) => setShowTools(event.target.checked)}
                  />
                  Execution steps
                </label>
                <span>{session.messages.length} saved messages</span>
              </div>
              <SessionBoundary label="Activity view" onReload={() => void refreshSelectedSession()}>
              <div className="timeline-region">
                {isWaitingApprovalOrInput && !follow && (
                  <button
                    type="button"
                    className="floating-approval-guide"
                    aria-label="Scroll to pending approval form"
                    onClick={() => {
                      setFollow(true);
                      timeline.current?.scrollTo({
                        top: timeline.current.scrollHeight,
                        behavior: "smooth",
                      });
                    }}
                  >
                    <AlertCircle size={14} aria-hidden="true" />
                    <span>
                      {session.interaction?.kind === "task_approval"
                        ? "Awaiting task approval · Click to review"
                        : session.interaction?.kind === "action_approval" || session.interaction?.kind === "action_recovery"
                        ? "Awaiting action approval · Click to review"
                        : "Awaiting your response · Click to reply"}
                    </span>
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                )}
                <div
                  className="timeline"
                  ref={timeline}
                  onScroll={(event) => {
                    const element = event.currentTarget;
                    setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 60);
                  }}
                >
                  {session.historyTruncated && (
                    <div className="history-note">Some session content is omitted.</div>
                  )}
                  {session !== null && pendingWindowData !== null && pendingWindowData.pendingMessages > 0 && (
                    <button
                      type="button"
                      className="history-expand"
                      onClick={handleExpandWindow}
                    >
                      See earlier messages · {pendingWindowData.omittedMessages} saved messages hidden in {pendingWindowData.pendingMessages} earlier run{pendingWindowData.pendingMessages === 1 ? "" : "s"}
                    </button>
                  )}
                  {session.messages.length === 0 && (
                    <div className="timeline-date">
                      <span />No saved messages<span />
                    </div>
                  )}
                  {renderMessages(
                    session.messages.filter(
                      (message) =>
                        message.runId === undefined ||
                        !session.runs.some((run) => run.runId === message.runId)
                    )
                  )}
                  {session.runs.slice(Math.max(0, session.runs.length - visibleRunCount)).map((run, runIndex, renderedRuns) => {
                    const runNumberOffset = session.runs.length - renderedRuns.length + 1;
                    const runMessages = session.messages.filter(
                      (message) => message.runId === run.runId
                    );
                    return (
                      <div className="run-timeline" key={run.runId}>
                        {renderMessages(runMessages.filter((message) => message.role === "user"))}
                        <PlanRouteList route={run.planRoute} />
                        {showTools && (() => {
                          const groups = activityProjections.get(run.runId) ?? [];
                          const stages = run.stages ?? [];
                          if (groups.length === 0 && stages.length === 0) return null;

                          const renderMember = (member: ReturnType<typeof projectActivityGroups>[number]["members"][number]) => {
                            const step = member.step;
                            return (
                              <article className="activity-member" key={member.id}>
                                <div className="activity-member-heading">
                                  <strong className="tool-activity-label">{member.label}</strong>
                                  {member.status !== "completed" && (
                                    <span className={`step-status ${member.status}`}>
                                      {member.status === "running" ? "In progress" : member.status}
                                    </span>
                                  )}
                                  {!member.isCommitted && <small>Temporary activity · Not saved yet</small>}
                                  {member.hasLiveUpdate && <small>Live update · Not saved yet</small>}
                                </div>
                                {member.inputSummary && (
                                  <div className="activity-member-input">{member.inputSummary}</div>
                                )}
                                {member.attempts.map((attempt, index) => (
                                  <div className="step-recovery" key={`${member.id}:attempt:${index}`}>
                                    {attempt}
                                  </div>
                                ))}
                                {step?.think && <section className="markdown-body" aria-label="Think analysis">
                                  <h4>Think goal</h4>
                                  <p>{step.think.goal}</p>
                                  <h4>Analysis</h4>
                                  {step.think.output !== undefined
                                    ? <AssistantMarkdown content={step.think.output} />
                                    : <p>{member.status === "failed" ? "Thinking stopped before an output was saved." : "Waiting for the saved Think output."}</p>}
                                  {step.think.truncated && <p>Some Think content is omitted. View the complete event in trajectory.</p>}
                                </section>}
                                {step?.bashExecution && (
                                  <div className="tool-execution">
                                    <div className="tool-execution-field">
                                      <span>Command</span>
                                      <pre>{step.bashExecution.command}</pre>
                                    </div>
                                    {step.bashExecution.exitCode !== undefined && (
                                      <div className="tool-execution-field">
                                        <span>Exit code</span>
                                        <pre>{step.bashExecution.exitCode}</pre>
                                      </div>
                                    )}
                                    {step.bashExecution.stdout !== undefined && (
                                      <div className="tool-execution-field">
                                        <span>stdout</span>
                                        <pre>{step.bashExecution.stdout || "(empty)"}</pre>
                                      </div>
                                    )}
                                    {step.bashExecution.stderr !== undefined && (
                                      <div className="tool-execution-field">
                                        <span>stderr</span>
                                        <pre>{step.bashExecution.stderr || "(empty)"}</pre>
                                      </div>
                                    )}
                                    {step.bashExecution.failure !== undefined && (
                                      <div className="tool-execution-field">
                                        <span>Result</span>
                                        <pre>{step.bashExecution.failure}</pre>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {step?.bashExecutionOmitted && <pre>Execution details omitted by the session size limit.</pre>}
                                {!step?.bashExecution && !step?.bashExecutionOmitted && member.summary && <pre>{member.summary}</pre>}
                                {step && (
                                  <footer className="trajectory-link">
                                    <button
                                      aria-label={`View Step ${step.stepIndex} in trajectory`}
                                      onClick={() => {
                                        setTrajectoryTarget({
                                          runId: run.runId,
                                          executionUnitId: step.executionUnitId,
                                          nonce: Date.now(),
                                        });
                                        setSessionTab("Trajectory");
                                      }}
                                    >
                                      <Layers size={13} />View in trajectory
                                      <ChevronRight size={12} />
                                    </button>
                                  </footer>
                                )}
                              </article>
                            );
                          };

                          const renderGroup = (group: ReturnType<typeof projectActivityGroups>[number]) => {
                            const ActivityIcon = group.category === "execute" ? Terminal
                              : group.category === "edit" ? FilePenLine
                                : group.category === "explore" ? Search : group.category === "think" ? Brain : Zap;
                            return (
                              <details className={`activity-group ${group.category} ${group.status}`} key={group.id}>
                                <summary>
                                  <ActivityIcon size={13} aria-hidden="true" />
                                  <span title={group.summary}>{group.summary}</span>
                                  {group.status !== "completed" && (
                                    <span className={`step-status ${group.status}`}>
                                      {group.status === "running" ? "In progress" : group.status}
                                    </span>
                                  )}
                                  <ChevronRight className="tool-chevron" size={12} aria-hidden="true" />
                                </summary>
                                <div className="activity-group-members">{group.members.map(renderMember)}</div>
                              </details>
                            );
                          };

                          if (stages.length > 0) {
                            const stageIds = new Set(stages.map((stage) => stage.stageId));
                            const runLevelGroups = groups.filter((group) => group.stageId === undefined || !stageIds.has(group.stageId));
                            return (
                              <div className="run-stages-container">
                                {runLevelGroups.length > 0 && (
                                  <details className="run-steps run-level-steps" open>
                                    <summary className="run-steps-heading">
                                      <Layers size={13} aria-hidden="true" />
                                      <span>Run-level activity</span>
                                      <ChevronDown className="activity-chevron" size={12} aria-hidden="true" />
                                    </summary>
                                    {runLevelGroups.map(renderGroup)}
                                  </details>
                                )}
                                {stages.map((stage) => (
                                  <details className="run-stage-group" key={stage.stageId} open>
                                    <summary className="run-stage-heading">
                                      <Layers size={13} aria-hidden="true" />
                                      <span className="stage-target">{stage.target}</span>
                                      <span className={`stage-status ${stage.status}`}>
                                        {renderStageStatusLabel(stage.status)}
                                      </span>
                                      {stage.revision > 1 && <span className="stage-revision">Rev {stage.revision}</span>}
                                      <ChevronDown className="activity-chevron" size={12} aria-hidden="true" />
                                    </summary>
                                    <div className="stage-content">
                                      {stage.latestReviewRejection && (
                                        <div className="stage-rejection-feedback" role="alert">
                                          <strong>Review feedback:</strong>
                                          {stage.latestReviewRejection.issues.map((issue, idx) => <p key={idx}>{issue}</p>)}
                                        </div>
                                      )}
                                      <div className="stage-steps">
                                        {groups.filter((group) => group.stageId === stage.stageId).map(renderGroup)}
                                      </div>
                                    </div>
                                  </details>
                                ))}
                              </div>
                            );
                          }

                          return (
                            <details className="run-steps" open>
                              <summary className="run-steps-heading">
                                <Layers size={13} aria-hidden="true" />
                                <span>{formatRunStepsTitle(run, runIndex + runNumberOffset)}</span>
                                <ChevronDown className="activity-chevron" size={12} aria-hidden="true" />
                              </summary>
                              {groups.map(renderGroup)}
                            </details>
                          );
                        })()}
                        {run.current && liveText && (
                          <article
                            className="message assistant transient-message"
                            aria-label="Uncommitted assistant activity"
                          >
                            <div className="message-heading">
                              <span className="message-avatar assistant">
                                <img src={brandMark} alt="" width={20} height={20} />
                              </span>
                              <strong>Live response</strong>
                              <small>Not saved yet</small>
                            </div>
                            <div className="message-body markdown-body">
                              <AssistantMarkdown content={liveText} />
                              <span className="cursor" />
                            </div>
                          </article>
                        )}
                        {run.current && run.status === "running" && (
                          <div className="live-status" aria-live="polite">
                            <span className="pulse" />
                            {liveActivity ?? "Runtime is working on this Goal"}
                            <span>
                              {streamConnected ? "Temporary activity" : "Live connection reconnecting"}
                            </span>
                          </div>
                        )}
                        {run.status === "completed" && (
                          <div className="completion">
                            <Check size={14} />Run completed
                          </div>
                        )}
                        {run.status === "failed" && (
                          <div className="run-failure-card" role="alert">
                            <div className="failure-card-header">
                              <AlertCircle size={15} aria-hidden="true" />
                              <strong>Run execution failed</strong>
                              {run.terminalDetail?.code && (
                                <span className="failure-code-badge">{run.terminalDetail.code}</span>
                              )}
                            </div>
                            <div className="failure-card-body">
                              <p className="failure-message">
                                {run.terminalDetail?.message ?? "This Run failed. Its saved trajectory and history are still available."}
                              </p>
                              <div className="failure-guidance">
                                <span>Send a message below to retry with adjusted instructions, provide more context, or start a new task.</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {run.status === "waiting" && run.terminalDetail && (
                          <div className="terminal-status">Waiting: {run.terminalDetail.message}</div>
                        )}
                        {run.status === "cancelled" && (
                          <div className="terminal-status">This Run was stopped.</div>
                        )}
                        {renderMessages(runMessages.filter((message) => message.role === "assistant"))}
                      </div>
                    );
                  })}
                </div>
                {!follow && (
                  <button
                    className="jump"
                    aria-label="Back to latest"
                    title="Back to latest"
                    onClick={() => setFollow(true)}
                  >
                    <ArrowDown size={17} aria-hidden="true" />
                  </button>
                )}
              </div>
              </SessionBoundary>
            </>
          )}

          {sessionTab !== "Board" && commandError && (
            <div className="command-error" role="alert">
              <span>{commandError}</span>
              {modelPreferenceRetry !== null && (
                <button type="button" onClick={() => void retryModelPreference()}>
                  Retry saving default
                </button>
              )}
              <button aria-label="Dismiss error" onClick={() => setCommandError(null)}>
                <X size={13} />
              </button>
            </div>
          )}

          {sessionTab !== "Board" && (
            <div className="composer-area">
              {sessionTab === "Activity" && decisionSummaries.length > 0 && (
                <div className="decision-summaries" aria-label="Saved interaction decisions">
                  {decisionSummaries.map((entry) => (
                    <div className="decision-summary" key={`${entry.runId}:${entry.interactionId}`}>
                      <Check size={13} aria-hidden="true" /> {entry.summary}
                    </div>
                  ))}
                </div>
              )}
              {queuedInputs.length > 0 && (
                <div className="queued-inputs" aria-label="Accepted queue">
                  <div className="queued-inputs-heading">Accepted queue · next Run order</div>
                  <ol>
                    {queuedInputs.map((item) => (
                      <li key={item.messageId}>{item.content}</li>
                    ))}
                  </ol>
                  <div className="queued-inputs-actions">
                    <button
                      type="button"
                      disabled={commandBusy || sessionError !== null}
                      onClick={() => void onClearQueue()}
                    >
                      Clear accepted queue
                    </button>
                  </div>
                  {queuePaused && (
                    <div className="queue-paused">
                      Queue paused. Continue when ready.
                      <button
                        type="button"
                        disabled={commandBusy || sessionError !== null}
                        onClick={() => void onContinueQueue()}
                      >
                        Continue queue
                      </button>
                    </div>
                  )}
                </div>
              )}
              {session.runStatus === "waiting" &&
                (session.interaction !== undefined || session.pendingAction !== undefined ? (
                  <>
                    <div className="composer-extra-controls">
                      {renderPermissionControl(true)}
                      <CurrentModelControl
                        label={currentModelName}
                        enabled={canSwitchCurrentModel && !commandBusy && sessionError === null}
                        onClick={() =>
                          setModelPickerTarget({
                            kind: "goal",
                            goalId: session.goalId,
                            runId: session.currentRunId,
                          })
                        }
                      />
                    </div>
                    <WaitingInteraction
                      session={session}
                      busy={commandBusy || (!draftSessionOpen && sessionError !== null)}
                      stopping={
                        stoppingRunId === session.currentRunId ||
                        (session.interruption !== undefined && session.interruption.status !== "finished")
                      }
                      onInterrupt={onInterrupt}
                      onRefreshSession={refreshSelectedSession}
                      onDecisionAccepted={(summary) => {
                        setDecisionSummaries((current) =>
                          current.some((entry) => entry.interactionId === summary.interactionId && entry.runId === summary.runId)
                            ? current
                            : [...current, summary]);
                      }}
                    />
                    {session.interaction !== undefined && (
                      <div className="queue-composer">
                        <p className="queue-note" id="queue-next-task-note">
                          Messages sent while this request is waiting are queued as the next task. They do not answer the
                          current request.
                        </p>
                        <MessageComposer
                          key={`${session.currentRunId}:queue`}
                          textareaLabel="Queue next task"
                          describedBy="queue-next-task-note"
                          showHint={true}
                          placeholder="Queue next task…"
                          busy={commandBusy || (!draftSessionOpen && sessionError !== null)}
                          onSubmit={onSubmitMessage}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <MessageComposer
                    key={session.currentRunId}
                    showHint={false}
                    busy={commandBusy || (!draftSessionOpen && sessionError !== null)}
                    placeholder="Give direction or ask a question…"
                    footerControls={
                      <>
                        {renderPermissionControl(true)}
                        <CurrentModelControl
                          label={currentModelName}
                          enabled={canSwitchCurrentModel && !commandBusy && sessionError === null}
                          onClick={() =>
                            setModelPickerTarget({
                              kind: "goal",
                              goalId: session.goalId,
                              runId: session.currentRunId,
                            })
                          }
                        />
                      </>
                    }
                    onSubmit={onSubmitMessage}
                  />
                ))}
              {sessionTab === "Trajectory" && canSendText && (
                <button
                  className="trajectory-message-link"
                  onClick={() => setSessionTab("Activity")}
                >
                  Message this Goal from Activity <ChevronRight size={14} />
                </button>
              )}
              {sessionTab !== "Trajectory" &&
                (session.runStatus === "completed" ||
                  session.runStatus === "failed" ||
                  session.runStatus === "cancelled") &&
                session.interaction === undefined &&
                session.pendingAction === undefined && (
                  <MessageComposer
                    key={`${session.currentRunId}:continue`}
                    showHint={false}
                    busy={commandBusy || (!draftSessionOpen && sessionError !== null)}
                    placeholder={
                      session.runStatus === "failed" || session.runStatus === "cancelled"
                        ? "Send a message to continue in a new Run…"
                        : "Continue this Goal with a new task…"
                    }
                    footerControls={
                      <>
                        {renderPermissionControl(true)}
                        <CurrentModelControl
                          label={currentModelName}
                          enabled={canSwitchCurrentModel && !commandBusy && sessionError === null}
                          onClick={() =>
                            setModelPickerTarget({
                              kind: "goal",
                              goalId: session.goalId,
                              runId: session.currentRunId,
                            })
                          }
                        />
                      </>
                    }
                    onSubmit={onSubmitMessage}
                  />
                )}
              {session.runStatus === "running" &&
                (session.execution?.state === "recoverable" ? (
                  <div className="composer-recover-row">
                    <div className="composer-extra-controls">
                      {renderPermissionControl(true)}
                      <CurrentModelControl
                        label={currentModelName}
                        enabled={false}
                        onClick={() => undefined}
                      />
                    </div>
                    <div className="composer-recover-actions">
                      <span className="composer-note">Execution paused or interrupted.</span>
                      <button
                        type="button"
                        className="primary"
                        disabled={commandBusy || sessionError !== null}
                        onClick={() => void onSubmitResume()}
                      >
                        {commandBusy ? "Resuming…" : "Resume Run"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <MessageComposer
                    key={session.currentRunId}
                    showHint={false}
                    busy={commandBusy || (!draftSessionOpen && sessionError !== null)}
                    running
                    placeholder="Add direction while this Run is working…"
                    pendingSteers={session.pendingSteers ?? []}
                    onSteer={onSubmitSteer}
                    onQueue={onSubmitMessage}
                    onInterrupt={onInterrupt}
                    stopping={
                      stoppingRunId === session.currentRunId ||
                      (session.interruption !== undefined &&
                        session.interruption.status !== "finished")
                    }
                    footerControls={
                      <>
                        {renderPermissionControl(true)}
                        <CurrentModelControl
                          label={currentModelName}
                          enabled={false}
                          onClick={() => undefined}
                        />
                      </>
                    }
                    onSubmit={onSubmitMessage}
                  />
                ))}
              {session.runStatus === "created" &&
                (session.execution?.state === "recoverable" ? (
                  <div className="composer-recover-row">
                    <div className="composer-extra-controls">
                      {renderPermissionControl(true)}
                      <CurrentModelControl
                        label={currentModelName}
                        enabled={false}
                        onClick={() => undefined}
                      />
                    </div>
                    <div className="composer-recover-actions">
                      <span className="composer-note">Run not yet active in this process.</span>
                      <button
                        type="button"
                        className="primary"
                        disabled={commandBusy || sessionError !== null}
                        onClick={() => void onSubmitResume()}
                      >
                        {commandBusy ? "Resuming…" : "Resume Run"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="composer-extra-controls">
                      {renderPermissionControl(true)}
                      <CurrentModelControl
                        label={currentModelName}
                        enabled={false}
                        onClick={() => undefined}
                      />
                    </div>
                    <div className="composer-note">The Runtime is starting this Goal.</div>
                  </>
                ))}
              {session.runStatus === "waiting" &&
                session.interaction === undefined &&
                session.pendingAction !== undefined &&
                session.pendingAction.status === "approved" && (
                  <>
                    <div className="composer-extra-controls">
                      {renderPermissionControl(true)}
                      <CurrentModelControl
                        label={currentModelName}
                        enabled={false}
                        onClick={() => undefined}
                      />
                    </div>
                    <div className="composer-note">The approved action is being recorded.</div>
                  </>
                )}
              <SessionMetricsBar state={metricsByGoal[session.goalId]} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
