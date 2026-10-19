/**
 * 模型可见的历史结果表示契约。
 *
 * @remarks
 * 本文件只声明进入模型上下文的执行单元、事件、输出预览、原生交换与 Warm 条目
 * 表示，不导入 Runtime 领域类型、Store、Artifact Resolver 或投影实现。事件类型
 * 名称是本表示自身的值域，不复制 Runtime 事件载荷协议；投影器赋值时若 Runtime
 * 新增事件类型会在编译期失败，强制显式更新本契约。
 */

import type { ModelConversationMessage } from "../../model-contracts/src/index";

/**
 * 模型可见的 Trajectory 事件类型名称。
 *
 * @remarks
 * 与当前 Runtime 事件类型一一对应；本表示不需要事件载荷结构。
 */
export type ModelTrajectoryEventType =
    | "action_approved"
    | "action_recovered"
    | "action_rejected"
    | "action_staged"
    | "ask_user_answered"
    | "ask_user_replied"
    | "ask_user_skipped"
    | "context_epoch_advanced"
    | "context_epoch_closed"
    | "context_lookup_completed"
    | "context_lookup_failed"
    | "context_lookup_not_found"
    | "context_lookup_requested"
    | "context_note_declared"
    | "decide_batch_accepted"
    | "decision_received"
    | "execution_error"
    | "goal_created"
    | "goal_plan_updated"
    | "memory_patch_accepted"
    | "model_context_frame"
    | "model_repair_attempt_started"
    | "model_repair_feedback_recorded"
    | "model_request_retry_recorded"
    | "model_response_received"
    | "observation_recorded"
    | "plan_mode_entered"
    | "program_settled"
    | "program_started"
    | "program_time_reserved"
    | "run_cancelled"
    | "run_completed"
    | "run_created"
    | "run_failed"
    | "run_interrupt_repair_started"
    | "run_interrupt_requested"
    | "run_interrupted_action_unknown"
    | "run_plan_route_revised"
    | "run_resumed"
    | "run_stage_accepted"
    | "run_stage_declared"
    | "run_stage_rejected"
    | "run_started"
    | "run_waiting"
    | "sandbox_grant_revoked"
    | "session_input_admitted"
    | "session_input_applied"
    | "session_input_cleared"
    | "state_committed"
    | "steer_input_applied"
    | "steer_input_received"
    | "task_approved"
    | "task_feedback_received"
    | "think_completed"
    | "think_requested"
    | "tool_attempt_failed"
    | "tool_attempt_started"
    | "tool_finished"
    | "tool_grant_revoked"
    | "tool_started";

/**
 * 供模型使用的单个 Trajectory 事件 DTO。
 *
 * @remarks
 * 除 Tool Observation 的大型 `output` 外，其余字段保持事件事实语义；输出投影
 * 只在本轮模型上下文中存在，不写回原始事件。
 *
 * @example
 * ```ts
 * const event: ModelTrajectoryEvent = {
 *     eventId: "event-1",
 *     sequence: 12,
 *     eventType: "tool_finished",
 *     phase: "executing",
 *     executionUnitId: "unit-1",
 *     payload: { type: "tool_finished" },
 * };
 * ```
 */
export interface ModelTrajectoryEvent {
    readonly eventId: string;
    readonly sequence: number;
    readonly eventType: ModelTrajectoryEventType;
    readonly phase: "executing";
    readonly goalId: string;
    readonly runId: string;
    readonly executionUnitId?: string;
    readonly actionId?: string;
    readonly parentEventId?: string;
    readonly payload: unknown;
}

/** 未被截断的模型可见输出。 */
export interface CompleteModelOutputProjection {
    readonly truncated: false;
    readonly value: unknown;
    readonly sourceSequence: number;
    readonly sourceSequenceRange: { readonly first: number; readonly last: number };
    readonly contentHash: string;
    readonly artifactAvailability: "available" | "unavailable";
    readonly artifactReference?: string;
}

/** 被有界预览替代的模型可见输出。 */
export interface PreviewedModelOutputProjection {
    readonly truncated: true;
    readonly preview: {
        readonly prefix: string;
        readonly suffix: string;
    };
    readonly serializedLength: number;
    readonly sourceSequence: number;
    readonly sourceSequenceRange: { readonly first: number; readonly last: number };
    readonly contentHash: string;
    readonly artifactAvailability: "available" | "unavailable";
    readonly artifactReference?: string;
}

/** Tool 输出在模型上下文中的完整或预览投影。 */
export type ModelOutputProjection =
    | CompleteModelOutputProjection
    | PreviewedModelOutputProjection;

/**
 * 同一模型响应及其已提交结果的不可拆分消息交换。
 *
 * @remarks
 * Conversation 位置决定与真实用户消息的顺序；签名和调用参数随完整交换裁剪。
 *
 * @example
 * ```ts
 * const exchange: NativeModelExchange = {
 *     conversationPosition: 1,
 *     responseSequence: 2,
 *     settledThroughSequence: 8,
 *     messages: [{ role: "user", content: "hello", sourceMessageIndex: 0 }],
 * };
 * ```
 */
export interface NativeModelExchange {
    readonly conversationPosition: number;
    readonly responseSequence: number;
    readonly settledThroughSequence: number;
    readonly messages: readonly ModelConversationMessage[];
}

/**
 * 可进入模型历史预算的执行单元投影。
 *
 * @remarks
 * `nativeExchanges` 包含完整调用与结果；选择器必须按整个单元裁剪，不修改原始签名。
 *
 * @example
 * ```ts
 * const count = unit.nativeExchanges?.flatMap(exchange => exchange.messages).length ?? 0;
 * ```
 */
export interface ModelExecutionUnitProjection {
    /** 原生回放时替代同单元中的模型调用及结果文本，按整个单元进行预算裁剪。 */
    readonly nativeExchanges?: readonly NativeModelExchange[];
    readonly executionUnitId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly phase: "executing";
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly events: readonly ModelTrajectoryEvent[];
}

/** Warm Compact 支持的语义分区。 */
export type WarmEntryKind =
    | "decision"
    | "finding"
    | "failure"
    | "blocker"
    | "unresolved";

/** Warm 条目的生命周期状态。 */
export type WarmEntryStatus = "active" | "resolved" | "superseded";

/**
 * 可进入 Warm 层的有损条目。
 *
 * @remarks
 * 条目只描述 committed Trajectory 的中期语义，不替代 Goal Task、Working Memory
 * 或 Runtime 控制状态。`sourceHash` 和 evidence sequence 使其可验证；淘汰条目后
 * 原始事实仍留在 Cold Trajectory。
 *
 * @example
 * ```ts
 * const entry: WarmCompactEntry = {
 *     id: "finding-tests-pass",
 *     kind: "finding",
 *     summary: "单元测试已通过",
 *     status: "active",
 *     lossy: true,
 *     evidenceSequences: [18],
 *     firstSequence: 18,
 *     lastSequence: 18,
 *     lastAccessedSequence: 18,
 *     reinforcementCount: 1,
 *     sourceHash: "sha256:...",
 * };
 * ```
 */
export interface WarmCompactEntry {
    readonly id: string;
    readonly kind: WarmEntryKind;
    readonly summary: string;
    readonly status: WarmEntryStatus;
    readonly lossy: true;
    readonly evidenceSequences: readonly number[];
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly lastAccessedSequence: number;
    readonly reinforcementCount: number;
    readonly sourceHash: string;
}
