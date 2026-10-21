import type { GoalMessage, GoalMessagePosition, GoalMessageSource } from "./domain";

/**
 * 列表读取时每条消息公开正文的上限（UTF-16 code unit）。
 *
 * @remarks
 * 列表正文只是有界摘要：超限只截断该条摘要并标记截断，完整原文按 `messageId`
 * 另行读取，不从摘要补齐。
 *
 * @example
 * ```ts
 * const preview = content.slice(0, MAX_MESSAGE_LIST_CONTENT_LENGTH);
 * ```
 */
export const MAX_MESSAGE_LIST_CONTENT_LENGTH = 2_000;

/**
 * 单条正文读取的上限（UTF-16 code unit）。
 *
 * @remarks
 * 超限只截断本次返回并标记截断，同时给出后续读取位置；不拆断 Unicode 代理项。
 *
 * @example
 * ```ts
 * const body = content.slice(0, MAX_MESSAGE_BODY_LENGTH);
 * ```
 */
export const MAX_MESSAGE_BODY_LENGTH = 64_000;

/** 消息列表的默认页大小。 */
export const DEFAULT_MESSAGE_PAGE_SIZE = 50;

/** 消息列表允许的最大页大小。 */
export const MAX_MESSAGE_PAGE_SIZE = 100;

/**
 * 一次有界消息列表查询的参数。
 *
 * @remarks
 * `afterMessageId` 限定追加读取的起点；`throughMessageId` 限定读取区间末尾，
 * 首批由服务端确定，后续翻页必须沿用同一值，使翻页期间新追加的消息不混入
 * 既定范围。
 *
 * @example
 * ```ts
 * const query: SessionMessageQuery = { limit: 50 };
 * ```
 */
export interface SessionMessageQuery {
    /** 追加读取的起点身份；省略时从范围起点开始。 */
    readonly afterMessageId?: string | undefined;
    /** 读取区间末尾身份；省略时使用当前范围末尾。 */
    readonly throughMessageId?: string | undefined;
    /** 每页条数；默认 50，最大 100。 */
    readonly limit?: number | undefined;
}

/**
 * 一条消息的公开条目。
 *
 * @remarks
 * 条目只包含身份、角色、Run 归属、稳定位置、用途、来源与有界正文摘要；不包含隐藏推理、
 * 凭据或原始 Provider 响应。
 *
 * @example
 * ```ts
 * const entry: SessionMessageEntry = {
 *   messageId: "msg-1", role: "assistant", runId: "run-1", position: { afterSequence: 8, order: 0 },
 *   purpose: "answer", sourceKind: "completion_candidate", sourceId: "c1",
 *   content: "已完成", contentLength: 3, truncated: false,
 * };
 * ```
 */
export interface SessionMessageEntry {
    /** 消息稳定身份。 */
    readonly messageId: string;
    /** 消息角色。 */
    readonly role: "user" | "assistant";
    /** 消息所属 Run。 */
    readonly runId: string;
    /** 消息在所属 Run 已提交事实流中的稳定位置。 */
    readonly position: GoalMessagePosition;
    /** 助手消息用途；用户消息省略。 */
    readonly purpose?: "process" | "answer" | "notice" | undefined;
    /** 来源判别式。 */
    readonly sourceKind: GoalMessageSource["kind"];
    /** 来源的稳定标识。 */
    readonly sourceId: string;
    /** 有界正文摘要。 */
    readonly content: string;
    /** 原始正文长度（UTF-16 code unit）。 */
    readonly contentLength: number;
    /** 正文摘要是否因上限被截断。 */
    readonly truncated: boolean;
}

/**
 * 一次有界消息列表读取的结果。
 *
 * @remarks
 * `nextAfterMessageId` 存在表示还有后续页；`throughMessageId` 是本批确定的范围
 * 末尾，后续翻页必须沿用。读取失败与空集合不混淆：失败使用 `ok: false`。
 *
 * @example
 * ```ts
 * const result = queryGoalMessages(messages, { limit: 50 });
 * ```
 */
export type SessionMessageListResult =
    | {
        readonly ok: true;
        readonly messages: readonly SessionMessageEntry[];
        /** 后续页的起点身份；没有后续页时省略。 */
        readonly nextAfterMessageId?: string | undefined;
        /** 本批确定的范围末尾身份。 */
        readonly throughMessageId?: string | undefined;
        /** 当前范围内的消息总数。 */
        readonly total: number;
    }
    | {
        readonly ok: false;
        readonly code: "MESSAGE_RANGE_INVALID";
        readonly message: string;
    };

/**
 * 一次单条正文读取的结果。
 *
 * @remarks
 * `nextOffset` 是截断后继续读取的位置；`truncated` 明确说明本次正文不是完整
 * 原文。未知或跨 Goal 的身份返回 `MESSAGE_NOT_FOUND`，不返回空正文。
 *
 * @example
 * ```ts
 * const result = readGoalMessageBody(messages, "msg-1");
 * ```
 */
export type SessionMessageBodyResult =
    | {
        readonly ok: true;
        readonly entry: SessionMessageEntry;
        /** 截断后续读取的起始位置；未截断时省略。 */
        readonly nextOffset?: number | undefined;
    }
    | {
        readonly ok: false;
        readonly code: "MESSAGE_NOT_FOUND";
        readonly message: string;
    };

/**
 * 计算来源的稳定标识。
 *
 * @param source - 消息来源。
 * @returns 该来源的稳定标识。
 * @example
 * ```ts
 * const id = projectMessageSourceId({ kind: "user_input", inputId: "input-1" });
 * ```
 */
export function projectMessageSourceId(source: GoalMessageSource): string {
    switch (source.kind) {
        case "goal_intent":
            return source.goalId;
        case "user_input":
            return source.inputId;
        case "interaction_response":
            return source.requestId;
        case "model_text":
            return `${source.modelCallId}#${source.blockIndex}`;
        case "stage_output":
            return `${source.executionUnitId}#${source.blockIndex}`;
        case "completion_candidate":
            return source.candidateId;
        case "host_execution":
            return source.actionId;
        case "runtime_notice":
            return source.noticeId;
    }
}

/**
 * 按上限截取正文，且不拆断 Unicode 代理项。
 *
 * @param content - 原始正文。
 * @param maxLength - 长度上限（UTF-16 code unit）。
 * @returns 截取后的正文；边界落在代理项中间时少取一个码元。
 * @example
 * ```ts
 * const head = sliceWithoutSplittingSurrogate(content, 64_000);
 * ```
 */
export function sliceWithoutSplittingSurrogate(content: string, maxLength: number): string {
    const slice = content.slice(0, maxLength);
    if (slice.length === 0) return slice;
    const last = slice.charCodeAt(slice.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) return slice.slice(0, -1);
    return slice;
}

/**
 * 把一条已提交消息投影为公开条目。
 *
 * @param message - 已提交消息。
 * @param maxContentLength - 正文摘要上限。
 * @returns 公开条目。
 * @example
 * ```ts
 * const entry = projectSessionMessageEntry(message);
 * ```
 */
export function projectSessionMessageEntry(
    message: GoalMessage,
    maxContentLength: number = MAX_MESSAGE_LIST_CONTENT_LENGTH,
): SessionMessageEntry {
    const content = sliceWithoutSplittingSurrogate(message.content, maxContentLength);
    return {
        messageId: message.messageId,
        role: message.role,
        runId: message.runId,
        position: { ...message.position },
        ...(message.role === "assistant" ? { purpose: message.purpose } : {}),
        sourceKind: message.source.kind,
        sourceId: projectMessageSourceId(message.source),
        content,
        contentLength: message.content.length,
        truncated: content.length < message.content.length,
    };
}

/**
 * 按稳定身份对已提交消息执行有界列表读取。
 *
 * @remarks
 * 读取区间由 `throughMessageId` 固定；翻页期间新追加的消息不会混入既定范围。
 * `afterMessageId` 必须落在同一区间内，否则返回明确的范围错误。
 *
 * @param messages - 当前快照的已提交消息，按提交顺序排列。
 * @param query - 查询参数。
 * @returns 列表结果或稳定的范围错误。
 * @example
 * ```ts
 * const result = queryGoalMessages(goal.state.messages, { limit: 50 });
 * ```
 */
export function queryGoalMessages(
    messages: readonly GoalMessage[],
    query: SessionMessageQuery,
): SessionMessageListResult {
    const limit = query.limit ?? DEFAULT_MESSAGE_PAGE_SIZE;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_MESSAGE_PAGE_SIZE) {
        return {
            ok: false,
            code: "MESSAGE_RANGE_INVALID",
            message: `limit must be an integer between 1 and ${MAX_MESSAGE_PAGE_SIZE}`,
        };
    }
    const last = messages.at(-1);
    const throughMessageId = query.throughMessageId ?? last?.messageId;
    const throughIndex = throughMessageId === undefined
        ? -1
        : messages.findIndex((message) => message.messageId === throughMessageId);
    if (throughMessageId !== undefined && throughIndex < 0) {
        return {
            ok: false,
            code: "MESSAGE_RANGE_INVALID",
            message: `throughMessageId "${throughMessageId}" is not part of this Goal`,
        };
    }
    const range = throughIndex < 0 ? [] : messages.slice(0, throughIndex + 1);
    let start = 0;
    if (query.afterMessageId !== undefined) {
        const afterIndex = range.findIndex((message) => message.messageId === query.afterMessageId);
        if (afterIndex < 0) {
            return {
                ok: false,
                code: "MESSAGE_RANGE_INVALID",
                message: `afterMessageId "${query.afterMessageId}" is not part of the requested range`,
            };
        }
        start = afterIndex + 1;
    }
    const page = range.slice(start, start + limit);
    const hasMore = start + page.length < range.length;
    const lastPage = page.at(-1);
    return {
        ok: true,
        messages: page.map((message) => projectSessionMessageEntry(message)),
        ...(hasMore && lastPage !== undefined ? { nextAfterMessageId: lastPage.messageId } : {}),
        ...(throughMessageId === undefined ? {} : { throughMessageId }),
        total: range.length,
    };
}

/**
 * 按稳定身份读取一条消息的正文。
 *
 * @param messages - 当前快照的已提交消息。
 * @param messageId - 消息稳定身份。
 * @param offset - 起始位置（UTF-16 code unit）；省略时从头读取。
 * @returns 正文结果或明确的不存在。
 * @example
 * ```ts
 * const result = readGoalMessageBody(messages, "msg-1");
 * ```
 */
export function readGoalMessageBody(
    messages: readonly GoalMessage[],
    messageId: string,
    offset: number = 0,
): SessionMessageBodyResult {
    const message = messages.find((candidate) => candidate.messageId === messageId);
    if (message === undefined) {
        return { ok: false, code: "MESSAGE_NOT_FOUND", message: `Message "${messageId}" was not found` };
    }
    const start = Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
    const slice = sliceWithoutSplittingSurrogate(message.content.slice(start), MAX_MESSAGE_BODY_LENGTH);
    const nextOffset = start + slice.length;
    const truncated = nextOffset < message.content.length;
    return {
        ok: true,
        entry: {
            ...projectSessionMessageEntry(message, MAX_MESSAGE_BODY_LENGTH),
            content: slice,
            truncated,
        },
        ...(truncated ? { nextOffset } : {}),
    };
}
