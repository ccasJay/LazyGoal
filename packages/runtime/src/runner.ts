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

/**
 * Runner 的公开边界，表达一次 Runner 调用结果，不表示模型输出。
 */
export type RunnerResult =
    | { readonly ok: true; readonly state: RunState }
    | {
        readonly ok: false;
        readonly error: {
            readonly code: "RUN_NOT_FOUND" | "RUN_NOT_WAITING";
            readonly message: string;
        };
    };

export interface RunnerDependencies {
    readonly store: GoalStore;
    readonly executor: StepExecutor;
    readonly maxSteps: number;
}

export class Runner {
    private readonly store: GoalStore;
    private readonly executor: StepExecutor;
    private readonly maxSteps: number;

    constructor(dependencies: RunnerDependencies) {
        if (!Number.isInteger(dependencies.maxSteps) || dependencies.maxSteps <= 0) {
            throw new Error("maxSteps must be a positive integer");
        }

        this.store = dependencies.store;
        this.executor = dependencies.executor;
        this.maxSteps = dependencies.maxSteps;
    }

    async run(ref: RunRef): Promise<RunnerResult> {
        const goal = await this.restore(ref);

        if (goal === undefined) {
            return this.runNotFound(ref);
        }

        if (goal.run.status === "created") {
            const runningGoal = this.withRun(
                goal,
                this.applyTransition(goal.run, { kind: "start" }),
            );
            await this.store.save(runningGoal);
            return this.runLoop(runningGoal);
        }

        return this.runLoop(goal);
    }

    async runUntilBlocked(ref: RunRef): Promise<RunnerResult> {
        return this.run(ref);
    }

    async resume(ref: RunRef): Promise<RunnerResult> {
        const goal = await this.restore(ref);

        if (goal === undefined) {
            return this.runNotFound(ref);
        }

        if (goal.run.status !== "waiting") {
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
            this.applyTransition(goal.run, { kind: "resume" }),
        );
        await this.store.save(runningGoal);

        return this.runLoop(runningGoal);
    }

    private async restore(ref: RunRef): Promise<Goal | undefined> {
        const goal = await this.store.restore(ref.goalId);

        if (
            goal === undefined
            || goal.id !== ref.goalId
            || goal.run.id !== ref.runId
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

        while (goal.run.status === "running") {
            if (goal.run.stepCount >= this.maxSteps) {
                const failedGoal = this.withRun(goal, {
                    ...goal.run,
                    status: "failed",
                    lastResult: {
                        kind: "fail",
                        error: `MAX_STEPS_EXCEEDED: Run "${goal.run.id}" reached maxSteps (${this.maxSteps})`,
                    },
                });

                await this.store.save(failedGoal);
                return { ok: true, state: failedGoal.run };
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

            const nextRun = this.applyTransition(goal.run, {
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

        return { ok: true, state: goal.run };
    }

    private withRun(goal: Goal, run: RunState): Goal {
        return {
            ...goal,
            run,
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
            messages: [
                ...goal.messages,
                ...messages.map((message) => ({
                    role: message.role,
                    content: message.content,
                })),
            ],
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
