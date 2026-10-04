import type {
    ContextLookupRequest,
} from "../../contracts/src/index";
import type {
    ContextLookupResult,
    ContextLookupRunBoundary,
} from "./types";
import type {
    ContextRetrievalTrajectoryEvent,
    ContextSearchDocument,
} from "./context-document";
import { ContextDocumentBuilder } from "./context-document";
import type {
    ContextRetrievalMessage,
} from "./conversation-context-document";
import { buildConversationContextDocuments } from "./conversation-context-document";
import { buildContextInvertedIndex } from "./context-tokenizer";
import { FieldedBm25LiteRanker } from "./context-ranking";
import { buildContextLookupResultFromRanking } from "./context-lookup-result";
import {
    CONTEXT_RETRIEVAL_INDEX_VERSION,
    ContextRetrievalQueryCache,
    openContextRetrievalIndexSession,
    type ContextRetrievalIndexSession,
    type TrajectoryRetrievalIndexStore,
} from "./context-retrieval-index";

/**
 * 传递给检索器的执行上下文输入。
 *
 * @remarks
 * 检索包不依赖 Goal 状态机或 Runtime，仅接收结构化参数与只读来源信封。
 *
 * @example
 * ```ts
 * const input: ContextRetrieverInput = {
 *     goalId: "goal-1",
 *     currentRunId: "run-1",
 *     lookupId: "lookup-1",
 *     request,
 *     committedThroughSequence: 10,
 *     runBoundaries: [{ runId: "run-1", committedThroughSequence: 10 }],
 *     events: [],
 *     messages: [],
 *     conversationStartIndex: 0,
 * };
 * ```
 */
export interface ContextRetrieverInput {
    /** 当前 Goal 的稳定 ID。 */
    readonly goalId: string;
    /** 当前 Run 的稳定 ID。 */
    readonly currentRunId: string;
    /** Runtime 为该请求计算的跨进程稳定 ID。 */
    readonly lookupId: string;
    /** 规范化请求。 */
    readonly request: ContextLookupRequest;
    /** 整体提交边界（各 Run 边界的最大值）。 */
    readonly committedThroughSequence: number;
    /** 参与查询的所有 Run 边界。 */
    readonly runBoundaries: readonly ContextLookupRunBoundary[];
    /** 当前已提交的历史事件（单 Run 时为该 Run 事件；多 Run 时可为合并事件或按 run 划分）。 */
    readonly events: readonly ContextRetrievalTrajectoryEvent[];
    /** Snapshot 权威消息。 */
    readonly messages: readonly ContextRetrievalMessage[];
    /** 当前 Run 的冷消息归档起始点。 */
    readonly conversationStartIndex: number;
    /** 已完成 Run 的消息范围映射（跨 Run 时用于精确划分各 Run 的消息）。 */
    readonly completedRunMessageRanges?: readonly {
        readonly runId: string;
        readonly messageRange: { readonly start: number; readonly end: number };
    }[];
}

/**
 * 检索服务通用接口契约。
 *
 * @remarks
 * 组合根或 Runtime 可实现或注入不同检索算法（如向量检索或混合检索），默认使用
 * `IndexedContextRetriever`（BM25-lite）。检索器不拥有领域状态，不产生副作用。
 *
 * @example
 * ```ts
 * const retriever: ContextRetriever = new IndexedContextRetriever();
 * const result = await retriever.retrieve(input);
 * ```
 */
export interface ContextRetriever {
    /**
     * 执行检索并返回结构化结果。
     *
     * @param input - 检索请求参数与只读来源信封。
     * @returns 结构化结果；失败或异常应返回或抛出错误由外层门禁处理。
     */
    retrieve(input: ContextRetrieverInput): Promise<ContextLookupResult>;
}

/** IndexedContextRetriever 的配置选项。 */
export interface IndexedContextRetrieverOptions {
    readonly topK?: number;
    /** 最低 BM25 分数；默认 0。 */
    readonly minimumScore?: number;
    /** 可选的可删除 Retrieval Sidecar 存储；失配时自动重建。 */
    readonly indexStore?: TrajectoryRetrievalIndexStore;
}

/**
 * 默认基于倒排索引与 BM25-lite 的 ContextRetriever 实现。
 *
 * @remarks
 * 对单 Run 查询支持 Sidecar 缓存与增量更新，多 Run 查询构建临时联合索引。
 *
 * @example
 * ```ts
 * const retriever = new IndexedContextRetriever({ topK: 5 });
 * const result = await retriever.retrieve(input);
 * ```
 */
export class IndexedContextRetriever implements ContextRetriever {
    private readonly options: IndexedContextRetrieverOptions;

    constructor(options: IndexedContextRetrieverOptions = {}) {
        this.options = options;
    }

    async retrieve(input: ContextRetrieverInput): Promise<ContextLookupResult> {
        if (input.runBoundaries.length > 1) {
            return this.retrieveAcrossRuns(input);
        }
        return this.retrieveSingleRun(input);
    }

    private async retrieveSingleRun(input: ContextRetrieverInput): Promise<ContextLookupResult> {
        const boundary = input.committedThroughSequence;
        const sidecar = this.options.indexStore === undefined
            ? undefined
            : await this.options.indexStore.restore(
                input.goalId,
                input.currentRunId,
                {
                    committedThroughSequence: boundary,
                    indexVersion: CONTEXT_RETRIEVAL_INDEX_VERSION,
                    conversationEndIndexExclusive: input.conversationStartIndex,
                },
            );

        const session = openContextRetrievalIndexSession({
            goalId: input.goalId,
            runId: input.currentRunId,
            committedThroughSequence: boundary,
            events: input.events,
            messages: input.messages,
            conversationStartIndex: input.conversationStartIndex,
            ...(sidecar === undefined ? {} : { sidecar }),
        });

        if (this.options.indexStore !== undefined) {
            try {
                await this.options.indexStore.save(session.sidecar);
            } catch {
                // Sidecar 是可删除缓存；保存失败不影响本次查询
            }
        }

        const documents = filterDocuments(
            session.sidecar.documents,
            input.request.need,
        );

        const query = {
            need: input.request.need,
            question: input.request.question,
            ...(input.request.filters === undefined ? {} : { filters: input.request.filters }),
            committedThroughSequence: boundary,
            indexVersion: session.sidecar.indexVersion,
        } as const;

        const cached = session.queryCache.get(query);
        if (cached !== undefined) return cached;

        if (documents.length === 0) {
            const result = {
                status: "not_found" as const,
                lookupId: input.lookupId,
                committedThroughSequence: boundary,
                reason: "no_context_match",
            };
            session.queryCache.set(query, result);
            await saveSidecar(this.options.indexStore, session.sidecar, session.queryCache);
            return result;
        }

        const index = documents.length === session.sidecar.documents.length
            ? session.index
            : buildContextInvertedIndex(documents);

        const ranking = new FieldedBm25LiteRanker(index, {
            topK: this.options.topK ?? 5,
            minimumScore: this.options.minimumScore ?? 0,
        }).rank(input.request);

        const result = buildContextLookupResultFromRanking({
            goalId: input.goalId,
            runId: input.currentRunId,
            lookupId: input.lookupId,
            request: input.request,
            committedThroughSequence: boundary,
            ranking,
            indexVersion: session.sidecar.indexVersion,
        });

        session.queryCache.set(query, result);
        await saveSidecar(this.options.indexStore, session.sidecar, session.queryCache);
        return result;
    }

    private async retrieveAcrossRuns(input: ContextRetrieverInput): Promise<ContextLookupResult> {
        const documents: ContextSearchDocument[] = [];
        const builder = new ContextDocumentBuilder();

        // 收集各 Run 的事件并按其边界构建文档
        for (const source of input.runBoundaries) {
            const runEvents = input.events.filter(e => e.runId === source.runId);
            documents.push(...builder.build({
                goalId: input.goalId,
                runId: source.runId,
                committedThroughSequence: source.committedThroughSequence,
                events: runEvents,
            }));
        }

        // 收集历史已完成 Run 的冷消息
        for (const history of input.completedRunMessageRanges ?? []) {
            documents.push(...buildConversationContextDocuments({
                goalId: input.goalId,
                runId: history.runId,
                messages: input.messages,
                messageStartIndex: history.messageRange.start,
                messageEndIndexExclusive: history.messageRange.end,
            }));
        }

        const filtered = filterDocuments(Object.freeze(documents), input.request.need);
        const boundary = Math.max(...input.runBoundaries.map((s) => s.committedThroughSequence));

        if (filtered.length === 0) {
            return {
                status: "not_found",
                lookupId: input.lookupId,
                committedThroughSequence: boundary,
                reason: "no_context_match",
            };
        }

        const index = buildContextInvertedIndex(filtered);
        const ranking = new FieldedBm25LiteRanker(index, {
            topK: this.options.topK ?? 5,
            minimumScore: this.options.minimumScore ?? 0,
        }).rank(input.request);

        return buildContextLookupResultFromRanking({
            goalId: input.goalId,
            runId: input.currentRunId,
            lookupId: input.lookupId,
            request: input.request,
            committedThroughSequence: boundary,
            ranking,
            indexVersion: CONTEXT_RETRIEVAL_INDEX_VERSION,
            runBoundaries: input.runBoundaries,
        });
    }
}

async function saveSidecar(
    store: TrajectoryRetrievalIndexStore | undefined,
    sidecar: ContextRetrievalIndexSession["sidecar"],
    queryCache: ContextRetrievalQueryCache,
): Promise<void> {
    if (store === undefined || sidecar.indexVersion !== CONTEXT_RETRIEVAL_INDEX_VERSION) return;
    try {
        await store.save({
            ...sidecar,
            queryCache: queryCache.snapshot(),
        });
    } catch {
        // Sidecar 是可删除缓存；保存失败不影响本次查询结果
    }
}

function filterDocuments(
    documents: readonly ContextSearchDocument[],
    need: string,
): readonly ContextSearchDocument[] {
    if (need === "conversation_history") {
        return documents.filter((document) => document.source?.kind === "conversation");
    }
    if (need === "historical_execution") {
        return documents.filter((document) => document.source?.kind !== "conversation");
    }
    return documents;
}
