import assert from "node:assert/strict";
import { test } from "node:test";

import {
    CONTEXT_RETRIEVAL_INDEX_VERSION,
    CONTEXT_RETRIEVAL_QUERY_CACHE_CAPACITY,
    ContextRetrievalIndexError,
    ContextRetrievalQueryCache,
    allocateImmutableEvent,
    buildContextRetrievalIndexSidecar,
    canonicalizeContextRetrievalQuery,
    computeContextRetrievalSourceDigest,
    createContextRetrievalQueryKey,
    openContextRetrievalIndexSession,
    type ContextLookupResult,
    type ContextRetrievalQuery,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
} from "../src/index";

const goalId = "goal-index-cache";
const runId = "run-index-cache";

function query(
    question: string,
    boundary = 0,
    filters?: ContextRetrievalQuery["filters"],
): ContextRetrievalQuery {
    return {
        question,
        ...(filters === undefined ? {} : { filters }),
        committedThroughSequence: boundary,
        indexVersion: CONTEXT_RETRIEVAL_INDEX_VERSION,
    };
}

function notFound(id: string, boundary = 0): ContextLookupResult {
    return {
        status: "not_found",
        lookupId: id,
        committedThroughSequence: boundary,
        reason: "no_context_match",
    };
}

test("查询键包含规范化过滤器、boundary 和 index version", () => {
    const first = query("  src/index.ts ", 3, {
        paths: ["src/index.ts", "src/config.ts"],
        eventTypes: ["tool_finished", "decision_received"],
    });
    const second = query("src/index.ts", 3, {
        eventTypes: ["decision_received", "tool_finished"],
        paths: ["src/config.ts", "src/index.ts"],
    });

    assert.equal(createContextRetrievalQueryKey(first), createContextRetrievalQueryKey(second));
    assert.equal(canonicalizeContextRetrievalQuery(first), canonicalizeContextRetrievalQuery(second));
    assert.notEqual(
        createContextRetrievalQueryKey(first),
        createContextRetrievalQueryKey(query("src/index.ts", 4, first.filters)),
    );
    assert.match(createContextRetrievalQueryKey(first), /^[0-9a-f]{64}$/);
});

test("查询 LRU 固定 64 项，命中提升到 MRU 且淘汰最旧项", () => {
    const cache = new ContextRetrievalQueryCache();
    for (let index = 0; index < CONTEXT_RETRIEVAL_QUERY_CACHE_CAPACITY; index += 1) {
        cache.set(query(`question-${index}`), notFound(`lookup-${index}`));
    }
    assert.equal(cache.size, CONTEXT_RETRIEVAL_QUERY_CACHE_CAPACITY);

    assert.equal(cache.get(query("question-0"))?.status, "not_found");
    cache.set(query("question-64"), notFound("lookup-64"));
    const entries = cache.snapshot();
    assert.equal(entries.length, CONTEXT_RETRIEVAL_QUERY_CACHE_CAPACITY);
    assert.equal(entries.at(-1)?.question, "question-64");
    assert.equal(cache.get(query("question-0"))?.status, "not_found");
    assert.equal(cache.get(query("question-1")), undefined);
    assert.equal(Object.isFrozen(entries), true);
    assert.throws(
        () => cache.set(query("invalid"), {
            status: "found",
            lookupId: "lookup-invalid",
            committedThroughSequence: 1,
            matches: [],
            truncated: false,
        }),
        (error: unknown) => error instanceof ContextRetrievalIndexError,
    );
});

test("Sidecar 来源摘要忽略 tail，落后 Sidecar 可增量加入新准备文档", () => {
    const events = preparationEvents();
    const oldSidecar = buildContextRetrievalIndexSidecar({
        goalId,
        runId,
        committedThroughSequence: 2,
        events,
    });
    const incremental = openContextRetrievalIndexSession({
        goalId,
        runId,
        committedThroughSequence: 4,
        events,
        sidecar: oldSidecar,
    });
    const rebuilt = openContextRetrievalIndexSession({
        goalId,
        runId,
        committedThroughSequence: 4,
        events,
    });

    assert.equal(incremental.mode, "incremental");
    assert.deepEqual(incremental.sidecar.documents, rebuilt.sidecar.documents);
    assert.deepEqual(incremental.sidecar.index, rebuilt.sidecar.index);
    assert.equal(
        computeContextRetrievalSourceDigest(events, 2),
        oldSidecar.sourceDigest,
    );
    assert.equal(
        computeContextRetrievalSourceDigest(events, 4),
        incremental.sidecar.sourceDigest,
    );
});

test("损坏或领先 Sidecar fail-closed 后重建，不污染领域输入", () => {
    const events = preparationEvents();
    const sidecar = buildContextRetrievalIndexSidecar({
        goalId,
        runId,
        committedThroughSequence: 2,
        events,
    });
    const corrupted = {
        ...sidecar,
        sourceDigest: "sha256:" + "0".repeat(64),
    };
    const rebuilt = openContextRetrievalIndexSession({
        goalId,
        runId,
        committedThroughSequence: 2,
        events,
        sidecar: corrupted,
    });
    assert.equal(rebuilt.mode, "rebuilt");
    assert.equal(rebuilt.sidecar.sourceDigest, sidecar.sourceDigest);

    const leading = openContextRetrievalIndexSession({
        goalId,
        runId,
        committedThroughSequence: 1,
        events,
        sidecar,
    });
    assert.equal(leading.mode, "rebuilt");
    assert.equal(leading.sidecar.derivedThroughSequence, 1);
});

function preparationEvents(): readonly TrajectoryEvent[] {
    return [
        event(1, {
            phase: "gathering_context",
            eventType: "preparation_result",
            payload: { type: "preparation_result", result: "question" },
        }),
        event(2, {
            phase: "gathering_context",
            eventType: "run_waiting",
            payload: { type: "run_waiting", reason: "question" },
        }),
        event(3, {
            phase: "planning",
            eventType: "preparation_result",
            payload: { type: "preparation_result", result: "task_proposal" },
        }),
        event(4, {
            phase: "planning",
            eventType: "run_waiting",
            payload: { type: "run_waiting", reason: "approval" },
        }),
    ];
}

function event(
    sequence: number,
    draft: Omit<TrajectoryEventDraft, "goalId" | "runId">,
): TrajectoryEvent {
    return allocateImmutableEvent({
        goalId,
        runId,
        ...draft,
    } as TrajectoryEventDraft, sequence, `index-event-${sequence}`) as TrajectoryEvent;
}
