import type {
    AssistantMessage,
    Goal,
    GoalTask,
    RunRef,
} from "./domain";
import type { GoalStore } from "./goal-store";
import type {
    PreparationExecutor,
    PreparationResult,
} from "./preparation-executor";
import type { RunScheduler } from "./scheduler";
import {
    InMemoryToolRegistry,
    resolveAuthorizedToolDefinitions,
    type ToolRegistry,
} from "./tool";
import {
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "./execution-control";
import { transition } from "./transition";
import {
    allocateDiagnosticTraceRecord,
    createNoopTrajectoryRecorder,
    TrajectoryAppendError,
    TrajectoryCommitMarkerError,
    type DiagnosticTraceSink,
    type TrajectoryEventDraft,
    type TrajectorySink,
} from "./trajectory";

/** Goal 推进失败时返回的稳定业务错误码。 */
export type GoalProgressErrorCode =
    | "RUN_NOT_FOUND"
    | "GOAL_NOT_WAITING"
    | "INVALID_GOAL_INPUT"
    | "INVALID_PHASE_RESULT"
    | "ACTION_NOT_AUTHORIZED";

/**
 * 用户对 Goal 当前交互等待点提交的操作。
 *
 * @remarks
 * `message` 用于回答问题、反馈任务提案或解除 Agent wait，内容按原文持久化；
 * `approve` 只批准当前 proposal；`approve_action` 先持久化批准状态再用一次性
 * 授权继续执行；`reject_action` 将拒绝写成 Observation。两种 Action 操作只
 * 处理当前 pendingAction，不追加伪造的会话消息。
 */
export type GoalUserAction =
    | { readonly kind: "message"; readonly content: string }
    | { readonly kind: "approve" }
    | { readonly kind: "approve_action"; readonly actionId: string }
    | {
        readonly kind: "reject_action";
        readonly actionId: string;
        readonly reason: string;
    };

/**
 * 恢复等待中 Goal 所需的稳定关联键与用户操作。
 *
 * @example
 * ```ts
 * const request: ResumeGoalRequest = {
 *   ref: { goalId: "goal-1", runId: "run-1" },
 *   action: { kind: "message", content: "Use PostgreSQL" },
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
 * 成功结果始终携带本次推进得到的最新完整 Goal。准备阶段不会启动 Run 或
 * 消费 Step；executing 阶段区分 Agent wait、Action approval/recovery 等待与
 * Run 终态。
 */
export type GoalProgressResult =
    | {
        readonly ok: true;
        readonly kind: "waiting";
        readonly phase: "gathering_context";
        readonly waitingFor: "question";
        readonly goal: Goal;
    }
    | {
        readonly ok: true;
        readonly kind: "waiting";
        readonly phase: "planning";
        readonly waitingFor: "approval";
        readonly goal: Goal;
    }
    | {
        readonly ok: true;
        readonly kind: "waiting";
        readonly phase: "executing";
        readonly waitingFor: "blocked" | "action_approval" | "action_recovery";
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
 * 创建 {@link GoalCoordinator} 所需的执行与持久化依赖。
 *
 * @remarks
 * Coordinator 拥有准备阶段转换和消息追加；Executor 只返回单轮决策，
 * Scheduler 只运行已经进入 executing 的 Goal。
 *
 * @example
 * ```ts
 * const coordinator = new GoalCoordinator({ store, preparationExecutor, scheduler });
 * ```
 */
export interface GoalCoordinatorDependencies {
    /** 用于恢复和保存 Goal 最新完整快照。 */
    readonly store: GoalStore;
    /** 生成 active Preparation 的单轮结构化决策。 */
    readonly preparationExecutor: PreparationExecutor;
    /** 运行 executing Goal，直到 blocked 或终态。 */
    readonly scheduler: RunScheduler;
    /**
     * 解析 planning 可见 ToolDefinition 的 Registry；省略时按空 Registry
     * 处理，因此不会向 Preparation Executor 提供任何 Tool。
     */
    readonly toolRegistry?: ToolRegistry;
    /** 可选 Domain Event 追加边界；省略时保持旧调用方行为。 */
    readonly trajectorySink?: TrajectorySink;
    /** 可选诊断记录边界；诊断故障不得改变 Snapshot 或 Domain Event 语义。 */
    readonly traceSink?: DiagnosticTraceSink;
}

/**
 * 推进可恢复 Goal，直到下一交互等待点或执行终态。
 *
 * @remarks
 * `advance` 是自动推进入口。每次跨阶段继续前都会先保存完整 Goal；保存失败
 * 时错误原样传播，且不会调用下一轮 Executor 或 Scheduler。Preparation
 * result 与当前 phase 不匹配时返回 `INVALID_PHASE_RESULT`，不产生副作用。
 * `resume` 恢复准备阶段的 question/approval 和 executing blocked 等待。
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
    private readonly preparationExecutor: PreparationExecutor;
    private readonly scheduler: RunScheduler;
    private readonly toolRegistry: ToolRegistry;
    private readonly trajectorySink: TrajectorySink;
    private readonly trajectoryEnabled: boolean;
    private readonly trajectoryFactSequences = new Map<string, number>();
    private readonly traceSink: DiagnosticTraceSink | undefined;

    /** @param dependencies - GoalStore、PreparationExecutor 与 RunScheduler。 */
    constructor(dependencies: GoalCoordinatorDependencies) {
        this.store = dependencies.store;
        this.preparationExecutor = dependencies.preparationExecutor;
        this.scheduler = dependencies.scheduler;
        this.toolRegistry = dependencies.toolRegistry ?? new InMemoryToolRegistry();
        this.trajectoryEnabled = dependencies.trajectorySink !== undefined;
        this.trajectorySink = dependencies.trajectorySink
            ?? createNoopTrajectoryRecorder();
        this.traceSink = dependencies.traceSink;
    }

    /**
     * 从最新快照自动推进 Goal。
     *
     * @param ref - Goal 与其当前 Run 的关联键。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns 下一等待点、executing 终态或稳定业务失败。
     * @throws Executor、Scheduler 或 GoalStore 失败时传播原始异常；中止时抛出
     *   `ExecutionAbortedError`。
     */
    async advance(
        ref: RunRef,
        control?: ExecutionControl,
    ): Promise<GoalProgressResult> {
        throwIfAborted(control);
        let goal = await this.restore(ref, control);
        throwIfAborted(control);

        if (goal === undefined) {
            return this.runNotFound(ref);
        }

        while (goal.state.workflow.phase !== "executing") {
            const workflow = goal.state.workflow;

            if (workflow.phase === "gathering_context") {
                if (workflow.preparation.status === "waiting_input") {
                    return {
                        ok: true,
                        kind: "waiting",
                        phase: "gathering_context",
                        waitingFor: "question",
                        goal,
                    };
                }

                throwIfAborted(control);
                const result = await this.preparationExecutor.execute(goal, [], control);
                throwIfAborted(control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: workflow.phase,
                    eventType: "preparation_result",
                    payload: { type: "preparation_result", result: result.kind },
                }, control);

                if (result.kind === "question") {
                    throwIfAborted(control);
                    goal = this.withQuestion(goal, result.question);
                    await this.appendTrajectory({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "gathering_context",
                        eventType: "run_waiting",
                        payload: { type: "run_waiting", reason: "question" },
                    }, control);
                    goal = await this.saveCheckpoint(goal, control);
                    return {
                        ok: true,
                        kind: "waiting",
                        phase: "gathering_context",
                        waitingFor: "question",
                        goal,
                    };
                }

                if (result.kind !== "context_ready") {
                    return this.invalidPhaseResult(workflow.phase, result);
                }

                goal = this.withPlanning(goal);
                throwIfAborted(control);
                goal = await this.saveCheckpoint(goal, control);
                continue;
            }

            if (workflow.preparation.status === "waiting_approval") {
                return {
                    ok: true,
                    kind: "waiting",
                    phase: "planning",
                    waitingFor: "approval",
                    goal,
                };
            }

            throwIfAborted(control);
            const tools = resolveAuthorizedToolDefinitions(goal, this.toolRegistry);
            throwIfAborted(control);
            const result = await this.preparationExecutor.execute(goal, tools, control);
            throwIfAborted(control);
            await this.appendTrajectory({
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: workflow.phase,
                eventType: "preparation_result",
                payload: { type: "preparation_result", result: result.kind },
            }, control);

            if (result.kind !== "task_proposal") {
                return this.invalidPhaseResult(workflow.phase, result);
            }

            goal = this.withProposal(goal, result);
            throwIfAborted(control);
            await this.appendTrajectory({
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "planning",
                eventType: "run_waiting",
                payload: { type: "run_waiting", reason: "approval" },
            }, control);
            goal = await this.saveCheckpoint(goal, control);
            return {
                ok: true,
                kind: "waiting",
                phase: "planning",
                waitingFor: "approval",
                goal,
            };
        }

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
     * 提交交互等待中的用户消息或批准操作。
     *
     * @remarks
     * gathering message 会恢复为 active 并追加原文 user 消息；planning
     * message 会移除当前 proposal、保留反馈并重新规划；approve 不追加消息，
     * 而是把当前 proposal 复制为最终 task；executing message 会追加原文输入并
     * 将 Run 从 waiting 恢复为 running。executing 的 `approve_action` 接受当前
     * `awaiting_approval` 或 `outcome_unknown` Action，保存为 approved 后透传一次性
     * 授权；`reject_action` 保存 rejected Observation 后继续推进。所有分支均先
     * 保存完整 Goal，再调用 {@link advance}。当前没有匹配等待点或 action 不匹配时
     * 无副作用地失败。
     *
     * @param request - 当前 RunRef 与用户操作。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns 保存后自动推进得到的下一等待点或执行终态。
     * @throws GoalStore、PreparationExecutor 或 Scheduler 失败时传播原始异常；
     *   中止时抛出 `ExecutionAbortedError`。
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

        const workflow = goal.state.workflow;

        if (workflow.phase === "gathering_context") {
            if (workflow.preparation.status !== "waiting_input") {
                return this.goalNotWaiting(request.ref);
            }

            if (request.action.kind !== "message") {
                return this.invalidGoalInput(
                    "gathering_context requires a message action",
                );
            }

            if (request.action.content.trim().length === 0) {
                return this.invalidGoalInput("Message content must not be empty");
            }

            const resumedGoal = this.withGatheringAnswer(
                goal,
                request.action.content,
            );
            throwIfAborted(control);
            await this.appendTrajectory({
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "gathering_context",
                eventType: "run_resumed",
                payload: { type: "run_resumed" },
            }, control);
            await this.saveCheckpoint(resumedGoal, control);
            return this.advance(request.ref, control);
        }

        if (workflow.phase === "planning") {
            if (workflow.preparation.status !== "waiting_approval") {
                return this.goalNotWaiting(request.ref);
            }

            if (request.action.kind === "message") {
                if (request.action.content.trim().length === 0) {
                    return this.invalidGoalInput("Message content must not be empty");
                }

                const resumedGoal = this.withPlanningFeedback(
                    goal,
                    request.action.content,
                );
                throwIfAborted(control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "planning",
                    eventType: "run_resumed",
                    payload: { type: "run_resumed" },
                }, control);
                await this.saveCheckpoint(resumedGoal, control);
                return this.advance(request.ref, control);
            }

            if (request.action.kind !== "approve") {
                return this.invalidGoalInput(
                    "planning approval requires an approve action",
                );
            }

            const proposal = workflow.preparation.proposal;

            if (proposal === undefined) {
                return this.goalNotWaiting(request.ref);
            }

            const approvedGoal = this.withApprovedTask(goal, proposal);
            throwIfAborted(control);
            await this.appendTrajectory({
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "planning",
                eventType: "run_resumed",
                payload: { type: "run_resumed" },
            }, control);
            await this.saveCheckpoint(approvedGoal, control);
            return this.advance(request.ref, control);
        }

        if (goal.state.run.status !== "waiting") {
            return this.goalNotWaiting(request.ref);
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

    private async saveCheckpoint(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<Goal> {
        throwIfAborted(control);

        if (!this.trajectoryEnabled) {
            await this.store.save(goal);
            throwIfAborted(control);
            return goal;
        }

        const key = this.trajectoryKey(goal);
        const committedThroughSequence = Math.max(
            goal.state.run.committedThroughSequence ?? 0,
            this.trajectoryFactSequences.get(key) ?? 0,
        );
        const checkpoint = committedThroughSequence === (
            goal.state.run.committedThroughSequence ?? 0
        )
            ? goal
            : {
                ...goal,
                state: {
                    ...goal.state,
                    run: {
                        ...goal.state.run,
                        committedThroughSequence,
                    },
                },
            };

        await this.store.save(checkpoint);
        throwIfAborted(control);
        try {
            await this.appendTrajectory({
                goalId: checkpoint.id,
                runId: checkpoint.state.run.id,
                phase: checkpoint.state.workflow.phase,
                eventType: "state_committed",
                payload: {
                    type: "state_committed",
                    committedThroughSequence,
                },
            }, control, false);
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }
            await this.recordTrajectoryDiagnostic(checkpoint, "state_committed", error);
            throw new TrajectoryCommitMarkerError(
                error instanceof Error ? error.message : String(error),
                { cause: error },
            );
        }
        return checkpoint;
    }

    private trajectoryKey(goal: Goal): string {
        return `${goal.id}\u0000${goal.state.run.id}`;
    }

    private async appendTrajectory(
        draft: TrajectoryEventDraft,
        control?: ExecutionControl,
        countAsFact = true,
    ): Promise<void> {
        if (!this.trajectoryEnabled) return;
        throwIfAborted(control);
        let event;
        try {
            event = await this.trajectorySink.append(draft);
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }
            throw new TrajectoryAppendError(
                error instanceof Error ? error.message : String(error),
                { cause: error },
            );
        }
        throwIfAborted(control);
        if (countAsFact && event.payload.type !== "state_committed") {
            const key = `${event.goalId}\u0000${event.runId}`;
            this.trajectoryFactSequences.set(
                key,
                Math.max(this.trajectoryFactSequences.get(key) ?? 0, event.sequence),
            );
        }
    }

    private async recordTrajectoryDiagnostic(
        goal: Goal,
        kind: string,
        error: unknown,
    ): Promise<void> {
        if (this.traceSink === undefined) return;
        try {
            await this.traceSink.append(allocateDiagnosticTraceRecord({
                goalId: goal.id,
                runId: goal.state.run.id,
                kind: "trajectory_commit_marker_failed",
                payload: {
                    eventType: kind,
                    error: error instanceof Error ? error.message : String(error),
                },
            }));
        } catch {
            // Diagnostic Trace 是旁路；其自身故障不能覆盖 marker 缺口。
        }
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
        const pendingAction = goal.state.run.pendingAction;
        const waitingFor = pendingAction?.status === "awaiting_approval"
            ? "action_approval"
            : pendingAction?.status === "outcome_unknown"
                ? "action_recovery"
                : "blocked";

        return {
            ok: true,
            kind: "waiting",
            phase: "executing",
            waitingFor,
            goal,
        };
    }

    private withQuestion(goal: Goal, question: string): Goal {
        return {
            ...goal,
            state: {
                ...goal.state,
                workflow: {
                    phase: "gathering_context",
                    preparation: { status: "waiting_input" },
                },
                messages: [
                    ...goal.state.messages,
                    this.assistantMessage(goal, question),
                ],
            },
        };
    }

    private withPlanning(goal: Goal): Goal {
        return {
            ...goal,
            state: {
                ...goal.state,
                workflow: {
                    phase: "planning",
                    preparation: { status: "active" },
                },
            },
        };
    }

    private withGatheringAnswer(goal: Goal, content: string): Goal {
        return {
            ...goal,
            state: {
                ...goal.state,
                workflow: {
                    phase: "gathering_context",
                    preparation: { status: "active" },
                },
                messages: [
                    ...goal.state.messages,
                    { role: "user", content },
                ],
            },
        };
    }

    private withPlanningFeedback(goal: Goal, content: string): Goal {
        return {
            ...goal,
            state: {
                ...goal.state,
                workflow: {
                    phase: "planning",
                    preparation: { status: "active" },
                },
                messages: [
                    ...goal.state.messages,
                    { role: "user", content },
                ],
            },
        };
    }

    private withApprovedTask(goal: Goal, proposal: GoalTask): Goal {
        return {
            ...goal,
            state: {
                ...goal.state,
                workflow: {
                    phase: "executing",
                    preparation: { status: "completed" },
                    task: this.cloneTask(proposal),
                },
            },
        };
    }

    private withProposal(
        goal: Goal,
        result: Extract<PreparationResult, { readonly kind: "task_proposal" }>,
    ): Goal {
        const proposal = this.cloneTask(result.task);

        return {
            ...goal,
            state: {
                ...goal.state,
                workflow: {
                    phase: "planning",
                    preparation: {
                        status: "waiting_approval",
                        proposal,
                    },
                },
                messages: [
                    ...goal.state.messages,
                    this.assistantMessage(
                        goal,
                        this.formatProposal(proposal, result.approvalRequest),
                    ),
                ],
            },
        };
    }

    private assistantMessage(goal: Goal, content: string): AssistantMessage {
        return {
            role: "assistant",
            assistant: { profileId: goal.definition.profile.id },
            content,
        };
    }

    private cloneTask(task: GoalTask): GoalTask {
        return {
            objective: task.objective,
            completionCriteria: [...task.completionCriteria],
        };
    }

    private formatProposal(task: GoalTask, approvalRequest: string): string {
        const criteria = task.completionCriteria.length === 0
            ? ["None"]
            : task.completionCriteria.map(
                (criterion, index) => `${index + 1}. ${criterion}`,
            );

        return [
            `Objective: ${task.objective}`,
            "Completion criteria:",
            ...criteria,
            `Approval request: ${approvalRequest}`,
        ].join("\n");
    }

    private invalidPhaseResult(
        phase: "gathering_context" | "planning",
        result: PreparationResult,
    ): GoalProgressResult {
        return {
            ok: false,
            error: {
                code: "INVALID_PHASE_RESULT",
                message: `Preparation result "${result.kind}" is invalid for phase "${phase}"`,
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
