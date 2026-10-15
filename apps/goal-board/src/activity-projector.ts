import type {
  BrowserGoalLiveEvent,
  BrowserSessionRun,
  BrowserSessionStep,
} from "../../../packages/web-contracts/src/index";

/** 活动组根据工具语义划分的展示类别。 */
export type ActivityGroupCategory = "explore" | "execute" | "edit" | "single";

/** 单个活动成员在当前投影中的状态。 */
export type ActivityMemberStatus = "running" | "completed" | "failed" | "rejected";

/**
 * 活动组中的一个真实工具调用。
 *
 * @remarks
 * `isCommitted` 表示调用身份有已提交 Trajectory 来源；实时信息只覆盖其当前状态，
 * 不会把未提交输出伪装成历史详情。
 *
 * @example
 * ```ts
 * const member: ActivityGroupMember = {
 *   id: "action:run-1:a1", category: "explore", label: "Read src/index.ts",
 *   status: "completed", isCommitted: true, attempts: [],
 * };
 * ```
 */
export interface ActivityGroupMember {
  /** 在同一 Run 内稳定的成员身份；优先由 Action ID 派生。 */
  readonly id: string;
  /** 所属阶段；Run 级调用省略。 */
  readonly stageId?: string;
  /** 经工具白名单归类的活动类别。 */
  readonly category: ActivityGroupCategory;
  /** 简短操作描述，不含原始工具输入或隐藏推理。 */
  readonly label: string;
  /** 当前调用状态。 */
  readonly status: ActivityMemberStatus;
  /** 是否存在已提交 Trajectory 调用事实。 */
  readonly isCommitted: boolean;
  /** 是否有尚未提交的实时状态覆盖已提交步骤。 */
  readonly hasLiveUpdate?: true;
  /** Action 稳定身份；未知或不明确时省略。 */
  readonly actionId?: string;
  /** Runtime 执行单元身份。 */
  readonly executionUnitId?: string;
  /** 安全白名单中的输入摘要。 */
  readonly inputSummary?: string;
  /** 公开或已提交的结果摘要。 */
  readonly summary?: string;
  /** 已记录的重试失败信息；不单独决定最终状态。 */
  readonly attempts: readonly string[];
  /** 完整的安全会话步骤，仅来自已提交 Trajectory。 */
  readonly step?: BrowserSessionStep;
}

/**
 * 由实际操作派生的可展开活动组。
 *
 * @remarks
 * 组 ID 由首个成员身份导出，不持久化，也不参与 Runtime 调度、授权或评测。
 *
 * @example
 * ```ts
 * const group: ActivityGroup = {
 *   id: "action:run-1:a1", runId: "run-1", category: "explore",
 *   status: "running", summary: "Explored 2 items", members: [],
 * };
 * ```
 */
export interface ActivityGroup {
  /** 稳定的展示身份，由首个成员身份派生。 */
  readonly id: string;
  /** Run 稳定标识。 */
  readonly runId: string;
  /** 活动组所属阶段；Run 级活动省略。 */
  readonly stageId?: string;
  /** 组内成员的统一展示类别。 */
  readonly category: ActivityGroupCategory;
  /** 组级状态，由成员最终状态派生。 */
  readonly status: ActivityMemberStatus;
  /** 由成员数量和类别生成的界面摘要。 */
  readonly summary: string;
  /** 依来源顺序排列的调用成员。 */
  readonly members: readonly ActivityGroupMember[];
}

/**
 * 从已提交步骤和当前 Run 的安全实时事件重建活动组。
 *
 * @remarks
 * 历史活动只来自会话 DTO 中的已提交步骤；实时事件按 ExecutionStream 的事件 ID/cursor
 * 独立去重，再按 `actionId` 与历史协调。只合并具有 Action 身份、同类别、同阶段且
 * 来源相邻的调用。助手可见回复、等待、阶段变更、终态失败及未知事件会切断实时组。
 *
 * @param input - 当前 Goal、Run 的已提交步骤及本地短期安全实时事件。
 * @returns 按历史顺序后接未提交实时活动的只读展示投影。
 * @example
 * ```ts
 * const groups = projectActivityGroups({ goalId, run, liveEvents });
 * ```
 */
export function projectActivityGroups(input: {
  readonly goalId: string;
  readonly run: BrowserSessionRun;
  readonly liveEvents: readonly BrowserGoalLiveEvent[];
}): readonly ActivityGroup[] {
  const durable = input.run.steps
    .slice()
    .sort((left, right) => left.sequence - right.sequence)
    .map((step) => durableMember(input.run.runId, step));
  const durableByAction = new Map<string, MutableMember>();
  for (const member of durable) {
    if (member.actionId !== undefined) durableByAction.set(member.actionId, member);
  }

  const liveMembers = input.run.current && input.run.status === "running"
    ? projectLiveMembers(input.goalId, input.run, input.liveEvents)
    : { members: [], boundaryBefore: new Set<string>() };
  const reconciledLive: MutableMember[] = [];
  for (const live of liveMembers.members) {
    const saved = durableByAction.get(live.actionId!);
    if (saved === undefined) {
      reconciledLive.push(live);
      continue;
    }
    if (isTerminal(saved.status)) continue;
    saved.status = live.status;
    saved.summary = live.summary ?? saved.summary;
    saved.attempts = uniqueAttempts([...saved.attempts, ...live.attempts]);
    saved.hasLiveUpdate = true;
  }

  const durableGroups = groupAdjacent(input.run.runId, durable);
  const liveGroups = groupAdjacent(input.run.runId, reconciledLive, liveMembers.boundaryBefore);
  return [...durableGroups, ...liveGroups];
}

/** 生成用于摘要行的类别数量文案。 */
export function summarizeActivityGroup(category: ActivityGroupCategory, members: readonly ActivityGroupMember[]): string {
  if (category === "single") return members[0]?.label ?? "Activity";
  const count = members.length;
  if (category === "explore") return `Explored ${count} ${count === 1 ? "item" : "items"}`;
  if (category === "execute") return `Ran ${count} ${count === 1 ? "command" : "commands"}`;
  return `Edited ${count} ${count === 1 ? "file" : "files"}`;
}

interface MutableMember {
  id: string;
  runId: string;
  stageId?: string;
  category: ActivityGroupCategory;
  label: string;
  status: ActivityMemberStatus;
  isCommitted: boolean;
  actionId?: string;
  executionUnitId?: string;
  inputSummary?: string;
  summary?: string;
  attempts: string[];
  step?: BrowserSessionStep;
  hasLiveUpdate?: boolean;
  sourceEventId?: string;
  sourceCursor?: number;
}

function durableMember(runId: string, step: BrowserSessionStep): MutableMember {
  const category = categorizeTool(step.toolId);
  const status: ActivityMemberStatus = step.status === "completed" ? "completed"
    : step.status === "failed" ? "failed"
      : step.status === "rejected" ? "rejected" : "running";
  return {
    id: step.actionId === undefined ? `trajectory:${runId}:${step.sourceEventId ?? step.executionUnitId}:${step.sequence}` : `action:${runId}:${step.actionId}`,
    runId,
    ...(step.stageId === undefined ? {} : { stageId: step.stageId }),
    category,
    label: labelForTool(step.toolId, step.inputSummary ?? step.bashExecution?.command, step.status),
    status,
    isCommitted: true,
    ...(step.actionId === undefined ? {} : { actionId: step.actionId }),
    executionUnitId: step.executionUnitId,
    ...(step.inputSummary === undefined ? {} : { inputSummary: step.inputSummary }),
    ...(step.summary === undefined ? {} : { summary: step.summary }),
    attempts: [...(step.recoveryAttempts ?? [])],
    ...(step.sourceEventId === undefined ? {} : { sourceEventId: step.sourceEventId }),
    step,
  };
}

function projectLiveMembers(
  goalId: string,
  run: BrowserSessionRun,
  events: readonly BrowserGoalLiveEvent[],
): { readonly members: readonly MutableMember[]; readonly boundaryBefore: ReadonlySet<string> } {
  const latestByIdentity = new Map<string, {
    readonly event: Extract<BrowserGoalLiveEvent, { readonly type: "activity" }>;
    readonly cursor: number;
  }>();
  for (const event of events) {
    if (event.type !== "activity" || event.goalId !== goalId || event.runId !== run.runId) continue;
    const activity = event.activity;
    if (!("sourceEventId" in activity) || !("sourceCursor" in activity)) continue;
    latestByIdentity.set(`${activity.sourceCursor}\u0000${activity.sourceEventId}`, {
      event,
      cursor: activity.sourceCursor,
    });
  }
  const ordered = [...latestByIdentity.values()]
    .sort((left, right) => left.cursor - right.cursor)
    .map(({ event }) => event);
  const mutable = new Map<string, MutableMember>();
  const insertionOrder: string[] = [];
  const boundaryBefore = new Set<string>();
  const currentStageId = currentStage(run);
  let breakBeforeNext = false;

  for (const event of ordered) {
    if (event.type !== "activity") continue;
    const activity = event.activity;
    if (activity.kind === "activity_boundary" || activity.kind === "assistant_text_delta") {
      breakBeforeNext = true;
      continue;
    }
    if (activity.kind === "tool_started") {
      const id = `action:${run.runId}:${activity.actionId}`;
      if (mutable.has(id)) continue;
      const member: MutableMember = {
        id,
        runId: run.runId,
        ...(currentStageId === undefined ? {} : { stageId: currentStageId }),
        category: categorizeTool(activity.toolId),
        label: labelForTool(activity.toolId, activity.inputSummary, "recorded"),
        status: "running",
        isCommitted: false,
        actionId: activity.actionId,
        executionUnitId: activity.executionUnitId,
        sourceEventId: activity.sourceEventId,
        sourceCursor: activity.sourceCursor,
        ...(activity.inputSummary === undefined ? {} : { inputSummary: activity.inputSummary }),
        attempts: [],
      };
      mutable.set(id, member);
      insertionOrder.push(id);
      if (breakBeforeNext) boundaryBefore.add(id);
      breakBeforeNext = false;
      continue;
    }
    if (activity.kind === "tool_attempt_started" || activity.kind === "tool_attempt_failed" || activity.kind === "tool_finished") {
      const member = mutable.get(`action:${run.runId}:${activity.actionId}`);
      if (member === undefined) continue;
      if (activity.kind === "tool_attempt_failed") {
        member.attempts.push(`Attempt ${activity.attempt} failed: ${activity.reason}`);
      } else if (activity.kind === "tool_finished") {
        member.status = activity.outcome === "failure" ? "failed" : "completed";
        if (activity.summary !== undefined) member.summary = activity.summary;
      }
    }
  }
  return { members: insertionOrder.map((id) => mutable.get(id)!), boundaryBefore };
}

function groupAdjacent(
  runId: string,
  members: readonly MutableMember[],
  boundaryBefore: ReadonlySet<string> = new Set(),
): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  let current: MutableMember[] = [];
  let previous: MutableMember | undefined;

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0]!;
    const projectedMembers = current.map(toPublicMember);
    const failed = projectedMembers.some((member) => member.status === "failed" || member.status === "rejected");
    const status: ActivityMemberStatus = projectedMembers.some((member) => member.status === "running")
      ? "running" : failed ? (projectedMembers.some((member) => member.status === "failed") ? "failed" : "rejected") : "completed";
    groups.push({
      id: first.id,
      runId,
      ...(first.stageId === undefined ? {} : { stageId: first.stageId }),
      category: first.category,
      status,
      summary: summarizeActivityGroup(first.category, projectedMembers),
      members: projectedMembers,
    });
    current = [];
  };

  for (const member of members) {
    const mergeable = isMergeable(member);
    const previousMergeable = previous !== undefined && isMergeable(previous);
    const sameGroup = current.length > 0 && previousMergeable && mergeable
      && previous?.category === member.category
      && previous?.stageId === member.stageId
      && !boundaryBefore.has(member.id)
      && previous?.status !== "failed" && previous?.status !== "rejected";
    if (!sameGroup) flush();
    current.push(member);
    previous = member;
  }
  flush();
  return groups;
}

function toPublicMember(member: MutableMember): ActivityGroupMember {
  return {
    id: member.id,
    ...(member.stageId === undefined ? {} : { stageId: member.stageId }),
    category: member.category,
    label: member.label,
    status: member.status,
    isCommitted: member.isCommitted,
    ...(member.hasLiveUpdate === true ? { hasLiveUpdate: true as const } : {}),
    ...(member.actionId === undefined ? {} : { actionId: member.actionId }),
    ...(member.executionUnitId === undefined ? {} : { executionUnitId: member.executionUnitId }),
    ...(member.inputSummary === undefined ? {} : { inputSummary: member.inputSummary }),
    ...(member.summary === undefined ? {} : { summary: member.summary }),
    attempts: member.attempts,
    ...(member.step === undefined ? {} : { step: member.step }),
  };
}

function categorizeTool(toolId?: string): ActivityGroupCategory {
  if (toolId === "read_file" || toolId === "list_directory" || toolId === "grep" || toolId === "web_search" || toolId === "web_fetch") return "explore";
  if (toolId === "bash" || toolId === "execute_program") return "execute";
  if (toolId === "write_file" || toolId === "edit_file") return "edit";
  return "single";
}

function labelForTool(toolId: string | undefined, target: string | undefined, status: BrowserSessionStep["status"] | "recorded"): string {
  const completed = status === "completed" || status === "failed";
  const value = target?.trim();
  if (toolId === "read_file") return `Read ${value || "a file"}`;
  if (toolId === "list_directory") return `Listed ${value || "a directory"}`;
  if (toolId === "grep" || toolId === "web_search") return `${completed ? "Searched" : "Search"} ${value ? `for ${value}` : "files"}`;
  if (toolId === "web_fetch") return `${completed ? "Fetched" : "Fetch"} ${value || "a page"}`;
  if (toolId === "write_file") return `${status === "completed" ? "Wrote" : "Write"} ${value || "a file"}`;
  if (toolId === "edit_file") return `${status === "completed" ? "Edited" : "Edit"} ${value || "a file"}`;
  if (toolId === "bash") return `${completed ? "Ran" : "Run"} ${value || "a command"}`;
  if (toolId === "execute_program") return `${completed ? "Ran" : "Run"} a program`;
  return toolId ?? "Activity";
}

function currentStage(run: BrowserSessionRun): string | undefined {
  const planned = run.planRoute?.stages.find((stage) => stage.status === "executing");
  if (planned !== undefined) return planned.stageId;
  return run.stages?.find((stage) => stage.status === "in_progress")?.stageId;
}

function isMergeable(member: MutableMember): boolean {
  return member.category !== "single"
    && member.actionId !== undefined
    && member.sourceEventId !== undefined;
}

function isTerminal(status: ActivityMemberStatus): boolean {
  return status === "completed" || status === "failed" || status === "rejected";
}

function uniqueAttempts(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const attempt = /(?:attempt|retry)\s+(\d+)/i.exec(value)?.[1];
    const key = attempt === undefined ? value : `attempt:${attempt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
