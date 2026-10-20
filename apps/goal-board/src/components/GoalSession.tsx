import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowDown,
  Check,
  ChevronRight,
  CircleHelp,
  X,
} from "lucide-react";
import type { BrowserGoalListItem, BrowserToolGrantSummary } from "../../../../packages/web-contracts/src/index";
import { GoalDetails, WaitingInteraction } from "../panels";
import type { AcceptedDecisionSummary } from "../interaction-panel";
import brandMark from "../assets/lazygoal/mark-on-light.svg?no-inline";
import { Trajectory } from "../trajectory";
import { sessionStatus, sessionStatusTone } from "../types";
import { useGoalSessionContext } from "../context/GoalSessionContext";
import { useRunControlContext } from "../context/RunControlContext";
import { MessageComposer, CurrentModelControl } from "./MessageComposer";
import { SessionMetricsBar } from "./SessionMetricsBar";
import { WorkspaceContext } from "./WorkspaceContext";
import { SessionBoundary } from "./error-boundary";
import { projectSessionTimeline } from "../session-timeline";
import { SessionTimeline } from "./SessionTimeline";
import { collectActivityProjections } from "../collect-activity-projections";
import type { ActivityGroup } from "../activity-projector";
import { queueClearScope } from "../session-controls";

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
    activityPage,
    fullSession,
    fullSessionLoading,
    fullSessionError,
    loadFullSession,
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
    candidatePresentation,
    expandCandidateDraft,
    releaseCandidateDraft,
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
    unverifiedSubmissions,
    onVerifySubmission,
    onRetrySubmission,
    onDiscardSubmission,
  } = useRunControlContext();

  const timeline = useRef<HTMLDivElement>(null);
  const followFrame = useRef<number | null>(null);
  const currentRun = activityPage?.runs.find((run) => run.current);
  const [draftNoticeDismissed, setDraftNoticeDismissed] = useState(false);
  const [decisionSummaries, setDecisionSummaries] = useState<readonly AcceptedDecisionSummary[]>([]);
  const [queueClearConfirm, setQueueClearConfirm] = useState(false);

  const projectionGoalKey = session?.goalId ?? null;
  useEffect(() => {
    setDraftNoticeDismissed(false);
  }, [draftModelCatalog?.defaultModelNotice]);

  // 切换 Goal 时清空页面级决定摘要：新会话不复用旧请求的决定记录。
  useEffect(() => {
    setDecisionSummaries([]);
    setQueueClearConfirm(false);
  }, [projectionGoalKey]);

  useEffect(() => () => {
    if (followFrame.current !== null) window.cancelAnimationFrame(followFrame.current);
  }, []);

  useEffect(() => {
    if (session !== null && (sessionTab === "Plan" || sessionTab === "Trajectory" || goalInfoOpen)) void loadFullSession();
  }, [session, sessionTab, goalInfoOpen, loadFullSession]);

  const isWaitingApprovalOrInput =
    session !== null &&
    session.runStatus === "waiting" &&
    (session.interaction !== undefined ||
      session.pendingAction?.status === "awaiting_approval" ||
      session.pendingAction?.status === "outcome_unknown");

  const activityGroups = useMemo(
    () => session === null || activityPage === null
      ? new Map<string, readonly ActivityGroup[]>()
      : collectActivityProjections(activityPage, session.goalId, liveEvents),
    [activityPage, session, liveEvents],
  );

  const timelineProjection = useMemo(
    () => session === null || activityPage === null
      ? { items: [], currentPlanRoute: undefined }
      : projectSessionTimeline(activityPage, session, activityGroups, liveText, candidatePresentation),
    [activityPage, session, activityGroups, liveText, candidatePresentation],
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
  }, [activityPage?.items, currentRun?.runId, liveText, candidatePresentation, follow]);

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
            {fullSession === null ? (
              <div className="session-empty" role={fullSessionError ? "alert" : undefined}>
                <p>{fullSessionLoading ? "Loading Goal details…" : fullSessionError ?? "Goal details are not loaded."}</p>
                {!fullSessionLoading && <button className="secondary" onClick={() => void loadFullSession()}>Load Goal details</button>}
              </div>
            ) : (
              <GoalDetails
                session={fullSession}
                tab="Details"
                grants={toolGrants}
                grantsLoading={toolGrantsLoading}
                grantsError={toolGrantsError}
                revokingGrantId={revokingGrantId}
                onRevokeGrant={(grant) => void onRevokeToolGrant(grant)}
                onDelete={activeGoal ? () => void onDeleteGoal?.(activeGoal) : undefined}
                deleteBusy={manageBusyId === fullSession.goalId}
              />
            )}
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
            fullSession === null ? (
              <div className="session-empty" role={fullSessionError ? "alert" : undefined}>
                <p>{fullSessionLoading ? "Loading Trajectory…" : fullSessionError ?? "Trajectory is not loaded."}</p>
                {!fullSessionLoading && <button className="secondary" onClick={() => void loadFullSession()}>Load Trajectory</button>}
              </div>
            ) : (
              <SessionBoundary label="Trajectory view" onReload={() => void refreshSelectedSession()}>
                <Trajectory
                  key={`${fullSession.goalId}:${trajectoryTarget?.nonce ?? "browse"}`}
                  session={fullSession}
                  target={trajectoryTarget}
                />
              </SessionBoundary>
            )
          ) : sessionTab === "Plan" ? (
            fullSession === null ? (
              <div className="session-empty" role={fullSessionError ? "alert" : undefined}>
                <p>{fullSessionLoading ? "Loading Plan…" : fullSessionError ?? "Plan is not loaded."}</p>
                {!fullSessionLoading && <button className="secondary" onClick={() => void loadFullSession()}>Load Plan</button>}
              </div>
            ) : (
              <GoalDetails
                session={fullSession}
                tab="Plan"
                grants={toolGrants}
                grantsLoading={toolGrantsLoading}
                grantsError={toolGrantsError}
                revokingGrantId={revokingGrantId}
                onRevokeGrant={(grant) => void onRevokeToolGrant(grant)}
              />
            )
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
                <span>{activityPage?.items.filter((item) => item.type === "message").length ?? 0} messages in this page</span>
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
                    {activityPage === null ? (
                      <div className="session-empty"><p>Loading Activity…</p></div>
                    ) : (
                      <SessionTimeline
                        projection={timelineProjection}
                        currentRunId={session.currentRunId}
                        runStatus={session.runStatus}
                        olderAvailable={activityPage.range.olderAvailable}
                        showExecutionFacts={showTools}
                        liveActivity={liveActivity}
                        streamConnected={streamConnected}
                        candidatePresentation={candidatePresentation}
                        onExpandCandidate={expandCandidateDraft}
                        onReleaseCandidate={releaseCandidateDraft}
                        onOpenTrajectory={(target) => {
                          setTrajectoryTarget({ ...target, nonce: Date.now() });
                          setSessionTab("Trajectory");
                        }}
                        brandMark={brandMark}
                      />
                    )}
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
                    {queueClearConfirm ? (
                      <>
                        <span className="queue-clear-confirm">
                          {queueClearScope(queuedInputs.length)}
                        </span>
                        <button
                          type="button"
                          className="primary"
                          disabled={commandBusy || sessionError !== null}
                          onClick={() => {
                            setQueueClearConfirm(false);
                            void onClearQueue();
                          }}
                        >
                          Clear queued tasks
                        </button>
                        <button type="button" onClick={() => setQueueClearConfirm(false)}>Keep queue</button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={commandBusy || sessionError !== null}
                        onClick={() => setQueueClearConfirm(true)}
                      >
                        Clear accepted queue
                      </button>
                    )}
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
              {unverifiedSubmissions.length > 0 && (
                <div className="unverified-submissions" aria-label="Unconfirmed submissions">
                  {unverifiedSubmissions.map((item) => (
                    <div className="unverified-submission" key={item.inputId} data-input-id={item.inputId}>
                      <span>
                        {item.kind === "steer" ? "Steer" : "Message"} result is unknown. Verify it before sending again.
                      </span>
                      <button
                        type="button"
                        disabled={commandBusy}
                        onClick={() => void onVerifySubmission(item.inputId)}
                      >
                        Verify
                      </button>
                      <button
                        type="button"
                        disabled={commandBusy}
                        onClick={() => void onRetrySubmission(item.inputId)}
                      >
                        Retry same input
                      </button>
                      <button type="button" onClick={() => onDiscardSubmission(item.inputId)}>Discard</button>
                    </div>
                  ))}
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
                          onInterrupt={onInterrupt}
                          stopping={
                            stoppingRunId === session.currentRunId ||
                            (session.interruption !== undefined && session.interruption.status !== "finished")
                          }
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
