/**
 * 可跨进程传递的 Trigger 及单次投递身份。
 *
 * @remarks
 * Trigger 表达不可变事件，`deliveryId` 只标识该次投递。目标 Goal 属于投递，
 * 因此同一 Trigger 可投递给不同 Goal。此结构不证明来源身份或目标授权。
 *
 * @example
 * ```ts
 * const delivery: TriggerDeliveryFile = {
 *     deliveryId: "delivery-1",
 *     trigger: { id: "event-1", purpose: "work", source: "user", payload: "{}" },
 * };
 * ```
 */
export interface TriggerDeliveryFile {
    readonly deliveryId: string;
    readonly trigger: {
        readonly id: string;
        readonly purpose: "work" | "permission" | "interaction" | "cancel" | "progress" | "lifecycle";
        readonly source: "user" | "worker" | "external" | "supervisor";
        readonly workerId?: string;
        readonly generation?: string;
        /** JSON 编码的事件载荷；消费端仍须校验其具体协议。 */
        readonly payload: string;
    };
    readonly goalId?: string;
}

/**
 * 本地进程提交 Trigger 使用的认证信封。
 *
 * @remarks
 * 密钥只用于传输认证，不属于 Trigger 事实或持久化收据，不得写入诊断和结果。
 * 结构验证不证明密钥有效；接收方必须将密钥映射到可信连接身份。
 *
 * @example
 * ```ts
 * const request: TriggerWireRequest = { secret: "connection-secret", delivery };
 * ```
 */
export interface TriggerWireRequest {
    readonly secret: string;
    readonly delivery: TriggerDeliveryFile;
}

/**
 * 单次 Trigger 投递已结算的结果。
 *
 * @remarks
 * `accepted` 表示新 Goal 已持久化并进入队列；`rejected` 表示新 Goal 身份已被
 * 其他快照占用；`ignored` 表示准入决定不创建工作；`handled` 用于已处理的控制事件。
 * 待重试的失败不使用结算结果。
 *
 * @example
 * ```ts
 * const result: TriggerDeliveryOutcome = { kind: "accepted", goalId: "goal-1" };
 * ```
 */
export type TriggerDeliveryOutcome =
    | { readonly kind: "accepted"; readonly goalId: string }
    | { readonly kind: "rejected"; readonly reason: "goal-id-occupied"; readonly goalId: string }
    | { readonly kind: "ignored" }
    | { readonly kind: "handled" };
