import type {
    Goal,
    GoalMessage,
    RunInput,
    RunRef,
    RunState,
} from "./domain";
import type { GoalStore } from "./goal-store";
import type { StepExecutionResult, StepExecutor } from "./step-executor";
import { transition } from "./transition";

/** Runner 的公开结果；其中 state 是 Run 状态，不是模型原始输出。 */
export type RunnerResult =
    | { readonly ok: true; readonly state: RunState }
    | {
        readonly ok: false;
        readonly error: {
            readonly code: "RUN_NOT_FOUND" | "RUN_NOT_WAITING";
            readonly message: string;
        };
    };

/** 创建 {@link Runner} 所需的持久化、执行和预算依赖。 */
export interface RunnerDependencies {
    /** 完整 Goal 的最新快照存储。 */
    readonly store: GoalStore;
    /** 每轮只执行一个 Step 的实现。 */
    readonly executor: StepExecutor;
    /** 单个 Run 跨恢复累计允许消费的最大 Step 数。 */
    readonly maxSteps: number;
}

/**
 * 从 GoalStore 恢复并推进一个 Run，直到 waiting 或终态。
 *
 * @remarks
 * Runner 是状态推进与持久化顺序的拥有者。启动、恢复和每个 Step 完成后，
 * 都会先保存最新完整 Goal，再继续下一步。`maxSteps` 使用快照中的累计
 * `stepCount`，进程重启或 resume 不会重置预算。
 *
 * Executor 异常会转换为持久化的 `fail` 结果；Store 的读取或写入异常原样
 * 传播，写入失败后不会继续执行下一 Step。
 */
export class Runner {
    private readonly store: GoalStore;
    private readonly executor: StepExecutor;
    private readonly maxSteps: number;

    /**
     * @param dependencies - GoalStore、StepExecutor 与正整数 Step 上限。
     * @throws `maxSteps` 不是正整数时抛出 Error。
     */
    constructor(dependencies: RunnerDependencies) {
        if (!Number.isInteger(dependencies.maxSteps) || dependencies.maxSteps <= 0) {
            throw new Error("maxSteps must be a positive integer");
        }

        this.store = dependencies.store;
        this.executor = dependencies.executor;
        this.maxSteps = dependencies.maxSteps;
    }

    /**
     * 启动或继续一个已经保存的 Goal。
     *
     * @remarks
     * `created` 会先转换并保存为 `running`；`running` 会继续执行；waiting
     * 和终态直接返回且不产生副作用。非 executing Goal 同样直接返回，
     * Preparation 不会启动 Run 或消费 Step。Goal 不存在或 runId 不匹配时
     * 返回 `RUN_NOT_FOUND`。
     *
     * @param ref - 目标 Goal 与 Run 的关联键。
     * @returns Run 到达 waiting 或终态时的结果。
     * @throws GoalStore 的恢复或保存错误。
     */
    async run(ref: RunRef): Promise<RunnerResult> {
        const goal = await this.restore(ref);

        if (goal === undefined) {
            return this.runNotFound(ref);
        }

        if (goal.state.workflow.phase !== "executing") {
            return { ok: true, state: goal.state.run };
        }

        if (goal.state.run.status === "created") {
            const runningGoal = this.withRun(
                goal,
                this.applyTransition(goal.state.run, { kind: "start" }),
            );
            await this.store.save(runningGoal);
            return this.runLoop(runningGoal);
        }

        return this.runLoop(goal);
    }

    /** {@link run} 的语义化别名，供 Scheduler 表达“运行到阻塞点”。 */
    async runUntilBlocked(ref: RunRef): Promise<RunnerResult> {
        return this.run(ref);
    }

    /**
     * 显式恢复一个 waiting Run，并运行到下一个阻塞点或终态。
     *
     * @param ref - waiting Goal 与 Run 的关联键。
     * @returns 不存在时为 `RUN_NOT_FOUND`，状态不是 waiting 时为
     * `RUN_NOT_WAITING`，否则返回继续执行后的状态。
     * @throws GoalStore 的恢复或保存错误。
     */
    async resume(ref: RunRef): Promise<RunnerResult> {
        const goal = await this.restore(ref);

        if (goal === undefined) {
            return this.runNotFound(ref);
        }

        if (goal.state.run.status !== "waiting") {
            return {
                ok: false,
                error: {
                    code: "RUN_NOT_WAITING",
                    message: `Run "${ref.runId}" for Goal "${ref.goalId}" is not waiting`,
                },
            };
        }

        const runningGoal = this.withRun(
            goal,
            this.applyTransition(goal.state.run, { kind: "resume" }),
        );
        await this.store.save(runningGoal);

        return this.runLoop(runningGoal);
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

    private runNotFound(ref: RunRef): RunnerResult {
        return {
            ok: false,
            error: {
                code: "RUN_NOT_FOUND",
                message: `Run "${ref.runId}" for Goal "${ref.goalId}" was not found`,
            },
        };
    }

    private async runLoop(initialGoal: Goal): Promise<RunnerResult> {
        let goal = initialGoal;

        while (goal.state.run.status === "running") {
            if (goal.state.run.stepCount >= this.maxSteps) {
                const failedGoal = this.withRun(goal, {
                    ...goal.state.run,
                    status: "failed",
                    stopReason: { kind: "max_steps_exceeded" },
                });

                await this.store.save(failedGoal);
                return { ok: true, state: failedGoal.state.run };
            }

            let execution: StepExecutionResult;
            try {
                execution = await this.executor.execute(goal);
            } catch (error) {
                execution = {
                    result: {
                        kind: "fail",
                        error: error instanceof Error ? error.message : String(error),
                    },
                    appendedMessages: [],
                };
            }

            const nextRun = this.applyTransition(goal.state.run, {
                kind: "step",
                result: execution.result,
            });
            const nextGoal = this.withRun(
                this.appendMessages(goal, execution.appendedMessages),
                nextRun,
            );

            await this.store.save(nextGoal);
            goal = nextGoal;
        }

        return { ok: true, state: goal.state.run };
    }

    private withRun(goal: Goal, run: RunState): Goal {
        return {
            ...goal,
            state: {
                ...goal.state,
                run,
            },
        };
    }

    private appendMessages(
        goal: Goal,
        messages: readonly GoalMessage[],
    ): Goal {
        if (messages.length === 0) {
            return goal;
        }

        return {
            ...goal,
            state: {
                ...goal.state,
                messages: [
                    ...goal.state.messages,
                    ...messages.map((message) => message.role === "user"
                        ? { role: "user" as const, content: message.content }
                        : {
                            role: "assistant" as const,
                            assistant: {
                                profileId: message.assistant.profileId,
                            },
                            content: message.content,
                        }),
                ],
            },
        };
    }

    private applyTransition(state: RunState, input: RunInput): RunState {
        const result = transition(state, input);

        if (!result.ok) {
            throw new Error(`Runner invariant violated: ${result.error.message}`);
        }

        return result.state;
    }
}
