import { isJsonValue, isRecord } from "../../../../packages/contracts/src/index";
import type { GoalUserAction } from "../../../../packages/runtime/src/index";
import type { TriggerDeliveryFile } from "../../../../packages/storage/src/index";

/**
 * Supervisor 经 Trigger 传给原 Worker 的结构化交互。
 *
 * @remarks 仅包含当前 Run、等待、提交修订和 Worker 代次的身份，以及经验证的 Runtime 用户决定。
 * @example
 * ```ts
 * const payload = decodeWorkerInteractionPayload(delivery);
 * if (payload.workerId === assignment.workerId) await apply(payload.action);
 * ```
 */
export interface WorkerInteractionPayload {
    readonly type: "interaction_response";
    readonly runId: string;
    readonly requestId: string;
    readonly interactionId: string;
    readonly commitRevision: number;
    readonly workerId: string;
    readonly generation: string;
    readonly action: GoalUserAction;
}

/**
 * 解析持久化交互 Trigger，并验证其领域决定与投递身份。
 *
 * @param delivery - 已通过 Trigger 文件结构绑定读取的交互投递。
 * @returns 绑定 Run、等待、Worker 代次和 GoalUserAction 的交互载荷。
 * @throws 投递用途、来源、身份、字段形状或批准身份不匹配时抛出。
 * @example
 * ```ts
 * const interaction = decodeWorkerInteractionPayload(delivery);
 * await runtime.commands.resume({ ref: { goalId, runId: interaction.runId }, action: interaction.action });
 * ```
 */
export function decodeWorkerInteractionPayload(delivery: TriggerDeliveryFile): WorkerInteractionPayload {
    if (delivery.trigger.purpose !== "interaction" || delivery.goalId === undefined
        || (delivery.trigger.source !== "user" && delivery.trigger.source !== "supervisor")) {
        throw new Error("Invalid interaction Trigger");
    }
    let raw: unknown;
    try { raw = JSON.parse(delivery.trigger.payload); }
    catch { throw new Error("Invalid interaction Trigger payload"); }
    if (!isRecord(raw) || !hasOnlyKeys(raw, ["type", "runId", "requestId", "interactionId", "commitRevision", "workerId", "generation", "action"])
        || raw.type !== "interaction_response" || !nonEmptyString(raw.runId) || !nonEmptyString(raw.requestId)
        || !nonEmptyString(raw.interactionId) || !Number.isSafeInteger(raw.commitRevision)
        || !nonEmptyString(raw.workerId) || !nonEmptyString(raw.generation)) {
        throw new Error("Invalid interaction Trigger payload");
    }
    const action = parseGoalUserAction(raw.action);
    const actionRequest = action === undefined ? undefined : actionRequestId(action);
    const actionTargetId = action !== undefined && "actionId" in action ? action.actionId : undefined;
    if (action === undefined || (actionRequest !== undefined && actionRequest !== raw.requestId)
        || (actionTargetId !== undefined && actionTargetId !== raw.requestId)
        || ((action.kind === "approve_action" || action.kind === "approve_action_revision")
            && action.approvalInputId !== delivery.trigger.id)) {
        throw new Error("Invalid interaction Trigger action");
    }
    return {
        type: "interaction_response",
        runId: raw.runId,
        requestId: raw.requestId,
        interactionId: raw.interactionId,
        commitRevision: raw.commitRevision as number,
        workerId: raw.workerId,
        generation: raw.generation,
        action,
    };
}

function parseGoalUserAction(value: unknown): GoalUserAction | undefined {
    if (!isRecord(value) || typeof value.kind !== "string") return undefined;
    switch (value.kind) {
        case "answer_ask_user": {
            if (!hasOnlyKeys(value, ["kind", "requestId", "answers"]) || !nonEmptyString(value.requestId)
                || !Array.isArray(value.answers) || value.answers.length < 1 || value.answers.length > 3) return undefined;
            const answers: { readonly questionId: string; readonly optionIds: readonly string[]; readonly otherText?: string }[] = [];
            for (const answer of value.answers) {
                if (!isRecord(answer) || !hasOnlyKeys(answer, ["questionId", "optionIds"], ["otherText"])
                    || !nonEmptyString(answer.questionId) || !Array.isArray(answer.optionIds)
                    || answer.optionIds.length > 3 || !answer.optionIds.every(nonEmptyString)
                    || (answer.otherText !== undefined && typeof answer.otherText !== "string")) return undefined;
                answers.push({ questionId: answer.questionId, optionIds: answer.optionIds as string[],
                    ...(answer.otherText === undefined ? {} : { otherText: answer.otherText }) });
            }
            return { kind: "answer_ask_user", requestId: value.requestId, answers };
        }
        case "reply_to_question":
            return hasOnlyKeys(value, ["kind", "requestId", "content"]) && nonEmptyString(value.requestId)
                && typeof value.content === "string"
                ? { kind: "reply_to_question", requestId: value.requestId, content: value.content }
                : undefined;
        case "skip_question":
            return hasOnlyKeys(value, ["kind", "requestId"]) && nonEmptyString(value.requestId)
                ? { kind: "skip_question", requestId: value.requestId }
                : undefined;
        case "approve_task":
            return hasOnlyKeys(value, ["kind", "requestId"]) && nonEmptyString(value.requestId)
                ? { kind: "approve_task", requestId: value.requestId }
                : undefined;
        case "feedback_task":
            return hasOnlyKeys(value, ["kind", "requestId", "feedback"]) && nonEmptyString(value.requestId)
                && typeof value.feedback === "string"
                ? { kind: "feedback_task", requestId: value.requestId, feedback: value.feedback }
                : undefined;
        case "approve_action":
            if (!hasOnlyKeys(value, ["kind", "actionId", "approvalInputId"], ["scope"])
                || !nonEmptyString(value.actionId) || !nonEmptyString(value.approvalInputId)
                || !validScope(value.scope)) return undefined;
            return { kind: "approve_action", actionId: value.actionId, approvalInputId: value.approvalInputId,
                ...(value.scope === undefined ? {} : { scope: value.scope as "action" | "goal" | "workspace" }) };
        case "approve_action_revision":
            if (!hasOnlyKeys(value, ["kind", "actionId", "input", "reviewRef", "approvalInputId"], ["scope"])
                || !nonEmptyString(value.actionId) || !isJsonValue(value.input) || !nonEmptyString(value.reviewRef)
                || !nonEmptyString(value.approvalInputId) || !validScope(value.scope)) return undefined;
            return { kind: "approve_action_revision", actionId: value.actionId, input: value.input,
                reviewRef: value.reviewRef, approvalInputId: value.approvalInputId,
                ...(value.scope === undefined ? {} : { scope: value.scope as "action" | "goal" | "workspace" }) };
        case "retry_unknown_action":
            return hasOnlyKeys(value, ["kind", "actionId", "recoveryRef"]) && nonEmptyString(value.actionId)
                && nonEmptyString(value.recoveryRef)
                ? { kind: "retry_unknown_action", actionId: value.actionId, recoveryRef: value.recoveryRef }
                : undefined;
        case "decline_unknown_action_retry":
            return hasOnlyKeys(value, ["kind", "actionId", "recoveryRef", "reason"])
                && nonEmptyString(value.actionId) && nonEmptyString(value.recoveryRef)
                && nonEmptyString(value.reason)
                ? { kind: "decline_unknown_action_retry", actionId: value.actionId,
                    recoveryRef: value.recoveryRef, reason: value.reason }
                : undefined;
        case "reject_action":
            return hasOnlyKeys(value, ["kind", "actionId", "reason"]) && nonEmptyString(value.actionId)
                && nonEmptyString(value.reason)
                ? { kind: "reject_action", actionId: value.actionId, reason: value.reason }
                : undefined;
        default:
            return undefined;
    }
}

function actionRequestId(action: GoalUserAction): string | undefined {
    return "requestId" in action ? action.requestId : undefined;
}

function validScope(value: unknown): boolean {
    return value === undefined || value === "action" || value === "goal" || value === "workspace";
}

function nonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
}

function hasOnlyKeys(
    value: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[] = [],
): boolean {
    const allowed = new Set([...required, ...optional]);
    return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
