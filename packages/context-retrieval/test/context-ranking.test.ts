import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ContextRankingError,
    FieldedBm25LiteRanker,
    buildContextInvertedIndex,
    rankContextDocuments,
    type ContextSearchDocument,
} from "../src/index";

function document(
    documentId: string,
    sequence: number,
    path: string,
    body: string,
    toolId = "read_file",
): ContextSearchDocument {
    const fields = {
        eventType: ["observation_recorded"],
        toolId: [toolId],
        actionId: [`action-${documentId}`],
        stepIndex: [sequence],
        path: [path],
        errorCode: [],
        objectId: [`object-${documentId}`],
        body,
    } as const;
    return {
        schemaVersion: 1,
        documentId,
        goalId: "goal-ranking",
        runId: "run-ranking",
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

test("Fielded BM25-lite 对字段加权、精确标识和六位分数保持确定性", () => {
    const index = buildContextInvertedIndex([
        document("doc-body", 1, "src/other.ts", "inspect src/index.ts history"),
        document("doc-path", 2, "src/index.ts", "inspect source"),
    ]);
    const result = rankContextDocuments(index, { question: "src/index.ts" }, {
        adjacentCount: 0,
        minimumScore: 0,
    });
    assert.equal(result.matches[0]?.documentId, "doc-path");
    assert.equal(result.matches[0]?.exactMatchedFields.includes("path"), true);
    assert.equal(result.matches[0]?.score, Math.round((result.matches[0]?.score ?? 0) * 1_000_000) / 1_000_000);
    assert.equal(result.matches[0]?.score !== undefined && result.matches[0].score > 0, true);
});

test("过滤先于评分，平分时只使用 sequence 和文档 ID tie-break", () => {
    const index = buildContextInvertedIndex([
        document("doc-old", 3, "src/old.ts", "common"),
        document("doc-new", 7, "src/new.ts", "common"),
        document("doc-tool", 9, "src/tool.ts", "common", "grep"),
    ]);
    const result = new FieldedBm25LiteRanker(index, {
        topK: 5,
        minimumScore: 0,
        adjacentCount: 0,
    }).rank({
        question: "common",
        filters: { toolIds: ["read_file"], sequenceRange: { from: 1, to: 8 } },
    });
    assert.deepEqual(result.matches.map((match) => match.documentId), ["doc-new", "doc-old"]);
    assert.equal(result.candidateCount, 2);
    assert.equal(result.matches.every((match) => match.adjacent === false), true);
});

test("Top-K 主命中不包含相邻扩展，扩展项保持完整文档并去重", () => {
    const index = buildContextInvertedIndex([
        document("doc-before", 1, "src/before.ts", "before"),
        document("doc-hit", 2, "src/target.ts", "target"),
        document("doc-after", 3, "src/after.ts", "after"),
    ]);
    const result = new FieldedBm25LiteRanker(index, {
        topK: 1,
        minimumScore: 0,
        adjacentCount: 1,
    }).rank({ question: "src/target.ts" });
    assert.deepEqual(result.matches.map((match) => match.documentId), [
        "doc-hit",
        "doc-before",
        "doc-after",
    ]);
    assert.equal(result.matches[0]?.adjacent, false);
    assert.equal(result.matches[1]?.adjacent, true);
    assert.equal(result.matches[2]?.adjacent, true);
    assert.equal(result.matches[1]?.score, 0);
});

test("结果预算只丢弃完整文档并明确 truncated，不截断正文", () => {
    const index = buildContextInvertedIndex([
        document("doc-hit", 1, "src/target.ts", "target"),
    ]);
    const result = rankContextDocuments(index, { question: "target" }, {
        minimumScore: 0,
        resultBudgetBytes: 1,
        adjacentCount: 0,
    });
    assert.deepEqual(result.matches, []);
    assert.equal(result.truncated, true);
});

test("排名器拒绝非法查询和配置", () => {
    const index = buildContextInvertedIndex([document("doc-1", 1, "src/a.ts", "one")]);
    assert.throws(
        () => new FieldedBm25LiteRanker(index, { topK: 0 }),
        (error: unknown) => error instanceof ContextRankingError && /topK/.test(error.message),
    );
    assert.throws(
        () => rankContextDocuments(index, { question: "" }),
        (error: unknown) => error instanceof ContextRankingError && /question/.test(error.message),
    );
    assert.throws(
        () => rankContextDocuments(index, {
            question: "one",
            filters: { sequenceRange: { from: 3, to: 2 } },
        }),
        (error: unknown) => error instanceof ContextRankingError && /sequenceRange/.test(error.message),
    );
});
