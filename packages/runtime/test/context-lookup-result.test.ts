import assert from "node:assert/strict";
import { test } from "node:test";

import {
    CONTEXT_LOOKUP_RESULT_BUDGET_CODE,
    buildContextLookupResultFromRanking,
    buildCommittedEvidenceIndex,
    validateContextLookupResult,
    validateContextLookupSourceReferences,
    validateFactEvidence,
    EvidenceGateError,
    allocateImmutableEvent,
    type ContextSearchDocument,
    type ContextRankingResult,
    type ContextLookupRequest,
    type TrajectoryEvent,
} from "../src/index";

const goalId = "result-goal";
const runId = "result-run";
const request: ContextLookupRequest = {
    kind: "context_lookup",
    need: "historical_execution",
    question: "读取配置文件",
};

function document(
    documentId: string,
    sequence: number,
    body = "读取 src/config.ts",
): ContextSearchDocument {
    const fields = {
        eventType: ["observation_recorded"],
        toolId: ["read_file"],
        actionId: [`action-${documentId}`],
        stepIndex: [sequence],
        path: ["src/config.ts"],
        errorCode: [],
        objectId: [],
        body,
    } as const;
    return {
        schemaVersion: 1,
        documentId,
        goalId,
        runId,
        kind: "execution",
        phase: "executing",
        executionUnitId: documentId,
        firstSequence: sequence,
        lastSequence: sequence,
        sourceRange: { firstSequence: sequence, lastSequence: sequence },
        sourceEventIds: [`event-${documentId}`],
        fields,
        body,
        eventTypes: fields.eventType,
        toolIds: fields.toolId,
        actionIds: fields.actionId,
        stepIndexes: fields.stepIndex,
        paths: fields.path,
        errorCodes: fields.errorCode,
        objectIds: fields.objectId,
    };
}

function ranking(
    matches: readonly {
        readonly document: ContextSearchDocument;
        readonly score: number;
        readonly adjacent?: boolean;
        readonly matchedFields?: readonly ("body" | "path")[];
    }[],
    truncated = false,
): ContextRankingResult {
    return {
        matches: matches.map((match) => ({
            documentId: match.document.documentId,
            document: match.document,
            score: match.score,
            matchedFields: match.matchedFields ?? ["body"],
            exactMatchedFields: [],
            adjacent: match.adjacent ?? false,
        })),
        truncated,
        candidateCount: matches.length,
    };
}

test("排名结果转换为 found DTO 时补齐 query hash、索引版本和来源边界", () => {
    const result = buildContextLookupResultFromRanking({
        goalId,
        runId,
        lookupId: "lookup-result-1",
        request,
        committedThroughSequence: 2,
        ranking: ranking([{
            document: document("doc-1", 1),
            score: 3.1415926535,
        }]),
    });

    assert.equal(result.status, "found");
    if (result.status !== "found") return;
    assert.equal(result.queryHash?.length, 64);
    assert.equal(result.indexVersion, "fielded-bm25-lite-v1");
    assert.equal(result.matches[0]?.score, 3.141593);
    assert.deepEqual(result.matches[0]?.sourceEventIds, ["event-doc-1"]);
    assert.equal(result.matches[0]?.historical, true);
    assert.equal(result.matches[0]?.firstSequence, 1);
    assert.equal(result.committedThroughSequence, 2);
});

test("空候选返回 not_found，结果预算只返回完整文档或明确错误", () => {
    const notFound = buildContextLookupResultFromRanking({
        goalId,
        runId,
        lookupId: "lookup-empty",
        request,
        committedThroughSequence: 1,
        ranking: ranking([]),
    });
    assert.deepEqual(notFound, {
        status: "not_found",
        lookupId: "lookup-empty",
        committedThroughSequence: 1,
        reason: "no_context_match",
    });

    const overBudget = buildContextLookupResultFromRanking({
        goalId,
        runId,
        lookupId: "lookup-budget",
        request,
        committedThroughSequence: 1,
        resultBudgetBytes: 1,
        ranking: ranking([{
            document: document("doc-budget", 1),
            score: 2,
        }]),
    });
    assert.equal(overBudget.status, "lookup_error");
    if (overBudget.status === "lookup_error") {
        assert.equal(overBudget.code, CONTEXT_LOOKUP_RESULT_BUDGET_CODE);
    }
});

test("相邻文档可以没有匹配字段但必须标记 adjacent 且分数为零", () => {
    const result = buildContextLookupResultFromRanking({
        goalId,
        runId,
        lookupId: "lookup-adjacent",
        request,
        committedThroughSequence: 2,
        ranking: ranking([
            { document: document("doc-hit", 1), score: 2 },
            { document: document("doc-next", 2), score: 0, adjacent: true, matchedFields: [] },
        ]),
    });
    assert.equal(result.status, "found");
    if (result.status !== "found") return;
    assert.equal(result.matches[1]?.adjacent, true);
    assert.equal(result.matches[1]?.matchedFields.length, 0);
    assert.equal(result.matches[1]?.score, 0);
});

test("Result 校验拒绝重复文档、超长预览和未标记的截断", () => {
    const match = {
        documentId: "doc-1",
        goalId,
        runId,
        firstSequence: 1,
        lastSequence: 1,
        matchedFields: ["body"],
        score: 1,
        preview: "history",
        truncated: false,
        historical: true,
        sourceEventIds: ["event-1"],
    } as const;
    assert.throws(
        () => validateContextLookupResult({
            status: "found",
            lookupId: "lookup-1",
            committedThroughSequence: 1,
            matches: [match, { ...match }],
            truncated: false,
        }, "lookup-1", 1),
        /duplicate document/,
    );
    assert.throws(
        () => validateContextLookupResult({
            status: "found",
            lookupId: "lookup-1",
            committedThroughSequence: 1,
            matches: [{ ...match, preview: "x".repeat(8_193), truncated: true }],
            truncated: true,
        }, "lookup-1", 1),
        /preview exceeds/,
    );
    assert.throws(
        () => validateContextLookupResult({
            status: "found",
            lookupId: "lookup-1",
            committedThroughSequence: 1,
            matches: [{ ...match, preview: "short", truncated: true }],
            truncated: false,
        }, "lookup-1", 1),
        /must mark truncation/,
    );
});

function observationEvent(sequence: number): TrajectoryEvent {
    return allocateImmutableEvent({
        goalId,
        runId,
        phase: "executing",
        eventType: "observation_recorded",
        actionId: "action-1",
        payload: {
            type: "observation_recorded",
            actionId: "action-1",
            observation: {
                kind: "success",
                output: { path: "src/config.ts" },
                summary: "读取完成",
            },
        },
    }, sequence, `observation-${sequence}`);
}

test("Evidence Gate 只验证原始 committed source refs，并拒绝 lookup 事件", () => {
    const lookupEvent = allocateImmutableEvent({
        goalId,
        runId,
        phase: "executing",
        eventType: "context_lookup_requested",
        payload: {
            type: "context_lookup_requested",
            lookupId: "lookup-1",
            request,
        },
    }, 2, "lookup-event");
    const index = buildCommittedEvidenceIndex({
        goalId,
        runId,
        committedThroughSequence: 2,
        events: [observationEvent(1), lookupEvent],
    });
    const found = buildContextLookupResultFromRanking({
        goalId,
        runId,
        lookupId: "lookup-1",
        request,
        committedThroughSequence: 2,
        ranking: ranking([{
            document: {
                ...document("doc-1", 1),
                sourceEventIds: ["observation-1"],
            },
            score: 2,
        }]),
    });
    assert.equal(found.status, "found");
    if (found.status !== "found") return;
    assert.doesNotThrow(() => validateContextLookupSourceReferences(found, index));
    assert.doesNotThrow(() => validateFactEvidence([1], index, "execution"));
    assert.throws(() => validateFactEvidence([2], index, "execution"), EvidenceGateError);

    const lookupSource = {
        ...found,
        matches: [{
            ...found.matches[0]!,
            sourceEventIds: ["lookup-event"],
            firstSequence: 2,
            lastSequence: 2,
        }],
    } as const;
    assert.throws(
        () => validateContextLookupSourceReferences(lookupSource, index),
        /cannot be used as evidence/,
    );
});
