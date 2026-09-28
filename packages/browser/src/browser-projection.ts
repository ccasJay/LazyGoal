import type {
    Goal,
    GoalCatalog,
    GoalCatalogEntry,
    GoalStore,
    JsonObject,
    JsonValue,
    Observation,
    RunMode,
    TrajectoryEvent,
    TrajectoryReadQuery,
    TrajectoryReadResult,
} from "../../runtime/src/index";

const MAX_TEXT_LENGTH = 4_000;
const MAX_MESSAGES = 100;
const MAX_RUNS = 50;
const MAX_STEPS_PER_RUN = 200;
const MAX_STEP_SUMMARY_LENGTH = 1_000;
const MAX_BASH_EXECUTION_DETAILS = 100;
const MAX_BASH_COMMAND_LENGTH = 2_000;
const MAX_BASH_OUTPUT_LENGTH = 4_000;

/**
 * Goal 看板中的安全列表条目。
 *
 * @remarks
 * 只包含正式工作区快照目录可验证的身份、意图、Run 状态和更新时间；不返回
 * Profile、模型选择、凭据、Prompt、Benchmark 元数据或完整 Runtime 对象。
 * 长意图会截断，列表仍按 Catalog 提供的更新时间顺序排列。
 *
 * @example
 * ```ts
 * const item: BrowserGoalListItem = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     intent: "实现浏览器会话",
 *     workflowPhase: "executing",
 *     runStatus: "waiting",
 *     updatedAt: "2026-09-26T00:00:00.000Z",
 * };
 * ```
 */
export interface BrowserGoalListItem {
    /** Goal 的稳定身份。 */
    readonly goalId: string;
    /** 当前快照的 Run 身份。 */
    readonly runId: string;
    /** 截断后的真实用户意图。 */
    readonly intent: string;
    /** 当前工作流阶段。 */
    readonly workflowPhase: Goal["state"]["workflow"]["phase"];
    /** 当前 Run 的真实生命周期状态。 */
    readonly runStatus: Goal["state"]["run"]["status"];
    /** Catalog 提供的快照更新时间。 */
    readonly updatedAt: string;
}

/**
 * 可在浏览器会话中展示的用户或助手消息。
 *
 * @remarks
 * 消息保持 Goal Snapshot 中的原始顺序，仅暴露角色、有长度上限的正文和可确定时的
 * Run 身份；Profile 身份及其他 Goal 状态不会随消息返回。
 *
 * @example
 * ```ts
 * const message: BrowserSessionMessage = { role: "assistant", content: "已完成" };
 * ```
 */
export interface BrowserSessionMessage {
    /** 实际持久化消息的说话方。 */
    readonly role: "user" | "assistant";
    /** 截断后的会话正文。 */
    readonly content: string;
    /** 消息所属的 Run；旧历史无法归属时省略。 */
    readonly runId?: string;
}

/**
 * 可在已提交 Bash 步骤中查看的有限执行详情。
 *
 * @remarks
 * 仅包含命令和已提交 Observation 中的白名单结果字段，字段均有字符上限；其他
 * Tool 的输入和输出仍不会通过此类型暴露。
 *
 * @example
 * ```ts
 * const detail: BrowserBashExecutionDetail = {
 *     command: "git status --short",
 *     exitCode: 0,
 *     stdout: "M README.md",
 *     stderr: "",
 * };
 * ```
 */
export interface BrowserBashExecutionDetail {
    /** Bash 收到的限长命令。 */
    readonly command: string;
    /** 仅成功 Observation 提供的退出码。 */
    readonly exitCode?: number;
    /** 仅成功 Observation 提供的标准输出。 */
    readonly stdout?: string;
    /** 仅成功 Observation 提供的标准错误。 */
    readonly stderr?: string;
    /** Bash 失败 Observation 的限长说明。 */
    readonly failure?: string;
}

/**
 * 单条已提交执行步骤的安全浏览器投影。
 *
 * @remarks
 * 步骤只从 Snapshot 提交边界内的 Trajectory 事实构造，并按稳定的 Action 身份合并其
 * 生命周期事件。原始事件、模型推理及非 Bash Tool 输入/输出不会暴露；Bash 步骤仅提供
 * 命令与已提交 Observation 的有限白名单详情。
 *
 * @example
 * ```ts
 * const step: BrowserSessionStep = {
 *     runId: "run-1",
 *     executionUnitId: "unit-1",
 *     sequence: 8,
 *     stepIndex: 1,
 *     decisionKind: "tool_call",
 *     toolId: "read_file",
 *     status: "completed",
 *     summary: "已读取文件",
 * };
 * ```
 */
export interface BrowserSessionStep {
    /** 此步骤所属的 Run。 */
    readonly runId: string;
    /** Runtime 为执行单元分配的稳定身份。 */
    readonly executionUnitId: string;
    /** 此步骤首次出现的已提交 Trajectory 序列。 */
    readonly sequence: number;
    /** Runtime 记录的 Step 序号；缺失时按当前 Run 的顺序生成。 */
    readonly stepIndex: number;
    /** 公开的判定种类，不包含 thought 或完整判定载荷。 */
    readonly decisionKind?: string;
    /** 公开的 Tool 标识，不包含 action input。 */
    readonly toolId?: string;
    /** 已提交 Action 的审批结果。 */
    readonly actionStatus?: "awaiting_approval" | "approved" | "rejected";
    /** 步骤结果类别；不由临时流事件推断。 */
    readonly status: "recorded" | "completed" | "failed" | "rejected";
    /** 限长后的 Tool Observation 摘要。 */
    readonly summary?: string;
    /** 仅 Bash 步骤可见的限长命令与已提交执行结果。 */
    readonly bashExecution?: BrowserBashExecutionDetail;
    /** 会话详情数量上限导致此 Bash 步骤省略执行详情。 */
    readonly bashExecutionOmitted?: true;
}

/**
 * Goal 中单个 Run 的浏览器历史。
 *
 * @remarks
 * 历史步骤只包含该 Run 的已提交 Trajectory；未提交 tail 不会显示。终态 complete
 * 决策由 Run 状态表达，不重复作为单独步骤显示。已归档 Run 的终态由 Snapshot 中的
 * 历史记录确定，当前 Run 的状态直接取自最新快照。
 *
 * @example
 * ```ts
 * const run: BrowserSessionRun = {
 *     runId: "run-1", status: "completed", stepCount: 2, steps: [], current: true,
 * };
 * ```
 */
export interface BrowserSessionRun {
    /** Run 的稳定身份。 */
    readonly runId: string;
    /** Run 的真实生命周期状态。 */
    readonly status: Goal["state"]["run"]["status"];
    /** Snapshot 记录的 Runtime Step 数量，可能包含不单独显示的 complete 决策。 */
    readonly stepCount: number;
    /** 该 Run 的有界、已提交步骤历史。 */
    readonly steps: readonly BrowserSessionStep[];
    /** 是否为当前快照中的 Run。 */
    readonly current: boolean;
}

/**
 * 当前等待交互的安全白名单视图。
 *
 * @remarks
 * 只投影 AskUser 的问题/选项或任务提案的目标/完成条件；内部 Patch、模型输出原文及
 * 与提交操作无关的 Runtime 数据不会暴露。
 *
 * @example
 * ```ts
 * const pending: BrowserPendingInteraction = {
 *     kind: "ask_user", requestId: "ask-1", mode: "execution", questions: [],
 * };
 * ```
 */
export type BrowserPendingInteraction =
    | {
        readonly kind: "ask_user";
        readonly requestId: string;
        readonly mode: "plan" | "execution";
        readonly questions: readonly {
            readonly id: string;
            readonly header: string;
            readonly question: string;
            readonly multiSelect: boolean;
            readonly options: readonly {
                readonly id: string;
                readonly label: string;
                readonly description?: string;
            }[];
        }[];
    }
    | {
        readonly kind: "task_approval";
        readonly requestId: string;
        readonly objective: string;
        readonly approvalRequest: string;
        readonly completionCriteria: readonly string[];
    };

/**
 * GoalPlan 的浏览器视图。
 *
 * @remarks
 * 仅当 Goal Snapshot 实际包含 GoalPlan 时出现。缺少计划时响应省略此字段，不创建
 * 示例 Todo、占位进度或推算完成比例。
 *
 * @example
 * ```ts
 * const plan: BrowserGoalPlan = { revision: 1, items: [] };
 * ```
 */
export interface BrowserGoalPlan {
    /** Runtime 成功更新计划时递增的版本。 */
    readonly revision: number;
    /** 按 Runtime 规范顺序排列的计划项。 */
    readonly items: readonly {
        readonly id: string;
        readonly content: string;
        readonly position: number;
        readonly status: "pending" | "in_progress" | "completed" | "cancelled";
    }[];
}

/**
 * 从最新正式工作区快照与已提交轨迹构造的会话响应。
 *
 * @remarks
 * 这是显式白名单 DTO，不可替换为序列化 Goal、Trajectory Event 或 TUI ViewModel。
 * 消息、Run 和步骤历史具有确定的数量/文本上限，`historyTruncated` 指示是否省略了
 * 更早内容。待处理 Action 只返回身份、Tool 名称与审批状态，不返回原始输入。
 *
 * @example
 * ```ts
 * const session: BrowserGoalSession = {
 *     goalId: "goal-1", intent: "检查项目", currentRunId: "run-1",
 *     runStatus: "waiting", currentRunMode: "normal", messages: [], runs: [], historyTruncated: false,
 * };
 * ```
 */
export interface BrowserGoalSession {
    /** Goal 的稳定身份。 */
    readonly goalId: string;
    /** 截断后的真实用户意图。 */
    readonly intent: string;
    /** 当前快照的 Run 身份。 */
    readonly currentRunId: string;
    /** 当前 Run 的真实生命周期状态。 */
    readonly runStatus: Goal["state"]["run"]["status"];
    /** 当前 Run 实际使用的模式。 */
    readonly currentRunMode: RunMode;
    /** 已完成 Run 后用户为下一 Run 显式选择的模式。 */
    readonly nextRunMode?: "plan";
    /** 按 Snapshot 顺序排列的有界真实消息。 */
    readonly messages: readonly BrowserSessionMessage[];
    /** 按 Run 时间顺序排列的当前 Run 与近期已归档 Run。 */
    readonly runs: readonly BrowserSessionRun[];
    /** 仅在 Snapshot 包含计划时出现。 */
    readonly goalPlan?: BrowserGoalPlan;
    /** 当前已提交的结构化等待点。 */
    readonly pendingInteraction?: BrowserPendingInteraction;
    /** 当前已提交的待处理 Action；不含原始 Action 输入。 */
    readonly pendingAction?: {
        readonly actionId: string;
        readonly toolId: string;
        readonly status: "approved" | "awaiting_approval" | "outcome_unknown";
    };
    /** 是否因输出上限截去了较早消息、Run 或步骤。 */
    readonly historyTruncated: boolean;
}

/**
 * 将正式 Goal Catalog 摘要投影为看板白名单条目。
 *
 * @param entries - 正式工作区 Catalog 返回的真实摘要；Benchmark 聚合条目不应传入。
 * @returns 与输入顺序一致的安全条目，不保留输入对象引用。
 * @example
 * ```ts
 * const items = projectBrowserGoalList(await workspaceCatalog.listHistory!());
 * ```
 */
export function projectBrowserGoalList(
    entries: readonly GoalCatalogEntry[],
): readonly BrowserGoalListItem[] {
    return entries.map((entry) => ({
        goalId: entry.goalId,
        runId: entry.runId,
        intent: boundedText(entry.intent, MAX_TEXT_LENGTH),
        workflowPhase: entry.workflowPhase,
        runStatus: entry.runStatus,
        updatedAt: entry.updatedAt,
    }));
}

/**
 * 从真实正式工作区 Catalog 读取看板条目。
 *
 * @param catalog - 仅指向正式 workspace Goals 目录的目录边界。
 * @returns 全部已持久化真实 Goal；Catalog 错误向调用方传播，不伪造空条目。
 * @throws Catalog 未实现全量历史列表或目录读取失败时拒绝，避免静默漏掉终态 Goal。
 * @example
 * ```ts
 * const goals = await listBrowserGoals(root.workspaceGoalStore);
 * ```
 */
export async function listBrowserGoals(
    catalog: GoalCatalog,
): Promise<readonly BrowserGoalListItem[]> {
    if (catalog.listHistory === undefined) {
        throw new Error("Browser Goal listing requires a full Goal history catalog");
    }
    const entries = await catalog.listHistory();
    return projectBrowserGoalList(entries);
}

/**
 * 从正式工作区 Snapshot 与各 Run 的已提交 Trajectory 投影浏览器会话。
 *
 * @param goalId - 要恢复的 Goal 稳定标识。
 * @param store - 正式工作区 Snapshot 读取端口；不得传入含 Benchmark 回退行为的聚合 Store。
 * @param readTrajectory - 限定正式工作区并按 Snapshot 边界分类事件的读取器。
 * @returns 最新白名单会话；Goal 不存在时返回 `undefined`，损坏或 I/O 错误向上拒绝。
 * @throws Snapshot 或 Trajectory 无法读取时传播错误，调用方应返回读取错误而非旧视图。
 * @example
 * ```ts
 * const session = await readBrowserGoalSession(goalId, root.workspaceGoalStore, root.readWorkspaceTrajectory);
 * ```
 */
export async function readBrowserGoalSession(
    goalId: string,
    store: Pick<GoalStore, "restore">,
    readTrajectory: (query: TrajectoryReadQuery) => Promise<Readonly<TrajectoryReadResult>>,
): Promise<BrowserGoalSession | undefined> {
    const goal = await store.restore(goalId);
    if (goal === undefined) return undefined;

    const completedRuns = goal.state.completedRuns ?? [];
    const recentCompletedRuns = completedRuns.slice(-Math.max(0, MAX_RUNS - 1));
    const projectedRuns: BrowserSessionRun[] = [];
    let historyTruncated = completedRuns.length > recentCompletedRuns.length;
    const bashDetailsBudget = { remaining: MAX_BASH_EXECUTION_DETAILS };

    const currentRun = goal.state.run;
    const currentResult = await readTrajectory({ goalId, runId: currentRun.id });
    const currentSteps = projectBrowserSteps(currentRun.id, currentResult.committed, bashDetailsBudget);
    if (currentSteps.length > MAX_STEPS_PER_RUN) historyTruncated = true;
    projectedRuns.push({
        runId: currentRun.id,
        status: currentRun.status,
        stepCount: currentRun.stepCount,
        steps: currentSteps.slice(-MAX_STEPS_PER_RUN),
        current: true,
    });

    for (const completed of [...recentCompletedRuns].reverse()) {
        const result = await readTrajectory({ goalId, runId: completed.runId });
        const steps = projectBrowserSteps(completed.runId, result.committed, bashDetailsBudget);
        if (steps.length > MAX_STEPS_PER_RUN) historyTruncated = true;
        projectedRuns.unshift({
            runId: completed.runId,
            status: completed.status,
            stepCount: completed.stepCount,
            steps: steps.slice(-MAX_STEPS_PER_RUN),
            current: false,
        });
    }

    const allMessages = goal.state.messages;
    if (allMessages.length > MAX_MESSAGES) historyTruncated = true;
    const firstMessageIndex = Math.max(0, allMessages.length - MAX_MESSAGES);
    const currentMessageStart = completedRuns.at(-1)?.messageRange.end ?? 0;
    const messages = allMessages.slice(firstMessageIndex).map((message, offset) => {
        const messageIndex = firstMessageIndex + offset;
        const completedRun = findCompletedRunForMessage(completedRuns, messageIndex);
        const runId = completedRun?.runId
            ?? (messageIndex >= currentMessageStart ? currentRun.id : undefined);
        return {
            role: message.role,
            content: boundedText(message.content, MAX_TEXT_LENGTH),
            ...(runId === undefined ? {} : { runId }),
        };
    });
    if (allMessages.some((message) => message.content.length > MAX_TEXT_LENGTH)) {
        historyTruncated = true;
    }

    const pendingInteraction = projectPendingInteraction(currentRun.pendingInteraction);
    const pendingAction = currentRun.pendingAction === undefined
        ? undefined
        : {
            actionId: currentRun.pendingAction.action.actionId,
            toolId: currentRun.pendingAction.action.toolId,
            status: currentRun.pendingAction.status,
        };
    const goalPlan = goal.state.goalPlan === undefined
        ? undefined
        : projectGoalPlan(goal.state.goalPlan);

    return {
        goalId: goal.id,
        intent: boundedText(goal.definition.intent, MAX_TEXT_LENGTH),
        currentRunId: currentRun.id,
        runStatus: currentRun.status,
        currentRunMode: currentRun.mode,
        ...(goal.state.nextRunMode === undefined ? {} : { nextRunMode: goal.state.nextRunMode }),
        messages,
        runs: projectedRuns,
        ...(goalPlan === undefined ? {} : { goalPlan }),
        ...(pendingInteraction === undefined ? {} : { pendingInteraction }),
        ...(pendingAction === undefined ? {} : { pendingAction }),
        historyTruncated,
    };
}

/**
 * 只使用已提交 Trajectory 事件构造浏览器步骤；未提交 tail 应由调用方省略。
 */
function projectBrowserSteps(
    runId: string,
    committedEvents: readonly TrajectoryEvent[],
    bashDetailsBudget: { remaining: number },
): readonly BrowserSessionStep[] {
    const actionByExecutionUnit = new Map<string, string | null>();
    for (const event of committedEvents) {
        if (event.executionUnitId === undefined) continue;
        const actionId = trajectoryActionId(event);
        if (actionId === undefined) continue;
        const existing = actionByExecutionUnit.get(event.executionUnitId);
        if (existing === undefined) actionByExecutionUnit.set(event.executionUnitId, actionId);
        else if (existing !== actionId) actionByExecutionUnit.set(event.executionUnitId, null);
    }

    const groups = new Map<string, TrajectoryEvent[]>();
    for (const event of committedEvents) {
        if (event.executionUnitId === undefined) continue;
        const actionId = trajectoryActionId(event)
            ?? actionByExecutionUnit.get(event.executionUnitId)
            ?? undefined;
        const groupId = actionId === undefined ? `unit:${event.executionUnitId}` : `action:${actionId}`;
        const group = groups.get(groupId) ?? [];
        group.push(event);
        groups.set(groupId, group);
    }

    const steps: BrowserSessionStep[] = [];
    for (const events of groups.values()) {
        events.sort((left, right) => left.sequence - right.sequence);
        const first = events[0];
        if (first === undefined) continue;

        const executionUnitId = first.executionUnitId;
        if (executionUnitId === undefined) continue;
        let decisionKind: string | undefined;
        let toolId: string | undefined;
        let actionStatus: BrowserSessionStep["actionStatus"];
        let status: BrowserSessionStep["status"] = "recorded";
        let summary: string | undefined;
        let bashCommand: string | undefined;
        let bashObservation: Observation | undefined;

        for (const event of events) {
            const payload = event.payload;
            if (payload.type === "decision_received") {
                decisionKind = payload.decision.kind;
                if (payload.decision.kind === "tool_call") {
                    toolId = payload.decision.action.toolId;
                }
            } else if (payload.type === "action_staged") {
                toolId = payload.action.toolId;
                actionStatus = payload.approvalStatus;
                if (payload.action.toolId === "bash") {
                    bashCommand = readBashCommand(payload.action.input);
                }
            } else if (payload.type === "action_approved") {
                actionStatus = "approved";
            } else if (payload.type === "action_rejected") {
                actionStatus = "rejected";
                status = "rejected";
            } else if (payload.type === "observation_recorded") {
                bashObservation = payload.observation;
                if (payload.observation.kind === "success") {
                    status = "completed";
                    summary = boundedText(payload.observation.summary, MAX_STEP_SUMMARY_LENGTH);
                } else if (payload.observation.kind === "failure") {
                    status = "failed";
                    summary = boundedText(payload.observation.message, MAX_STEP_SUMMARY_LENGTH);
                } else {
                    status = "rejected";
                }
            } else if (payload.type === "tool_finished") {
                // A recovery checkpoint can adopt an old uncommitted tail; without the
                // persisted Observation it must not present a Tool result as a saved Step.
                toolId = payload.toolId;
            } else if (payload.type === "tool_started" && payload.toolId === "bash") {
                toolId = payload.toolId;
                bashCommand = readBashCommand(payload.input);
            }
        }

        // complete 决策由 Run 终态展示，不另列一条没有 Action 的重复步骤。
        if (decisionKind === "complete" && toolId === undefined) continue;

        let bashExecution: BrowserBashExecutionDetail | undefined;
        let bashExecutionOmitted: true | undefined;
        if (toolId === "bash" && bashCommand !== undefined) {
            if (bashDetailsBudget.remaining > 0) {
                bashDetailsBudget.remaining -= 1;
                bashExecution = projectBashExecution(bashCommand, bashObservation);
            } else {
                bashExecutionOmitted = true;
            }
        }

        steps.push({
            runId,
            executionUnitId,
            sequence: first.sequence,
            stepIndex: first.stepIndex ?? steps.length + 1,
            ...(decisionKind === undefined ? {} : { decisionKind }),
            ...(toolId === undefined ? {} : { toolId }),
            ...(actionStatus === undefined ? {} : { actionStatus }),
            status,
            ...(summary === undefined ? {} : { summary }),
            ...(bashExecution === undefined ? {} : { bashExecution }),
            ...(bashExecutionOmitted === undefined ? {} : { bashExecutionOmitted }),
        });
    }
    return steps.sort((left, right) => left.sequence - right.sequence);
}

function projectPendingInteraction(
    pending: Goal["state"]["run"]["pendingInteraction"],
): BrowserPendingInteraction | undefined {
    if (pending === undefined) return undefined;
    if (pending.kind === "ask_user") {
        return {
            kind: "ask_user",
            requestId: pending.requestId,
            mode: pending.mode,
            questions: pending.questions.map((question) => ({
                id: question.id,
                header: boundedText(question.header, 500),
                question: boundedText(question.question, 2_000),
                multiSelect: question.multiSelect,
                options: question.options.map((option) => ({
                    id: option.id,
                    label: boundedText(option.label, 500),
                    ...(option.description === undefined
                        ? {}
                        : { description: boundedText(option.description, 1_000) }),
                })),
            })),
        };
    }
    return {
        kind: "task_approval",
        requestId: pending.requestId,
        objective: boundedText(pending.proposal.objective, 2_000),
        approvalRequest: boundedText(pending.approvalRequest, 1_000),
        completionCriteria: pending.proposal.completionCriteria
            .slice(0, 32)
            .map((criterion) => boundedText(criterion.text, 1_000)),
    };
}

function projectGoalPlan(plan: NonNullable<Goal["state"]["goalPlan"]>): BrowserGoalPlan {
    return {
        revision: plan.revision,
        items: plan.items.map((item) => ({
            id: item.id,
            content: boundedText(item.content, 1_000),
            position: item.position,
            status: item.status,
        })),
    };
}

function trajectoryActionId(event: TrajectoryEvent): string | undefined {
    if (event.actionId !== undefined) return event.actionId;
    const payload = event.payload;
    if (payload.type === "decision_received") {
        return payload.decision.kind === "tool_call" ? payload.decision.action.actionId : undefined;
    }
    if (payload.type === "action_staged") return payload.action.actionId;
    if (
        payload.type === "action_approved"
        || payload.type === "action_rejected"
        || payload.type === "action_recovered"
        || payload.type === "tool_started"
        || payload.type === "tool_finished"
        || payload.type === "observation_recorded"
    ) {
        return payload.actionId;
    }
    return undefined;
}

function readBashCommand(input: JsonValue): string | undefined {
    if (!isJsonObject(input)) return undefined;
    const command = input.command;
    return typeof command === "string" ? command : undefined;
}

function projectBashExecution(
    command: string,
    observation: Observation | undefined,
): BrowserBashExecutionDetail {
    if (observation?.kind === "success") {
        const output = observation.output;
        const result = isJsonObject(output) ? output : undefined;
        return {
            command: boundedText(command, MAX_BASH_COMMAND_LENGTH),
            ...(typeof result?.exitCode === "number" ? { exitCode: result.exitCode } : {}),
            ...(typeof result?.stdout === "string"
                ? { stdout: boundedText(result.stdout, MAX_BASH_OUTPUT_LENGTH) }
                : {}),
            ...(typeof result?.stderr === "string"
                ? { stderr: boundedText(result.stderr, MAX_BASH_OUTPUT_LENGTH) }
                : {}),
        };
    }
    return {
        command: boundedText(command, MAX_BASH_COMMAND_LENGTH),
        ...(observation?.kind === "failure"
            ? { failure: boundedText(observation.message, MAX_BASH_OUTPUT_LENGTH) }
            : {}),
    };
}

function isJsonObject(value: JsonValue): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findCompletedRunForMessage(
    completedRuns: Goal["state"]["completedRuns"],
    messageIndex: number,
): NonNullable<Goal["state"]["completedRuns"]>[number] | undefined {
    const records = completedRuns ?? [];
    let low = 0;
    let high = records.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const record = records[middle];
        if (record === undefined) return undefined;
        if (messageIndex < record.messageRange.start) high = middle - 1;
        else if (messageIndex >= record.messageRange.end) low = middle + 1;
        else return record;
    }
    return undefined;
}

function boundedText(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}…`;
}
