import type {
    GoalContextIndexSnapshot,
    GoalStageEntry,
    GoalNoteEntry,
    GoalSourceEnvelope,
} from "./goal-context-index";
import type {
    GoalContextDirectoryEntry,
    GoalContextExpandedSource,
} from "./types";
import { ContextLookupProtocolError } from "./context-protocol";

/** 默认单页返回的目录条目上限。 */
export const DEFAULT_DIRECTORY_PAGE_LIMIT = 10;
/** 单页返回的目录条目最大允许上限。 */
export const MAX_DIRECTORY_PAGE_LIMIT = 50;
/** 默认单次来源展开的最大字符数。 */
export const DEFAULT_EXPAND_CHAR_LIMIT = 4096;
/** 单次来源展开的最大允许字符数。 */
export const MAX_EXPAND_CHAR_LIMIT = 8192;

/**
 * 编码 Goal 上下文目录分页游标。
 *
 * @remarks
 * 游标绑定索引的确定性来源摘要 `sourceDigest`，若来源发生变更，
 * 旧游标在解码时将自动失效，防止混用不同快照的历史。
 *
 * @param sourceDigest - 来源索引的 SHA-256 摘要。
 * @param offset - 当前已读取的条目偏移量。
 * @returns 编码后的游标字符串。
 *
 * @example
 * ```ts
 * const cursor = encodeGoalContextCursor("digest-sha256", 10);
 * ```
 */
export function encodeGoalContextCursor(
    sourceDigest: string,
    offset: number,
): string {
    const safeDigest = Buffer.from(sourceDigest, "utf8").toString("base64url");
    return `cur_${safeDigest}_${offset}`;
}

/**
 * 解码并验证 Goal 上下文目录分页游标。
 *
 * @param cursor - 分页游标字符串。
 * @param expectedSourceDigest - 当前索引期望的来源摘要。
 * @returns 偏移量数字。
 * @throws ContextLookupProtocolError 当游标格式损坏或来源摘要不匹配时。
 *
 * @example
 * ```ts
 * const offset = decodeGoalContextCursor(cursor, currentSnapshot.sourceDigest);
 * ```
 */
export function decodeGoalContextCursor(
    cursor: string,
    expectedSourceDigest: string,
): number {
    const parts = cursor.split("_");
    if (parts.length !== 3 || parts[0] !== "cur") {
        throw new ContextLookupProtocolError("Invalid cursor format");
    }
    const digestB64 = parts[1]!;
    const offsetStr = parts[2]!;
    const offset = Number.parseInt(offsetStr, 10);
    if (!Number.isSafeInteger(offset) || offset < 0) {
        throw new ContextLookupProtocolError("Invalid cursor offset");
    }
    const decodedDigest = Buffer.from(digestB64, "base64url").toString("utf8");
    if (decodedDigest !== expectedSourceDigest) {
        throw new ContextLookupProtocolError(
            "Cursor has expired or source digest mismatch",
        );
    }
    return offset;
}

/**
 * 将索引快照中的阶段和重要信息记录转换为统一目录条目列表。
 */
function extractDirectoryEntries(
    index: GoalContextIndexSnapshot,
): GoalContextDirectoryEntry[] {
    const entries: GoalContextDirectoryEntry[] = [];

    // 阶段条目
    for (const stage of index.stages) {
        const summaryText = stage.summary ?? stage.rejectionFeedback;
        entries.push({
            sourceRef: `stage:${stage.runId}:${stage.stageId}`,
            category: "stage",
            runId: stage.runId,
            stageId: stage.stageId,
            title: stage.target,
            status: stage.status,
            ...(summaryText !== undefined ? { summary: summaryText } : {}),
            sourceDescription: `events: ${stage.source.firstSequence}-${stage.source.lastSequence}`,
        });
    }

    // 重要信息记录条目
    const noteIdCounts = new Map<string, number>();
    for (const note of index.notes) {
        noteIdCounts.set(note.noteId, (noteIdCounts.get(note.noteId) ?? 0) + 1);
    }
    for (const note of index.notes) {
        const isDuplicateId = (noteIdCounts.get(note.noteId) ?? 0) > 1;
        entries.push({
            sourceRef: isDuplicateId ? `note:${note.runId}:${note.noteId}` : `note:${note.noteId}`,
            category: note.category,
            runId: note.runId,
            ...(note.stageId !== undefined ? { stageId: note.stageId } : {}),
            title: note.content,
            status: "active",
            ...(note.reason !== undefined ? { summary: note.reason } : {}),
            sourceDescription: note.source.kind,
            ...(note.supersedesNoteId !== undefined ? { supersedesNoteId: note.supersedesNoteId } : {}),
        });
    }

    // 确定性排序：优先按 runId 升序，再按 category，再按 sourceRef
    entries.sort((a, b) => {
        if (a.runId !== b.runId) return a.runId.localeCompare(b.runId);
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.sourceRef.localeCompare(b.sourceRef);
    });

    return entries;
}

/**
 * 浏览 Goal 上下文目录。
 *
 * @param index - 已构建的 Goal 索引快照。
 * @param options - 包含游标、数量限制和类别过滤的可选参数。
 * @returns 稳定排序的有界条目列表及下一页游标。
 *
 * @example
 * ```ts
 * const result = executeDirectoryBrowse(index, { limit: 10 });
 * ```
 */
export function executeDirectoryBrowse(
    index: GoalContextIndexSnapshot,
    options?: {
        readonly cursor?: string;
        readonly limit?: number;
        readonly category?: string;
    },
): {
    readonly entries: readonly GoalContextDirectoryEntry[];
    readonly nextCursor?: string;
    readonly hasMore: boolean;
} {
    let all = extractDirectoryEntries(index);
    if (options?.category !== undefined && options.category !== "all") {
        all = all.filter((e) => e.category === options.category);
    }

    let offset = 0;
    if (options?.cursor !== undefined && options.cursor.trim().length > 0) {
        offset = decodeGoalContextCursor(options.cursor, index.sourceDigest);
    }

    const limit = Math.min(
        Math.max(1, options?.limit ?? DEFAULT_DIRECTORY_PAGE_LIMIT),
        MAX_DIRECTORY_PAGE_LIMIT,
    );

    const slice = all.slice(offset, offset + limit);
    const hasMore = offset + limit < all.length;
    const nextCursor = hasMore
        ? encodeGoalContextCursor(index.sourceDigest, offset + limit)
        : undefined;

    return {
        entries: Object.freeze(slice),
        ...(nextCursor !== undefined ? { nextCursor } : {}),
        hasMore,
    };
}

/**
 * 在 Goal 上下文目录中执行关键词检索。
 *
 * @param index - 已构建的 Goal 索引快照。
 * @param options - 包含检索词、游标与数量限制的参数。
 * @returns 匹配的目录条目列表与下一页游标。
 *
 * @example
 * ```ts
 * const result = executeDirectorySearch(index, { query: "JWT 鉴权" });
 * ```
 */
export function executeDirectorySearch(
    index: GoalContextIndexSnapshot,
    options: {
        readonly query: string;
        readonly cursor?: string;
        readonly limit?: number;
        readonly category?: string;
    },
): {
    readonly entries: readonly GoalContextDirectoryEntry[];
    readonly nextCursor?: string;
    readonly hasMore: boolean;
} {
    const rawQuery = options.query.trim().toLowerCase();
    if (rawQuery.length === 0) {
        throw new ContextLookupProtocolError("query must be non-empty for directory_search");
    }

    let all = extractDirectoryEntries(index);
    if (options.category !== undefined && options.category !== "all") {
        all = all.filter((e) => e.category === options.category);
    }

    const queryTokens = rawQuery.split(/\s+/).filter(Boolean);
    const matched = all.filter((entry) => {
        const textToSearch = `${entry.title} ${entry.summary ?? ""} ${entry.stageId ?? ""}`.toLowerCase();
        return queryTokens.some((token) => textToSearch.includes(token));
    });

    let offset = 0;
    if (options.cursor !== undefined && options.cursor.trim().length > 0) {
        offset = decodeGoalContextCursor(options.cursor, index.sourceDigest);
    }

    const limit = Math.min(
        Math.max(1, options.limit ?? DEFAULT_DIRECTORY_PAGE_LIMIT),
        MAX_DIRECTORY_PAGE_LIMIT,
    );

    const slice = matched.slice(offset, offset + limit);
    const hasMore = offset + limit < matched.length;
    const nextCursor = hasMore
        ? encodeGoalContextCursor(index.sourceDigest, offset + limit)
        : undefined;

    return {
        entries: Object.freeze(slice),
        ...(nextCursor !== undefined ? { nextCursor } : {}),
        hasMore,
    };
}

/**
 * 直接展开可验证来源引用的详情内容。
 *
 * @remarks
 * 支持直接展开阶段、重要信息记录、消息和事件；受来源边界严格约束。
 * 不执行任何文件操作或业务工具，非法或越界引用将明确抛出异常。
 *
 * @param index - 已构建的 Goal 索引快照。
 * @param envelope - 包含权威边界与事实的输入信封。
 * @param options - 包含引用标识、偏移量与长度限制的参数。
 * @returns 展开的详情正文、截断标记与总长度。
 *
 * @example
 * ```ts
 * const expanded = executeSourceExpand(index, envelope, { sourceRef: "stage:run-1:stage-1" });
 * ```
 */
export function executeSourceExpand(
    index: GoalContextIndexSnapshot,
    envelope: GoalSourceEnvelope,
    options: {
        readonly sourceRef: string;
        readonly offset?: number;
        readonly limit?: number;
    },
): GoalContextExpandedSource {
    const ref = options.sourceRef.trim();
    if (ref.length === 0) {
        throw new ContextLookupProtocolError("sourceRef must be non-empty");
    }

    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.min(
        Math.max(1, options.limit ?? DEFAULT_EXPAND_CHAR_LIMIT),
        MAX_EXPAND_CHAR_LIMIT,
    );

    // 格式合法性校验：仅允许 stage:, note:, event:, message:
    if (
        !ref.startsWith("stage:")
        && !ref.startsWith("note:")
        && !ref.startsWith("event:")
        && !ref.startsWith("message:")
    ) {
        throw new ContextLookupProtocolError(`Invalid sourceRef format: ${ref}`);
    }

    const boundaryByRun = new Map<string, number>();
    for (const run of envelope.runs) {
        boundaryByRun.set(run.runId, run.committedThroughSequence);
    }

    // 1. 阶段展开: stage:<runId>:<stageId>
    if (ref.startsWith("stage:")) {
        const parts = ref.split(":");
        if (parts.length !== 3) {
            throw new ContextLookupProtocolError(`Invalid stage sourceRef format: ${ref}`);
        }
        const runId = parts[1]!;
        const stageId = parts[2]!;

        if (!boundaryByRun.has(runId)) {
            throw new ContextLookupProtocolError(`runId not in source boundaries: ${runId}`);
        }

        const stage = index.stages.find(
            (s) => s.runId === runId && s.stageId === stageId,
        );
        if (stage === undefined) {
            throw new ContextLookupProtocolError(`Stage not found: ${ref}`);
        }

        const fullContent = [
            `Stage ID: ${stage.stageId} (Run: ${stage.runId}, Revision: ${stage.revision})`,
            `Target: ${stage.target}`,
            `Status: ${stage.status}`,
            `Acceptance Criteria:`,
            ...stage.acceptanceCriteria.map((c) => `  - ${c}`),
            ...(stage.summary ? [`Summary: ${stage.summary}`] : []),
            ...(stage.rejectionFeedback ? [`Rejection Feedback: ${stage.rejectionFeedback}`] : []),
            ...(stage.reason ? [`Revision Reason: ${stage.reason}`] : []),
            `Source Sequences: ${stage.source.firstSequence} - ${stage.source.lastSequence}`,
        ].join("\n");

        const slice = fullContent.slice(offset, offset + limit);
        const truncated = offset + limit < fullContent.length;

        return {
            sourceRef: ref,
            kind: "stage",
            runId: stage.runId,
            title: stage.target,
            content: slice,
            status: stage.status,
            truncated,
            ...(truncated ? { nextOffset: offset + limit } : {}),
            totalLength: fullContent.length,
            metadata: {
                stageId: stage.stageId,
                revision: stage.revision,
                firstSequence: stage.source.firstSequence,
                lastSequence: stage.source.lastSequence,
            },
        };
    }

    // 2. 重要信息展开: note:<noteId> 或 note:<runId>:<noteId>
    if (ref.startsWith("note:")) {
        const parts = ref.split(":");
        let note: typeof index.notes[number] | undefined;
        if (parts.length === 3) {
            const runId = parts[1]!;
            const noteId = parts[2]!;
            note = index.notes.find((n) => n.runId === runId && n.noteId === noteId);
        } else if (parts.length === 2) {
            const noteId = parts[1]!;
            note = index.notes.find((n) => n.noteId === noteId);
        } else {
            throw new ContextLookupProtocolError(`Invalid note sourceRef format: ${ref}`);
        }
        if (note === undefined) {
            throw new ContextLookupProtocolError(`Note not found: ${ref}`);
        }

        if (!boundaryByRun.has(note.runId)) {
            throw new ContextLookupProtocolError(`runId not in source boundaries: ${note.runId}`);
        }

        const fullContent = [
            `Note ID: ${note.noteId} (Category: ${note.category}, Revision: ${note.revision})`,
            `Content: ${note.content}`,
            ...(note.reason ? [`Reason: ${note.reason}`] : []),
            ...(note.stageId ? [`Stage: ${note.stageId}`] : []),
            `Source Kind: ${note.source.kind}`,
            ...(note.supersedesNoteId ? [`Supersedes: ${note.supersedesNoteId}`] : []),
        ].join("\n");

        const slice = fullContent.slice(offset, offset + limit);
        const truncated = offset + limit < fullContent.length;

        return {
            sourceRef: ref,
            kind: "note",
            runId: note.runId,
            title: note.content,
            content: slice,
            status: "active",
            truncated,
            ...(truncated ? { nextOffset: offset + limit } : {}),
            totalLength: fullContent.length,
            metadata: {
                noteId: note.noteId,
                category: note.category,
                revision: note.revision,
            },
        };
    }

    // 3. 事件展开: event:<runId>:<sequence>
    if (ref.startsWith("event:")) {
        const parts = ref.split(":");
        if (parts.length !== 3) {
            throw new ContextLookupProtocolError(`Invalid event sourceRef format: ${ref}`);
        }
        const runId = parts[1]!;
        const seq = Number.parseInt(parts[2]!, 10);
        if (!Number.isSafeInteger(seq) || seq < 0) {
            throw new ContextLookupProtocolError(`Invalid sequence in event sourceRef: ${ref}`);
        }

        const maxCommitted = boundaryByRun.get(runId);
        if (maxCommitted === undefined) {
            throw new ContextLookupProtocolError(`runId not in source boundaries: ${runId}`);
        }
        if (seq > maxCommitted) {
            throw new ContextLookupProtocolError(
                `Sequence out of committed boundary: ${seq} > ${maxCommitted}`,
            );
        }

        const events = envelope.eventsByRun.get(runId) ?? [];
        const event = events.find((e) => e.sequence === seq);
        if (event === undefined) {
            throw new ContextLookupProtocolError(`Event not found: ${ref}`);
        }

        let fullContent = "";
        const payload = event.payload as any;
        if (payload?.observation !== undefined && typeof payload.observation === "string") {
            fullContent = payload.observation;
        } else {
            fullContent = JSON.stringify(event.payload, null, 2);
        }

        const slice = fullContent.slice(offset, offset + limit);
        const truncated = offset + limit < fullContent.length;

        return {
            sourceRef: ref,
            kind: "event",
            runId,
            title: `Event ${event.sequence} (${event.eventType})`,
            content: slice,
            status: "committed",
            truncated,
            ...(truncated ? { nextOffset: offset + limit } : {}),
            totalLength: fullContent.length,
            metadata: {
                eventType: event.eventType,
                sequence: event.sequence,
                eventId: event.eventId,
            },
        };
    }

    // 4. 消息展开: message:<messageIndex>
    if (ref.startsWith("message:")) {
        const parts = ref.split(":");
        if (parts.length !== 2) {
            throw new ContextLookupProtocolError(`Invalid message sourceRef format: ${ref}`);
        }
        const msgIdx = Number.parseInt(parts[1]!, 10);
        if (!Number.isSafeInteger(msgIdx) || msgIdx < 0) {
            throw new ContextLookupProtocolError(`Invalid messageIndex in sourceRef: ${ref}`);
        }

        const msg = envelope.messages.find((m) => m.messageIndex === msgIdx);
        if (msg === undefined) {
            throw new ContextLookupProtocolError(`Message not found: ${ref}`);
        }

        const fullContent = msg.content ?? `Message [${msg.messageIndex}] (${msg.role}): Content Hash ${msg.contentHash}`;
        const slice = fullContent.slice(offset, offset + limit);
        const truncated = offset + limit < fullContent.length;

        return {
            sourceRef: ref,
            kind: "message",
            title: `Message ${msg.messageIndex} (${msg.role})`,
            content: slice,
            status: "committed",
            truncated,
            ...(truncated ? { nextOffset: offset + limit } : {}),
            totalLength: fullContent.length,
            metadata: {
                messageIndex: msg.messageIndex,
                role: msg.role,
                contentHash: msg.contentHash,
            },
        };
    }

    throw new ContextLookupProtocolError(`Unsupported sourceRef kind: ${ref}`);
}
