import { readTriggerDeliveryFile } from "./trigger-delivery-file";
import type { TriggerDeliveryResult } from "./trigger-delivery-store";
import { TriggerDeliveryStore } from "./trigger-delivery-store";

/**
 * 已由宿主认证的 Trigger 来源及可访问目标。
 *
 * @remarks
 * Worker 身份绑定逻辑 ID 与当前进程代次；external 身份绑定认证得到的 `externalId`。本机 Browser 的 host-only `user` 分类也映射到 external Actor，不作为 Trigger.source 值。Supervisor 是当前持有本地 Store 的唯一 Actor。
 * `goalIds` 只授予目标 Goal 的访问权；`mayCreateGoal` 只控制新的 work Trigger 是否可创建 Goal。本类型不定义 `type`/`action` 与来源/目标之间的方向矩阵。
 *
 * @example
 * ```ts
 * const principal: TriggerIngressPrincipal = {
 *   role: "external", externalId: "browser-session-1", mayCreateGoal: true, goalIds: [],
 * };
 * ```
 */
export type TriggerIngressPrincipal =
    | { readonly role: "worker"; readonly workerId: string; readonly generation: string; readonly goalId?: string; readonly mayCreateGoal: boolean }
    | { readonly role: "user" | "external"; readonly externalId: string; readonly mayCreateGoal: boolean; readonly goalIds: readonly string[] }
    | { readonly role: "supervisor"; readonly mayCreateGoal: boolean; readonly goalIds: readonly string[] };

/**
 * 认证传输来源及目标后将投递持久化。
 *
 * @remarks
 * 此入口不提供网络身份认证；宿主必须先认证连接并构造 Actor。接收方核对 Worker ID 与 generation，或 externalId，
 * 并按可访问 Goal 授权目标。只有 `work.submitted` 创建 Goal 受 `mayCreateGoal` 控制；所有 Worker target 消息仍由 Supervisor 接收。
 * 此入口不构造 `type`/`action` 方向矩阵。
 *
 * @param store - 当前 Supervisor 使用的投递存储。
 * @param input - 不可信的进程或适配器载荷。
 * @param principal - 已认证连接对应的可信身份和授权。
 * @returns 该次投递的已保存状态。
 * @throws 结构、身份或目标授权不符，或存储失败时抛出。
 * @example
 * ```ts
 * const result = receiveAuthorizedTrigger(store, input, principal);
 * ```
 */
export function receiveAuthorizedTrigger(
    store: TriggerDeliveryStore,
    input: unknown,
    principal: TriggerIngressPrincipal,
): TriggerDeliveryResult {
    const delivery = readTriggerDeliveryFile(input);
    if (delivery === undefined) throw new Error("Invalid trigger delivery");
    const { trigger } = delivery;
    const goalId = "goalId" in trigger ? trigger.goalId : undefined;
    const expectedRole = principal.role === "user" ? "external" : principal.role;
    if (trigger.source.role !== expectedRole) throw new Error("Trigger source role does not match the authenticated principal");
    if (principal.role === "worker") {
        if (trigger.source.role !== "worker" || trigger.source.workerId !== principal.workerId
            || trigger.source.generation !== principal.generation) {
            throw new Error("Trigger worker identity does not match authenticated process");
        }
        if (goalId !== undefined && goalId !== principal.goalId) throw new Error("Trigger target is not authorized");
    } else if (principal.role === "external" || principal.role === "user") {
        if (trigger.source.role !== "external" || trigger.source.externalId !== principal.externalId) {
            throw new Error("Trigger external identity does not match authenticated connection");
        }
        if (goalId !== undefined && !principal.goalIds.includes(goalId)) throw new Error("Trigger target is not authorized");
    } else if (goalId !== undefined && !principal.goalIds.includes(goalId)) {
        throw new Error("Trigger target is not authorized");
    }

    if (trigger.type === "work" && goalId === undefined && !principal.mayCreateGoal) {
        throw new Error("Trigger cannot create a Goal");
    }
    if (trigger.target === "worker" && goalId === undefined && principal.role !== "supervisor") {
        throw new Error("Trigger target is not authorized");
    }
    return store.receive(delivery);
}
