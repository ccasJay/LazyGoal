import assert from "node:assert/strict";
import { test } from "node:test";

import {
    EvidenceGateError,
    allocateImmutableEvent,
    buildCommittedEvidenceIndex,
    computeContentHash,
    createEvidenceGate,
    validateFactEvidence,
    validateMemoryPatchEvidence,
} from "../src/index";
import type { MemoryPatch, TrajectoryEvent } from "../src/index";

const goalId = "evidence-goal";
const runId = "evidence-run";

function observationEvent(
    sequence: number,
    kind: "observation_recorded" | "tool_finished" = "observation_recorded",
): TrajectoryEvent {
    if (kind === "tool_finished") {
        return allocateImmutableEvent({
            goalId,
            runId,
            phase: "executing",
            eventType: "tool_finished",
            actionId: "action-1",
            payload: {
                type: "tool_finished",
                actionId: "action-1",
                toolId: "read_file",
                observation: {
                    kind: "success",
                    output: { path: "README.md" },
                    summary: "read",
                },
            },
        }, sequence, `event-${sequence}`);
    }
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
                output: { path: "README.md" },
                summary: "read",
            },
        },
    }, sequence, `event-${sequence}`);
}

function index(boundary = 2) {
    return buildCommittedEvidenceIndex({
        goalId,
        runId,
        committedThroughSequence: boundary,
        events: [observationEvent(1), observationEvent(2, "tool_finished")],
    });
}

function preparationIndex() {
    const preparationInput = allocateImmutableEvent({
        goalId,
        runId,
        phase: "gathering_context",
        eventType: "preparation_input_recorded",
        payload: {
            type: "preparation_input_recorded",
            messageIndex: 0,
            contentHash: computeContentHash("用户约束"),
        },
    }, 1, "preparation-input-1");
    return buildCommittedEvidenceIndex({
        goalId,
        runId,
        committedThroughSequence: 3,
        events: [preparationInput, observationEvent(2), observationEvent(3, "tool_finished")],
    });
}

test("Fact evidence accepts committed Observation and Tool facts", () => {
    validateFactEvidence([1, 2], index(), "execution");
    const gate = createEvidenceGate(index());
    gate.validateFact([2], "execution");
});

test("Fact evidence rejects missing, duplicate and uncommitted sequences", () => {
    assert.throws(() => validateFactEvidence([], index(), "execution"), EvidenceGateError);
    assert.throws(() => validateFactEvidence([1, 1], index(), "execution"), EvidenceGateError);
    assert.throws(() => validateFactEvidence([3], index(), "execution"), /beyond committed boundary/);
});

test("Memory Patch validates Fact and Plan completion evidence", () => {
    const patch: MemoryPatch = {
        protocolVersion: 1,
        operations: [{
            type: "upsert_fact",
            fact: {
                subject: "workspace",
                predicate: "readme_exists",
                value: true,
                stability: "stable",
                evidenceSequences: [1],
            },
        }],
    };
    validateMemoryPatchEvidence(patch, index(), "execution");

    assert.throws(() => validateMemoryPatchEvidence({
        ...patch,
        operations: [{
            type: "upsert_fact",
            fact: {
                subject: "workspace",
                predicate: "readme_exists",
                value: true,
                stability: "stable",
                evidenceSequences: [3],
            },
        }],
    }, index(), "execution"), EvidenceGateError);
});

test("Preparation scope accepts only user provenance in addition to observations", () => {
    const preparationFact = {
        subject: "user",
        predicate: "requested_format",
        value: "json",
        stability: "stable" as const,
        evidenceSequences: [1],
    };
    const preparationPatch: MemoryPatch = {
        protocolVersion: 1,
        operations: [{
            type: "upsert_fact",
            fact: preparationFact,
        }],
    };
    assert.doesNotThrow(() => validateMemoryPatchEvidence(
        preparationPatch,
        preparationIndex(),
        "preparation",
    ));
    assert.throws(
        () => validateMemoryPatchEvidence(preparationPatch, preparationIndex(), "execution"),
        /preparation input provenance is not allowed/,
    );

    const mixedEvidencePatch: MemoryPatch = {
        ...preparationPatch,
        operations: [{
            type: "upsert_fact",
            fact: {
                ...preparationFact,
                evidenceSequences: [1, 2],
            },
        }],
    };
    assert.doesNotThrow(() => validateMemoryPatchEvidence(
        mixedEvidencePatch,
        preparationIndex(),
        "preparation",
    ));
});

test("Preparation provenance cannot retire Facts or complete Plans", () => {
    const provenanceEvidence = preparationIndex();
    const retirePatch: MemoryPatch = {
        protocolVersion: 1,
        operations: [{
            type: "retire_fact",
            fact: { id: "fact:user", evidenceSequences: [1] },
        }],
    };
    assert.throws(
        () => validateMemoryPatchEvidence(retirePatch, provenanceEvidence, "preparation"),
        /retire_fact cannot use preparation input provenance/,
    );

    const completionPlanItem = {
        id: "plan:3:0",
        status: "completed" as const,
        completionEvidenceSequences: [1],
    };
    const completePatch: MemoryPatch = {
        protocolVersion: 1,
        operations: [{
            type: "update_plan_item",
            planItem: completionPlanItem,
        }],
    };
    assert.throws(
        () => validateMemoryPatchEvidence(completePatch, provenanceEvidence, "preparation"),
        /preparation input provenance is not allowed in execution scope/,
    );
    assert.doesNotThrow(() => validateMemoryPatchEvidence({
        ...completePatch,
        operations: [{
            type: "update_plan_item",
            planItem: {
                ...completionPlanItem,
                completionEvidenceSequences: [2],
            },
        }],
    }, provenanceEvidence, "preparation"));
});

test("Evidence index excludes uncommitted tail and cross-Goal events", () => {
    const foreign = allocateImmutableEvent({
        goalId: "foreign",
        runId,
        phase: "executing",
        eventType: "observation_recorded",
        actionId: "action-1",
        payload: {
            type: "observation_recorded",
            actionId: "action-1",
            observation: { kind: "failure", code: "X", message: "x", retryable: false },
        },
    }, 2, "foreign-event");
    const committed = buildCommittedEvidenceIndex({
        goalId,
        runId,
        committedThroughSequence: 1,
        events: [observationEvent(1), observationEvent(2), foreign],
    });
    assert.equal(committed.has(1), true);
    assert.equal(committed.has(2), false);
});
