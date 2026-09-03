import { createHash } from "node:crypto";
import type { GoalMessage } from "./domain";
import type {
    ContextDocumentFields,
    ContextDocumentSource,
    ContextSearchDocument,
} from "./context-document";
import { computeContentHash } from "./trajectory";

/** Conversation 文档构建输入。 */
export interface ConversationContextDocumentInput {
    readonly goalId: string;
    readonly runId: string;
    readonly messages: readonly GoalMessage[];
    /** 当前 Epoch 起点；更早消息才进入 Cold。 */
    readonly conversationStartIndex?: number;
}

/** 从 Snapshot 权威消息生成统一检索索引中的 Conversation Documents。 */
export function buildConversationContextDocuments(
    input: ConversationContextDocumentInput,
): readonly ContextSearchDocument[] {
    const start = input.conversationStartIndex ?? 0;
    if (!Number.isSafeInteger(start) || start < 0 || start > input.messages.length) {
        throw new RangeError("conversationStartIndex is invalid");
    }
    const documents: ContextSearchDocument[] = [];
    for (let index = 0; index < start; index += 1) {
        const message = input.messages[index]!;
        const source: ContextDocumentSource = {
            kind: "conversation",
            messageIndex: index,
            role: message.role,
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
            kind: "preparation" as const,
            phase: "gathering_context" as const,
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
    messages: readonly GoalMessage[],
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
