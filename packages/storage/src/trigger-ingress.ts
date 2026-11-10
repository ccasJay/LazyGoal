import type { Trigger } from "../../runtime/src/trigger";
import { readTrigger } from "./trigger-wire";
import { TriggerStore } from "./trigger-store";

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
 * 严格校验 Trigger 结构、来源身份与 Goal 访问权，但不持久化事件。
 *
 * @remarks
 * 用于需要在持久接收前完成额外当前状态核对的 Supervisor 路由。网络身份认证仍由宿主负责；返回值只确认此 Trigger 可由该 principal 提交。
 * @param input - 不可信的进程或适配器值。
 * @param principal - 已认证连接对应的可信身份和授权。
 * @returns 通过生成绑定与来源授权检查的不可变 Trigger。
 * @throws 结构、身份、目标授权或 Goal 创建授权不符时抛出。
 * @example
 * ```ts
 * const trigger = validateAuthorizedTrigger(input, principal);
 * ```
 */
export function validateAuthorizedTrigger(input: unknown, principal: TriggerIngressPrincipal): Trigger {
    const trigger = readTrigger(input);
    if (trigger === undefined) throw new Error("Invalid Trigger");
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
    return trigger;
}

/**
 * 验证可信连接 Actor 与 Trigger 目标授权后，持久化一条新 Trigger。
 *
 * @remarks 已存在的 Trigger ID 一律冲突，不会返回既有事件或处理结果。
 * @param store - 当前 Supervisor 使用的 Trigger 存储。
 * @param input - 不可信的进程或适配器值。
 * @param principal - 已认证连接对应的可信身份和授权。
 * @returns 新持久化的不可变 Trigger。
 * @throws 结构、身份、目标授权不符、Trigger ID 已存在或存储失败时抛出。
 * @example
 * ```ts
 * const trigger = receiveAuthorizedTrigger(store, input, principal);
 * ```
 */
export function receiveAuthorizedTrigger(
    store: TriggerStore,
    input: unknown,
    principal: TriggerIngressPrincipal,
): Trigger {
    return store.receive(validateAuthorizedTrigger(input, principal));
}
