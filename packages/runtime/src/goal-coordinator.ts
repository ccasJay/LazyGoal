import type {
    Goal,
    GoalTask,
    GoalProtocolValidator,
    JsonValue,
    RunRef,
    AskUserAnswer,
    AskUserQuestion,
} from "./domain";
import type { GoalStore } from "./goal-store";
import type { PreparationExecutor } from "./preparation-executor";
import { validateAskUserAnswers } from "../../contracts/src/index";
import type { ContextLookupPort } from "./context-retrieval";
import type { RunScheduler } from "./scheduler";
import {
    InMemoryToolRegistry,
    type ToolObservation,
    type ToolRegistry,
} from "./tool";
import {
    throwIfAborted,
    type ExecutionControl,
} from "./execution-control";
import { transition } from "./transition";
import {
    type DiagnosticTraceSink,
    type TrajectoryEventDraft,
    type TrajectoryStore,
} from "./trajectory";
import {
    advanceContextEpoch,
    selectLatestConversationStart,
    toEpochRange,
} from "./context-epoch";
import type { WorkingMemoryLimitsInput } from "./working-memory-core";
import {
    TrajectoryCheckpointCommitter,
    type TrajectoryCheckpointCommitterPort,
} from "./trajectory-checkpoint-committer";

function cloneCriterion(criterion: GoalTask["completionCriteria"][number]): GoalTask["completionCriteria"][number] {
    return {
        text: criterion.text,
        ...(criterion.acceptance === undefined
            ? {}
            : {
                acceptance: {
                    expectToolId: criterion.acceptance.expectToolId,
                    expectOutcome: criterion.acceptance.expectOutcome,
                },
            }),
    };
}

function cloneTask(task: GoalTask): GoalTask {
    return {
        objective: task.objective,
        completionCriteria: task.completionCriteria.map(cloneCriterion),
    };
}

function formatAskUserAnswers(
    questions: readonly AskUserQuestion[],
    answers: readonly AskUserAnswer[],
): string {
    const answerMap = new Map(answers.map((a) => [a.questionId, a]));
    const blocks: string[] = [];

    for (const q of questions) {
        const answer = answerMap.get(q.id);
        if (!answer) continue;

        const selectedLabels: string[] = [];
        for (const optId of answer.optionIds) {
            const matchedOpt = q.options.find((o) => o.id === optId);
            if (matchedOpt) {
                selectedLabels.push(matchedOpt.label);
            }
        }
        if (answer.otherText !== undefined && answer.otherText.trim().length > 0) {
            selectedLabels.push(`Other: ${answer.otherText.trim()}`);
        }

        blocks.push(
            `### ${q.header}\n${q.question}\nAnswer: ${selectedLabels.join(", ")}`,
        );
    }

    return blocks.join("\n\n");
}

/** Goal 推进失败时返回的稳定业务错误码。 */
export type GoalProgressErrorCode =
    | "RUN_NOT_FOUND"
    | "GOAL_NOT_WAITING"
    | "INVALID_GOAL_INPUT"
    | "INVALID_PHASE_RESULT"
    | "ACTION_NOT_AUTHORIZED"
    | "INVALID_CONTEXT_LOOKUP"
    | "CONTEXT_LOOKUP_CHAIN_LIMIT"
    | "TOOL_NOT_AUTHORIZED"
    | "TOOL_NOT_FOUND"
    | "PREPARATION_READ_ONLY_VIOLATION"
    | "PREPARATION_PROBE_LIMIT_EXCEEDED"
    | "INVALID_TOOL_INPUT"
    | "TOOL_EXECUTION_ERROR";

/**
 * 用户对 Goal 当前交互等待点提交的操作。
 *
 * @remarks
 * 统一执行生命周期支持以下用户操作：
 * - `message`: 向普通 wait/blocked 等待追加用户消息；
 * - `approve_task`: 批准当前任务提案并将其固定为最终任务，推进执行；
 * - `feedback_task`: 对当前任务提案提供反馈，使旧提案失效并重新规划；
 * - `answer_ask_user`: 回答 Agent 发起的 `ask_user` 结构化问卷；
 * - `approve_action`: 批准待审批的工具调用（附带一次性授权）；
 * - `reject_action`: 拒绝待审批的工具调用并记录原因。
 * 兼容分支 `approve` 与 `approve_task` 行为一致。
 *
 * @example
 * ```ts
 * const action: GoalUserAction = {
 *   kind: "approve_task",
 *   requestId: "proposal-1",
 * };
 * ```
 */
export type GoalUserAction =
    | { readonly kind: "message"; readonly content: string }
    | { readonly kind: "approve_task"; readonly requestId?: string }
    | { readonly kind: "feedback_task"; readonly requestId?: string; readonly feedback: string }
    | {
        readonly kind: "answer_ask_user";
        readonly requestId: string;
        readonly answers: readonly AskUserAnswer[];
    }
    | { readonly kind: "approve_action"; readonly actionId: string }
    | {
        readonly kind: "reject_action";
        readonly actionId: string;
        readonly reason: string;
    }
    | { readonly kind: "approve"; readonly requestId?: string };

/**
 * 恢复等待中 Goal 所需的稳定关联键与用户操作。
 *
 * @example
 * ```ts
 * const request: ResumeGoalRequest = {
 *   ref: { goalId: "goal-1", runId: "run-1" },
 *   action: { kind: "approve_task" },
 * };
 * ```
 */
export interface ResumeGoalRequest {
    /** 目标 Goal 与当前 Run 的关联键。 */
    readonly ref: RunRef;
    /** 与当前等待类型匹配的用户操作。 */
    readonly action: GoalUserAction;
}

/**
 * GoalCoordinator 推进一次 Goal 后到达的等待点、执行终态或业务失败。
 *
 * @remarks
 * 统一执行生命周期中 phase 恒为 `executing`。
 * 等待点细分为：
 * - `ask_user`: 等待回答 Agent 结构化提问；
 * - `task_approval`: 等待用户批准或反馈任务提案；
 * - `action_approval`: 等待审批副作用工具调用；
 * - `action_recovery`: 等待恢复结果未知的工具调用；
 * - `blocked`: 等待解除 Agent 主动发起的 wait。
 *
 * @example
 * ```ts
 * const result = await coordinator.advance({ goalId: "goal-1", runId: "run-1" });
 * if (result.ok && result.kind === "waiting") {
 *   console.log(result.waitingFor);
 * }
 * ```
 */
export type GoalProgressResult =
    | {
        readonly ok: true;
        readonly kind: "waiting";
        readonly phase: "executing";
        readonly waitingFor:
            | "ask_user"
            | "task_approval"
            | "action_approval"
            | "action_recovery"
            | "blocked";
        readonly goal: Goal;
    }
    | {
        readonly ok: true;
        readonly kind: "terminal";
        readonly phase: "executing";
        readonly goal: Goal;
    }
    | {
        readonly ok: false;
        readonly error: {
            readonly code: GoalProgressErrorCode;
            readonly message: string;
        };
    };

/**
 * 只读探查生命周期事件。
 *
 * @remarks
 * 用于通知上层控制器或 TUI 呈现探查进度。
 *
 * @example
 * ```ts
 * const event: PreparationProbeProgressEvent = {
 *   kind: "started",
 *   actionId: "probe-1",
 *   goalId: "goal-1",
 *   toolId: "read_file",
 *   input: { path: "package.json" },
 *   probeNumber: 1,
 * };
 * ```
 */
export type PreparationProbeProgressEvent =
    | {
        readonly kind: "started";
        readonly actionId: string;
        readonly goalId: string;
        readonly toolId: string;
        readonly input: JsonValue;
        readonly probeNumber: number;
    }
    | {
        readonly kind: "finished";
        readonly actionId: string;
        readonly goalId: string;
        readonly toolId: string;
        readonly input: JsonValue;
        readonly observation: ToolObservation;
        readonly probeNumber: number;
    }
    | {
        readonly kind: "failed";
        readonly actionId: string;
        readonly goalId: string;
        readonly toolId: string;
        readonly input: JsonValue;
        readonly message: string;
        readonly probeNumber: number;
    };

/**
 * 创建 {@link GoalCoordinator} 所需的执行与持久化依赖。
 *
 * @remarks
 * Coordinator 作为外层调度控制器，推进 Goal 执行并处理交互恢复。
 *
 * @example
 * ```ts
 * const coordinator = new GoalCoordinator({ store, scheduler });
 * ```
 */
export interface GoalCoordinatorDependencies {
    /** 用于恢复和保存 Goal 最新完整快照。 */
    readonly store: GoalStore;
    /**
     * 生成 active Preparation 的单轮决策（已废弃）。
     * @deprecated Preparation 阶段已移除，此字段保留仅用于过渡期兼容。
     */
    readonly preparationExecutor?: PreparationExecutor;
    /** 运行 executing Goal，直到 blocked、waiting 或终态。 */
    readonly scheduler: RunScheduler;
    /** 工具注册表；省略时按空 InMemoryToolRegistry 处理。 */
    readonly toolRegistry?: ToolRegistry;
    /** 可选 Domain Event 追加与 Snapshot 边界读取端口；省略时只保存 Snapshot。 */
    readonly trajectoryStore?: TrajectoryStore;
    /** 可选诊断记录边界；诊断故障不得改变 Snapshot 或 Domain Event 语义。 */
    readonly traceSink?: DiagnosticTraceSink;
    /** structured@1 Patch 接受时使用的 Working Memory 限制。 */
    readonly workingMemoryLimits?: WorkingMemoryLimitsInput;
    /** 可选 Prompt/Memory 协议校验器；Composition Root 可用它在推进前执行额外的协议边界校验。 */
    readonly protocolValidator?: GoalProtocolValidator;
    /** 可选共享提交器；省略时由 Coordinator 按当前依赖创建。 */
    readonly checkpointCommitter?: TrajectoryCheckpointCommitterPort;
    /** 只读 committed Trajectory 检索端口；缺失时 lookup 产生 unavailable 结果。 */
    readonly contextLookupPort?: ContextLookupPort;
    /** 可选的探查生命周期事件回调。 */
    readonly onProbeProgress?: (event: PreparationProbeProgressEvent) => void;
}

/**
 * 推进可恢复 Goal，直到下一交互等待点或执行终态。
 *
 * @remarks
 * `advance` 是自动推进入口。新 Goal 直接进入统一执行生命周期。
 * 每次下游调用（调度或恢复）前都会先保存最新完整 Goal；保存失败时错误原样传播。
 * `resume` 恢复处于 `ask_user`、`task_approval`、工具审批或 blocked 等待的 Goal。
 *
 * @example
 * ```ts
 * const result = await coordinator.advance({ goalId: "goal-1", runId: "run-1" });
 * if (result.ok && result.kind === "waiting") {
 *   console.log(result.waitingFor);
 * }
 * ```
 */
export class GoalCoordinator {
    private readonly store: GoalStore;
    private readonly scheduler: RunScheduler;
    private readonly toolRegistry: ToolRegistry;
    private readonly checkpointCommitter: TrajectoryCheckpointCommitterPort;
    private readonly trajectoryStore: TrajectoryStore | undefined;
    private readonly workingMemoryLimits: WorkingMemoryLimitsInput | undefined;
    private readonly protocolValidator: GoalProtocolValidator | undefined;
    private readonly contextLookupPort: ContextLookupPort | undefined;
    private readonly probeListeners = new Set<(event: PreparationProbeProgressEvent) => void>();
    private readonly onProbeProgressCallback: ((event: PreparationProbeProgressEvent) => void) | undefined;

    /** @param dependencies - GoalCoordinatorDependencies。 */
    constructor(dependencies: GoalCoordinatorDependencies) {
        this.store = dependencies.store;
        this.scheduler = dependencies.scheduler;
        this.toolRegistry = dependencies.toolRegistry ?? new InMemoryToolRegistry();
        this.trajectoryStore = dependencies.trajectoryStore;
        this.workingMemoryLimits = dependencies.workingMemoryLimits;
        this.protocolValidator = dependencies.protocolValidator;
        this.contextLookupPort = dependencies.contextLookupPort;
        this.onProbeProgressCallback = dependencies.onProbeProgress;
        this.checkpointCommitter = dependencies.checkpointCommitter
            ?? new TrajectoryCheckpointCommitter({
                store: dependencies.store,
                ...(dependencies.trajectoryStore === undefined
                    ? {}
                    : { trajectoryStore: dependencies.trajectoryStore }),
                ...(dependencies.traceSink === undefined
                    ? {}
                    : { traceSink: dependencies.traceSink }),
            });
    }

    /**
     * 注册探查生命周期事件监听器。
     *
     * @param listener - 接收探查生命周期事件的监听回调。
     * @returns 幂等注销该监听器的清理函数。
     *
     * @example
     * ```ts
     * const unsubscribe = coordinator.onProbeProgress((event) => {
     *   console.log(event.kind, event.toolId);
     * });
     * ```
     */
    onProbeProgress(listener: (event: PreparationProbeProgressEvent) => void): () => void {
        this.probeListeners.add(listener);
        return () => {
            this.probeListeners.delete(listener);
        };
    }

    private notifyProbeProgress(event: PreparationProbeProgressEvent): void {
        try {
            this.onProbeProgressCallback?.(event);
        } catch {
            // 隔离外部回调异常
        }
        for (const listener of this.probeListeners) {
            try {
                listener(event);
            } catch {
                // 隔离监听器异常
            }
        }
    }

    /**
     * 从最新快照自动推进 Goal。
     *
     * @param ref - Goal 与其当前 Run 的关联键。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns 下一等待点、执行终态或稳定业务失败。
     * @throws Scheduler 或 GoalStore 失败时传播原始异常；中止时抛出 `ExecutionAbortedError`。
     *
     * @example
     * ```ts
     * const result = await coordinator.advance({ goalId: "g-1", runId: "r-1" });
     * ```
     */
    async advance(
        ref: RunRef,
        control?: ExecutionControl,
    ): Promise<GoalProgressResult> {
        throwIfAborted(control);
        const goal = await this.restore(ref, control);
        throwIfAborted(control);

        if (goal === undefined) {
            return this.runNotFound(ref);
        }

        this.validateGoalProtocol(goal);

        if (
            goal.state.run.status === "created"
            || goal.state.run.status === "running"
        ) {
            throwIfAborted(control);
            const scheduled = await this.scheduler.schedule(ref, undefined, control);
            throwIfAborted(control);
            return this.afterSchedule(ref, scheduled, control);
        }

        if (goal.state.run.status === "waiting") {
            return this.executingWaitingResult(goal);
        }

        if (
            goal.state.run.status === "completed"
            || goal.state.run.status === "failed"
            || goal.state.run.status === "cancelled"
        ) {
            return {
                ok: true,
                kind: "terminal",
                phase: "executing",
                goal,
            };
        }

        return {
            ok: false,
            error: {
                code: "INVALID_PHASE_RESULT",
                message: `Scheduler left Run "${ref.runId}" in ${goal.state.run.status}`,
            },
        };
    }

    /**
     * 提交交互等待中的用户操作（问答、任务提案批准/反馈、工具审核或消息）。
     *
     * @remarks
     * 交互恢复处理逻辑：
     * - `ask_user`: 校验 requestId 和答案结构，写入 `ask_user_answered` 事实并解除等待；
     * - `task_approval`: 批准将提案固定为最终任务并推进 ContextEpoch；反馈追加用户消息并重新规划；
     * - `approve_action`/`reject_action`: 审核待处理的工具调用；
     * - `message`: 解除因 wait 决策引起的 blocked 等待。
     * 所有恢复分支均先保存最新 Goal 快照，再调用 {@link advance}。
     *
     * @param request - 当前 RunRef 与用户操作。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns 保存后自动推进得到的下一等待点或执行终态。
     * @throws GoalStore 或 Scheduler 失败时传播原始异常；中止时抛出 `ExecutionAbortedError`。
     *
     * @example
     * ```ts
     * const result = await coordinator.resume({
     *   ref: { goalId: "g-1", runId: "r-1" },
     *   action: { kind: "approve_task" },
     * });
     * ```
     */
    async resume(
        request: ResumeGoalRequest,
        control?: ExecutionControl,
    ): Promise<GoalProgressResult> {
        throwIfAborted(control);
        const goal = await this.restore(request.ref, control);
        throwIfAborted(control);

        if (goal === undefined) {
            return this.runNotFound(request.ref);
        }

        this.validateGoalProtocol(goal);

        if (goal.state.run.status !== "waiting") {
            return this.goalNotWaiting(request.ref);
        }

        const pendingInteraction = goal.state.run.pendingInteraction;
        if (pendingInteraction !== undefined) {
            if (pendingInteraction.kind === "ask_user") {
                if (request.action.kind !== "answer_ask_user") {
                    return this.invalidGoalInput(
                        "ask_user interaction requires an answer_ask_user action",
                    );
                }

                if (request.action.requestId.trim().length === 0) {
                    return this.invalidGoalInput("requestId must not be empty");
                }

                if (request.action.requestId !== pendingInteraction.requestId) {
                    return this.invalidGoalInput(
                        `Submitted requestId "${request.action.requestId}" does not match pendingInteraction requestId "${pendingInteraction.requestId}"`,
                    );
                }

                try {
                    validateAskUserAnswers(pendingInteraction.questions, request.action.answers);
                } catch (error) {
                    return this.invalidGoalInput(
                        error instanceof Error ? error.message : String(error),
                    );
                }

                const resolvedRun = transition(goal.state.run, {
                    kind: "resolve_interaction",
                    interactionKind: "ask_user",
                });

                if (!resolvedRun.ok) {
                    throw new Error(
                        `GoalCoordinator invariant violated: ${resolvedRun.error.message}`,
                    );
                }

                const answerContent = formatAskUserAnswers(
                    pendingInteraction.questions,
                    request.action.answers,
                );

                const resumedGoal: Goal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        messages: [
                            ...goal.state.messages,
                            { role: "user", content: answerContent },
                        ],
                        run: resolvedRun.state,
                    },
                };

                throwIfAborted(control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    eventType: "run_resumed",
                    payload: { type: "run_resumed" },
                }, control);

                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    eventType: "ask_user_answered",
                    payload: {
                        type: "ask_user_answered",
                        requestId: pendingInteraction.requestId,
                        answers: request.action.answers,
                    },
                }, control);

                await this.saveCheckpoint(resumedGoal, control);
                return this.advance(request.ref, control);
            }

            if (pendingInteraction.kind === "task_approval") {
                if (
                    request.action.kind === "approve_task"
                    || request.action.kind === "approve"
                ) {
                    if (
                        request.action.requestId !== undefined
                        && pendingInteraction.requestId !== undefined
                        && request.action.requestId !== pendingInteraction.requestId
                    ) {
                        return this.invalidGoalInput(
                            `Submitted requestId "${request.action.requestId}" does not match pendingInteraction requestId "${pendingInteraction.requestId}"`,
                        );
                    }

                    const proposal = pendingInteraction.proposal;
                    const epoch = this.advanceGoalContextEpoch(goal, "planning_approved");
                    const resolvedRun = transition(epoch.goal.state.run, {
                        kind: "resolve_interaction",
                        interactionKind: "task_approval",
                    });

                    if (!resolvedRun.ok) {
                        throw new Error(
                            `GoalCoordinator invariant violated: ${resolvedRun.error.message}`,
                        );
                    }

                    const approvedGoal: Goal = {
                        ...epoch.goal,
                        state: {
                            ...epoch.goal.state,
                            workflow: {
                                phase: "executing",
                                task: cloneTask(proposal),
                            },
                            run: resolvedRun.state,
                        },
                    };

                    throwIfAborted(control);
                    await this.appendTrajectory({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        eventType: "run_resumed",
                        payload: { type: "run_resumed" },
                    }, control);
                    await this.appendTrajectory(epoch.fact, control);
                    await this.appendTrajectory({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        eventType: "task_approved",
                        payload: {
                            type: "task_approved",
                            task: proposal,
                        },
                    }, control);

                    await this.saveCheckpoint(approvedGoal, control);
                    return this.advance(request.ref, control);
                }

                if (
                    request.action.kind === "feedback_task"
                    || request.action.kind === "message"
                ) {
                    const feedbackText = request.action.kind === "feedback_task"
                        ? request.action.feedback
                        : request.action.content;

                    if (feedbackText.trim().length === 0) {
                        return this.invalidGoalInput("Feedback must not be empty");
                    }

                    if (
                        request.action.kind === "feedback_task"
                        && request.action.requestId !== undefined
                        && pendingInteraction.requestId !== undefined
                        && request.action.requestId !== pendingInteraction.requestId
                    ) {
                        return this.invalidGoalInput(
                            `Submitted requestId "${request.action.requestId}" does not match pendingInteraction requestId "${pendingInteraction.requestId}"`,
                        );
                    }

                    const resolvedRun = transition(goal.state.run, {
                        kind: "resolve_interaction",
                        interactionKind: "task_approval",
                    });

                    if (!resolvedRun.ok) {
                        throw new Error(
                            `GoalCoordinator invariant violated: ${resolvedRun.error.message}`,
                        );
                    }

                    const resumedGoal: Goal = {
                        ...goal,
                        state: {
                            ...goal.state,
                            messages: [
                                ...goal.state.messages,
                                { role: "user", content: feedbackText },
                            ],
                            run: resolvedRun.state,
                        },
                    };

                    throwIfAborted(control);
                    await this.appendTrajectory({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        eventType: "run_resumed",
                        payload: { type: "run_resumed" },
                    }, control);

                    await this.saveCheckpoint(resumedGoal, control);
                    return this.advance(request.ref, control);
                }

                return this.invalidGoalInput(
                    "task_approval interaction requires approve_task, feedback_task, or message",
                );
            }

            return this.invalidGoalInput("Unknown pending interaction kind");
        }

        const pendingAction = goal.state.run.pendingAction;

        if (pendingAction !== undefined) {
            if (
                request.action.kind === "approve_action"
                && (
                    pendingAction.status === "awaiting_approval"
                    || pendingAction.status === "outcome_unknown"
                )
            ) {
                if (request.action.actionId.trim().length === 0) {
                    return this.invalidGoalInput("Action ID must not be empty");
                }

                if (request.action.actionId !== pendingAction.action.actionId) {
                    return this.invalidGoalInput(
                        "Approved actionId does not match pendingAction",
                    );
                }

                const approvedRun = transition(goal.state.run, {
                    kind: "approve_action",
                    actionId: request.action.actionId,
                });

                if (!approvedRun.ok) {
                    throw new Error(
                        `GoalCoordinator invariant violated: ${approvedRun.error.message}`,
                    );
                }

                const approvedGoal: Goal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        run: approvedRun.state,
                    },
                };
                throwIfAborted(control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    actionId: request.action.actionId,
                    eventType: "action_approved",
                    payload: {
                        type: "action_approved",
                        actionId: request.action.actionId,
                    },
                }, control);
                await this.saveCheckpoint(approvedGoal, control);
                throwIfAborted(control);
                const scheduled = await this.scheduler.schedule(
                    request.ref,
                    { authorizedActionId: request.action.actionId },
                    control,
                );
                throwIfAborted(control);
                return this.afterSchedule(request.ref, scheduled, control);
            }

            if (request.action.kind === "reject_action") {
                if (request.action.actionId.trim().length === 0) {
                    return this.invalidGoalInput("Action ID must not be empty");
                }

                if (request.action.actionId !== pendingAction.action.actionId) {
                    return this.invalidGoalInput(
                        "Rejected actionId does not match pendingAction",
                    );
                }

                if (request.action.reason.trim().length === 0) {
                    return this.invalidGoalInput("Rejection reason must not be empty");
                }

                const rejectedRun = transition(goal.state.run, {
                    kind: "reject_action",
                    actionId: request.action.actionId,
                    reason: request.action.reason,
                });

                if (!rejectedRun.ok) {
                    throw new Error(
                        `GoalCoordinator invariant violated: ${rejectedRun.error.message}`,
                    );
                }

                const rejectedGoal: Goal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        run: rejectedRun.state,
                    },
                };
                throwIfAborted(control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    actionId: request.action.actionId,
                    eventType: "action_rejected",
                    payload: {
                        type: "action_rejected",
                        actionId: request.action.actionId,
                        reason: request.action.reason,
                    },
                }, control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    actionId: request.action.actionId,
                    eventType: "observation_recorded",
                    payload: {
                        type: "observation_recorded",
                        actionId: request.action.actionId,
                        observation: { kind: "rejected", reason: request.action.reason },
                    },
                }, control);
                await this.saveCheckpoint(rejectedGoal, control);
                return this.advance(request.ref, control);
            }

            return this.invalidGoalInput(
                "pendingAction requires approve_action or reject_action",
            );
        }

        if (request.action.kind !== "message") {
            return this.invalidGoalInput(
                "executing blocked requires a message action",
            );
        }

        if (request.action.content.trim().length === 0) {
            return this.invalidGoalInput("Message content must not be empty");
        }

        const resumedRun = transition(goal.state.run, { kind: "resume" });

        if (!resumedRun.ok) {
            throw new Error(
                `GoalCoordinator invariant violated: ${resumedRun.error.message}`,
            );
        }

        const resumedGoal: Goal = {
            ...goal,
            state: {
                ...goal.state,
                messages: [
                    ...goal.state.messages,
                    { role: "user", content: request.action.content },
                ],
                run: resumedRun.state,
            },
        };
        throwIfAborted(control);
        await this.appendTrajectory({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            eventType: "run_resumed",
            payload: { type: "run_resumed" },
        }, control);
        await this.saveCheckpoint(resumedGoal, control);
        return this.advance(request.ref, control);
    }

    private advanceGoalContextEpoch(
        goal: Goal,
        reason: "conversation_pruned" | "input_threshold" | "planning_approved",
    ): {
        readonly goal: Goal;
        readonly fact: TrajectoryEventDraft;
    } {
        const current = goal.state.run.contextEpoch;
        const messages = goal.state.messages;
        const start = selectLatestConversationStart(
            messages,
            current.conversationStartIndex,
        );
        const boundary = goal.state.run.committedThroughSequence;
        const opened = advanceContextEpoch(current, messages, start, boundary + 2);
        const closed = toEpochRange(current, messages.length, boundary);
        return {
            goal: this.withRun(goal, {
                ...goal.state.run,
                contextEpoch: opened,
            }),
            fact: {
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: goal.state.workflow.phase,
                eventType: "context_epoch_advanced",
                payload: {
                    type: "context_epoch_advanced",
                    closedEpoch: closed,
                    openedEpoch: opened,
                    reason,
                },
            },
        };
    }

    private async restore(
        ref: RunRef,
        control?: ExecutionControl,
    ): Promise<Goal | undefined> {
        throwIfAborted(control);
        const goal = await this.store.restore(ref.goalId);
        throwIfAborted(control);

        if (
            goal === undefined
            || goal.id !== ref.goalId
            || goal.state.run.id !== ref.runId
        ) {
            return undefined;
        }

        return goal;
    }

    private validateGoalProtocol(goal: Goal): void {
        this.protocolValidator?.assertGoal(goal);
    }

    private async saveCheckpoint(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<Goal> {
        const result = await this.checkpointCommitter.commit(goal, {
            ...(control === undefined ? {} : { control }),
        });
        return result.goal;
    }

    private async appendTrajectory(
        draft: TrajectoryEventDraft,
        control?: ExecutionControl,
        countAsFact = true,
    ): Promise<void> {
        await this.checkpointCommitter.append(draft, control, countAsFact);
    }

    private async afterSchedule(
        ref: RunRef,
        scheduled: Awaited<ReturnType<RunScheduler["schedule"]>>,
        control?: ExecutionControl,
    ): Promise<GoalProgressResult> {
        throwIfAborted(control);
        if (!scheduled.ok) {
            return scheduled;
        }

        const latestGoal = await this.restore(ref, control);
        throwIfAborted(control);

        if (latestGoal === undefined) {
            return this.runNotFound(ref);
        }

        if (latestGoal.state.run.status === "waiting") {
            return this.executingWaitingResult(latestGoal);
        }

        if (
            latestGoal.state.run.status === "completed"
            || latestGoal.state.run.status === "failed"
            || latestGoal.state.run.status === "cancelled"
        ) {
            return {
                ok: true,
                kind: "terminal",
                phase: "executing",
                goal: latestGoal,
            };
        }

        return {
            ok: false,
            error: {
                code: "INVALID_PHASE_RESULT",
                message: `Scheduler left Run "${ref.runId}" in ${latestGoal.state.run.status}`,
            },
        };
    }

    private executingWaitingResult(goal: Goal): GoalProgressResult {
        const pendingInteraction = goal.state.run.pendingInteraction;
        const pendingAction = goal.state.run.pendingAction;

        let waitingFor: "ask_user" | "task_approval" | "action_approval" | "action_recovery" | "blocked";
        if (pendingInteraction !== undefined) {
            waitingFor = pendingInteraction.kind === "ask_user" ? "ask_user" : "task_approval";
        } else if (pendingAction?.status === "awaiting_approval") {
            waitingFor = "action_approval";
        } else if (pendingAction?.status === "outcome_unknown") {
            waitingFor = "action_recovery";
        } else {
            waitingFor = "blocked";
        }

        return {
            ok: true,
            kind: "waiting",
            phase: "executing",
            waitingFor,
            goal,
        };
    }

    private withRun(goal: Goal, run: Goal["state"]["run"]): Goal {
        return {
            ...goal,
            state: {
                ...goal.state,
                run,
            },
        };
    }

    private goalNotWaiting(ref: RunRef): GoalProgressResult {
        return {
            ok: false,
            error: {
                code: "GOAL_NOT_WAITING",
                message: `Goal "${ref.goalId}" is not waiting for user input`,
            },
        };
    }

    private invalidGoalInput(message: string): GoalProgressResult {
        return {
            ok: false,
            error: {
                code: "INVALID_GOAL_INPUT",
                message,
            },
        };
    }

    private runNotFound(ref: RunRef): GoalProgressResult {
        return {
            ok: false,
            error: {
                code: "RUN_NOT_FOUND",
                message: `Run "${ref.runId}" for Goal "${ref.goalId}" was not found`,
            },
        };
    }
}
