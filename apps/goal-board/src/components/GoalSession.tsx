import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { Checkbox } from "./ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { captureAnchor, resolveAnchorScrollTop, FOLLOW_THRESHOLD_PX, type ActivityAnchor } from "../activity-page-window";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowDown,
  Check,
  ChevronRight,
  CircleHelp,
  CornerUpRight,
  Trash2,
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
  onRevokeToolGrant,
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
  onRevokeToolGrant: (grant: BrowserToolGrantSummary) => Promise<void>;
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
    progressEntries,
    liveEvents,
    candidatePresentation,
    streamConnected,
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
    canSendText,
    queuedInputs,
    queuePaused,
    onContinueQueue,
    onRemoveQueuedInput,
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
  const readingAnchor = useRef<ActivityAnchor | undefined>(undefined);
  const programmaticTop = useRef<number | undefined>(undefined);
  const followFrame = useRef<number | null>(null);
  const currentRun = activityPage?.runs.find((run) => run.current);
  const pendingSteers = session?.pendingSteers ?? [];
  const queueRevision = session?.queue?.revision ?? 0;
  const [draftNoticeDismissed, setDraftNoticeDismissed] = useState(false);
  const [decisionSummaries, setDecisionSummaries] = useState<readonly AcceptedDecisionSummary[]>([]);

  const projectionGoalKey = session?.goalId ?? null;
  useEffect(() => {
    setDraftNoticeDismissed(false);
  }, [draftModelCatalog?.defaultModelNotice]);

  // 切换 Goal 时清空页面级决定摘要：新会话不复用旧请求的决定记录。
  useEffect(() => {
    setDecisionSummaries([]);
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
      ? { items: [], stages: [], actionGroups: [], currentPlanRoute: undefined }
      : projectSessionTimeline(activityPage, session, activityGroups, liveText, candidatePresentation),
    [activityPage, session, activityGroups, liveText, candidatePresentation],
  );

  useLayoutEffect(() => {
    const element = timeline.current;
    if (element === null) return;
    const settle = () => {
      const move = (top: number) => {
        if (Math.abs(element.scrollTop - top) < 1) return;
        element.scrollTop = top;
        programmaticTop.current = element.scrollTop;
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
        }
      });
    }
  }, [activityPage?.items, currentRun?.runId, liveText, candidatePresentation, follow]);

  const sessionTabs = session?.goalPlan === undefined
    ? (["Board", "Activity", "Trajectory"] as const)
    : (["Board", "Activity", "Plan", "Trajectory"] as const);

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
                grants={toolGrants}
                grantsLoading={toolGrantsLoading}
                grantsError={toolGrantsError}
                revokingGrantId={revokingGrantId}
                onRevokeGrant={(grant) => void onRevokeToolGrant(grant)}
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
          <div className="session-tabs">
            <Tabs value={sessionTab} onValueChange={value => { setTrajectoryTarget(null); setSessionTab(value as typeof sessionTab); }}><TabsList className="session-tab-buttons">
              <TabsTrigger value="Activity">Activity</TabsTrigger>
            </TabsList></Tabs>
            <span className="stream-state">
              <span className="dot" />Local Runtime
            </span>
          </div>
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
          <div className="session-tabs">
            <Tabs value={sessionTab} onValueChange={value => { setTrajectoryTarget(null); setSessionTab(value as typeof sessionTab); }}><TabsList className="session-tab-buttons">
              {sessionTabs.map((tab) => (
                <TabsTrigger value={tab} onClick={() => { setTrajectoryTarget(null); setSessionTab(tab); }}
                  key={tab}
                  aria-pressed={sessionTab === tab}
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList></Tabs>
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
          {stateStale && (
            <div className="state-stale" role="status">
              The live connection dropped. The last confirmed content is shown, but it may be outdated. New Steer
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
                <div className="activity-filter-content">
                  <Label htmlFor="filter-execution-steps">
                    <Checkbox
                      id="filter-execution-steps"
                      name="showTools"
                      checked={showTools}
                      onCheckedChange={checked => setShowTools(checked === true)}
                    />
                    Execution details
                  </Label>
                  <span>{activityPage?.items.filter((item) => item.type === "message").length ?? 0} messages in this page</span>
                </div>
              </div>
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
                    onScroll={(event) => {
                      const element = event.currentTarget;
                      if (programmaticTop.current !== undefined && Math.abs(element.scrollTop - programmaticTop.current) < 1) {
                        programmaticTop.current = undefined;
                        return;
                      }
                      programmaticTop.current = undefined;
                      const following = element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_THRESHOLD_PX;
                      setFollow(following);
                      if (!following) readingAnchor.current = captureAnchor({ offsets: timelineOffsets(element), scrollTop: element.scrollTop });
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
                      <div className="session-empty"><p>Loading Activity…</p></div>
                    ) : (
                      <SessionTimeline
                        projection={timelineProjection}
                        currentRunId={session.currentRunId}
                        runStatus={session.runStatus}
                        olderAvailable={activityPage.range.olderAvailable}
                        showExecutionFacts={showTools}
                        liveActivity={liveActivity}
                        progressEntries={progressEntries}
                        streamConnected={streamConnected}
                        onOpenTrajectory={(target) => {
                          setTrajectoryTarget({ ...target, nonce: Date.now() });
                          setSessionTab("Trajectory");
                        }}
                        onLoadEarlier={() => void loadEarlierActivity()}
                        onLoadNewer={() => void loadNewerActivity()}
                        onContinueFailed={session.runStatus === "failed" ? () => void onSubmitMessage("Please continue the original task. Review the previous failure and proceed with the available context.") : undefined}
                        continueDisabled={commandBusy || stateStale || !canSendText || sessionError !== null}
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

          {sessionTab === "Trajectory" && canSendText && (
            <Button
              variant="ghost"
              size="sm"
              className="trajectory-message-link"
              onClick={() => setSessionTab("Activity")}
            >
              Message this Goal from Activity <ChevronRight size={14} />
            </Button>
          )}

          {sessionTab !== "Board" && sessionTab !== "Trajectory" && (
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
              {(queuedInputs.length > 0 || pendingSteers.length > 0 || queuePaused) && (
                <Collapsible className="queued-input-status" aria-label="Queued input status">
                  <CollapsibleTrigger>
                    <span className={`queue-status-dot${queuePaused ? " is-paused" : ""}`} aria-hidden="true" />
                    <strong>{queuePaused ? "Queue paused" : "Queue"}</strong>
                    <span className="queue-status-count">
                      {queuedInputs.length} queued{pendingSteers.length > 0 ? `, ${pendingSteers.length} Steer waiting` : ""}
                    </span>
                    {queuedInputs[0] !== undefined && (
                      <span className="queue-status-preview">{queuedInputs[0].content}</span>
                    )}
                    <ChevronRight className="queue-status-chevron" size={13} aria-hidden="true" />
                  </CollapsibleTrigger><CollapsibleContent>
                  <div className="queued-input-status-body">
                    {queuedInputs.map((item, index) => (
                      <article className="queued-input-item" key={item.messageId}>
                        <div className="queued-input-item-heading">
                          <span>Queued for Next Run</span>
                          <span className="queued-input-actions">
                            <Button variant="ghost" size="sm"
                              type="button"
                              aria-label={`Steer queued message ${index + 1} into the current Run`}
                              title="Steer this message into the current Run"
                              disabled={
                                commandBusy
                                || sessionError !== null
                                || stateStale
                                || session?.runStatus !== "running"
                                || (session.interruption !== undefined && session.interruption.status !== "finished")
                              }
                              onClick={() => void onSubmitSteer(item.content, {
                                messageId: item.messageId,
                                queueRevision,
                              })}
                            >
                              <CornerUpRight size={13} /> Steer
                            </Button>
                            <Button variant="ghost" size="sm"
                              type="button"
                              className="queued-input-delete"
                              aria-label={`Delete queued message ${index + 1}`}
                              title="Delete this queued message"
                              disabled={commandBusy || sessionError !== null}
                              onClick={() => void onRemoveQueuedInput(item.messageId)}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </span>
                        </div>
                        <p>{item.content}</p>
                      </article>
                    ))}
                    {pendingSteers.map((item) => (
                      <article className="queued-input-item is-steer" key={item.messageId}>
                        <div className="queued-input-item-heading">
                          <span>Steer: Waiting for next model call</span>
                        </div>
                        <p>{item.content}</p>
                      </article>
                    ))}
                    {queuePaused && (
                      <div className="queue-paused">
                        <span>Queue is paused.</span>
                        <Button variant="ghost" size="sm"
                          type="button"
                          disabled={commandBusy || sessionError !== null}
                          onClick={() => void onContinueQueue()}
                        >
                          Continue
                        </Button>
                      </div>
                    )}
                  </div>
                </CollapsibleContent></Collapsible>
              )}
              {unverifiedSubmissions.length > 0 && (
                <div className="unverified-submissions" aria-label="Unconfirmed submissions">
                  {unverifiedSubmissions.map((item) => (
                    <div className="unverified-submission" key={item.inputId} data-input-id={item.inputId}>
                      <span>
                        {item.kind === "steer" ? "Steer" : "Message"} result is unknown. Verify it before sending again.
                      </span>
                      <Button variant="ghost" size="sm"
                        type="button"
                        disabled={commandBusy}
                        onClick={() => void onVerifySubmission(item.inputId)}
                      >
                        Verify
                      </Button>
                      <Button variant="ghost" size="sm"
                        type="button"
                        disabled={commandBusy}
                        onClick={() => void onRetrySubmission(item.inputId)}
                      >
                        Retry same input
                      </Button>
                      <Button variant="ghost" size="sm" type="button" onClick={() => onDiscardSubmission(item.inputId)}>Discard</Button>
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
              {(session.runStatus === "completed" ||
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
              {session.runStatus === "running" && (
                <MessageComposer
                  key={session.currentRunId}
                  showHint={false}
                  busy={commandBusy || (!draftSessionOpen && sessionError !== null)}
                  sendDisabled={stateStale}
                  running={session.execution?.state !== "recoverable"}
                  recoverable={session.execution?.state === "recoverable"}
                  recoveryActionLabel={
                    session.interruption !== undefined && session.interruption.status !== "finished"
                      ? "Finish stopping"
                      : "Resume Run"
                  }
                  placeholder="Queue a message for the next Run…"
                  onInterrupt={onInterrupt}
                  onResume={onSubmitResume}
                  stopping={
                    stoppingRunId === session.currentRunId ||
                    (session.execution?.state !== "recoverable" &&
                      session.interruption !== undefined &&
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
              )}
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
                      <Button variant="ghost" size="sm"
                        type="button"
                        className="primary"
                        disabled={commandBusy || sessionError !== null || stateStale}
                        onClick={() => void onSubmitResume()}
                      >
                        {commandBusy ? "Resuming…" : "Resume Run"}
                      </Button>
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
              <SessionMetricsBar state={metricsByGoal[session.goalId]} runStatus={session.runStatus} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
