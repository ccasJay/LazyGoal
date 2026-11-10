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
import { isActiveStatus, needsAttentionStatus, selectStageSectionPresentation, stageSectionIdentity } from "../stage-section-presentation";
import { Badge } from "./ui/badge";
import { cn } from "../ui-utils";
import { Trace, TraceLine, TraceIcon, TraceTitle, TraceDescription, TraceCollapsible, TraceCollapsibleTrigger, TraceCollapsibleContent } from "./ui/trace";
import type { ExecutionProgressEntry } from "../execution-progress";

type RenderableSessionMessage =
  | Extract<SessionTimelineEntry, { kind: "message" }>
  | Extract<SessionTimelineEntry, { kind: "candidate-preview" }>;

const SessionMessage = memo(function SessionMessage({
  entry,
  brandMark,
  laterAnswerId,
}: {
  readonly entry: RenderableSessionMessage;
  readonly brandMark: string;
  readonly laterAnswerId?: string;
}) {
  const isCandidate = entry.kind === "candidate-preview";
  const role = isCandidate ? "assistant" : entry.role;
  const assistantLabel = entry.kind === "candidate-preview" ? "LazyGoal"
    : entry.purpose === "process" ? "Progress"
      : entry.purpose === "notice" ? "Notice" : "LazyGoal";
  return (
    <article
      className={`message ${role}${isCandidate ? " transient-message candidate-message" : ""}`}
      id={`timeline-message-${encodeURIComponent(entry.itemId)}`}
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
        <small className="candidate-settlement-note">Preview incomplete.</small>
      )}
      {entry.kind === "candidate-preview" && entry.truncated && (
        <small className="candidate-settlement-note">Preview truncated.</small>
      )}
      {!isCandidate && entry.previewIssue === "official-text-differs" && (
        <small className="candidate-settlement-note">The saved answer differs from its preview.</small>
      )}
      {!isCandidate && entry.previewIssue === "preview-incomplete" && (
        <small className="candidate-settlement-note">The saved answer is shown; its preview was incomplete.</small>
      )}
      {laterAnswerId !== undefined && <Button variant="ghost" size="sm" type="button"
        onClick={() => document.getElementById(`timeline-message-${encodeURIComponent(laterAnswerId)}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
        View later answer <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
      </Button>}
    </article>
  );
});

/**
 * Goal 会话 Activity 单列视图的展示属性。
 *
 * @remarks
 * `olderAvailable` 提示固定页之前仍有来源；读取更早或更新来源仅通过调用方回调触发，不恢复执行。
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
  /** 是否显示独立技术事实与 Think；工具和检索摘要、异常及 Run／阶段边界始终保留，组内详情仍可展开。 */
  readonly showExecutionFacts: boolean;
  /** 当前安全状态摘要；不从未提交工具参数生成文案。 */
  readonly liveActivity: string | null;
  /** 当前连接实际观察的有界阶段变化；仅按真实执行单元或 Action 归入节点折叠内容，不充当已保存历史。 */
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

const technicalEventTypes = new Set([
  "action_staged",
  "action_approved",
  "action_revised",
  "tool_started",
  "tool_attempt_started",
  "tool_finished",
  "observation_recorded",
  "model_request_retry_recorded",
  "context_lookup_requested",
  "context_lookup_completed",
  "context_lookup_not_found",
]);

const failureEventTypes = new Set(["action_rejected", "tool_attempt_failed", "context_lookup_failed", "run_stage_rejected"]);

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
 * 动作组呈现，成功默认折叠，运行、失败与等待组默认展开。同一 Action 的授权、执行、重试
 * 与结果记录随成员详情折叠；等待审批的组仍显示明确的 `Awaiting approval`。真实阶段按服务端阶段上下文、声明
 * 或当前路线关联，不从工具类别生成阶段；阶段折叠与 Execution details 筛选仍保留异常活动。手动开合状态按组身份保存，
 * 追加内容、结算和 Execution details 筛选不覆盖用户选择；重新进入会话时恢复默认值。
 * 同一历史检索只显示一条可展开活动，未命中与失败分别标注；展开内容只用安全请求摘要、
 * 固定结果说明和白名单错误码。阶段及 Action 来源未全部加载时，折叠状态仍保留完整性提示。
 * 公开进度在匹配事件或工具步骤的折叠内容中显示；尚无已保存节点的真实执行单元形成临时步骤，
 * 不显示独立进度面板，未提供执行身份的事件不按相邻位置归属。
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
    .filter((item) => item.kind === "message" || item.kind === "fact" || item.kind === "activity" || item.kind === "lookup")
    .length;
  const answers = projection.items.filter((item): item is Extract<SessionTimelineEntry, { kind: "message" }> =>
    item.kind === "message" && item.role === "assistant" && item.purpose === "answer");
  const laterAnswers = new Map<string, string>();
  for (const answer of answers) {
    const later = answers.find(item => item.position.runOrder > answer.position.runOrder);
    if (later !== undefined) laterAnswers.set(answer.itemId, later.itemId);
  }
  const progressByItem = new Map<string, ExecutionProgressEntry[]>();
  const pendingSteps = new Map<string, ExecutionProgressEntry[]>();
  const progress = runStatus === "running" && newerItemCount === 0
    ? progressEntries.filter(entry => entry.runId === currentRunId) : [];
  for (const entry of progress) {
    if (entry.executionUnitId === undefined) continue;
    const activity = projection.items.find(item => item.kind === "activity" && item.runId === entry.runId
      && item.group.members.some(member => entry.actionId !== undefined
        ? member.actionId === entry.actionId : member.executionUnitId === entry.executionUnitId));
    const fact = [...projection.items].reverse().find(item => item.kind === "fact" && item.runId === entry.runId
      && item.executionUnitId === entry.executionUnitId
      && !["run_created", "run_started", "run_completed", "run_failed", "run_cancelled", "decision_received"].includes(item.eventType));
    const owner = activity ?? fact;
    const target = owner === undefined ? pendingSteps : progressByItem;
    const key = owner?.itemId ?? entry.executionUnitId;
    target.set(key, [...(target.get(key) ?? []), entry]);
  }
  const options = {
    currentRunId, currentPlanRoute: projection.currentPlanRoute, stages: projection.stages, actionGroups: projection.actionGroups, runStatus, liveActivity,
    streamConnected, showExecutionFacts, brandMark, expandedGroups, progressByItem,
    latestProgressId: progress.at(-1)?.id,
    onToggleGroup: toggleGroup, onOpenTrajectory, laterAnswers, onLoadEarlier, onLoadNewer,
    olderAvailable, newerItemCount,
  };
  const runs = projection.items.filter((item): item is Extract<SessionTimelineEntry, { kind: "run" }> => item.kind === "run");
  const stageProgress = (projection.currentPlanRoute?.stages ?? projection.stages.filter(stage => stage.runId === currentRunId && stage.target !== undefined))
    .filter(stage => stage.status === "executing" || stage.status === "accepted");
  const historicalStageProgress = projection.currentPlanRoute === undefined && newerItemCount > 0;
  const renderPendingSteps = () => pendingSteps.size > 0 && <Trace className="timeline-execution">{[...pendingSteps].map(([unitId, entries]) => (
    <TraceCollapsible key={unitId} defaultOpen className="timeline-fact" data-run-id={currentRunId} data-execution-unit-id={unitId}>
      <TraceCollapsibleTrigger className="timeline-step-trigger">
        <TraceLine status="running"><TraceIcon>{streamConnected ? <ActivitySnake /> : <Clock3 />}</TraceIcon><TraceTitle>{entries.at(-1)!.label}</TraceTitle></TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent><StepProgressDetails entries={entries} active={entries.at(-1)?.id === progress.at(-1)?.id} streamConnected={streamConnected} onOpenTrajectory={onOpenTrajectory} /></TraceCollapsibleContent>
    </TraceCollapsible>
  ))}</Trace>;

  return (
    <div className="session-timeline-feed" data-testid="session-timeline">
      {runs.length > 1 && <nav className="history-note" aria-label="Loaded runs">{runs.map(run =>
        <Button key={run.runId} variant="ghost" size="sm" type="button" onClick={() =>
          document.getElementById(`timeline-run-${encodeURIComponent(run.runId)}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          Run {run.position.runOrder + 1}
        </Button>)}</nav>}
      {runStatus === "running" && stageProgress.length > 0 && <div className="history-note" aria-label="Run progress">
        {projection.currentPlanRoute === undefined && <span>Stages in loaded activity:</span>}
        {stageProgress.filter(stage => stage.status === "executing").map(stage => <span key={stage.stageId}>{historicalStageProgress ? "Last recorded in progress" : "In progress"}: {stage.target}</span>)}
        {stageProgress.filter(stage => stage.status === "accepted").map(stage => <span key={stage.stageId}>{historicalStageProgress ? "Recorded as accepted" : "Accepted"}: {stage.target}</span>)}
      </div>}
      {olderAvailable && (
        <div className="history-note">
          <span>
            {olderItemCount > 0 ? `${olderItemCount} earlier items` : "Earlier activity"}
          </span>
          {onLoadEarlier !== undefined && (
            <Button variant="outline" size="sm" type="button" onClick={onLoadEarlier}>Load earlier activity</Button>
          )}
        </div>
      )}
      {unreadCount > 0 && (
        <div className="history-note history-unread" role="status">
          {unreadCount} new items
        </div>
      )}
      {runs.map(run => {
        const expanded = expandedRuns.get(run.runId) ?? run.runId === currentRunId;
        const entries = projection.items.filter(item => item.runId === run.runId && item.kind !== "run");
        const visible = expanded ? entries : entries.filter(item => item.kind === "message" && (item.role === "user" || item.purpose !== "process")
          || item.kind === "candidate-preview" || item.kind === "live-preview" || item.kind === "interaction");
        return <div className="timeline-run-block" id={`timeline-run-${encodeURIComponent(run.runId)}`} key={run.runId} data-run-id={run.runId}>
          <Collapsible open={expanded} onOpenChange={open => setExpandedRuns(current => new Map(current).set(run.runId, open))}>
            <CollapsibleTrigger asChild><Button variant="ghost" className={cn("timeline-run-summary", run.status)} data-item-id={run.itemId}>
              <ChevronRight data-icon="inline-start" className={cn(expanded && "rotate-90")} />
              <strong>Run {run.position.runOrder + 1}</strong>
              <Badge variant="outline" className={`timeline-run-status ${run.status}`}>{formatRunStatus(run.status)}</Badge>
              <span className="timeline-run-result">{run.detail?.message ?? (run.status === "failed" ? "Failure reason unavailable" : run.status === "completed" ? "Run finished; answer accuracy is not indicated" : run.runId === currentRunId ? "Current run" : "Execution history")}</span>
              {run.detail?.code && <code className="timeline-run-error-code">{run.detail.code}</code>}
            </Button></CollapsibleTrigger>
          <CollapsibleContent forceMount>
          {expanded && run.runId === currentRunId && <PlanRouteList route={projection.currentPlanRoute} />}
          {renderTimelineEntries(visible, options)}
          {expanded && run.runId === currentRunId && renderPendingSteps()}
          </CollapsibleContent>
          </Collapsible>
        </div>;
      })}
      {!projection.items.some(item => item.kind === "run") && <>{renderTimelineEntries(projection.items, options)}{renderPendingSteps()}</>}
      {savedContentCount === 0 && (
        <div className="timeline-date"><span />No saved activity in this window<span /></div>
      )}
      {newerItemCount > 0 && onLoadNewer !== undefined && (
        <div className="history-note">
          <span>{newerItemCount} newer items</span>
          <Button variant="ghost" size="sm" type="button" onClick={onLoadNewer}>Load newer activity</Button>
        </div>
      )}
    </div>
  );
}

function StepProgressDetails({ entries, active, streamConnected, onOpenTrajectory }: {
  readonly entries: readonly ExecutionProgressEntry[];
  readonly active: boolean;
  readonly streamConnected: boolean;
  readonly onOpenTrajectory: SessionTimelineProps["onOpenTrajectory"];
}) {
  const current = entries.at(-1)!;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  const seconds = Math.max(0, Math.floor((now - current.startedAt) / 1000));
  const elapsed = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const silent = active && streamConnected && (current.kind === "model_started" || current.kind === "assistant_text_delta")
    && now - current.lastObservedAt >= 60_000;
  return <div className="timeline-step-progress">
    {active && <p>{streamConnected ? current.detail : "Reconnecting. Showing the last observed operation."}</p>}
    {active && <small>{streamConnected ? "Connected" : "Disconnected"}, Last event {new Date(current.lastObservedAt).toLocaleTimeString("en-GB")}</small>}
    {active && <small title={current.hasSourceTime ? "Time since the model request started" : "Time since this event was observed"}>
      {current.hasSourceTime ? elapsed : `Observed ${elapsed}`}
    </small>}
    {silent && <p className="timeline-step-warning" role="status">No response update for 60 seconds. The Run is still waiting for the model; you can pause it below.</p>}
    <ol>{entries.map(entry => <li key={entry.id}>
      <span>{entry.label}</span>
      <time dateTime={new Date(entry.lastObservedAt).toISOString()}>{new Date(entry.lastObservedAt).toLocaleTimeString("en-GB")}</time>
      {entry.executionUnitId !== undefined && onOpenTrajectory !== undefined && <Button variant="ghost" size="sm"
        aria-label={`Inspect ${entry.label}`} onClick={() => onOpenTrajectory({ runId: entry.runId, executionUnitId: entry.executionUnitId! })}>
        <ArrowUpRight size={13} aria-hidden="true" />
      </Button>}
    </li>)}</ol>
  </div>;
}

type TimelineRenderOptions = {
    readonly currentRunId: string;
    readonly currentPlanRoute: BrowserPlanRoute | undefined;
    readonly stages: SessionTimelineProjection["stages"];
    readonly actionGroups: SessionTimelineProjection["actionGroups"];
    readonly runStatus: SessionTimelineProps["runStatus"];
    readonly liveActivity: string | null;
    readonly streamConnected: boolean;
    readonly showExecutionFacts: boolean;
    readonly brandMark: string;
    readonly expandedGroups: ReadonlyMap<string, boolean>;
    readonly progressByItem: ReadonlyMap<string, readonly ExecutionProgressEntry[]>;
    readonly latestProgressId: number | undefined;
    readonly onToggleGroup: (groupId: string, expanded: boolean) => void;
    readonly onOpenTrajectory: SessionTimelineProps["onOpenTrajectory"];
    readonly laterAnswers: ReadonlyMap<string, string>;
    readonly onLoadEarlier: SessionTimelineProps["onLoadEarlier"];
    readonly onLoadNewer: SessionTimelineProps["onLoadNewer"];
    readonly olderAvailable: boolean;
    readonly newerItemCount: number;
};


function renderCorrectionGroup(entries: readonly Extract<SessionTimelineEntry, { kind: "fact" }>[], options: TimelineRenderOptions) {
  const first = entries[0]!;
  return <TraceCollapsible key={`corrections:${first.itemId}`} className="timeline-fact" data-run-id={first.runId} data-item-id={first.itemId}>
    <TraceCollapsibleTrigger className="timeline-step-trigger"><TraceLine>
      <TraceIcon><span className="timeline-fact-dot" /></TraceIcon>
      <TraceTitle>Model output corrections</TraceTitle><TraceDescription>{entries.length} attempts recorded</TraceDescription>
    </TraceLine></TraceCollapsibleTrigger>
    <TraceCollapsibleContent><Trace>{entries.map(entry => renderEntry(entry, options))}</Trace></TraceCollapsibleContent>
  </TraceCollapsible>;
}

function correctionEnd(items: readonly SessionTimelineEntry[], start: number): number {
  const first = items[start];
  if (first?.kind !== "fact" || first.eventType !== "model_repair_feedback_recorded" || first.executionUnitId === undefined) return start + 1;
  let end = start + 1;
  while (end < items.length) {
    const next = items[end];
    if (next?.kind !== "fact" || next.eventType !== first.eventType || next.runId !== first.runId
      || next.executionUnitId !== first.executionUnitId || next.stageId !== first.stageId) break;
    end++;
  }
  return end;
}

function renderEntryList(items: readonly SessionTimelineEntry[], options: TimelineRenderOptions): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  for (let index = 0; index < items.length;) {
    const end = correctionEnd(items, index);
    nodes.push(end - index > 1
      ? renderCorrectionGroup(items.slice(index, end) as Extract<SessionTimelineEntry, { kind: "fact" }>[], options)
      : renderEntry(items[index]!, options));
    index = end;
  }
  return nodes;
}

function renderTimelineEntries(items: readonly SessionTimelineEntry[], options: TimelineRenderOptions) {
  const rendered: React.ReactNode[] = [];
  const stages = new Map<string, { title: string; revision?: number }>();
  const stageOutcomes = new Map<string, string>();
  const stageRevisions = new Map<string, Set<number>>();
  const unitStages = new Map<string, Set<string>>();
  const seenSections = new Set<string>();
  const loadOffered = new Set<string>();
  for (const entry of items) {
    if (entry.kind === "fact" && entry.stageId !== undefined
      && (entry.eventType === "run_stage_accepted" || entry.eventType === "run_stage_rejected")) {
      stageOutcomes.set(`${entry.runId}:${entry.stageId}:${entry.stageRevision ?? ""}`, entry.eventType);
    }
    if (entry.kind === "fact" && entry.stageId !== undefined && entry.stageRevision !== undefined) {
      const key = `${entry.runId}:${entry.stageId}`;
      const revisions = stageRevisions.get(key) ?? new Set<number>();
      revisions.add(entry.stageRevision);
      stageRevisions.set(key, revisions);
    }
    const stageId = entry.kind === "activity" ? entry.group.stageId
      : entry.kind === "fact" || entry.kind === "lookup" ? entry.stageId : undefined;
    const units = entry.kind === "activity" ? entry.group.members.map(member => member.executionUnitId)
      : entry.kind === "fact" || entry.kind === "lookup" ? [entry.executionUnitId] : [];
    if (stageId !== undefined) for (const unit of units) {
      if (unit === undefined) continue;
      const key = `${entry.runId}:${unit}`;
      const owned = unitStages.get(key) ?? new Set<string>();
      owned.add(stageId);
      unitStages.set(key, owned);
    }
  }
  for (const stage of options.currentPlanRoute?.stages ?? []) {
    stages.set(`${options.currentRunId}:${stage.stageId}`, { title: stage.target, revision: stage.revision });
  }
  for (const stage of options.stages) {
    if (stage.target !== undefined) stages.set(`${stage.runId}:${stage.stageId}`, { title: stage.target, revision: stage.revision });
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
    const context = options.stages.find(stage => stage.runId === entries[0]?.runId && stage.stageId === stageId);
    const contextStatus = context !== undefined && context.revision === revision ? context.status : undefined;
    const incomplete = context?.completeWithinPage === false;
    const sectionIdentity = stageSectionIdentity(entries[0]?.runId, stageId, revision);
    const continued = seenSections.has(sectionIdentity);
    seenSections.add(sectionIdentity);
    const presentation = selectStageSectionPresentation({
      entries,
      currentRunId: options.currentRunId,
      runStatus: options.runStatus,
      newerItemCount: options.newerItemCount,
      contextStatus,
      routeStage,
      outcome,
      continued,
    });
    const status = presentation.status;
    const attention = presentation.attention;
    const expanded = options.expandedGroups.get(key) ?? (presentation.animate || attention.length > 0);
    const detailId = `stage-detail-${encodeURIComponent(key)}`;
    const details = entries.filter((entry) => entry.kind !== "fact"
      || entry.eventType !== "run_stage_declared" && entry.eventType !== "run_stage_accepted"
        && (options.showExecutionFacts || entry.eventType !== "model_repair_feedback_recorded"));
    const showLoad = incomplete && !loadOffered.has(sectionIdentity);
    if (showLoad && (options.olderAvailable && options.onLoadEarlier !== undefined
      || options.newerItemCount > 0 && options.onLoadNewer !== undefined)) loadOffered.add(sectionIdentity);
    const hasDetails = details.length > 0 || showLoad && (options.olderAvailable && options.onLoadEarlier !== undefined
      || options.newerItemCount > 0 && options.onLoadNewer !== undefined);
    const activityCount = activities.reduce((count, entry) => count + entry.group.members.length, 0);
    const stageHeading = <TraceLine status={presentation.animate ? "running" : status === "attention" ? "error" : undefined}>
      <TraceIcon>
        {status === "attention" ? <CircleHelp /> : presentation.animate ? <ActivitySnake /> : status === "completed" ? <Check /> : <span className="timeline-fact-dot" />}
      </TraceIcon>
      <TraceTitle title={title}>{continued ? <><span className="sr-only">{title}: </span>Stage activity continued</> : title}</TraceTitle>
      {activityCount > 0 && <TraceDescription>{activityCount} {activityCount === 1 ? "activity" : "activities"}</TraceDescription>}
      <TraceDescription>{status === "attention" ? "Needs attention" : status === "completed" ? "Accepted" : status === "running" ? "In progress" : status === "rejected" ? "Stage revised" : "Recorded"}</TraceDescription>
      {incomplete && <TraceDescription>Details not fully loaded</TraceDescription>}
    </TraceLine>;
    rendered.push(
      <TraceCollapsible key={key} open={expanded} onOpenChange={open => options.onToggleGroup(key, open)} className={cn("timeline-stage", status)} data-stage-id={stageId}
        data-item-id={entries[0]?.itemId} data-run-id={entries[0]?.runId}>
        {hasDetails ? <TraceCollapsibleTrigger className="timeline-stage-heading" aria-expanded={expanded} aria-controls={detailId}>
          {stageHeading}
        </TraceCollapsibleTrigger> : stageHeading}
        <TraceCollapsibleContent><Trace className="timeline-stage-activities" id={detailId}>
          {showLoad && options.olderAvailable && options.onLoadEarlier !== undefined && <Button variant="ghost" size="sm" type="button" onClick={options.onLoadEarlier}>Load earlier activity</Button>}
          {showLoad && options.newerItemCount > 0 && options.onLoadNewer !== undefined && <Button variant="ghost" size="sm" type="button" onClick={options.onLoadNewer}>Load newer activity</Button>}
          {renderEntryList(details, { ...options, onLoadEarlier: undefined, onLoadNewer: undefined })}
        </Trace></TraceCollapsibleContent>
        {!expanded && attention.length > 0 && <Trace className="timeline-stage-activities">
          {attention.map((entry) => renderEntry(entry, { ...options, onLoadEarlier: undefined, onLoadNewer: undefined }))}
        </Trace>}
      </TraceCollapsible>,
    );
    section = undefined;
  };

  for (let index = 0; index < items.length; index++) {
    const entry = items[index]!;
    let stageId = entry.kind === "activity" ? entry.group.stageId
      : entry.kind === "fact" || entry.kind === "lookup" ? entry.stageId : undefined;
    if (stageId === undefined && entry.kind === "fact" && entry.eventType === "model_repair_feedback_recorded" && entry.executionUnitId !== undefined) {
      const owned = unitStages.get(`${entry.runId}:${entry.executionUnitId}`);
      if (owned?.size === 1) {
        const candidate = [...owned][0]!;
        if (section?.stageId === candidate && section.entries[0]?.runId === entry.runId
          && (stageRevisions.get(`${entry.runId}:${candidate}`)?.size ?? 0) <= 1) stageId = candidate;
      }
    }
    const stageKey = stageId === undefined ? undefined : `${entry.runId}:${stageId}`;
    if (entry.kind === "fact" && entry.eventType === "run_stage_declared" && stageKey !== undefined && entry.stageTarget !== undefined) {
      flush();
      stages.set(stageKey, { title: entry.stageTarget, ...(entry.stageRevision === undefined ? {} : { revision: entry.stageRevision }) });
    }
    const stage = stageKey === undefined ? undefined : stages.get(stageKey);
    if (stage === undefined || stageId === undefined) {
      flush();
      const end = correctionEnd(items, index);
      rendered.push(end - index > 1
        ? renderCorrectionGroup(items.slice(index, end) as Extract<SessionTimelineEntry, { kind: "fact" }>[], options)
        : renderEntry(entry, options));
      index = end - 1;
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
  const grouped: React.ReactNode[] = [];
  let trace: React.ReactNode[] = [];
  const flushTrace = () => {
    if (trace.length === 0) return;
    grouped.push(<Trace className="timeline-execution" key={`trace:${grouped.length}`}>{trace}</Trace>);
    trace = [];
  };
  for (const node of rendered) {
    if (React.isValidElement(node) && (node.type === TraceCollapsible || node.type === ActivityGroupRow)) trace.push(node);
    else if (node !== null) { flushTrace(); grouped.push(node); }
  }
  flushTrace();
  return grouped;
}

function renderEntry(item: SessionTimelineEntry, options: TimelineRenderOptions) {
  if (item.kind === "run") return null;

  if (item.kind === "message") return <SessionMessage key={item.presentationKey} entry={item} brandMark={options.brandMark} laterAnswerId={options.laterAnswers.get(item.itemId)} />;
  if (item.kind === "candidate-preview") return <SessionMessage key={item.presentationKey} entry={item} brandMark={options.brandMark} />;

  if (item.kind === "activity") {
    const attention = item.group.members.some(member => needsAttentionStatus(member.status));
    if (!options.showExecutionFacts && item.group.category === "think") return null;
    const expanded = options.expandedGroups.get(item.group.id) ?? (item.group.status !== "partial-failure" && attention || isActiveStatus(item.group.status));
    return (
      <ActivityGroupRow
        key={item.itemId}
        itemId={item.itemId}
        runId={item.runId}
        group={item.group}
        incomplete={item.group.members.some(member => options.actionGroups.some(context => context.runId === item.runId
          && context.actionId === member.actionId && !context.completeWithinPage))}
        expanded={expanded}
        onToggle={() => options.onToggleGroup(item.group.id, !expanded)}
        onOpenTrajectory={options.onOpenTrajectory}
        progress={options.progressByItem.get(item.itemId)}
        progressActive={options.progressByItem.get(item.itemId)?.at(-1)?.id === options.latestProgressId}
        streamConnected={options.streamConnected}
        onLoadEarlier={options.olderAvailable ? options.onLoadEarlier : undefined}
        onLoadNewer={options.newerItemCount > 0 ? options.onLoadNewer : undefined}
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

  if (item.kind === "lookup") {
    const expanded = options.expandedGroups.get(item.itemId) ?? item.status === "failed";
    const status = item.status === "not_found" ? "Not found"
      : item.status === "failed" ? "Failed" : item.status === "completed" ? "Completed" : "Requested";
    const summary = item.status === "not_found" ? "No matching records"
      : item.status === "failed" ? "The lookup could not be completed"
        : item.status === "completed" ? "Matching history found" : "Result not in loaded history";
    const detailId = `lookup-detail-${encodeURIComponent(item.itemId)}`;
    return <TraceCollapsible key={item.itemId} open={expanded} onOpenChange={open => options.onToggleGroup(item.itemId, open)}
      className={cn("timeline-fact", "timeline-lookup", item.status)} data-item-id={item.itemId} data-run-id={item.runId}>
      <TraceCollapsibleTrigger className="timeline-step-trigger" aria-expanded={expanded} aria-controls={detailId}>
        <TraceLine status={item.status === "failed" ? "error" : undefined}>
          <TraceIcon><span className="timeline-fact-dot" /></TraceIcon>
          <TraceTitle>Look up history</TraceTitle>
          <TraceDescription>{summary}</TraceDescription>
          <TraceDescription>{status}</TraceDescription>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent id={detailId}>
        <div className="timeline-fact-content">
          <span>Request: {item.request ?? (item.requestDetail === undefined ? "Request is outside the loaded history" : item.requestDetail)}</span>
          <span>Result: {status}</span>
          {item.resultDetail !== undefined && <span className="timeline-fact-detail">{item.resultDetail}</span>}
          {item.errorCode !== undefined && <code>{item.errorCode}</code>}
          {options.onOpenTrajectory !== undefined && item.executionUnitId !== undefined && <Button variant="ghost" size="sm"
            type="button" onClick={() => options.onOpenTrajectory?.({ runId: item.runId, executionUnitId: item.executionUnitId! })}>
            <ArrowUpRight data-icon="inline-start" aria-hidden="true" />View trajectory
          </Button>}
        </div>
      </TraceCollapsibleContent>
    </TraceCollapsible>;
  }

  if (item.kind === "fact") {
    if (["run_created", "run_started", "run_completed", "run_failed", "run_cancelled", "decision_received"].includes(item.eventType)) return null;
    if (!options.showExecutionFacts && technicalEventTypes.has(item.eventType)) return null;
    const lastProgress = options.progressByItem.get(item.itemId)?.at(-1);
    const correcting = item.eventType === "model_repair_feedback_recorded" && lastProgress?.id === options.latestProgressId
      && lastProgress?.kind === "model_started";
    return (
      <TraceCollapsible defaultOpen={failureEventTypes.has(item.eventType)} className={cn("timeline-fact", item.eventType)} key={item.itemId} data-item-id={item.itemId} data-run-id={item.runId} title="Saved activity">
        <TraceCollapsibleTrigger className="timeline-step-trigger">
          <TraceLine><TraceIcon><span className="timeline-fact-dot" /></TraceIcon><TraceTitle>{item.eventType === "model_repair_feedback_recorded" ? correcting ? "Retrying model response" : "Model output correction recorded" : item.title}</TraceTitle></TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          {item.detail !== undefined && <span className="timeline-fact-detail">{item.detail}</span>}
          {item.eventType === "run_stage_declared" && item.stageTarget !== undefined && <span className="timeline-stage-target">{item.stageTarget}</span>}
          {options.progressByItem.has(item.itemId) && <StepProgressDetails entries={options.progressByItem.get(item.itemId)!}
            active={options.progressByItem.get(item.itemId)?.at(-1)?.id === options.latestProgressId}
            streamConnected={options.streamConnected} onOpenTrajectory={options.onOpenTrajectory} />}
        </TraceCollapsibleContent>
      </TraceCollapsible>
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
 * 参数与 Observation 不进入此处。同一 Action 的授权、执行、重试与结果记录只在展开
 * 详情中显示；历史组保持折叠，等待审批的组保留醒目的 `Awaiting approval` 状态。
 *
 * @param props - 活动组身份、展开状态、可选的同组实时进度、连接状态与 Trajectory 定位回调。
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
  progress,
  progressActive = false,
  streamConnected = false,
  incomplete = false,
  onLoadEarlier,
  onLoadNewer,
}: {
  /** 已加载成员只覆盖 Action 的部分来源；折叠时仍提示详情不完整。 */
  readonly incomplete?: boolean;
  /** 只读加载更早或更新的活动页，不能保证一次加载补全该 Action。 */
  readonly onLoadEarlier?: () => void;
  readonly onLoadNewer?: () => void;
  readonly progress?: readonly ExecutionProgressEntry[];
  readonly progressActive?: boolean;
  readonly streamConnected?: boolean;
  readonly itemId: string;
  readonly runId: string;
  readonly group: ActivityGroup;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onOpenTrajectory: SessionTimelineProps["onOpenTrajectory"];
}) {
  const detailId = `activity-detail-${group.id.replace(/[^A-Za-z0-9_-]/gu, "-")}`;
  return (
    <TraceCollapsible open={expanded} onOpenChange={onToggle} className={cn("timeline-activity", group.status)} data-item-id={itemId} data-run-id={runId} data-group-id={group.id}>
      <TraceCollapsibleTrigger className="timeline-activity-heading" aria-expanded={expanded} aria-controls={detailId}>
        <TraceLine status={isActiveStatus(group.status) ? "running" : group.status === "failed" || group.status === "partial-failure" ? "error" : undefined}>
          <TraceIcon className="timeline-activity-marker">
            {group.status === "completed" ? <Check />
              : group.status === "failed" || group.status === "partial-failure" ? <CircleHelp />
                : group.status === "rejected" ? <X />
                  : group.status === "waiting" ? <Clock3 /> : <ActivitySnake />}
          </TraceIcon>
          <TraceTitle title={group.summary}>{group.summary}</TraceTitle>
          <TraceDescription className="timeline-activity-counts">{group.status === "partial-failure" ? `${group.counts.completed} succeeded / ${group.counts.failed} failed` : `${group.members.length} ${group.members.length === 1 ? "call" : "calls"}`}</TraceDescription>
        </TraceLine>
        <Badge variant="outline" className={cn("timeline-activity-status", group.status)}>{activityStatusLabel(group.status)}</Badge>
        {group.live === true && <span className="sr-only">Not saved yet</span>}
      </TraceCollapsibleTrigger>
      {incomplete && <div className="timeline-activity-outcome"><span>Details not fully loaded</span>
        {onLoadEarlier !== undefined && <Button variant="ghost" size="sm" type="button" onClick={onLoadEarlier}>Load earlier activity</Button>}
        {onLoadNewer !== undefined && <Button variant="ghost" size="sm" type="button" onClick={onLoadNewer}>Load newer activity</Button>}
      </div>}
      {!expanded && group.members.some(member => needsAttentionStatus(member.status)) && (
        <p className="timeline-activity-alert">{group.members.find((member) => needsAttentionStatus(member.status))?.summary ?? activityStatusLabel(group.status)}</p>
      )}
      <TraceCollapsibleContent>
        <p className="timeline-activity-outcome">
          {group.counts.completed > 0 && <span>{group.counts.completed} succeeded</span>}
          {group.counts.failed > 0 && <span className="text-destructive">{group.counts.failed} failed</span>}
          {group.counts.rejected > 0 && <span>{group.counts.rejected} rejected</span>}
          {group.counts.waiting > 0 && <span>{group.counts.waiting} awaiting approval</span>}
          {group.live === true && <span>Not saved yet</span>}
        </p>
        {progress !== undefined && <StepProgressDetails entries={progress} active={progressActive} streamConnected={streamConnected} onOpenTrajectory={onOpenTrajectory} />}
        {group.members.some(member => member.lifecycle !== undefined && member.lifecycle.length > 0) && (
          <p className="timeline-activity-details-heading">Execution details</p>
        )}
        <ul className="timeline-activity-members" id={detailId}>
          {group.members.map((member) => (
            <li key={member.id} data-member-id={member.id} data-action-id={member.actionId ?? ""}>
              <div className="timeline-activity-member-copy">
                <span className="timeline-activity-member-label">
                  {member.think === undefined ? member.label : member.think.goal}
                </span>
                {member.toolId === "bash" && member.inputSummary !== undefined && (
                  <code className="timeline-activity-member-command">{member.inputSummary}</code>
                )}
                {member.toolId !== undefined && <code className="timeline-activity-member-tool">{member.toolId}</code>}
                {member.summary !== undefined && <small className="timeline-activity-member-summary">{member.summary}</small>}
              </div>
              <span className={`timeline-activity-member-status ${member.status}`} title={activityStatusLabel(member.status)}>
                {member.status === "completed" && <Check size={12} aria-hidden="true" />}
                <span>{activityStatusLabel(member.status)}</span>
              </span>
              {member.lifecycle !== undefined && member.lifecycle.length > 0 && (
                <ol className="timeline-activity-member-lifecycle" aria-label="Execution details">
                  {member.lifecycle.map((lifecycle, index) => (
                    <li key={`${member.id}:lifecycle:${index}`} data-kind={lifecycle.kind}>
                      <span>{lifecycle.title}</span>
                      {lifecycle.detail !== undefined && <small>{lifecycle.detail}</small>}
                    </li>
                  ))}
                </ol>
              )}
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
              {member.lifecycle === undefined && member.attempts.map((attempt) => (
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
      </TraceCollapsibleContent>
    </TraceCollapsible>
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
  if (status === "generating") return "Draft answer, generating";
  if (status === "pending-verification") return "Checking whether this answer was saved";
  return "Draft answer, not saved";
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
