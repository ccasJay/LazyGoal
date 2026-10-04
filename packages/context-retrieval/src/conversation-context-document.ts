import { createHash } from "node:crypto";
import type {
    ContextDocumentFields,
    ContextDocumentSource,
    ContextSearchDocument,
} from "./context-document";

/**
 * 检索模块使用的只读会话消息。
 *
 * @remarks
 * 与 Runtime 的 `GoalMessage` 结构兼容。
 *
 * @example
 * ```ts
 * const message: ContextRetrievalMessage = {
 *     role: "user",
 *     content: "请帮我排查问题",
 * };
 * ```
 */
export interface ContextRetrievalMessage {
    readonly role: "user" | "assistant" | string;
    readonly content: string;
    readonly createdAt?: string;
}

/**
 * Conversation 文档构建输入。
 *
 * @remarks
 * 默认只把 `[0, conversationStartIndex)` 视为当前 Run 之前的冷消息；提供显式
 * 消息范围时，范围内每条消息都归属于传入的 `runId`，不会与其它 Run 的局部
 * Trajectory sequence 混合。该输入只读，不修改 Goal 消息。
 *
 * @example
 * ```ts
 * const input: ConversationContextDocumentInput = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     messages,
 *     messageStartIndex: 0,
 *     messageEndIndexExclusive: 2,
 * };
 * ```
 */
export interface ConversationContextDocumentInput {
    readonly goalId: string;
    readonly runId: string;
    readonly messages: readonly ContextRetrievalMessage[];
    /** 当前 Epoch 起点；更早消息才进入 Cold。 */
    readonly conversationStartIndex?: number;
    /** 可选的消息范围起点；用于把归档消息绑定到其所属 Run。 */
    readonly messageStartIndex?: number;
    /** 可选的消息范围结束位置（半开）；缺省为 `conversationStartIndex`。 */
    readonly messageEndIndexExclusive?: number;
}

/** 从 Snapshot 权威消息生成统一检索索引中的 Conversation Documents。 */
export function buildConversationContextDocuments(
    input: ConversationContextDocumentInput,
): readonly ContextSearchDocument[] {
    const start = input.messageStartIndex ?? 0;
    const end = input.messageEndIndexExclusive ?? input.conversationStartIndex ?? 0;
    if (
        !Number.isSafeInteger(start)
        || !Number.isSafeInteger(end)
        || start < 0
        || end < start
        || end > input.messages.length
    ) {
        throw new RangeError("conversation message range is invalid");
    }
    const documents: ContextSearchDocument[] = [];
    for (let index = start; index < end; index += 1) {
        const message = input.messages[index]!;
        const role = (message.role === "assistant" ? "assistant" : "user") as "user" | "assistant";
        const source: ContextDocumentSource = {
            kind: "conversation",
            messageIndex: index,
            role,
            contentHash: computeContentHash(message.content),
        };
        const fields: ContextDocumentFields = {
            eventType: [],
            toolId: [],
            actionId: [],
            stepIndex: [],
            path: [],
            errorCode: [],
            objectId: [],
            body: message.content,
        };
        documents.push(Object.freeze({
            schemaVersion: 1 as const,
            documentId: `conversation-${input.goalId}-${index}`,
            goalId: input.goalId,
            runId: input.runId,
            kind: "execution" as const,
            phase: "executing" as const,
            firstSequence: index + 1,
            lastSequence: index + 1,
            sourceRange: { firstSequence: index + 1, lastSequence: index + 1 },
            sourceEventIds: [`conversation-${index}`],
            fields,
            body: message.content,
            eventTypes: fields.eventType,
            toolIds: fields.toolId,
            actionIds: fields.actionId,
            stepIndexes: fields.stepIndex,
            paths: fields.path,
            errorCodes: fields.errorCode,
            objectIds: fields.objectId,
            source,
        }));
    }
    return Object.freeze(documents);
}

/** 计算 Conversation 原文校验摘要。 */
export function computeConversationPrefixDigest(
    messages: readonly ContextRetrievalMessage[],
    throughIndexExclusive = messages.length,
): string {
    if (!Number.isSafeInteger(throughIndexExclusive) || throughIndexExclusive < 0 || throughIndexExclusive > messages.length) {
        throw new RangeError("throughIndexExclusive is invalid");
    }
    const prefix = messages.slice(0, throughIndexExclusive).map((message, index) => ({
        index,
        role: message.role,
        contentHash: computeContentHash(message.content),
    }));
    return `sha256:${createHash("sha256").update(JSON.stringify(prefix), "utf8").digest("hex")}`;
}

function computeContentHash(content: string): `sha256:${string}` {
    return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}
