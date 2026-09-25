import assert from "node:assert/strict";
import { test } from "node:test";

import { createGoal } from "../../runtime/src/domain";
import type { MetricsStore, ModelCallMetricRecord } from "../../runtime/src/model-call-metrics";
import { SessionMetricsProjectionError, SessionMetricsService } from "../src/index";

const profile = {
    id: "metrics-profile",
    systemPrompt: "测试指标投影。",
    instructions: ["返回完成"],
    toolIds: [],
};
const protocols = {
    memoryProtocol: { kind: "structured" as const, version: 1 as const },
    modelContextProtocol: { kind: "trajectory-layered" as const, version: 1 as const },
    contextRetrievalProtocol: { kind: "bm25-lite" as const, version: 1 as const },
};

function goalWithRuns() {
    const goal = createGoal({
        id: "goal-projection",
        intent: "验证会话指标",
        promptBundleVersion: 1,
        ...protocols,
        profile,
        runId: "run-current",
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            completedRuns: [
                { runId: "run-history", stepCount: 2, committedThroughSequence: 2, messageRange: { start: 0, end: 1 } },
                { runId: "run-empty", stepCount: 0, committedThroughSequence: 0, messageRange: { start: 0, end: 0 } },
            ],
            run: { ...goal.state.run, stepCount: 0 },
        },
    };
}

function start(goalId: string, runId: string, callId: string): ModelCallMetricRecord {
    return {
        recordType: "call_started",
        goalId,
        runId,
        callId,
        occurredAt: "2026-09-25T00:00:00.000Z",
    };
}

function finish(
    goalId: string,
    runId: string,
    callId: string,
    usage: Extract<ModelCallMetricRecord, { recordType: "call_finished" }>["usage"],
): ModelCallMetricRecord {
    return {
        recordType: "call_finished",
        goalId,
        runId,
        callId,
        occurredAt: "2026-09-25T00:00:01.000Z",
        outcome: "completed",
        usage,
    };
}

function serviceFor(recordsByRun: ReadonlyMap<string, readonly ModelCallMetricRecord[]>) {
    const goal = goalWithRuns();
    const goals = { async restore(goalId: string) { return goalId === goal.id ? goal : undefined; } };
    const metrics: MetricsStore = {
        async append() {},
        async read({ runId }) { return recordsByRun.get(runId) ?? []; },
    };
    return new SessionMetricsService(goals, metrics);
}

test("SessionMetricsService combines active and completed Run snapshots with deduplicated facts", async () => {
    const goalId = "goal-projection";
    const historyRecords = [
        start(goalId, "run-history", "call-1"),
        finish(goalId, "run-history", "call-1", {
            source: "provider_reported",
            inputTokens: 10,
            outputTokens: 4,
        }),
    ];
    const emptyRunRecords = [
        start(goalId, "run-empty", "call-2"),
        finish(goalId, "run-empty", "call-2", { source: "unavailable" }),
    ];
    const service = serviceFor(new Map([
        ["run-history", [...historyRecords, ...historyRecords]],
        ["run-empty", emptyRunRecords],
    ]));

    const first = await service.read(goalId);
    const second = await service.read(goalId);

    assert.ok(first);
    assert.deepEqual(second, first);
    assert.equal(first.roundCount, 1);
    assert.equal(first.stepCount, 2);
    assert.equal(first.reportedCalls, 1);
    assert.equal(first.missingCalls, 1);
    assert.equal(first.inputTokens, 10);
    assert.equal(first.outputTokens, 4);
    assert.equal(first.coverage, "partial");
    assert.deepEqual(first.runs.map(({ runId, stepCount }) => ({ runId, stepCount })), [
        { runId: "run-history", stepCount: 2 },
        { runId: "run-empty", stepCount: 0 },
        { runId: "run-current", stepCount: 0 },
    ]);
});

test("SessionMetricsService counts recovered unfinished calls as missing and leaves totals unavailable", async () => {
    const service = serviceFor(new Map([
        ["run-history", [start("goal-projection", "run-history", "interrupted-call")]],
    ]));

    const snapshot = await service.read("goal-projection");

    assert.ok(snapshot);
    assert.equal(snapshot.reportedCalls, 0);
    assert.equal(snapshot.missingCalls, 1);
    assert.equal(snapshot.inputTokens, null);
    assert.equal(snapshot.outputTokens, null);
    assert.equal(snapshot.coverage, "unavailable");
});

test("SessionMetricsService rejects conflicting facts and distinguishes a missing Goal", async () => {
    const goalId = "goal-projection";
    const firstFinish = finish(goalId, "run-history", "call-conflict", {
        source: "provider_reported", inputTokens: 10, outputTokens: 4,
    });
    const secondFinish = finish(goalId, "run-history", "call-conflict", {
        source: "provider_reported", inputTokens: 11, outputTokens: 4,
    });
    const service = serviceFor(new Map([
        ["run-history", [firstFinish, secondFinish]],
    ]));

    await assert.rejects(service.read(goalId), SessionMetricsProjectionError);
    assert.equal(await service.read("missing-goal"), undefined);
});
