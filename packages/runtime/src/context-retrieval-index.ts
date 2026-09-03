import { createHash } from "node:crypto";

import {
    ContextDocumentBuilder,
    type ContextDocumentFieldName,
    type ContextSearchDocument,
} from "./context-document";
import {
    buildContextInvertedIndex,
    CONTEXT_INVERTED_INDEX_SCHEMA_VERSION,
    CONTEXT_TOKENIZER_VERSION,
    type ContextFieldStatistics,
    type ContextIndexPosting,
    type ContextInvertedIndex,
    type TokenizedContextDocument,
} from "./context-tokenizer";
import {
    CONTEXT_RANKING_VERSION,
} from "./context-ranking";
import {
    normalizeContextLookupRequest,
    validateContextLookupResult,
    type ContextLookupFilters,
    type ContextLookupNeed,
    type ContextLookupResult,
} from "./context-retrieval";
import type { TrajectoryEvent } from "./trajectory";
import type { GoalMessage } from "./domain";
import { buildConversationContextDocuments, computeConversationPrefixDigest } from "./conversation-context-document";

/** Retrieval Index Sidecar 的持久化 Schema 版本。 */
export const CONTEXT_RETRIEVAL_INDEX_SIDECAR_SCHEMA_VERSION = 1 as const;

/** 当前 Conversation/Trajectory 联合索引的完整协议版本。 */
export const CONTEXT_RETRIEVAL_INDEX_VERSION = "fielded-bm25-lite-v1" as const;

/** 查询缓存的固定容量，避免检索缓存占用无界内存或 Sidecar 空间。 */
export const CONTEXT_RETRIEVAL_QUERY_CACHE_CAPACITY = 64 as const;

/** Retrieval Index 输入或 Sidecar 结构非法时使用的稳定错误代码。 */
export const CONTEXT_RETRIEVAL_INDEX_ERROR_CODE = "CONTEXT_RETRIEVAL_INDEX_ERROR" as const;

/** 索引 Sidecar 中不含函数的可序列化倒排索引快照。 */
export interface ContextRetrievalIndexSnapshot {
    /** 倒排索引 DTO Schema 版本。 */
    readonly schemaVersion: typeof CONTEXT_INVERTED_INDEX_SCHEMA_VERSION;
    /** 产生该索引的 Tokenizer 版本。 */
    readonly tokenizerVersion: typeof CONTEXT_TOKENIZER_VERSION;
    /** 稳定排序的文档 ID。 */
    readonly documentIds: readonly string[];
    /** 每个文档的 Token 化结果。 */
    readonly tokenizedDocuments: Readonly<Record<string, TokenizedContextDocument>>;
    /** 字段到词到 Posting 的倒排表。 */
    readonly postings: Readonly<Record<
        ContextDocumentFieldName,
        Readonly<Record<string, readonly ContextIndexPosting[]>>
    >>;
    /** 每个字段的 df 与长度统计。 */
    readonly fieldStats: Readonly<Record<ContextDocumentFieldName, ContextFieldStatistics>>;
}

/** 用于生成查询缓存键的规范化输入。 */
export interface ContextRetrievalQuery {
    /** 历史来源需求；不同来源必须使用不同缓存键。 */
    readonly need?: ContextLookupNeed;
    /** 查询文本；生成键时会执行同一请求协议的 trim 规范化。 */
    readonly question: string;
    /** 可选结构化过滤器。 */
    readonly filters?: ContextLookupFilters;
    /** 查询可观察的 Snapshot committed boundary。 */
    readonly committedThroughSequence: number;
    /** 查询使用的索引协议版本。 */
    readonly indexVersion: string;
}

/** Sidecar 中一个按 MRU 顺序排列的查询缓存条目。 */
export interface ContextRetrievalQueryCacheEntry {
    /** canonical query 的 SHA-256 十六进制键。 */
    readonly key: string;
    /** 生成结果时使用的历史来源需求。 */
    readonly need?: ContextLookupNeed;
    /** 规范化后的查询文本。 */
    readonly question: string;
    /** 规范化后的过滤器。 */
    readonly filters?: ContextLookupFilters;
    /** 生成结果时使用的 Snapshot boundary。 */
    readonly committedThroughSequence: number;
    /** 生成结果时使用的索引版本。 */
    readonly indexVersion: string;
    /** 已通过结果协议校验的查询结果。 */
    readonly result: ContextLookupResult;
}

/**
 * 可删除、可重建的 Retrieval Index Sidecar。
 *
 * @remarks
 * Sidecar 只缓存 committed Trajectory 的派生文档、倒排统计和查询结果；它不能
 * 领先 Snapshot boundary，也不能替代 Trajectory 或 Goal Snapshot。`sourceDigest`
 * 覆盖从 genesis 到 `derivedThroughSequence` 的 canonical 事件前缀。Sidecar 中
 * 的 `index` 不含运行时函数，恢复时必须重新挂接查询函数并验证其与 documents 等价。
 *
 * @example
 * ```ts
 * const sidecar: ContextRetrievalIndexSidecar = {
 *     schemaVersion: 1,
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     derivedThroughSequence: 42,
 *     sourceDigest: "sha256:...",
 *     tokenizerVersion: "field-tokenizer-v1",
 *     rankingVersion: "fielded-bm25-lite-v1",
 *     indexVersion: "fielded-bm25-lite-v1",
 *     documents: [],
 *     index: emptyIndexSnapshot(),
 *     queryCache: [],
 * };
 * ```
 */
export interface ContextRetrievalIndexSidecar {
    /** Sidecar JSON Schema 版本。 */
    readonly schemaVersion: typeof CONTEXT_RETRIEVAL_INDEX_SIDECAR_SCHEMA_VERSION;
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** Run 稳定标识。 */
    readonly runId: string;
    /** 已派生到的最大 committed sequence。 */
    readonly derivedThroughSequence: number;
    /** 对应 committed Trajectory 前缀的稳定摘要。 */
    readonly sourceDigest: string;
    /** 产生文档 Token 的版本。 */
    readonly tokenizerVersion: typeof CONTEXT_TOKENIZER_VERSION;
    /** 产生分数的排名版本。 */
    readonly rankingVersion: typeof CONTEXT_RANKING_VERSION;
    /** 查询键使用的完整索引版本。 */
    readonly indexVersion: typeof CONTEXT_RETRIEVAL_INDEX_VERSION;
    /** 与索引完全一致的 committed Context Documents。 */
    readonly documents: readonly ContextSearchDocument[];
    /** 不含函数的倒排表和统计快照。 */
    readonly index: ContextRetrievalIndexSnapshot;
    /** 最多 64 项、按 oldest → newest 排列的查询缓存。 */
    readonly queryCache: readonly ContextRetrievalQueryCacheEntry[];
    /** Conversation 归档覆盖的消息边界。 */
    readonly conversationEndIndexExclusive: number;
    /** Conversation prefix digest。 */
    readonly conversationPrefixDigest: string;
}

/** restore 时对 Sidecar 执行的边界、版本和摘要检查。 */
export interface ContextRetrievalIndexRestoreOptions {
    /** 当前 Goal Snapshot 的 committed boundary。 */
    readonly committedThroughSequence?: number;
    /** 期望的 Tokenizer 版本。 */
    readonly tokenizerVersion?: string;
    /** 期望的排名版本。 */
    readonly rankingVersion?: string;
    /** 期望的查询索引版本。 */
    readonly indexVersion?: string;
    /**
     * 已由调用方根据同一 Trajectory 前缀计算的摘要；仅当 Sidecar 正好位于
     * 当前 boundary 时由 Store 直接比较，落后 Sidecar 由 Runtime 校验其旧前缀。
     */
    readonly expectedSourceDigest?: string;
    /** 期望的 Conversation 归档边界；用于 Sidecar 失配检测。 */
    readonly conversationEndIndexExclusive?: number;
    /** 期望的 Conversation prefix digest；用于 Sidecar 失配检测。 */
    readonly conversationPrefixDigest?: string;
}

/**
 * Runtime 使用的 Retrieval Index Sidecar 持久化 Port。
 *
 * @remarks
 * Port 将索引缓存与 Goal Snapshot/Trajectory 解耦。`restore` 对缺失、损坏、版本
 * 不匹配或领先 Sidecar 返回 `undefined`；调用方随后必须从 committed Trajectory
 * 重建。`save` 只能在对应 Snapshot 成功提交后调用，Port 本身不提供并发锁。
 *
 * @example
 * ```ts
 * const sidecar = await store.restore("goal-1", "run-1", {
 *     committedThroughSequence: 42,
 *     indexVersion: CONTEXT_RETRIEVAL_INDEX_VERSION,
 * });
 * if (sidecar === undefined) rebuildFromTrajectory();
 * ```
 */
export interface TrajectoryRetrievalIndexStore {
    /**
     * @param goalId - Goal 稳定标识。
     * @param runId - Run 稳定标识。
     * @param options - 可选 boundary、版本和摘要校验。
     * @returns 通过协议校验的缓存；不可用时返回 `undefined`。
     * @throws 底层不可恢复存储错误；缓存损坏本身应转为 `undefined`。
     */
    restore(
        goalId: string,
        runId: string,
        options?: ContextRetrievalIndexRestoreOptions,
    ): Promise<ContextRetrievalIndexSidecar | undefined>;

    /**
     * @param sidecar - 已根据 committed Snapshot 构建的派生缓存。
     * @returns 原子保存完成后 resolve。
     * @throws Sidecar 协议非法或持久化失败时拒绝。
     */
    save(sidecar: ContextRetrievalIndexSidecar): Promise<void>;

    /**
     * @param goalId - Goal 稳定标识。
     * @param runId - Run 稳定标识。
     * @returns 删除完成后 resolve；缺失文件视为成功。
     * @throws 底层删除失败时拒绝。
     */
    remove(goalId: string, runId: string): Promise<void>;
}

/** 索引恢复/更新的输入。 */
export interface ContextRetrievalIndexSessionInput {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** Run 稳定标识。 */
    readonly runId: string;
    /** 当前 Snapshot committed boundary。 */
    readonly committedThroughSequence: number;
    /** Trajectory 事件，可包含 boundary 之后的 tail。 */
    readonly events: readonly TrajectoryEvent[];
    /** Snapshot Conversation，用于联合索引。 */
    readonly messages: readonly GoalMessage[];
    /** Conversation Cold 归档边界。 */
    readonly conversationStartIndex: number;
    /** 可选的已读取 Sidecar；无效时会自动重建。 */
    readonly sidecar?: ContextRetrievalIndexSidecar;
}

/** 索引 Session 使用 Sidecar 的方式。 */
export type ContextRetrievalIndexSessionMode = "rebuilt" | "incremental" | "restored";

/**
 * 一个边界固定的内存检索索引 Session。
 *
 * @remarks
 * Session 是即时缓存：它可以从 Sidecar 恢复或由 committed Trajectory 重建，结束
 * 后可直接丢弃。`incremental` 仅复用已验证的旧文档并加入新闭合文档；最终索引仍
 * 使用与全量重建相同的 deterministic Builder/Tokenizer，因此查询结果等价。
 *
 * @example
 * ```ts
 * const session = openContextRetrievalIndexSession({
 *     goalId, runId, committedThroughSequence, events, sidecar,
 * });
 * const matches = session.index.getPostings("path", "src/index.ts");
 * ```
 */
export interface ContextRetrievalIndexSession {
    /** 当前 committed boundary 的可查询倒排索引。 */
    readonly index: ContextInvertedIndex;
    /** 当前 Session 可持久化的完整 Sidecar。 */
    readonly sidecar: ContextRetrievalIndexSidecar;
    /** 当前边界、版本隔离后的查询缓存。 */
    readonly queryCache: ContextRetrievalQueryCache;
    /** 本次 Session 是重建、增量更新还是直接恢复。 */
    readonly mode: ContextRetrievalIndexSessionMode;
}

/** 索引输入非法时抛出的错误。 */
export class ContextRetrievalIndexError extends Error {
    /** 稳定错误代码。 */
    readonly code = CONTEXT_RETRIEVAL_INDEX_ERROR_CODE;

    /** @param message - 不包含完整事件正文的稳定诊断。 */
    constructor(message: string, options?: { readonly cause?: unknown }) {
        super(`${CONTEXT_RETRIEVAL_INDEX_ERROR_CODE}: ${message}`, options);
        this.name = "ContextRetrievalIndexError";
    }
}

/**
 * 计算 committed Trajectory 前缀的来源摘要。
 *
 * @param events - 按 sequence 升序排列的事件；可包含 boundary 之后的 tail。
 * @param throughSequence - 摘要包含的最大 sequence。
 * @returns `sha256:` 加前缀的稳定十六进制摘要。
 * @throws ContextRetrievalIndexError 当边界或事件顺序非法时。
 * @example
 * ```ts
 * const digest = computeContextRetrievalSourceDigest(events, 42);
 * ```
 */
export function computeContextRetrievalSourceDigest(
    events: readonly TrajectoryEvent[],
    throughSequence: number,
): string {
    assertNonNegativeSafeInteger(throughSequence, "throughSequence");
    if (!Array.isArray(events)) {
        throw new ContextRetrievalIndexError("events must be an array for source digest");
    }
    const committed: TrajectoryEvent[] = [];
    let previousSequence = 0;
    for (const event of events) {
        if (!isRecord(event)) {
            throw new ContextRetrievalIndexError("Trajectory event must be an object for source digest");
        }
        if (event.sequence > throughSequence) continue;
        if (!Number.isSafeInteger(event.sequence) || event.sequence <= previousSequence) {
            throw new ContextRetrievalIndexError(
                "Trajectory sequence must increase for source digest",
            );
        }
        previousSequence = event.sequence;
        committed.push(structuredClone(event as TrajectoryEvent));
    }
    return `sha256:${createHash("sha256")
        .update(canonicalJson(committed), "utf8")
        .digest("hex")}`;
}

/** 将带函数的 Runtime Index 转为可持久化快照。 */
export function snapshotContextInvertedIndex(
    index: ContextInvertedIndex,
): Readonly<ContextRetrievalIndexSnapshot> {
    assertIndexVersion(index);
    return deepFreeze({
        schemaVersion: index.schemaVersion,
        tokenizerVersion: index.tokenizerVersion,
        documentIds: structuredClone(index.documentIds),
        tokenizedDocuments: structuredClone(index.tokenizedDocuments),
        postings: structuredClone(index.postings),
        fieldStats: structuredClone(index.fieldStats),
    });
}

/**
 * 校验 Sidecar 中的索引快照并重新挂接 `getPostings` 函数。
 *
 * @param sidecar - 已通过基本 Codec 校验的 Sidecar。
 * @returns 与 Sidecar documents 等价的深度冻结 Runtime Index。
 * @throws ContextRetrievalIndexError 当统计、Posting 或文档不一致时。
 * @example
 * ```ts
 * const index = restoreContextInvertedIndex(sidecar);
 * ```
 */
export function restoreContextInvertedIndex(
    sidecar: Pick<ContextRetrievalIndexSidecar, "documents" | "index" | "tokenizerVersion" | "indexVersion">,
): Readonly<ContextInvertedIndex> {
    if (
        sidecar.tokenizerVersion !== CONTEXT_TOKENIZER_VERSION
        || sidecar.indexVersion !== CONTEXT_RETRIEVAL_INDEX_VERSION
    ) {
        throw new ContextRetrievalIndexError("Sidecar index version is unsupported");
    }
    let rebuilt: ContextInvertedIndex;
    try {
        rebuilt = buildContextInvertedIndex(sidecar.documents);
    } catch (error) {
        throw new ContextRetrievalIndexError("Sidecar documents cannot build an index", { cause: error });
    }
    const expected = snapshotContextInvertedIndex(rebuilt);
    if (canonicalJson(expected) !== canonicalJson(sidecar.index)) {
        throw new ContextRetrievalIndexError("Sidecar index statistics do not match documents");
    }
    return rebuilt;
}

/**
 * 计算 canonical query，并返回其 SHA-256 键。
 *
 * @param query - 问题、过滤器、committed boundary 和索引版本。
 * @returns 64 位小写十六进制 SHA-256；所有键字段都已纳入摘要。
 * @throws ContextRetrievalIndexError 当 query 或 boundary 非法时。
 * @example
 * ```ts
 * const key = createContextRetrievalQueryKey({
 *     question: "src/index.ts",
 *     committedThroughSequence: 42,
 *     indexVersion: CONTEXT_RETRIEVAL_INDEX_VERSION,
 * });
 * ```
 */
export function createContextRetrievalQueryKey(query: ContextRetrievalQuery): string {
    const normalized = normalizeContextRetrievalQuery(query);
    return createHash("sha256").update(canonicalJson({
        need: normalized.need,
        question: normalized.question,
        ...(normalized.filters === undefined ? {} : { filters: normalized.filters }),
        committedThroughSequence: normalized.committedThroughSequence,
        indexVersion: normalized.indexVersion,
    }), "utf8").digest("hex");
}

/** 返回不含 hash 的 canonical query，便于诊断和 Codec 复核。 */
export function canonicalizeContextRetrievalQuery(
    query: ContextRetrievalQuery,
): string {
    const normalized = normalizeContextRetrievalQuery(query);
    return canonicalJson({
        need: normalized.need,
        question: normalized.question,
        ...(normalized.filters === undefined ? {} : { filters: normalized.filters }),
        committedThroughSequence: normalized.committedThroughSequence,
        indexVersion: normalized.indexVersion,
    });
}

/**
 * 固定容量的确定性查询 LRU。
 *
 * @remarks
 * Map 顺序使用 oldest → newest；读取会把命中项移到末尾，写入超过 64 项时从
 * 头部淘汰。缓存条目必须包含同一 canonical query 的 key，且结果不能超过该
 * query 的 boundary。缓存是可丢弃的，删除或重建不会影响任何领域状态。
 *
 * @example
 * ```ts
 * const cache = new ContextRetrievalQueryCache();
 * cache.set(query, result);
 * const hit = cache.get(query);
 * ```
 */
export class ContextRetrievalQueryCache {
    private readonly entriesByKey = new Map<string, ContextRetrievalQueryCacheEntry>();

    /**
     * @param entries - 按 oldest → newest 恢复的 Sidecar 条目。
     * @throws ContextRetrievalIndexError 当条目重复、键失配或超过容量时。
     */
    constructor(entries: readonly ContextRetrievalQueryCacheEntry[] = []) {
        if (!Array.isArray(entries) || entries.length > CONTEXT_RETRIEVAL_QUERY_CACHE_CAPACITY) {
            throw new ContextRetrievalIndexError(
                `query cache must contain at most ${CONTEXT_RETRIEVAL_QUERY_CACHE_CAPACITY} entries`,
            );
        }
        for (const entry of entries) this.restoreEntry(entry);
    }

    /** 当前缓存条目数。 */
    get size(): number {
        return this.entriesByKey.size;
    }

    /**
     * @param query - 查询键输入。
     * @returns 命中的结果；boundary/version/query 任一不同都不会命中。
     */
    get(query: ContextRetrievalQuery): ContextLookupResult | undefined {
        const normalized = normalizeContextRetrievalQuery(query);
        const key = createContextRetrievalQueryKey(normalized);
        const entry = this.entriesByKey.get(key);
        if (entry === undefined) return undefined;
        this.entriesByKey.delete(key);
        this.entriesByKey.set(key, entry);
        return cloneLookupResult(entry.result);
    }

    /**
     * @param query - 查询键输入。
     * @param result - 该查询产生的已校验结果。
     * @returns 无返回值；过容量时淘汰最久未使用项。
     * @throws ContextRetrievalIndexError 当结果 boundary 领先 query 时。
     */
    set(query: ContextRetrievalQuery, result: ContextLookupResult): void {
        const normalized = normalizeContextRetrievalQuery(query);
        const validated = validateCacheResult(
            result,
            normalized.committedThroughSequence,
            normalized.indexVersion,
        );
        const key = createContextRetrievalQueryKey(normalized);
        this.entriesByKey.delete(key);
        this.entriesByKey.set(key, {
            key,
            ...(normalized.need === undefined ? {} : { need: normalized.need }),
            question: normalized.question,
            ...(normalized.filters === undefined ? {} : { filters: normalized.filters }),
            committedThroughSequence: normalized.committedThroughSequence,
            indexVersion: normalized.indexVersion,
            result: validated,
        });
        while (this.entriesByKey.size > CONTEXT_RETRIEVAL_QUERY_CACHE_CAPACITY) {
            const oldest = this.entriesByKey.keys().next().value as string | undefined;
            if (oldest === undefined) break;
            this.entriesByKey.delete(oldest);
        }
    }

    /**
     * @param query - 要删除的查询键；不存在时无副作用。
     * @returns 是否删除了一个条目。
     */
    delete(query: ContextRetrievalQuery): boolean {
        return this.entriesByKey.delete(createContextRetrievalQueryKey(query));
    }

    /** 清空全部可丢弃缓存，不影响索引或领域状态。 */
    clear(): void {
        this.entriesByKey.clear();
    }

    /**
     * @returns oldest → newest 的深冻结副本，可直接放入 Sidecar。
     */
    snapshot(): readonly ContextRetrievalQueryCacheEntry[] {
        return deepFreeze([...this.entriesByKey.values()].map((entry) => ({
            ...entry,
            ...(entry.filters === undefined ? {} : {
                filters: structuredClone(entry.filters),
            }),
            result: cloneLookupResult(entry.result),
        })));
    }

    private restoreEntry(entry: ContextRetrievalQueryCacheEntry): void {
        if (!isRecord(entry)) throw new ContextRetrievalIndexError("query cache entry must be an object");
        const normalized = normalizeContextRetrievalQuery(entry);
        const expectedKey = createContextRetrievalQueryKey(normalized);
        if (entry.key !== expectedKey) {
            throw new ContextRetrievalIndexError("query cache key does not match canonical query");
        }
        if (this.entriesByKey.has(entry.key)) {
            throw new ContextRetrievalIndexError("query cache contains duplicate keys");
        }
        const validated = validateCacheResult(
            entry.result,
            normalized.committedThroughSequence,
            normalized.indexVersion,
        );
        this.entriesByKey.set(entry.key, {
            key: entry.key,
            question: normalized.question,
            ...(normalized.filters === undefined ? {} : { filters: normalized.filters }),
            committedThroughSequence: normalized.committedThroughSequence,
            indexVersion: normalized.indexVersion,
            result: validated,
        });
    }
}

/**
 * 从 committed Trajectory 构建或增量恢复一个索引 Session。
 *
 * @remarks
 * Sidecar 必须先通过 Goal/Run、版本、derived boundary 和前缀摘要校验。有效但落后
 * 的 Sidecar 只复用其已完成文档，并从当前 committed 文档集合加入新闭合文档；
 * 无效 Sidecar、来源不一致或索引统计失配都会 fail-closed 重建。
 *
 * @param input - 当前边界、事件和可选 Sidecar。
 * @returns 可查询索引、当前 Sidecar、边界隔离的 LRU 及使用模式。
 * @throws ContextRetrievalIndexError 当 committed 来源或 Sidecar 结构无法验证。
 * @example
 * ```ts
 * const session = openContextRetrievalIndexSession({
 *     goalId, runId, committedThroughSequence, events, sidecar,
 * });
 * ```
 */
export function openContextRetrievalIndexSession(
    input: ContextRetrievalIndexSessionInput,
): Readonly<ContextRetrievalIndexSession> {
    validateSessionInput(input);
    const sourceDigest = computeContextRetrievalSourceDigest(
        input.events,
        input.committedThroughSequence,
    );
    const indexVersion = CONTEXT_RETRIEVAL_INDEX_VERSION;
    const conversationEndIndexExclusive = input.conversationStartIndex;
    const conversationPrefixDigest = computeConversationPrefixDigest(
        input.messages,
        conversationEndIndexExclusive,
    );
    const builderDocuments = buildDocuments(input);
    let mode: ContextRetrievalIndexSessionMode = "rebuilt";
    let documents = builderDocuments;
    let restoredCache: readonly ContextRetrievalQueryCacheEntry[] = [];

    const sidecar = input.sidecar;
    if (sidecar !== undefined && isUsableSidecar(sidecar, input, sourceDigest, indexVersion, conversationEndIndexExclusive, conversationPrefixDigest)) {
        try {
            restoreContextInvertedIndex(sidecar);
            if (sidecar.derivedThroughSequence === input.committedThroughSequence) {
                documents = sidecar.documents;
                mode = "restored";
            } else {
                documents = incrementDocuments(
                    sidecar.documents,
                    builderDocuments,
                    sidecar.derivedThroughSequence,
                );
                mode = "incremental";
            }
            restoredCache = sidecar.queryCache;
        } catch {
            mode = "rebuilt";
            documents = builderDocuments;
            restoredCache = [];
        }
    }

    const index = buildContextInvertedIndex(documents);
    const queryCache = filterCacheForBoundary(
        restoredCache,
        input.committedThroughSequence,
        indexVersion,
    );
    const currentSidecar = deepFreeze({
        schemaVersion: CONTEXT_RETRIEVAL_INDEX_SIDECAR_SCHEMA_VERSION,
        goalId: input.goalId,
        runId: input.runId,
        derivedThroughSequence: input.committedThroughSequence,
        sourceDigest,
        tokenizerVersion: CONTEXT_TOKENIZER_VERSION,
        rankingVersion: CONTEXT_RANKING_VERSION,
        indexVersion,
        documents: structuredClone(documents),
        index: snapshotContextInvertedIndex(index),
        queryCache: queryCache.snapshot(),
        conversationEndIndexExclusive,
        conversationPrefixDigest,
    });
    return Object.freeze({ index, sidecar: currentSidecar, queryCache, mode });
}

/**
 * 直接从当前 committed 事件构建一个全新的 Sidecar。
 *
 * @param input - Goal/Run、boundary 和事件。
 * @returns 与 `openContextRetrievalIndexSession` 重建分支相同的 Sidecar。
 * @throws ContextRetrievalIndexError 当来源输入非法时。
 * @example
 * ```ts
 * const sidecar = buildContextRetrievalIndexSidecar({
 *     goalId, runId, committedThroughSequence, events,
 * });
 * ```
 */
export function buildContextRetrievalIndexSidecar(
    input: Omit<ContextRetrievalIndexSessionInput, "sidecar">,
): Readonly<ContextRetrievalIndexSidecar> {
    return openContextRetrievalIndexSession(input).sidecar;
}

function buildDocuments(input: ContextRetrievalIndexSessionInput): readonly ContextSearchDocument[] {
    try {
        const builderDocuments = buildContextDocuments(input);
        return Object.freeze([...builderDocuments]);
    } catch (error) {
        if (error instanceof ContextRetrievalIndexError) throw error;
        throw new ContextRetrievalIndexError("committed Trajectory cannot build documents", { cause: error });
    }
}

function buildContextDocuments(input: ContextRetrievalIndexSessionInput): readonly ContextSearchDocument[] {
    const trajectoryDocuments = new ContextDocumentBuilder().build({
        goalId: input.goalId,
        runId: input.runId,
        committedThroughSequence: input.committedThroughSequence,
        events: input.events,
    });
    const conversationDocuments = buildConversationContextDocuments({
        goalId: input.goalId,
        runId: input.runId,
        messages: input.messages,
        conversationStartIndex: input.conversationStartIndex,
    });
    return Object.freeze([...conversationDocuments, ...trajectoryDocuments].sort(compareDocuments));
}

function incrementDocuments(
    oldDocuments: readonly ContextSearchDocument[],
    currentDocuments: readonly ContextSearchDocument[],
    previousBoundary: number,
): readonly ContextSearchDocument[] {
    const retained = oldDocuments.filter((document) => document.lastSequence <= previousBoundary);
    const retainedIds = new Set(retained.map((document) => document.documentId));
    const appended = currentDocuments.filter((document) =>
        document.lastSequence > previousBoundary && !retainedIds.has(document.documentId),
    );
    const merged = [...retained, ...appended].sort(compareDocuments);
    return Object.freeze(merged);
}

function isUsableSidecar(
    sidecar: ContextRetrievalIndexSidecar,
    input: ContextRetrievalIndexSessionInput,
    currentDigest: string,
    indexVersion: string,
    conversationEndIndexExclusive: number,
    conversationPrefixDigest: string,
): boolean {
    if (
        sidecar.schemaVersion !== CONTEXT_RETRIEVAL_INDEX_SIDECAR_SCHEMA_VERSION
        || sidecar.goalId !== input.goalId
        || sidecar.runId !== input.runId
        || !Number.isSafeInteger(sidecar.derivedThroughSequence)
        || sidecar.derivedThroughSequence < 0
        || sidecar.derivedThroughSequence > input.committedThroughSequence
        || sidecar.tokenizerVersion !== CONTEXT_TOKENIZER_VERSION
        || sidecar.rankingVersion !== CONTEXT_RANKING_VERSION
        || sidecar.indexVersion !== indexVersion
    ) return false;
    const expectedDigest = computeContextRetrievalSourceDigest(
        input.events,
        sidecar.derivedThroughSequence,
    );
    if (sidecar.sourceDigest !== expectedDigest) return false;
    if (sidecar.derivedThroughSequence === input.committedThroughSequence
        && sidecar.sourceDigest !== currentDigest) return false;
    if (
        sidecar.conversationEndIndexExclusive !== conversationEndIndexExclusive
        || sidecar.conversationPrefixDigest !== conversationPrefixDigest
    ) return false;
    if (conversationEndIndexExclusive !== undefined) {
        const conversationDocuments = sidecar.documents.filter(
            (document) => document.source?.kind === "conversation",
        );
        if (conversationDocuments.length !== conversationEndIndexExclusive) return false;
        const indices = new Set(
            conversationDocuments.map((document) =>
                document.source?.kind === "conversation"
                    ? document.source.messageIndex
                    : -1,
            ),
        );
        for (let index = 0; index < conversationEndIndexExclusive; index += 1) {
            if (!indices.has(index)) return false;
        }
    }
    return true;
}

function filterCacheForBoundary(
    entries: readonly ContextRetrievalQueryCacheEntry[],
    boundary: number,
    indexVersion: string,
): ContextRetrievalQueryCache {
    const usable = entries.filter((entry) =>
        entry.committedThroughSequence === boundary
        && entry.indexVersion === indexVersion,
    );
    try {
        return new ContextRetrievalQueryCache(usable);
    } catch {
        return new ContextRetrievalQueryCache();
    }
}

function validateSessionInput(input: ContextRetrievalIndexSessionInput): void {
    if (!isRecord(input)) throw new ContextRetrievalIndexError("session input must be an object");
    assertNonEmptyString(input.goalId, "goalId");
    assertNonEmptyString(input.runId, "runId");
    assertNonNegativeSafeInteger(input.committedThroughSequence, "committedThroughSequence");
    if (!Array.isArray(input.events)) throw new ContextRetrievalIndexError("events must be an array");
    if (!Array.isArray(input.messages)) {
        throw new ContextRetrievalIndexError("messages must be an array");
    }
    if (
        !Number.isSafeInteger(input.conversationStartIndex)
        || input.conversationStartIndex < 0
        || input.conversationStartIndex > input.messages.length
    ) {
        throw new ContextRetrievalIndexError("conversationStartIndex is invalid");
    }
}

function normalizeContextRetrievalQuery(input: ContextRetrievalQuery): ContextRetrievalQuery {
    if (!isRecord(input)) throw new ContextRetrievalIndexError("query must be an object");
    assertNonEmptyString(input.question, "question");
    assertNonNegativeSafeInteger(input.committedThroughSequence, "committedThroughSequence");
    assertNonEmptyString(input.indexVersion, "indexVersion");
    const need = normalizeContextLookupNeed(input.need);
    let request: ReturnType<typeof normalizeContextLookupRequest>;
    try {
        request = normalizeContextLookupRequest({
            kind: "context_lookup",
            need,
            question: input.question,
            ...(input.filters === undefined ? {} : { filters: input.filters }),
        });
    } catch (error) {
        throw new ContextRetrievalIndexError("query question or filters are invalid", { cause: error });
    }
    return {
        need,
        question: request.question,
        ...(request.filters === undefined ? {} : { filters: request.filters }),
        committedThroughSequence: input.committedThroughSequence,
        indexVersion: input.indexVersion,
    };
}

function normalizeContextLookupNeed(value: unknown): ContextLookupNeed {
    if (value === undefined) return "historical_execution";
    if (
        value !== "conversation_history"
        && value !== "historical_execution"
        && value !== "decision_rationale"
    ) {
        throw new ContextRetrievalIndexError("query need is invalid");
    }
    return value;
}

function validateCacheResult(
    result: ContextLookupResult,
    boundary: number,
    indexVersion?: string,
): ContextLookupResult {
    if (!isRecord(result)) throw new ContextRetrievalIndexError("query cache result must be an object");
    try {
        const validated = validateContextLookupResult(result, result.lookupId, boundary);
        if (
            validated.committedThroughSequence !== undefined
            && validated.committedThroughSequence !== boundary
        ) {
            throw new ContextRetrievalIndexError("query cache result boundary does not match query");
        }
        if (
            validated.status === "found"
            && indexVersion !== undefined
            && validated.indexVersion !== undefined
            && validated.indexVersion !== indexVersion
        ) {
            throw new ContextRetrievalIndexError("query cache result index version does not match query");
        }
        return deepFreeze({
            ...validated,
            ...(validated.committedThroughSequence === undefined
                ? { committedThroughSequence: boundary }
                : {}),
        } as ContextLookupResult);
    } catch (error) {
        throw new ContextRetrievalIndexError("query cache result is invalid", { cause: error });
    }
}

function cloneLookupResult(result: ContextLookupResult): ContextLookupResult {
    return deepFreeze(structuredClone(result));
}

function assertIndexVersion(index: ContextInvertedIndex): void {
    if (
        index.schemaVersion !== CONTEXT_INVERTED_INDEX_SCHEMA_VERSION
        || index.tokenizerVersion !== CONTEXT_TOKENIZER_VERSION
    ) {
        throw new ContextRetrievalIndexError("unsupported inverted index version");
    }
}

function compareDocuments(left: ContextSearchDocument, right: ContextSearchDocument): number {
    return left.firstSequence - right.firstSequence
        || left.lastSequence - right.lastSequence
        || compareLexical(left.documentId, right.documentId);
}

function canonicalJson(value: unknown): string {
    const serialized = JSON.stringify(sortKeys(value));
    return serialized === undefined ? "null" : serialized;
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => compareLexical(left, right))
                .map(([key, child]) => [key, sortKeys(child)]),
        );
    }
    return value;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
    if (typeof value !== "object" || value === null || seen.has(value as object)) return value;
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
    return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ContextRetrievalIndexError(`${field} must be a non-empty string`);
    }
}

function assertNonNegativeSafeInteger(value: unknown, field: string): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new ContextRetrievalIndexError(`${field} must be a non-negative safe integer`);
    }
}

function compareLexical(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
