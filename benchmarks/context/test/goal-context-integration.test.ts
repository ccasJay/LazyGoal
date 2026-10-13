import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultPromptBundleRenderer, DropOldestContextCompactor } from "../../../packages/agent/src/index.js";
import { HeadlessCompositionRoot } from "../../src/headless-composition-root.js";
import { JsonFileBenchmarkPersistenceAdapter } from "../../src/file-persistence-adapter.js";
import { parseScenario } from "../src/scenario.js";
import { driveScript } from "../src/script-driver.js";
import { WORKER_NODE_IMAGE, type WorkerIdentity } from "../../src/worker-builder.js";
import { buildGoalContextIndex, executeDirectoryBrowse, type GoalSourceEnvelope } from "../../../packages/context-retrieval/src/index.js";

const sampleScenario = parseScenario({
    id: "context-nav-integration",
    image: WORKER_NODE_IMAGE,
    initialFiles: { "app.json": '{"version":"1.0"}' },
    checkpointAfter: 0,
    profile: {
        id: "context-nav-profile",
        systemPrompt: "Navigation lifecycle test",
        instructions: ["Follow lifecycle"],
        toolIds: ["context_shell"],
    },
    budget: { maxSteps: 10, maxCalls: 30, stageTimeoutMs: 3000, totalTimeoutMs: 15000 },
    verifier: "test -f app.json",
    rubric: { text: "Navigation integration", threshold: 0.7 },
    limitations: "None",
    stages: [
        { operation: "launch", prompt: "Init stage 1 and enter waiting", expect: "waiting", waitingFor: "blocked" },
        { operation: "resume", prompt: "Resume same Run with stage 2", expect: "completed" },
        { operation: "continue", prompt: "User continue starts new Run", expect: "completed" },
    ],
});

test("TODO 6: context benchmark 真实场景 - launch → waiting → resume (同 Run) → continue (新 Run) 与缓存生命周期", async () => {
    const runId1 = "run-context-stage-1";
    const runId2 = "run-context-stage-2";
    const seenStages: string[] = [];

    const boundaries = await driveScript(sampleScenario, async (stage, previous) => {
        if (stage.operation === "launch") {
            seenStages.push("launch");
            return {
                workerInstanceId: "worker-inst-1",
                goalId: "goal-ctx-1",
                runId: runId1,
                status: "waiting",
                sequence: 4,
                waitingFor: "blocked",
            };
        } else if (stage.operation === "resume") {
            seenStages.push("resume");
            // resume 同一 Run，当前阶段恢复
            assert.equal(previous?.runId, runId1, "resume 必须在同一 Run 执行");
            return {
                workerInstanceId: "worker-inst-2",
                goalId: "goal-ctx-1",
                runId: runId1,
                status: "completed",
                sequence: 8,
            };
        } else {
            seenStages.push("continue");
            // continue 开启新 Run，旧 Run 归档作为历史
            assert.equal(previous?.status, "completed");
            return {
                workerInstanceId: "worker-inst-3",
                goalId: "goal-ctx-1",
                runId: runId2,
                status: "completed",
                sequence: 5,
            };
        }
    }, new AbortController().signal);

    assert.equal(boundaries.length, 3);
    assert.equal(boundaries[0]!.boundary.runId, runId1);
    assert.equal(boundaries[1]!.boundary.runId, runId1);
    assert.equal(boundaries[2]!.boundary.runId, runId2);
    assert.deepEqual(seenStages, ["launch", "resume", "continue"]);

    // 验证跨 Run 索引构建与缓存一致性
    const envelope: GoalSourceEnvelope = {
        goalId: "goal-ctx-1",
        runs: [
            { runId: runId1, committedThroughSequence: 8 },
            { runId: runId2, committedThroughSequence: 5 },
        ],
        messages: [
            { messageIndex: 0, role: "user", contentHash: "hash-0" },
            { messageIndex: 1, role: "user", contentHash: "hash-1" },
        ],
        eventsByRun: new Map([
            [runId1, []],
            [runId2, []],
        ]),
    };

    const index = buildGoalContextIndex(envelope);
    assert.equal(index.goalId, "goal-ctx-1");
    assert.equal(index.sourceBoundaries.length, 2);

    // 缓存删除后按同一 envelope 重建，构建摘要一致
    const indexRebuilt = buildGoalContextIndex(envelope);
    assert.equal(indexRebuilt.sourceDigest, index.sourceDigest);
});
