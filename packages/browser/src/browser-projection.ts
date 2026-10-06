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
import {
    NETWORK_ALL_OUTBOUND_NOTICE,
    type EffectiveSandboxReview,
} from "../../permission/src/index";
import type {
    BrowserBashExecutionDetail,
    BrowserGoalListItem,
    BrowserGoalPlan,
    BrowserGoalSession,
    BrowserPendingAction,
    BrowserPendingInteraction,
    BrowserSessionMessage,
    BrowserSessionRun,
    BrowserSessionStep,
} from "../../web-contracts/src/index";

export type {
    BrowserBashExecutionDetail,
    BrowserGoalListItem,
    BrowserGoalPlan,
    BrowserGoalSession,
    BrowserPendingAction,
    BrowserPendingInteraction,
    BrowserSessionMessage,
    BrowserSessionRun,
    BrowserSessionStep,
};

const MAX_TEXT_LENGTH = 4_000;
const MAX_MESSAGE_LENGTH = 64_000;
const MAX_ACTION_PREVIEW_LENGTH = 320;
const MAX_MESSAGES = 100;
const MAX_RUNS = 50;
const MAX_STEPS_PER_RUN = 200;
const MAX_STEP_SUMMARY_LENGTH = 1_000;
const MAX_BASH_EXECUTION_DETAILS = 100;
const MAX_BASH_COMMAND_LENGTH = 2_000;
const MAX_BASH_OUTPUT_LENGTH = 4_000;

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
    activeGoalId?: string,
): readonly BrowserGoalListItem[] {
    return entries.map((entry) => {
        const isActive = activeGoalId !== undefined && entry.goalId === activeGoalId;
        const state = isActive ? "active"
            : (entry.runStatus === "created" || entry.runStatus === "running") ? "recoverable"
                : "inactive";
        return {
            goalId: entry.goalId,
            runId: entry.runId,
            intent: boundedText(entry.intent, MAX_TEXT_LENGTH),
            workflowPhase: entry.workflowPhase,
            runStatus: entry.runStatus,
            execution: {
                state,
                committedThroughSequence: entry.committedThroughSequence ?? 0,
            },
            updatedAt: entry.updatedAt,
            archived: entry.archived === true,
        };
    });
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
    activeGoalId?: string,
): Promise<readonly BrowserGoalListItem[]> {
    if (catalog.listHistory === undefined) {
        throw new Error("Browser Goal listing requires a full Goal history catalog");
    }
    const entries = await catalog.listHistory();
    return projectBrowserGoalList(entries, activeGoalId);
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
    activeGoalId?: string,
): Promise<BrowserGoalSession | undefined> {
    const goal = await store.restore(goalId);
    if (goal === undefined) return undefined;

    const isActive = activeGoalId !== undefined && goal.id === activeGoalId;
    const executionState = isActive ? "active"
        : (goal.state.run.status === "created" || goal.state.run.status === "running") ? "recoverable"
            : "inactive";

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
        ...projectRunTerminalDetail(currentResult.committed, currentRun.status, currentRun.stopReason),
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
            ...projectRunTerminalDetail(result.committed, completed.status),
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
            content: boundedText(message.content, MAX_MESSAGE_LENGTH),
            ...(runId === undefined ? {} : { runId }),
        };
    });
    if (allMessages.some((message) => message.content.length > MAX_MESSAGE_LENGTH)) {
        historyTruncated = true;
    }

    const pendingInteraction = projectPendingInteraction(currentRun.pendingInteraction);
    const pendingAction = currentRun.pendingAction === undefined
        ? undefined
        : projectPendingAction(currentRun.pendingAction, currentRun.pendingProgram);
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
        execution: {
            state: executionState,
            committedThroughSequence: currentRun.committedThroughSequence ?? 0,
        },
        messages,
        runs: projectedRuns,
        ...(goalPlan === undefined ? {} : { goalPlan }),
        ...(pendingInteraction === undefined ? {} : { pendingInteraction }),
        ...(pendingAction === undefined ? {} : { pendingAction }),
        historyTruncated,
    };
}

function projectPendingAction(
    action: NonNullable<Goal["state"]["run"]["pendingAction"]>,
    program?: Goal["state"]["run"]["pendingProgram"],
): NonNullable<BrowserGoalSession["pendingAction"]> {
    const completeInput = JSON.stringify(action.action.input);
    const inputPreview = boundedText(completeInput, MAX_ACTION_PREVIEW_LENGTH);
    const input = action.action.input;
    const command = action.action.toolId === "bash" ? readBashCommand(input) : undefined;
    const inputSummary = command === undefined ? projectToolInputSummary(action.action.toolId, input)
        : boundedText(command, MAX_ACTION_PREVIEW_LENGTH);
    const targetPath = isJsonObject(input)
        && (action.action.toolId === "write_file" || action.action.toolId === "edit_file")
        && typeof input.path === "string"
        ? boundedText(input.path, MAX_ACTION_PREVIEW_LENGTH)
        : undefined;
    let sandboxReview: EffectiveSandboxReview | undefined = undefined;
    if (action.effectiveSandboxScope !== undefined) {
        const { extraFiles, network } = action.effectiveSandboxScope;
        if (extraFiles.length > 0 || network !== "none") {
            sandboxReview = {
                extraFiles,
                network,
                ...(network === "all_outbound" ? { networkNotice: NETWORK_ALL_OUTBOUND_NOTICE } : {}),
            };
        }
    }

    return {
        actionId: action.action.actionId,
        toolId: action.action.toolId,
        status: action.status,
        ...(inputSummary === undefined ? {} : { inputSummary }),
        inputPreview,
        inputPreviewTruncated: completeInput.length > MAX_ACTION_PREVIEW_LENGTH,
        ...(targetPath === undefined ? {} : { targetPath }),
        ...(action.approvalKind === undefined ? {} : { approvalKind: action.approvalKind }),
        ...(sandboxReview === undefined ? {} : { sandboxReview }),
        ...(program === undefined ? {} : {
            parentProgram: { actionId: program.action.actionId, callNumber: program.nextCallIndex + 1 },
        }),
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
        if (event.programId !== undefined) continue;
        if (event.executionUnitId === undefined) continue;
        const actionId = trajectoryActionId(event);
        if (actionId === undefined) continue;
        const existing = actionByExecutionUnit.get(event.executionUnitId);
        if (existing === undefined) actionByExecutionUnit.set(event.executionUnitId, actionId);
        else if (existing !== actionId) actionByExecutionUnit.set(event.executionUnitId, null);
    }

    const groups = new Map<string, TrajectoryEvent[]>();
    for (const event of committedEvents) {
        if (event.programId !== undefined) continue;
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
        let inputSummary: string | undefined;
        let bashCommand: string | undefined;
        let bashObservation: Observation | undefined;
        const recoveryAttempts: string[] = [];

        for (const event of events) {
            const payload = event.payload;
            if (payload.type === "decision_received") {
                decisionKind = payload.decision.kind;
                if (payload.decision.kind === "tool_call") {
                    toolId = payload.decision.action.toolId;
                }
            } else if (payload.type === "action_staged") {
                toolId = payload.action.toolId;
                inputSummary = projectToolInputSummary(toolId, payload.action.input);
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
            } else if (payload.type === "tool_started") {
                toolId = payload.toolId;
                inputSummary = projectToolInputSummary(toolId, payload.input);
                if (toolId === "bash") bashCommand = readBashCommand(payload.input);
            } else if (payload.type === "tool_attempt_started") {
                recoveryAttempts.push(`Tool attempt ${payload.attempt}`);
            } else if (payload.type === "tool_attempt_failed") {
                recoveryAttempts.push(`Tool retry ${payload.attempt} failed: ${boundedText(payload.reason, 160)}`);
            } else if (payload.type === "model_repair_attempt_started") {
                if (payload.attempt > 1) recoveryAttempts.push(`${payload.stage} output retry ${payload.attempt}`);
            } else if (payload.type === "model_repair_feedback_recorded") {
                recoveryAttempts.push(`${payload.feedback.stage} repair feedback: ${payload.feedback.code}`);
            } else if (payload.type === "model_request_retry_recorded") {
                recoveryAttempts.push(`${payload.stage} model request attempt ${payload.attempt} failed: ${payload.reason}${payload.status === undefined ? "" : ` HTTP ${payload.status}`}`);
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
            ...(inputSummary === undefined ? {} : { inputSummary }),
            ...(bashExecution === undefined ? {} : { bashExecution }),
            ...(bashExecutionOmitted === undefined ? {} : { bashExecutionOmitted }),
            ...(recoveryAttempts.length === 0 ? {} : { recoveryAttempts }),
        });
    }
    return steps.sort((left, right) => left.sequence - right.sequence);
}

function projectRunTerminalDetail(
    events: readonly TrajectoryEvent[],
    status: Goal["state"]["run"]["status"],
    stopReason?: Goal["state"]["run"]["stopReason"],
): Pick<BrowserSessionRun, "terminalDetail"> | Record<string, never> {
    if (status === "failed" && stopReason?.kind === "execution_error") {
        return { terminalDetail: { code: stopReason.code, message: boundedText(stopReason.message, MAX_STEP_SUMMARY_LENGTH) } };
    }
    for (const event of [...events].reverse()) {
        const payload = event.payload;
        if (payload.type === "run_failed" || payload.type === "execution_error") {
            return { terminalDetail: { code: String(payload.code), message: boundedText(payload.message, MAX_STEP_SUMMARY_LENGTH) } };
        }
        if (status === "waiting" && payload.type === "run_waiting") {
            return { terminalDetail: { message: boundedText(payload.reason, MAX_STEP_SUMMARY_LENGTH) } };
        }
    }
    return {};
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

function projectToolInputSummary(toolId: string, input: JsonValue): string | undefined {
    if (!isJsonObject(input)) return undefined;
    const key = toolId === "read_file" || toolId === "write_file" || toolId === "edit_file" ? "path"
        : toolId === "grep" ? "pattern"
            : toolId === "web_search" ? "query"
                : toolId === "web_fetch" ? "url" : undefined;
    const value = key === undefined ? undefined : input[key];
    return typeof value === "string" ? boundedText(value.replace(/\s+/g, " ").trim(), 240) : undefined;
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

function isJsonObject(value: JsonValue): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
