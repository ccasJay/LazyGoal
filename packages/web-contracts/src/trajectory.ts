import type { InferContract } from "../../contracts/src/index";
import { browserActionReviewIssueContract } from "./contracts/interaction";
import {
    browserExecutionErrorPayloadContract,
    browserModelRepairAttemptStartedPayloadContract,
    browserModelRepairFeedbackRecordedPayloadContract,
    browserTrajectoryDetailContract,
    browserTrajectoryEntryContract,
    browserTrajectoryEventPayloadContract,
    browserTrajectoryEventWireContract,
    browserTrajectoryFeedbackWireContract,
    browserTrajectoryObservationContract,
    browserTrajectoryPageContract,
    browserTrajectoryRunContract,
} from "./contracts/trajectory";

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
export type BrowserTrajectoryRun = InferContract<typeof browserTrajectoryRunContract>;

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
export type BrowserTrajectoryEntry = InferContract<typeof browserTrajectoryEntryContract>;

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
export type BrowserTrajectoryPage = InferContract<typeof browserTrajectoryPageContract>;

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
export type BrowserTrajectoryIssueWire =
    InferContract<typeof browserActionReviewIssueContract>;

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
export type BrowserTrajectoryFeedbackWire =
    InferContract<typeof browserTrajectoryFeedbackWireContract>;

/** 模型输出校验修复负载。 */
export type BrowserModelRepairFeedbackRecordedPayload =
    InferContract<typeof browserModelRepairFeedbackRecordedPayloadContract>;

/** 执行错误停止负载。 */
export type BrowserExecutionErrorPayload =
    InferContract<typeof browserExecutionErrorPayloadContract>;

/** 模型重试开始负载。 */
export type BrowserModelRepairAttemptStartedPayload =
    InferContract<typeof browserModelRepairAttemptStartedPayloadContract>;

/**
 * 轨迹事件 payload 的 wire 类型定义。
 */
export type BrowserTrajectoryEventPayloadWire =
    InferContract<typeof browserTrajectoryEventPayloadContract>;

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
export type BrowserTrajectoryEventWire =
    InferContract<typeof browserTrajectoryEventWireContract>;

/**
 * 观察结果 wire 表达。
 */
export type BrowserTrajectoryObservationWire =
    InferContract<typeof browserTrajectoryObservationContract>;

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
export type BrowserTrajectoryDetail =
    InferContract<typeof browserTrajectoryDetailContract>;
