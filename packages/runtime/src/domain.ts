import type { AgentProfile } from "./agent-profile";

// Goal 的任务定义，不包含执行时产生的状态。
export interface GoalTask {
    readonly objective: string;
    readonly completionCriteria: readonly string[];
}

// Goal 的可序列化元数据。首版只保留快照协议版本。
export interface GoalMetadata {
    readonly schemaVersion: 1;
}

// 只记录实际的用户和模型消息，不保存 Adapter 或 Tool 实例。
export interface GoalMessage {
    readonly role: "user" | "assistant";
    readonly content: string;
}

// 一个 Goal 就是一个可持久化、可恢复的 Session 聚合。
export interface Goal {
    readonly id: string;
    readonly metadata: GoalMetadata;
    readonly task: GoalTask;
    readonly profile: AgentProfile;
    readonly messages: readonly GoalMessage[];
    readonly run: RunState;
}

// 启动边界使用的任务输入。它保留 Goal ID，但不要求调用方构造运行时状态。
export interface GoalDefinition extends GoalTask {
    readonly id: string;
}

// 兼容“Goal 输入”这一常用叫法；持久化聚合本身仍使用 Goal。
export type GoalInput = GoalDefinition;

// 运行状态只表达 Run 自身，不反向嵌入 Goal、Profile 或其他进程内对象。
export interface RunState {
    readonly id: string;
    readonly status: RunStatus;
    readonly stepCount: number;
    readonly lastResult?: StepResult;
}

// 调度和 Runner 使用的显式关联键。goalId 与 runId 语义独立。
export interface RunRef {
    readonly goalId: string;
    readonly runId: string;
}

// 旧 RunStore/Runner 边界的过渡状态。后续迁移到 GoalStore 后移除。
export interface LegacyRunState extends RunState {
    readonly goal: GoalDefinition;
    readonly profile: AgentProfile;
}

// 运行状态标签。
export type RunStatus =
    | "created"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled";

// Step result。
export type StepResult =
    | { readonly kind: "continue"; readonly summary: string }
    | { readonly kind: "wait"; readonly reason: string }
    | { readonly kind: "complete"; readonly summary: string }
    | { readonly kind: "fail"; readonly error: string };

export type RunInput =
    | { readonly kind: "start" }
    | { readonly kind: "step"; readonly result: StepResult }
    | { readonly kind: "resume" }
    | { readonly kind: "cancel" };

export type TransitionResult<TState extends RunState = RunState> =
    | { readonly ok: true; readonly state: TState }
    | {
        readonly ok: false;
        readonly state: TState;
        readonly error: {
            readonly code: "INVALID_TRANSITION";
            readonly message: string;
        };
    };

export interface GoalCreationInput {
    readonly id: string;
    readonly task: GoalTask;
    readonly profile: AgentProfile;
    readonly runId: string;
    readonly messages?: readonly GoalMessage[];
}

function cloneProfile(profile: AgentProfile): AgentProfile {
    return {
        ...profile,
        instructions: [...profile.instructions],
        toolIds: [...profile.toolIds],
    };
}

function cloneMessages(
    messages: readonly GoalMessage[],
): readonly GoalMessage[] {
    return messages.map((message) => ({
        role: message.role,
        content: message.content,
    }));
}

/**
 * 创建一个确定性的初始 Goal 聚合。
 *
 * ID、Profile 和初始 messages 都由调用方显式提供；函数不生成随机值，
 * 并复制所有可变数组，确保后续 Registry 或请求对象的修改不会污染快照。
 */
export function createGoal(input: GoalCreationInput): Goal {
    return {
        id: input.id,
        metadata: { schemaVersion: 1 },
        task: {
            objective: input.task.objective,
            completionCriteria: [...input.task.completionCriteria],
        },
        profile: cloneProfile(input.profile),
        messages: cloneMessages(input.messages ?? []),
        run: createRun(input.runId),
    };
}

/** 创建只包含 Run 自身字段的初始状态，供 transition 核心使用。 */
export function createRun(runId: string): RunState;

/**
 * 旧 RunStore/Runner 边界的兼容工厂。
 * @deprecated Goal 聚合迁移完成后只保留 createRun(runId)。
 */
export function createRun(
    goal: GoalDefinition,
    runId: string,
    profile: AgentProfile,
): LegacyRunState;

export function createRun(
    runIdOrGoal: string | GoalDefinition,
    legacyRunId?: string,
    legacyProfile?: AgentProfile,
): RunState | LegacyRunState {
    const runId = typeof runIdOrGoal === "string"
        ? runIdOrGoal
        : legacyRunId;

    if (runId === undefined) {
        throw new Error("runId is required");
    }

    const state: RunState = {
        id: runId,
        status: "created",
        stepCount: 0,
    };

    if (typeof runIdOrGoal === "string") {
        return state;
    }

    if (legacyProfile === undefined) {
        throw new Error("profile is required for the legacy createRun signature");
    }

    return {
        ...state,
        goal: {
            id: runIdOrGoal.id,
            objective: runIdOrGoal.objective,
            completionCriteria: [...runIdOrGoal.completionCriteria],
        },
        profile: cloneProfile(legacyProfile),
    };
}
