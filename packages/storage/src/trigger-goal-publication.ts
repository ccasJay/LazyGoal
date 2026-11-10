import { SupervisorOwnership } from "./supervisor-ownership";
import { JsonFileGoalStore } from "./goal-store";
import { TriggerStore } from "./trigger-store";

/**
 * 单次 work Trigger 的 Goal 发布结果。
 *
 * @remarks 此结果仅返回给当前调用方，不持久化；Goal 队列与 Trigger 路由状态由 `TriggerStore` 分别保存。
 *
 * @example
 * ```ts
 * const result: TriggerWorkPublicationResult = { kind: "accepted", goalId: "goal-1" };
 * ```
 */
export type TriggerWorkPublicationResult =
    | { readonly kind: "accepted"; readonly goalId: string }
    | { readonly kind: "rejected"; readonly reason: "goal-id-conflict"; readonly goalId: string };

/**
 * 恢复或发布已冻结 Goal，再将 Goal 入队并完成 Trigger 路由。
 *
 * @remarks
 * 调用方须持有当前 Supervisor 的有效所有权。Goal 发布使用可核对的文件身份；同一事务提交 FIFO 队列与 Trigger 路由状态。发布后清理创建意图；中断时可从冻结意图恢复。已被其他文件占用的 Goal ID 不会覆盖现有文件，并会完成该 Trigger 的拒绝路由。此函数不派发 Goal。
 *
 * @param owner - 当前存储目录的有效 Supervisor 所有权。
 * @param triggers - 保存 Trigger、创建意图和待派发队列的存储。
 * @param goals - 同一工作区的 Goal 快照存储。
 * @param triggerId - 已冻结完整创建意图的 work Trigger ID。
 * @returns 当前调用成功发布的 Goal 或已占用的 Goal 身份。
 * @throws Trigger 未路由、未冻结、文件错误或存储事务失败时抛出。
 * @example
 * ```ts
 * const result = await publishTriggerGoal(owner, triggers, goals, "trigger-1");
 * ```
 */
export async function publishTriggerGoal(
    owner: SupervisorOwnership,
    triggers: TriggerStore,
    goals: JsonFileGoalStore,
    triggerId: string,
): Promise<TriggerWorkPublicationResult> {
    return owner.run(() => publishOwnedGoal(triggers, goals, triggerId));
}

async function publishOwnedGoal(
    triggers: TriggerStore,
    goals: JsonFileGoalStore,
    triggerId: string,
): Promise<TriggerWorkPublicationResult> {
    const trigger = triggers.read(triggerId);
    if (trigger === undefined || trigger.type !== "work" || trigger.target !== "supervisor"
        || triggers.routeStatus(triggerId) !== "unrouted") {
        throw new Error("Unrouted Supervisor work Trigger does not exist");
    }
    const goal = triggers.frozenGoal(triggerId);
    if (goal === undefined) throw new Error("Goal creation intent is not frozen");
    const created = await goals.createForTrigger(triggerId, goal);
    if (!created) {
        await goals.releaseCreationIntent(triggerId);
        triggers.markRouted(triggerId);
        return { kind: "rejected", reason: "goal-id-conflict", goalId: goal.id };
    }
    triggers.acceptGoal(triggerId);
    await goals.releaseCreationIntent(triggerId);
    return { kind: "accepted", goalId: goal.id };
}
