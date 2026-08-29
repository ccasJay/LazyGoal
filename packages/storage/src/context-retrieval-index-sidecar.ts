import {
    chmod,
    mkdir,
    open,
    readFile,
    rename,
    unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";

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
} from "../../runtime/src/index";

/** Retrieval Index Sidecar 文件协议错误代码。 */
export const CONTEXT_RETRIEVAL_INDEX_SIDECAR_PROTOCOL_ERROR_CODE =
    "CONTEXT_RETRIEVAL_INDEX_SIDECAR_PROTOCOL_ERROR" as const;

const ContextDocumentFieldsSchema = z.object({
    eventType: z.array(z.string().trim().min(1)),
    toolId: z.array(z.string().trim().min(1)),
    actionId: z.array(z.string().trim().min(1)),
    stepIndex: z.array(z.number().int().positive().safe()),
    path: z.array(z.string().trim().min(1)),
    errorCode: z.array(z.string().trim().min(1)),
    objectId: z.array(z.string().trim().min(1)),
    body: z.string(),
}).strict();

const ContextSearchDocumentSchema = z.object({
    schemaVersion: z.literal(1),
    documentId: z.string().trim().min(1),
    goalId: z.string().trim().min(1),
    runId: z.string().trim().min(1),
    kind: z.enum(["execution", "preparation"]),
    phase: z.enum(["gathering_context", "planning", "executing"]),
    executionUnitId: z.string().trim().min(1).optional(),
    firstSequence: z.number().int().positive().safe(),
    lastSequence: z.number().int().positive().safe(),
    sourceRange: z.object({
        firstSequence: z.number().int().positive().safe(),
        lastSequence: z.number().int().positive().safe(),
    }).strict(),
    sourceEventIds: z.array(z.string().trim().min(1)),
    fields: ContextDocumentFieldsSchema,
    body: z.string(),
    eventTypes: z.array(z.string().trim().min(1)),
    toolIds: z.array(z.string().trim().min(1)),
    actionIds: z.array(z.string().trim().min(1)),
    stepIndexes: z.array(z.number().int().positive().safe()),
    paths: z.array(z.string().trim().min(1)),
    errorCodes: z.array(z.string().trim().min(1)),
    objectIds: z.array(z.string().trim().min(1)),
}).strict();

const ContextTokenSchema = z.object({
    value: z.string().trim().min(1),
    raw: z.string().min(1),
    kind: z.enum(["exact", "split"]),
}).strict();

const TokenizedFieldSchema = z.object({
    tokens: z.array(ContextTokenSchema),
    length: z.number().int().nonnegative().safe(),
}).strict();

const TokenizedDocumentSchema = z.object({
    schemaVersion: z.literal(1),
    tokenizerVersion: z.literal(CONTEXT_TOKENIZER_VERSION),
    documentId: z.string().trim().min(1),
    fields: z.record(z.string(), TokenizedFieldSchema),
    fieldLengths: z.record(z.string(), z.number().int().nonnegative().safe()),
}).strict();

const PostingSchema = z.object({
    documentId: z.string().trim().min(1),
    termFrequency: z.number().int().positive().safe(),
    exactFrequency: z.number().int().nonnegative().safe(),
    splitFrequency: z.number().int().nonnegative().safe(),
}).strict();

const FieldStatisticsSchema = z.object({
    totalTokenCount: z.number().int().nonnegative().safe(),
    averageFieldLength: z.number().nonnegative().finite(),
    documentFrequency: z.record(
        z.string().trim().min(1),
        z.number().int().positive().safe(),
    ),
}).strict();

const ContextRetrievalIndexSnapshotSchema = z.object({
    schemaVersion: z.literal(1),
    tokenizerVersion: z.literal(CONTEXT_TOKENIZER_VERSION),
    documentIds: z.array(z.string().trim().min(1)),
    tokenizedDocuments: z.record(z.string().trim().min(1), TokenizedDocumentSchema),
    postings: z.record(
        z.string().trim().min(1),
        z.record(z.string().trim().min(1), z.array(PostingSchema)),
    ),
    fieldStats: z.record(z.string().trim().min(1), FieldStatisticsSchema),
}).strict();

const ContextLookupFiltersSchema = z.object({
    eventTypes: z.array(z.string().trim().min(1)).max(16).optional(),
    toolIds: z.array(z.string().trim().min(1)).max(16).optional(),
    actionIds: z.array(z.string().trim().min(1)).max(16).optional(),
    stepIndexes: z.array(z.number().int().positive().safe()).max(16).optional(),
    paths: z.array(z.string().trim().min(1)).max(16).optional(),
    errorCodes: z.array(z.string().trim().min(1)).max(16).optional(),
    objectIds: z.array(z.string().trim().min(1)).max(16).optional(),
    sequenceRange: z.object({
        from: z.number().int().positive().safe(),
        to: z.number().int().positive().safe(),
    }).strict().optional(),
}).strict();

const ContextLookupMatchSchema = z.object({
    documentId: z.string().trim().min(1),
    goalId: z.string().trim().min(1),
    runId: z.string().trim().min(1),
    firstSequence: z.number().int().positive().safe(),
    lastSequence: z.number().int().positive().safe(),
    matchedFields: z.array(z.enum([
        "eventType",
        "toolId",
        "actionId",
        "stepIndex",
        "path",
        "errorCode",
        "objectId",
        "body",
    ])),
    score: z.number().nonnegative().finite(),
    preview: z.string(),
    truncated: z.boolean(),
    adjacent: z.boolean().optional(),
    historical: z.literal(true),
    sourceEventIds: z.array(z.string().trim().min(1)),
}).strict();

const ContextLookupResultSchema = z.discriminatedUnion("status", [
    z.object({
        status: z.literal("found"),
        lookupId: z.string().trim().min(1),
        committedThroughSequence: z.number().int().nonnegative().safe(),
        queryHash: z.string().trim().min(1).optional(),
        indexVersion: z.string().trim().min(1).optional(),
        matches: z.array(ContextLookupMatchSchema),
        truncated: z.boolean(),
    }).strict(),
    z.object({
        status: z.literal("not_found"),
        lookupId: z.string().trim().min(1),
        committedThroughSequence: z.number().int().nonnegative().safe().optional(),
        reason: z.string().trim().min(1).optional(),
    }).strict(),
    z.object({
        status: z.literal("lookup_error"),
        lookupId: z.string().trim().min(1),
        code: z.string().trim().min(1),
        message: z.string().trim().min(1),
        committedThroughSequence: z.number().int().nonnegative().safe().optional(),
    }).strict(),
]);

const ContextRetrievalQueryCacheEntrySchema = z.object({
    key: z.string().regex(/^[0-9a-f]{64}$/),
    question: z.string().trim().min(1),
    filters: ContextLookupFiltersSchema.optional(),
    committedThroughSequence: z.number().int().nonnegative().safe(),
    indexVersion: z.string().trim().min(1),
    result: ContextLookupResultSchema,
}).strict();

/** Retrieval Index Sidecar 的严格 JSON Schema。 */
export const ContextRetrievalIndexSidecarSchema = z.object({
    schemaVersion: z.literal(CONTEXT_RETRIEVAL_INDEX_SIDECAR_SCHEMA_VERSION),
    goalId: z.string().trim().min(1),
    runId: z.string().trim().min(1),
    derivedThroughSequence: z.number().int().nonnegative().safe(),
    sourceDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    tokenizerVersion: z.literal(CONTEXT_TOKENIZER_VERSION),
    rankingVersion: z.string().trim().min(1),
    indexVersion: z.string().trim().min(1),
    documents: z.array(ContextSearchDocumentSchema),
    index: ContextRetrievalIndexSnapshotSchema,
    queryCache: z.array(ContextRetrievalQueryCacheEntrySchema)
        .max(CONTEXT_RETRIEVAL_QUERY_CACHE_CAPACITY),
}).strict();

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

/** Sidecar Codec 的短别名。 */
export const retrievalIndexSidecarCodec = contextRetrievalIndexSidecarCodec;

/**
 * 基于 JSON 文件的 Retrieval Index Sidecar Store。
 *
 * @remarks
 * 文件位于 `<directory>/<base64url(goalId)>/<base64url(runId)>/retrieval-v1.json`。
 * 保存使用同目录临时文件、fsync 和 rename，目录为 `0700`、文件为 `0600`。缺失、
 * 损坏、版本/摘要失配或领先 Snapshot 的缓存统一返回 `undefined`；不会修改
 * Goal、Trajectory 或 Working Memory。
 *
 * @example
 * ```ts
 * const store = new JsonFileContextRetrievalIndexStore(".lazygoal/context-sidecars");
 * const sidecar = await store.restore("goal-1", "run-1", {
 *     committedThroughSequence: 42,
 *     indexVersion: CONTEXT_RETRIEVAL_INDEX_VERSION,
 * });
 * ```
 */
export class JsonFileContextRetrievalIndexStore implements TrajectoryRetrievalIndexStore {
    /** @param directory - Sidecar 根目录；保存时按需创建。 */
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
        return sidecar;
    }

    /** @inheritdoc */
    async save(sidecar: ContextRetrievalIndexSidecar): Promise<void> {
        const validated = contextRetrievalIndexSidecarCodec.encode(sidecar);
        const goalDirectory = join(this.directory, this.encodeIdentifier(validated.goalId));
        const runDirectory = join(goalDirectory, this.encodeIdentifier(validated.runId));
        const filePath = join(runDirectory, "retrieval-v1.json");
        const temporaryPath = `${filePath}.${randomUUID()}.tmp`;

        await mkdir(runDirectory, { recursive: true, mode: 0o700 });
        await chmod(goalDirectory, 0o700);
        await chmod(runDirectory, 0o700);
        try {
            const handle = await open(temporaryPath, "wx", 0o600);
            try {
                await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
                await handle.sync();
            } finally {
                await handle.close();
            }
            await chmod(temporaryPath, 0o600);
            await rename(temporaryPath, filePath);
        } catch (error) {
            await unlink(temporaryPath).catch(() => undefined);
            throw error;
        }
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
        return join(
            this.directory,
            this.encodeIdentifier(goalId),
            this.encodeIdentifier(runId),
            "retrieval-v1.json",
        );
    }

    private encodeIdentifier(value: string): string {
        this.assertIdentifier(value, "sidecar identifier");
        return Buffer.from(value, "utf8").toString("base64url");
    }

    private assertIdentifier(value: string, field: string): void {
        if (typeof value !== "string" || value.trim().length === 0) {
            throw new ContextRetrievalIndexSidecarProtocolError(`${field} must be a non-empty string`);
        }
    }
}

/** 简短兼容别名，便于组合根按 Retrieval Index 命名。 */
export const JsonFileRetrievalIndexStore = JsonFileContextRetrievalIndexStore;

/** Sidecar 后缀别名，便于组合根显式区分缓存实现。 */
export const JsonFileRetrievalIndexSidecarStore = JsonFileContextRetrievalIndexStore;

function validateAndFreeze(input: unknown): Readonly<ContextRetrievalIndexSidecar> {
    const parsed = ContextRetrievalIndexSidecarSchema.safeParse(input);
    if (!parsed.success) {
        throw new ContextRetrievalIndexSidecarProtocolError(
            "Retrieval Index Sidecar does not match schema version 1",
            { cause: parsed.error },
        );
    }
    const sidecar = parsed.data as unknown as ContextRetrievalIndexSidecar;
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
            || document.lastSequence > sidecar.derivedThroughSequence
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
    ] as const) {
        if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
            throw new ContextRetrievalIndexSidecarProtocolError(`${field} must be a non-empty string`);
        }
    }
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
    if (typeof value !== "object" || value === null || seen.has(value as object)) return value;
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
    return Object.freeze(value);
}

function isMissingFile(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
