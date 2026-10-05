import type { BrowserModelInputSummary, BrowserTrajectoryEntry } from "../../../packages/browser/src/index";

/**
 * 当前事件页中可证明的请求结果；Prepared 不意味着供应商已收到请求。
 * @example
 * ```ts
 * const result = requestResult(call, calls, entries);
 * ```
 */
export type RequestResult = { status: "prepared" | "accepted" | "rejected"; label: string; entry?: BrowserTrajectoryEntry };

/**
 * 优先用 callId 关联成功帧；拒绝反馈仅在同执行单元、同阶段的严格时间窗口内关联。
 * @remarks 缺页、过滤或相同准备时间导致归属不明确时保留 Prepared，不补造结果。
 */
export function requestResult(call: BrowserModelInputSummary, calls: readonly BrowserModelInputSummary[], entries: readonly BrowserTrajectoryEntry[], allowRejection = true): RequestResult {
  const accepted = entries.find(entry => entry.eventType === "model_context_frame" && entry.modelCallId === call.callId);
  if (accepted) return { status: "accepted", label: "Output accepted", entry: accepted };
  if (!allowRejection || !call.executionUnitId) return { status: "prepared", label: "Input prepared" };
  const peers = calls.filter(other => other.executionUnitId === call.executionUnitId && other.stage === call.stage);
  const start = Date.parse(call.occurredAt);
  if (!Number.isFinite(start) || peers.some(other => other.callId !== call.callId && Date.parse(other.occurredAt) === start)) return { status: "prepared", label: "Input prepared" };
  const nextAttemptTimes = entries.filter(entry => entry.eventType === "model_repair_attempt_started" && entry.executionUnitId === call.executionUnitId && entry.modelStage === call.stage && Date.parse(entry.occurredAt) > start).map(entry => Date.parse(entry.occurredAt));
  const end = Math.min(...peers.filter(other => Date.parse(other.occurredAt) > start).map(other => Date.parse(other.occurredAt)), ...nextAttemptTimes);
  const feedback = entries.filter(entry => entry.eventType === "model_repair_feedback_recorded" && entry.executionUnitId === call.executionUnitId && entry.modelStage === call.stage && Date.parse(entry.occurredAt) > start && Date.parse(entry.occurredAt) < end);
  if (feedback.length !== 1) return { status: "prepared", label: "Input prepared" };
  return { status: "rejected", label: "Output rejected", entry: feedback[0] };
}
