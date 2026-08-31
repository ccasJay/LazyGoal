import assert from "node:assert/strict";
import { test } from "node:test";

import {
    EvidenceGateError,
    allocateImmutableEvent,
    buildCommittedEvidenceIndex,
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

test("Fact evidence accepts committed Observation and Tool facts", () => {
    validateFactEvidence([1, 2], index());
    const gate = createEvidenceGate(index());
    gate.validateFact([2]);
});

test("Fact evidence rejects missing, duplicate and uncommitted sequences", () => {
    assert.throws(() => validateFactEvidence([], index()), EvidenceGateError);
    assert.throws(() => validateFactEvidence([1, 1], index()), EvidenceGateError);
    assert.throws(() => validateFactEvidence([3], index()), /beyond committed boundary/);
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
    validateMemoryPatchEvidence(patch, index());

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
    }, index()), EvidenceGateError);
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
