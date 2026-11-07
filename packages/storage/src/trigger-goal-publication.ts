import { SupervisorOwnership } from "./supervisor-ownership";
import { JsonFileGoalStore } from "./goal-store";
import { TriggerDeliveryStore, type TriggerDeliveryResult } from "./trigger-delivery-store";

/**
 * 恢复或发布已冻结 Goal，再结算收据并入队。
 *
 * @remarks
 * 调用方须持有当前 Supervisor 的有效所有权。Goal 发布使用可核对的文件身份；
 * 收据与队列在同一事务提交。中断后重试会重用冻结的 Goal 并核对发布结果。
 * 已被其他文件占用的 Goal ID 被拒绝，旧文件不会被读取或覆盖。此函数不派发 Goal。
 *
 * @param owner - 当前存储目录的有效 Supervisor 所有权。
 * @param deliveries - 保存投递、创建意图和待派发队列的存储。
 * @param goals - 同一工作区的 Goal 快照存储。
 * @param deliveryId - 已冻结完整创建意图的投递身份。
 * @returns 已结算的接受或身份冲突结果。
 * @throws 未冻结、文件错误或收据事务失败时抛出，可查询投递后重试。
 * @example
 * ```ts
 * const receipt = await publishTriggerGoal(owner, deliveries, goals, "delivery-1");
 * ```
 */
export async function publishTriggerGoal(
    owner: SupervisorOwnership,
    deliveries: TriggerDeliveryStore,
    goals: JsonFileGoalStore,
    deliveryId: string,
): Promise<TriggerDeliveryResult> {
    return owner.run(() => publishOwnedGoal(deliveries, goals, deliveryId));
}

async function publishOwnedGoal(deliveries: TriggerDeliveryStore, goals: JsonFileGoalStore, deliveryId: string): Promise<TriggerDeliveryResult> {
    const receipt = deliveries.read(deliveryId);
    if (receipt === undefined || receipt.delivery.trigger.purpose !== "work") throw new Error("Pending work delivery does not exist");
    if (receipt.status === "settled") {
        await goals.releaseCreationIntent(deliveryId);
        return receipt;
    }
    const goal = deliveries.frozenGoal(deliveryId);
    if (goal === undefined) throw new Error("Goal creation intent is not frozen");
    const created = await goals.createForDelivery(deliveryId, goal);
    const result = created
        ? deliveries.acceptGoal(deliveryId)
        : deliveries.rejectOccupiedGoal(deliveryId);
    await goals.releaseCreationIntent(deliveryId);
    return result;
}
