import test from "node:test";
import assert from "node:assert/strict";

import type { TrajectoryEvent } from "../../runtime/src/index.js";
import { projectTrajectoryEvents } from "../src/trajectory-projector.js";

function createEvent(partial: Partial<TrajectoryEvent> & { eventType: string; payload: any }): TrajectoryEvent {
    return {
        eventSchemaVersion: 1,
        eventId: "evt-" + Math.random().toString(36).slice(2, 8),
        sequence: partial.sequence ?? 1,
        occurredAt: partial.occurredAt ?? "2026-09-11T12:00:00.000Z",
        goalId: partial.goalId ?? "goal-test",
        runId: partial.runId ?? "run-test",
        phase: partial.phase ?? "executing",
        eventType: partial.eventType,
        payload: partial.payload,
        ...(partial.executionUnitId !== undefined ? { executionUnitId: partial.executionUnitId } : {}),
        ...(partial.stepIndex !== undefined ? { stepIndex: partial.stepIndex } : {}),
        ...(partial.actionId !== undefined ? { actionId: partial.actionId } : {}),
    } as TrajectoryEvent;
}

test("projectTrajectoryEvents handles empty committed events gracefully", () => {
    const steps = projectTrajectoryEvents({
        goalId: "goal-empty",
        committedEvents: [],
    });

    assert.equal(steps.length, 1);
    assert.equal(steps[0]?.title, "Step 1: Goal Initialized");
    assert.equal(steps[0]?.totalSteps, 1);
    assert.deepEqual(steps[0]?.lifecycleDetails, ["No trajectory events recorded."]);
});

test("projectTrajectoryEvents groups initialization events into Step 1", () => {
    const events: TrajectoryEvent[] = [
        createEvent({
            sequence: 1,
            phase: "executing",
            eventType: "goal_created",
            payload: { type: "goal_created", intent: "Inspect codebase" },
        }),
        createEvent({
            sequence: 2,
            phase: "executing",
            eventType: "run_started",
            payload: { type: "run_started" },
        }),
        createEvent({
            sequence: 3,
            phase: "executing",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "task_proposal",
                    task: {
                        objective: "Inspect codebase",
                        completionCriteria: [{ text: "Inspect done" }],
                    },
                    approvalRequest: "Approve the task",
                },
            },
        }),
    ];

    const steps = projectTrajectoryEvents({
        goalId: "goal-execution",
        committedEvents: events,
    });

    assert.equal(steps.length, 1);
    assert.equal(steps[0]?.index, 0);
    assert.equal(steps[0]?.totalSteps, 1);
    assert.equal(steps[0]?.title, "Step 1: Goal Initialized");
    assert.ok(steps[0]?.lifecycleDetails?.includes("Goal created: Inspect codebase"));
    assert.ok(steps[0]?.lifecycleDetails?.includes("Run started"));
    assert.ok(steps[0]?.lifecycleDetails?.includes("Task proposal: Inspect codebase"));
});

test("projectTrajectoryEvents projects executionUnitId into discrete execution steps", () => {
    const events: TrajectoryEvent[] = [
        createEvent({
            sequence: 1,
            phase: "executing",
            eventType: "goal_created",
            payload: { type: "goal_created", intent: "Run test" },
        }),
        createEvent({
            sequence: 2,
            phase: "executing",
            executionUnitId: "eu-1",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "tool_call",
                    action: { actionId: "act-1", toolId: "read_file", input: { path: "README.md" } },
                },
            },
        }),
        createEvent({
            sequence: 3,
            phase: "executing",
            executionUnitId: "eu-1",
            eventType: "action_staged",
            payload: {
                type: "action_staged",
                action: { actionId: "act-1", toolId: "read_file", input: { path: "README.md" } },
                approvalStatus: "approved",
            },
        }),
        createEvent({
            sequence: 4,
            phase: "executing",
            executionUnitId: "eu-1",
            eventType: "tool_started",
            occurredAt: "2026-09-11T12:00:00.000Z",
            payload: { type: "tool_started", actionId: "act-1", toolId: "read_file", input: { path: "README.md" } },
        }),
        createEvent({
            sequence: 5,
            phase: "executing",
            executionUnitId: "eu-1",
            eventType: "tool_finished",
            occurredAt: "2026-09-11T12:00:00.250Z",
            payload: {
                type: "tool_finished",
                actionId: "act-1",
                toolId: "read_file",
                observation: { kind: "success", output: "File content", summary: "read" },
            },
        }),
        createEvent({
            sequence: 6,
            phase: "executing",
            eventType: "run_completed",
            payload: { type: "run_completed", summary: "File read successfully" },
        }),
    ];

    const steps = projectTrajectoryEvents({
        goalId: "goal-exec",
        committedEvents: events,
    });

    assert.equal(steps.length, 2);
    // Step 1: Initialized
    assert.equal(steps[0]?.index, 0);
    assert.equal(steps[0]?.totalSteps, 2);
    assert.equal(steps[0]?.title, "Step 1: Goal Initialized");

    // Step 2: Execution eu-1
    const execStep = steps[1]!;
    assert.equal(execStep.index, 1);
    assert.equal(execStep.totalSteps, 2);
    assert.equal(execStep.executionUnitId, "eu-1");
    assert.equal(execStep.title, "Step 2: Execution (eu-1)");

    assert.equal(execStep.decision?.kind, "tool_call");
    assert.equal(execStep.decision?.toolCall?.toolId, "read_file");

    assert.equal(execStep.action?.toolId, "read_file");
    assert.equal(execStep.action?.approvalStatus, "auto_approved");

    assert.equal(execStep.observation?.status, "success");
    assert.equal(execStep.observation?.durationMs, 250);
    assert.equal(execStep.observation?.observationPreview, "File content");
    assert.equal(execStep.observation?.isTruncated, false);

    // Terminal result is mapped to the final step
    assert.equal(execStep.result?.outcome, "completed");
    assert.equal(execStep.result?.summary, "File read successfully");
});

test("projectTrajectoryEvents records action rejection and reasons", () => {
    const events: TrajectoryEvent[] = [
        createEvent({
            sequence: 1,
            phase: "executing",
            executionUnitId: "eu-reject",
            eventType: "action_staged",
            payload: {
                type: "action_staged",
                action: { actionId: "act-del", toolId: "delete_file", input: { path: "important.db" } },
                approvalStatus: "awaiting_approval",
            },
        }),
        createEvent({
            sequence: 2,
            phase: "executing",
            executionUnitId: "eu-reject",
            eventType: "action_rejected",
            payload: { type: "action_rejected", actionId: "act-del", reason: "Operation too risky" },
        }),
    ];

    const steps = projectTrajectoryEvents({
        goalId: "goal-rej",
        committedEvents: events,
    });

    assert.equal(steps.length, 2);
    const execStep = steps[1]!;
    assert.equal(execStep.action?.approvalStatus, "rejected");
    assert.equal(execStep.action?.rejectionReason, "Operation too risky");
});

test("projectTrajectoryEvents truncates observation exceeding 10 lines and marks uncommittedTail warning", () => {
    const longOutput = Array.from({ length: 25 }, (_, i) => "Line " + (i + 1)).join("\n");
    const events: TrajectoryEvent[] = [
        createEvent({
            sequence: 1,
            phase: "executing",
            executionUnitId: "eu-long",
            eventType: "tool_finished",
            payload: {
                type: "tool_finished",
                actionId: "act-long",
                toolId: "bash",
                observation: { kind: "success", output: longOutput, summary: "long" },
            },
        }),
    ];

    const uncommittedTail: TrajectoryEvent[] = [
        createEvent({
            sequence: 2,
            phase: "executing",
            eventType: "execution_error",
            payload: { type: "execution_error", code: "CRASH", message: "Process died" },
        }),
    ];

    const steps = projectTrajectoryEvents({
        goalId: "goal-tail",
        committedEvents: events,
        uncommittedTail,
    });

    assert.equal(steps.length, 2);
    const execStep = steps[1]!;
    assert.equal(execStep.observation?.isTruncated, true);
    assert.ok(execStep.observation?.observationPreview.includes("... (15 more lines)"));
    assert.equal(execStep.uncommittedWarning, "[Uncommitted Tail: 1 events occurred after snapshot boundary]");
});

test("projectTrajectoryEvents lists committed repair attempts and stable execution errors", () => {
    const events: TrajectoryEvent[] = [
        createEvent({
            sequence: 1,
            executionUnitId: "eu-repair",
            eventType: "model_repair_attempt_started",
            payload: { type: "model_repair_attempt_started", stage: "decide", attempt: 2, inputBoundary: `sha256:${"a".repeat(64)}` },
        }),
        createEvent({
            sequence: 2,
            executionUnitId: "eu-repair",
            eventType: "model_repair_feedback_recorded",
            payload: {
                type: "model_repair_feedback_recorded", stage: "decide", attempt: 2,
                feedback: {
                    goalId: "goal-test", runId: "run-test", executionUnitId: "eu-repair", stepOrdinal: 1,
                    stage: "decide", origin: "response_parse", code: "INVALID_JSON", attempt: 2,
                    issues: [{ code: "syntax", path: [], message: "Return valid JSON" }],
                },
            },
        }),
        createEvent({
            sequence: 3,
            executionUnitId: "eu-repair",
            eventType: "model_request_retry_recorded",
            payload: { type: "model_request_retry_recorded", stage: "decide", attempt: 1, reason: "rate_limited", status: 429 },
        }),
        createEvent({
            sequence: 4,
            eventType: "execution_error",
            payload: { type: "execution_error", code: "MODEL_REQUEST_FAILED", message: "Model retries exhausted" },
        }),
    ];

    const steps = projectTrajectoryEvents({ goalId: "goal-test", committedEvents: events });
    assert.deepEqual(steps[1]?.recoveryDetails, [
        "decide repair attempt 2",
        "decide repair feedback: INVALID_JSON",
        "decide model request attempt 1 failed: rate_limited HTTP 429",
    ]);
    assert.deepEqual(steps[1]?.result, {
        outcome: "failed",
        errorCode: "MODEL_REQUEST_FAILED",
        errorMessage: "Model retries exhausted",
    });
    assert.equal(JSON.stringify(steps).includes('{"invalid":'), false);
});
