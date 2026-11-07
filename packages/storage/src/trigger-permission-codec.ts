import { triggerActionPermissionReplyBinding } from "./generated/trigger-action-permission-reply-binding";
import { triggerActionPermissionRequestBinding } from "./generated/trigger-action-permission-request-binding";
import type { TriggerActionPermissionReply, TriggerActionPermissionRequest } from "./trigger-permission";

/**
 * 解码并校验持久化 Action 权限请求。
 *
 * @param payload - Trigger 中 JSON 编码的请求载荷。
 * @returns 已通过结构与必填身份校验的请求。
 * @throws JSON、结构或空身份无效时抛出。
 * @example
 * ```ts
 * const request = decodeTriggerActionPermissionRequest(payload);
 * ```
 */
export function decodeTriggerActionPermissionRequest(payload: string): TriggerActionPermissionRequest {
    const parsed = triggerActionPermissionRequestBinding.read(JSON.parse(payload) as unknown, "reject");
    if (!parsed.ok || !parsed.data.requestId.trim() || !parsed.data.runId.trim() || !parsed.data.actionId.trim()
        || !parsed.data.interactionId.trim() || !Number.isSafeInteger(parsed.data.commitRevision) || parsed.data.commitRevision < 0) {
        throw new Error("Invalid Action permission request payload");
    }
    return parsed.data;
}

/**
 * 解码并校验持久化 Action 权限回复。
 *
 * @param payload - Trigger 中 JSON 编码的回复载荷。
 * @returns 已通过结构、互斥字段与身份校验的回复。
 * @throws JSON、结构或业务字段组合无效时抛出。
 * @example
 * ```ts
 * const reply = decodeTriggerActionPermissionReply(payload);
 * ```
 */
export function decodeTriggerActionPermissionReply(payload: string): TriggerActionPermissionReply {
    const parsed = triggerActionPermissionReplyBinding.read(JSON.parse(payload) as unknown, "reject");
    if (!parsed.ok) throw new Error("Invalid Action permission reply payload");
    const reply = parsed.data;
    if (!reply.requestDeliveryId.trim() || !reply.requestId.trim() || !reply.runId.trim() || !reply.actionId.trim()
        || !reply.interactionId.trim() || !Number.isSafeInteger(reply.commitRevision) || reply.commitRevision < 0
        || !reply.workerId.trim() || !reply.generation.trim()
        || (reply.decision === "approve" && (reply.scope !== "action" || reply.reason !== undefined))
        || (reply.decision === "reject" && (reply.scope !== undefined || !reply.reason?.trim()))) {
        throw new Error("Invalid Action permission reply payload");
    }
    return reply;
}
