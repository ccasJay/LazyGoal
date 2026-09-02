import assert from "node:assert/strict";
import { test } from "node:test";

import {
    TrajectoryProtocolError,
    allocateImmutableEvent,
    assertValidTrajectoryEventDraft,
    classifyTrajectoryEvent,
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
