import type { BrowserToolActivity } from "../../../../packages/web-contracts/src/index";

/** 同一 Action 内的一次工具尝试。 */
export interface ToolAttempt {
  /** 从 1 开始的尝试序号。 */
  readonly attempt: number;
  readonly phase: "started" | "failed" | "returned";
  /** 失败原因；其它阶段省略。 */
  readonly reason?: string;
}

/**
 * 工具活动的页面侧生命周期。
 *
 * @remarks
 * 活动身份由 `actionId` 与 `executionUnitId` 共同确定，`attempts` 保留每次尝试。
 * `result_pending` 只表示工具已返回；只有 Observation 提交事实才能进入
 * `observed_committed`。旧 attempt 与迟到事件不得回退已确认状态。
 *
 * @example
 * ```ts
 * const activities = applyToolActivityEvent([], event.activity);
 * ```
 */
export interface ToolActivity {
  readonly actionId: string;
  readonly executionUnitId: string;
  /** 已知的工具身份；后续缺少该字段的事件沿用先前值。 */
  readonly toolId?: string;
  readonly attempts: readonly ToolAttempt[];
  readonly phase: "started" | "attempting" | "retrying" | "result_pending" | "observed_committed" | "unknown";
  /** 已提交 Observation 的结果；未返回或未提交时省略。 */
  readonly outcome?: "success" | "failure";
  readonly summary?: string;
}

const PHASE_RANK: Readonly<Record<ToolActivity["phase"], number>> = {
  unknown: 0,
  started: 1,
  attempting: 2,
  retrying: 2,
  result_pending: 4,
  observed_committed: 5,
};

const MAX_TOOL_ACTIVITIES = 128;
const MAX_TOOL_ATTEMPTS = 8;

/**
 * 应用一条工具活动事件。
 *
 * @remarks
 * 按 `actionId` 与 `executionUnitId` 合并到现有活动；事件缺少执行单元时沿用同一
 * Action 的已知活动。阶段只前进不回退，旧 attempt 不会覆盖更高 attempt 或已提交
 * 结果。
 *
 * @param activities - 当前活动集合。
 * @param event - Browser 投影的工具活动。
 * @returns 更新后的活动集合。
 * @example
 * ```ts
 * const next = applyToolActivityEvent(state.toolActivities, event.activity);
 * ```
 */
export function applyToolActivityEvent(
  activities: readonly ToolActivity[],
  event: BrowserToolActivity,
): readonly ToolActivity[] {
  const index = findActivity(activities, event.actionId, event.executionUnitId);
  const current = index < 0 ? undefined : activities[index];
  const next = mergeActivity(current, event);
  if (index < 0) return [...activities, next].slice(-MAX_TOOL_ACTIVITIES);
  if (current !== undefined && sameActivity(current, next)) return activities;
  const merged = [...activities];
  merged[index] = next;
  return merged;
}

function findActivity(
  activities: readonly ToolActivity[],
  actionId: string,
  executionUnitId: string | undefined,
): number {
  return activities.findIndex((activity) => activity.actionId === actionId
    && (executionUnitId === undefined || activity.executionUnitId === "" || activity.executionUnitId === executionUnitId));
}

function mergeActivity(current: ToolActivity | undefined, event: BrowserToolActivity): ToolActivity {
  const executionUnitId = event.executionUnitId ?? current?.executionUnitId ?? "";
  const toolId = event.toolId ?? current?.toolId;
  const base = {
    actionId: event.actionId,
    executionUnitId,
    attempts: current?.attempts ?? [],
    ...(toolId === undefined ? {} : { toolId }),
  };
  const advance = (phase: ToolActivity["phase"]): ToolActivity["phase"] =>
    current === undefined || PHASE_RANK[phase] >= PHASE_RANK[current.phase] ? phase : current.phase;

  switch (event.phase) {
    case "started":
      return {
        ...base,
        attempts: upsertAttempt(base.attempts, { attempt: event.attempt ?? 1, phase: "started" }),
        phase: advance("started"),
      };
    case "attempting":
      return {
        ...base,
        attempts: upsertAttempt(base.attempts, { attempt: event.attempt ?? 1, phase: "started" }),
        phase: advance("attempting"),
      };
    case "retrying":
      return {
        ...base,
        attempts: upsertAttempt(base.attempts, {
          attempt: event.attempt ?? 1,
          phase: "failed",
          ...(event.reason === undefined ? {} : { reason: event.reason }),
        }),
        phase: advance("retrying"),
      };
    case "result_pending": {
      if (current?.phase === "observed_committed") return current;
      const outcome = event.outcome ?? current?.outcome;
      const summary = event.summary ?? current?.summary;
      return {
        ...base,
        attempts: settleLastAttempt(base.attempts),
        phase: advance("result_pending"),
        ...(outcome === undefined ? {} : { outcome }),
        ...(summary === undefined ? {} : { summary }),
      };
    }
    case "observed_committed":
      if (current?.phase === "observed_committed") return current;
      return {
        ...base,
        attempts: settleLastAttempt(base.attempts),
        phase: "observed_committed",
        ...(current?.outcome === undefined ? {} : { outcome: current.outcome }),
        ...(current?.summary === undefined ? {} : { summary: current.summary }),
      };
    case "unknown":
      return { ...base, phase: current !== undefined && PHASE_RANK[current.phase] > 0 ? current.phase : "unknown" };
  }
}

function upsertAttempt(attempts: readonly ToolAttempt[], next: ToolAttempt): readonly ToolAttempt[] {
  const existing = attempts.find((attempt) => attempt.attempt === next.attempt);
  if (existing === undefined) return [...attempts, next].slice(-MAX_TOOL_ATTEMPTS);
  if (existing.phase !== "started" && next.phase === "started") return attempts;
  if (existing.phase === "returned" && next.phase === "failed") return attempts;
  if (existing.phase === next.phase && existing.reason === next.reason) return attempts;
  return attempts.map((attempt) => attempt.attempt === next.attempt ? next : attempt);
}

function sameActivity(left: ToolActivity, right: ToolActivity): boolean {
  return left.actionId === right.actionId
    && left.executionUnitId === right.executionUnitId
    && left.toolId === right.toolId
    && left.phase === right.phase
    && left.outcome === right.outcome
    && left.summary === right.summary
    && left.attempts.length === right.attempts.length
    && left.attempts.every((attempt, index) => {
      const other = right.attempts[index];
      return other !== undefined && attempt.attempt === other.attempt && attempt.phase === other.phase && attempt.reason === other.reason;
    });
}

function settleLastAttempt(attempts: readonly ToolAttempt[]): readonly ToolAttempt[] {
  const last = attempts.at(-1);
  if (last === undefined || last.phase === "returned") return attempts;
  return attempts.map((attempt) => attempt.attempt === last.attempt ? { attempt: last.attempt, phase: "returned" } : attempt);
}
