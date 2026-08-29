import { z } from "zod";

import type { ContextLookupFilters, ContextLookupNeed } from "../../runtime/src/context-retrieval";

/** Snapshot 中 Tool 输入与 Observation 输出允许的递归 JSON 值。 */
export type SnapshotJsonValue =
    | string
    | number
    | boolean
    | null
    | readonly SnapshotJsonValue[]
    | { readonly [key: string]: SnapshotJsonValue };

/**
 * Goal Snapshot v5 文件协议的顶层 DTO。
 *
 * @remarks
 * 该类型族独立描述磁盘表示，不以索引类型复用 Runtime 领域契约；只有
 * Codec 允许同时看到 Snapshot DTO 与 Runtime Goal 两侧类型。
 *
 * @example
 * ```ts
 * const snapshot: GoalSnapshotV5 = {
 *     id: "goal-1",
 *     metadata: { schemaVersion: 5 },
 *     definition: {
 *         intent: "实现恢复",
 *         promptBundleVersion: 1,
 *         profile,
 *         executionPolicy: { maxSteps: 0 },
 *     },
 *     state,
 * };
 * ```
 */
export interface GoalSnapshotV5 {
    readonly id: string;
    readonly metadata: GoalSnapshotMetadataV5;
    readonly definition: GoalSnapshotDefinitionV5;
    readonly state: GoalSnapshotStateV5;
}

/**
 * Goal Snapshot v6 文件协议的顶层 DTO。
 *
 * @remarks
 * v6 在 Run 中增加 `committedThroughSequence`，用于以 Snapshot 建立 Trajectory
 * 恢复边界；v5 读取时该字段归一化为 `0`，不会改写原文件。
 *
 * @example
 * ```ts
 * const snapshot: GoalSnapshotV6 = {
 *     id: "goal-1",
 *     metadata: { schemaVersion: 6 },
 *     definition: { intent: "实现恢复", promptBundleVersion: 1, profile, executionPolicy: { maxSteps: 0 } },
 *     state: { workflow, messages: [], run: { id: "run-1", status: "created", stepCount: 0, committedThroughSequence: 0 } },
 * };
 * ```
 */
export type GoalSnapshotV6 = Omit<GoalSnapshotV5, "metadata" | "state"> & {
    readonly metadata: GoalSnapshotMetadataV6;
    readonly state: GoalSnapshotStateV6;
};

/**
 * Goal Snapshot v7 文件协议的顶层 DTO。
 *
 * @remarks
 * v7 显式冻结 Goal 的 Memory 协议，并在 Run 中保存 accepted Patch revision
 * 指针；它只保存指针，不保存 Working Memory 集合。v5/v6 仍可只读解码，下一次
 * 正常保存时由 Codec 生成 v7。
 *
 * @example
 * ```ts
 * const snapshot: GoalSnapshotV7 = {
 *     id: "goal-1",
 *     metadata: { schemaVersion: 7 },
 *     definition: {
 *         intent: "实现恢复",
 *         promptBundleVersion: 4,
 *         memoryProtocol: { kind: "structured", version: 1 },
 *         profile,
 *         executionPolicy: { maxSteps: 0 },
 *     },
 *     state,
 * };
 * ```
 */
export type GoalSnapshotV7 = Omit<GoalSnapshotV6, "metadata" | "definition" | "state"> & {
    readonly metadata: GoalSnapshotMetadataV7;
    readonly definition: GoalSnapshotDefinitionV7;
    readonly state: GoalSnapshotStateV7;
};

/**
 * Goal Snapshot v8 文件协议的顶层 DTO。
 *
 * @remarks
 * v8 在 v7 的 Memory 协议和 revision 基础上显式冻结模型上下文协议。旧 v5–v7
 * 快照只读恢复为 `conversation@1`，不会在读取时写回；下一次正常保存才生成 v8。
 *
 * @example
 * ```ts
 * const snapshot: GoalSnapshotV8 = {
 *     id: "goal-1",
 *     metadata: { schemaVersion: 8 },
 *     definition: {
 *         intent: "实现恢复",
 *         promptBundleVersion: 5,
 *         memoryProtocol: { kind: "structured", version: 1 },
 *         modelContextProtocol: { kind: "trajectory-layered", version: 1 },
 *         profile,
 *         executionPolicy: { maxSteps: 0 },
 *     },
 *     state,
 * };
 * ```
 */
export type GoalSnapshotV8 = Omit<GoalSnapshotV7, "metadata" | "definition"> & {
    readonly metadata: GoalSnapshotMetadataV8;
    readonly definition: GoalSnapshotDefinitionV8;
};

/**
 * Goal Snapshot v9 文件协议的顶层 DTO。
 *
 * @remarks
 * v9 在 v8 的 Memory 与模型上下文协议基础上显式冻结 Cold Trajectory 检索协议。
 * v5–v8 仍可只读解码为 `none@1`，读取过程不会写回旧文件；下一次正常保存才会
 * 生成 v9。索引、查询缓存和 Working Memory 内容仍不进入 Snapshot。
 *
 * @example
 * ```ts
 * const snapshot: GoalSnapshotV9 = {
 *     id: "goal-1",
 *     metadata: { schemaVersion: 9 },
 *     definition: {
 *         intent: "实现恢复",
 *         promptBundleVersion: 6,
 *         memoryProtocol: { kind: "structured", version: 1 },
 *         modelContextProtocol: { kind: "trajectory-layered", version: 1 },
 *         contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
 *         profile,
 *         executionPolicy: { maxSteps: 0 },
 *     },
 *     state,
 * };
 * ```
 */
export type GoalSnapshotV9 = Omit<GoalSnapshotV8, "metadata" | "definition" | "state"> & {
    readonly metadata: GoalSnapshotMetadataV9;
    readonly definition: GoalSnapshotDefinitionV9;
    readonly state: GoalSnapshotStateV9;
};

/**
 * Snapshot 顶层协议元数据；当前协议只有 v5。
 * @example
 * ```ts
 * const metadata: GoalSnapshotMetadataV5 = { schemaVersion: 5 };
 * ```
 */
export interface GoalSnapshotMetadataV5 {
    readonly schemaVersion: 5;
}

/** v6 Snapshot 顶层协议元数据。 */
export interface GoalSnapshotMetadataV6 {
    readonly schemaVersion: 6;
}

/** v7 Snapshot 顶层协议元数据。 */
export interface GoalSnapshotMetadataV7 {
    readonly schemaVersion: 7;
}

/** v8 Snapshot 顶层协议元数据。 */
export interface GoalSnapshotMetadataV8 {
    readonly schemaVersion: 8;
}

/** v9 Snapshot 顶层协议元数据。 */
export interface GoalSnapshotMetadataV9 {
    readonly schemaVersion: 9;
}

/**
 * Snapshot 中冻结的意图、Prompt 版本、Profile 与执行策略。
 *
 * @remarks `promptBundleVersion` 在恢复后保持不变，由 Agent 的 Bundle Registry 解释。
 * @example
 * ```ts
 * const definition: GoalSnapshotDefinitionV5 = {
 *     intent: "完成目标",
 *     promptBundleVersion: 1,
 *     profile,
 *     executionPolicy: { maxSteps: 0 },
 * };
 * ```
 */
export interface GoalSnapshotDefinitionV5 {
    readonly intent: string;
    readonly promptBundleVersion: number;
    readonly profile: GoalSnapshotProfileV5;
    readonly executionPolicy: {
        readonly maxSteps: number;
    };
}

/**
 * v7 Snapshot 中冻结的 Memory 协议选择。
 *
 * @remarks 只有 `checkpoint@1` 与 `structured@1` 被当前 Runtime 支持。
 * @example
 * ```ts
 * const protocol: GoalSnapshotMemoryProtocolV7 = {
 *     kind: "structured",
 *     version: 1,
 * };
 * ```
 */
export type GoalSnapshotMemoryProtocolV7 =
    | { readonly kind: "checkpoint"; readonly version: 1 }
    | { readonly kind: "structured"; readonly version: 1 };

/** v7 Snapshot 中带显式 Memory 协议的 Goal 定义。 */
export type GoalSnapshotDefinitionV7 = GoalSnapshotDefinitionV5 & {
    readonly memoryProtocol: GoalSnapshotMemoryProtocolV7;
};

/** v8 Snapshot 中冻结的模型上下文协议选择。 */
export type GoalSnapshotModelContextProtocolV8 =
    | { readonly kind: "conversation"; readonly version: 1 }
    | { readonly kind: "trajectory-layered"; readonly version: 1 };

/** v8 Snapshot 中同时冻结 Memory 与模型上下文协议的 Goal 定义。 */
export type GoalSnapshotDefinitionV8 = GoalSnapshotDefinitionV7 & {
    readonly modelContextProtocol: GoalSnapshotModelContextProtocolV8;
};

/** v9 Snapshot 中冻结的 Cold Trajectory 检索协议选择。 */
export type GoalSnapshotContextRetrievalProtocolV9 =
    | { readonly kind: "none"; readonly version: 1 }
    | { readonly kind: "bm25-lite"; readonly version: 1 };

/** v9 Snapshot 中同时冻结三项上下文协议的 Goal 定义。 */
export type GoalSnapshotDefinitionV9 = GoalSnapshotDefinitionV8 & {
    readonly contextRetrievalProtocol: GoalSnapshotContextRetrievalProtocolV9;
};

/** `GoalSnapshotContextRetrievalProtocolV9` 的兼容别名。 */
export type GoalSnapshotRetrievalProtocolV9 = GoalSnapshotContextRetrievalProtocolV9;

/**
 * Snapshot 持久化的 Agent Profile 表示。
 *
 * @remarks 保存创建 Goal 时冻结的配置，不在恢复时查询当前 Profile Store。
 * @example
 * ```ts
 * const profile: GoalSnapshotProfileV5 = {
 *     id: "default",
 *     systemPrompt: "You are a coding agent.",
 *     instructions: [],
 *     toolIds: [],
 * };
 * ```
 */
export interface GoalSnapshotProfileV5 {
    readonly id: string;
    readonly name?: string | undefined;
    readonly description?: string | undefined;
    readonly systemPrompt: string;
    readonly instructions: readonly string[];
    readonly toolIds: readonly string[];
}

/**
 * Snapshot 的工作流、真实消息与当前 Run 状态。
 *
 * @remarks 三个字段共同构成一次可恢复状态，不提供历史版本。
 * @example
 * ```ts
 * const state: GoalSnapshotStateV5 = { workflow, messages: [], run };
 * ```
 */
export interface GoalSnapshotStateV5 {
    readonly workflow: GoalSnapshotWorkflowV5;
    readonly messages: readonly GoalSnapshotMessageV5[];
    readonly run: GoalSnapshotRunStateV5;
}

/** v6 Snapshot 的工作流、消息与带提交边界的 Run 状态。 */
export type GoalSnapshotStateV6 = Omit<GoalSnapshotStateV5, "run"> & {
    readonly run: GoalSnapshotRunStateV6;
};

/** v7 Snapshot 的工作流、消息与带 Memory revision 的 Run 状态。 */
export type GoalSnapshotStateV7 = Omit<GoalSnapshotStateV6, "run"> & {
    readonly run: GoalSnapshotRunStateV7;
};

/** v8 Snapshot 的工作流、消息与协议边界；状态字段沿用 v7。 */
export type GoalSnapshotStateV8 = GoalSnapshotStateV7;

/** v9 Snapshot 的工作流、消息与协议边界；Run 可保存 Context Lookup Step。 */
export type GoalSnapshotStateV9 = Omit<GoalSnapshotStateV8, "run"> & {
    readonly run: GoalSnapshotRunStateV9;
};

/** 准备/执行工作流阶段的持久化表示；只有 executing 拥有最终任务。 */
export type GoalSnapshotWorkflowV5 =
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
                readonly proposal: GoalSnapshotTaskV5;
            };
    }
    | {
        readonly phase: "executing";
        readonly preparation: { readonly status: "completed" };
        readonly task: GoalSnapshotTaskV5;
    };

/**
 * 任务目标与完成标准。
 * @example
 * ```ts
 * const task: GoalSnapshotTaskV5 = {
 *     objective: "完成目标",
 *     completionCriteria: ["测试通过"],
 * };
 * ```
 */
export interface GoalSnapshotTaskV5 {
    readonly objective: string;
    readonly completionCriteria: readonly string[];
}

/** 真实会话消息的持久化表示。 */
export type GoalSnapshotMessageV5 =
    | { readonly role: "user"; readonly content: string }
    | {
        readonly role: "assistant";
        readonly assistant: { readonly profileId: string };
        readonly content: string;
    };

/**
 * Run 执行状态快照。
 *
 * @remarks 可选执行记忆必须满足文件 Schema 的跨字段状态不变量。
 * @example
 * ```ts
 * const run: GoalSnapshotRunStateV5 = {
 *     id: "run-1",
 *     status: "created",
 *     stepCount: 0,
 * };
 * ```
 */
export interface GoalSnapshotRunStateV5 {
    readonly id: string;
    readonly status: GoalSnapshotRunStatusV5;
    readonly stepCount: number;
    readonly lastStep?: GoalSnapshotStepRecordV5 | undefined;
    readonly checkpoint?: string | undefined;
    readonly pendingAction?: GoalSnapshotPendingActionV5 | undefined;
    readonly stopReason?: GoalSnapshotStopReasonV5 | undefined;
}

/**
 * v6 Run 执行状态。
 *
 * @remarks `committedThroughSequence` 是最新有效 Snapshot 纳入恢复边界的最大
 * Domain Event 序号；`state_committed` marker 不参与该字段的推导。
 */
export type GoalSnapshotRunStateV6 = Omit<GoalSnapshotRunStateV5, "lastStep" | "checkpoint" | "pendingAction" | "stopReason"> & {
    readonly committedThroughSequence: number;
    readonly lastStep?: GoalSnapshotStepRecordV5 | undefined;
    readonly checkpoint?: string | undefined;
    readonly pendingAction?: GoalSnapshotPendingActionV5 | undefined;
    readonly stopReason?: GoalSnapshotStopReasonV5 | undefined;
};

/** v7 Run 状态中指向最新 accepted Memory Patch 的 revision。 */
export interface GoalSnapshotMemoryRevisionV7 {
    readonly eventId: string;
    readonly sequence: number;
}

/** v7 Run 执行状态，新增结构化 Decision 与可选 Memory revision 指针。 */
export type GoalSnapshotRunStateV7 = Omit<GoalSnapshotRunStateV6, "lastStep"> & {
    readonly lastStep?: GoalSnapshotStepRecordV7 | undefined;
    readonly memoryRevision?: GoalSnapshotMemoryRevisionV7 | undefined;
};

/** v8 Run 状态；模型上下文协议位于 Snapshot definition。 */
export type GoalSnapshotRunStateV8 = GoalSnapshotRunStateV7;

/** v9 Run 状态；最近 Step 允许结构化 Context Lookup。 */
export type GoalSnapshotRunStateV9 = Omit<GoalSnapshotRunStateV8, "lastStep"> & {
    readonly lastStep?: GoalSnapshotStepRecordV9 | undefined;
};

/** Run 生命周期状态。 */
export type GoalSnapshotRunStatusV5 =
    | "created"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled";

/**
 * 最近一次已完成 Step 的持久化记录。
 *
 * @remarks 当前协议只接受 `action` 与 `decision`；`legacy` StepRecord 属于
 * 已删除的旧执行协议，出现即整体拒绝。
 */
export type GoalSnapshotStepRecordV5 =
    | {
        readonly kind: "action";
        readonly action: GoalSnapshotToolCallActionV5;
        readonly observation: GoalSnapshotObservationV5;
    }
    | {
        readonly kind: "decision";
        readonly result: GoalSnapshotDecisionResultV5;
    };

/** v7 structured Decision 的持久化结果分支。 */
export type GoalSnapshotStructuredDecisionResultV7 =
    | {
        readonly kind: "complete";
        readonly summary: string;
        readonly completionEvidence: readonly GoalSnapshotCompletionEvidenceV7[];
        readonly memoryPatch?: GoalSnapshotMemoryPatchV7 | undefined;
    }
    | {
        readonly kind: "wait";
        readonly reason: string;
        readonly memoryPatch?: GoalSnapshotMemoryPatchV7 | undefined;
    }
    | {
        readonly kind: "fail";
        readonly error: string;
        readonly memoryPatch?: GoalSnapshotMemoryPatchV7 | undefined;
    }
    ;

/**
 * v9 structured Decision 的独占 Context Lookup 结果分支。
 *
 * @example
 * ```ts
 * const result: GoalSnapshotContextLookupDecisionResultV9 = {
 *     kind: "context_lookup",
 *     need: "historical_execution",
 *     question: "之前执行过什么？",
 * };
 * ```
 */
export interface GoalSnapshotContextLookupDecisionResultV9 {
    readonly kind: "context_lookup";
    readonly need: ContextLookupNeed;
    readonly question: string;
    readonly filters?: ContextLookupFilters | undefined;

}

/** v9 structured Decision 结果，较 v7 增加 Context Lookup。 */
export type GoalSnapshotStructuredDecisionResultV9 =
    | GoalSnapshotStructuredDecisionResultV7
    | GoalSnapshotContextLookupDecisionResultV9;

/** v7 Decision 结果联合，按 Goal 冻结协议选择 legacy 或 structured 分支。 */
export type GoalSnapshotDecisionResultV7 =
    | GoalSnapshotDecisionResultV5
    | GoalSnapshotStructuredDecisionResultV7;

/** v9 Decision 结果联合，按 v9 Retrieval 协议允许 Context Lookup。 */
export type GoalSnapshotDecisionResultV9 =
    | GoalSnapshotDecisionResultV5
    | GoalSnapshotStructuredDecisionResultV9;

/** v7 最近 Step 记录，允许 structured AgentDecision。 */
export type GoalSnapshotStepRecordV7 =
    | {
        readonly kind: "action";
        readonly action: GoalSnapshotToolCallActionV5;
        readonly observation: GoalSnapshotObservationV5;
    }
    | {
        readonly kind: "decision";
        readonly result: GoalSnapshotDecisionResultV7;
    };

/** v9 最近 Step 记录，允许 structured Context Lookup。 */
export type GoalSnapshotStepRecordV9 =
    | {
        readonly kind: "action";
        readonly action: GoalSnapshotToolCallActionV5;
        readonly observation: GoalSnapshotObservationV5;
    }
    | {
        readonly kind: "decision";
        readonly result: GoalSnapshotDecisionResultV9;
    };

/** Structured complete Decision 的持久化完成证据。 */
export interface GoalSnapshotCompletionEvidenceV7 {
    readonly criterionIndex: number;
    readonly evidenceSequences: readonly number[];
}

/** v7 accepted Memory Patch 的持久化输入结构。 */
export interface GoalSnapshotMemoryPatchV7 {
    readonly protocolVersion: 1;
    readonly operations: readonly Record<string, unknown>[];
}

/**
 * Tool Action 调用的持久化表示。
 *
 * @remarks `actionId` 在审批、执行和恢复期间保持不变。
 * @example
 * ```ts
 * const action: GoalSnapshotToolCallActionV5 = {
 *     actionId: "action-1",
 *     toolId: "read_file",
 *     input: { path: "README.md" },
 * };
 * ```
 */
export interface GoalSnapshotToolCallActionV5 {
    readonly actionId: string;
    readonly toolId: string;
    readonly input: SnapshotJsonValue;
}

/** Tool Observation 的持久化表示。 */
export type GoalSnapshotObservationV5 =
    | {
        readonly kind: "success";
        readonly output: SnapshotJsonValue;
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

/** 终止性 Agent 决策的持久化表示。 */
export type GoalSnapshotDecisionResultV5 =
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
 * 未完成 Action 的持久化意图。
 *
 * @remarks 恢复行为由状态与 Tool replay policy 共同决定，不表示 Tool 结果。
 * @example
 * ```ts
 * const pending: GoalSnapshotPendingActionV5 = {
 *     action,
 *     status: "awaiting_approval",
 * };
 * ```
 */
export interface GoalSnapshotPendingActionV5 {
    readonly action: GoalSnapshotToolCallActionV5;
    readonly status: "approved" | "awaiting_approval" | "outcome_unknown";
}

/** 非 Step 自身导致的 Run 终止原因。 */
export type GoalSnapshotStopReasonV5 =
    | { readonly kind: "max_steps_exceeded" }
    | {
        readonly kind: "execution_error";
        readonly code:
            | "TOOL_NOT_AUTHORIZED"
            | "TOOL_NOT_FOUND"
            | "INVALID_TOOL_INPUT"
            | "INVALID_MEMORY_PATCH"
            | "INVALID_AGENT_DECISION"
            | "TOOL_EXECUTION_ERROR";
        readonly message: string;
    };

const NonEmptyStringSchema = z.string().min(1);

const GoalSnapshotMetadataSchema = z.object({
    schemaVersion: z.literal(5),
}).strict();

const GoalSnapshotTaskSchema = z.object({
    objective: z.string(),
    completionCriteria: z.array(z.string()),
}).strict();

const GoalSnapshotProfileSchema = z.object({
    id: z.string(),
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    systemPrompt: z.string(),
    instructions: z.array(z.string()),
    toolIds: z.array(z.string()),
}).strict();

const GoalSnapshotMessageSchema = z.discriminatedUnion("role", [
    z.object({
        role: z.literal("user"),
        content: z.string(),
    }).strict(),
    z.object({
        role: z.literal("assistant"),
        assistant: z.object({ profileId: z.string() }).strict(),
        content: z.string(),
    }).strict(),
]);

const JsonValueSchema = z.json();

const ToolCallActionSchema = z.object({
    actionId: NonEmptyStringSchema,
    toolId: NonEmptyStringSchema,
    input: JsonValueSchema,
}).strict();

const ObservationSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("success"),
        output: JsonValueSchema,
        summary: NonEmptyStringSchema,
    }).strict(),
    z.object({
        kind: z.literal("failure"),
        code: NonEmptyStringSchema,
        message: NonEmptyStringSchema,
        retryable: z.boolean(),
    }).strict(),
    z.object({
        kind: z.literal("rejected"),
        reason: NonEmptyStringSchema,
    }).strict(),
]);

const DecisionResultSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("complete"),
        checkpoint: NonEmptyStringSchema,
        summary: NonEmptyStringSchema,
    }).strict(),
    z.object({
        kind: z.literal("wait"),
        checkpoint: NonEmptyStringSchema,
        reason: NonEmptyStringSchema,
    }).strict(),
    z.object({
        kind: z.literal("fail"),
        checkpoint: NonEmptyStringSchema,
        error: NonEmptyStringSchema,
    }).strict(),
]);

const MemoryPatchOperationSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("add_finding"),
        finding: z.object({
            id: NonEmptyStringSchema,
            statement: NonEmptyStringSchema,
            evidenceSequences: z.array(z.number().int().positive()),
        }).strict(),
    }).strict(),
    z.object({
        type: z.literal("update_finding"),
        finding: z.object({
            id: NonEmptyStringSchema,
            statement: NonEmptyStringSchema.optional(),
            evidenceSequences: z.array(z.number().int().positive()).optional(),
            status: z.enum(["active", "resolved", "superseded"]).optional(),
        }).strict(),
    }).strict(),
    z.object({
        type: z.literal("upsert_hypothesis"),
        hypothesis: z.object({
            id: NonEmptyStringSchema,
            statement: NonEmptyStringSchema,
            status: z.enum(["active", "resolved", "superseded"]).optional(),
        }).strict(),
    }).strict(),
    z.object({
        type: z.literal("upsert_plan_item"),
        planItem: z.object({
            id: NonEmptyStringSchema,
            description: NonEmptyStringSchema,
            status: z.enum(["active", "resolved", "superseded"]).optional(),
        }).strict(),
    }).strict(),
    z.object({
        type: z.literal("upsert_blocker"),
        blocker: z.object({
            id: NonEmptyStringSchema,
            description: NonEmptyStringSchema,
            scope: z.enum(["goal", "phase"]),
            status: z.enum(["active", "resolved", "superseded"]).optional(),
        }).strict(),
    }).strict(),
    z.object({
        type: z.literal("set_next_action"),
        nextAction: z.union([
            z.object({
                id: NonEmptyStringSchema,
                description: NonEmptyStringSchema,
                status: z.enum(["active", "resolved", "superseded"]).optional(),
            }).strict(),
            z.null(),
        ]),
    }).strict(),
]);

const MemoryPatchV7Schema = z.object({
    protocolVersion: z.literal(1),
    operations: z.array(MemoryPatchOperationSchema),
}).strict();

const CompletionEvidenceV7Schema = z.object({
    criterionIndex: z.number().int().nonnegative(),
    evidenceSequences: z.array(z.number().int().positive()),
}).strict();

const StructuredDecisionResultSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("complete"),
        summary: NonEmptyStringSchema,
        completionEvidence: z.array(CompletionEvidenceV7Schema),
        memoryPatch: MemoryPatchV7Schema.optional(),
    }).strict(),
    z.object({
        kind: z.literal("wait"),
        reason: NonEmptyStringSchema,
        memoryPatch: MemoryPatchV7Schema.optional(),
    }).strict(),
    z.object({
        kind: z.literal("fail"),
        error: NonEmptyStringSchema,
        memoryPatch: MemoryPatchV7Schema.optional(),
    }).strict(),
]);

const ContextLookupDecisionResultSchema = z.object({
    kind: z.literal("context_lookup"),
    need: z.enum(["historical_execution", "decision_rationale"]),
    question: NonEmptyStringSchema.max(1024),
    filters: z.object({
        eventTypes: z.array(NonEmptyStringSchema).max(16).optional(),
        toolIds: z.array(NonEmptyStringSchema).max(16).optional(),
        actionIds: z.array(NonEmptyStringSchema).max(16).optional(),
        stepIndexes: z.array(z.number().int().nonnegative().safe()).max(16).optional(),
        paths: z.array(NonEmptyStringSchema).max(16).optional(),
        errorCodes: z.array(NonEmptyStringSchema).max(16).optional(),
        objectIds: z.array(NonEmptyStringSchema).max(16).optional(),
        sequenceRange: z.object({
            from: z.number().int().nonnegative().safe(),
            to: z.number().int().nonnegative().safe(),
        }).strict().optional(),
    }).strict().superRefine((filters, context) => {
        if (
            filters.sequenceRange !== undefined
            && filters.sequenceRange.to < filters.sequenceRange.from
        ) {
            context.addIssue({ code: "custom", message: "sequenceRange must not be inverted" });
        }
    }).optional(),
}).strict();

const DecisionResultV7Schema = z.union([
    z.object({
        kind: z.literal("complete"),
        checkpoint: NonEmptyStringSchema,
        summary: NonEmptyStringSchema,
    }).strict(),
    z.object({
        kind: z.literal("wait"),
        checkpoint: NonEmptyStringSchema,
        reason: NonEmptyStringSchema,
    }).strict(),
    z.object({
        kind: z.literal("fail"),
        checkpoint: NonEmptyStringSchema,
        error: NonEmptyStringSchema,
    }).strict(),
    ...StructuredDecisionResultSchema.options,
]);

const PendingActionSchema = z.object({
    action: ToolCallActionSchema,
    status: z.enum(["approved", "awaiting_approval", "outcome_unknown"]),
}).strict();

const StepRecordSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("action"),
        action: ToolCallActionSchema,
        observation: ObservationSchema,
    }).strict(),
    z.object({
        kind: z.literal("decision"),
        result: DecisionResultSchema,
    }).strict(),
]);

const StepRecordV7Schema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("action"),
        action: ToolCallActionSchema,
        observation: ObservationSchema,
    }).strict(),
    z.object({
        kind: z.literal("decision"),
        result: DecisionResultV7Schema,
    }).strict(),
]);

const DecisionResultV9Schema = z.union([
    z.object({
        kind: z.literal("complete"),
        checkpoint: NonEmptyStringSchema,
        summary: NonEmptyStringSchema,
    }).strict(),
    z.object({
        kind: z.literal("wait"),
        checkpoint: NonEmptyStringSchema,
        reason: NonEmptyStringSchema,
    }).strict(),
    z.object({
        kind: z.literal("fail"),
        checkpoint: NonEmptyStringSchema,
        error: NonEmptyStringSchema,
    }).strict(),
    ...StructuredDecisionResultSchema.options,
    ContextLookupDecisionResultSchema,
]);

const StepRecordV9Schema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("action"),
        action: ToolCallActionSchema,
        observation: ObservationSchema,
    }).strict(),
    z.object({
        kind: z.literal("decision"),
        result: DecisionResultV9Schema,
    }).strict(),
]);

const RunStatusSchema = z.enum([
    "created",
    "running",
    "waiting",
    "completed",
    "failed",
    "cancelled",
]);

const StopReasonSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("max_steps_exceeded"),
    }).strict(),
    z.object({
        kind: z.literal("execution_error"),
        code: z.enum([
            "TOOL_NOT_AUTHORIZED",
            "TOOL_NOT_FOUND",
            "INVALID_TOOL_INPUT",
            "INVALID_MEMORY_PATCH",
            "INVALID_AGENT_DECISION",
            "TOOL_EXECUTION_ERROR",
        ]),
        message: NonEmptyStringSchema,
    }).strict(),
]);

const MemoryProtocolSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("checkpoint"),
        version: z.literal(1),
    }).strict(),
    z.object({
        kind: z.literal("structured"),
        version: z.literal(1),
    }).strict(),
]);

const ModelContextProtocolSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("conversation"),
        version: z.literal(1),
    }).strict(),
    z.object({
        kind: z.literal("trajectory-layered"),
        version: z.literal(1),
    }).strict(),
]);

const MemoryRevisionSchema = z.object({
    eventId: NonEmptyStringSchema,
    sequence: z.number().int().positive(),
}).strict();

const RunStateSchema = z.object({
    id: z.string(),
    status: RunStatusSchema,
    stepCount: z.number().int().nonnegative(),
    lastStep: StepRecordSchema.optional(),
    checkpoint: NonEmptyStringSchema.optional(),
    pendingAction: PendingActionSchema.optional(),
    stopReason: StopReasonSchema.optional(),
}).strict();

const WorkflowSchema = z.discriminatedUnion("phase", [
    z.object({
        phase: z.literal("gathering_context"),
        preparation: z.object({
            status: z.enum(["active", "waiting_input"]),
        }).strict(),
    }).strict(),
    z.object({
        phase: z.literal("planning"),
        preparation: z.union([
            z.object({ status: z.literal("active") }).strict(),
            z.object({
                status: z.literal("waiting_approval"),
                proposal: GoalSnapshotTaskSchema,
            }).strict(),
        ]),
    }).strict(),
    z.object({
        phase: z.literal("executing"),
        preparation: z.object({ status: z.literal("completed") }).strict(),
        task: GoalSnapshotTaskSchema,
    }).strict(),
]);

function addInvariantIssue(
    context: z.RefinementCtx,
    message: string,
    path: PropertyKey[] = [],
): void {
    context.addIssue({ code: "custom", message, path });
}

function validateSnapshotInvariants(
    goal: z.infer<typeof GoalSnapshotBaseSchema>
        | z.infer<typeof GoalSnapshotV6BaseSchema>
        | z.infer<typeof GoalSnapshotV7BaseSchema>
        | z.infer<typeof GoalSnapshotV8BaseSchema>
        | z.infer<typeof GoalSnapshotV9BaseSchema>,
    context: z.RefinementCtx,
): void {
    const { run, workflow } = goal.state;
    const step = run.lastStep;
    const result = step?.kind === "decision" ? step.result : undefined;
    const structuredMemory =
        "memoryProtocol" in goal.definition
        && goal.definition.memoryProtocol.kind === "structured";
    const modelContextProtocol = "modelContextProtocol" in goal.definition
        ? goal.definition.modelContextProtocol
        : { kind: "conversation" as const, version: 1 as const };
    const contextRetrievalProtocol = "contextRetrievalProtocol" in goal.definition
        ? goal.definition.contextRetrievalProtocol
        : { kind: "none" as const, version: 1 as const };

    if (
        modelContextProtocol.kind === "trajectory-layered"
        && !structuredMemory
    ) {
        addInvariantIssue(
            context,
            "trajectory-layered model context requires structured Memory protocol",
            ["definition", "modelContextProtocol"],
        );
    }

    if (
        contextRetrievalProtocol.kind === "bm25-lite"
        && (
            !structuredMemory
            || modelContextProtocol.kind !== "trajectory-layered"
        )
    ) {
        addInvariantIssue(
            context,
            "bm25-lite retrieval requires structured Memory and trajectory-layered model context",
            ["definition", "contextRetrievalProtocol"],
        );
    }

    if ((run.stepCount > 0) !== (step !== undefined)) {
        addInvariantIssue(
            context,
            "lastStep must exist if and only if stepCount is positive",
            ["state", "run", "lastStep"],
        );
    }

    if (run.status === "created" && (
        run.stepCount !== 0
        || step !== undefined
        || run.checkpoint !== undefined
        || run.pendingAction !== undefined
        || run.stopReason !== undefined
    )) {
        addInvariantIssue(context, "created Run cannot contain execution progress");
    }

    if (workflow.phase !== "executing" && (
        run.status !== "created"
        || run.stepCount !== 0
        || step !== undefined
        || run.checkpoint !== undefined
        || run.pendingAction !== undefined
        || run.stopReason !== undefined
    )) {
        addInvariantIssue(
            context,
            "Preparation workflow requires a created Run without execution memory",
            ["state", "run"],
        );
    }

    if (run.status !== "failed" && run.stopReason !== undefined) {
        addInvariantIssue(context, "stopReason is only valid for a failed Run");
    }

    const pendingAction = run.pendingAction;

    if (pendingAction !== undefined) {
        if (workflow.phase !== "executing") {
            addInvariantIssue(
                context,
                "pendingAction is only valid for an executing Goal",
                ["state", "run", "pendingAction"],
            );
        }

        if (!structuredMemory && run.checkpoint === undefined) {
            addInvariantIssue(
                context,
                "pendingAction requires a checkpoint",
                ["state", "run", "checkpoint"],
            );
        }

        if (
            pendingAction.status === "awaiting_approval"
            && run.status !== "waiting"
        ) {
            addInvariantIssue(
                context,
                "awaiting_approval pendingAction requires a waiting Run",
            );
        }

        if (
            pendingAction.status === "outcome_unknown"
            && run.status !== "waiting"
            && run.status !== "failed"
        ) {
            addInvariantIssue(
                context,
                "outcome_unknown pendingAction requires a waiting or failed Run",
            );
        }

        if (run.status === "waiting" && pendingAction.status === "approved") {
            addInvariantIssue(
                context,
                "waiting Run cannot contain an approved pendingAction",
            );
        }

        if (
            (run.status === "completed" || run.status === "cancelled")
            && pendingAction !== undefined
        ) {
            addInvariantIssue(
                context,
                "terminal Run cannot contain a pendingAction",
            );
        }

        if (run.stopReason?.kind === "max_steps_exceeded") {
            addInvariantIssue(
                context,
                "maxSteps failure cannot contain a pendingAction",
            );
        }

        if (
            step?.kind === "action"
            && step.action.actionId === pendingAction.action.actionId
        ) {
            addInvariantIssue(
                context,
                "pendingAction cannot repeat the latest completed Action",
            );
        }
    }

    if (run.status === "waiting") {
        if (pendingAction === undefined && result?.kind !== "wait") {
            addInvariantIssue(
                context,
                "waiting Run requires a wait decision or a pending Action",
            );
        }

        if (
            pendingAction !== undefined
            && pendingAction.status !== "awaiting_approval"
            && pendingAction.status !== "outcome_unknown"
        ) {
            addInvariantIssue(
                context,
                "waiting Run requires an approval or recovery pendingAction",
            );
        }
    }

    if (run.status === "completed" && result?.kind !== "complete") {
        addInvariantIssue(context, "completed Run requires a complete decision");
    }

    if (run.status === "failed") {
        if (run.stopReason === undefined && result?.kind !== "fail") {
            addInvariantIssue(context, "failed Run requires a fail decision");
        }

        if (run.stopReason?.kind === "max_steps_exceeded") {
            const maxSteps = goal.definition.executionPolicy.maxSteps;
            const validPreviousStep = step?.kind === "action"
                || result?.kind === "wait"
                || result?.kind === "context_lookup";

            if (
                maxSteps <= 0
                || run.stepCount < maxSteps
                || !validPreviousStep
            ) {
                addInvariantIssue(
                    context,
                    "maxSteps failure requires a reached positive execution limit",
                );
            }
        }
    }

    if (
        run.status === "running"
        && step?.kind === "decision"
        && result?.kind !== "wait"
        && result?.kind !== "context_lookup"
    ) {
        addInvariantIssue(
            context,
            "running Run can only preserve a resumed wait or Context Lookup decision",
        );
    }

    if ("memoryProtocol" in goal.definition) {
        const memoryProtocol = goal.definition.memoryProtocol;
        const runWithMemory = run as typeof run & {
            readonly committedThroughSequence: number;
            readonly memoryRevision?: {
                readonly eventId: string;
                readonly sequence: number;
            };
        };

        if (
            memoryProtocol.kind === "checkpoint"
            && runWithMemory.memoryRevision !== undefined
        ) {
            addInvariantIssue(
                context,
                "checkpoint Memory protocol cannot contain memoryRevision",
                ["state", "run", "memoryRevision"],
            );
        }

        if (
            memoryProtocol.kind === "structured"
            && run.checkpoint !== undefined
        ) {
            addInvariantIssue(
                context,
                "structured Memory protocol cannot contain legacy run.checkpoint",
                ["state", "run", "checkpoint"],
            );
        }

        const revision = runWithMemory.memoryRevision;
        if (
            revision !== undefined
            && revision.sequence > runWithMemory.committedThroughSequence
        ) {
            addInvariantIssue(
                context,
                "memoryRevision.sequence cannot exceed committedThroughSequence",
                ["state", "run", "memoryRevision", "sequence"],
            );
        }

        if (step?.kind === "decision") {
            const decisionResult = step.result as {
                readonly kind: string;
                readonly checkpoint?: unknown;
                readonly completionEvidence?: unknown;
                readonly memoryPatch?: unknown;
            };

            if (memoryProtocol.kind === "structured") {
                if (decisionResult.checkpoint !== undefined) {
                    addInvariantIssue(
                        context,
                        "structured Decision cannot contain checkpoint",
                        ["state", "run", "lastStep", "result", "checkpoint"],
                    );
                }
                if (
                    decisionResult.kind === "complete"
                    && !Array.isArray(decisionResult.completionEvidence)
                ) {
                    addInvariantIssue(
                        context,
                        "structured complete Decision requires completionEvidence",
                        ["state", "run", "lastStep", "result", "completionEvidence"],
                    );
                }
            } else if (
                decisionResult.checkpoint === undefined
                || decisionResult.completionEvidence !== undefined
                || decisionResult.memoryPatch !== undefined
            ) {
                addInvariantIssue(
                    context,
                    "checkpoint Decision must use the legacy response shape",
                    ["state", "run", "lastStep", "result"],
                );
            }
        }
    }
}

const GoalSnapshotBaseSchema = z.object({
    id: z.string(),
    metadata: GoalSnapshotMetadataSchema,
    definition: z.object({
        intent: z.string(),
        promptBundleVersion: z.number().int().positive(),
        profile: GoalSnapshotProfileSchema,
        executionPolicy: z.object({
            maxSteps: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
    state: z.object({
        workflow: WorkflowSchema,
        messages: z.array(GoalSnapshotMessageSchema),
        run: RunStateSchema,
    }).strict(),
}).strict();

const GoalSnapshotV6BaseSchema = z.object({
    id: z.string(),
    metadata: z.object({ schemaVersion: z.literal(6) }).strict(),
    definition: z.object({
        intent: z.string(),
        promptBundleVersion: z.number().int().positive(),
        profile: GoalSnapshotProfileSchema,
        executionPolicy: z.object({
            maxSteps: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
    state: z.object({
        workflow: WorkflowSchema,
        messages: z.array(GoalSnapshotMessageSchema),
        run: RunStateSchema.extend({
            committedThroughSequence: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
}).strict();

const GoalSnapshotV7BaseSchema = z.object({
    id: z.string(),
    metadata: z.object({ schemaVersion: z.literal(7) }).strict(),
    definition: z.object({
        intent: z.string(),
        promptBundleVersion: z.number().int().positive(),
        memoryProtocol: MemoryProtocolSchema,
        profile: GoalSnapshotProfileSchema,
        executionPolicy: z.object({
            maxSteps: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
    state: z.object({
        workflow: WorkflowSchema,
        messages: z.array(GoalSnapshotMessageSchema),
        run: RunStateSchema.extend({
            committedThroughSequence: z.number().int().nonnegative(),
            memoryRevision: MemoryRevisionSchema.optional(),
            lastStep: StepRecordV7Schema.optional(),
        }).strict(),
    }).strict(),
}).strict();

const GoalSnapshotV8BaseSchema = z.object({
    id: z.string(),
    metadata: z.object({ schemaVersion: z.literal(8) }).strict(),
    definition: z.object({
        intent: z.string(),
        promptBundleVersion: z.number().int().positive(),
        memoryProtocol: MemoryProtocolSchema,
        modelContextProtocol: ModelContextProtocolSchema,
        profile: GoalSnapshotProfileSchema,
        executionPolicy: z.object({
            maxSteps: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
    state: z.object({
        workflow: WorkflowSchema,
        messages: z.array(GoalSnapshotMessageSchema),
        run: RunStateSchema.extend({
            committedThroughSequence: z.number().int().nonnegative(),
            memoryRevision: MemoryRevisionSchema.optional(),
            lastStep: StepRecordV7Schema.optional(),
        }).strict(),
    }).strict(),
}).strict();

const ContextRetrievalProtocolSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("none"),
        version: z.literal(1),
    }).strict(),
    z.object({
        kind: z.literal("bm25-lite"),
        version: z.literal(1),
    }).strict(),
]);

const GoalSnapshotV9BaseSchema = z.object({
    id: z.string(),
    metadata: z.object({ schemaVersion: z.literal(9) }).strict(),
    definition: z.object({
        intent: z.string(),
        promptBundleVersion: z.number().int().positive(),
        memoryProtocol: MemoryProtocolSchema,
        modelContextProtocol: ModelContextProtocolSchema,
        contextRetrievalProtocol: ContextRetrievalProtocolSchema,
        profile: GoalSnapshotProfileSchema,
        executionPolicy: z.object({
            maxSteps: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
    state: z.object({
        workflow: WorkflowSchema,
        messages: z.array(GoalSnapshotMessageSchema),
        run: RunStateSchema.extend({
            committedThroughSequence: z.number().int().nonnegative(),
            memoryRevision: MemoryRevisionSchema.optional(),
            lastStep: StepRecordV9Schema.optional(),
        }).strict(),
    }).strict(),
}).strict();

/**
 * 严格 v5 Goal Snapshot Schema。
 *
 * @remarks
 * Schema 只负责文件协议校验：拒绝未声明字段、`legacy` StepRecord 与违反
 * 跨字段不变量的组合；不读取文件系统，也不构造 Runtime Goal。v1 至 v4
 * 与未知版本在 Codec 入口被拒绝，不会进入该 Schema。
 *
 * @example
 * ```ts
 * const result = GoalSnapshotV5Schema.safeParse(JSON.parse(text));
 * ```
 */
export const GoalSnapshotV5Schema = GoalSnapshotBaseSchema.superRefine(
    validateSnapshotInvariants,
);

/**
 * 严格 v6 Goal Snapshot Schema。
 *
 * @remarks
 * 除 v5 已有跨字段约束外，v6 要求 Run 明确提供非负的
 * `committedThroughSequence`。该字段是 Snapshot 的恢复边界，不依赖 marker。
 *
 * @example
 * ```ts
 * const result = GoalSnapshotV6Schema.safeParse(JSON.parse(text));
 * ```
 */
export const GoalSnapshotV6Schema = GoalSnapshotV6BaseSchema.superRefine(
    validateSnapshotInvariants,
);

/**
 * 严格 v7 Goal Snapshot Schema。
 *
 * @remarks
 * v7 显式保存 Memory 协议与可选 revision 指针；Schema 同时拒绝 legacy 与
 * structured 协议的跨字段混用。Working Memory 本体和 Trajectory 事件不在快照中。
 *
 * @example
 * ```ts
 * const result = GoalSnapshotV7Schema.safeParse(JSON.parse(text));
 * ```
 */
export const GoalSnapshotV7Schema = GoalSnapshotV7BaseSchema.superRefine(
    validateSnapshotInvariants,
);

/**
 * 严格 v8 Goal Snapshot Schema。
 *
 * @remarks
 * v8 在 v7 的 Memory 协议基础上要求显式保存模型上下文协议，并拒绝
 * `checkpoint@1` 与 `trajectory-layered@1` 的不兼容组合。Working Memory 本体、
 * Hot/Warm 缓存和 Trajectory 事件仍不进入快照。
 *
 * @example
 * ```ts
 * const result = GoalSnapshotV8Schema.safeParse(JSON.parse(text));
 * ```
 */
export const GoalSnapshotV8Schema = GoalSnapshotV8BaseSchema.superRefine(
    validateSnapshotInvariants,
);

/**
 * 严格 v9 Goal Snapshot Schema。
 *
 * @remarks
 * v9 要求显式保存 `none@1` 或 `bm25-lite@1` 检索协议，并拒绝后者与旧 Memory
 * 或 Conversation 模型上下文的交叉组合。检索索引、查询缓存和 Working Memory
 * 本体仍不进入快照。
 *
 * @example
 * ```ts
 * const result = GoalSnapshotV9Schema.safeParse(JSON.parse(text));
 * ```
 */
export const GoalSnapshotV9Schema = GoalSnapshotV9BaseSchema.superRefine(
    validateSnapshotInvariants,
);

export const INVALID_GOAL_SNAPSHOT_CODE = "INVALID_GOAL_SNAPSHOT" as const;

/**
 * 表示 Goal JSON 快照违反持久化协议的错误。
 *
 * @remarks
 * v1 至 v4、未知版本、非法结构与不成立的
 * 状态组合都使用该错误；文件系统本身的读写错误不使用该类型，以便调用方
 * 区分协议损坏和 I/O 故障。
 *
 * @example
 * ```ts
 * try {
 *     codec.decode(input);
 * } catch (error) {
 *     if (error instanceof GoalSnapshotProtocolError) {
 *         console.error(error.code);
 *     }
 * }
 * ```
 */
export class GoalSnapshotProtocolError extends Error {
    readonly code = INVALID_GOAL_SNAPSHOT_CODE;

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "GoalSnapshotProtocolError";
    }
}
