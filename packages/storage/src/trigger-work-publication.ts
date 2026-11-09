import type { Goal } from "../../runtime/src/domain";
import type { Trigger } from "../../runtime/src/trigger";
import { readTrigger } from "./trigger-wire";
import { JsonFileGoalStore } from "./goal-store";
import { SupervisorOwnership } from "./supervisor-ownership";
import { receiveAuthorizedTrigger, type TriggerIngressPrincipal } from "./trigger-ingress";
import { TriggerStore } from "./trigger-store";
import { publishTriggerGoal, type TriggerWorkPublicationResult } from "./trigger-goal-publication";

/**
 * 保存已获准创建的 work Trigger 与冻结 Goal，再以可恢复方式发布。
 *
 * @remarks
 * 此入口不执行准入判断；调用者必须先决定接受并构造完整 Goal，且需从可信传输层提供已认证身份。创建工厂须沿用已预留 Goal ID；已冻结意图恢复时不会调用工厂。重复 Trigger ID 一律冲突，不返回旧结果。控制事件和针对既有 Goal 的工作不能进入此创建入口。所有写入发生于 Supervisor 所有权内。
 *
 * @param owner - 工作区的有效 Supervisor 所有权。
 * @param triggers - 同一工作区的 Trigger 与 Goal 派发存储。
 * @param goals - 同一工作区的 Goal 快照存储。
 * @param input - 不可信的 work Trigger。
 * @param principal - 可信传输层提供的身份及授权。
 * @param createGoal - 构造已接受的 Goal；存在预留身份时必须使用该身份。
 * @returns 当前调用成功发布的 Goal 或发生的 Goal 身份冲突；此结果不持久化。
 * @throws 认证、身份冲突、状态或存储错误时抛出；未路由 Trigger 保留以供 Supervisor 恢复。
 * @example
 * ```ts
 * const result = await publishAuthorizedWork(owner, triggers, goals, trigger, principal, createGoal);
 * ```
 */
export async function publishAuthorizedWork(
    owner: SupervisorOwnership,
    triggers: TriggerStore,
    goals: JsonFileGoalStore,
    input: unknown,
    principal: TriggerIngressPrincipal,
    createGoal: (reservedGoalId: string | undefined) => Promise<Goal>,
): Promise<TriggerWorkPublicationResult> {
    const trigger = readTrigger(input);
    if (trigger === undefined) throw new Error("Invalid Trigger");
    return owner.runExclusive(JSON.stringify(["trigger-publication", trigger.id]), async () => {
        const received: Trigger = receiveAuthorizedTrigger(triggers, trigger, principal);
        if (received.type !== "work" || received.target !== "supervisor" || "goalId" in received) {
            throw new Error("Goal creation requires a Supervisor-targeted work Trigger without a Goal");
        }
        let goal = triggers.frozenGoal(received.id);
        if (goal === undefined) {
            const candidate = await createGoal(triggers.reservedGoal(received.id));
            triggers.reserveGoal(received.id, candidate.id);
            triggers.freezeGoal(received.id, candidate);
            goal = triggers.frozenGoal(received.id);
            if (goal === undefined) throw new Error("Frozen Goal creation intent is unavailable");
        }
        return publishTriggerGoal(owner, triggers, goals, received.id);
    });
}
