import type { Trigger } from "../../runtime/src/trigger";
import type { TriggerActionPermissionReply, TriggerActionPermissionRequest } from "./trigger-permission";

/**
 * 从严格的 `permission.requested` Trigger 投影现有权限处理器使用的内部请求视图。
 *
 * @param trigger - 已由 Trigger 生成绑定校验的权限请求。
 * @returns 以 Trigger `id` 作为请求身份的内部权限请求。
 * @throws Trigger 类型、来源或必填身份不符合 Action 权限请求时抛出。
 * @example
 * ```ts
 * const request = decodeTriggerActionPermissionRequest(trigger);
 * ```
 */
export function decodeTriggerActionPermissionRequest(trigger: Trigger): TriggerActionPermissionRequest {
    if (trigger.type !== "permission" || trigger.payload.action !== "requested" || trigger.source.role !== "worker"
        || !("goalId" in trigger) || !trigger.id.trim() || !trigger.payload.runId.trim() || !trigger.payload.actionId.trim()
        || !trigger.payload.interactionId.trim() || !Number.isSafeInteger(trigger.payload.commitRevision) || trigger.payload.commitRevision < 0) {
        throw new Error("Invalid Action permission request Trigger");
    }
    return {
        type: "action_approval_request",
        requestId: trigger.id,
        runId: trigger.payload.runId,
        actionId: trigger.payload.actionId,
        interactionId: trigger.payload.interactionId,
        commitRevision: trigger.payload.commitRevision,
    };
}

/**
 * 从严格的 `permission.decided` Trigger 与其已持久化请求生成内部路由视图。
 *
 * @param trigger - 已由 Trigger 生成绑定校验的决定事件。
 * @param request - `replyTo` 指向的原 Worker 权限请求。
 * @param requestDeliveryId - 内部账本中保存原请求的投递标识。
 * @returns 保留既有 Worker 路由所需字段的内部回复视图；回复本身不重复携带这些字段。
 * @throws 回复、请求、Goal 或关联身份不一致时抛出。
 * @example
 * ```ts
 * const reply = decodeTriggerActionPermissionReply(replyTrigger, requestTrigger, requestDeliveryId);
 * ```
 */
export function decodeTriggerActionPermissionReply(
    trigger: Trigger,
    request: Trigger,
    requestDeliveryId: string,
): TriggerActionPermissionReply {
    const requestPayload = decodeTriggerActionPermissionRequest(request);
    if (trigger.type !== "permission" || trigger.payload.action !== "decided" || trigger.source.role !== "external" && trigger.source.role !== "supervisor"
        || !("goalId" in trigger) || !("replyTo" in trigger) || !("goalId" in request) || trigger.goalId !== request.goalId
        || trigger.replyTo !== request.id || !requestDeliveryId.trim() || !trigger.id.trim()) {
        throw new Error("Invalid Action permission reply Trigger");
    }
    if (request.source.role !== "worker") throw new Error("Action permission request does not identify a Worker");
    if (trigger.payload.decision === "approve" && trigger.payload.scope !== "action") {
        throw new Error("Action permission approval scope is invalid");
    }
    if (trigger.payload.decision === "reject" && !trigger.payload.reason.trim()) {
        throw new Error("Action permission rejection reason is invalid");
    }
    return {
        type: "action_approval_reply",
        requestDeliveryId,
        requestId: requestPayload.requestId,
        runId: requestPayload.runId,
        actionId: requestPayload.actionId,
        interactionId: requestPayload.interactionId,
        commitRevision: requestPayload.commitRevision,
        workerId: request.source.workerId,
        generation: request.source.generation,
        decision: trigger.payload.decision,
        ...(trigger.payload.decision === "approve" ? { scope: "action" } : { reason: trigger.payload.reason }),
    };
}
