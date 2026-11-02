import assert from "node:assert/strict";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    createGoal,
    projectTrajectoryEventCorrelation,
    projectTrajectoryEventSummary,
    trajectoryWatermark,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
} from "../src/index";
import { currentProtocols } from "./current-fixtures";

const goalId = "goal-query-contract";
const runId = "run-query-contract";

function event(draft: TrajectoryEventDraft, sequence: number) {
    return allocateImmutableEvent(draft, sequence);
}

test("correlation reads action, model call and program identity from the event itself", () => {
    const staged = event({
        goalId,
        runId,
        phase: "executing",
        eventType: "action_staged",
        payload: {
            type: "action_staged",
            action: { actionId: "action-1", toolId: "read_file", input: { path: "a.txt" } },
            approvalStatus: "approved",
        },
    }, 1);
    assert.equal(projectTrajectoryEventCorrelation(staged).actionId, "action-1");

    const frame = event({
        goalId,
        runId,
        phase: "executing",
        eventType: "model_context_frame",
        payload: {
            type: "model_context_frame",
            stage: "think",
            epochNumber: 0,
            conversationPosition: 0,
            sections: [],
            modelCallId: "call-1",
        },
    }, 2);
    assert.equal(projectTrajectoryEventCorrelation(frame).modelCallId, "call-1");

    const program = event({
        goalId,
        runId,
        phase: "executing",
        eventType: "program_started",
        payload: {
            type: "program_started",
            programId: "program-1",
            parentActionId: "action-parent",
            codeHash: "a".repeat(64),
            workerHash: "b".repeat(64),
            nodeVersion: "22.22.2",
        },
    }, 3);
    assert.deepEqual(projectTrajectoryEventCorrelation(program), {
        programId: "program-1",
        parentActionId: "action-parent",
    });
});

test("summary uses only supplied relations for cross-event previews and model identity", () => {
    const started = event({
        goalId,
        runId,
        phase: "executing",
        executionUnitId: "unit-1",
        programId: "program-1",
        callIndex: 0,
        actionId: "action-1",
        eventType: "tool_started",
        payload: {
            type: "tool_started",
            actionId: "action-1",
            toolId: "read_file",
            input: { path: "a.txt" },
        },
    }, 4);
    const finished = event({
        goalId,
        runId,
        phase: "executing",
        executionUnitId: "unit-1",
        programId: "program-1",
        callIndex: 0,
        actionId: "action-1",
        eventType: "tool_finished",
        payload: {
            type: "tool_finished",
            actionId: "action-1",
            toolId: "read_file",
            observation: { kind: "success", output: { stdout: "hello" }, summary: "read" },
        },
    }, 5);
    const programStarted = event({
        goalId,
        runId,
        phase: "executing",
        eventType: "program_started",
        payload: {
            type: "program_started",
            programId: "program-1",
            parentActionId: "action-parent",
            codeHash: "a".repeat(64),
            workerHash: "b".repeat(64),
            nodeVersion: "22.22.2",
        },
    }, 3);
    const summary = projectTrajectoryEventSummary(started, {
        toolFinished: finished as Extract<TrajectoryEvent, { readonly eventType: "tool_finished" }>,
        programStarted: programStarted as Extract<TrajectoryEvent, { readonly eventType: "program_started" }>,
    });
    assert.equal(summary.actionId, "action-1");
    assert.equal(summary.parentActionId, "action-parent");
    assert.equal(summary.inputPreview, '{"path":"a.txt"}');
    assert.equal(summary.resultPreview, "hello");
    assert.equal(summary.title, "tool_started: read_file");

    const frame = event({
        goalId,
        runId,
        phase: "executing",
        executionUnitId: "unit-1",
        eventType: "model_context_frame",
        payload: {
            type: "model_context_frame",
            stage: "think",
            epochNumber: 0,
            conversationPosition: 0,
            sections: [],
            modelCallId: "call-1",
        },
    }, 6);
    const think = event({
        goalId,
        runId,
        phase: "executing",
        executionUnitId: "unit-1",
        eventType: "think_completed",
        payload: {
            type: "think_completed",
            requestId: "request-1",
            stepOrdinal: 1,
            goal: "inspect",
            output: "analysis",
        },
    }, 7);
    assert.equal(projectTrajectoryEventSummary(think, {
        modelContextFrame: frame as Extract<TrajectoryEvent, { readonly eventType: "model_context_frame" }>,
    }).modelCallId, "call-1");
});

test("watermark resolves the current run, completed runs and unknown runs", () => {
    const goal = createGoal({
        ...currentProtocols,
        id: goalId,
        intent: "查询边界",
        promptBundleVersion: 1,
        profile: { id: "profile", systemPrompt: "trace", instructions: [], toolIds: [] },
        runId,
    });
    const withBoundaries = {
        ...goal,
        state: {
            ...goal.state,
            run: { ...goal.state.run, committedThroughSequence: 5 },
            completedRuns: [{ runId: "run-completed", status: "completed" as const, stepCount: 1, committedThroughSequence: 7, messageRange: { start: 0, end: 0 } }],
        },
    };
    assert.equal(trajectoryWatermark(withBoundaries, runId), 5);
    assert.equal(trajectoryWatermark(withBoundaries, "run-completed"), 7);
    assert.equal(trajectoryWatermark(withBoundaries, "run-missing"), 0);
});
