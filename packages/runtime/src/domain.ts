import type { AgentProfile } from "./agent-profile";

/** Goal 的稳定任务定义，不包含执行过程中产生的状态。 */
export interface GoalTask {
    readonly objective: string;
    readonly completionCriteria: readonly string[];
}

/**
 * Goal 快照协议元数据。
 *
 * @remarks v2 表示 Goal 已按冻结定义与可变状态分组。
 * @example
 * ```ts
 * const metadata: GoalMetadata = { schemaVersion: 2 };
 * ```
 */
export interface GoalMetadata {
    readonly schemaVersion: 2;
}

/**
 * 用户实际发送并需要随 Session 恢复的消息。
 * @example
 * ```ts
 * const message: UserMessage = { role: "user", content: "继续" };
 * ```
 */
export interface UserMessage {
    readonly role: "user";
    readonly content: string;
}

/**
 * Assistant 实际发送并需要随 Session 恢复的消息。
 *
 * @remarks `profileId` 记录消息来源；Working Context 不属于真实消息。
 * @example
 * ```ts
 * const message: AssistantMessage = {
 *   role: "assistant",
 *   assistant: { profileId: "default" },
 *   content: "需要批准后继续",
 * };
 * ```
 */
export interface AssistantMessage {
    readonly role: "assistant";
    readonly assistant: { readonly profileId: string };
    readonly content: string;
}

/** 按时间顺序持久化的真实 Session 消息。 */
export type GoalMessage = UserMessage | AssistantMessage;

/**
 * Goal 创建后冻结的定义。
 *
 * @remarks 原始意图、Profile 和执行策略在 Session 生命周期内保持不变。
 * @example
 * ```ts
 * const definition: GoalDefinition = {
 *   intent: "实现恢复能力",
 *   profile,
 *   executionPolicy: { maxSteps: 0 },
 * };
 * ```
 */
export interface GoalDefinition {
    readonly intent: string;
    readonly profile: AgentProfile;
    readonly executionPolicy: {
        /** 正整数表示上限，`0` 表示不以 Step 数量限制执行。 */
        readonly maxSteps: number;
    };
}

/** Goal 在执行前的准备工作流，只有 executing 分支拥有最终任务。 */
export type GoalWorkflowState =
    | {
        readonly phase: "gathering_context";
        readonly preparation: {
            readonly status: "active" | "waiting_input";
        };
    }
    | {
        readonly phase: "planning";
        readonly preparation:
            | { readonly status: "active" }
            | {
                readonly status: "waiting_approval";
                readonly proposal: GoalTask;
            };
    }
    | {
        readonly phase: "executing";
        readonly preparation: { readonly status: "completed" };
        readonly task: GoalTask;
    };

/**
 * 最近一次已消费 Step 的可扩展记录。
 *
 * @remarks P0 仅保存 StepResult；未来 Action/Observation 扩展此边界。
 * @example
 * ```ts
 * const step: StepRecord = {
 *   result: { kind: "continue", summary: "已完成检查" },
 * };
 * ```
 */
export interface StepRecord {
    readonly result: StepResult;
}

/** 非 Step 自身导致的 Run 终止原因。 */
export type RunStopReason = { readonly kind: "max_steps_exceeded" };

/**
 * 单个 Run 的可持久化执行状态。
 *
 * @remarks `stepCount` 只统计 executing 阶段消费的 StepResult；lastStep 只保留最新 Step。
 * @example
 * ```ts
 * const run: RunState = createRun("run-1");
 * ```
 */
export interface RunState {
    readonly id: string;
    readonly status: RunStatus;
    readonly stepCount: number;
    readonly lastStep?: StepRecord;
    readonly stopReason?: RunStopReason;
}

/**
 * Goal 当前可变且需要持久化的状态。
 *
 * @remarks Preparation 不消费 Run Step；messages 只保存真实交互。
 * @example
 * ```ts
 * const state: GoalState = {
 *   workflow: { phase: "gathering_context", preparation: { status: "active" } },
 *   messages: [],
 *   run: createRun("run-1"),
 * };
 * ```
 */
export interface GoalState {
    readonly workflow: GoalWorkflowState;
    readonly messages: readonly GoalMessage[];
    readonly run: RunState;
}

/**
 * 一个可持久化、可恢复的 Session 聚合。
 *
 * @remarks definition 是冻结输入，state 是工作流推进产生的最新状态。
 * @example
 * ```ts
 * const goal = createGoal({ id: "goal-1", intent: "实现恢复", profile, runId: "run-1" });
 * ```
 */
export interface Goal {
    readonly id: string;
    readonly metadata: GoalMetadata;
    readonly definition: GoalDefinition;
    readonly state: GoalState;
}

/** Scheduler 与 Runner 使用的 Goal/Run 显式关联键。 */
export interface RunRef {
    readonly goalId: string;
    readonly runId: string;
}

/**
 * 旧 Launcher/RunStore 使用的任务输入。
 * @deprecated 新流程使用原始 intent 创建 Goal，批准后的任务保存在 workflow 中。
 * @example
 * ```ts
 * const input: GoalInput = {
 *   id: "goal-1",
 *   objective: "旧任务",
 *   completionCriteria: [],
 * };
 * ```
 */
export interface GoalInput extends GoalTask {
    readonly id: string;
}

/**
 * 旧 RunStore/Runner 边界使用的 v1 状态。
 * @deprecated 使用 Goal 和 GoalStore；此类型不继承 v2 RunState。
 * @example
 * ```ts
 * const run = createRun(goalInput, "run-1", profile);
 * ```
 */
export interface LegacyRunState {
    readonly id: string;
    readonly status: RunStatus;
    readonly stepCount: number;
    readonly lastResult?: StepResult;
    readonly goal: GoalInput;
    readonly profile: AgentProfile;
}

/** Run 生命周期状态；completed、failed、cancelled 是终态。 */
export type RunStatus =
    | "created"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled";

/** Executor 单步执行结果。 */
export type StepResult =
    | { readonly kind: "continue"; readonly summary: string }
    | { readonly kind: "wait"; readonly reason: string }
    | { readonly kind: "complete"; readonly summary: string }
    | { readonly kind: "fail"; readonly error: string };

/**
 * 传给 transition 的显式状态转换输入。
 *
 * @remarks `resume` 由外部协调器在保存解除 blocked 的真实输入时使用，
 * Runner 本身不暴露恢复入口。
 */
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

/**
 * createGoal 所需的确定性输入。
 *
 * @remarks intent 同时写入冻结定义和首条 user 消息；maxSteps 默认 0。
 * @example
 * ```ts
 * const input: GoalCreationInput = { id: "goal-1", intent: "实现恢复", profile, runId: "run-1" };
 * ```
 */
export interface GoalCreationInput {
    readonly id: string;
    readonly intent: string;
    readonly profile: AgentProfile;
    readonly runId: string;
    readonly maxSteps?: number;
    readonly messages?: readonly GoalMessage[];
}

/**
 * 旧调用方直接提交已确定任务时使用的创建输入。
 *
 * @deprecated 仅用于新准备工作流接管 Launcher 前保持现有执行链可用。
 *
 * @example
 * ```ts
 * const input: LegacyGoalCreationInput = {
 *   id: "goal-1",
 *   task: { objective: "旧任务", completionCriteria: [] },
 *   profile,
 *   runId: "run-1",
 * };
 * ```
 */
export interface LegacyGoalCreationInput {
    readonly id: string;
    readonly task: GoalTask;
    readonly profile: AgentProfile;
    readonly runId: string;
    readonly maxSteps?: number;
    readonly messages?: readonly GoalMessage[];
}

function cloneProfile(profile: AgentProfile): AgentProfile {
    return {
        ...profile,
        instructions: [...profile.instructions],
        toolIds: [...profile.toolIds],
    };
}

function cloneTask(task: GoalTask): GoalTask {
    return {
        objective: task.objective,
        completionCriteria: [...task.completionCriteria],
    };
}

function cloneMessages(messages: readonly GoalMessage[]): readonly GoalMessage[] {
    return messages.map((message) => message.role === "user"
        ? { role: "user", content: message.content }
        : {
            role: "assistant",
            assistant: { profileId: message.assistant.profileId },
            content: message.content,
        });
}

/**
 * 创建 gathering_context 阶段的确定性 Goal 聚合。
 * @param input - Goal ID、原始意图、冻结 Profile、Run ID 与执行策略。
 * @returns Run 为 created/0、Schema 版本为 2 的全新 Goal。
 * @throws maxSteps 不是非负整数时抛出 Error。
 */
export function createGoal(input: GoalCreationInput): Goal;

/** @deprecated 使用接收 intent 的 createGoal 输入。 */
export function createGoal(input: LegacyGoalCreationInput): Goal;

export function createGoal(
    input: GoalCreationInput | LegacyGoalCreationInput,
): Goal {
    const maxSteps = input.maxSteps ?? 0;

    if (!Number.isInteger(maxSteps) || maxSteps < 0) {
        throw new Error("maxSteps must be a non-negative integer");
    }

    const isLegacyInput = "task" in input;
    const intent = isLegacyInput ? input.task.objective : input.intent;
    const workflow: GoalWorkflowState = isLegacyInput
        ? {
            phase: "executing",
            preparation: { status: "completed" },
            task: cloneTask(input.task),
        }
        : {
            phase: "gathering_context",
            preparation: { status: "active" },
        };

    return {
        id: input.id,
        metadata: { schemaVersion: 2 },
        definition: {
            intent,
            profile: cloneProfile(input.profile),
            executionPolicy: { maxSteps },
        },
        state: {
            workflow,
            messages: cloneMessages([
                ...(isLegacyInput
                    ? []
                    : [{ role: "user", content: input.intent } as const]),
                ...(input.messages ?? []),
            ]),
            run: createRun(input.runId),
        },
    };
}

/** 创建只包含 Run 自身字段的初始状态。 */
export function createRun(runId: string): RunState;

/** @deprecated 旧 RunStore/Runner 边界的兼容工厂。 */
export function createRun(
    goal: GoalInput,
    runId: string,
    profile: AgentProfile,
): LegacyRunState;

export function createRun(
    runIdOrGoal: string | GoalInput,
    legacyRunId?: string,
    legacyProfile?: AgentProfile,
): RunState | LegacyRunState {
    const runId = typeof runIdOrGoal === "string" ? runIdOrGoal : legacyRunId;

    if (runId === undefined) {
        throw new Error("runId is required");
    }

    if (typeof runIdOrGoal === "string") {
        return { id: runId, status: "created", stepCount: 0 };
    }

    if (legacyProfile === undefined) {
        throw new Error("profile is required for the legacy createRun signature");
    }

    return {
        id: runId,
        status: "created",
        stepCount: 0,
        goal: { id: runIdOrGoal.id, ...cloneTask(runIdOrGoal) },
        profile: cloneProfile(legacyProfile),
    };
}
