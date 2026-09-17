import assert from "node:assert/strict";
import { test } from "node:test";

import {
    TrajectoryProtocolError,
    allocateImmutableEvent,
    assertValidTrajectoryEventDraft,
    classifyTrajectoryEvent,
    computeContentHash,
    createNoopDiagnosticTraceSink,
    projectTrajectoryEvent,
} from "../src/index";
import type {
    TraceRecord,
    TrajectoryEventDraft,
} from "../src/index";

const startedDraft: TrajectoryEventDraft = {
    goalId: "goal-1",
    runId: "run-1",
    phase: "executing",
    executionUnitId: "unit-1",
    eventType: "run_started",
    payload: { type: "run_started" },
};

test("trajectory events retain explicit order and are immutable", () => {
    const first = allocateImmutableEvent(startedDraft, 1, "event-1");
    const second = allocateImmutableEvent({
        ...startedDraft,
        eventType: "state_committed",
        payload: { type: "state_committed", committedThroughSequence: first.sequence },
    }, 2, "event-2");

    assert.equal(first.sequence, 1);
    assert.equal(second.sequence, 2);
    assert.notEqual(first.eventId, second.eventId);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.payload), true);
    assert.throws(() => {
        (first.payload as { type: string }).type = "run_failed";
    }, TypeError);
});

test("draft validation rejects derived state and mismatched payload type", () => {
    assert.throws(
        () => assertValidTrajectoryEventDraft({
            ...startedDraft,
            payload: {
                type: "run_started",
                currentRunStatus: "running",
            },
        }),
        (error: unknown) => error instanceof TrajectoryProtocolError
            && error.code === "TRAJECTORY_PROTOCOL_ERROR",
    );

    assert.throws(
        () => assertValidTrajectoryEventDraft({
            ...startedDraft,
            payload: { type: "run_failed" },
        }),
        /payload\.type must match eventType/,
    );
});

test("preparation input provenance uses a strict hash-only lifecycle payload", () => {
    assert.equal(
        computeContentHash("hello"),
        "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );

    const draft: TrajectoryEventDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "gathering_context",
        eventType: "preparation_input_recorded",
        payload: {
            type: "preparation_input_recorded",
            messageIndex: 0,
            contentHash: computeContentHash("hello"),
        },
    };

    const event = allocateImmutableEvent(draft, 1, "event-provenance");
    assert.deepEqual(event.payload, draft.payload);
    assert.equal(classifyTrajectoryEvent(event), "lifecycle");

    assert.throws(
        () => assertValidTrajectoryEventDraft({
            ...draft,
            payload: { ...draft.payload, sourceText: "hello" },
        }),
        /contains unknown fields/,
    );
    assert.throws(
        () => assertValidTrajectoryEventDraft({
            ...draft,
            payload: { ...draft.payload, contentHash: "sha256:bad" },
        }),
        /contentHash is invalid/,
    );
    assert.throws(
        () => assertValidTrajectoryEventDraft({
            ...draft,
            phase: "executing",
        }),
        /not allowed in executing phase/,
    );
});

test("event metadata is validated and projection keeps only read-only correlation fields", () => {
    assert.throws(
        () => allocateImmutableEvent({
            ...startedDraft,
            phase: "invalid" as "executing",
        }, 1),
        /phase is invalid/,
    );

    const event = allocateImmutableEvent({
        ...startedDraft,
        actionId: "action-1",
        parentEventId: "event-0",
    }, 3, "event-3");
    assert.equal(classifyTrajectoryEvent(event), "lifecycle");
    assert.deepEqual(projectTrajectoryEvent(event), {
        eventId: "event-3",
        sequence: 3,
        eventType: "run_started",
        category: "lifecycle",
        phase: "executing",
        executionUnitId: "unit-1",
        actionId: "action-1",
        parentEventId: "event-0",
    });
    assert.equal(Object.isFrozen(projectTrajectoryEvent(event)), true);
});

test("diagnostic trace uses an independent no-op channel", async () => {
    const sink = createNoopDiagnosticTraceSink();
    const record: TraceRecord = {
        traceSchemaVersion: 1,
        traceId: "trace-1",
        goalId: "goal-1",
        runId: "run-1",
        kind: "model_request",
        occurredAt: new Date().toISOString(),
        payload: { providerRequestId: "request-1" },
    };

    await sink.append(record);
    assert.equal(record.kind, "model_request");
});

test("需求 4.2 & 4.3: decision_received 与 preparation_result 保留 thought 属性，且缺省时完全向下兼容", () => {
    // 1. 带 thought 的 decision_received
    const decisionWithThoughtDraft: TrajectoryEventDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        executionUnitId: "unit-1",
        eventType: "decision_received",
        payload: {
            type: "decision_received",
            decision: {
                kind: "wait",
                reason: "Waiting for user confirmation",
            },
            thought: "I need user input to proceed safely.",
        },
    };

    assertValidTrajectoryEventDraft(decisionWithThoughtDraft);
    const decisionEvent = allocateImmutableEvent(decisionWithThoughtDraft, 10, "evt-decision-thought");
    assert.equal((decisionEvent.payload as any).thought, "I need user input to proceed safely.");
    assert.equal(classifyTrajectoryEvent(decisionEvent), "decision");

    // 2. 缺省 thought 的 decision_received（完全兼容）
    const decisionWithoutThoughtDraft: TrajectoryEventDraft = {
        ...decisionWithThoughtDraft,
        payload: {
            type: "decision_received",
            decision: {
                kind: "wait",
                reason: "Waiting for user confirmation",
            },
        },
    };
    assertValidTrajectoryEventDraft(decisionWithoutThoughtDraft);
    const legacyDecisionEvent = allocateImmutableEvent(decisionWithoutThoughtDraft, 11, "evt-decision-legacy");
    assert.equal((legacyDecisionEvent.payload as any).thought, undefined);

    // 3. 带 thought 的 preparation_result
    const prepWithThoughtDraft: TrajectoryEventDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "gathering_context",
        eventType: "preparation_result",
        payload: {
            type: "preparation_result",
            result: "context_ready",
            thought: "All necessary context has been discovered from the repository.",
        },
    };
    assertValidTrajectoryEventDraft(prepWithThoughtDraft);
    const prepEvent = allocateImmutableEvent(prepWithThoughtDraft, 12, "evt-prep-thought");
    assert.equal((prepEvent.payload as any).thought, "All necessary context has been discovered from the repository.");
    assert.equal(classifyTrajectoryEvent(prepEvent), "decision");

    // 4. 缺省 thought 的 preparation_result
    const prepWithoutThoughtDraft: TrajectoryEventDraft = {
        ...prepWithThoughtDraft,
        payload: {
            type: "preparation_result",
            result: "context_ready",
        },
    };
    assertValidTrajectoryEventDraft(prepWithoutThoughtDraft);
    const legacyPrepEvent = allocateImmutableEvent(prepWithoutThoughtDraft, 13, "evt-prep-legacy");
    assert.equal((legacyPrepEvent.payload as any).thought, undefined);
});

