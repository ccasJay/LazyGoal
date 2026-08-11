import type { AgentProfile, AgentProfileRegistry } from "./agent-profile";

// 任务目标
export interface Goal {
    readonly id: string;
    readonly objective: string;
    readonly completionCriteria: readonly string[];
}

//运行状态标签
export type RunStatus = 
    | "created"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled";

// 一次Run的完整状态标签
export interface RunState {
    readonly id: string;
    readonly goal: Goal;
    readonly profile: AgentProfile;
    readonly status: RunStatus;
    readonly stepCount: number;
    readonly lastResult?: StepResult;
}
    


// step result
export type StepResult = 
    | {readonly kind: "continue"; readonly summary: string}
    | {readonly kind: "wait"; readonly reason: string}
    | {readonly kind: "complete"; readonly summary: string}
    | {readonly kind: "fail"; readonly error: string}

export type RunInput = 
    | {readonly kind: "start"}
    | {readonly kind: "step"; readonly result: StepResult }
    | {readonly kind: "resume"}
    | {readonly kind: "cancel"}

export type TransitionResult = 
    | {readonly ok: true; readonly state: RunState}
    | {
        readonly ok: false;
        readonly state: RunState;
        readonly error: {
            readonly code: "INVALID_TRANSITION";
            readonly message: string;
        };
    };


export function createRun (
    goal: Goal,
    runId: string,
    profile: AgentProfile,
): RunState {
    const storedProfile: AgentProfile = {
        ...profile,
        instructions: [...profile.instructions],
        toolIds: [...profile.toolIds],
    };

    return {
        id: runId,
        goal,
        profile: storedProfile,
        status: "created",
        stepCount: 0,
    };
}
    
    