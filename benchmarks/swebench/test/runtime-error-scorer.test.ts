import assert from "node:assert/strict";
import { test } from "node:test";

import type { TrajectoryEvent } from "../../../packages/runtime/src/index.js";
import { scoreRuntimeTrajectoryEvents } from "../src/runtime-error-scorer.js";

function makeEvent(sequence: number, payload: Record<string, unknown>): TrajectoryEvent {
    return {
        goalId: "goal-1",
        runId: "run-1",
        sequence,
        timestamp: "2026-10-23T00:00:00.000Z",
        payload: payload as unknown as TrajectoryEvent["payload"],
    };
}

test("scoreRuntimeTrajectoryEvents awards zeroFaultPass=true and runtimeScore=1.0 on a clean completed run with patch", () => {
    const events: TrajectoryEvent[] = [
        makeEvent(1, { type: "model_response_received", stage: "think" }),
        makeEvent(2, { type: "model_response_received", stage: "decide" }),
        makeEvent(3, {
            type: "tool_started",
            actionId: "act-1",
            toolId: "edit_file",
            input: { path: "src/foo.py" },
        }),
        makeEvent(4, {
            type: "tool_finished",
            actionId: "act-1",
            toolId: "edit_file",
            observation: { kind: "success", output: "Updated" },
        }),
        makeEvent(5, {
            type: "tool_started",
            actionId: "act-2",
            toolId: "bash",
            input: { command: "pytest" },
        }),
        makeEvent(6, {
            type: "tool_finished",
            actionId: "act-2",
            toolId: "bash",
            observation: { kind: "success", output: "1 passed" },
        }),
    ];

    const report = scoreRuntimeTrajectoryEvents({
        events,
        runStatus: "completed",
        stopReason: "end_turn",
        patch: "diff --git a/src/foo.py b/src/foo.py\n+return 1\n",
    });

    assert.equal(report.zeroFaultPass, true);
    assert.equal(report.runtimeScore, 1.0);
    assert.equal(report.callErrorRate, 0);
    assert.equal(report.repairCount, 0);
    assert.equal(report.stageRejectionCount, 0);
    assert.equal(report.toolFaultCount, 0);
    assert.equal(report.terminalFaultCount, 0);
    assert.equal(report.hasNonEmptyPatch, true);
    assert.equal(report.hasVerificationBashCall, true);
    assert.equal(report.faults.length, 0);
});

test("scoreRuntimeTrajectoryEvents marks zeroFaultPass=false when any model repair feedback occurs", () => {
    const events: TrajectoryEvent[] = [
        makeEvent(1, {
            type: "model_repair_feedback_recorded",
            feedback: {
                origin: "decision_semantics",
                code: "INVALID_AGENT_DECISION",
                issues: [{ code: "MISSING_STAGE", message: "Start a run stage before calling tools." }],
            },
        }),
        makeEvent(2, { type: "model_response_received", stage: "decide" }),
        makeEvent(3, {
            type: "tool_started",
            actionId: "act-1",
            toolId: "edit_file",
            input: { path: "src/foo.py" },
        }),
        makeEvent(4, {
            type: "tool_finished",
            actionId: "act-1",
            toolId: "edit_file",
            observation: { kind: "success", output: "Updated" },
        }),
    ];

    const report = scoreRuntimeTrajectoryEvents({
        events,
        runStatus: "completed",
        stopReason: "end_turn",
        patch: "diff --git a/src/foo.py b/src/foo.py\n+return 1\n",
    });

    assert.equal(report.zeroFaultPass, false);
    assert.equal(report.repairCount, 1);
    assert.equal(report.repairByOrigin.decision_semantics, 1);
    assert.ok(report.runtimeScore > 0 && report.runtimeScore < 1.0);
    assert.equal(report.faults.length, 1);
    assert.equal(report.faults[0]?.category, "repair");
    assert.equal(report.faults[0]?.origin, "decision_semantics");
});

test("scoreRuntimeTrajectoryEvents counts stage rejections, tool failures, and non-completed terminations", () => {
    const events: TrajectoryEvent[] = [
        makeEvent(1, { type: "model_response_received", stage: "decide" }),
        makeEvent(2, {
            type: "run_stage_rejected",
            stageId: "stage-1",
            feedback: "Stage hypothesis missing verification plan",
        }),
        makeEvent(3, {
            type: "tool_started",
            actionId: "act-1",
            toolId: "edit_file",
            input: { path: "a.py", oldText: "missing" },
        }),
        makeEvent(4, {
            type: "tool_finished",
            actionId: "act-1",
            toolId: "edit_file",
            observation: {
                kind: "error",
                code: "TARGET_NOT_FOUND",
                message: "oldText not found",
            },
        }),
        makeEvent(5, {
            type: "tool_started",
            actionId: "act-2",
            toolId: "edit_file",
            input: { path: "a.py", oldText: "missing" },
        }),
        makeEvent(6, {
            type: "tool_finished",
            actionId: "act-2",
            toolId: "edit_file",
            observation: {
                kind: "error",
                code: "TARGET_NOT_FOUND",
                message: "oldText not found",
            },
        }),
    ];

    const report = scoreRuntimeTrajectoryEvents({
        events,
        runStatus: "waiting",
        stopReason: "max_turn_requests",
        patch: null,
    });

    assert.equal(report.zeroFaultPass, false);
    assert.equal(report.stageRejectionCount, 1);
    assert.equal(report.toolFaultCount, 2);
    assert.equal(report.terminalFaultCount, 1);
    assert.equal(report.hasNonEmptyPatch, false);
    assert.ok(report.faults.some((f) => f.code === "REPEATED_TARGET_NOT_FOUND"));
    assert.ok(report.faults.some((f) => f.code === "MAX_STEPS_EXCEEDED"));
    assert.ok(report.runtimeScore < 0.15);
});

test("scoreRuntimeTrajectoryEvents 豁免网络相关错误且不计入故障与扣分", () => {
    const events: TrajectoryEvent[] = [
        makeEvent(1, { type: "model_response_received", stage: "decide" }),
        makeEvent(2, {
            type: "tool_started",
            actionId: "act-1",
            toolId: "bash",
            input: {
                command: "pip install pytest",
                sandboxAccess: { network: { targets: ["pypi.org"] } },
            },
        }),
        makeEvent(3, {
            type: "tool_finished",
            actionId: "act-1",
            toolId: "bash",
            observation: {
                kind: "failure",
                code: "SANDBOX_APPROVAL_REQUIRED",
                message: "命令申请了额外的沙箱文件或网络能力，须经 Permission 核准后方可执行",
            },
        }),
        makeEvent(4, {
            type: "tool_started",
            actionId: "act-2",
            toolId: "bash",
            input: { command: "curl https://example.com" },
        }),
        makeEvent(5, {
            type: "tool_finished",
            actionId: "act-2",
            toolId: "bash",
            observation: {
                kind: "error",
                code: "NETWORK_ERROR",
                message: "Could not resolve host: example.com",
            },
        }),
        makeEvent(6, {
            type: "tool_started",
            actionId: "act-3",
            toolId: "edit_file",
            input: { path: "src/fix.py" },
        }),
        makeEvent(7, {
            type: "tool_finished",
            actionId: "act-3",
            toolId: "edit_file",
            observation: { kind: "success", output: "Fixed" },
        }),
        makeEvent(8, {
            type: "tool_started",
            actionId: "act-4",
            toolId: "bash",
            input: { command: "pytest" },
        }),
        makeEvent(9, {
            type: "tool_finished",
            actionId: "act-4",
            toolId: "bash",
            observation: { kind: "success", output: "Passed" },
        }),
    ];

    const report = scoreRuntimeTrajectoryEvents({
        events,
        runStatus: "completed",
        stopReason: "end_turn",
        patch: "diff --git a/src/fix.py b/src/fix.py\n+fixed\n",
    });

    assert.equal(report.zeroFaultPass, true);
    assert.equal(report.runtimeScore, 1.0);
    assert.equal(report.toolFaultCount, 0);
    assert.equal(report.faults.length, 0);
    assert.equal(report.ignoredNetworkFaultCount, 2);
});
