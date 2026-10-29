import type { InferContract } from "../../contracts/src/index";
import {
    browserModelInputDetailContract,
    browserModelInputMessageWireContract,
    browserModelInputRecordWireContract,
    browserModelInputSummaryContract,
} from "./contracts/model-input";

/**
 * 模型输入审查与对比数据传输对象 (DTO)。
 */

/**
 * 模型输入消息的独立 wire 传输结构。
 *
 * @example
 * ```ts
 * const msg: BrowserModelInputMessageWire = {
 *     role: "user",
 *     content: "Hello",
 *     source: "conversation",
 * };
 * ```
 */
export type BrowserModelInputMessageWire =
    InferContract<typeof browserModelInputMessageWireContract>;

/**
 * 完整模型输入调用的 wire 记录。
 *
 * @example
 * ```ts
 * const record: BrowserModelInputRecordWire = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     callId: "call-1",
 *     stepIndex: 1,
 *     stage: "decide",
 *     occurredAt: "2026-10-18T00:00:00.000Z",
 *     messages: [],
 * };
 * ```
 */
export type BrowserModelInputRecordWire =
    InferContract<typeof browserModelInputRecordWireContract>;

/**
 * 模型输入摘要传输对象（用于调用列表展示）。
 *
 * @example
 * ```ts
 * const summary: BrowserModelInputSummary = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     callId: "call-1",
 *     stepIndex: 1,
 *     stage: "decide",
 *     occurredAt: "2026-10-18T00:00:00.000Z",
 *     systemVersion: "hash-1",
 *     systemChanged: true,
 *     firstSystem: true,
 *     previousCallId: null,
 *     messages: [],
 *     omittedMessageCount: 0,
 * };
 * ```
 */
export type BrowserModelInputSummary =
    InferContract<typeof browserModelInputSummaryContract>;

/**
 * 完整模型输入调用详情（用于只读比对）。
 *
 * @example
 * ```ts
 * const detail: BrowserModelInputDetail = {
 *     call: {
 *         goalId: "goal-1",
 *         runId: "run-1",
 *         callId: "call-1",
 *         stepIndex: 1,
 *         stage: "decide",
 *         occurredAt: "2026-10-18T00:00:00.000Z",
 *         messages: [],
 *     },
 *     previousSystem: null,
 *     previousCallId: null,
 *     systemVersion: "hash-1",
 * };
 * ```
 */
export type BrowserModelInputDetail =
    InferContract<typeof browserModelInputDetailContract>;
