import type {
  BrowserPlanRouteStageState,
  BrowserRunStatus,
} from "../../../packages/web-contracts/src/index";
import type { ActivityGroupStatus } from "./activity-projector";
import type { SessionTimelineEntry } from "./session-timeline";

/** Stage 分段的展示状态。 */
export type StageSectionState = "running" | "completed" | "rejected" | "attention" | "recorded";

/**
 * 一个 Stage 分段的展示结论。
 *
 * @remarks
 * `completed` 只表示该 Stage 已被接受，不推断 Run 完成；`attention` 表示当前等待输入或
 * 存在失败、部分失败、拒绝的成员。`animate` 只由 `running` 产生。
 *
 * @example
 * ```ts
 * const section = selectStageSectionPresentation(input);
 * section.status; // "running"
 * ```
 */
export interface StageSectionPresentation {
  /** 分段状态，直接用于 CSS 类名。 */
  readonly status: StageSectionState;
  /** 是否运行动画。 */
  readonly animate: boolean;
  /** 需要置顶展示的成员或事实条目。 */
  readonly attention: readonly SessionTimelineEntry[];
}

/**
 * 生成同一 Run／Stage／revision 的稳定分段身份。
 *
 * @remarks
 * `continued` 只能沿该身份判断：后续页或后续分段复用同一身份时才算同段延续。
 *
 * @param runId - 所属 Run。
 * @param stageId - 阶段标识。
 * @param revision - 阶段修订；未提供时使用空串。
 * @returns 可用于集合比较的稳定键。
 * @example
 * ```ts
 * stageSectionIdentity("run-1", "stage-1", 2); // "run-1:stage-1:2"
 * ```
 */
export function stageSectionIdentity(runId: string | undefined, stageId: string, revision: number | undefined): string {
  return `${runId ?? ""}:${stageId}:${revision ?? ""}`;
}

/** 活动组是否仍在执行中。 */
export function isActiveStatus(status: ActivityGroupStatus): boolean {
  return status === "running" || status === "retrying" || status === "pending-result";
}

/** 活动状态是否需要用户注意。 */
export function needsAttentionStatus(status: ActivityGroupStatus): boolean {
  return status === "failed" || status === "partial-failure" || status === "rejected" || status === "waiting";
}

/**
 * 派生一个 Stage 分段的展示结论。
 *
 * @remarks
 * 只读取传入的本段条目与既有阶段摘要，不根据相邻条目或位置推测归属。`continued` 为真
 * 且本段没有自身活动时，不沿用上一段的动画。
 *
 * @param input - 本段条目、当前 Run 状态与阶段来源事实。
 * @returns 分段状态、动画与需要注意的条目。
 * @example
 * ```ts
 * const presentation = selectStageSectionPresentation({
 *   entries, currentRunId: "run-1", runStatus: "running", newerItemCount: 0,
 *   contextStatus: "executing", outcome: undefined, continued: false,
 * });
 * ```
 */
export function selectStageSectionPresentation(input: {
  readonly entries: readonly SessionTimelineEntry[];
  readonly currentRunId: string;
  readonly runStatus: BrowserRunStatus;
  readonly newerItemCount: number;
  readonly contextStatus?: string;
  readonly routeStage?: BrowserPlanRouteStageState;
  readonly outcome?: string;
  readonly continued: boolean;
}): StageSectionPresentation {
  const runId = input.entries[0]?.runId;
  const activities = input.entries.filter((entry) => entry.kind === "activity");
  const accepted = input.contextStatus === "accepted"
    || input.routeStage?.status === "accepted"
    || input.outcome === "run_stage_accepted";
  const attention = input.entries.filter((entry) => entry.kind === "activity"
    ? entry.group.members.some((member) => needsAttentionStatus(member.status))
    : entry.kind === "lookup" ? entry.status === "failed"
      : !accepted && entry.kind === "fact" && entry.eventType === "run_stage_rejected"
        && input.outcome === "run_stage_rejected");
  const currentRun = runId === input.currentRunId;
  const running = !accepted && currentRun && input.runStatus === "running"
    && (!input.continued || activities.some((entry) => isActiveStatus(entry.group.status)))
    && (input.routeStage?.status === "executing" || (input.newerItemCount === 0
      && (input.contextStatus === "executing" || activities.some((entry) => isActiveStatus(entry.group.status)))));
  const waiting = currentRun && input.runStatus === "waiting" && input.newerItemCount === 0
    && activities.some((entry) => entry.group.members.some((member) => member.status === "waiting"));
  const rejected = !accepted && (input.contextStatus === "rejected" || input.outcome === "run_stage_rejected");
  const status: StageSectionState = waiting ? "attention"
    : accepted ? "completed"
      : running ? "running"
        : rejected ? "rejected" : "recorded";
  return { status, animate: status === "running", attention };
}
