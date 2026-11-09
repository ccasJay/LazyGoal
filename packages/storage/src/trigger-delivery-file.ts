import { isRecord } from "../../contracts/src/index";
import type { Trigger } from "../../runtime/src/trigger";
import { triggerBinding } from "./generated/trigger-binding";

/**
 * Supervisor 投递账本内部用于关联当前 Trigger 与收据的记录。
 *
 * @remarks
 * 此类型仅保留现有投递账本的内部身份；事件目标与 Goal 关联由嵌套的 `Trigger` 表达。
 *
 * @example
 * ```ts
 * const record: TriggerDeliveryFile = {
 *   deliveryId: "trigger-1",
 *   trigger: {
 *     id: "trigger-1", name: "Submit work", type: "work",
 *     source: { role: "external", externalId: "session-1" }, target: "supervisor",
 *     payload: { action: "submitted", material: { kind: "text", text: "Inspect the failing test" } },
 *     sentAt: new Date().toISOString(),
 *   },
 * };
 * ```
 */
export interface TriggerDeliveryFile {
    readonly deliveryId: string;
    readonly trigger: Trigger;
}

/**
 * 本地进程提交 Trigger 使用的认证信封。
 *
 * @remarks
 * 密钥只用于传输认证，不属于 Trigger 事实或持久化收据，不得写入诊断和结果。
 * 信封只传递完整 Trigger；结构验证不证明密钥有效，接收方仍须认证连接身份。
 *
 * @example
 * ```ts
 * const request: TriggerWireRequest = { secret: "connection-secret", trigger };
 * ```
 */
export interface TriggerWireRequest {
    readonly secret: string;
    readonly trigger: Trigger;
}

/**
 * 单次 Trigger 投递已结算的结果。
 *
 * @remarks
 * `accepted` 表示新 Goal 已持久化并进入队列；`rejected` 表示新 Goal 身份已被其他快照占用；
 * `ignored` 表示准入决定不创建工作；`handled` 用于已处理的控制事件。待重试的失败不使用结算结果。
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

/**
 * 严格解析仍使用内部投递账本包装的 Trigger，并以生成绑定校验嵌套消息。
 *
 * @param input - 不可信的持久化记录或 Worker IPC 值。
 * @returns 包装字段及 Trigger 均有效时返回规范化值；额外字段、缺字段或 Trigger 分支无效时返回 `undefined`。
 * @example
 * ```ts
 * const delivery = readTriggerDeliveryFile(value);
 * if (delivery !== undefined) await handle(delivery.trigger);
 * ```
 */
export function readTriggerDeliveryFile(input: unknown): TriggerDeliveryFile | undefined {
    if (!isRecord(input) || !hasExactKeys(input, ["deliveryId", "trigger"]) || typeof input.deliveryId !== "string") return undefined;
    const parsed = triggerBinding.read(input.trigger, "reject");
    return parsed.ok ? { deliveryId: input.deliveryId, trigger: parsed.data } : undefined;
}

/**
 * 严格解析本地进程认证信封，并使用生成绑定校验其中的 Trigger。
 *
 * @param input - 从本地进程连接接收的不可信 JSON 值。
 * @returns 信封与 Trigger 均有效时返回请求；缺失或额外字段及无效 Trigger 返回 `undefined`。
 * @example
 * ```ts
 * const request = readTriggerWireRequest(value);
 * if (request !== undefined) receive(request.trigger);
 * ```
 */
export function readTriggerWireRequest(input: unknown): TriggerWireRequest | undefined {
    if (!isRecord(input) || !hasExactKeys(input, ["secret", "trigger"]) || typeof input.secret !== "string") return undefined;
    const parsed = triggerBinding.read(input.trigger, "reject");
    return parsed.ok ? { secret: input.secret, trigger: parsed.data } : undefined;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const keys = Object.keys(value);
    return keys.length === expected.length && keys.every((key) => expected.includes(key));
}
