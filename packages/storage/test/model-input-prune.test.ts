import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { createGoal } from "../../runtime/src/index";
import { encodePathSegment } from "../src/path-segment";
import { JsonFileGoalStore, JsonFileModelInputStore } from "../src/index";

const goalId = "goal-prune";
const runId = "run-prune";

test("prune-model-inputs only deletes a fully orphaned Run with --apply", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-prune-model-inputs-"));
    try {
        const goal = createGoal({
            id: goalId,
            runId,
            intent: "Prune model inputs",
            promptBundleVersion: 1,
            memoryProtocol: { kind: "structured", version: 1 },
            modelContextProtocol: { kind: "trajectory-layered", version: 1 },
            contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
            profile: { id: "profile", systemPrompt: "prune", instructions: [], toolIds: [] },
        });
        await mkdir(join(workspace, "goals"), { recursive: true });
        await new JsonFileGoalStore(join(workspace, "goals")).save(goal);
        const modelInputStore = new JsonFileModelInputStore(join(workspace, "goals"));
        await modelInputStore.append({
            goalId,
            runId,
            callId: "call-orphan",
            stepIndex: 1,
            stage: "decide",
            occurredAt: "2026-11-02T00:00:00.000Z",
            messages: [{ role: "system", source: "system", content: "system" }],
        });

        const runDirectory = join(workspace, "goals", encodePathSegment(goalId), "runs", encodePathSegment(runId));
        assert.equal(existsSync(runDirectory), true);

        const dryRun = spawnSync("npx", ["tsx", resolve("scripts/prune-model-inputs.ts"), "--workspace", workspace], { encoding: "utf8" });
        assert.equal(dryRun.status, 0, dryRun.stderr);
        assert.match(dryRun.stdout, /1 orphaned, deletable/);
        assert.match(dryRun.stdout, /Dry run only/);
        assert.equal(existsSync(runDirectory), true);

        const applied = spawnSync("npx", ["tsx", resolve("scripts/prune-model-inputs.ts"), "--workspace", workspace, "--goal", goalId, "--run", runId, "--apply"], { encoding: "utf8" });
        assert.equal(applied.status, 0, applied.stderr);
        assert.match(applied.stdout, /\[deleted\] goal-prune\/run-prune/);
        assert.equal(existsSync(join(runDirectory, "model-inputs.jsonl")), false);
        assert.equal(existsSync(runDirectory), true);
        assert.deepEqual(await modelInputStore.read(goalId, runId), []);
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});
