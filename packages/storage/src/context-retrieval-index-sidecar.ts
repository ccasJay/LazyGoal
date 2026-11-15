import { deepFreeze } from "../../contracts/src/index";
import {
    readFile,
    unlink,
} from "node:fs/promises";
import { retrievalIndexPath } from "./goal-workspace-layout";

import {
    CONTEXT_RETRIEVAL_INDEX_VERSION,
    CONTEXT_RETRIEVAL_INDEX_SIDECAR_SCHEMA_VERSION,
    CONTEXT_RETRIEVAL_QUERY_CACHE_CAPACITY,
    CONTEXT_TOKENIZER_VERSION,
    ContextRetrievalIndexError,
    ContextRetrievalQueryCache,
    restoreContextInvertedIndex,
    type ContextRetrievalIndexSidecar,
    type ContextRetrievalIndexRestoreOptions,
    type ContextRetrievalQueryCacheEntry,
    type TrajectoryRetrievalIndexStore,
} from "../../context-retrieval/src/index";
import { contextRetrievalIndexSidecarFileBinding } from "./generated/context-retrieval-index-sidecar-binding";
import { atomicWriteJson } from "./json-file-write";

/** Retrieval Index Sidecar 文件协议错误代码。 */
export const CONTEXT_RETRIEVAL_INDEX_SIDECAR_PROTOCOL_ERROR_CODE =
    "CONTEXT_RETRIEVAL_INDEX_SIDECAR_PROTOCOL_ERROR" as const;

/** Retrieval Index Sidecar 结构损坏或协议失配时抛出的错误。 */
export class ContextRetrievalIndexSidecarProtocolError extends Error {
    /** 稳定错误代码。 */
    readonly code = CONTEXT_RETRIEVAL_INDEX_SIDECAR_PROTOCOL_ERROR_CODE;

    /** @param message - 不包含完整文档正文的稳定诊断。 */
    constructor(message: string, options?: { readonly cause?: unknown }) {
        super(`${CONTEXT_RETRIEVAL_INDEX_SIDECAR_PROTOCOL_ERROR_CODE}: ${message}`, options);
        this.name = "ContextRetrievalIndexSidecarProtocolError";
    }
}

/** Retrieval Index Sidecar 的编解码边界。 */
export interface ContextRetrievalIndexSidecarCodec {
    /**
     * @param sidecar - 已构建的派生索引 Sidecar。
     * @returns 已校验且不共享输入引用的冻结副本。
     * @throws ContextRetrievalIndexSidecarProtocolError 当协议非法时。
     */
    encode(sidecar: ContextRetrievalIndexSidecar): Readonly<ContextRetrievalIndexSidecar>;

    /**
     * @param input - 文件 JSON 解析后的未知值。
     * @returns 已校验且深冻结的 Sidecar。
     * @throws ContextRetrievalIndexSidecarProtocolError 当 JSON 或索引统计非法时。
     */
    decode(input: unknown): Readonly<ContextRetrievalIndexSidecar>;
}

/** 默认 Retrieval Index Sidecar Codec。 */
export const contextRetrievalIndexSidecarCodec: ContextRetrievalIndexSidecarCodec = Object.freeze({
    encode(sidecar: ContextRetrievalIndexSidecar): Readonly<ContextRetrievalIndexSidecar> {
        return validateAndFreeze(sidecar);
    },
    decode(input: unknown): Readonly<ContextRetrievalIndexSidecar> {
        return validateAndFreeze(input);
    },
});

/**
 * 基于 JSON 文件的 Retrieval Index Sidecar Store。
 *
 * @remarks
 * 文件位于 `<directory>/<base64url(goalId)>/indexes/retrieval/<base64url(runId)>.json`。
 * 保存使用同目录临时文件、fsync 和 rename，目录为 `0700`、文件为 `0600`。缺失、
 * 损坏、版本/摘要失配或领先 Snapshot 的缓存统一返回 `undefined`；不会修改
 * Goal、Trajectory 或 Working Memory。
 *
 * @example
 * ```ts
 * const store = new JsonFileContextRetrievalIndexStore("~/.lazygoal/workspaces/<workspace-id>/goals");
 * const sidecar = await store.restore("goal-1", "run-1", {
 *     committedThroughSequence: 42,
 *     indexVersion: CONTEXT_RETRIEVAL_INDEX_VERSION,
 * });
 * ```
 */
export class JsonFileContextRetrievalIndexStore implements TrajectoryRetrievalIndexStore {
    /** @param directory - 工作区 Goal 存储根目录；保存时按需创建索引目录。 */
    constructor(private readonly directory: string) {}

    /** @inheritdoc */
    async restore(
        goalId: string,
        runId: string,
        options: ContextRetrievalIndexRestoreOptions = {},
    ): Promise<ContextRetrievalIndexSidecar | undefined> {
        this.assertIdentifier(goalId, "goalId");
        this.assertIdentifier(runId, "runId");
        validateRestoreOptions(options);
        let content: string;
        try {
            content = await readFile(this.filePath(goalId, runId), "utf8");
        } catch (error) {
            if (isMissingFile(error)) return undefined;
            return undefined;
        }

        let sidecar: Readonly<ContextRetrievalIndexSidecar>;
        try {
            sidecar = contextRetrievalIndexSidecarCodec.decode(JSON.parse(content));
        } catch {
            return undefined;
        }
        if (sidecar.goalId !== goalId || sidecar.runId !== runId) return undefined;
        if (
            options.committedThroughSequence !== undefined
            && sidecar.derivedThroughSequence > options.committedThroughSequence
        ) return undefined;
        if (
            options.tokenizerVersion !== undefined
            && sidecar.tokenizerVersion !== options.tokenizerVersion
        ) return undefined;
        if (
            options.rankingVersion !== undefined
            && sidecar.rankingVersion !== options.rankingVersion
        ) return undefined;
        if (
            options.indexVersion !== undefined
            && sidecar.indexVersion !== options.indexVersion
        ) return undefined;
        if (
            options.expectedSourceDigest !== undefined
            && (options.committedThroughSequence === undefined
                || sidecar.derivedThroughSequence === options.committedThroughSequence)
            && sidecar.sourceDigest !== options.expectedSourceDigest
        ) return undefined;
        if (
            options.conversationEndIndexExclusive !== undefined
            && sidecar.conversationEndIndexExclusive !== options.conversationEndIndexExclusive
        ) return undefined;
        if (
            options.conversationPrefixDigest !== undefined
            && sidecar.conversationPrefixDigest !== options.conversationPrefixDigest
        ) return undefined;
        return sidecar;
    }

    /** @inheritdoc */
    async save(sidecar: ContextRetrievalIndexSidecar): Promise<void> {
        const validated = contextRetrievalIndexSidecarCodec.encode(sidecar);
        const filePath = this.filePath(validated.goalId, validated.runId);

        await atomicWriteJson({
            path: filePath,
            value: validated,
            indent: 2,
            trailingNewline: true,
            durable: true,
        });
    }

    /** @inheritdoc */
    async remove(goalId: string, runId: string): Promise<void> {
        this.assertIdentifier(goalId, "goalId");
        this.assertIdentifier(runId, "runId");
        try {
            await unlink(this.filePath(goalId, runId));
        } catch (error) {
            if (!isMissingFile(error)) throw error;
        }
    }

    private filePath(goalId: string, runId: string): string {
        return retrievalIndexPath(this.directory, goalId, runId);
    }

    private assertIdentifier(value: string, field: string): void {
        if (typeof value !== "string" || value.trim().length === 0) {
            throw new ContextRetrievalIndexSidecarProtocolError(`${field} must be a non-empty string`);
        }
    }
}

function validateAndFreeze(input: unknown): Readonly<ContextRetrievalIndexSidecar> {
    const parsed = contextRetrievalIndexSidecarFileBinding.read(input, "reject");
    if (!parsed.ok) {
        throw new ContextRetrievalIndexSidecarProtocolError(
            "Retrieval Index Sidecar does not match schema version 1",
            { cause: parsed.issues },
        );
    }
    const sidecar = parsed.data as unknown as ContextRetrievalIndexSidecar;
    if (sidecar.queryCache.length > 64) {
        throw new ContextRetrievalIndexSidecarProtocolError("query cache exceeds its fixed capacity");
    }
    if (
        sidecar.rankingVersion !== CONTEXT_RETRIEVAL_INDEX_VERSION
        || sidecar.indexVersion !== CONTEXT_RETRIEVAL_INDEX_VERSION
    ) {
        throw new ContextRetrievalIndexSidecarProtocolError("unsupported ranking or index version");
    }
    if (sidecar.index.documentIds.length !== sidecar.documents.length) {
        throw new ContextRetrievalIndexSidecarProtocolError(
            "index document count does not match Sidecar documents",
        );
    }
    const documentIds = new Set<string>();
    const sourceEventIds = new Set<string>();
    for (const document of sidecar.documents) {
        if (document.goalId !== sidecar.goalId || document.runId !== sidecar.runId) {
            throw new ContextRetrievalIndexSidecarProtocolError("document identity does not match Sidecar");
        }
        if (
            document.firstSequence > document.lastSequence
            || document.sourceRange.firstSequence !== document.firstSequence
            || document.sourceRange.lastSequence !== document.lastSequence
            || (document.source?.kind !== "conversation"
                && document.lastSequence > sidecar.derivedThroughSequence)
            || document.sourceEventIds.length === 0
        ) {
            throw new ContextRetrievalIndexSidecarProtocolError("document sequence range is invalid");
        }
        if (documentIds.has(document.documentId)) {
            throw new ContextRetrievalIndexSidecarProtocolError("Sidecar contains duplicate document IDs");
        }
        documentIds.add(document.documentId);
        for (const eventId of document.sourceEventIds) {
            if (sourceEventIds.has(eventId)) {
                throw new ContextRetrievalIndexSidecarProtocolError("Sidecar contains duplicate source event IDs");
            }
            sourceEventIds.add(eventId);
        }
    }
    if (
        sidecar.index.documentIds.some((documentId) => !documentIds.has(documentId))
        || new Set(sidecar.index.documentIds).size !== sidecar.index.documentIds.length
    ) {
        throw new ContextRetrievalIndexSidecarProtocolError("index document IDs do not match documents");
    }
    try {
        restoreContextInvertedIndex(sidecar);
        new ContextRetrievalQueryCache(sidecar.queryCache as readonly ContextRetrievalQueryCacheEntry[]);
    } catch (error) {
        throw new ContextRetrievalIndexSidecarProtocolError(
            "Retrieval Index Sidecar index or query cache is invalid",
            { cause: error instanceof ContextRetrievalIndexError ? error : error },
        );
    }
    return deepFreeze(structuredClone(sidecar));
}

function validateRestoreOptions(options: ContextRetrievalIndexRestoreOptions): void {
    if (
        options.committedThroughSequence !== undefined
        && (!Number.isSafeInteger(options.committedThroughSequence)
            || options.committedThroughSequence < 0)
    ) {
        throw new ContextRetrievalIndexSidecarProtocolError(
            "committedThroughSequence must be a non-negative safe integer",
        );
    }
    for (const [value, field] of [
        [options.tokenizerVersion, "tokenizerVersion"],
        [options.rankingVersion, "rankingVersion"],
        [options.indexVersion, "indexVersion"],
        [options.expectedSourceDigest, "expectedSourceDigest"],
        [options.conversationPrefixDigest, "conversationPrefixDigest"],
    ] as const) {
        if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
            throw new ContextRetrievalIndexSidecarProtocolError(`${field} must be a non-empty string`);
        }
    }
    if (
        options.conversationEndIndexExclusive !== undefined
        && (!Number.isSafeInteger(options.conversationEndIndexExclusive)
            || options.conversationEndIndexExclusive < 0)
    ) {
        throw new ContextRetrievalIndexSidecarProtocolError(
            "conversationEndIndexExclusive must be a non-negative safe integer",
        );
    }
}

function isMissingFile(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
