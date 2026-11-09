import type { Goal } from "../../runtime/src/domain";
import { readTriggerDeliveryFile } from "./trigger-delivery-file";
import { JsonFileGoalStore } from "./goal-store";
import { SupervisorOwnership } from "./supervisor-ownership";
import { receiveAuthorizedTrigger, type TriggerIngressPrincipal } from "./trigger-delivery-ingress";
import { TriggerDeliveryStore, type TriggerDeliveryResult } from "./trigger-delivery-store";
import { publishTriggerGoal } from "./trigger-goal-publication";

/**
 * 保存已获准创建的工作投递与冻结 Goal，并以可恢复方式发布。
 *
 * @remarks
 * 此入口不执行准入判断；调用者必须先决定接受并构造完整 Goal，且需从可信传输
 * 层提供已认证身份。创建工厂须沿用已预留 Goal ID；已冻结意图恢复时不会调用工厂。相同投递重试返回已有结果；控制事件和针对既有 Goal 的工作
 * 不能进入此创建入口。所有写入发生于 Supervisor 所有权内。
 *
 * @param owner - 工作区的有效 Supervisor 所有权。
 * @param deliveries - 同一工作区的投递存储。
 * @param goals - 同一工作区的 Goal 快照存储。
 * @param input - 不可信的 Trigger 投递。
 * @param principal - 可信传输层提供的身份及授权。
 * @param createGoal - 构造已接受的 Goal；存在预留身份时必须使用该身份。
 * @returns 此投递的结算收据。
 * @throws 认证、状态或存储错误时抛出；待处理投递可以重试。
 * @example
 * ```ts
 * const receipt = await publishAuthorizedWork(owner, deliveries, goals, input, principal, createGoal);
 * ```
 */
export async function publishAuthorizedWork(
    owner: SupervisorOwnership,
    deliveries: TriggerDeliveryStore,
    goals: JsonFileGoalStore,
    input: unknown,
    principal: TriggerIngressPrincipal,
    createGoal: (reservedGoalId: string | undefined) => Promise<Goal>,
): Promise<TriggerDeliveryResult> {
    const delivery = readTriggerDeliveryFile(input);
    if (delivery === undefined) throw new Error("Invalid trigger delivery");
    return owner.runExclusive(JSON.stringify(["publication", delivery.deliveryId]), async () => {
        const receipt = receiveAuthorizedTrigger(deliveries, delivery, principal);
        if (receipt.delivery.trigger.type !== "work" || receipt.delivery.trigger.target !== "supervisor") {
            throw new Error("Goal creation requires a Supervisor-targeted work Trigger");
        }
        if (receipt.status === "settled") return receipt;
        const deliveryId = receipt.delivery.deliveryId;
        if (deliveries.frozenGoal(deliveryId) === undefined) {
            const goal = await createGoal(deliveries.reservedGoal(deliveryId));
            deliveries.reserveGoal(deliveryId, goal.id);
            deliveries.freezeGoal(deliveryId, goal);
        }
        return publishTriggerGoal(owner, deliveries, goals, receipt.delivery.deliveryId);
    });
}
