import { randomUUID } from "node:crypto";

import type {
    AssistantMessage,
    AssistantMessagePurpose,
    Goal,
    GoalMessage,
    GoalMessageSource,
    UserMessage,
} from "./domain";

/**
 * 同一来源出现不一致正文时抛出的稳定错误。
 *
 * @remarks
 * 该错误表示提交重试发现同一来源已经被另一段正文占用：Runtime 不覆盖已提交
 * 正文，也不追加第二条相同来源的消息。
 *
 * @example
 * ```ts
 * try {
 *     appendGoalMessage(goal, draft);
 * } catch (error) {
 *     if (error instanceof GoalMessageSourceConflictError) console.error(error.code);
 * }
 * ```
 */
export class GoalMessageSourceConflictError extends Error {
    /** 稳定的错误分类代码。 */
    readonly code = "GOAL_MESSAGE_SOURCE_CONFLICT" as const;

    /**
     * @param source - 冲突的来源。
     * @param existingContent - 已提交消息的正文。
     * @param incomingContent - 本次提交的正文。
     */
    constructor(
        readonly source: GoalMessageSource,
        readonly existingContent: string,
        readonly incomingContent: string,
    ) {
        super(
            `Goal message source "${goalMessageSourceKey(source)}" already exists with different content`,
        );
        this.name = "GoalMessageSourceConflictError";
    }
}

/**
 * 计算来源的稳定比较键。
 *
 * @remarks
 * 键只由来源自身的判别字段组成，不包含正文、数组位置或当前 Run 选择；同文
 * 不同来源因此得到不同键。
 *
 * @param source - 消息来源。
 * @returns 该来源在同一 Goal 内的稳定比较键。
 * @example
 * ```ts
 * const key = goalMessageSourceKey({ kind: "user_input", inputId: "input-1" });
 * ```
 */
export function goalMessageSourceKey(source: GoalMessageSource): string {
    switch (source.kind) {
        case "goal_intent":
            return `goal_intent:${source.goalId}`;
        case "user_input":
            return `user_input:${source.inputId}`;
        case "interaction_response":
            return `interaction_response:${source.requestId}`;
        case "model_text":
            return `model_text:${source.modelCallId}:${source.blockIndex}`;
        case "stage_output":
            return `stage_output:${source.executionUnitId}:${source.blockIndex}`;
        case "completion_candidate":
            return `completion_candidate:${source.candidateId}`;
        case "host_execution":
            return `host_execution:${source.actionId}`;
        case "runtime_notice":
            return `runtime_notice:${source.noticeId}`;
    }
}

/**
 * 查找与给定来源相同的已提交消息。
 *
 * @param messages - 已提交消息数组。
 * @param source - 待查找的来源。
 * @returns 命中的消息；不存在时返回 `undefined`。
 * @example
 * ```ts
 * const existing = findGoalMessageBySource(goal.state.messages, source);
 * ```
 */
export function findGoalMessageBySource(
    messages: readonly GoalMessage[],
    source: GoalMessageSource,
): GoalMessage | undefined {
    const key = goalMessageSourceKey(source);
    return messages.find((message) => goalMessageSourceKey(message.source) === key);
}

/**
 * 按稳定身份查找已提交消息。
 *
 * @param messages - 已提交消息数组。
 * @param messageId - 消息稳定身份。
 * @returns 命中的消息；不存在时返回 `undefined`。
 * @example
 * ```ts
 * const found = findGoalMessageById(goal.state.messages, "msg-1");
 * ```
 */
export function findGoalMessageById(
    messages: readonly GoalMessage[],
    messageId: string,
): GoalMessage | undefined {
    return messages.find((message) => message.messageId === messageId);
}

/** 构造用户消息所需的最小输入。 */
export interface UserMessageDraft {
    readonly content: string;
    readonly runId: string;
    readonly source: GoalMessageSource;
    /** 可选的消息身份；省略时由 Runtime 在提交边界分配。 */
    readonly messageId?: string | undefined;
}

/** 构造助手消息所需的最小输入。 */
export interface AssistantMessageDraft {
    readonly content: string;
    readonly runId: string;
    readonly purpose: AssistantMessagePurpose;
    readonly source: GoalMessageSource;
    readonly profileId: string;
    /** 可选的消息身份；省略时由 Runtime 在提交边界分配。 */
    readonly messageId?: string | undefined;
}

/** 追加正式消息的统一草稿。 */
export type GoalMessageDraft =
    | ({ readonly role: "user" } & UserMessageDraft)
    | ({ readonly role: "assistant" } & AssistantMessageDraft);

/**
 * 构造带稳定身份的用户消息。
 *
 * @param draft - 正文、Run 归属、来源与可选身份。
 * @returns 满足当前消息契约的只读用户消息。
 * @example
 * ```ts
 * const message = createUserMessage({ content: "继续", runId: "run-1", source });
 * ```
 */
export function createUserMessage(draft: UserMessageDraft): UserMessage {
    return {
        role: "user",
        content: draft.content,
        messageId: draft.messageId ?? `msg-${randomUUID()}`,
        runId: draft.runId,
        source: draft.source,
    };
}

/**
 * 构造带稳定身份与用途的助手消息。
 *
 * @param draft - 正文、Run 归属、用途、来源、Profile 与可选身份。
 * @returns 满足当前消息契约的只读助手消息。
 * @example
 * ```ts
 * const message = createAssistantMessage({
 *   content: "先检查配置", runId: "run-1", purpose: "process", source, profileId: "default",
 * });
 * ```
 */
export function createAssistantMessage(draft: AssistantMessageDraft): AssistantMessage {
    return {
        role: "assistant",
        assistant: { profileId: draft.profileId },
        content: draft.content,
        messageId: draft.messageId ?? `msg-${randomUUID()}`,
        runId: draft.runId,
        purpose: draft.purpose,
        source: draft.source,
    };
}

/** 追加消息的结果。 */
export interface AppendGoalMessageResult {
    /** 追加后的 Goal；复用已有消息时与输入相同。 */
    readonly goal: Goal;
    /** 实际存在的消息；同源重试时为已提交的原消息。 */
    readonly message: GoalMessage;
    /** 本次是否复用了已提交的同源消息。 */
    readonly reused: boolean;
}

/**
 * 按来源幂等地追加一条正式消息。
 *
 * @remarks
 * 同一来源重复提交时返回已提交的原消息身份，不追加第二条；同一来源出现不一致
 * 正文时抛出 {@link GoalMessageSourceConflictError}，不覆盖已提交正文。
 *
 * @param goal - 当前 Goal 快照。
 * @param draft - 待追加的用户或助手消息草稿。
 * @returns 追加结果与最终消息。
 * @throws GoalMessageSourceConflictError 当同源正文不一致时抛出。
 * @example
 * ```ts
 * const result = appendGoalMessage(goal, { role: "user", content: "继续", runId: "run-1", source });
 * ```
 */
export function appendGoalMessage(
    goal: Goal,
    draft: GoalMessageDraft,
): AppendGoalMessageResult {
    const existing = findGoalMessageBySource(goal.state.messages, draft.source);
    if (existing !== undefined) {
        if (existing.content !== draft.content) {
            throw new GoalMessageSourceConflictError(draft.source, existing.content, draft.content);
        }
        return { goal, message: existing, reused: true };
    }
    const message: GoalMessage = draft.role === "assistant"
        ? createAssistantMessage({
            content: draft.content,
            runId: draft.runId,
            purpose: draft.purpose,
            source: draft.source,
            profileId: draft.profileId,
            ...(draft.messageId === undefined ? {} : { messageId: draft.messageId }),
        })
        : createUserMessage({
            content: draft.content,
            runId: draft.runId,
            source: draft.source,
            ...(draft.messageId === undefined ? {} : { messageId: draft.messageId }),
        });
    return {
        goal: {
            ...goal,
            state: {
                ...goal.state,
                messages: [...goal.state.messages, message],
            },
        },
        message,
        reused: false,
    };
}

/**
 * 为 Runtime 自身的通知构造来源。
 *
 * @param noticeId - 通知的稳定身份。
 * @returns 指向该通知的来源。
 * @example
 * ```ts
 * const source = createRuntimeNoticeSource("notice-1");
 * ```
 */
export function createRuntimeNoticeSource(noticeId: string): GoalMessageSource {
    return { kind: "runtime_notice", noticeId };
}

/**
 * 为模型公开正文块构造来源。
 *
 * @param modelCallId - 产生该正文的模型调用身份。
 * @param blockIndex - 该响应内公开正文块的顺序下标。
 * @returns 指向该模型调用块的来源。
 * @example
 * ```ts
 * const source = createModelTextSource("call-1", 0);
 * ```
 */
export function createModelTextSource(modelCallId: string, blockIndex: number): GoalMessageSource {
    return { kind: "model_text", modelCallId, blockIndex };
}

/**
 * 为没有模型调用身份的阶段正文构造来源。
 *
 * @param executionUnitId - 产生该正文的执行单元身份。
 * @param blockIndex - 该正文在本次响应内的块下标。
 * @returns 指向该执行单元与块的来源。
 * @example
 * ```ts
 * const source = createStageOutputSource("unit-1", 0);
 * ```
 */
export function createStageOutputSource(executionUnitId: string, blockIndex: number): GoalMessageSource {
    return { kind: "stage_output", executionUnitId, blockIndex };
}
