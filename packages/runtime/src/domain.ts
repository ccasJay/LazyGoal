import type { AgentProfile } from "./agent-profile";

/**
 * Goal 的稳定任务定义，不包含执行过程中产生的状态。
 *
 * @remarks
 * `objective` 描述期望结果，`completionCriteria` 由执行器用于判断 Goal
 * 是否完成。调用方应把运行进度放在 {@link RunState}，而不是修改本对象。
 */
export interface GoalTask {
    readonly objective: string;
    readonly completionCriteria: readonly string[];
}

/** Goal 的可序列化元数据；首版只保留快照协议版本。 */
export interface GoalMetadata {
    readonly schemaVersion: 1;
}

/**
 * 可持久化的 Session 消息。
 *
 * @remarks
 * 当前协议只接受 `user` 与 `assistant`，system prompt 来自
 * {@link AgentProfile}，Adapter、Tool 或其他进程内实例不得写入消息历史。
 */
export interface GoalMessage {
    readonly role: "user" | "assistant";
    readonly content: string;
}

/**
 * 一个可持久化、可恢复的 Session 聚合。
 *
 * @remarks
 * Goal 快照同时拥有任务、冻结的 Profile、按时间顺序排列的消息历史和
 * 当前 Run。`id` 标识 Session，`run.id` 标识该 Session 内的执行实例，
 * 两者语义独立；调度时应通过 {@link RunRef} 同时传递和校验。
 */
export interface Goal {
    readonly id: string;
    readonly metadata: GoalMetadata;
    readonly task: GoalTask;
    readonly profile: AgentProfile;
    readonly messages: readonly GoalMessage[];
    readonly run: RunState;
}

/**
 * 启动边界使用的 Goal 输入。
 *
 * @remarks
 * 调用方提供稳定的 Goal ID 和任务定义，Profile 与初始 Run 由 Launcher
 * 根据启动依赖组装。
 */
export interface GoalDefinition extends GoalTask {
    readonly id: string;
}

/** 兼容“Goal 输入”的别名；持久化聚合本身仍使用 {@link Goal}。 */
export type GoalInput = GoalDefinition;

/**
 * 单个 Run 的可持久化执行状态。
 *
 * @remarks
 * Run 不反向嵌入 Goal、Profile 或进程内对象。`stepCount` 是跨恢复累计值；
 * 每消费一个 StepResult 增加一次，resume 本身不增加计数。
 */
export interface RunState {
    readonly id: string;
    readonly status: RunStatus;
    readonly stepCount: number;
    readonly lastResult?: StepResult;
}

/**
 * Scheduler 与 Runner 使用的显式关联键。
 *
 * @remarks
 * `goalId` 用于恢复完整 Session，`runId` 用于确认恢复出的 Goal 仍指向
 * 调用方期望的执行实例。
 */
export interface RunRef {
    readonly goalId: string;
    readonly runId: string;
}

/**
 * 旧 RunStore/Runner 边界使用的过渡状态。
 *
 * @deprecated 使用 {@link Goal} 和 GoalStore 保存完整 Session；
 * 此类型只用于旧测试与兼容代码。
 */
export interface LegacyRunState extends RunState {
    readonly goal: GoalDefinition;
    readonly profile: AgentProfile;
}

/**
 * Run 生命周期状态。
 *
 * @remarks
 * 主流程为 `created → running → waiting → running`，最终进入
 * `completed`、`failed` 或 `cancelled`。三个终态不再接受状态转换。
 */
export type RunStatus =
    | "created"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled";

/**
 * Executor 单步执行结果。
 *
 * @remarks
 * `continue` 保持运行，`wait` 暂停等待显式恢复，`complete` 与 `fail`
 * 分别进入成功和失败终态。
 */
export type StepResult =
    | { readonly kind: "continue"; readonly summary: string }
    | { readonly kind: "wait"; readonly reason: string }
    | { readonly kind: "complete"; readonly summary: string }
    | { readonly kind: "fail"; readonly error: string };

/** 传给 `transition` 的显式状态转换输入。 */
export type RunInput =
    | { readonly kind: "start" }
    | { readonly kind: "step"; readonly result: StepResult }
    | { readonly kind: "resume" }
    | { readonly kind: "cancel" };

/** 状态转换结果；非法转换返回原状态和稳定错误，不抛出异常。 */
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

/** {@link createGoal} 所需的完整、确定性输入。 */
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
 *
 * @param input - Goal、任务、Profile、Run ID 与可选初始消息。
 * @returns 状态为 `created`、Schema 版本为 `1` 的全新 Goal。
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

/**
 * 创建只包含 Run 自身字段的初始状态，供 transition 核心使用。
 *
 * @param runId - 执行实例的稳定标识。
 * @returns `created` 状态且 `stepCount` 为零的 Run。
 */
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
