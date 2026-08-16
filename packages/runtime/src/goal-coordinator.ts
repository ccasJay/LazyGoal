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

/** Goal 推进失败时返回的稳定业务错误码。 */
export type GoalProgressErrorCode =
    | "RUN_NOT_FOUND"
    | "GOAL_NOT_WAITING"
    | "INVALID_GOAL_INPUT"
    | "INVALID_PHASE_RESULT";

/**
 * GoalCoordinator 推进一次 Goal 后到达的等待点、执行终态或业务失败。
 *
 * @remarks
 * 成功结果始终携带本次推进得到的最新完整 Goal。准备阶段不会启动 Run 或
 * 消费 Step；executing 阶段只区分 blocked 等待与 Run 终态。
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
        readonly waitingFor: "blocked";
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
}

/**
 * 推进可恢复 Goal，直到下一交互等待点或执行终态。
 *
 * @remarks
 * `advance` 是自动推进入口。每次跨阶段继续前都会先保存完整 Goal；保存失败
 * 时错误原样传播，且不会调用下一轮 Executor 或 Scheduler。Preparation
 * result 与当前 phase 不匹配时返回 `INVALID_PHASE_RESULT`，不产生副作用。
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

    /** @param dependencies - GoalStore、PreparationExecutor 与 RunScheduler。 */
    constructor(dependencies: GoalCoordinatorDependencies) {
        this.store = dependencies.store;
        this.preparationExecutor = dependencies.preparationExecutor;
        this.scheduler = dependencies.scheduler;
    }

    /**
     * 从最新快照自动推进 Goal。
     *
     * @param ref - Goal 与其当前 Run 的关联键。
     * @returns 下一等待点、executing 终态或稳定业务失败。
     * @throws Executor、Scheduler 或 GoalStore 失败时传播原始异常。
     */
    async advance(ref: RunRef): Promise<GoalProgressResult> {
        let goal = await this.restore(ref);

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

                const result = await this.preparationExecutor.execute(goal);

                if (result.kind === "question") {
                    goal = this.withQuestion(goal, result.question);
                    await this.store.save(goal);
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
                await this.store.save(goal);
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

            const result = await this.preparationExecutor.execute(goal);

            if (result.kind !== "task_proposal") {
                return this.invalidPhaseResult(workflow.phase, result);
            }

            goal = this.withProposal(goal, result);
            await this.store.save(goal);
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
            const scheduled = await this.scheduler.schedule(ref);

            if (!scheduled.ok) {
                return scheduled;
            }

            const latestGoal = await this.restore(ref);

            if (latestGoal === undefined) {
                return this.runNotFound(ref);
            }

            goal = latestGoal;
        }

        if (goal.state.run.status === "waiting") {
            return {
                ok: true,
                kind: "waiting",
                phase: "executing",
                waitingFor: "blocked",
                goal,
            };
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

    private async restore(ref: RunRef): Promise<Goal | undefined> {
        const goal = await this.store.restore(ref.goalId);

        if (
            goal === undefined
            || goal.id !== ref.goalId
            || goal.state.run.id !== ref.runId
        ) {
            return undefined;
        }

        return goal;
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
