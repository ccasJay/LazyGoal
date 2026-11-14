import type { GoalMessage } from "./domain";

/**
 * 阈值提炼的输入。
 *
 * @remarks
 * `evictedTranscript` 是将被移出工作窗口的完整历史，`recentTranscript` 是保留的近期
 * 完整交互，只作为判断旧信息是否仍相关的线索。实现不得写入 Working Memory，也不得
 * 改变 Goal 状态。
 *
 * @example
 * ```ts
 * const input: ContextCompactionInput = {
 *     intent: "修复登录回归",
 *     evictedTranscript: "user: ...\nassistant: ...",
 *     recentTranscript: "user: ...",
 *     evictedCharacters: 1200,
 * };
 * ```
 */
export interface ContextCompactionInput {
    /** Goal 的原始意图，作为接续依据。 */
    readonly intent: string;
    /** 已批准任务的目标；未批准时省略。 */
    readonly objective?: string | undefined;
    /** 将被移出工作窗口的历史正文。 */
    readonly evictedTranscript: string;
    /** 保留在工作窗口中的近期完整交互。 */
    readonly recentTranscript: string;
    /** 被移出历史的字符数，用于判断提炼是否确实缩减。 */
    readonly evictedCharacters: number;
}

/**
 * 执行一轮提炼的模型调用端口。
 *
 * @remarks
 * 端口只负责一次模型调用与文本提取；候选选择、有效性判断与提交边界由 Runtime 负责。
 *
 * @example
 * ```ts
 * const port: ContextCompactionPort = { compact: async (input) => model(input) };
 * ```
 */
export interface ContextCompactionPort {
    /**
     * @param input - 待提炼历史与接续线索。
     * @returns 压缩正文；无法产出有效结果时返回 `undefined`。
     */
    compact(input: ContextCompactionInput): Promise<string | undefined>;
}

/**
 * 提炼失败或无需提炼的原因。
 *
 * @example
 * ```ts
 * const result: ContextCompactionResult = { kind: "unchanged", reason: "not_reduced" };
 * ```
 */
export type ContextCompactionSkipReason = "invalid" | "not_reduced" | "failed";

/**
 * 一轮提炼的结论。
 *
 * @example
 * ```ts
 * const result: ContextCompactionResult = { kind: "compacted", body: "已验证：..." };
 * ```
 */
export type ContextCompactionResult =
    | { readonly kind: "compacted"; readonly body: string }
    | { readonly kind: "unchanged"; readonly reason: ContextCompactionSkipReason };

/** 保留在当前窗口中的近期完整交互数。 */
const RETAINED_INTERACTIONS = 2;

/**
 * 把消息投影为可提炼的确定性正文。
 *
 * @param messages - 已提交的对话消息。
 * @returns 逐行 `role: content` 文本；空白内容被跳过。
 * @example
 * ```ts
 * const transcript = renderCompactionTranscript(messages);
 * ```
 */
export function renderCompactionTranscript(messages: readonly GoalMessage[]): string {
    return messages
        .map((message) => {
            const content = message.content.trim();
            return content.length === 0 ? "" : `${message.role}: ${content}`;
        })
        .filter((line) => line.length > 0)
        .join("\n");
}

/**
 * 选择本轮可以被移出窗口的历史，并保留最近若干个完整交互。
 *
 * @param messages - 当前 Goal 的全部已提交消息。
 * @param conversationStartIndex - 当前 Epoch 的窗口起点。
 * @returns 可移出的历史与保留的近期交互；没有足够完整交互可供移出时返回 `undefined`。
 * @example
 * ```ts
 * const window = selectCompactionWindow(goal.state.messages, goal.state.run.contextEpoch.conversationStartIndex);
 * ```
 */
export function selectCompactionWindow(
    messages: readonly GoalMessage[],
    conversationStartIndex: number,
): { readonly evicted: readonly GoalMessage[]; readonly retained: readonly GoalMessage[]; readonly retainedStartIndex: number } | undefined {
    const userIndexes: number[] = [];
    for (let index = conversationStartIndex; index < messages.length; index += 1) {
        if (messages[index]?.role === "user") userIndexes.push(index);
    }
    // 至少需要 RETAINED_INTERACTIONS + 1 个用户交互，才能既移出历史又保留近期完整交互。
    if (userIndexes.length <= RETAINED_INTERACTIONS) return undefined;
    const retainedStartIndex = userIndexes[userIndexes.length - RETAINED_INTERACTIONS]!;
    const evicted = messages.slice(conversationStartIndex, retainedStartIndex);
    if (evicted.length === 0) return undefined;
    return {
        evicted,
        retained: messages.slice(retainedStartIndex),
        retainedStartIndex,
    };
}

/**
 * 校验提炼正文是否可用且确实缩减了窗口。
 *
 * @param body - 端口返回的压缩正文。
 * @param evictedCharacters - 被移出历史的字符数。
 * @returns 可提交的正文，或不可提交的原因。
 * @example
 * ```ts
 * const result = evaluateCompactionBody("已验证：...", 1200);
 * ```
 */
export function evaluateCompactionBody(
    body: string | undefined,
    evictedCharacters: number,
): ContextCompactionResult {
    if (body === undefined) return { kind: "unchanged", reason: "failed" };
    const trimmed = body.trim();
    if (trimmed.length === 0) return { kind: "unchanged", reason: "invalid" };
    if (!Number.isSafeInteger(evictedCharacters) || evictedCharacters <= 0) {
        return { kind: "unchanged", reason: "invalid" };
    }
    // 未缩减的正文会让下一窗口比旧窗口更大，必须留在旧 Epoch。
    if (trimmed.length >= evictedCharacters) return { kind: "unchanged", reason: "not_reduced" };
    return { kind: "compacted", body: trimmed };
}
