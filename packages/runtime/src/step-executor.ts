import type { RunState, StepResult } from "./domain";

export interface StepExecutor {
    execute(state: RunState): Promise<StepResult>;
}
