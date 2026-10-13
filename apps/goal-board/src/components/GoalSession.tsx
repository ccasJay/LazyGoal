import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Layers,
  X,
  Zap,
} from "lucide-react";
import type {
  BrowserGoalListItem,
  BrowserSessionMessage,
  BrowserToolGrantSummary,
} from "../../../../packages/web-contracts/src/index";
import { GoalDetails, WaitingInteraction } from "../panels";
import { Trajectory } from "../trajectory";
import { sessionStatus } from "../types";
import { useGoalSessionContext } from "../context/GoalSessionContext";
import { useRunControlContext } from "../context/RunControlContext";
import { MessageComposer, AssistantMarkdown, CurrentModelControl } from "./MessageComposer";
import { SessionMetricsBar } from "./SessionMetricsBar";
import { WorkspaceContext } from "./WorkspaceContext";
import { stepActivity } from "./step-activity";

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
    onQueueInput,
    onContinueQueue,
    onSubmitMessage,
    onSubmitDraftMessage,
    onSubmitSteer,
    onInterrupt,
    onSubmitInteraction,
    onSubmitResume,
  } = useRunControlContext();

  const timeline = useRef<HTMLDivElement>(null);
  const currentRun = session?.runs.find((run) => run.current);

  useEffect(() => {
    if (follow && timeline.current) {
      timeline.current.scrollTop = timeline.current.scrollHeight;
    }
  }, [session?.messages, currentRun?.steps, liveText, follow]);

  function renderMessages(messages: readonly BrowserSessionMessage[]) {
    return messages.map((message, index) => (
      <article
        className={`message ${message.role}`}
        key={`${message.runId ?? "earlier"}:${index}:${message.role}`}
      >
        <div className="message-heading">
          <span className={`message-avatar ${message.role}`}>
            {message.role === "user" ? "You" : <Zap size={12} />}
          </span>
          <strong>{message.role === "user" ? "You" : "LazyGoal"}</strong>
        </div>
        <div className={`message-body ${message.role === "assistant" ? "markdown-body" : ""}`}>
          {message.role === "assistant" ? (
            <AssistantMarkdown content={message.content} />
          ) : (
            message.content
          )}
        </div>
      </article>
    ));
  }

  const sessionTabs = session?.goalPlan === undefined
    ? (["Board", "Activity", "Trajectory"] as const)
    : (["Board", "Activity", "Plan", "Trajectory"] as const);

  return (
    <section className="session">
      {goalInfoOpen && session && (
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
      )}

      {draftSessionOpen ? (
        <>
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
          {draftModelCatalog?.defaultModelNotice && (
            <div className="command-error" role="status">
              {draftModelCatalog.defaultModelNotice === "provider_changed"
                ? `Saved model belongs to a different provider. ${draftModelId === null ? "Choose an available model." : `Using configured default: ${draftModelName}.`}`
                : `Saved model is unavailable. ${draftModelId === null ? "Choose an available model." : `Using configured default: ${draftModelName}.`}`}
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
              busy={commandBusy}
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
      ) : sessionError ? (
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
              <span
                className={`task-state ${session.pendingAction?.status === "awaiting_approval" || session.pendingAction?.status === "outcome_unknown" || session.pendingInteraction ? "attention" : ""}`}
              >
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
            <Trajectory
              key={`${session.goalId}:${trajectoryTarget?.nonce ?? "browse"}`}
              session={session}
              target={trajectoryTarget}
            />
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
                <label>
                  <input
                    type="checkbox"
                    checked={showTools}
                    onChange={(event) => setShowTools(event.target.checked)}
                  />
                  Execution steps
                </label>
                <span>{session.messages.length} saved messages</span>
              </div>
              <div className="timeline-region">
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
                  {session.runs.map((run) => {
                    const runMessages = session.messages.filter(
                      (message) => message.runId === run.runId
                    );
                    return (
                      <div className="run-timeline" key={run.runId}>
                        {renderMessages(runMessages.filter((message) => message.role === "user"))}
                        {showTools && run.steps.length > 0 && (
                          <details className="run-steps" open>
                            <summary className="run-steps-heading">
                              <Layers size={13} aria-hidden="true" />
                              <span>{run.current ? "Execution activity" : "Earlier activity"}</span>
                              <ChevronDown className="activity-chevron" size={12} aria-hidden="true" />
                            </summary>
                            {run.steps.map((step) => {
                              const activity = stepActivity(step);
                              const ActivityIcon = activity.icon;
                              return (
                                <details className="tool-event" key={step.executionUnitId}>
                                  <summary>
                                    <ActivityIcon size={13} aria-hidden="true" />
                                    <span className="tool-activity-label" title={activity.label}>
                                      {activity.label}
                                    </span>
                                    {step.status !== "completed" && (
                                      <span className={`step-status ${step.status}`}>
                                        {step.status === "recorded"
                                          ? "Attempt recorded"
                                          : step.status}
                                      </span>
                                    )}
                                    <ChevronRight className="tool-chevron" size={12} aria-hidden="true" />
                                  </summary>
                                  <div className="tool-event-detail">
                                    {step.recoveryAttempts?.map((attempt, index) => (
                                      <div
                                        className="step-recovery"
                                        key={`${step.executionUnitId}:recovery:${index}`}
                                      >
                                        {attempt}
                                      </div>
                                    ))}
                                    {step.bashExecution && (
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
                                    {step.bashExecutionOmitted && (
                                      <pre>Execution details omitted by the session size limit.</pre>
                                    )}
                                    {!step.bashExecution &&
                                      !step.bashExecutionOmitted &&
                                      step.summary && <pre>{step.summary}</pre>}
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
                                  </div>
                                </details>
                              );
                            })}
                          </details>
                        )}
                        {run.current && liveText && (
                          <article
                            className="message assistant transient-message"
                            aria-label="Uncommitted assistant activity"
                          >
                            <div className="message-heading">
                              <span className="message-avatar assistant">
                                <Zap size={12} />
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
                          <div className="terminal-status failed">
                            {run.terminalDetail
                              ? `${run.terminalDetail.code ? `[${run.terminalDetail.code}] ` : ""}${run.terminalDetail.message}`
                              : "This Run failed. Its saved history is still available."}
                          </div>
                        )}
                        {run.status === "waiting" && run.terminalDetail && (
                          <div className="terminal-status">Waiting: {run.terminalDetail.message}</div>
                        )}
                        {run.status === "cancelled" && (
                          <div className="terminal-status">This Run was cancelled.</div>
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
              {queuedInputs.length > 0 && (
                <div className="queued-inputs" aria-label="Queued messages">
                  <div className="queued-inputs-heading">Queued messages · next Run order</div>
                  <ol>
                    {queuedInputs.map((item) => (
                      <li key={item.messageId}>{item.content}</li>
                    ))}
                  </ol>
                  {queuePaused && (
                    <div className="queue-paused">
                      Queue paused. Continue when ready.
                      <button
                        type="button"
                        disabled={commandBusy}
                        onClick={() => void onContinueQueue()}
                      >
                        Continue queue
                      </button>
                    </div>
                  )}
                </div>
              )}
              {session.runStatus === "waiting" &&
                (session.pendingInteraction !== undefined || session.pendingAction !== undefined ? (
                  <>
                    <div className="composer-extra-controls">
                      {renderPermissionControl(true)}
                      <CurrentModelControl
                        label={currentModelName}
                        enabled={canSwitchCurrentModel && !commandBusy}
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
                      busy={commandBusy}
                      onSubmit={(command) => void onSubmitInteraction(command)}
                    />
                  </>
                ) : (
                  <MessageComposer
                    key={session.currentRunId}
                    showHint={false}
                    busy={commandBusy}
                    placeholder="Give direction or ask a question…"
                    footerControls={
                      <>
                        {renderPermissionControl(true)}
                        <CurrentModelControl
                          label={currentModelName}
                          enabled={canSwitchCurrentModel && !commandBusy}
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
                session.pendingInteraction === undefined &&
                session.pendingAction === undefined && (
                  <MessageComposer
                    key={`${session.currentRunId}:continue`}
                    showHint={false}
                    busy={commandBusy}
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
                          enabled={canSwitchCurrentModel && !commandBusy}
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
                        disabled={commandBusy}
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
                    busy={commandBusy}
                    running
                    placeholder="Add direction while this Run is working…"
                    pendingSteers={session.pendingSteers ?? []}
                    onSteer={onSubmitSteer}
                    onQueue={onQueueInput}
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
                        disabled={commandBusy}
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
                session.pendingInteraction === undefined &&
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
