import React, { memo, useCallback, useState } from "react";
import { Check, CircleHelp, X } from "lucide-react";
import type {
  BrowserPlanRoute,
  BrowserRunStatus,
} from "../../../../packages/web-contracts/src/index";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { PlanRouteList } from "./PlanRouteList";
import type { SessionTimelineEntry, SessionTimelineProjection } from "../session-timeline";
import type { SessionOutputDisplay } from "../session-output-consumer";
import type { ActivityGroup, ActivityMemberStatus } from "../activity-projector";

type RenderableSessionMessage =
  | Extract<SessionTimelineEntry, { kind: "message" }>
  | Extract<SessionTimelineEntry, { kind: "candidate-preview" }>;

const SessionMessage = memo(function SessionMessage({
  entry,
  brandMark,
}: {
  readonly entry: RenderableSessionMessage;
  readonly brandMark: string;
}) {
  const isCandidate = entry.kind === "candidate-preview";
  const role = isCandidate ? "assistant" : entry.role;
  const assistantLabel = entry.kind === "candidate-preview" ? "LazyGoal"
    : entry.purpose === "process" ? "Progress"
      : entry.purpose === "notice" ? "Notice" : "LazyGoal";
  return (
    <article
      className={`message ${role}${isCandidate ? " transient-message candidate-message" : ""}`}
      data-item-id={entry.itemId}
      data-run-id={entry.runId}
      data-presentation-key={entry.presentationKey}
    >
      <div className="message-heading">
        <span className={`message-avatar ${role}`}>
          {role === "user" ? "You" : <img src={brandMark} alt="" width={20} height={20} />}
        </span>
        <strong>{role === "user" ? "You" : assistantLabel}</strong>
        {!isCandidate && role === "assistant" && entry.purpose === "process" && <small>Process update</small>}
        {isCandidate && <small>{candidateStatusLabel(entry.status)}</small>}
      </div>
      <div className={`message-body ${role === "assistant" ? "markdown-body" : ""}`}>
        {role === "assistant" ? <AssistantMarkdown content={entry.content} /> : entry.content}
      </div>
      {entry.kind === "candidate-preview" && entry.missingPrefix && (
        <small className="candidate-settlement-note">Earlier candidate text is missing.</small>
      )}
      {entry.kind === "candidate-preview" && entry.truncated && (
        <small className="candidate-settlement-note">This candidate preview was truncated.</small>
      )}
      {!isCandidate && entry.previewIssue === "official-text-differs" && (
        <small className="candidate-settlement-note">The saved answer differs from its preview.</small>
      )}
      {!isCandidate && entry.previewIssue === "preview-incomplete" && (
        <small className="candidate-settlement-note">The saved answer is shown; its preview was incomplete.</small>
      )}
    </article>
  );
});

/**
 * Goal 会话 Activity 单列视图的展示属性。
 *
 * @remarks
 * `olderAvailable` 只提示固定页之前仍有来源，不触发读取；翻页交互属于后续历史窗口能力。
 *
 * @example
 * ```tsx
 * <SessionTimeline projection={projection} currentRunId={state.currentRunId} runStatus={state.runStatus}
 *   olderAvailable={page.range.olderAvailable} showExecutionFacts liveActivity={null} streamConnected
 *   candidatePresentation={outputDisplay} onExpandCandidate={() => {}} onReleaseCandidate={() => {}}
 *   brandMark={brandMark} />
 * ```
 */
export interface SessionTimelineProps {
  /** 已按稳定身份去重、位置排序的正文、事实、Run 边界与当前临时正文。 */
  readonly projection: SessionTimelineProjection;
  /** 窄状态 DTO 中的当前 Run 身份。 */
  readonly currentRunId: string;
  /** 窄状态 DTO 中的当前 Run 生命周期状态。 */
  readonly runStatus: BrowserRunStatus;
  /** 固定窗口之前是否还有可按 cursor 读取的来源。 */
  readonly olderAvailable: boolean;
  /** 是否显示工具与操作事实；阶段、Run 与终态边界始终保留。 */
  readonly showExecutionFacts: boolean;
  /** 当前安全状态摘要；不从未提交工具参数生成文案。 */
  readonly liveActivity: string | null;
  /** 当前 Goal SSE 是否已连接。 */
  readonly streamConnected: boolean;
  /** 当前候选、有限作废旧稿与释放状态。 */
  readonly candidatePresentation: SessionOutputDisplay;
  /** 设置唯一展开的旧稿；undefined 表示全部折叠。 */
  readonly onExpandCandidate: (presentationKey: string | undefined) => void;
  /** 释放旧稿正文并显示不可恢复提示。 */
  readonly onReleaseCandidate: (presentationKey: string) => void;
  /** 由 Goal Board 装配提供的品牌图标 URL。 */
  readonly brandMark: string;
  /** 打开 Trajectory 并定位到成员的真实执行单元。 */
  readonly onOpenTrajectory?: (target: { readonly runId: string; readonly executionUnitId: string }) => void;
}

const executionEventTypes = new Set([
  "action_staged",
  "action_approved",
  "action_revised",
  "action_rejected",
  "tool_started",
  "tool_attempt_started",
  "tool_attempt_failed",
  "tool_finished",
  "observation_recorded",
]);

/**
 * 按 Activity 服务端位置单列呈现会话来源。
 *
 * @remarks
 * 消息、事实和临时正文保留各自的稳定来源身份；状态为终态的 Run 才显示终态行，阶段事实
 * 不改变 Run 状态。Plan 路线只显示在当前 Run 边界，旧页缺口仍明确提示。工具活动以真实
 * 动作组呈现，展开状态由页面局部保存，追加内容不强制收起用户正在阅读的详情。
 *
 * @param props - 当前固定 Activity 页的来源投影与安全实时状态。
 * @returns 按稳定来源顺序排列的可滚动 feed。
 * @example
 * ```tsx
 * <SessionTimeline projection={projection} currentRunId={state.currentRunId} runStatus={state.runStatus}
 *   olderAvailable={page.range.olderAvailable} showExecutionFacts={showTools}
 *   liveActivity={liveActivity} streamConnected={streamConnected} brandMark={brandMark} />
 * ```
 */
export function SessionTimeline({
  projection,
  currentRunId,
  runStatus,
  olderAvailable,
  showExecutionFacts,
  liveActivity,
  streamConnected,
  candidatePresentation,
  onExpandCandidate,
  onReleaseCandidate,
  brandMark,
  onOpenTrajectory,
}: SessionTimelineProps) {
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);
  const savedContentCount = projection.items
    .filter((item) => item.kind === "message" || item.kind === "fact" || item.kind === "activity")
    .length;

  return (
    <div className="session-timeline-feed" data-testid="session-timeline">
      {olderAvailable && <div className="history-note">Earlier activity is outside this fixed page.</div>}
      {projection.items.map((item) => renderEntry(item, {
        currentRunId,
        currentPlanRoute: projection.currentPlanRoute,
        runStatus,
        liveActivity,
        streamConnected,
        showExecutionFacts,
        brandMark,
        candidatePresentation,
        onExpandCandidate,
        onReleaseCandidate,
        expandedGroups,
        onToggleGroup: toggleGroup,
        onOpenTrajectory,
      }))}
      {savedContentCount === 0 && (
        <div className="timeline-date"><span />No saved activity in this window<span /></div>
      )}
    </div>
  );
}

function renderEntry(
  item: SessionTimelineEntry,
  options: {
    readonly currentRunId: string;
    readonly currentPlanRoute: BrowserPlanRoute | undefined;
    readonly runStatus: SessionTimelineProps["runStatus"];
    readonly liveActivity: string | null;
    readonly streamConnected: boolean;
    readonly showExecutionFacts: boolean;
    readonly brandMark: string;
    readonly candidatePresentation: SessionOutputDisplay;
    readonly onExpandCandidate: SessionTimelineProps["onExpandCandidate"];
    readonly onReleaseCandidate: SessionTimelineProps["onReleaseCandidate"];
    readonly expandedGroups: ReadonlySet<string>;
    readonly onToggleGroup: (groupId: string) => void;
    readonly onOpenTrajectory: SessionTimelineProps["onOpenTrajectory"];
  },
) {
  if (item.kind === "run") {
    const isCurrent = item.runId === options.currentRunId;
    return (
      <section className={`timeline-run-boundary ${item.status}`} key={item.itemId} data-item-id={item.itemId} data-run-id={item.runId}>
        <div className="timeline-run-heading">
          <span className="timeline-run-marker" aria-hidden="true" />
          <strong>Run {item.position.runOrder + 1}</strong>
          <span className={`timeline-run-status ${item.status}`}>{formatRunStatus(item.status)}</span>
          {isCurrent && <span className="timeline-run-current">Current</span>}
        </div>
        {isCurrent && <PlanRouteList route={options.currentPlanRoute} />}
      </section>
    );
  }

  if (item.kind === "message") return <SessionMessage key={item.presentationKey} entry={item} brandMark={options.brandMark} />;
  if (item.kind === "candidate-preview") return <SessionMessage key={item.presentationKey} entry={item} brandMark={options.brandMark} />;

  if (item.kind === "activity") {
    if (!options.showExecutionFacts) return null;
    return (
      <ActivityGroupRow
        key={item.itemId}
        itemId={item.itemId}
        runId={item.runId}
        group={item.group}
        expanded={options.expandedGroups.has(item.group.id)}
        onToggle={() => options.onToggleGroup(item.group.id)}
        onOpenTrajectory={options.onOpenTrajectory}
      />
    );
  }

  if (item.kind === "interaction") {
    return (
      <article className="timeline-interaction" key={item.itemId} data-item-id={item.itemId} data-run-id={item.runId}>
        <span className="timeline-fact-marker" aria-hidden="true" />
        <div className="timeline-fact-content">
          <strong>{interactionLabel(item.interactionKind)}</strong>
        </div>
        <small>Reply below</small>
      </article>
    );
  }

  if (item.kind === "discarded-preview") {
    const expanded = options.candidatePresentation.expandedCandidateKey === item.presentationKey;
    const detailId = "old-draft-" + encodeURIComponent(item.presentationKey);
    return (
      <article className="discarded-candidate-draft" key={item.itemId} data-run-id={item.runId}>
        <div className="discarded-candidate-heading">
          <span>Not adopted</span>
          <small>{formatInvalidationReason(item.reason)}</small>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailId}
            onClick={() => options.onExpandCandidate(expanded ? undefined : item.presentationKey)}
          >
            {expanded ? "Hide old draft" : "Review old draft"}
          </button>
          <button type="button" onClick={() => options.onReleaseCandidate(item.presentationKey)}>Release draft</button>
        </div>
        {item.missingPrefix && <small className="candidate-settlement-note">Earlier candidate text is missing.</small>}
        {item.truncated && <small className="candidate-settlement-note">This candidate preview was truncated.</small>}
        {expanded && (
          <div id={detailId} className="message-body markdown-body">
            <AssistantMarkdown content={item.content} />
          </div>
        )}
      </article>
    );
  }

  if (item.kind === "discarded-notice") {
    return <div className="discarded-candidate-notice" key={item.itemId}>{item.content}</div>;
  }

  if (item.kind === "fact") {
    if (!options.showExecutionFacts && executionEventTypes.has(item.eventType)) return null;
    return (
      <article className={`timeline-fact ${item.eventType}`} key={item.itemId} data-item-id={item.itemId} data-run-id={item.runId}>
        <span className="timeline-fact-marker" aria-hidden="true" />
        <div className="timeline-fact-content">
          <strong>{item.title}</strong>
          {item.eventType === "run_stage_declared" && item.stageTarget !== undefined && (
            <span className="timeline-stage-target">{item.stageTarget}</span>
          )}
        </div>
        <small>Saved activity</small>
      </article>
    );
  }

  if (item.kind === "terminal") {
    return (
      <div className={`timeline-terminal ${item.status}`} key={item.itemId} data-item-id={item.itemId} data-run-id={item.runId}>
        {item.status === "completed" ? <Check size={14} aria-hidden="true" />
          : item.status === "failed" ? <CircleHelp size={14} aria-hidden="true" />
            : <X size={14} aria-hidden="true" />}
        <span>{item.status === "completed" ? "Run completed" : item.status === "failed" ? "Run failed" : "Run stopped"}</span>
      </div>
    );
  }

  return (
    <article className="message assistant transient-message" key={item.itemId} data-item-id={item.itemId} data-run-id={item.runId} aria-label="Uncommitted assistant activity">
      <div className="message-heading">
        <span className="message-avatar assistant"><img src={options.brandMark} alt="" width={20} height={20} /></span>
        <strong>Live response</strong>
        <small>Not saved yet</small>
      </div>
      <div className="message-body markdown-body">
        <AssistantMarkdown content={item.content} />
        <span className="cursor" />
      </div>
      {options.runStatus === "running" && item.runId === options.currentRunId && (
        <div className="live-status" aria-live="polite">
          <span className="pulse" />
          {options.liveActivity ?? "Runtime is working on this Goal"}
          <span>{options.streamConnected ? "Temporary activity" : "Live connection reconnecting"}</span>
        </div>
      )}
    </article>
  );
}

/**
 * 可展开的真实工具活动组。
 *
 * @remarks
 * 展开状态由页面局部保存；追加内容、阶段结算和刷新不会收起用户正在阅读的详情。成员只
 * 显示既有安全摘要与真实来源身份，原始参数与 Observation 不进入此处。
 *
 * @param props - 活动组身份、展开状态与 Trajectory 定位回调。
 * @returns 一个可展开的活动组行。
 * @example
 * ```tsx
 * <ActivityGroupRow itemId="activity:action:run-1:a1" runId="run-1" group={group} expanded={false} onToggle={() => {}} />
 * ```
 */
export function ActivityGroupRow({
  itemId,
  runId,
  group,
  expanded,
  onToggle,
  onOpenTrajectory,
}: {
  readonly itemId: string;
  readonly runId: string;
  readonly group: ActivityGroup;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onOpenTrajectory: SessionTimelineProps["onOpenTrajectory"];
}) {
  const detailId = `activity-detail-${group.id.replace(/[^A-Za-z0-9_-]/gu, "-")}`;
  return (
    <section className={`timeline-activity ${group.status}`} data-item-id={itemId} data-run-id={runId} data-group-id={group.id}>
      <button
        type="button"
        className="timeline-activity-heading"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className="timeline-activity-marker" aria-hidden="true" />
        <strong>{group.summary}</strong>
        <span className={`timeline-activity-status ${group.status}`}>{activityStatusLabel(group.status)}</span>
        {group.live === true && <small>Not saved yet</small>}
      </button>
      {expanded && (
        <ul className="timeline-activity-members" id={detailId}>
          {group.members.map((member) => (
            <li key={member.id} data-member-id={member.id} data-action-id={member.actionId ?? ""}>
              <span className="timeline-activity-member-label">
                {member.think === undefined ? member.label : member.think.goal}
              </span>
              <span className={`timeline-activity-member-status ${member.status}`}>{activityStatusLabel(member.status)}</span>
              {member.summary !== undefined && <small className="timeline-activity-member-summary">{member.summary}</small>}
              {member.think?.output !== undefined && (
                <div className="message-body markdown-body timeline-activity-member-think">
                  <AssistantMarkdown content={member.think.output} />
                </div>
              )}
              {member.think?.truncated === true && (
                <small className="timeline-activity-member-summary">Some Think content is omitted. View the complete event in trajectory.</small>
              )}
              {member.parentActionId !== undefined && (
                <small className="timeline-activity-member-origin">Child of {member.parentActionId}</small>
              )}
              {member.revisionRef !== undefined && (
                <small className="timeline-activity-member-origin">Revised as {member.revisionRef}</small>
              )}
              {member.recoveryRef !== undefined && (
                <small className="timeline-activity-member-origin">Recovery {member.recoveryRef}</small>
              )}
              {member.attempts.map((attempt) => (
                <small className="timeline-activity-member-attempt" key={attempt}>{attempt}</small>
              ))}
              {onOpenTrajectory !== undefined && member.executionUnitId !== undefined && (
                <button
                  type="button"
                  className="timeline-activity-trajectory"
                  aria-label={`Open trajectory for ${member.label}`}
                  onClick={() => onOpenTrajectory({ runId: member.runId, executionUnitId: member.executionUnitId! })}
                >
                  View trajectory
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function activityStatusLabel(status: ActivityMemberStatus): string {
  if (status === "running") return "Running";
  if (status === "retrying") return "Retrying";
  if (status === "pending-result") return "Result pending save";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return "Rejected";
}

function interactionLabel(kind: string): string {
  if (kind === "question") return "Question awaiting your response";
  if (kind === "task_approval") return "Plan awaiting your approval";
  if (kind === "action_recovery") return "Action result awaiting your decision";
  return "Action awaiting your approval";
}

function candidateStatusLabel(status: "generating" | "ready" | "pending-verification"): string {
  if (status === "generating") return "Draft answer · generating";
  if (status === "pending-verification") return "Checking whether this answer was saved";
  return "Draft answer · not saved";
}

function formatInvalidationReason(reason: string): string {
  if (reason === "rejected") return "Rejected";
  if (reason === "cancelled") return "Cancelled";
  if (reason === "failed") return "Generation failed";
  if (reason === "replaced") return "Replaced";
  return "Not adopted";
}

function formatRunStatus(status: string): string {
  if (status === "created") return "Starting";
  if (status === "running") return "Running";
  if (status === "waiting") return "Waiting";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Stopped";
  return "Pending";
}
