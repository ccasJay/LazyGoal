/**
 * 严格 `permission.requested` Trigger 在 Supervisor 权限处理器中的内部视图。
 *
 * @remarks
 * 由已验证的 Trigger 结构投影；`requestId` 等同 Trigger 顶层 `id`。此 DTO 不作为 Trigger payload、wire 消息或持久化格式。
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
    /** 内部投影类型标签，不出现在 Trigger payload 中。 */
    readonly type: "action_approval_request";
    /** 原请求 Trigger 的稳定身份。 */
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
 * 严格 `permission.decided` Trigger 与已存请求组合出的内部路由视图。
 *
 * @remarks
 * Run、Action、交互修订和 Worker 身份从 `replyTo` 指向的原请求投影，不重复出现在决定 Trigger 中。
 * `requestId` 同时是原请求 Trigger ID；`approve` 只能使用 `action` 单次范围，`reject` 必须有非空理由。
 * 此 DTO 不作为 Trigger payload、wire 消息或持久化格式。
 *
 * @example
 * ```ts
 * const reply: TriggerActionPermissionReply = {
 *   type: "action_approval_reply", requestId: "request-1",
 *   runId: "run-1", actionId: "action-1", interactionId: "action_approval:action-1",
 *   commitRevision: 3, workerId: "worker-1", generation: "generation-1",
 *   decision: "approve", scope: "action",
 * };
 * ```
 */
export interface TriggerActionPermissionReply {
    /** 内部投影类型标签，不出现在 Trigger payload 中。 */
    readonly type: "action_approval_reply";

    /** 原请求 Trigger 的稳定身份，也是持久化查询键。 */
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
