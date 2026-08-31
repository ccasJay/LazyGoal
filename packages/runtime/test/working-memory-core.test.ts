import assert from "node:assert/strict";
import { test } from "node:test";

import {
    DEFAULT_WORKING_MEMORY_LIMITS,
    WorkingMemoryPatchError,
    applyMemoryPatch,
    createCanonicalFactId,
    createEmptyWorkingMemory,
    createSupersedeScopeOperation,
    normalizeMemoryPatch,
    reduceWorkingMemory,
    validateMemoryPatch,
} from "../src/index";
import type { MemoryPatch, WorkingMemory } from "../src/index";

function patch(...operations: MemoryPatch["operations"]): MemoryPatch {
    return { protocolVersion: 1, operations };
}

function factPatch(
    subject: string,
    predicate: string,
    value: string | boolean,
    evidenceSequence: number,
    stability: "stable" | "last_observed" = "stable",
): MemoryPatch {
    return patch({
        type: "upsert_fact",
        fact: {
            subject,
            predicate,
            value,
            stability,
            evidenceSequences: [evidenceSequence],
        },
    });
}

test("Fact identity is canonical and same-value newer evidence reinforces", () => {
    const initial = createEmptyWorkingMemory();
    const first = applyMemoryPatch(
        initial,
        factPatch("  Object:Watch-1 ", " Location ", "dresser-2", 4),
        { phase: "executing", originSequence: 5 },
    );
    const second = applyMemoryPatch(
        first,
        factPatch("Object:Watch-1", "Location", "dresser-2", 7),
        { phase: "executing", originSequence: 8 },
    );

    assert.equal(second.facts.length, 1);
    assert.equal(second.facts[0]?.id, createCanonicalFactId("Object:Watch-1", "Location"));
    assert.deepEqual(second.facts[0]?.evidenceSequences, [4, 7]);
    assert.equal(second.facts[0]?.reinforcementCount, 2);
    assert.equal(second.facts[0]?.lastEvidenceSequence, 7);
});

test("duplicate and stale Fact proposals are suppressed without canonical operations", () => {
    const current = applyMemoryPatch(
        createEmptyWorkingMemory(),
        factPatch("object:watch-1", "location", "dresser-2", 9),
        { phase: "executing", originSequence: 10 },
    );
    const duplicate = normalizeMemoryPatch(
        factPatch("object:watch-1", "location", "dresser-2", 9),
        { phase: "executing", originSequence: 11, workingMemory: current },
    );
    const stale = normalizeMemoryPatch(
        factPatch("object:watch-1", "location", "dresser-3", 8),
        { phase: "executing", originSequence: 12, workingMemory: current },
    );

    assert.deepEqual(duplicate.operations, []);
    assert.equal(duplicate.suppressed[0]?.reason, "duplicate");
    assert.deepEqual(stale.operations, []);
    assert.equal(stale.suppressed[0]?.reason, "covered_update");
});

test("newer evidence supersedes a Fact value and same-sequence Projector wins", () => {
    const modelMemory = applyMemoryPatch(
        createEmptyWorkingMemory(),
        factPatch("object:watch-1", "location", "dresser-2", 10),
        { phase: "executing", originSequence: 11, source: "model" },
    );
    const projected = applyMemoryPatch(
        modelMemory,
        factPatch("object:watch-1", "location", "dresser-3", 10),
        { phase: "executing", originSequence: 12, source: "tool_projector" },
    );
    assert.equal(projected.facts[0]?.value, "dresser-3");
    assert.equal(projected.facts[0]?.source, "tool_projector");

    assert.throws(
        () => applyMemoryPatch(
            projected,
            factPatch("object:watch-1", "location", "dresser-4", 10),
            { phase: "executing", originSequence: 13, source: "model" },
        ),
        WorkingMemoryPatchError,
    );
});

test("Runtime assigns create IDs and validates Plan dependencies and completion", () => {
    const withFact = applyMemoryPatch(
        createEmptyWorkingMemory(),
        factPatch("workspace", "tests_present", true, 2),
        { phase: "planning", originSequence: 3 },
    );
    const factId = withFact.facts[0]?.id as string;
    const withPlan = applyMemoryPatch(withFact, patch({
        type: "create_plan_item",
        planItem: {
            description: "Run tests",
            status: "active",
            dependsOnFactIds: [factId],
        },
    }), { phase: "planning", originSequence: 4 });

    assert.equal(withPlan.plan[0]?.id, "plan:4:0");
    assert.deepEqual(withPlan.plan[0]?.dependsOnFactIds, [factId]);
    const completed = applyMemoryPatch(withPlan, patch({
        type: "update_plan_item",
        planItem: {
            id: "plan:4:0",
            status: "completed",
            completionEvidenceSequences: [5],
        },
    }), { phase: "executing", originSequence: 6 });
    assert.deepEqual(completed.plan, []);
});

test("Runtime control state cannot be persisted as Fact", () => {
    assert.throws(
        () => validateMemoryPatch(factPatch("runtime", "pending_action", "open file", 1)),
        /Runtime control state/,
    );
});

test("capacity suppresses a low-utility candidate and persists existing eviction", () => {
    const normalized = normalizeMemoryPatch(patch(
        factPatch("object:a", "location", "desk", 1, "last_observed").operations[0]!,
        factPatch("object:b", "location", "shelf", 2, "stable").operations[0]!,
    ), {
        phase: "executing",
        originSequence: 3,
        limits: { ...DEFAULT_WORKING_MEMORY_LIMITS, maxFacts: 1 },
    });
    assert.equal(normalized.operations.length, 1);
    assert.equal(normalized.suppressed[0]?.reason, "capacity_low_utility");

    const existing = applyMemoryPatch(
        createEmptyWorkingMemory(),
        factPatch("old", "location", "desk", 1, "last_observed"),
        { phase: "executing", originSequence: 2 },
    );
    const replacement = normalizeMemoryPatch(
        factPatch("new", "location", "shelf", 3, "stable"),
        {
            phase: "executing",
            originSequence: 4,
            workingMemory: existing,
            limits: { ...DEFAULT_WORKING_MEMORY_LIMITS, maxFacts: 1 },
        },
    );
    assert.equal(replacement.operations.at(-1)?.type, "evict_entries");
    const replayed = reduceWorkingMemory(existing, replacement, {
        derivedThroughSequence: 4,
    });
    assert.equal(replayed.facts[0]?.subject, "new");
});

test("protected active Plan dependencies reject an impossible capacity", () => {
    const withFact = applyMemoryPatch(
        createEmptyWorkingMemory(),
        factPatch("workspace", "ready", true, 1),
        { phase: "executing", originSequence: 2 },
    );
    const protectedMemory = applyMemoryPatch(withFact, patch({
        type: "create_plan_item",
        planItem: {
            description: "Protected plan",
            status: "active",
            dependsOnFactIds: [withFact.facts[0]!.id],
        },
    }), { phase: "executing", originSequence: 3 });

    assert.throws(
        () => normalizeMemoryPatch(patch({
            type: "create_hypothesis",
            hypothesis: { statement: "extra" },
        }), {
            phase: "executing",
            originSequence: 4,
            workingMemory: protectedMemory,
            limits: { ...DEFAULT_WORKING_MEMORY_LIMITS, maxFacts: 0 },
        }),
        /protected Working Memory exceeds capacity/,
    );
});

test("phase lifecycle removes executing intent but retains goal Facts", () => {
    let memory: WorkingMemory = applyMemoryPatch(
        createEmptyWorkingMemory(),
        factPatch("workspace", "configured", true, 1),
        { phase: "executing", originSequence: 2 },
    );
    memory = applyMemoryPatch(memory, patch(
        { type: "create_hypothesis", hypothesis: { statement: "Needs validation" } },
        { type: "create_blocker", blocker: { description: "Waiting for input" } },
    ), { phase: "executing", originSequence: 3 });
    const cleaned = reduceWorkingMemory(
        memory,
        [createSupersedeScopeOperation("phase", {
            phase: "executing",
            kinds: ["hypothesis", "plan", "blocker"],
        })],
        { derivedThroughSequence: 4 },
    );
    assert.equal(cleaned.facts.length, 1);
    assert.deepEqual(cleaned.hypotheses, []);
    assert.deepEqual(cleaned.blockers, []);
});

