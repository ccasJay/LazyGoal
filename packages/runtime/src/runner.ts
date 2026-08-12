import type { RunState } from "./domain";
import type { RunStore } from "./run-store";
import type { StepExecutor } from "./step-executor";

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
    constructor(_dependencies: RunnerDependencies) {}

    async run(_runId: string): Promise<RunnerResult> {
        throw new Error("Runner.run is not implemented");
    }

    async resume(_runId: string): Promise<RunnerResult> {
        throw new Error("Runner.resume is not implemented");
    }

    private async runLoop(initialState: RunState): Promise<RunnerResult> {
        throw new Error("Runner.runLoop is not implemented");
    }
}
