/**
 * Worker 发起的 Action 审批 Trigger 载荷。
 *
 * @remarks
 * 请求在 Worker 已提交 `action_approval` 等待后由 Supervisor 持久化，并关联一个 Goal、
 * Run、Action、交互身份、提交修订和进程代次。该载荷不含审批决定或授权凭据。
 *
 * @example
 * ```ts
 * const request: TriggerActionPermissionRequest = {
 *   type: "action_approval_request", requestId: "request-1", runId: "run-1",
 *   actionId: "action-1", interactionId: "action_approval:action-1", commitRevision: 3,
 * };
 * ```
 */
export interface TriggerActionPermissionRequest {
    /** 供持久化 Codec 选择当前请求协议。 */
    readonly type: "action_approval_request";
    /** 同时作为 Worker 请求 Trigger 的稳定身份。 */
    readonly requestId: string;
    /** 请求所属的当前 Run。 */
    readonly runId: string;
    /** 唯一待审批 Action。 */
    readonly actionId: string;
    /** Runtime 当前 Action 审批等待的交互身份。 */
    readonly interactionId: string;
    /** 创建请求时已提交 Goal Snapshot 的修订。 */
    readonly commitRevision: number;
}

/**
 * Supervisor 或获准用户对当前 Action 审批 Trigger 的回复载荷。
 *
 * @remarks
 * 回复必须复述原请求及当前 Worker generation。`approve` 只能使用 `action` 单次范围，
 * 不创建 Goal/workspace Grant；`reject` 必须携带非空理由。接收方仍需认证来源、核对
 * 持久请求和最新 Goal 等待，并在 Worker Runtime 应用后结算对应投递。
 *
 * @example
 * ```ts
 * const reply: TriggerActionPermissionReply = {
 *   type: "action_approval_reply", requestDeliveryId: "delivery-1", requestId: "request-1",
 *   runId: "run-1", actionId: "action-1", interactionId: "action_approval:action-1",
 *   commitRevision: 3, workerId: "worker-1", generation: "generation-1",
 *   decision: "approve", scope: "action",
 * };
 * ```
 */
export interface TriggerActionPermissionReply {
    /** 供持久化 Codec 选择当前回复协议。 */
    readonly type: "action_approval_reply";
    /** 已持久化的 Worker 请求投递身份。 */
    readonly requestDeliveryId: string;
    /** 原 Worker 请求与 Trigger 身份。 */
    readonly requestId: string;
    /** 原请求所属 Run。 */
    readonly runId: string;
    /** 原请求中的待审批 Action。 */
    readonly actionId: string;
    /** 原请求中的 Runtime 交互身份。 */
    readonly interactionId: string;
    /** 原请求基于的 Goal Snapshot 修订。 */
    readonly commitRevision: number;
    /** 执行请求的逻辑 Worker。 */
    readonly workerId: string;
    /** 当前 Worker OS 进程代次。 */
    readonly generation: string;
    /** 对当前 Action 作出批准或拒绝。 */
    readonly decision: "approve" | "reject";
    /** 批准只允许对该 Action 生效一次。 */
    readonly scope?: "action";
    /** 拒绝该 Action 的非空理由。 */
    readonly reason?: string;
}
