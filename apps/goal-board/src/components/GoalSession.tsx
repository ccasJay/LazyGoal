import { Button } from "./ui/button";
import { dispatchBrowserInput } from "../types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Input } from "./ui/input";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { captureAnchor, resolveAnchorScrollTop, FOLLOW_THRESHOLD_PX, type ActivityAnchor } from "../activity-page-window";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowDown,
  Check,
  CircleHelp,
  X,
} from "lucide-react";
import type { BrowserGoalListItem, BrowserPermissionExemptionSummary } from "../../../../packages/web-contracts/src/index";
import { GoalDetails, WaitingInteraction } from "../panels";
import type { AcceptedDecisionSummary } from "../interaction-panel";
import brandMark from "../assets/lazygoal/mark-on-light.svg?no-inline";
import { Trajectory } from "../trajectory";
import { selectUnverifiedWorkbenchActions, selectWorkbenchActions, workbenchReasonText } from "../workbench-actions";
import { selectConnectionPresentation } from "../connection-presentation";
import { useGoalSessionContext } from "../context/GoalSessionContext";
import { useRunControlContext } from "../context/RunControlContext";
import { MessageComposer, CurrentModelControl } from "./MessageComposer";
import { SessionMetricsBar } from "./SessionMetricsBar";
import { SessionBoundary } from "./error-boundary";
import { projectSessionTimeline } from "../session-timeline";
import { SessionTimeline } from "./SessionTimeline";
import { collectActivityProjections } from "../collect-activity-projections";
import type { ActivityGroup } from "../activity-projector";

function timelineOffsets(element: HTMLElement): ReadonlyMap<string, number> {
  const top = element.getBoundingClientRect().top;
  return new Map([...element.querySelectorAll<HTMLElement>("[data-item-id]")].map(item =>
    [item.dataset.itemId!, item.getBoundingClientRect().top - top + element.scrollTop]));
}

export function GoalSession({
  activeGoal,
  goals,
  draftText,
  onDraftTextChange,
  onSelectGoal,
  onViewGoals,
  boardContent,
  renderPermissionControl,
  onRevokeExemption,
  onDeleteGoal,
  manageBusyId,
}: {
  activeGoal?: BrowserGoalListItem;
  goals: readonly BrowserGoalListItem[];
  draftText: string;
  onDraftTextChange: React.Dispatch<React.SetStateAction<string>>;
  onSelectGoal: (goalId: string) => void;
  onViewGoals: () => void;
  boardContent: ReactNode;
  renderPermissionControl: (hasGoal: boolean) => ReactNode;
  onRevokeExemption: (exemption: BrowserPermissionExemptionSummary) => Promise<void>;
  onDeleteGoal?: (goal: BrowserGoalListItem) => Promise<void>;
  manageBusyId: string | null;
}) {
  const {
    session,
    activityPage,
    activityWindow,
    loadEarlierActivity,
    loadNewerActivity,
    jumpToLatestActivity,
    fullSession,
    fullSessionLoading,
    fullSessionError,
    loadFullSession,
    sessionLoading,
    sessionError,
    activityError,
    loadingEarlier,
    sessionTab,
    setSessionTab,
    trajectoryTarget,
    setTrajectoryTarget,
    follow,
    setFollow,
    goalInfoOpen,
    setGoalInfoOpen,
    exemptions,
    exemptionsLoading,
    exemptionsError,
    revokingExemptionId,
    livePreviews,
    liveActivity,
    progressEntries,
    liveEvents,
    candidatePresentation,
    streamConnected,
    streamSynced,
    stateStale,
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
    control,
    commandBusy,
    commandError,
    draftGoalBusy,
    setCommandError,
    stoppingRunId,
    onSubmitDraftMessage,
    onSubmitContinuation,
    compactSession,
    onInterrupt,
    onSubmitResume,
    onVerifyIntent,
    onRetryIntent,
    onDiscardIntent,
  } = useRunControlContext();

  /** 在会话输入框内先识别 Slash 命令，再决定是否作为普通消息提交。 */
  const submitSessionMessage = async (content: string): Promise<boolean> => {
    const dispatched = await dispatchBrowserInput(content);
    if (dispatched.kind === "error") {
      setCommandError(dispatched.message);
      return false;
    }
    if (dispatched.kind === "compact") {
      setContinuationText("");
      return compactSession();
    }
    return onSubmitContinuation(content);
  };

  const timeline = useRef<HTMLDivElement>(null);
  const workbench = selectWorkbenchActions({
    session,
    busy: commandBusy,
    connected: streamConnected,
    stale: stateStale,
    sessionUnreadable: sessionError !== null,
    canSendText: session?.continuation?.available === true,
    stopping: session !== null && stoppingRunId === session.currentRunId,
  });
  const unverifiedActions = selectUnverifiedWorkbenchActions(control.state.intents);
  const connection = selectConnectionPresentation({
    connected: streamConnected,
    synced: streamSynced,
    stale: stateStale,
  });
  const readingAnchor = useRef<ActivityAnchor | undefined>(undefined);
  const programmaticTop = useRef<number | undefined>(undefined);
  const previousScrollTop = useRef(0);
  const followFrame = useRef<number | null>(null);
  const currentRun = activityPage?.runs.find((run) => run.current);
  const [draftNoticeDismissed, setDraftNoticeDismissed] = useState(false);
  const [decisionSummaries, setDecisionSummaries] = useState<readonly AcceptedDecisionSummary[]>([]);
  const [confirmUnknownEffects, setConfirmUnknownEffects] = useState(false);
  const [continuationText, setContinuationText] = useState("");

  const projectionGoalKey = session?.goalId ?? null;
  useEffect(() => {
    setDraftNoticeDismissed(false);
  }, [draftModelCatalog?.defaultModelNotice]);

  // 切换 Goal 时清空页面级决定摘要：新会话不复用旧请求的决定记录。
  useEffect(() => {
    setDecisionSummaries([]);
    setConfirmUnknownEffects(false);
    setContinuationText("");
  }, [projectionGoalKey]);

  useEffect(() => () => {
    if (followFrame.current !== null) window.cancelAnimationFrame(followFrame.current);
  }, []);

  const sessionGoalId = session?.goalId;
  useEffect(() => {
    if (sessionGoalId !== undefined && (sessionTab === "Plan" || sessionTab === "Trajectory" || goalInfoOpen)) void loadFullSession();
  }, [sessionGoalId, sessionTab, goalInfoOpen, loadFullSession]);

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
      ? { items: [], stages: [], actionGroups: [], currentPlanRoute: undefined }
      : projectSessionTimeline(activityPage, session, activityGroups, livePreviews, candidatePresentation),
    [activityPage, session, activityGroups, livePreviews, candidatePresentation],
  );


  useLayoutEffect(() => {
    const element = timeline.current;
    if (element === null) return;
    const settle = () => {
      const move = (top: number) => {
        if (Math.abs(element.scrollTop - top) < 1) return;
        element.scrollTop = top;
        programmaticTop.current = element.scrollTop;
        previousScrollTop.current = element.scrollTop;
      };
      if (follow) move(element.scrollHeight);
      else {
        const top = resolveAnchorScrollTop(readingAnchor.current, timelineOffsets(element));
        if (top !== undefined) move(top);
      }
    };
    settle();
    const observer = new ResizeObserver(settle);
    const feed = element.querySelector(".session-timeline-feed");
    if (feed) observer.observe(feed);
    return () => observer.disconnect();
  }, [follow, timelineProjection, sessionTab]);

  useEffect(() => {
    if (follow && timeline.current && followFrame.current === null) {
      // 以帧为刻度合并滚动跳变，避免每个流式增量都同步读写布局值。
      followFrame.current = window.requestAnimationFrame(() => {
        followFrame.current = null;
        if (follow && timeline.current) {
          timeline.current.scrollTop = timeline.current.scrollHeight;
          previousScrollTop.current = timeline.current.scrollTop;
          programmaticTop.current = timeline.current.scrollTop;
        }
      });
    }
  }, [activityPage?.items, currentRun?.runId, livePreviews, candidatePresentation, follow]);

  return (
    <section className={`session${draftSessionOpen || sessionTab === "Activity" ? " session-activity" : ""}`}>
      {goalInfoOpen && session && (
        <Sheet open onOpenChange={open => { if (!open) setGoalInfoOpen(false); }}>
          <SheetContent showCloseButton={false} className="goal-info-panel" aria-describedby={undefined}>
            <header>
              <SheetTitle>Goal information</SheetTitle>
              <Button variant="ghost" size="sm"
                className="icon"
                aria-label="Close Goal information"
                onClick={() => setGoalInfoOpen(false)}
              >
                <X size={17} />
              </Button>
            </header>
            {fullSession === null ? (
              <div className="session-empty" role={fullSessionError ? "alert" : undefined}>
                <p>{fullSessionLoading ? "Loading Goal details…" : fullSessionError ?? "Goal details are not loaded."}</p>
                {!fullSessionLoading && <Button variant="ghost" size="sm" className="secondary" onClick={() => void loadFullSession()}>Load Goal details</Button>}
              </div>
            ) : (
              <GoalDetails
                session={fullSession}
                tab="Details"
                exemptions={exemptions}
                exemptionsLoading={exemptionsLoading}
                exemptionsError={exemptionsError}
                revokingExemptionId={revokingExemptionId}
                onRevokeExemption={(exemption) => void onRevokeExemption(exemption)}
                onDelete={activeGoal ? () => void onDeleteGoal?.(activeGoal) : undefined}
                deleteBusy={manageBusyId === fullSession.goalId}
              />
            )}
          </SheetContent>
        </Sheet>
      )}

      {draftSessionOpen ? (
        <>
          {sessionError && <div className="command-error" role="alert">
            <p>{sessionError}</p>
            <Button variant="ghost" size="sm" className="secondary" onClick={() => void refreshSelectedSession()}>Reload session</Button>
          </div>}
          <div className="timeline draft-timeline">
            <div className="timeline-date">
              <span />No saved messages<span />
            </div>
            {draftPlanMode && (
              <div className="session-intro">Plan Mode</div>
            )}
          </div>
          {commandError && (
            <div className="command-error" role="alert">
              <span>{commandError}</span>
              {draftGoalBusy && <Popover>
                <PopoverTrigger asChild><Button variant="outline" size="sm" type="button">View running Goals</Button></PopoverTrigger>
                <PopoverContent align="end" side="top" aria-label="Running Goals" className="running-goals-popover">
                  <strong>Running Goals</strong>
                  <p>These Goals are reported as running. Your draft will be kept while you browse.</p>
                  {goals.filter(goal => goal.runStatus === "running" && !goal.archived).map(goal =>
                    <Button variant="ghost" size="sm" type="button" key={goal.goalId} onClick={() => {
                      setCommandError(null);
                      onSelectGoal(goal.goalId);
                    }}>{goal.intent}</Button>)}
                  {!goals.some(goal => goal.runStatus === "running" && !goal.archived) && <p>No running Goals found in the current list.</p>}
                  <Button variant="ghost" size="sm" type="button" onClick={() => { setCommandError(null); onViewGoals(); }}>View all Goals</Button>
                </PopoverContent>
              </Popover>}
              <Button variant="ghost" size="sm" aria-label="Dismiss error" onClick={() => setCommandError(null)}>
                <X size={13} />
              </Button>
            </div>
          )}
          {draftModelCatalog?.defaultModelNotice && !draftNoticeDismissed && (
            <div className="command-notice" role="status">
              <span>
                {draftModelCatalog.defaultModelNotice === "provider_changed"
                  ? `Saved model belongs to a different provider. ${draftModelId === null ? "Choose an available model." : `Using configured default: ${draftModelName}.`}`
                  : `Saved model is unavailable. ${draftModelId === null ? "Choose an available model." : `Using configured default: ${draftModelName}.`}`}
              </span>
              <Button variant="ghost" size="sm" aria-label="Dismiss notice" onClick={() => setDraftNoticeDismissed(true)}>
                <X size={13} />
              </Button>
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
              <Button variant="ghost" size="sm" type="button" onClick={() => void loadDraftDefault(0)}>
                Retry
              </Button>
            </div>
          )}
          <div className="composer-area">
            <MessageComposer
              key="new-goal-draft"
              draftValue={draftText}
              onDraftChange={onDraftTextChange}
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
          <Button variant="ghost" size="sm" className="secondary" onClick={() => void refreshSelectedSession()}>
            Reload session
          </Button>
        </div>
      ) : session === null ? (
        <div className="session-empty">
          <p>Loading session…</p>
        </div>
      ) : (
        <>
          {sessionError && <div className="command-error" role="alert">
            <p>{sessionError}</p>
            <Button variant="ghost" size="sm" className="secondary" onClick={() => void refreshSelectedSession()}>Reload session</Button>
          </div>}
          {session.nextRunMode === "plan" && <div className="session-intro">Next Run: Plan Mode</div>}
          {connection.isOutdated && (
            <div className="state-stale" role="alert">
              {streamConnected ? "The saved state is being refreshed." : "The live connection dropped."}{" "}
              The last confirmed content is shown, but it may be outdated. New Steer
              and Resume actions stay unavailable until the state is re-read.
              <Button variant="ghost" size="sm" type="button" onClick={() => void refreshSelectedSession()}>Re-read state</Button>
            </div>
          )}
          {sessionTab === "Board" ? (
            boardContent
          ) : sessionTab === "Trajectory" ? (
            fullSession === null ? (
              <div className="session-empty" role={fullSessionError ? "alert" : undefined}>
                <p>{fullSessionLoading ? "Loading Trajectory…" : fullSessionError ?? "Trajectory is not loaded."}</p>
                {!fullSessionLoading && <Button variant="ghost" size="sm" className="secondary" onClick={() => void loadFullSession()}>Load Trajectory</Button>}
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
                {!fullSessionLoading && <Button variant="ghost" size="sm" className="secondary" onClick={() => void loadFullSession()}>Load Plan</Button>}
              </div>
            ) : (
              <GoalDetails
                session={fullSession}
                tab="Plan"
                exemptions={exemptions}
                exemptionsLoading={exemptionsLoading}
                exemptionsError={exemptionsError}
                revokingExemptionId={revokingExemptionId}
                onRevokeExemption={(exemption) => void onRevokeExemption(exemption)}
              />
            )
          ) : (
            <>
              <SessionBoundary label="Activity view" onReload={() => void refreshSelectedSession()}>
                <div className="timeline-region">
                  {isWaitingApprovalOrInput && !follow && (
                    <Button variant="ghost" size="sm"
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
                          ? "Awaiting task approval"
                          : session.interaction?.kind === "action_approval" || session.interaction?.kind === "action_recovery"
                          ? "Awaiting action approval"
                          : "Awaiting your response"}
                      </span>
                      <ArrowDown size={14} aria-hidden="true" />
                    </Button>
                  )}
                  <div
                    className="timeline"
                    ref={timeline}
                    onWheel={(event) => {
                      if (event.deltaY >= 0) return;
                      if (followFrame.current !== null) {
                        window.cancelAnimationFrame(followFrame.current);
                        followFrame.current = null;
                      }
                      readingAnchor.current = captureAnchor({ offsets: timelineOffsets(event.currentTarget), scrollTop: event.currentTarget.scrollTop });
                      setFollow(false);
                    }}
                    onScroll={(event) => {
                      const element = event.currentTarget;
                      const movedUp = element.scrollTop < previousScrollTop.current - 1;
                      previousScrollTop.current = element.scrollTop;
                      if (programmaticTop.current !== undefined && Math.abs(element.scrollTop - programmaticTop.current) < 1) {
                        programmaticTop.current = undefined;
                        return;
                      }
                      programmaticTop.current = undefined;
                      const following = !movedUp && element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_THRESHOLD_PX;
                      setFollow(following);
                      if (!following) {
                        readingAnchor.current = captureAnchor({ offsets: timelineOffsets(element), scrollTop: element.scrollTop });
                        if (element.scrollTop <= 80 && activityPage?.range.olderAvailable === true) void loadEarlierActivity();
                      }
                    }}
                    onClickCapture={event => {
                      if (event.target instanceof Element && event.target.closest("button[aria-expanded]")) {
                        const element = event.currentTarget;
                        readingAnchor.current = captureAnchor({ offsets: timelineOffsets(element), scrollTop: element.scrollTop });
                        if (element.scrollHeight > element.clientHeight) setFollow(false);
                      }
                    }}
                  >
                    {activityPage === null ? (
                      activityError === null ? (
                        <div className="session-empty"><p>Loading Activity…</p></div>
                      ) : (
                        <div className="session-empty" role="alert">
                          <CircleHelp size={24} />
                          <p>{activityError}</p>
                          <Button variant="ghost" size="sm" className="secondary" onClick={() => void refreshSelectedSession()}>
                            Reload activity
                          </Button>
                        </div>
                      )
                    ) : (
                      <SessionTimeline
                        projection={timelineProjection}
                        currentRunId={session.currentRunId}
                        runStatus={session.runStatus}
                        olderAvailable={activityPage.range.olderAvailable}
                        loadingEarlier={loadingEarlier}
                        showExecutionFacts={false}
                        liveActivity={liveActivity}
                        progressEntries={progressEntries}
                        streamConnected={connection.allowsNewDecisions}
                        onOpenTrajectory={(target) => {
                          setTrajectoryTarget({ ...target, nonce: Date.now() });
                          setSessionTab("Trajectory");
                        }}
                        onLoadEarlier={() => void loadEarlierActivity()}
                        onLoadNewer={() => void loadNewerActivity()}
                        olderItemCount={activityWindow.page?.gaps
                          .filter((gap) => gap.direction === "older")
                          .reduce((total, gap) => total + gap.itemCount, 0) ?? 0}
                        newerItemCount={activityWindow.page?.gaps
                          .filter((gap) => gap.direction === "newer")
                          .reduce((total, gap) => total + gap.itemCount, 0) ?? 0}
                        unreadCount={activityWindow.unread}
                        brandMark={brandMark}
                      />
                    )}
                  </div>
                  {!follow && (
                    <Button variant="ghost" size="sm"
                      className="jump"
                      aria-label="Jump to latest"
                      title="Jump to latest"
                      onClick={() => {
                        setFollow(true);
                        void jumpToLatestActivity();
                      }}
                    >
                      <ArrowDown size={17} aria-hidden="true" />Jump to latest{activityWindow.unread > 0 ? ` (${activityWindow.unread})` : ""}
                    </Button>
                  )}
                </div>
              </SessionBoundary>
            </>
          )}

          {sessionTab !== "Board" && commandError && (
            <div className="command-error" role="alert">
              <span>{commandError}</span>
              {modelPreferenceRetry !== null && (
                <Button variant="ghost" size="sm" type="button" onClick={() => void retryModelPreference()}>
                  Retry saving default
                </Button>
              )}
              <Button variant="ghost" size="sm" aria-label="Dismiss error" onClick={() => setCommandError(null)}>
                <X size={13} />
              </Button>
            </div>
          )}

          {sessionTab !== "Board" && sessionTab !== "Trajectory" && (
            <div className="composer-area">
              <div className="composer-extra-controls">{renderPermissionControl(true)}</div>
              {sessionTab === "Activity" && decisionSummaries.length > 0 && (
                <div className="decision-summaries" aria-label="Saved interaction decisions">
                  {decisionSummaries.map((entry) => (
                    <div className="decision-summary" key={`${entry.runId}:${entry.interactionId}`}>
                      <Check size={13} aria-hidden="true" /> {entry.summary}
                    </div>
                  ))}
                </div>
              )}
              {unverifiedActions.length > 0 && (
                <div className="unverified-submissions" aria-label="Unconfirmed submissions">
                  {unverifiedActions.map((item) => (
                    <div className="unverified-submission" key={item.intentId} data-intent-id={item.intentId}>
                      <span>{item.label} result is unknown. Verify it before retrying.</span>
                      <Button variant="ghost" size="sm" type="button" disabled={commandBusy}
                        onClick={() => void onVerifyIntent(item.intentId)}>Verify</Button>
                      <Button variant="ghost" size="sm" type="button" disabled={commandBusy}
                        onClick={() => void onRetryIntent(item.intentId)}>Retry same identity</Button>
                      <Button variant="ghost" size="sm" type="button" onClick={() => onDiscardIntent(item.intentId)}>Discard</Button>
                    </div>
                  ))}
                </div>
              )}
              {session.runStatus === "waiting" && (session.interaction !== undefined || session.pendingAction !== undefined) && (
                <>
                  <div className="composer-extra-controls">
                    <CurrentModelControl
                      label={currentModelName}
                      enabled={canSwitchCurrentModel && !commandBusy && sessionError === null}
                      onClick={() => setModelPickerTarget({ kind: "goal", goalId: session.goalId, runId: session.currentRunId })}
                    />
                  </div>
                  <WaitingInteraction
                    session={session}
                    busy={commandBusy || !connection.allowsNewDecisions || (!draftSessionOpen && sessionError !== null)}
                    stopping={stoppingRunId === session.currentRunId ||
                      (session.interruption !== undefined && session.interruption.status !== "finished")}
                    control={control}
                    onInterrupt={onInterrupt}
                    onRefreshSession={refreshSelectedSession}
                    onDecisionAccepted={(summary) => {
                      setDecisionSummaries((current) =>
                        current.some((entry) => entry.interactionId === summary.interactionId && entry.runId === summary.runId)
                          ? current
                          : [...current, summary]);
                    }}
                  />
                </>
              )}
              {session.runStatus === "waiting" && session.interaction === undefined && session.pendingAction === undefined && (
                <div className="composer-note">This Goal is waiting for runtime processing.</div>
              )}
              {session.runStatus === "running" && (
                <>
                  <div className="composer-extra-controls">
                    <CurrentModelControl label={currentModelName} enabled={false} onClick={() => undefined} />
                  </div>
                  {session.execution?.state === "recoverable" ? (
                    <div className="composer-recover-actions">
                      <span className="composer-note">The previous Worker stopped while this Run was active. Its last action may have had external effects.</span>
                      <Button variant="ghost" size="sm" type="button" className="primary"
                        disabled={!workbench.resume.available || commandBusy}
                        title={workbench.resume.available ? "Review and resume this Run" : workbenchReasonText(workbench.resume.reason)}
                        onClick={() => setConfirmUnknownEffects(true)}>
                        {commandBusy ? "Resuming…" : "Resume Run"}
                      </Button>
                    </div>
                  ) : (
                    <div className="composer-recover-actions">
                      <span className="composer-note">This Goal is running in a Worker.</span>
                      <Button variant="outline" size="sm" type="button"
                        disabled={!workbench.stop.available || commandBusy}
                        title={workbench.stop.available ? "Stop this Run" : workbenchReasonText(workbench.stop.reason)}
                        onClick={() => void onInterrupt()}>
                        {stoppingRunId === session.currentRunId ? "Stopping…" : "Stop Run"}
                      </Button>
                    </div>
                  )}
                </>
              )}
              {session.runStatus === "created" && (session.execution?.state === "recoverable" ? (
                <div className="composer-recover-row">
                  <div className="composer-extra-controls">
                    <CurrentModelControl label={currentModelName} enabled={false} onClick={() => undefined} />
                  </div>
                  <div className="composer-recover-actions">
                    <span className="composer-note">This Goal has not started in the current Worker.</span>
                    <Button variant="ghost" size="sm" type="button" className="primary"
                      disabled={!workbench.resume.available || commandBusy}
                      title={workbench.resume.available ? "Resume Run" : workbenchReasonText(workbench.resume.reason)}
                      onClick={() => void onSubmitResume(false)}>
                      {commandBusy ? "Resuming…" : "Resume Run"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="composer-note">The Runtime is starting this Goal.</div>
              ))}
              {session.runStatus === "waiting" && session.interaction === undefined
                && session.pendingAction?.status === "approved" && (
                  <div className="composer-note">The approved action is being recorded.</div>
                )}
              {session.continuation?.available === true && (
                <MessageComposer
                  key={`continuation-${session.currentRunId}`}
                  busy={commandBusy || !workbench.send_message.available}
                  placeholder="Continue this Goal with another message…"
                  textareaLabel="Continue this Goal"
                  showHint={false}
                  draftValue={continuationText}
                  onDraftChange={setContinuationText}
                  submitLabels={{ idle: "Send message", busy: "Sending message", empty: "Type a message to send" }}
                  footerControls={
                    <CurrentModelControl
                      label={currentModelName}
                      enabled={canSwitchCurrentModel && !commandBusy && sessionError === null && connection.allowsNewDecisions}
                      onClick={() => setModelPickerTarget({ kind: "goal", goalId: session.goalId, runId: session.currentRunId })}
                    />
                  }
                  onSubmit={submitSessionMessage}
                />
              )}
              <SessionMetricsBar state={metricsByGoal[session.goalId]} runStatus={session.runStatus} />
              <AlertDialog open={confirmUnknownEffects} onOpenChange={setConfirmUnknownEffects}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Resume this Run?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The previous Worker stopped while the Run was active. The saved checkpoint may not show whether its last action took effect. Continuing could repeat an external action.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction disabled={commandBusy} onClick={() => void onSubmitResume(true)}>
                      Resume and accept the risk
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </>
      )}
    </section>
  );
}
