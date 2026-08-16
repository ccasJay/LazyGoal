import type {
    AssistantMessage,
    Goal,
    RunInput,
    RunRef,
    RunState,
    StepResult,
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
            readonly code: "RUN_NOT_FOUND";
            readonly message: string;
        };
    };

/**
 * 创建 {@link Runner} 所需的持久化与单步执行依赖。
 *
 * @remarks
 * Step 上限来自每个 Goal 冻结的 executionPolicy，不属于 Runner 实例配置。
 *
 * @example
 * ```ts
 * const runner = new Runner({ store, executor });
 * ```
 */
export interface RunnerDependencies {
    /** 完整 Goal 的最新快照存储。 */
    readonly store: GoalStore;
    /** 每轮只执行一个 Step 的实现。 */
    readonly executor: StepExecutor;
}

/**
 * 从 GoalStore 恢复并推进一个 Run，直到 waiting 或终态。
 *
 * @remarks
 * Runner 是状态推进与持久化顺序的拥有者。启动、恢复和每个 Step 完成后，
 * 都会先保存最新完整 Goal，再继续下一步。正数 `maxSteps` 使用快照中的
 * 累计 `stepCount`；`0` 表示不按 Step 数终止。
 *
 * Executor 异常会转换为持久化的 `fail` 结果；Store 的读取或写入异常原样
 * 传播，写入失败后不会继续执行下一 Step。
 */
export class Runner {
    private readonly store: GoalStore;
    private readonly executor: StepExecutor;

    /** @param dependencies - GoalStore 与 StepExecutor。 */
    constructor(dependencies: RunnerDependencies) {
        this.store = dependencies.store;
        this.executor = dependencies.executor;
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
            const maxSteps = goal.definition.executionPolicy.maxSteps;

            if (maxSteps > 0 && goal.state.run.stepCount >= maxSteps) {
                const failedGoal = this.withRun(goal, {
                    ...goal.state.run,
                    status: "failed",
                    stopReason: { kind: "max_steps_exceeded" },
                });

                await this.store.save(failedGoal);
                return { ok: true, state: failedGoal.state.run };
            }

            let execution: StepExecutionResult;
            let shouldAppendResultMessage = true;
            try {
                execution = await this.executor.execute(goal);
            } catch (error) {
                execution = {
                    result: {
                        kind: "fail",
                        error: error instanceof Error ? error.message : String(error),
                    },
                };
                shouldAppendResultMessage = false;
            }

            const nextRun = this.applyTransition(goal.state.run, {
                kind: "step",
                result: execution.result,
            });
            const transitionedGoal = this.withRun(goal, nextRun);
            const nextGoal = shouldAppendResultMessage
                ? this.appendResultMessage(transitionedGoal, execution.result)
                : transitionedGoal;

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

    private appendResultMessage(
        goal: Goal,
        result: StepResult,
    ): Goal {
        const message = this.toAssistantMessage(goal, result);

        if (message === undefined) {
            return goal;
        }

        return {
            ...goal,
            state: {
                ...goal.state,
                messages: [
                    ...goal.state.messages,
                    message,
                ],
            },
        };
    }

    private toAssistantMessage(
        goal: Goal,
        result: StepResult,
    ): AssistantMessage | undefined {
        if (result.kind === "continue") {
            return undefined;
        }

        const content = result.kind === "wait"
            ? result.reason
            : result.kind === "complete"
                ? result.summary
                : result.error;

        return {
            role: "assistant",
            assistant: { profileId: goal.definition.profile.id },
            content,
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
