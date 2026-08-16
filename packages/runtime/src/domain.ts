import type { AgentProfile } from "./agent-profile";

/** Goal 的稳定任务定义，不包含执行过程中产生的状态。 */
export interface GoalTask {
    readonly objective: string;
    readonly completionCriteria: readonly string[];
}

/**
 * Tool 输入和 Observation 输出使用的递归 JSON 对象。
 *
 * @remarks
 * 该边界排除函数、`undefined`、`bigint` 和循环引用，保证 Action/Observation
 * 能随 Goal 快照稳定序列化。
 *
 * @example
 * ```ts
 * const input: JsonObject = { path: "src/index.ts" };
 * ```
 */
export interface JsonObject {
    readonly [key: string]: JsonValue;
}

/** Tool 输入与 Observation 输出允许的 JSON 值。 */
export type JsonValue =
    | null
    | boolean
    | number
    | string
    | readonly JsonValue[]
    | JsonObject;

/**
 * Goal 快照协议元数据。
 *
 * @remarks v3 表示 Goal 快照包含有界 Action/Observation 执行记忆。
 * @example
 * ```ts
 * const metadata: GoalMetadata = { schemaVersion: 3 };
 * ```
 */
export interface GoalMetadata {
    readonly schemaVersion: 3;
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
 * Agent 请求 Runtime 调用的单个 Tool Action。
 *
 * @remarks
 * `actionId` 是一次 Action 生命周期的稳定身份；重放或审批必须沿用它。
 * `input` 只允许 JSON 值，Runtime 不把模型声明的执行结果当作 Observation。
 *
 * @example
 * ```ts
 * const action: ToolCallAction = {
 *   actionId: "action-1",
 *   toolId: "read_file",
 *   input: { path: "README.md" },
 * };
 * ```
 */
export interface ToolCallAction {
    readonly actionId: string;
    readonly toolId: string;
    readonly input: JsonValue;
}

/**
 * Tool 执行环境返回的可信结果。
 *
 * @remarks
 * `success` 与 `failure` 都是正常 Tool 结果，`rejected` 表示策略或用户拒绝；
 * Tool 未能返回结果时由 Runtime 记录系统失败，不伪造 Observation。
 *
 * @example
 * ```ts
 * const observation: Observation = {
 *   kind: "success",
 *   output: "file content",
 *   summary: "已读取 README.md",
 * };
 * ```
 */
export type Observation =
    | {
        readonly kind: "success";
        readonly output: JsonValue;
        readonly summary: string;
    }
    | {
        readonly kind: "failure";
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
    }
    | {
        readonly kind: "rejected";
        readonly reason: string;
    };

/**
 * Agent 对当前执行轮次作出的唯一结构化决策。
 *
 * @remarks
 * 每个分支都必须带非空、已吸收当前 Working Context 的累计 checkpoint；
 * `tool_call` 才会产生待执行 Action，其余分支直接结束本轮。
 *
 * @example
 * ```ts
 * const decision: AgentDecision = {
 *   kind: "tool_call",
 *   checkpoint: "已定位需要读取的配置文件",
 *   action: {
 *     actionId: "action-1",
 *     toolId: "read_file",
 *     input: { path: "config.json" },
 *   },
 * };
 * ```
 */
export type AgentDecision =
    | {
        readonly kind: "tool_call";
        readonly checkpoint: string;
        readonly action: ToolCallAction;
    }
    | {
        readonly kind: "complete";
        readonly checkpoint: string;
        readonly summary: string;
    }
    | {
        readonly kind: "wait";
        readonly checkpoint: string;
        readonly reason: string;
    }
    | {
        readonly kind: "fail";
        readonly checkpoint: string;
        readonly error: string;
    };

/**
 * 当前未完成 Action 的持久化意图。
 *
 * @remarks
 * `approved` 表示已通过当前调度周期的授权，`awaiting_approval` 等待用户批准，
 * `outcome_unknown` 表示执行可能已经发生但结果未能保存；恢复时必须保留原
 * `actionId`。
 *
 * @example
 * ```ts
 * const pending: PendingAction = {
 *   action,
 *   status: "awaiting_approval",
 * };
 * ```
 */
export interface PendingAction {
    readonly action: ToolCallAction;
    readonly status: "approved" | "awaiting_approval" | "outcome_unknown";
}

/**
 * 最近一次已完成 Step 的有界记录。
 *
 * @remarks
 * Goal 只保存这一条记录，不累积完整 Action/Observation 轨迹。`legacy` 仅由
 * v1/v2 只读迁移产生；当前旧 StepResult 执行路径的兼容写入会在 Store 边界
 * 归一化为该分支，新执行协议不得创建 legacy 记录。
 *
 * @example
 * ```ts
 * const step: StepRecord = {
 *   kind: "action",
 *   action,
 *   observation: { kind: "success", output: "ok", summary: "读取完成" },
 * };
 * ```
 */
export type StepRecord =
    | {
        readonly kind: "action";
        readonly action: ToolCallAction;
        readonly observation: Observation;
    }
    | {
        readonly kind: "decision";
        readonly result: Exclude<AgentDecision, { readonly kind: "tool_call" }>;
    }
    | {
        readonly kind: "legacy";
        readonly result: StepResult;
    };

/** 可识别的 Runtime 执行协议失败代码。 */
export type ExecutionErrorCode =
    | "TOOL_NOT_AUTHORIZED"
    | "TOOL_NOT_FOUND"
    | "INVALID_TOOL_INPUT"
    | "INVALID_AGENT_DECISION"
    | "TOOL_EXECUTION_ERROR";

/** 非 Step 自身导致的 Run 终止原因。 */
export type RunStopReason =
    | { readonly kind: "max_steps_exceeded" }
    | {
        readonly kind: "execution_error";
        readonly code: ExecutionErrorCode;
        readonly message: string;
    };

/**
 * 单个 Run 的可持久化执行状态。
 *
 * @remarks
 * `stepCount` 只统计 executing 阶段完成的决策或 Action/Observation 周期；
 * `lastStep` 只保留最新 Step。`checkpoint` 与 `pendingAction` 是有界执行记忆，
 * 不属于 Goal.messages。
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
    readonly checkpoint?: string;
    readonly pendingAction?: PendingAction;
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
 * 一次调度调用的瞬时授权。
 *
 * @remarks
 * `authorizedActionId` 只在当前 Scheduler/Runner 调用链内有效，不写入 Goal
 * 快照。它必须匹配已持久化且状态为 `approved` 的 pendingAction；批准本身不
 * 增加 `stepCount`。
 *
 * @example
 * ```ts
 * const options: RunExecutionOptions = {
 *   authorizedActionId: "action-1",
 * };
 * ```
 */
export interface RunExecutionOptions {
    readonly authorizedActionId?: string;
}

/**
 * 旧 RunStore 与兼容工厂使用的任务输入。
 * @deprecated 新 Launcher 使用原始 intent 创建 Goal，批准后的任务保存在 workflow 中。
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
 * @deprecated 使用 Goal 和 GoalStore；此类型不继承 v3 RunState。
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
 * @remarks
 * `stage_action` 只建立可恢复的 Action 意图，不消费 Step；`approve_action` 和
 * `recover_action` 只解除或改变 Action 恢复状态，不消费 Step；`observe_action`、
 * `reject_action` 和非 Tool 的 `decision` 才完成一个 Step。`execution_error`
 * 停止当前 Run 但不消费 Step，并在存在待执行 Action 时保留其不确定结果。
 * 旧 `step` 分支仅供尚未升级的兼容执行链使用。
 *
 * `resume` 由外部协调器在保存解除 Agent wait 的真实输入时使用；`recover_action`
 * 由 Runner 在进程恢复时用于把已批准但结果未知的 Action 转为可处理的等待点。
 *
 * @example
 * ```ts
 * const input: RunInput = {
 *   kind: "stage_action",
 *   checkpoint: "已确定要读取配置",
 *   action: {
 *     actionId: "action-1",
 *     toolId: "read_file",
 *     input: { path: "config.json" },
 *   },
 * };
 * ```
 */
export type RunInput =
    | { readonly kind: "start" }
    | { readonly kind: "step"; readonly result: StepResult }
    | {
        readonly kind: "stage_action";
        readonly checkpoint: string;
        readonly action: ToolCallAction;
        readonly status?: "approved" | "awaiting_approval";
    }
    | {
        readonly kind: "observe_action";
        readonly actionId: string;
        readonly observation: Exclude<Observation, { readonly kind: "rejected" }>;
    }
    | {
        readonly kind: "decision";
        readonly decision: Exclude<AgentDecision, { readonly kind: "tool_call" }>;
    }
    | {
        readonly kind: "reject_action";
        readonly actionId: string;
        readonly reason: string;
    }
    | {
        readonly kind: "approve_action";
        readonly actionId: string;
    }
    | {
        readonly kind: "recover_action";
        readonly actionId: string;
    }
    | {
        readonly kind: "execution_error";
        readonly code: ExecutionErrorCode;
        readonly message: string;
    }
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
 * @deprecated 仅供兼容调用方直接构造已准备的 executing Goal；新 Launcher
 * 始终从 gathering_context 创建。
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
 * @returns Run 为 created/0、Schema 版本为 3 的全新 Goal。
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
        metadata: { schemaVersion: 3 },
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
