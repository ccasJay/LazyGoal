import type { RunInput, RunState, StepResult } from "./domain";
import type { RunStore } from "./run-store";
import type { StepExecutor } from "./step-executor";
import { transition } from "./transition";

/**
 *  Runner 的公开边界, 表达一次 Runner 调用结果，不表示模型输出。
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
    readonly store: RunStore;
    readonly executor: StepExecutor;
    readonly maxSteps: number;
}

export class Runner {
    private readonly store: RunStore;
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

    async run(runId: string): Promise<RunnerResult> {
        let state = await this.store.load(runId);

        // 未定义类型的 state 报错
        if (state === undefined) {
            return {
                ok: false,
                error: {
                    code: "RUN_NOT_FOUND",
                    message: `Run "${runId}" was not found`,
                },
            };
        }

        //
        if (state.status === "created") {
            state = this.applyTransition(state, { kind: "start" });
            await this.store.save(state);
        }

        return this.runLoop(state);
    }

    async runUntilBlocked(runId: string): Promise<RunnerResult> {
        return this.run(runId);
    }

    async resume(runId: string): Promise<RunnerResult> {
        const state = await this.store.load(runId);

        if (state === undefined) {
            return {
                ok: false,
                error: {
                    code: "RUN_NOT_FOUND",
                    message: `Run "${runId}" was not found`,
                },
            };
        }

        if (state.status !== "waiting") {
            return {
                ok: false,
                error: {
                    code: "RUN_NOT_WAITING",
                    message: `Run "${runId}" is not waiting`,
                },
            };
        }

        const runningState = this.applyTransition(state, { kind: "resume" });
        await this.store.save(runningState);

        return this.runLoop(runningState);
    }

    private async runLoop(initialState: RunState): Promise<RunnerResult> {
        let state = initialState;

        while (state.status === "running") {
            if (state.stepCount >= this.maxSteps) {
                const failedState: RunState = {
                    ...state,
                    status: "failed",
                    lastResult: {
                        kind: "fail",
                        error: `MAX_STEPS_EXCEEDED: Run "${state.id}" reached maxSteps (${this.maxSteps})`,
                    }

                };

                await this.store.save(failedState);
                return {ok: true, state: failedState};
            }

            let stepResult: StepResult;
            try {
                stepResult = await this.executor.execute(state);
            }catch (error) {
                stepResult = {
                    kind: "fail",
                    error: error instanceof Error ? error.message : String(error),
                };
            }

            state = this.applyTransition(state, {
                kind: "step",
                result: stepResult,
            });

            await this.store.save(state);
        }

        return { ok: true, state };
    }

    private applyTransition(state: RunState, input: RunInput): RunState {
        const result = transition(state, input);

        if (!result.ok) {
            throw new Error(`Runner invariant violated: ${result.error.message}`);
        }

        return result.state;
    }
}
