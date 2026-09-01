import { resolveModelContextProtocol, type Goal } from "./domain";
import type { ContextSearchDocument } from "./context-document";
import { buildContextInvertedIndex } from "./context-tokenizer";
import { FieldedBm25LiteRanker } from "./context-ranking";
import { buildContextLookupResultFromRanking } from "./context-lookup-result";
import {
    CONTEXT_RETRIEVAL_INDEX_VERSION_V2,
    ContextRetrievalQueryCache,
    openContextRetrievalIndexSession,
    type ContextRetrievalIndexSession,
    type TrajectoryRetrievalIndexStore,
} from "./context-retrieval-index";
import type {
    ContextLookupExecutionInput,
    ContextLookupPort,
    ContextLookupResult,
} from "./context-retrieval";

/** Indexed Lookup 服务的只读依赖。 */
export interface IndexedContextLookupServiceOptions {
    readonly trajectoryStore?: {
        readWithBoundary(query: { readonly goalId: string; readonly runId: string }, boundary: number): Promise<Readonly<{ readonly committed: readonly import("./trajectory").TrajectoryEvent[] }>>;
    };
    readonly topK?: number;
    /** 最低 BM25 分数；默认保留所有词法命中，避免单条归档消息被阈值过滤。 */
    readonly minimumScore?: number;
    /** 可选的可删除 Retrieval Sidecar；失配时自动重建。 */
    readonly indexStore?: TrajectoryRetrievalIndexStore;
}

/**
 * 从 Snapshot Conversation 与 committed Trajectory 即时重建联合索引的 Lookup 服务。
 *
 * @remarks
 * 服务不把索引视为权威状态；每次查询都以当前 Snapshot boundary 为准，Sidecar
 * 缺失或损坏时自然回退到相同的确定性构建路径。Conversation 当前 Epoch 以内的
 * 消息不会进入 Cold，避免与 Epoch 投影重复。
 */
export class IndexedContextLookupService implements ContextLookupPort {
    private readonly options: IndexedContextLookupServiceOptions;

    constructor(options: IndexedContextLookupServiceOptions = {}) {
        this.options = options;
    }

    async lookup(input: ContextLookupExecutionInput): Promise<ContextLookupResult> {
        const boundary = input.committedThroughSequence;
        const trajectory = this.options.trajectoryStore === undefined
            ? []
            : (await this.options.trajectoryStore.readWithBoundary(
                { goalId: input.goal.id, runId: input.goal.state.run.id },
                boundary,
            )).committed;
        const v2 = resolveModelContextProtocol(input.goal.definition).kind === "trajectory-layered"
            && resolveModelContextProtocol(input.goal.definition).version === 2;
        const conversationStartIndex = input.goal.state.run.contextEpoch?.conversationStartIndex
            ?? input.goal.state.messages.length;
        const sidecar = !v2 || this.options.indexStore === undefined
            ? undefined
            : await this.options.indexStore.restore(
                input.goal.id,
                input.goal.state.run.id,
                {
                    committedThroughSequence: boundary,
                    indexVersion: CONTEXT_RETRIEVAL_INDEX_VERSION_V2,
                    conversationEndIndexExclusive: conversationStartIndex,
                },
            );
        const session = openContextRetrievalIndexSession({
            goalId: input.goal.id,
            runId: input.goal.state.run.id,
            committedThroughSequence: boundary,
            events: trajectory,
            ...(v2 ? {
                messages: input.goal.state.messages,
                conversationStartIndex,
            } : {}),
            ...(sidecar === undefined ? {} : { sidecar }),
        });
        if (v2 && this.options.indexStore !== undefined) {
            try {
                await this.options.indexStore.save(session.sidecar);
            } catch {
                // Sidecar 是可删除缓存；保存失败不影响本次查询。
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
            goalId: input.goal.id,
            runId: input.goal.state.run.id,
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
}

async function saveSidecar(
    store: TrajectoryRetrievalIndexStore | undefined,
    sidecar: ContextRetrievalIndexSession["sidecar"],
    queryCache: ContextRetrievalQueryCache,
): Promise<void> {
    if (store === undefined || sidecar.indexVersion !== CONTEXT_RETRIEVAL_INDEX_VERSION_V2) return;
    try {
        await store.save({
            ...sidecar,
            queryCache: queryCache.snapshot(),
        });
    } catch {
        // Sidecar 是可删除缓存；保存失败不影响本次查询结果。
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
