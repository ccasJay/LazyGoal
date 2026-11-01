import type {
  BrowserActivityItem,
  BrowserActivityPosition,
  BrowserActivityToolLifecycleEntry,
  BrowserActivityToolState,
  BrowserGoalEvent,
  BrowserRunStatus,
} from "../../../packages/web-contracts/src/index";

/** 活动组根据工具语义划分的展示类别。 */
export type ActivityGroupCategory = "explore" | "execute" | "edit" | "think" | "single";

/**
 * 单个活动成员在当前投影中的状态。
 *
 * @remarks
 * `pending-result` 表示工具已返回但结果尚未提交为已保存 Observation；它不能被当作
 * 已保存成功。`retrying` 只来自实时重试事实，不改变已提交终态；`waiting` 仅表示
 * 已提交动作仍在等待审批，不是正在执行工具。
 */
export type ActivityMemberStatus = "running" | "retrying" | "waiting" | "pending-result" | "completed" | "failed" | "rejected";

/** 活动组的结算状态；部分失败只用于展示，不改变任何成员的真实结果。 */
export type ActivityGroupStatus = ActivityMemberStatus | "partial-failure";

/**
 * 活动组中的一个真实工具调用。
 *
 * @remarks
 * `isCommitted` 表示调用身份有已提交 Trajectory 来源；实时信息只覆盖其当前状态，
 * 不会把未提交输出伪装成历史详情。成员只承载既有安全摘要，不含原始参数、
 * Observation 正文或隐藏推理。`lifecycle` 仅在来源动作具有已提交生命周期记录时提供，
 * 按来源顺序折叠授权、执行、重试与结果，不改变成员状态。
 *
 * @example
 * ```ts
 * const member: ActivityGroupMember = {
 *   id: "action:run-1:a1", runId: "run-1", category: "explore", label: "Read src/index.ts",
 *   status: "completed", isCommitted: true, attempts: [], position,
 *   lifecycle: [{ kind: "execution", title: "Tool started" }],
 * };
 * ```
 */
export interface ActivityGroupMember {
  /** 在同一 Run 内稳定的成员身份；由 Action 身份派生。 */
  readonly id: string;
  /** 所属 Run 稳定标识。 */
  readonly runId: string;
  /** 所属阶段；Run 级调用省略。 */
  readonly stageId?: string;
  /** 经工具白名单归类的活动类别。 */
  readonly category: ActivityGroupCategory;
  /** 真实工具身份；显式 Think 不提供。用于压缩相邻的同类操作，不代表工作阶段。 */
  readonly toolId?: string;
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
  /** 已记录的重试失败信息；有 `lifecycle` 时重试已归入生命周期，此字段只用于实时成员。 */
  readonly attempts: readonly string[];
  /** 同一 Action 的已提交授权、执行、重试与结果记录；按来源顺序排列。 */
  readonly lifecycle?: readonly BrowserActivityToolLifecycleEntry[];
  /** PTC 子调用的父程序 Action 身份。 */
  readonly parentActionId?: string;
  /** 审批者修订后的实际版本引用。 */
  readonly revisionRef?: string;
  /** 结果未知重执行的恢复引用。 */
  readonly recoveryRef?: string;
  /** 显式 Think 的目标与已提交输出。 */
  readonly think?: { readonly goal: string; readonly output?: string; readonly truncated?: true };
  /** 成员首个来源事实在 Activity 页中的项身份。 */
  readonly sourceItemId: string;
  /** 成员在 Activity 时间线中的真实来源位置。 */
  readonly position: BrowserActivityPosition;
}

/**
 * 由实际操作派生的可展开活动组。
 *
 * @remarks
 * 组 ID 由首个成员身份导出，不持久化，也不参与 Runtime 调度、授权或评测。组只合并
 * 同 Run、同阶段、同白名单工具且在完整交错时间线上相邻的成员；不据此推断工作阶段。
 * 同一 Action 的授权、执行、重试与结果事实先归入同一成员，其生命周期记录随成员展开
 * 显示；历史组保持折叠，等待审批的组仍按真实状态显示 `Awaiting approval`。
 *
 * @example
 * ```ts
 * const group: ActivityGroup = {
 *   id: "action:run-1:a1", runId: "run-1", category: "explore",
 *   status: "running", summary: "Read src/index.ts, +1 more", members: [], position,
 *   counts: { running: 0, retrying: 0, waiting: 0, "pending-result": 0, completed: 0, failed: 0, rejected: 0 },
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
  readonly status: ActivityGroupStatus;
  /** 动作描述，不将调用次数作为标题，也不推断不存在的工作阶段。 */
  readonly summary: string;
  /** 各成员真实状态的计数；调用次数不代表不同文件或对象数量。 */
  readonly counts: Readonly<Record<ActivityMemberStatus, number>>;
  /** 依来源顺序排列的调用成员。 */
  readonly members: readonly ActivityGroupMember[];
  /** 组在 Activity 时间线中的首个成员位置；实时活动组没有已提交位置。 */
  readonly position?: BrowserActivityPosition;
  /** 是否为尚未提交的实时活动组。 */
  readonly live?: true;
}

interface MutableMember {
  id: string;
  runId: string;
  stageId?: string;
  category: ActivityGroupCategory;
  toolId?: string;
  label: string;
  status: ActivityMemberStatus;
  isCommitted: boolean;
  hasLiveUpdate?: boolean;
  actionId?: string;
  executionUnitId?: string;
  inputSummary?: string;
  summary?: string;
  attempts: string[];
  lifecycle?: BrowserActivityToolLifecycleEntry[];
  parentActionId?: string;
  revisionRef?: string;
  recoveryRef?: string;
  think?: { readonly goal: string; readonly output?: string; readonly truncated?: true };
  sourceItemId: string;
  position: BrowserActivityPosition;
  breaksBefore: boolean;
}

/**
 * 从固定 Activity 页和当前 Run 的安全实时事件重建活动组。
 *
 * @remarks
 * 活动成员只来自服务端已提交的 Activity 事实及其安全工具状态，不再依赖完整会话步骤。
 * 断组由完整交错来源决定：用户／助手正文、交互、未知事实、阶段边界与未加载缺口都会
 * 断开相邻成员；隐藏正文或关闭 Execution steps 筛选不改变该判定。实时事件按 Action
 * 身份与已提交成员协调，只覆盖当前状态，不把未提交返回标为已保存成功。
 *
 * @param input - 当前 Goal、Run 的 Activity 页事实与本地短期安全实时事件。
 * @returns 按来源顺序排列的只读活动组。
 * @example
 * ```ts
 * const groups = projectActivityGroups({ goalId, runId, items, liveEvents });
 * ```
 */
export function projectActivityGroups(input: {
  readonly goalId: string;
  readonly runId: string;
  readonly items: readonly BrowserActivityItem[];
  readonly liveEvents: readonly BrowserGoalEvent[];
  readonly current: boolean;
  readonly runStatus: BrowserRunStatus;
}): readonly ActivityGroup[] {
  const items = input.items
    .filter((item) => item.runId === input.runId)
    .sort((left, right) => comparePositions(left.position, right.position));

  const members: MutableMember[] = [];
  const memberByKey = new Map<string, MutableMember>();
  let previous: MutableMember | undefined;
  let adjacencyBroken = true;

  for (const item of items) {
    if (item.type === "message") {
      adjacencyBroken = true;
      previous = undefined;
      continue;
    }
    if (item.type === "think") {
      const member: MutableMember = {
        id: `think:${input.runId}:${item.itemId}`,
        runId: input.runId,
        category: "think",
        label: "Thinking",
        status: item.think.output === undefined ? "running" : "completed",
        isCommitted: true,
        attempts: [],
        think: item.think,
        ...(item.executionUnitId === undefined ? {} : { executionUnitId: item.executionUnitId }),
        sourceItemId: item.itemId,
        position: item.position,
        breaksBefore: true,
      };
      members.push(member);
      memberByKey.set(item.itemId, member);
      previous = undefined;
      adjacencyBroken = true;
      continue;
    }
    const tool = item.tool;
    if (tool === undefined) {
      if (item.eventType === "decision_received" && item.actionId !== undefined) continue;
      adjacencyBroken = true;
      previous = undefined;
      continue;
    }
    const key = item.actionId ?? `event:${item.eventId}`;
    const existing = memberByKey.get(key);
    if (existing !== undefined) {
      applyToolState(existing, tool);
      continue;
    }
    const member = createMember(input.runId, key, item, tool);
    const hasActionIdentity = item.actionId !== undefined;
    member.breaksBefore = adjacencyBroken
      || !hasActionIdentity
      || tool.activityBoundaryBefore === true
      || (previous !== undefined
        && (previous.category !== member.category || previous.stageId !== member.stageId));
    members.push(member);
    memberByKey.set(key, member);
    previous = member;
    // 没有 Action 身份的活动无法证明相邻关系，其后成员也必须断组。
    adjacencyBroken = !hasActionIdentity;
  }

  const live = input.current && input.runStatus === "running"
    ? projectLiveMembers(input.goalId, input.runId, input.liveEvents)
    : { members: [] as readonly MutableMember[] };
  let liveOnlyCount = 0;
  for (const liveMember of live.members) {
    const saved = liveMember.actionId === undefined
      ? undefined
      : memberByKey.get(liveMember.actionId);
    if (saved === undefined) {
      // 实时活动组永远与已提交内容断开；组内只在没有实时边界时相邻合并。
      liveMember.breaksBefore = liveOnlyCount === 0 ? true : liveMember.breaksBefore;
      liveOnlyCount += 1;
      members.push(liveMember);
      continue;
    }
    if (isTerminal(saved.status)) continue;
    saved.status = liveMember.status;
    saved.label = labelForTool(saved.toolId, saved.inputSummary, saved.status);
    saved.summary = liveMember.summary ?? saved.summary;
    saved.attempts = uniqueAttempts([...saved.attempts, ...liveMember.attempts]);
    saved.hasLiveUpdate = true;
  }

  return groupAdjacent(members);
}

/** 生成能在折叠状态识别实际调用的摘要行。 */
export function summarizeActivityGroup(category: ActivityGroupCategory, members: readonly ActivityGroupMember[]): string {
  if (category === "think") return `Thinking: ${members[0]?.think?.goal ?? "Analysis"}`;
  if (category === "single") return members[0]?.label ?? "Activity";
  const first = members[0];
  if (first?.toolId === "bash" && members.every(member => member.toolId === "bash")) {
    if (members.length === 1) return first.label;
    const operations = [...new Set(members.map(member => summarizeBashCommand(member.inputSummary)))];
    return `${operations.slice(0, 2).join(", ")}${operations.length > 2 ? `, +${operations.length - 2} more operations` : ""}`;
  }
  const repeated = first?.toolId !== undefined && members.length > 1
    && members.every((member) => member.toolId === first.toolId);
  if (repeated) {
    const operations: Record<string, string> = {
      read_file: "Read files", list_directory: "Inspect directories",
      web_search: "Search the web", web_fetch: "Read web pages", write_file: "Write files",
      edit_file: "Edit files", execute_program: "Run programs",
    };
    return operations[first.toolId!] ?? "Run tools";
  }
  const labels = members.slice(0, 2).map((member) => member.label);
  if (labels.length === 0) return "No tool calls";
  const remaining = members.length - labels.length;
  return `${labels.join(", ")}${remaining > 0 ? `, +${remaining} more` : ""}`;
}

function createMember(
  runId: string,
  key: string,
  item: Extract<BrowserActivityItem, { readonly type: "fact" }>,
  tool: BrowserActivityToolState,
): MutableMember {
  const status = committedMemberStatus(tool);
  const member: MutableMember = {
    id: `action:${runId}:${key}`,
    runId,
    category: categorizeTool(tool.toolId, tool.inputSummary),
    toolId: tool.toolId,
    label: labelForTool(tool.toolId, tool.inputSummary, status),
    status,
    isCommitted: true,
    attempts: [...(tool.attempts ?? [])],
    sourceItemId: item.itemId,
    position: item.position,
    breaksBefore: false,
  };
  applyToolState(member, tool);
  if (item.stageId !== undefined) member.stageId = item.stageId;
  if (item.executionUnitId !== undefined) member.executionUnitId = item.executionUnitId;
  if (item.actionId !== undefined) member.actionId = item.actionId;
  return member;
}

function applyToolState(member: MutableMember, tool: BrowserActivityToolState): void {
  if (tool.inputSummary !== undefined) member.inputSummary = tool.inputSummary;
  if (tool.summary !== undefined) member.summary = tool.summary;
  if (tool.lifecycle !== undefined) member.lifecycle = [...tool.lifecycle];
  if (tool.revisionRef !== undefined) member.revisionRef = tool.revisionRef;
  if (tool.recoveryRef !== undefined) member.recoveryRef = tool.recoveryRef;
  if (tool.parentActionId !== undefined) member.parentActionId = tool.parentActionId;
  if (tool.attempts !== undefined) member.attempts = uniqueAttempts([...member.attempts, ...tool.attempts]);
  if (!isTerminal(member.status)) member.status = committedMemberStatus(tool);
  member.label = labelForTool(member.toolId, member.inputSummary, member.status);
}

function committedMemberStatus(tool: BrowserActivityToolState): ActivityMemberStatus {
  const status = tool.status;
  if (status === "recorded" && tool.actionStatus === "awaiting_approval") return "waiting";
  if (status === "pending-result") return "pending-result";
  if (status === "recorded") return "running";
  return status;
}

function projectLiveMembers(
  goalId: string,
  runId: string,
  events: readonly BrowserGoalEvent[],
): { readonly members: readonly MutableMember[] } {
  const latestByIdentity = new Map<string, {
    readonly event: Extract<BrowserGoalEvent, { readonly type: "activity" }>;
    readonly cursor: number;
  }>();
  for (const event of events) {
    if (event.type !== "activity" || event.goalId !== goalId || event.runId !== runId) continue;
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
  let breakBeforeNext = true;

  for (const event of ordered) {
    if (event.type !== "activity") continue;
    const activity = event.activity;
    if (activity.kind === "activity_boundary" || activity.kind === "assistant_text_delta") {
      breakBeforeNext = true;
      continue;
    }
    if (activity.kind === "tool_started") {
      const id = `action:${runId}:${activity.actionId}`;
      if (mutable.has(id)) continue;
      const member: MutableMember = {
        id,
        runId,
        category: categorizeTool(activity.toolId, activity.inputSummary),
        toolId: activity.toolId,
        label: labelForTool(activity.toolId, activity.inputSummary, "running"),
        status: "running",
        isCommitted: false,
        actionId: activity.actionId,
        executionUnitId: activity.executionUnitId,
        attempts: [],
        position: livePosition(runId, activity.sourceCursor),
        sourceItemId: `live:${runId}:${activity.sourceEventId}`,
        breaksBefore: breakBeforeNext,
      };
      if (activity.inputSummary !== undefined) member.inputSummary = activity.inputSummary;
      mutable.set(id, member);
      insertionOrder.push(id);
      breakBeforeNext = false;
      continue;
    }
    if (activity.kind === "tool_attempt_started" || activity.kind === "tool_attempt_failed" || activity.kind === "tool_finished") {
      const member = mutable.get(`action:${runId}:${activity.actionId}`);
      if (member === undefined) continue;
      if (activity.kind === "tool_attempt_failed") {
        member.attempts.push(`Attempt ${activity.attempt} failed: ${activity.reason}`);
        if (!isTerminal(member.status)) member.status = "retrying";
      } else if (activity.kind === "tool_attempt_started") {
        if (!isTerminal(member.status)) member.status = "running";
      } else if (activity.kind === "tool_finished") {
        // 实时返回不是已保存结果；已提交 Observation 才能确定终态。
        if (!isTerminal(member.status)) member.status = "pending-result";
        if (activity.summary !== undefined) member.summary = activity.summary;
      }
    }
  }
  return { members: insertionOrder.map((id) => mutable.get(id)!) };
}

function groupAdjacent(members: readonly MutableMember[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  let current: MutableMember[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0]!;
    const projectedMembers = current.map(toPublicMember);
    const live = current.every((member) => !member.isCommitted);
    groups.push({
      id: first.id,
      runId: first.runId,
      ...(first.stageId === undefined ? {} : { stageId: first.stageId }),
      category: first.category,
      status: groupStatus(projectedMembers),
      summary: summarizeActivityGroup(first.category, projectedMembers),
      counts: countActivityMembers(projectedMembers),
      members: projectedMembers,
      ...(live ? { live: true as const } : { position: first.position }),
    });
    current = [];
  };

  for (const member of members) {
    const previous = current.at(-1);
    const sameGroup = current.length > 0
      && previous !== undefined
      && !member.breaksBefore
      && previous.category !== "single"
      && member.category !== "single"
      && previous.category === member.category
      && previous.toolId === member.toolId
      && previous.stageId === member.stageId
      && previous.status !== "rejected";
    if (!sameGroup) flush();
    current.push(member);
  }
  flush();
  return groups;
}

function groupStatus(members: readonly ActivityGroupMember[]): ActivityGroupStatus {
  if (members.some((member) => member.status === "waiting")) return "waiting";
  if (members.some((member) => member.status === "running" || member.status === "retrying")) return "running";
  if (members.some((member) => member.status === "pending-result")) return "pending-result";
  if (members.some((member) => member.status === "failed" || member.status === "rejected")
    && members.some((member) => member.status === "completed")) return "partial-failure";
  if (members.some((member) => member.status === "failed")) return "failed";
  if (members.some((member) => member.status === "rejected")) return "rejected";
  return "completed";
}

function countActivityMembers(members: readonly ActivityGroupMember[]): Readonly<Record<ActivityMemberStatus, number>> {
  const counts: Record<ActivityMemberStatus, number> = { running: 0, retrying: 0, waiting: 0, "pending-result": 0, completed: 0, failed: 0, rejected: 0 };
  for (const member of members) counts[member.status] += 1;
  return counts;
}

function toPublicMember(member: MutableMember): ActivityGroupMember {
  return {
    id: member.id,
    runId: member.runId,
    ...(member.stageId === undefined ? {} : { stageId: member.stageId }),
    category: member.category,
    ...(member.toolId === undefined ? {} : { toolId: member.toolId }),
    label: member.label,
    status: member.status,
    isCommitted: member.isCommitted,
    ...(member.hasLiveUpdate === true ? { hasLiveUpdate: true as const } : {}),
    ...(member.actionId === undefined ? {} : { actionId: member.actionId }),
    ...(member.executionUnitId === undefined ? {} : { executionUnitId: member.executionUnitId }),
    ...(member.inputSummary === undefined ? {} : { inputSummary: member.inputSummary }),
    ...(member.summary === undefined ? {} : { summary: member.summary }),
    attempts: member.attempts,
    ...(member.lifecycle === undefined ? {} : { lifecycle: member.lifecycle }),
    ...(member.parentActionId === undefined ? {} : { parentActionId: member.parentActionId }),
    ...(member.revisionRef === undefined ? {} : { revisionRef: member.revisionRef }),
    ...(member.recoveryRef === undefined ? {} : { recoveryRef: member.recoveryRef }),
    ...(member.think === undefined ? {} : { think: member.think }),
    sourceItemId: member.sourceItemId,
    position: member.position,
  };
}

function categorizeTool(toolId?: string, inputSummary?: string): ActivityGroupCategory {
  if (toolId === "bash" && isBashSearchCommand(inputSummary)) return "explore";
  if (toolId === "read_file" || toolId === "list_directory" || toolId === "web_search" || toolId === "web_fetch") return "explore";
  if (toolId === "bash" || toolId === "execute_program") return "execute";
  if (toolId === "write_file" || toolId === "edit_file") return "edit";
  return "single";
}

function labelForTool(toolId: string | undefined, target: string | undefined, status: ActivityMemberStatus): string {
  const completed = status === "completed" || status === "failed";
  const value = target?.trim();
  if (toolId === "read_file") return `Read ${value || "a file"}`;
  if (toolId === "list_directory") return `Listed ${value || "a directory"}`;
  if (toolId === "web_search") return `${completed ? "Searched" : "Search"} ${value ? `for ${value}` : "the web"}`;
  if (toolId === "web_fetch") return `${completed ? "Fetched" : "Fetch"} ${value || "a page"}`;
  if (toolId === "write_file") return `${status === "completed" ? "Wrote" : "Write"} ${value || "a file"}`;
  if (toolId === "edit_file") return `${status === "completed" ? "Edited" : "Edit"} ${value || "a file"}`;
  if (toolId === "bash") return isBashSearchCommand(value)
    ? `${completed ? "Searched" : "Search"} files`
    : summarizeBashCommand(value);
  if (toolId === "execute_program") return `${completed ? "Ran" : "Run"} a program`;
  return toolId ?? "Activity";
}

function summarizeBashCommand(command: string | undefined): string {
  // 只识别简单调用；不从 Shell 控制流、替换表达式或引用中的文本推断操作。
  if (command === undefined || /[;&|<>\n\r`$(){}\\]/u.test(command)) return "Run shell commands";
  const value = command.trim();
  if (isBashSearchCommand(value)) return "Search files";
  if (/^git\s+status(?:\s|$)/u.test(value)) return "Check Git workspace";
  if (/^git\s+log(?:\s|$)/u.test(value)) return "View commit history";
  if (/^git\s+diff(?:\s|$)/u.test(value)) return "Review code changes";
  if (/^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|(?:npx\s+)?(?:vitest|jest)|node\s+--test)(?:\s|$)/u.test(value)) return "Run tests";
  return "Run shell commands";
}

function isBashSearchCommand(command: string | undefined): boolean {
  if (command === undefined) return false;
  const value = command.trim();
  return /^(?:env\s+)?(?:rg|grep)(?:\s|$)/u.test(value)
    || (/^find(?:\s|$)/u.test(value) && /\bawk\b/u.test(value));
}

function livePosition(runId: string, cursor: number): BrowserActivityPosition {
  return {
    runId,
    runOrder: Number.MAX_SAFE_INTEGER,
    sequence: cursor,
    itemKind: "fact",
    order: 0,
  };
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

function comparePositions(left: BrowserActivityPosition, right: BrowserActivityPosition): number {
  return left.runOrder - right.runOrder
    || left.sequence - right.sequence
    || (left.itemKind === right.itemKind ? 0 : left.itemKind === "fact" ? -1 : 1)
    || left.order - right.order;
}
