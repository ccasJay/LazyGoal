import type { BrowserRunStatus } from "./session";

/**
 * 轨迹查询与事件详情数据传输对象 (DTO)。
 */

/**
 * 轨迹 Run 状态投影。
 *
 * @example
 * ```ts
 * const run: BrowserTrajectoryRun = {
 *     runId: "run-1",
 *     status: "running",
 *     current: true,
 *     committedThroughSequence: 10,
 * };
 * ```
 */
export interface BrowserTrajectoryRun {
    /** Run 标识。 */
    readonly runId: string;
    /** Run 状态。 */
    readonly status: BrowserRunStatus;
    /** 是否为当前最新 Run。 */
    readonly current: boolean;
    /** 已提交序列号边界。 */
    readonly committedThroughSequence: number;
}

/**
 * 单条轨迹事件列表条目。
 *
 * @example
 * ```ts
 * const entry: BrowserTrajectoryEntry = {
 *     eventId: "evt-1",
 *     sequence: 1,
 *     occurredAt: "2026-10-18T00:00:00.000Z",
 *     eventType: "run_started",
 *     category: "lifecycle",
 *     title: "Run Started",
 *     preview: "",
 *     previewTruncated: false,
 * };
 * ```
 */
export interface BrowserTrajectoryEntry {
    /** 事件唯一标识。 */
    readonly eventId: string;
    /** 序列号。 */
    readonly sequence: number;
    /** 发生时间。 */
    readonly occurredAt: string;
    /** 事件类型标识。 */
    readonly eventType: string;
    /** 事件分类。 */
    readonly category:
        | "lifecycle"
        | "decision"
        | "memory"
        | "action"
        | "tool"
        | "observation"
        | "terminal"
        | "commit";
    /** 执行单元标识。 */
    readonly executionUnitId?: string;
    /** Step 序号。 */
    readonly stepIndex?: number;
    /** 关联 Action 标识。 */
    readonly actionId?: string;
    /** 内部程序调用标识。 */
    readonly programId?: string;
    /** 程序内调用索引。 */
    readonly callIndex?: number;
    /** 父 Action 标识。 */
    readonly parentActionId?: string;
    /** 标题。 */
    readonly title: string;
    /** 预览摘要文本。 */
    readonly preview: string;
    /** 预览文本是否截断。 */
    readonly previewTruncated: boolean;
    /** 输入预览。 */
    readonly inputPreview?: string;
    /** 结果预览。 */
    readonly resultPreview?: string;
    /** 模型调用标识。 */
    readonly modelCallId?: string;
    /** 模型执行阶段。 */
    readonly modelStage?: "think" | "decide";
}

/**
 * 轨迹分页查询响应页。
 *
 * @example
 * ```ts
 * const page: BrowserTrajectoryPage = {
 *     goalId: "goal-1",
 *     run: { runId: "run-1", status: "completed", current: true, committedThroughSequence: 1 },
 *     entries: [],
 *     total: 1,
 *     committedCount: 1,
 *     previousCursor: null,
 *     nextCursor: null,
 *     locatedSequence: null,
 * };
 * ```
 */
export interface BrowserTrajectoryPage {
    /** Goal 标识。 */
    readonly goalId: string;
    /** 关联的 Run 投影。 */
    readonly run: BrowserTrajectoryRun;
    /** 当前页事件条目。 */
    readonly entries: readonly BrowserTrajectoryEntry[];
    /** 匹配过滤条件的事件总数。 */
    readonly total: number;
    /** 已提交事件总数。 */
    readonly committedCount: number;
    /** 前一页游标。 */
    readonly previousCursor: number | null;
    /** 后一页游标。 */
    readonly nextCursor: number | null;
    /** 定位目标序列号。 */
    readonly locatedSequence: number | null;
}

/**
 * 校验反馈中的具体问题条目。
 *
 * @example
 * ```ts
 * const issue: BrowserTrajectoryIssueWire = {
 *     path: ["response", "plan"],
 *     message: "字段缺失",
 * };
 * ```
 */
export interface BrowserTrajectoryIssueWire {
    /** 字段路径。 */
    readonly path: readonly (string | number)[];
    /** 错误说明。 */
    readonly message: string;
}

/**
 * 模型输出校验修复反馈。
 *
 * @example
 * ```ts
 * const feedback: BrowserTrajectoryFeedbackWire = {
 *     code: "schema_validation_failed",
 *     origin: "contract_ast",
 *     issues: [],
 * };
 * ```
 */
export interface BrowserTrajectoryFeedbackWire {
    /** 稳定错误码。 */
    readonly code: string;
    /** 校验器来源。 */
    readonly origin: string;
    /** 问题条目列表。 */
    readonly issues: readonly BrowserTrajectoryIssueWire[];
    /** 修复指导约束。 */
    readonly constraints?: readonly string[];
}

/** 模型输出校验修复负载。 */
export interface BrowserModelRepairFeedbackRecordedPayload {
    readonly type: "model_repair_feedback_recorded";
    readonly stage: string;
    readonly attempt: number;
    readonly feedback: BrowserTrajectoryFeedbackWire;
    readonly [key: string]: unknown;
}

/** 执行错误停止负载。 */
export interface BrowserExecutionErrorPayload {
    readonly type: "execution_error";
    readonly code: string;
    readonly message: string;
    readonly [key: string]: unknown;
}

/** 模型重试开始负载。 */
export interface BrowserModelRepairAttemptStartedPayload {
    readonly type: "model_repair_attempt_started";
    readonly stage?: string;
    readonly attempt: number;
    readonly [key: string]: unknown;
}

/**
 * 轨迹事件 payload 的 wire 类型定义。
 */
export type BrowserTrajectoryEventPayloadWire =
    | BrowserModelRepairAttemptStartedPayload
    | BrowserModelRepairFeedbackRecordedPayload
    | BrowserExecutionErrorPayload
    | {
        readonly type: string;
        readonly [key: string]: unknown;
    }
    | object;

/**
 * 轨迹事件的 wire 传输信封。
 *
 * @example
 * ```ts
 * const wire: BrowserTrajectoryEventWire = {
 *     eventId: "evt-1",
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     sequence: 1,
 *     occurredAt: "2026-10-18T00:00:00.000Z",
 *     phase: "executing",
 *     eventType: "run_started",
 *     payload: { type: "run_started" },
 * };
 * ```
 */
export interface BrowserTrajectoryEventWire {
    /** 事件唯一标识。 */
    readonly eventId: string;
    /** 所属 Goal 标识。 */
    readonly goalId: string;
    /** 所属 Run 标识。 */
    readonly runId: string;
    /** 序列号。 */
    readonly sequence: number;
    /** 发生时间。 */
    readonly occurredAt: string;
    /** 工作流阶段。 */
    readonly phase: string;
    /** 事件类型。 */
    readonly eventType: string;
    /** 执行单元标识。 */
    readonly executionUnitId?: string | undefined;
    /** Step 序号。 */
    readonly stepIndex?: number | undefined;
    /** 关联 Action 标识。 */
    readonly actionId?: string | undefined;
    /** 内部程序标识。 */
    readonly programId?: string | undefined;
    /** 调用索引。 */
    readonly callIndex?: number | undefined;
    /** 父 Action 标识。 */
    readonly parentActionId?: string | undefined;
    /** 事件 JSON 负载。 */
    readonly payload: BrowserTrajectoryEventPayloadWire;
    /** 事件契约版本。 */
    readonly eventSchemaVersion?: number | undefined;
}

/**
 * 观察结果 wire 表达。
 */
export type BrowserTrajectoryObservationWire =
    | {
        readonly kind: "success";
        readonly output: unknown;
        readonly summary: string;
    }
    | {
        readonly kind: "failure";
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
        readonly details?: unknown;
    }
    | {
        readonly kind: "rejected";
        readonly reason: string;
    }
    | {
        readonly kind?: string;
        readonly output?: unknown;
        readonly summary?: string;
        readonly code?: string;
        readonly message?: string;
        readonly [key: string]: unknown;
    };

/**
 * 完整轨迹事件与关联上下文详情。
 *
 * @example
 * ```ts
 * const detail: BrowserTrajectoryDetail = {
 *     event: {
 *         eventId: "evt-1",
 *         goalId: "goal-1",
 *         runId: "run-1",
 *         sequence: 1,
 *         occurredAt: "2026-10-18T00:00:00.000Z",
 *         phase: "executing",
 *         eventType: "run_started",
 *         payload: { type: "run_started" },
 *     },
 *     toolDurationMs: null,
 *     observationConfirmed: true,
 * };
 * ```
 */
export interface BrowserTrajectoryDetail {
    /** 核心事件信封。 */
    readonly event: BrowserTrajectoryEventWire;
    /** Action 输入数据。 */
    readonly input?: unknown;
    /** 工具观察结果。 */
    readonly result?: BrowserTrajectoryObservationWire;
    /** 工具结束事件。 */
    readonly toolFinished?: {
        readonly eventType: string;
        readonly payload: {
            readonly observation?: unknown;
            readonly [key: string]: unknown;
        } | object;
        readonly [key: string]: unknown;
    } | object | undefined;
    /** 工具开始时间。 */
    readonly toolStartedAt?: string | undefined;
    /** 工具结束时间。 */
    readonly toolFinishedAt?: string | undefined;
    /** 工具执行耗时（毫秒）。 */
    readonly toolDurationMs: number | null;
    /** 观察结果是否已被持久化确认。 */
    readonly observationConfirmed: boolean;
}
