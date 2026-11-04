import {
    appendFile,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import { createGoal, type Goal, type TrajectoryEventDraft } from "../../runtime/src/index";
import type { ModelInputRecord } from "../../runtime/src/model-input";
import { testUserMessage } from "../../runtime/test/current-fixtures";
import { JsonFileGoalStore, JsonFileModelInputStore, JsonFileTrajectoryStore } from "../src/index";

const SCALES = [200, 1_000, 5_000] as const;
const STEADY_STATE_APPENDS = 3;
const TRAJECTORY_EVENTS = 200;
const CATALOG_GOALS = 8;

const profile = {
    id: "benchmark-profile",
    systemPrompt: "Benchmark.",
    instructions: [],
    toolIds: [],
};

function modelInputRecord(scale: number, callId: string): ModelInputRecord {
    return {
        goalId: "goal-model-input",
        runId: "run-model-input",
        callId,
        stage: "decide",
        stepIndex: 1,
        occurredAt: new Date().toISOString(),
        messages: Array.from({ length: scale }, (_, index) => ({
            role: "user" as const,
            source: "conversation" as const,
            content: `message-${index} ${"x".repeat(128)}`,
        })),
    };
}

function benchmarkGoal(scale: number, index: number): Goal {
    const goal = createGoal({
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        id: `goal-io-${scale}-${index}`,
        runId: `run-io-${scale}-${index}`,
        intent: `io benchmark ${scale} ${index}`,
        promptBundleVersion: 1,
        profile,
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: { phase: "executing" },
            messages: Array.from({ length: scale }, (_, position) => testUserMessage(
                `message-${position} ${"x".repeat(128)}`,
                { runId: goal.state.run.id, position: { afterSequence: 0, order: position } },
            )),
            run: {
                ...goal.state.run,
                status: "running",
                committedThroughSequence: scale,
            },
        },
    } as Goal;
}

function trajectoryDraft(goalId: string, runId: string): TrajectoryEventDraft {
    return {
        goalId,
        runId,
        phase: "executing",
        eventType: "run_started",
        payload: { type: "run_started" },
    } as TrajectoryEventDraft;
}

test("io benchmark: model input, trajectory index and catalog listing across three scales", async () => {
    const results: Array<{
        readonly scale: number;
        readonly modelInputColdMs: number;
        readonly modelInputWarmMs: number;
        readonly trajectoryMs: number;
        readonly listHistoryColdMs: number;
        readonly listHistoryWarmMs: number;
        readonly counts: {
            readonly bodyWrites: number;
            readonly bodyReads: number;
            readonly trajectoryAppends: number;
            readonly catalogReads: number;
        };
    }> = [];

    for (const scale of SCALES) {
        const directory = await mkdtemp(join(tmpdir(), "lazygoal-io-benchmark-"));
        try {
            const counts = { bodyWrites: 0, bodyReads: 0, trajectoryAppends: 0, catalogReads: 0 };
            const modelInputs = new JsonFileModelInputStore(join(directory, "model-inputs"), {
                writeFile: (async (...args: Parameters<typeof writeFile>) => {
                    counts.bodyWrites += 1;
                    return writeFile(...args);
                }) as typeof writeFile,
                readFile: (async (...args: Parameters<typeof readFile>) => {
                    counts.bodyReads += 1;
                    return readFile(...args);
                }) as typeof readFile,
            });
            const coldStartedAt = performance.now();
            await modelInputs.append(modelInputRecord(scale, "call-0"));
            const modelInputColdMs = performance.now() - coldStartedAt;

            const warmStartedAt = performance.now();
            for (let index = 1; index <= STEADY_STATE_APPENDS; index += 1) {
                await modelInputs.append(modelInputRecord(scale, `call-${index}`));
            }
            const modelInputWarmMs = (performance.now() - warmStartedAt) / STEADY_STATE_APPENDS;

            const trajectories = new JsonFileTrajectoryStore(join(directory, "trajectories"), {
                appendFile: (async (...args: Parameters<typeof appendFile>) => {
                    counts.trajectoryAppends += 1;
                    return appendFile(...args);
                }) as typeof appendFile,
            });
            const trajectoryStartedAt = performance.now();
            for (let index = 0; index < TRAJECTORY_EVENTS; index += 1) {
                await trajectories.append(trajectoryDraft("goal-trajectory", "run-trajectory"));
            }
            await trajectories.flushIndex("goal-trajectory", "run-trajectory");
            const trajectoryMs = performance.now() - trajectoryStartedAt;

            const storeDirectory = join(directory, "goals");
            const goals = new JsonFileGoalStore(storeDirectory, {
                readFile: (async (...args: Parameters<typeof readFile>) => {
                    counts.catalogReads += 1;
                    return readFile(...args);
                }) as typeof readFile,
            });
            for (let index = 0; index < CATALOG_GOALS; index += 1) {
                await goals.save(benchmarkGoal(scale, index));
            }
            // 删除派生摘要，度量没有摘要时的真实冷启动成本。
            await rm(join(storeDirectory, "catalog"), { recursive: true, force: true });
            const coldListStartedAt = performance.now();
            const coldList = await goals.listHistory();
            const listHistoryColdMs = performance.now() - coldListStartedAt;

            const warmListStartedAt = performance.now();
            const warmList = await goals.listHistory();
            const listHistoryWarmMs = performance.now() - warmListStartedAt;

            results.push({
                scale,
                modelInputColdMs,
                modelInputWarmMs,
                trajectoryMs,
                listHistoryColdMs,
                listHistoryWarmMs,
                counts: { ...counts },
            });
            if (coldList.entries.length !== warmList.entries.length) {
                throw new Error("catalog listing changed between cold and warm scans");
            }
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }

    for (const result of results) {
        console.log(
            `[io-benchmark] scale=${result.scale}`
            + ` model-input-cold=${result.modelInputColdMs.toFixed(1)}ms`
            + ` model-input-warm=${result.modelInputWarmMs.toFixed(1)}ms`
            + ` trajectory-append=${result.trajectoryMs.toFixed(1)}ms`
            + ` list-history-cold=${result.listHistoryColdMs.toFixed(1)}ms`
            + ` list-history-warm=${result.listHistoryWarmMs.toFixed(1)}ms`,
        );
        console.log(
            `[io-benchmark] scale=${result.scale}`
            + ` file-ops model-input=write:${result.counts.bodyWrites}/read:${result.counts.bodyReads}`
            + ` trajectory=appendFile:${result.counts.trajectoryAppends}`
            + ` catalog=read:${result.counts.catalogReads}`,
        );
    }
});
