import { isRecord } from "../../contracts/src/index";
import type { Trigger } from "../../runtime/src/trigger";
import { triggerBinding } from "./generated/trigger-binding";

/**
 * 本地进程提交 Trigger 使用的认证信封。
 *
 * @remarks
 * 密钥只用于传输认证，不属于 Trigger 事实或持久化状态。信封只传递完整 Trigger；
 * 结构验证不证明密钥有效，接收方仍须认证连接身份。
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
 * 严格解析不可变 Trigger，并使用生成绑定校验封闭消息分支。
 *
 * @param input - 不可信的持久化、IPC 或适配器值。
 * @returns 完整 Trigger 有效时返回规范化值；缺失、额外或无效字段返回 `undefined`。
 * @example
 * ```ts
 * const trigger = readTrigger(value);
 * if (trigger !== undefined) await handle(trigger);
 * ```
 */
export function readTrigger(input: unknown): Trigger | undefined {
    const parsed = triggerBinding.read(input, "reject");
    return parsed.ok ? parsed.data : undefined;
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
    const trigger = readTrigger(input.trigger);
    return trigger === undefined ? undefined : { secret: input.secret, trigger };
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const keys = Object.keys(value);
    return keys.length === expected.length && keys.every((key) => expected.includes(key));
}
