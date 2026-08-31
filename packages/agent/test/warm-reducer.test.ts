import assert from "node:assert/strict";
import { test } from "node:test";

import {
    WarmReducer,
    createDefaultWarmPartitionQuotas,
    reinforceWarmEntry,
} from "../src/index";
import type {
    WarmCompactEntry,
    WarmPartitionQuota,
} from "../src/index";

const sizeBySummary = {
    unit: "character" as const,
    estimate: (value: unknown) => (value as WarmCompactEntry).summary.length,
};

test("WarmReducer 按 stable ID 合并，不因重复 replay 累加 reinforcement", () => {
    const entries = [
        entry({
            id: "finding-1",
            summary: "old",
            sourceHash: "sha256:old",
            firstSequence: 2,
            lastSequence: 2,
            lastAccessedSequence: 2,
            evidenceSequences: [2],
            reinforcementCount: 1,
        }),
        entry({
            id: "finding-1",
            summary: "new",
            sourceHash: "sha256:new",
            firstSequence: 2,
            lastSequence: 4,
            lastAccessedSequence: 5,
            evidenceSequences: [4],
            reinforcementCount: 2,
        }),
    ];

    const result = new WarmReducer({
        estimator: sizeBySummary,
        quotas: quotas({ finding: { maxEntries: 4, maxMeasurement: 100 } }),
    }).reduce(entries);
    const merged = result.retained[0]!;

    assert.equal(result.retained.length, 1);
    assert.equal(merged.summary, "new");
    assert.equal(merged.sourceHash, "sha256:new");
    assert.deepEqual(merged.evidenceSequences, [2, 4]);
    assert.equal(merged.firstSequence, 2);
    assert.equal(merged.lastSequence, 4);
    assert.equal(merged.lastAccessedSequence, 5);
    assert.equal(merged.reinforcementCount, 2);
});

test("WarmReducer 删除 superseded，并按分区条目数和计量上限产生 overflow", () => {
    const result = new WarmReducer({
        estimator: sizeBySummary,
        quotas: quotas({
            finding: { maxEntries: 1, maxMeasurement: 5 },
            decision: { maxEntries: 1, maxMeasurement: 100 },
        }),
        protectedIds: ["finding-protected", "finding-other"],
    }).reduce([
        entry({
            id: "finding-protected",
            summary: "fit",
            firstSequence: 1,
            lastSequence: 1,
            lastAccessedSequence: 1,
            evidenceSequences: [1],
        }),
        entry({
            id: "finding-other",
            summary: "too-long",
            firstSequence: 2,
            lastSequence: 2,
            lastAccessedSequence: 2,
            evidenceSequences: [2],
        }),
        entry({
            id: "finding-stale",
            summary: "stale",
            status: "superseded",
            firstSequence: 3,
            lastSequence: 3,
            lastAccessedSequence: 3,
            evidenceSequences: [3],
        }),
        entry({
            id: "decision-resolved",
            kind: "decision",
            status: "resolved",
            summary: "resolved",
            firstSequence: 4,
            lastSequence: 4,
            lastAccessedSequence: 4,
            evidenceSequences: [4],
        }),
    ]);

    assert.deepEqual(result.retained.map((item) => item.id), [
        "decision-resolved",
        "finding-protected",
    ]);
    assert.deepEqual(result.overflowCandidates.map((item) => item.id), ["finding-other"]);
    assert.deepEqual(result.discarded.map((item) => item.id), ["finding-stale"]);
    assert.equal(result.retainedMeasurement, "resolved".length + "fit".length);
    assert.equal(result.overflowMeasurement, "too-long".length);
});

test("分区配额内 protected 只提升优先级，不能形成永久 Pin", () => {
    const result = new WarmReducer({
        estimator: sizeBySummary,
        quotas: quotas({ blocker: { maxEntries: 1, maxMeasurement: 100 } }),
        protectedIds: ["blocker-old", "blocker-new"],
    }).reduce([
        entry({
            id: "blocker-old",
            kind: "blocker",
            summary: "old",
            firstSequence: 1,
            lastSequence: 1,
            lastAccessedSequence: 1,
            evidenceSequences: [1],
        }),
        entry({
            id: "blocker-new",
            kind: "blocker",
            summary: "new",
            firstSequence: 2,
            lastSequence: 2,
            lastAccessedSequence: 2,
            evidenceSequences: [2],
        }),
    ]);

    assert.deepEqual(result.retained.map((item) => item.id), ["blocker-new"]);
    assert.deepEqual(result.overflowCandidates.map((item) => item.id), ["blocker-old"]);
});

test("语义 LRU 以状态、保护、reinforcement、访问和 stable ID 确定排序", () => {
    const result = new WarmReducer({
        estimator: sizeBySummary,
        quotas: quotas({ finding: { maxEntries: 2, maxMeasurement: 100 } }),
        protectedIds: ["protected"],
    }).reduce([
        entry({ id: "resolved-new", status: "resolved", summary: "r", lastSequence: 10, lastAccessedSequence: 10, firstSequence: 10, evidenceSequences: [10] }),
        entry({ id: "active-old", summary: "a", lastSequence: 1, lastAccessedSequence: 1, firstSequence: 1, evidenceSequences: [1], reinforcementCount: 1 }),
        entry({ id: "active-reinforced", summary: "b", lastSequence: 2, lastAccessedSequence: 2, firstSequence: 2, evidenceSequences: [2], reinforcementCount: 4 }),
        entry({ id: "protected", summary: "p", lastSequence: 0 + 3, lastAccessedSequence: 3, firstSequence: 3, evidenceSequences: [3] }),
    ]);

    assert.deepEqual(result.retained.map((item) => item.id), ["protected", "active-reinforced"]);
    assert.deepEqual(result.overflowCandidates.map((item) => item.id), ["resolved-new", "active-old"]);
});

test("reinforceWarmEntry 只接受新 committed evidence 或新的 retrieval 命中", () => {
    const original = entry({
        id: "finding-1",
        firstSequence: 2,
        lastSequence: 4,
        lastAccessedSequence: 4,
        evidenceSequences: [2, 4],
        reinforcementCount: 1,
    });
    const evidence = reinforceWarmEntry(original, {
        reason: "committed_evidence",
        sequence: 8,
        sourceHash: "sha256:8",
    });
    assert.deepEqual(evidence.evidenceSequences, [2, 4, 8]);
    assert.equal(evidence.lastSequence, 8);
    assert.equal(evidence.lastAccessedSequence, 8);
    assert.equal(evidence.reinforcementCount, 2);
    assert.equal(evidence.sourceHash, "sha256:8");

    const hit = reinforceWarmEntry(original, {
        reason: "retrieval_hit",
        sequence: 7,
    });
    assert.deepEqual(hit.evidenceSequences, original.evidenceSequences);
    assert.equal(hit.lastSequence, original.lastSequence);
    assert.equal(hit.lastAccessedSequence, 7);
    assert.equal(hit.reinforcementCount, 2);
    assert.throws(
        () => reinforceWarmEntry(original, { reason: "retrieval_hit", sequence: 4 }),
        /newer than lastAccessedSequence/,
    );
    assert.throws(
        () => reinforceWarmEntry(original, { reason: "committed_evidence", sequence: 4 }),
        /newer than lastSequence/,
    );
});

test("WarmReducer 不修改输入条目并冻结输出", () => {
    const input = [entry({ id: "finding-1", summary: "keep" })];
    const before = structuredClone(input);
    const result = new WarmReducer({ estimator: sizeBySummary }).reduce(input);

    assert.deepEqual(input, before);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.retained), true);
    assert.equal(Object.isFrozen(result.retained[0]), true);
});

function quotas(
    overrides: Partial<Record<WarmCompactEntry["kind"], WarmPartitionQuota>> = {},
) {
    return {
        ...createDefaultWarmPartitionQuotas(),
        ...overrides,
    };
}

function entry(
    overrides: Partial<WarmCompactEntry> = {},
): WarmCompactEntry {
    const firstSequence = overrides.firstSequence ?? 1;
    const lastSequence = overrides.lastSequence ?? firstSequence;
    return {
        id: "entry-1",
        kind: "finding",
        summary: "summary",
        status: "active",
        lossy: true,
        evidenceSequences: [firstSequence],
        firstSequence,
        lastSequence,
        lastAccessedSequence: overrides.lastAccessedSequence ?? lastSequence,
        reinforcementCount: 1,
        sourceHash: "sha256:entry-1",
        ...overrides,
    };
}
