import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildCommittedEvidenceIndex,
    validateContextLookupSourceReferences,
    validateFactEvidence,
    EvidenceGateError,
    allocateImmutableEvent,
    type TrajectoryEvent,
} from "../src/index";
import {
    buildContextLookupResultFromRanking,
    type ContextSearchDocument,
    type ContextRankingResult,
} from "../../context-retrieval/src/index";
import type { ContextLookupRequest } from "../../model-contracts/src/index";

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
    }[],
): ContextRankingResult {
    return {
        matches: matches.map((match) => ({
            documentId: match.document.documentId,
            document: match.document,
            score: match.score,
            matchedFields: ["body"],
            exactMatchedFields: [],
            adjacent: false,
        })),
        truncated: false,
        candidateCount: matches.length,
    };
}

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
        EvidenceGateError,
    );
});
