import type {
    ModelConversationMessage,
    ModelInferenceView,
} from "../../model-view/src/index";

/**
 * 按已结算原生交换的模型调用来源覆盖重复的过程正文。
 *
 * @remarks
 * 只有本次请求实际包含的同身份原生交换可以覆盖对应的过程正文；覆盖以模型调用
 * 身份关联，不比较正文字符串，因此同文的用户消息、其他调用与独立答案都不受影响。
 * 交换未结算、被预算淘汰或协议身份切换时，本函数不删除任何消息。
 *
 * @param view - 已完成分层上下文选择的模型推理视图。
 * @returns 去除被覆盖过程正文后的新视图；没有覆盖时返回等价的新视图。
 * @example
 * ```ts
 * const deduped = omitCoveredProcessMessages(view);
 * ```
 */
export function omitCoveredProcessMessages(
    view: ModelInferenceView,
): ModelInferenceView {
    const covered = coveredModelCallIds(view);
    if (covered.size === 0) return { ...view, conversation: [...view.conversation] };
    const conversation = view.conversation.filter((message) =>
        !isCoveredProcessMessage(message, covered));
    if (conversation.length === view.conversation.length) {
        return { ...view, conversation: [...view.conversation] };
    }
    return { ...view, conversation };
}

/**
 * 收集本次请求实际包含的原生交换对应的模型调用身份。
 *
 * @param view - 已完成分层上下文选择的模型推理视图。
 * @returns 被覆盖的模型调用身份集合。
 * @example
 * ```ts
 * const ids = coveredModelCallIds(view);
 * ```
 */
export function coveredModelCallIds(
    view: ModelInferenceView,
): ReadonlySet<string> {
    return new Set(
        (view.trajectoryContext?.hot ?? [])
            .flatMap(unit => unit.nativeExchanges ?? [])
            .map(exchange => exchange.modelCallId),
    );
}

function isCoveredProcessMessage(
    message: ModelConversationMessage,
    covered: ReadonlySet<string>,
): boolean {
    if (message.source.kind !== "model_text") return false;
    return covered.has(message.source.modelCallId);
}
