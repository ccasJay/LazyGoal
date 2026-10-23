import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { Button } from "./ui/button";
import React, { memo, useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowUpRight, Check, ChevronRight, CircleHelp, Clock3, X } from "lucide-react";
import type {
  BrowserPlanRoute,
  BrowserRunStatus,
} from "../../../../packages/web-contracts/src/index";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { PlanRouteList } from "./PlanRouteList";
import type { SessionTimelineEntry, SessionTimelineProjection } from "../session-timeline";
import type { ActivityGroup, ActivityGroupStatus, ActivityMemberStatus } from "../activity-projector";
import { Badge } from "./ui/badge";
import type { ExecutionProgressEntry } from "../execution-progress";

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
  /** 当前连接实际观察的有界阶段变化；不充当已保存历史。 */
  readonly progressEntries?: readonly ExecutionProgressEntry[];
  /** 当前 Goal SSE 是否已连接。 */
  readonly streamConnected: boolean;
  /** 由 Goal Board 装配提供的品牌图标 URL。 */
  readonly brandMark: string;
  /** 打开 Trajectory 并定位到成员的真实执行单元。 */
  readonly onOpenTrajectory?: (target: { readonly runId: string; readonly executionUnitId: string }) => void;
  /** 读取更早一页；只读，不恢复执行。 */
  readonly onLoadEarlier?: () => void;
  /** 读取更新一页；只读，不恢复执行。 */
  readonly onLoadNewer?: () => void;
  /** 当前页之前尚未读取的项数。 */
  readonly olderItemCount?: number;
  /** 当前页之后尚未读取的项数。 */
  readonly newerItemCount?: number;
  /** 未跟随时累计的新增项数。 */
  readonly unreadCount?: number;
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

function ActivitySnake({ className }: { readonly className?: string }) {
  return (
    <span className={`activity-snake-loader${className === undefined ? "" : ` ${className}`}`} aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <span
          className="activity-snake-pixel"
          key={index}
          style={{ "--snake-angle": `${index * 30}deg` } as CSSProperties}
        />
      ))}
    </span>
  );
}

/**
 * 按 Activity 服务端位置单列呈现会话来源。
 *
 * @remarks
 * 消息、事实和临时正文保留各自的稳定来源身份；状态为终态的 Run 才显示终态行，阶段事实
 * 不改变 Run 状态。Plan 路线只显示在当前 Run 边界，旧页缺口仍明确提示。工具活动以真实
 * 动作组呈现，成功默认折叠，运行、失败与等待组默认展开。真实阶段只按声明或当前路线关联，
 * 不从工具类别生成阶段；阶段折叠与 Execution steps 筛选仍保留异常活动。手动开合状态按组身份保存，
 * 追加内容、结算和 Execution steps 筛选不覆盖用户选择；重新进入会话时恢复默认值。
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
  progressEntries = [],
  streamConnected,
  brandMark,
  onOpenTrajectory,
  onLoadEarlier,
  onLoadNewer,
  olderItemCount = 0,
  newerItemCount = 0,
  unreadCount = 0,
}: SessionTimelineProps) {
  const [expandedGroups, setExpandedGroups] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [expandedRuns, setExpandedRuns] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const toggleGroup = useCallback((groupId: string, expanded: boolean) => {
    setExpandedGroups((current) => {
      const next = new Map(current);
      next.set(groupId, expanded);
      return next;
    });
  }, []);
  const savedContentCount = projection.items
    .filter((item) => item.kind === "message" || item.kind === "fact" || item.kind === "activity")
    .length;
  const options = {
    currentRunId, currentPlanRoute: projection.currentPlanRoute, runStatus, liveActivity,
    streamConnected, showExecutionFacts, brandMark, expandedGroups,
    onToggleGroup: toggleGroup, onOpenTrajectory,
  };
  const currentProgress = progressEntries.filter((entry) => entry.runId === currentRunId);
  const hasActiveGroup = showExecutionFacts && projection.items.some(item => item.kind === "activity" && item.runId === currentRunId && isActive(item.group.status));

  return (
    <div className="session-timeline-feed" data-testid="session-timeline">
      {olderAvailable && (
        <div className="history-note">
          <span>
            Earlier activity is outside this fixed page
            {olderItemCount > 0 ? ` (${olderItemCount} item(s) not loaded)` : ""}.
          </span>
          {onLoadEarlier !== undefined && (
            <Button variant="ghost" size="sm" type="button" onClick={onLoadEarlier}>Load earlier activity</Button>
          )}
        </div>
      )}
      {unreadCount > 0 && (
        <div className="history-note history-unread" role="status">
          {unreadCount} new item(s) arrived while you were reading.
        </div>
      )}
      {projection.items.filter(item => item.kind === "run").map(run => {
        if (run.kind !== "run") return null;
        const expanded = expandedRuns.get(run.runId) ?? run.runId === currentRunId;
        const entries = projection.items.filter(item => item.runId === run.runId && item.kind !== "run");
        const visible = expanded ? entries : entries.filter(item => item.kind === "message" && (item.role === "user" || item.purpose !== "process")
          || item.kind === "candidate-preview" || item.kind === "live-preview" || item.kind === "interaction");
        return <div className="timeline-run-block" key={run.runId} data-run-id={run.runId}>
          <Collapsible open={expanded} onOpenChange={open => setExpandedRuns(current => new Map(current).set(run.runId, open))}>
            <CollapsibleTrigger asChild><Button variant="ghost" className={`timeline-run-summary ${run.status}`} data-item-id={run.itemId}>
              <ChevronRight size={13} className={expanded ? "rotate-90" : ""} />
              <strong>Run {run.position.runOrder + 1}</strong>
              <Badge variant="outline" className={`timeline-run-status ${run.status}`}>{formatRunStatus(run.status)}</Badge>
              <span className="timeline-run-result">{run.detail?.message ?? (run.status === "failed" ? "Failure reason unavailable" : run.runId === currentRunId ? "Current run" : "Execution history")}</span>
              {run.detail?.code && <code className="timeline-run-error-code">{run.detail.code}</code>}
            </Button></CollapsibleTrigger>
          <CollapsibleContent forceMount>
          {expanded && run.runId === currentRunId && <PlanRouteList route={projection.currentPlanRoute} />}
          {renderTimelineEntries(visible, options)}
          </CollapsibleContent>
          </Collapsible>
        </div>;
      })}
      {!projection.items.some(item => item.kind === "run") && renderTimelineEntries(projection.items, options)}
      {newerItemCount === 0 && (runStatus === "running" && !hasActiveGroup || currentProgress.length > 0) && (
        <LiveExecutionProgress entries={currentProgress}
          active={runStatus === "running"} streamConnected={streamConnected} onOpenTrajectory={onOpenTrajectory} />
      )}
      {savedContentCount === 0 && (
        <div className="timeline-date"><span />No saved activity in this window<span /></div>
      )}
      {newerItemCount > 0 && onLoadNewer !== undefined && (
        <div className="history-note">
          <span>{newerItemCount} later item(s) are outside this fixed page.</span>
          <Button variant="ghost" size="sm" type="button" onClick={onLoadNewer}>Load newer activity</Button>
        </div>
      )}
    </div>
  );
}

function LiveExecutionProgress({ entries, active, streamConnected, onOpenTrajectory }: {
  readonly entries: readonly ExecutionProgressEntry[];
  readonly active: boolean;
  readonly streamConnected: boolean;
  readonly onOpenTrajectory: SessionTimelineProps["onOpenTrajectory"];
}) {
  const current = entries.at(-1);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  if (current === undefined) return <div className="timeline-working" role="status">
    <ActivitySnake />
    <span className="timeline-progress-copy"><strong>Waiting for execution events</strong>
      <small>{streamConnected ? "Connected. No current operation observed on this connection." : "Reconnecting to the execution stream."}</small>
    </span>
  </div>;
  const seconds = Math.max(0, Math.floor((now - current.startedAt) / 1000));
  const elapsed = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const silent = active && streamConnected && (current.kind === "model_started" || current.kind === "assistant_text_delta")
    && now - current.lastObservedAt >= 60_000;
  const renderRecent = (recent: readonly ExecutionProgressEntry[]) => <ol>{recent.map(entry => <li key={entry.id}>
    <span>{entry.label}{entry.kind === "tool_started" && <small className="timeline-progress-tool">{entry.detail}</small>}</span>
    <time dateTime={new Date(entry.lastObservedAt).toISOString()}>{new Date(entry.lastObservedAt).toLocaleTimeString("en-GB")}</time>
    {entry.executionUnitId !== undefined && onOpenTrajectory !== undefined && <Button variant="ghost" size="sm" type="button" className="timeline-progress-inspect"
      aria-label={`Inspect ${entry.label}`} onClick={() => onOpenTrajectory({ runId: entry.runId, executionUnitId: entry.executionUnitId! })}>
      <ArrowUpRight size={13} aria-hidden="true" />
    </Button>}
  </li>)}</ol>;
  return <div className="timeline-progress">
    <div className="timeline-working">
      {active && streamConnected ? <ActivitySnake /> : <Clock3 size={13} aria-hidden="true" />}
      <span className="timeline-progress-copy">
        <strong role="status">{active ? streamConnected ? current.label : "Reconnecting · last observed activity" : "Recent execution events"}</strong>
        {active && <small>{streamConnected ? current.detail : "Reconnecting. Showing the last observed operation."}</small>}
        {active && <small>{streamConnected ? "Connected" : "Disconnected"} · Last event {new Date(current.lastObservedAt).toLocaleTimeString("en-GB")}</small>}
        {silent && <small className="timeline-progress-warning" role="status">No new public response for 60 seconds. You can pause this Run from the composer.</small>}
      </span>
      {active && <small className="timeline-progress-elapsed" title={current.hasSourceTime ? "Time since the model request started" : "Time since this event was observed"}>
        {current.hasSourceTime ? elapsed : `Observed ${elapsed}`}
      </small>}
    </div>
    <div className="timeline-progress-history">
      <small>Recent live events from this connection</small>
      {renderRecent(entries.slice(-3))}
      {entries.length > 3 && <Collapsible>
        <CollapsibleTrigger className="text-xs py-2 text-muted-foreground">Show {entries.length - 3} earlier events</CollapsibleTrigger>
        <CollapsibleContent>{renderRecent(entries.slice(0, -3))}</CollapsibleContent>
      </Collapsible>}
    </div>
  </div>;
}

type TimelineRenderOptions = {
    readonly currentRunId: string;
    readonly currentPlanRoute: BrowserPlanRoute | undefined;
    readonly runStatus: SessionTimelineProps["runStatus"];
    readonly liveActivity: string | null;
    readonly streamConnected: boolean;
    readonly showExecutionFacts: boolean;
    readonly brandMark: string;
    readonly expandedGroups: ReadonlyMap<string, boolean>;
    readonly onToggleGroup: (groupId: string, expanded: boolean) => void;
    readonly onOpenTrajectory: SessionTimelineProps["onOpenTrajectory"];
};

function isActive(status: ActivityGroupStatus): boolean {
  return status === "running" || status === "retrying" || status === "pending-result";
}

function needsAttention(status: ActivityGroupStatus): boolean {
  return status === "failed" || status === "partial-failure" || status === "rejected" || status === "waiting";
}

function renderTimelineEntries(items: readonly SessionTimelineEntry[], options: TimelineRenderOptions) {
  const rendered: React.ReactNode[] = [];
  const stages = new Map<string, { title: string; revision?: number }>();
  const stageOutcomes = new Map<string, string>();
  for (const entry of items) {
    if (entry.kind === "fact" && entry.stageId !== undefined
      && (entry.eventType === "run_stage_accepted" || entry.eventType === "run_stage_rejected")) {
      stageOutcomes.set(`${entry.runId}:${entry.stageId}:${entry.stageRevision ?? ""}`, entry.eventType);
    }
  }
  for (const stage of options.currentPlanRoute?.stages ?? []) {
    stages.set(`${options.currentRunId}:${stage.stageId}`, { title: stage.target, revision: stage.revision });
  }
  let section: { key: string; title: string; stageId: string; revision?: number; entries: SessionTimelineEntry[] } | undefined;
  const flush = () => {
    if (section === undefined) return;
    const { key, title, stageId, revision, entries } = section;
    const activities = entries.filter((entry) => entry.kind === "activity");
    const routeStage = entries[0]?.runId === options.currentRunId
      ? options.currentPlanRoute?.stages.find((stage) => stage.stageId === stageId && stage.revision === revision)
      : undefined;
    const outcome = stageOutcomes.get(`${entries[0]?.runId}:${stageId}:${revision ?? ""}`);
    const accepted = routeStage?.status === "accepted" || outcome === "run_stage_accepted";
    const attention = entries.filter((entry) => entry.kind === "activity" ? entry.group.members.some(member => needsAttention(member.status))
      : !accepted && entry.kind === "fact" && entry.eventType === "run_stage_rejected" && outcome === "run_stage_rejected");
    const running = !accepted && entries[0]?.runId === options.currentRunId && options.runStatus === "running"
      && (routeStage?.status === "executing" || activities.some((entry) => isActive(entry.group.status)));
    const status = attention.length > 0 ? "attention" : accepted ? "completed" : running ? "running" : "recorded";
    const expanded = options.expandedGroups.get(key) ?? (running || attention.length > 0);
    const detailId = `stage-detail-${encodeURIComponent(key)}`;
    const details = entries.filter((entry) => entry.kind !== "fact"
      || entry.eventType !== "run_stage_declared" && entry.eventType !== "run_stage_accepted");
    const hasDetails = details.length > 0;
    const activityCount = activities.reduce((count, entry) => count + entry.group.members.length, 0);
    const stageHeading = <>
      <span className="timeline-activity-marker" aria-hidden="true">
        {status === "attention" ? <CircleHelp size={13} /> : running ? <ActivitySnake /> : accepted ? <Check size={13} /> : <span className="timeline-fact-marker" />}
      </span>
      <strong className="timeline-stage-target">{title}</strong>
      {activityCount > 0 && <small className="timeline-stage-count">{activityCount} {activityCount === 1 ? "activity" : "activities"}</small>}
      <span className="timeline-stage-status">{status === "attention" ? "Needs attention" : accepted ? "Accepted" : running ? "In progress" : "Recorded"}</span>
      {hasDetails && <ChevronRight className="timeline-activity-chevron" size={13} aria-hidden="true" />}
    </>;
    rendered.push(
      <Collapsible asChild key={key} open={expanded} onOpenChange={open => options.onToggleGroup(key, open)}><section className={`timeline-stage ${status}`} data-stage-id={stageId}
        data-item-id={entries[0]?.itemId} data-run-id={entries[0]?.runId}>
        {hasDetails ? <CollapsibleTrigger asChild><Button variant="ghost" size="sm" type="button" className="timeline-stage-heading" aria-expanded={expanded} aria-controls={detailId}>
          {stageHeading}
        </Button></CollapsibleTrigger> : <div className="timeline-stage-heading">{stageHeading}</div>}
        <CollapsibleContent asChild><div className="timeline-stage-activities" id={detailId}>
          {details.map((entry) => renderEntry(entry, options))}
        </div></CollapsibleContent>
        {!expanded && attention.length > 0 && <div className="timeline-stage-activities">
          {attention.map((entry) => renderEntry(entry, options))}
        </div>}
      </section></Collapsible>,
    );
    section = undefined;
  };

  for (const entry of items) {
    const stageId = entry.kind === "activity" ? entry.group.stageId : entry.kind === "fact" ? entry.stageId : undefined;
    const stageKey = stageId === undefined ? undefined : `${entry.runId}:${stageId}`;
    if (entry.kind === "fact" && entry.eventType === "run_stage_declared" && stageKey !== undefined && entry.stageTarget !== undefined) {
      flush();
      stages.set(stageKey, { title: entry.stageTarget, ...(entry.stageRevision === undefined ? {} : { revision: entry.stageRevision }) });
    }
    const stage = stageKey === undefined ? undefined : stages.get(stageKey);
    if (stage === undefined || stageId === undefined) {
      flush();
      rendered.push(renderEntry(entry, options));
      continue;
    }
    if (section?.stageId !== stageId || section.entries[0]?.runId !== entry.runId) {
      flush();
      section = { key: `stage:${entry.runId}:${stageId}:${stage.revision ?? ""}:${entry.itemId}`, title: stage.title, stageId,
        ...(stage.revision === undefined ? {} : { revision: stage.revision }), entries: [] };
    }
    section.entries.push(entry);
  }
  flush();
  return rendered;
}

function renderEntry(item: SessionTimelineEntry, options: TimelineRenderOptions) {
  if (item.kind === "run") return null;

  if (item.kind === "message") return <SessionMessage key={item.presentationKey} entry={item} brandMark={options.brandMark} />;
  if (item.kind === "candidate-preview") return <SessionMessage key={item.presentationKey} entry={item} brandMark={options.brandMark} />;

  if (item.kind === "activity") {
    const attention = item.group.members.some(member => needsAttention(member.status));
    if (!options.showExecutionFacts && !attention) return null;
    const expanded = options.expandedGroups.get(item.group.id) ?? (attention || isActive(item.group.status));
    return (
      <ActivityGroupRow
        key={item.itemId}
        itemId={item.itemId}
        runId={item.runId}
        group={item.group}
        expanded={expanded}
        onToggle={() => options.onToggleGroup(item.group.id, !expanded)}
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

  if (item.kind === "fact") {
    if (["run_created", "run_started", "run_completed", "run_failed", "run_cancelled", "decision_received"].includes(item.eventType)) return null;
    if (!options.showExecutionFacts && executionEventTypes.has(item.eventType) && item.detail === undefined) return null;
    return (
      <article className={`timeline-fact ${item.eventType}`} key={item.itemId} data-item-id={item.itemId} data-run-id={item.runId} title="Saved activity">
        <span className="timeline-fact-marker" aria-hidden="true" />
        <div className="timeline-fact-content">
          <strong>{item.title}</strong>
          {item.detail !== undefined && <span className="timeline-fact-detail">{item.detail}</span>}
          {item.eventType === "run_stage_declared" && item.stageTarget !== undefined && (
            <span className="timeline-stage-target">{item.stageTarget}</span>
          )}
        </div>
      </article>
    );
  }

  if (item.kind === "terminal") {
    return (
      <div className={`timeline-terminal ${item.status}`} key={item.itemId} data-item-id={item.itemId} data-run-id={item.runId}>
        {item.status === "completed" ? <Check size={14} aria-hidden="true" />
          : item.status === "failed" ? <CircleHelp size={14} aria-hidden="true" />
            : <X size={14} aria-hidden="true" />}
        <div className="timeline-terminal-copy">
          <span>{item.status === "completed" ? "Run completed" : item.status === "failed" ? "Run failed" : "Run stopped"}</span>
          {item.detail !== undefined && <p className="timeline-terminal-detail">
            {item.detail.code !== undefined && <code>{item.detail.code}: </code>}
            {item.detail.message}
          </p>}
        </div>
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
    </article>
  );
}

/**
 * 可展开的真实工具活动组。
 *
 * @remarks
 * 展开状态由调用方按组身份保存。运行与重试状态提供轻微动画，遵循系统减少动态效果设置；
 * 已完成状态以图标呈现并保留可访问名称。成员只显示既有安全摘要与真实来源身份，原始
 * 参数与 Observation 不进入此处。
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
    <Collapsible open={expanded} onOpenChange={onToggle} className={`timeline-activity ${group.status}`} data-item-id={itemId} data-run-id={runId} data-group-id={group.id}>
      <CollapsibleTrigger asChild>
      <Button variant="ghost" size="sm"
        type="button"
        className="timeline-activity-heading"
        aria-expanded={expanded}
        aria-controls={detailId}
      >
        <span className="timeline-activity-marker" aria-hidden="true">
          {group.status === "completed" ? <Check size={13} />
            : group.status === "failed" || group.status === "partial-failure" ? <CircleHelp size={13} />
              : group.status === "rejected" ? <X size={13} />
                : group.status === "waiting" ? <Clock3 size={13} /> : <ActivitySnake />}
        </span>
        <strong>{group.summary}</strong>
        <small className="timeline-activity-counts">{group.members.length} {group.members.length === 1 ? "call" : "calls"}
          {group.counts.completed > 0 && ` · ${group.counts.completed} succeeded`}
          {group.counts.failed > 0 && <span className="text-destructive"> · {group.counts.failed} failed</span>}
          {group.counts.rejected > 0 && ` · ${group.counts.rejected} rejected`}
          {group.counts.waiting > 0 && ` · ${group.counts.waiting} awaiting approval`}
        </small>
        <span className={`timeline-activity-status ${group.status}`}>{activityStatusLabel(group.status)}</span>
        {group.live === true && <small>Not saved yet</small>}
        <ChevronRight className="timeline-activity-chevron" size={13} aria-hidden="true" />
      </Button>
      </CollapsibleTrigger>
      {!expanded && group.members.some(member => needsAttention(member.status)) && (
        <p className="timeline-activity-alert">{group.members.find((member) => needsAttention(member.status))?.summary ?? activityStatusLabel(group.status)}</p>
      )}
      <CollapsibleContent>
        <ul className="timeline-activity-members" id={detailId}>
          {group.members.map((member) => (
            <li key={member.id} data-member-id={member.id} data-action-id={member.actionId ?? ""}>
              <div className="timeline-activity-member-copy">
                <span className="timeline-activity-member-label">
                  {member.think === undefined ? member.label : member.think.goal}
                </span>
                {member.toolId !== undefined && <code className="timeline-activity-member-tool">{member.toolId}</code>}
                {member.summary !== undefined && <small className="timeline-activity-member-summary">{member.summary}</small>}
              </div>
              <span className={`timeline-activity-member-status ${member.status}`} title={activityStatusLabel(member.status)}>
                {member.status === "completed" && <Check size={12} aria-hidden="true" />}
                <span>{activityStatusLabel(member.status)}</span>
              </span>
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
                <Button variant="ghost" size="sm"
                  type="button"
                  className="timeline-activity-trajectory"
                  aria-label={`Open trajectory for ${member.label}`}
                  title={`View trajectory for ${member.label}`}
                  onClick={() => onOpenTrajectory({ runId: member.runId, executionUnitId: member.executionUnitId! })}
                >
                  <ArrowUpRight size={13} aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function activityStatusLabel(status: ActivityGroupStatus): string {
  if (status === "partial-failure") return "Partially failed";
  if (status === "waiting") return "Awaiting approval";
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

function formatRunStatus(status: string): string {
  if (status === "created") return "Starting";
  if (status === "running") return "Running";
  if (status === "waiting") return "Waiting";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Stopped";
  return "Pending";
}
