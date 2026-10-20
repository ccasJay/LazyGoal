import { memo } from "react";
import { Check, CircleHelp, X } from "lucide-react";
import type {
  BrowserPlanRoute,
  BrowserRunStatus,
} from "../../../../packages/web-contracts/src/index";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { PlanRouteList } from "./PlanRouteList";
import type { SessionTimelineEntry, SessionTimelineProjection } from "../session-timeline";

const SessionMessage = memo(function SessionMessage({
  entry,
  brandMark,
}: {
  readonly entry: Extract<SessionTimelineEntry, { kind: "message" }>;
  readonly brandMark: string;
}) {
  const assistantLabel = entry.purpose === "process" ? "Progress" : entry.purpose === "notice" ? "Notice" : "LazyGoal";
  return (
    <article className={`message ${entry.role}`} data-item-id={entry.itemId} data-run-id={entry.runId}>
      <div className="message-heading">
        <span className={`message-avatar ${entry.role}`}>
          {entry.role === "user" ? "You" : <img src={brandMark} alt="" width={20} height={20} />}
        </span>
        <strong>{entry.role === "user" ? "You" : assistantLabel}</strong>
        {entry.role === "assistant" && entry.purpose === "process" && <small>Process update</small>}
      </div>
      <div className={`message-body ${entry.role === "assistant" ? "markdown-body" : ""}`}>
        {entry.role === "assistant" ? <AssistantMarkdown content={entry.content} /> : entry.content}
      </div>
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
  /** 当前 Goal SSE 是否已连接。 */
  readonly streamConnected: boolean;
  /** 由 Goal Board 装配提供的品牌图标 URL。 */
  readonly brandMark: string;
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
 * 不改变 Run 状态。Plan 路线只显示在当前 Run 边界，旧页缺口仍明确提示。
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
  brandMark,
}: SessionTimelineProps) {
  const savedContentCount = projection.items.filter((item) => item.kind === "message" || item.kind === "fact").length;

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

  if (item.kind === "message") return <SessionMessage key={item.itemId} entry={item} brandMark={options.brandMark} />;

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

function formatRunStatus(status: string): string {
  if (status === "created") return "Starting";
  if (status === "running") return "Running";
  if (status === "waiting") return "Waiting";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Stopped";
  return "Pending";
}
