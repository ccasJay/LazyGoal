import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createEmptyWorkingMemory,
    isMemoryProtocol,
    type Blocker,
    type EvidenceBackedFact,
    type Hypothesis,
    type MemoryProtocol,
    type MemoryRevision,
    type WorkingMemory,
} from "../src/index";

test("isMemoryProtocol correctly identifies structured@1 protocol", () => {
    const valid: MemoryProtocol = { kind: "structured", version: 1 };
    assert.equal(isMemoryProtocol(valid), true);

    assert.equal(isMemoryProtocol(null), false);
    assert.equal(isMemoryProtocol(undefined), false);
    assert.equal(isMemoryProtocol({ kind: "structured", version: 2 }), false);
    assert.equal(isMemoryProtocol({ kind: "unstructured", version: 1 }), false);
    assert.equal(isMemoryProtocol({ kind: "structured", version: 1, extra: true }), false);
    assert.equal(isMemoryProtocol([valid]), false);
});

test("createEmptyWorkingMemory initializes valid empty working memory with default values", () => {
    const memory = createEmptyWorkingMemory();
    assert.equal(memory.protocolVersion, 1);
    assert.equal(memory.derivedThroughSequence, 0);
    assert.equal(memory.revision, undefined);
    assert.deepEqual(memory.facts, []);
    assert.deepEqual(memory.hypotheses, []);
    assert.deepEqual(memory.blockers, []);
});

test("createEmptyWorkingMemory accepts valid revision bounded by derivedThroughSequence", () => {
    const revision: MemoryRevision = { eventId: "evt-1", sequence: 5 };
    const memory = createEmptyWorkingMemory(5, revision);
    assert.equal(memory.protocolVersion, 1);
    assert.equal(memory.derivedThroughSequence, 5);
    assert.deepEqual(memory.revision, revision);
});

test("createEmptyWorkingMemory rejects invalid derivedThroughSequence", () => {
    assert.throws(
        () => createEmptyWorkingMemory(-1),
        /derivedThroughSequence must be a non-negative integer/,
    );
    assert.throws(
        () => createEmptyWorkingMemory(1.5),
        /derivedThroughSequence must be a non-negative integer/,
    );
});

test("createEmptyWorkingMemory rejects out-of-bounds or malformed revision", () => {
    assert.throws(
        () => createEmptyWorkingMemory(3, { eventId: "evt-1", sequence: 4 }),
        /revision must be valid and within derivedThroughSequence/,
    );
    assert.throws(
        () => createEmptyWorkingMemory(3, { eventId: "", sequence: 1 }),
        /revision must be valid and within derivedThroughSequence/,
    );
    assert.throws(
        () => createEmptyWorkingMemory(3, { eventId: "evt-1", sequence: -1 }),
        /revision must be valid and within derivedThroughSequence/,
    );
});

test("entry types conform to expected structural shapes", () => {
    const fact: EvidenceBackedFact = {
        id: "fact-test",
        originPhase: "executing",
        originSequence: 1,
        scope: "goal",
        updatedAtSequence: 1,
        kind: "fact",
        subject: "config",
        predicate: "valid",
        value: true,
        stability: "stable",
        evidenceSequences: [1],
        reinforcementCount: 1,
        lastEvidenceSequence: 1,
        source: "model",
    };
    const hypothesis: Hypothesis = {
        id: "hypo-test",
        originPhase: "executing",
        originSequence: 1,
        scope: "goal",
        updatedAtSequence: 1,
        kind: "hypothesis",
        statement: "needs reboot",
        status: "active",
    };
    const blocker: Blocker = {
        id: "block-test",
        originPhase: "executing",
        originSequence: 1,
        scope: "phase",
        updatedAtSequence: 1,
        kind: "blocker",
        description: "waiting for token",
        status: "active",
    };

    const memory: WorkingMemory = {
        protocolVersion: 1,
        derivedThroughSequence: 1,
        revision: { eventId: "evt-1", sequence: 1 },
        facts: [fact],
        hypotheses: [hypothesis],
        blockers: [blocker],
    };

    assert.equal(memory.facts.length, 1);
    assert.equal(memory.hypotheses.length, 1);
    assert.equal(memory.blockers.length, 1);
});
