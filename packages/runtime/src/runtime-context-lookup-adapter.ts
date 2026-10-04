import type { Goal } from "./domain";
import type { TrajectoryEvent } from "./trajectory";
import type {
    ContextLookupExecutionInput,
    ContextLookupPort,
    ContextLookupResult,
    ContextLookupRunBoundary,
} from "./context-retrieval";
import { getCommittedRunBoundaries } from "./context-retrieval";
import type {
    ContextRetriever,
    ContextRetrieverInput,
    IndexedContextRetrieverOptions,
    TrajectoryRetrievalIndexStore,
} from "../../context-retrieval/src/index";
import { IndexedContextRetriever } from "../../context-retrieval/src/index";

/**
 * 运行时上下文检索适配器配置。
 *
 * @example
 * ```ts
 * const options: RuntimeContextLookupAdapterOptions = {
 *     trajectoryStore,
 *     retriever: new IndexedContextRetriever(),
 * };
 * ```
 */
export interface RuntimeContextLookupAdapterOptions {
    /** Trajectory 存储实例；省略时视为空历史。 */
    readonly trajectoryStore?: {
        readWithBoundary(
            query: { readonly goalId: string; readonly runId: string },
            boundary: number,
        ): Promise<Readonly<{ readonly committed: readonly TrajectoryEvent[] }>>;
    };
    /** 底层具体检索器实现。 */
    readonly retriever: ContextRetriever;
}

/**
 * 将运行时 Goal/Trajectory 数据投影并委托给 ContextRetriever 的适配器。
 *
 * @remarks
 * 实现了 Runtime 的 `ContextLookupPort`。适配器负责准备权威的已提交事件和消息信封，
 * 并将结构化只读输入传递给检索包；不直接操作状态机或持久化，保持检索实现与领域解耦。
 *
 * @example
 * ```ts
 * const adapter = new RuntimeContextLookupAdapter({
 *     trajectoryStore,
 *     retriever: new IndexedContextRetriever(),
 * });
 * const result = await adapter.lookup(input);
 * ```
 */
export class RuntimeContextLookupAdapter implements ContextLookupPort {
    protected readonly options: RuntimeContextLookupAdapterOptions;
    protected readonly retriever: ContextRetriever;

    constructor(options: RuntimeContextLookupAdapterOptions) {
        this.options = options;
        this.retriever = options.retriever;
    }

    async lookup(input: ContextLookupExecutionInput): Promise<ContextLookupResult> {
        const runBoundaries = getCommittedRunBoundaries(input.goal);
        const boundary = input.committedThroughSequence;

        const events: TrajectoryEvent[] = [];
        if (this.options.trajectoryStore !== undefined) {
            for (const source of runBoundaries) {
                const raw = await this.options.trajectoryStore.readWithBoundary(
                    { goalId: input.goal.id, runId: source.runId },
                    source.committedThroughSequence,
                );
                events.push(...raw.committed);
            }
        }

        const completedRunMessageRanges = input.goal.state.completedRuns?.map((history) => ({
            runId: history.runId,
            messageRange: history.messageRange,
        }));

        const retrieverInput: ContextRetrieverInput = {
            goalId: input.goal.id,
            currentRunId: input.goal.state.run.id,
            lookupId: input.lookupId,
            request: input.request,
            committedThroughSequence: boundary,
            runBoundaries,
            events,
            messages: input.goal.state.messages,
            conversationStartIndex: input.goal.state.run.contextEpoch.conversationStartIndex,
            ...(completedRunMessageRanges === undefined ? {} : { completedRunMessageRanges }),
        };

        return this.retriever.retrieve(retrieverInput);
    }
}

/** 默认 Indexed 检索服务的配置选项。 */
export interface IndexedContextLookupServiceOptions {
    readonly trajectoryStore?: {
        readWithBoundary(
            query: { readonly goalId: string; readonly runId: string },
            boundary: number,
        ): Promise<Readonly<{ readonly committed: readonly TrajectoryEvent[] }>>;
    };
    readonly topK?: number;
    readonly minimumScore?: number;
    readonly indexStore?: TrajectoryRetrievalIndexStore;
}

/**
 * 默认使用 IndexedContextRetriever (BM25-lite) 的上下文检索服务。
 *
 * @remarks
 * 为现有代码与组合根提供开箱即用的默认实现。
 *
 * @example
 * ```ts
 * const service = new IndexedContextLookupService({
 *     trajectoryStore,
 *     indexStore,
 * });
 * const result = await service.lookup(input);
 * ```
 */
export class IndexedContextLookupService extends RuntimeContextLookupAdapter {
    constructor(options: IndexedContextLookupServiceOptions = {}) {
        const retriever = new IndexedContextRetriever({
            ...(options.topK !== undefined ? { topK: options.topK } : {}),
            ...(options.minimumScore !== undefined ? { minimumScore: options.minimumScore } : {}),
            ...(options.indexStore !== undefined ? { indexStore: options.indexStore } : {}),
        });
        super({
            ...(options.trajectoryStore !== undefined ? { trajectoryStore: options.trajectoryStore } : {}),
            retriever,
        });
    }
}
