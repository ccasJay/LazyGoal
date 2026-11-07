import { triggerDeliveryFileBinding } from "./generated/trigger-delivery-binding";
import type { TriggerDeliveryResult } from "./trigger-delivery-store";
import { TriggerDeliveryStore } from "./trigger-delivery-store";

/**
 * 已由宿主认证的 Trigger 来源及目标权限。
 *
 * @remarks
 * 此值由可信传输层构造，禁止从 Trigger 载荷直接复制。Worker 的进程代次与当前
 * Goal 绑定由 Supervisor 提供；外部来源与用户的 Goal 集合由宿主授权策略确定。
 *
 * @example
 * ```ts
 * const principal: TriggerIngressPrincipal = {
 *   role: "worker", workerId: "worker-1", generation: "process-1", goalId: "goal-1", mayCreateGoal: true,
 * };
 * ```
 */
export type TriggerIngressPrincipal =
    | { readonly role: "worker"; readonly workerId: string; readonly generation: string; readonly goalId?: string; readonly mayCreateGoal: boolean }
    | { readonly role: "user" | "external" | "supervisor"; readonly mayCreateGoal: boolean; readonly goalIds: readonly string[] };

/**
 * 认证传输来源及目标后将投递持久化。
 *
 * @remarks
 * 此入口不提供网络身份认证；宿主必须先独立认证连接并构造 principal。权限校验
 * 在任何写入前发生。控制事件不能触发 Goal 创建；Worker 创建工作须经宿主授权。已认证但载荷冲突的重试仍由存储拒绝。
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
    const parsed = triggerDeliveryFileBinding.read(input, "reject");
    if (!parsed.ok) throw new Error("Invalid trigger delivery");
    const { trigger, goalId } = parsed.data;
    if (trigger.source !== principal.role) throw new Error("Trigger source does not match authenticated principal");
    if (principal.role === "worker") {
        if (trigger.workerId !== principal.workerId || trigger.generation !== principal.generation) {
            throw new Error("Trigger worker identity does not match authenticated process");
        }
        if (goalId !== undefined && goalId !== principal.goalId) throw new Error("Trigger target is not authorized");
        if (goalId === undefined && trigger.purpose === "work" && !principal.mayCreateGoal) throw new Error("Trigger cannot create a Goal");
        if (goalId === undefined && trigger.purpose !== "work" && trigger.purpose !== "lifecycle") throw new Error("Worker trigger requires its assigned Goal");
    } else if (goalId === undefined) {
        if (trigger.purpose !== "work" || !principal.mayCreateGoal) throw new Error("Trigger cannot create a Goal");
    } else if (!principal.goalIds.includes(goalId)) {
        throw new Error("Trigger target is not authorized");
    }
    return store.receive(parsed.data);
}
