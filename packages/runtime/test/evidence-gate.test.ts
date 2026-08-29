import assert from "node:assert/strict";
import { test } from "node:test";

import {
    EvidenceGateError,
    allocateImmutableEvent,
    buildCommittedEvidenceIndex,
    createEvidenceGate,
    validateFindingEvidence,
    validateMemoryPatchEvidence,
} from "../src/index";
import type { MemoryPatch, TrajectoryEvent } from "../src/index";

const goalId = "evidence-goal";
const runId = "evidence-run";

function event(
    sequence: number,
    eventType: "observation_recorded" | "tool_finished" | "decision_received" | "state_committed",
    goal = goalId,
): TrajectoryEvent {
    switch (eventType) {
        case "observation_recorded":
            return allocateImmutableEvent({
                goalId: goal,
                runId,
                phase: "executing",
                eventType,
                actionId: "action-1",
                payload: {
                    type: eventType,
                    actionId: "action-1",
                    observation: {
                        kind: "success",
                        output: { path: "README.md" },
                        summary: "读取成功",
                    },
                },
            }, sequence, `event-${sequence}`);
        case "tool_finished":
            return allocateImmutableEvent({
                goalId: goal,
                runId,
                phase: "executing",
                eventType,
                actionId: "action-1",
                payload: {
                    type: eventType,
                    actionId: "action-1",
                    toolId: "read_file",
                    observation: {
                        kind: "success",
                        output: "README contents",
                        summary: "工具读取完成",
                    },
                },
            }, sequence, `event-${sequence}`);
        case "decision_received":
            return allocateImmutableEvent({
                goalId: goal,
                runId,
                phase: "executing",
                eventType,
                executionUnitId: "unit-1",
                payload: {
                    type: eventType,
                    decision: {
                        kind: "complete",
                        checkpoint: "旧协议审计文本",
                        summary: "不应作为事实证据",
                    },
                },
            }, sequence, `event-${sequence}`);
        case "state_committed":
            return allocateImmutableEvent({
                goalId: goal,
                runId,
                phase: "executing",
                eventType,
                payload: {
                    type: eventType,
                    committedThroughSequence: sequence,
                },
            }, sequence, `event-${sequence}`);
    }
}

function indexWithEvents(): ReturnType<typeof buildCommittedEvidenceIndex> {
    return buildCommittedEvidenceIndex({
        goalId,
        runId,
        committedThroughSequence: 4,
        events: [
            event(1, "observation_recorded"),
            event(2, "tool_finished"),
            event(3, "decision_received"),
            event(4, "state_committed"),
            event(5, "observation_recorded"),
            event(6, "observation_recorded", "other-goal"),
        ],
    });
}

test("Evidence index selects only matching Goal/Run events inside Snapshot boundary", () => {
    const index = buildCommittedEvidenceIndex({
        goalId,
        runId,
        committedThroughSequence: 4,
        events: [
            event(1, "observation_recorded"),
            event(2, "tool_finished"),
            event(3, "decision_received"),
            event(4, "state_committed"),
            event(5, "observation_recorded"),
            event(6, "observation_recorded", "other-goal"),
        ],
    });

    assert.equal(index.has(1), true);
    assert.equal(index.has(4), true);
    assert.equal(index.has(5), false);
    assert.equal(index.has(6), false);
    assert.equal(index.get(1)?.goalId, goalId);
    assert.equal(index.events.size, 4);
});

test("Evidence Gate accepts committed observations and rejects non-evidence, tail, missing, or cross-source sequences", () => {
    const index = indexWithEvents();
    validateFindingEvidence([1, 2], index);

    for (const sequence of [3, 4, 5, 6, 99]) {
        assert.throws(
            () => validateFindingEvidence([sequence], index),
            (error: unknown) => error instanceof EvidenceGateError,
        );
    }
    assert.throws(
        () => validateFindingEvidence([], index),
        EvidenceGateError,
    );
});

test("rejected Observation is not usable as Finding evidence", () => {
    const rejected = allocateImmutableEvent({
        goalId,
        runId,
        phase: "executing",
        eventType: "observation_recorded",
        actionId: "action-rejected",
        payload: {
            type: "observation_recorded",
            actionId: "action-rejected",
            observation: { kind: "rejected", reason: "用户拒绝" },
        },
    }, 1, "rejected-event");
    const index = buildCommittedEvidenceIndex({
        goalId,
        runId,
        committedThroughSequence: 1,
        events: [rejected],
    });
    assert.throws(
        () => validateFindingEvidence([1], index),
        EvidenceGateError,
    );
});

test("Patch Evidence Gate checks only Finding references and preserves Hypothesis boundary", () => {
    const index = indexWithEvents();
    const validFinding: MemoryPatch = {
        protocolVersion: 1,
        operations: [{
            type: "add_finding",
            finding: {
                id: "finding-valid",
                statement: "README 可读取",
                evidenceSequences: [1],
            },
        }],
    };
    assert.doesNotThrow(() => validateMemoryPatchEvidence(validFinding, index));

    const hypothesisOnly: MemoryPatch = {
        protocolVersion: 1,
        operations: [{
            type: "upsert_hypothesis",
            hypothesis: {
                id: "hypothesis-unknown",
                statement: "可能还有隐藏配置",
            },
        }],
    };
    assert.doesNotThrow(() => validateMemoryPatchEvidence(hypothesisOnly, index));

    const invalidFinding: MemoryPatch = {
        protocolVersion: 1,
        operations: [{
            type: "add_finding",
            finding: {
                id: "finding-tail",
                statement: "未提交观察不能成为事实",
                evidenceSequences: [5],
            },
        }],
    };
    assert.throws(
        () => validateMemoryPatchEvidence(invalidFinding, index),
        EvidenceGateError,
    );
});

test("Gate object is bound to one immutable index and supports update evidence fallback", () => {
    const index = indexWithEvents();
    const gate = createEvidenceGate(index);
    gate.validateFinding([1]);

    const memory = {
        protocolVersion: 1 as const,
        derivedThroughSequence: 2,
        findings: [{
            kind: "finding" as const,
            id: "finding-existing",
            originPhase: "executing" as const,
            originSequence: 1,
            scope: "goal" as const,
            status: "active" as const,
            statement: "已有事实",
            evidenceSequences: [1],
        }],
        hypotheses: [],
        plan: [],
        blockers: [],
    };
    gate.validatePatch({
        protocolVersion: 1,
        operations: [{
            type: "update_finding",
            finding: { id: "finding-existing", statement: "事实更新" },
        }],
    }, memory);
});
