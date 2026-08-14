import type { Goal, GoalMessage, StepResult } from "./domain";

export interface StepExecutionResult {
    readonly result: StepResult;
    readonly appendedMessages: readonly GoalMessage[];
}

export interface StepExecutor {
    execute(goal: Goal): Promise<StepExecutionResult>;
}
