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

    assert.throws(
        () => assertValidTrajectoryEventDraft({
            goalId: "goal-1",
            runId: "run-1",
            phase: "executing",
            eventType: "run_created",
            payload: { type: "run_created", mode: "plan", todoId: "todo-1" },
        } as unknown as TrajectoryEventDraft),
        (error: unknown) => error instanceof TrajectoryProtocolError
            && error.message.includes("run_created contains unknown fields"),
    );
    for (const mode of [undefined, "invalid"] as const) {
        assert.throws(
            () => assertValidTrajectoryEventDraft({
                goalId: "goal-1",
                runId: "run-1",
                phase: "executing",
                eventType: "run_created",
                payload: { type: "run_created", ...(mode === undefined ? {} : { mode }) },
            } as unknown as TrajectoryEventDraft),
            (error: unknown) => error instanceof TrajectoryProtocolError
                && error.message.includes("run_created.mode must be normal or plan"),
        );
    }
});

test("model repair feedback events validate identity, origin, attempt, and bounded issue fields", () => {
    const draft: TrajectoryEventDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        executionUnitId: "unit-1",
        stepIndex: 1,
        eventType: "model_repair_feedback_recorded",
        payload: {
            type: "model_repair_feedback_recorded",
            stage: "decide",
            attempt: 1,
            feedback: {
                goalId: "goal-1",
                runId: "run-1",
                executionUnitId: "unit-1",
                stepOrdinal: 1,
                stage: "decide",
                origin: "tool_input",
                code: "INVALID_TOOL_INPUT",
                attempt: 1,
                issues: [{ code: "invalid_input", path: ["path"], message: "Correct the tool input." }],
            },
        },
    };
    assert.doesNotThrow(() => assertValidTrajectoryEventDraft(draft));

    const invalidFeedbacks: unknown[] = [
        { ...draft.payload.feedback, origin: "unknown" },
        { ...draft.payload.feedback, attempt: 2 },
        { ...draft.payload.feedback, issues: [{ code: "bad", path: [], message: "x".repeat(241) }] },
        { ...draft.payload.feedback, secret: "unexpected" },
    ];
    for (const feedback of invalidFeedbacks) {
        assert.throws(() => assertValidTrajectoryEventDraft({
            ...draft,
            payload: { ...draft.payload, feedback } as unknown as typeof draft.payload,
        }));
    }
});

test("Tool attempt facts reject unknown, unbounded, and out-of-order retry data", () => {
    const base = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing" as const,
        executionUnitId: "unit-1",
        actionId: "action-1",
    };
    assert.doesNotThrow(() => assertValidTrajectoryEventDraft({
        ...base,
        eventType: "tool_attempt_started",
        payload: { type: "tool_attempt_started", actionId: "action-1", attempt: 3 },
    }));
    for (const payload of [
        { type: "tool_attempt_started", actionId: "action-1", attempt: 4 },
        { type: "tool_attempt_failed", actionId: "action-1", attempt: 1, reason: "x".repeat(121) },
        { type: "tool_attempt_failed", actionId: "action-1", attempt: 1, reason: "network", retryAfterMs: 30_001 },
    ]) {
        assert.throws(() => assertValidTrajectoryEventDraft({
            ...base,
            eventType: payload.type,
            payload,
        } as unknown as TrajectoryEventDraft));
    }
});

test("computeContentHash 计算合法哈希，且旧 preparation_input_recorded 事件被严格拒绝", () => {
    assert.equal(
        computeContentHash("hello"),
        "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );

    const askUserDraft: TrajectoryEventDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        eventType: "ask_user_answered",
        payload: {
            type: "ask_user_answered",
            requestId: "req-1",
            answers: [{ questionId: "q-1", optionIds: ["opt-1"] }],
        },
    };

    const event = allocateImmutableEvent(askUserDraft, 1, "event-ask-user");
    assert.deepEqual(event.payload, askUserDraft.payload);
    assert.equal(classifyTrajectoryEvent(event), "lifecycle");

    const legacyDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        eventType: "preparation_input_recorded",
        payload: {
            type: "preparation_input_recorded",
            messageIndex: 0,
            contentHash: computeContentHash("hello"),
        },
    };

    assert.throws(
        () => assertValidTrajectoryEventDraft(legacyDraft),
        /eventType is invalid/,
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

test("decision_received 保留 thought 属性且缺省时向下兼容，旧 preparation_result 被严格拒绝", () => {
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

    // 3. 旧 preparation_result 事件被严格拒绝
    const prepResultDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        eventType: "preparation_result",
        payload: {
            type: "preparation_result",
            result: "context_ready",
            thought: "All necessary context has been discovered.",
        },
    };
    assert.throws(
        () => assertValidTrajectoryEventDraft(prepResultDraft),
        /eventType is invalid/,
    );
});
