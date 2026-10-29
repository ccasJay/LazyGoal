/**
 * Web SSE 实时流事件数据传输对象 (DTO)。
 */

import type { InferContract } from "../../contracts/src/index";
import {
    browserGoalActivityEventContract,
    browserGoalLiveEventContract,
} from "./contracts/events";

/**
 * 实时执行活动事件。
 *
 * @example
 * ```ts
 * const act: BrowserGoalActivityEvent = {
 *     kind: "assistant_text_delta",
 *     text: "分析中...",
 *     truncated: false,
 *     sourceEventId: "stream-event-1",
 *     sourceCursor: 1,
 * };
 * ```
 */
export type BrowserGoalActivityEvent =
    InferContract<typeof browserGoalActivityEventContract>;

/**
 * 浏览器端消费的 Goal 范围实时推送事件。
 *
 * @remarks
 * 连接覆盖整个 Goal，不绑定单一当前 Run：`state_sync` 是订阅首项的一致安全状态，
 * `input_result` 按 `inputId` 报告受理或拒绝，`activity` 携带真实来源 Run 的公开
 * 执行活动；`snapshot_changed` 与 `refresh_required` 只要求客户端按最新 Snapshot
 * 重新同步，不代表业务终态。
 *
 * @example
 * ```ts
 * const event: BrowserGoalLiveEvent = {
 *     type: "activity",
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     activity: { kind: "step_started" },
 * };
 * ```
 */
export type BrowserGoalLiveEvent =
    InferContract<typeof browserGoalLiveEventContract>;
