import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createGoal } from "../../runtime/src/domain";
import type {
    MetricsStore,
    ModelCallMetricsCoverage,
    ModelCallMetricsCoverageStore,
    ModelCallMetricRecord,
} from "../../runtime/src/model-call-metrics";
import { JsonFileMetricsStore } from "../../storage/src/index";
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

function goalWithRuns(goalId = "goal-projection") {
    const goal = createGoal({
        id: goalId,
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
                { runId: "run-history", status: "completed" as const, stepCount: 2, committedThroughSequence: 2, messageRange: { start: 0, end: 1 } },
                { runId: "run-empty", status: "completed" as const, stepCount: 0, committedThroughSequence: 0, messageRange: { start: 0, end: 0 } },
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
    decodeDurationMs?: number,
): ModelCallMetricRecord {
    return {
        recordType: "call_finished",
        goalId,
        runId,
        callId,
        occurredAt: "2026-09-25T00:00:01.000Z",
        outcome: "completed",
        usage,
        ...(decodeDurationMs === undefined ? {} : { decodeDurationMs }),
    };
}

function serviceFor(recordsByRun: ReadonlyMap<string, readonly ModelCallMetricRecord[]>) {
    const goal = goalWithRuns();
    const goals = { async restore(goalId: string) { return goalId === goal.id ? goal : undefined; } };
    const metrics: MetricsStore = {
        async append() {},
        async read({ runId }) { return recordsByRun.get(runId) ?? []; },
    };
    let coverage: ModelCallMetricsCoverage | undefined = {
        goalId: goal.id,
        historyCovered: true,
        gaps: [],
    };
    const coverageStore: ModelCallMetricsCoverageStore = {
        async initializeGoal(goalId, historyCovered) {
            coverage ??= { goalId, historyCovered, gaps: [] };
        },
        async recordGap(gap) {
            const current = coverage ?? { goalId: gap.goalId, historyCovered: false, gaps: [] };
            if (!current.gaps.some((item) => item.runId === gap.runId && item.callId === gap.callId)) {
                coverage = { ...current, gaps: [...current.gaps, gap] };
            }
        },
        async readCoverage() { return coverage; },
    };
    return new SessionMetricsService(goals, metrics, coverageStore);
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

test("SessionMetricsService derives cache hit rate and generation speed from eligible calls only", async () => {
    const goalId = "goal-projection";
    const service = serviceFor(new Map([
        ["run-history", [
            start(goalId, "run-history", "cache-speed"),
            finish(goalId, "run-history", "cache-speed", {
                source: "provider_reported", inputTokens: 100, outputTokens: 50, cachedInputTokens: 40,
            }, 500),
            start(goalId, "run-history", "no-cache-or-speed"),
            finish(goalId, "run-history", "no-cache-or-speed", {
                source: "provider_reported", inputTokens: 50, outputTokens: 10,
            }),
            start(goalId, "run-history", "zero-input"),
            finish(goalId, "run-history", "zero-input", {
                source: "provider_reported", inputTokens: 0, outputTokens: 20, cachedInputTokens: 0,
            }, 1000),
            start(goalId, "run-history", "cache-over-input"),
            finish(goalId, "run-history", "cache-over-input", {
                source: "provider_reported", inputTokens: 20, outputTokens: 10, cachedInputTokens: 21,
            }, 1000),
            start(goalId, "run-history", "missing-usage"),
            finish(goalId, "run-history", "missing-usage", { source: "unavailable" }),
        ]],
    ]));

    const snapshot = await service.read(goalId);

    assert.ok(snapshot);
    const run = snapshot.runs[0]!;
    assert.equal(run.cacheHitRate, 0.4);
    assert.equal(run.cacheMeasuredCalls, 1);
    assert.equal(run.cacheExcludedCalls, 4);
    assert.equal(run.tokensPerSecond, 80 / 2.5);
    assert.equal(run.throughputMeasuredCalls, 3);
    assert.equal(run.throughputExcludedCalls, 2);
    assert.equal(snapshot.cacheHitRate, 0.4);
    assert.equal(snapshot.tokensPerSecond, 80 / 2.5);
});

test("SessionMetricsService returns unavailable efficiency values when no call qualifies", async () => {
    const service = serviceFor(new Map([
        ["run-history", [
            start("goal-projection", "run-history", "missing-cache"),
            finish("goal-projection", "run-history", "missing-cache", {
                source: "provider_reported", inputTokens: 10, outputTokens: 5,
            }),
        ]],
    ]));

    const snapshot = await service.read("goal-projection");

    assert.ok(snapshot);
    assert.equal(snapshot.cacheHitRate, null);
    assert.equal(snapshot.cacheMeasuredCalls, 0);
    assert.equal(snapshot.cacheExcludedCalls, 1);
    assert.equal(snapshot.tokensPerSecond, null);
    assert.equal(snapshot.throughputMeasuredCalls, 0);
    assert.equal(snapshot.throughputExcludedCalls, 1);
});

test("SessionMetricsService excludes active calls and publishes facts and Goal snapshot updates", async () => {
    let goal = goalWithRuns();
    const records: ModelCallMetricRecord[] = [];
    let coverage: ModelCallMetricsCoverage = { goalId: goal.id, historyCovered: true, gaps: [] };
    const metrics: MetricsStore = {
        async append(record) { records.push(record); },
        async read({ runId }) { return records.filter((record) => record.runId === runId); },
    };
    const coverageStore: ModelCallMetricsCoverageStore = {
        async initializeGoal(goalId, historyCovered) {
            coverage ??= { goalId, historyCovered, gaps: [] };
        },
        async recordGap(gap) { coverage = { ...coverage, gaps: [...coverage.gaps, gap] }; },
        async readCoverage() { return coverage; },
    };
    const service = new SessionMetricsService(
        { async restore(goalId) { return goalId === goal.id ? goal : undefined; } },
        metrics,
        coverageStore,
    );
    const abort = new AbortController();
    const iterator = service.watch(goal.id, abort.signal)[Symbol.asyncIterator]();
    const initial = await iterator.next();
    assert.equal(initial.value?.kind, "snapshot");

    await service.record(start(goal.id, "run-current", "active-call"));
    const activeUpdate = await iterator.next();
    assert.equal(activeUpdate.value?.kind, "snapshot");
    if (activeUpdate.value?.kind !== "snapshot") assert.fail("expected active-call snapshot");
    assert.equal(activeUpdate.value.snapshot.missingCalls, 0);
    assert.equal(activeUpdate.value.snapshot.runs.at(-1)?.cacheExcludedCalls, 1);

    await service.record(finish(goal.id, "run-current", "active-call", {
        source: "provider_reported", inputTokens: 12, outputTokens: 6,
    }));
    const completedUpdate = await iterator.next();
    assert.equal(completedUpdate.value?.kind, "snapshot");
    if (completedUpdate.value?.kind !== "snapshot") assert.fail("expected completed-call snapshot");
    assert.equal(completedUpdate.value.snapshot.inputTokens, 12);

    goal = {
        ...goal,
        state: { ...goal.state, run: { ...goal.state.run, stepCount: 1 } },
    };
    service.notifyGoalSaved(goal.id);
    const goalUpdate = await iterator.next();
    assert.equal(goalUpdate.value?.kind, "snapshot");
    if (goalUpdate.value?.kind !== "snapshot") assert.fail("expected Goal-saved snapshot");
    assert.equal(goalUpdate.value.snapshot.stepCount, 3);
    const waitingUpdate = iterator.next();
    abort.abort();
    assert.equal((await waitingUpdate).done, true);
});

test("SessionMetricsService catches updates that arrive while the initial snapshot is loading", async () => {
    const goal = goalWithRuns();
    let releaseRestore!: (goal: ReturnType<typeof goalWithRuns>) => void;
    let signalRestoreStarted!: () => void;
    const restoreStarted = new Promise<void>((resolve) => { signalRestoreStarted = resolve; });
    const pendingGoal = new Promise<ReturnType<typeof goalWithRuns>>((resolve) => { releaseRestore = resolve; });
    const records: ModelCallMetricRecord[] = [];
    const metrics: MetricsStore = {
        async append(record) { records.push(record); },
        async read({ runId }) { return records.filter((record) => record.runId === runId); },
    };
    const coverage: ModelCallMetricsCoverage = { goalId: goal.id, historyCovered: true, gaps: [] };
    const coverageStore: ModelCallMetricsCoverageStore = {
        async initializeGoal() {},
        async recordGap() {},
        async readCoverage() { return coverage; },
    };
    const service = new SessionMetricsService({
        async restore() {
            signalRestoreStarted();
            return pendingGoal;
        },
    }, metrics, coverageStore);
    const iterator = service.watch(goal.id)[Symbol.asyncIterator]();
    const initialResult = iterator.next();
    await restoreStarted;
    await service.record(start(goal.id, "run-current", "handoff-call"));
    await service.record(finish(goal.id, "run-current", "handoff-call", {
        source: "provider_reported", inputTokens: 8, outputTokens: 3,
    }));
    releaseRestore(goal);

    const initial = await initialResult;
    assert.equal(initial.value?.kind, "snapshot");
    if (initial.value?.kind !== "snapshot") assert.fail("expected initial snapshot");
    assert.equal(initial.value.snapshot.inputTokens, 8);
    const handedOffUpdate = await iterator.next();
    assert.equal(handedOffUpdate.value?.kind, "snapshot");
    if (handedOffUpdate.value?.kind !== "snapshot") assert.fail("expected handoff update");
    assert.equal(handedOffUpdate.value.snapshot.inputTokens, 8);
    await iterator.return?.(undefined);
});

test("SessionMetricsService marks legacy history and persists a detectable cross-store write gap", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-session-metrics-gap-"));

    try {
        const goal = goalWithRuns();
        const records: ModelCallMetricRecord[] = [];
        let failFinishedAppend = false;
        const metrics: MetricsStore = {
            async append(record) {
                if (failFinishedAppend && record.recordType === "call_finished") {
                    throw new Error("metric write failed");
                }
                records.push(record);
            },
            async read({ runId }) { return records.filter((record) => record.runId === runId); },
        };
        const coverageStore = new JsonFileMetricsStore(directory);
        const goals = { async restore(goalId: string) { return goalId === goal.id ? goal : undefined; } };
        const service = new SessionMetricsService(goals, metrics, coverageStore);
        const oldSnapshot = await service.read(goal.id);
        assert.equal(oldSnapshot?.coverage, "unavailable");

        const newGoal = goalWithRuns("goal-new");
        const newService = new SessionMetricsService(
            { async restore(goalId: string) { return goalId === newGoal.id ? newGoal : undefined; } },
            metrics,
            coverageStore,
        );
        await newService.initializeNewGoal(newGoal.id);
        await newService.record(start(newGoal.id, "run-current", "failed-finish"));
        failFinishedAppend = true;
        await assert.rejects(
            newService.record(finish(newGoal.id, "run-current", "failed-finish", {
                source: "provider_reported", inputTokens: 10, outputTokens: 5,
            })),
            /metric write failed/,
        );

        const afterFault = await newService.read(newGoal.id);
        assert.equal(afterFault?.missingCalls, 1);
        assert.equal(afterFault?.coverage, "unavailable");
        const restartedService = new SessionMetricsService(
            { async restore(goalId: string) { return goalId === newGoal.id ? newGoal : undefined; } },
            metrics,
            new JsonFileMetricsStore(directory),
        );
        const afterRestart = await restartedService.read(newGoal.id);
        assert.equal(afterRestart?.missingCalls, 1);
        assert.equal(afterRestart?.coverage, "unavailable");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
