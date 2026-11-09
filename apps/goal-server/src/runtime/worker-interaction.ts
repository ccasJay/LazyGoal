import type { GoalUserAction } from "../../../../packages/runtime/src/trigger";
import type { TriggerDeliveryFile } from "../../../../packages/storage/src/trigger-delivery-file";

/**
 * Supervisor 从严格的 `interaction.answered` Trigger 投影出的领域决定。
 *
 * @remarks `replyTo` 关联直接请求事件；若 answer 带有 Runtime 请求或 Action ID，`interactionRequestId` 会保留该身份供等待核对。Run 与 Worker 分配来自当前 Goal Snapshot。
 * @example
 * ```ts
 * const answer = decodeWorkerInteractionPayload(delivery);
 * await runtime.commands.resume({ ref: { goalId, runId }, action: answer.answer });
 * ```
 */
export interface WorkerInteractionPayload {
    readonly replyTo: string;
    readonly answer: GoalUserAction;
    readonly interactionRequestId?: string;
}

/**
 * 读取已通过 Trigger 生成绑定校验的结构化 Goal 交互回复。
 *
 * @param delivery - 持有待发送 `interaction.answered` Trigger 的内部投递记录。
 * @returns 顶层 `replyTo`、封闭的 `GoalUserAction`，以及 answer 自带的可选等待身份。
 * @throws Trigger 类型、目标 Goal 或回复来源不符合交互约定时抛出。
 * @example
 * ```ts
 * const interaction = decodeWorkerInteractionPayload(delivery);
 * ```
 */
export function decodeWorkerInteractionPayload(delivery: TriggerDeliveryFile): WorkerInteractionPayload {
    const trigger = delivery.trigger;
    if (trigger.type !== "interaction" || trigger.payload.action !== "answered" || trigger.target !== "worker"
        || !("goalId" in trigger) || trigger.source.role !== "external" && trigger.source.role !== "supervisor"
        || !trigger.replyTo.trim()) {
        throw new Error("Invalid interaction Trigger");
    }
    const answer = trigger.payload.answer;
    const interactionRequestId = "requestId" in answer ? answer.requestId
        : "actionId" in answer ? answer.actionId : undefined;
    return { replyTo: trigger.replyTo, answer, ...(interactionRequestId === undefined ? {} : { interactionRequestId }) };
}
