import assert from "node:assert/strict";
import { test } from "node:test";

import {
    DEFAULT_WORKING_MEMORY_LIMITS,
    WorkingMemoryLimitsError,
    WorkingMemoryPatchError,
    applyMemoryPatch,
    createEmptyWorkingMemory,
    createSupersedeScopeOperation,
    normalizeMemoryPatch,
    reduceWorkingMemory,
    resolveWorkingMemoryLimits,
    validateMemoryPatch,
} from "../src/index";
import type {
    CanonicalMemoryOperation,
    MemoryPatch,
    WorkingMemory,
} from "../src/index";

function patch(...operations: MemoryPatch["operations"]): MemoryPatch {
    return { protocolVersion: 1, operations };
}

test("Patch normalization fills source metadata and reduction is deterministic", () => {
    const initial = createEmptyWorkingMemory();
    const input = patch(
        {
            type: "add_finding",
            finding: {
                id: "finding-config",
                statement: "配置文件位于项目根目录",
                evidenceSequences: [1],
            },
        },
        {
            type: "upsert_hypothesis",
            hypothesis: {
                id: "hypothesis-format",
                statement: "该文件使用 JSON 格式",
            },
        },
        {
            type: "upsert_plan_item",
            planItem: {
                id: "plan-read",
                description: "读取配置并核对字段",
            },
        },
        {
            type: "upsert_blocker",
            blocker: {
                id: "blocker-permission",
                description: "等待文件读取权限",
                scope: "goal",
            },
        },
        {
            type: "set_next_action",
            nextAction: {
                id: "next-read",
                description: "读取配置文件",
            },
        },
    );
    const normalized = normalizeMemoryPatch(input, {
        phase: "gathering_context",
        originSequence: 7,
        workingMemory: initial,
    });

    const first = reduceWorkingMemory(initial, normalized, {
        derivedThroughSequence: 7,
        revision: { eventId: "patch-7", sequence: 7 },
    });
    const second = reduceWorkingMemory(initial, normalized, {
        derivedThroughSequence: 7,
        revision: { eventId: "patch-7", sequence: 7 },
    });

    assert.deepEqual(first, second);
    assert.equal(first.findings[0]?.originPhase, "gathering_context");
    assert.equal(first.findings[0]?.originSequence, 7);
    assert.equal(first.findings[0]?.scope, "goal");
    assert.equal(first.hypotheses[0]?.scope, "phase");
    assert.equal(first.blockers[0]?.scope, "goal");
    assert.equal(first.nextAction?.description, "读取配置文件");
    assert.equal(initial.findings.length, 0);
    assert.equal(initial.derivedThroughSequence, 0);
});

test("optional updates preserve stable identity and inactive transitions remove entries from active projection", () => {
    const first = applyMemoryPatch(
        createEmptyWorkingMemory(),
        patch({
            type: "add_finding",
            finding: {
                id: "finding-1",
                statement: "初始事实",
                evidenceSequences: [1],
            },
        }),
        { phase: "executing", originSequence: 1 },
    );
    const updated = applyMemoryPatch(
        first,
        patch({
            type: "update_finding",
            finding: {
                id: "finding-1",
                statement: "更新后的事实",
            },
        }),
        { phase: "executing", originSequence: 2 },
    );
    assert.equal(updated.findings[0]?.id, "finding-1");
    assert.equal(updated.findings[0]?.statement, "更新后的事实");
    assert.equal(updated.findings[0]?.originSequence, 2);

    const resolved = applyMemoryPatch(
        updated,
        patch({
            type: "update_finding",
            finding: {
                id: "finding-1",
                status: "resolved",
            },
        }),
        {
            phase: "executing",
            originSequence: 3,
            revision: { eventId: "patch-3", sequence: 3 },
        },
    );
    assert.deepEqual(resolved.findings, []);
    assert.deepEqual(resolved.revision, {
        eventId: "patch-3",
        sequence: 3,
    });
});

test("invalid Patch is rejected atomically before any reduction", () => {
    const memory = createEmptyWorkingMemory();
    const before = structuredClone(memory);

    assert.throws(
        () => validateMemoryPatch(patch(
            {
                type: "add_finding",
                finding: {
                    id: "duplicate",
                    statement: "事实 A",
                    evidenceSequences: [1],
                },
            },
            {
                type: "upsert_plan_item",
                planItem: {
                    id: "duplicate",
                    description: "计划 B",
                },
            },
        )),
        WorkingMemoryPatchError,
    );
    assert.throws(
        () => validateMemoryPatch({
            protocolVersion: 1,
            operations: [{
                type: "add_finding",
                finding: {
                    id: "control-injection",
                    statement: "不应写入",
                    evidenceSequences: [1],
                    checkpoint: "forbidden",
                },
            }],
        }),
        WorkingMemoryPatchError,
    );
    assert.throws(
        () => validateMemoryPatch(patch({
            type: "update_finding",
            finding: { id: "missing", statement: "不存在" },
        }), { workingMemory: memory }),
        WorkingMemoryPatchError,
    );
    assert.deepEqual(memory, before);
});

test("limits reject oversized patches without truncation", () => {
    assert.deepEqual(DEFAULT_WORKING_MEMORY_LIMITS, {
        maxOperations: 32,
        maxSerializedBytes: 32768,
        maxStableIdLength: 128,
        maxTextLength: 2048,
        maxEvidenceReferences: 16,
        maxFindings: 64,
        maxHypotheses: 32,
        maxPlanItems: 32,
        maxBlockers: 16,
    });
    assert.throws(
        () => resolveWorkingMemoryLimits({ maxOperations: -1 }),
        WorkingMemoryLimitsError,
    );
    assert.throws(
        () => validateMemoryPatch(
            patch({
                type: "add_finding",
                finding: {
                    id: "too-long",
                    statement: "x".repeat(10),
                    evidenceSequences: [1],
                },
            }),
            { limits: { maxTextLength: 5 } },
        ),
        /maxTextLength/,
    );
    assert.throws(
        () => validateMemoryPatch(
            patch(
                {
                    type: "upsert_hypothesis",
                    hypothesis: { id: "one", statement: "one" },
                },
                {
                    type: "upsert_hypothesis",
                    hypothesis: { id: "two", statement: "two" },
                },
            ),
            { limits: { maxOperations: 1 } },
        ),
        /maxOperations/,
    );
});

test("lifecycle supersede operation removes only matching phase entries", () => {
    const memory: WorkingMemory = {
        protocolVersion: 1,
        derivedThroughSequence: 4,
        findings: [{
            kind: "finding",
            id: "finding-goal",
            originPhase: "gathering_context",
            originSequence: 1,
            scope: "goal",
            status: "active",
            statement: "保留事实",
            evidenceSequences: [1],
        }],
        hypotheses: [{
            kind: "hypothesis",
            id: "hypothesis-old",
            originPhase: "gathering_context",
            originSequence: 2,
            scope: "phase",
            status: "active",
            statement: "旧假设",
        }],
        plan: [{
            kind: "plan",
            id: "plan-old",
            originPhase: "planning",
            originSequence: 3,
            scope: "phase",
            status: "active",
            description: "新计划",
        }],
        blockers: [],
        nextAction: {
            kind: "next_action",
            id: "next-old",
            originPhase: "gathering_context",
            originSequence: 2,
            scope: "phase",
            status: "active",
            description: "旧下一步",
        },
    };
    const operation = createSupersedeScopeOperation("phase", {
        phase: "gathering_context",
    });
    const next = reduceWorkingMemory(memory, [operation], {
        derivedThroughSequence: 5,
    });
    assert.deepEqual(next.findings.map((entry) => entry.id), ["finding-goal"]);
    assert.deepEqual(next.hypotheses, []);
    assert.deepEqual(next.plan.map((entry) => entry.id), ["plan-old"]);
    assert.equal(next.nextAction, undefined);
    assert.equal(memory.hypotheses.length, 1);
});

test("empty Patch leaves collections untouched while advancing only an explicit boundary", () => {
    const memory = createEmptyWorkingMemory();
    const normalized = normalizeMemoryPatch(
        { protocolVersion: 1, operations: [] },
        { phase: "planning", originSequence: 6, workingMemory: memory },
    );
    const next = reduceWorkingMemory(memory, normalized, {
        derivedThroughSequence: 6,
    });
    assert.deepEqual(next.findings, []);
    assert.equal(next.derivedThroughSequence, 6);
    assert.equal(next.revision, undefined);
});

test("canonical operations can be reduced in order without mutating their source", () => {
    const operations: CanonicalMemoryOperation[] = [{
        type: "set_next_action",
        nextAction: {
            kind: "next_action",
            id: "next-1",
            originPhase: "executing",
            originSequence: 1,
            scope: "phase",
            status: "active",
            description: "执行下一步",
        },
    }];
    const snapshot = structuredClone(operations);
    const next = reduceWorkingMemory(createEmptyWorkingMemory(), operations, {
        derivedThroughSequence: 1,
    });
    assert.equal(next.nextAction?.id, "next-1");
    assert.deepEqual(operations, snapshot);
});
