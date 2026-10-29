import type { BrowserTrajectoryDetail } from "../trajectory";
import { isRecord } from "./record";

/**
 * Trajectory 详情的事件身份、阶段与工具结束形状不变量。
 *
 * @remarks
 * 要求事件契约版本为 1、阶段为 `executing`、`eventType` 与 `payload.type` 一致，
 * `result` 为对象，且 `toolFinished` 必须来自 `tool_finished` 并携带对象
 * `observation`。结构字段已由合同校验。
 *
 * @param detail - 已通过结构解析的 Trajectory 详情。
 * @returns 所有身份与形状关系均成立时为 `true`。
 *
 * @example
 * ```ts
 * if (isTrajectoryDetail(detail)) console.log(detail.event.eventId);
 * ```
 */
export function isTrajectoryDetail(detail: BrowserTrajectoryDetail): boolean {
    const { event } = detail;
    if (event.eventSchemaVersion !== 1) return false;
    if (event.phase !== "executing") return false;
    if (event.eventType !== event.payload.type) return false;
    if (detail.result !== undefined && !isRecord(detail.result)) return false;
    if (detail.toolFinished !== undefined) {
        if (detail.toolFinished.eventType !== "tool_finished") return false;
        if (!isRecord(detail.toolFinished.payload.observation)) return false;
    }
    return true;
}
