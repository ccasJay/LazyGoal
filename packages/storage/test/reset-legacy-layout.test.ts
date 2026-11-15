import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { createGoal } from "../../runtime/src/index";
import { encodePathSegment } from "../src/path-segment";
import { goalSnapshotPath, JsonFileGoalStore } from "../src/index";

function goal(id: string) {
    return createGoal({
        id,
        runId: `run-${id}`,
        intent: `intent-${id}`,
        promptBundleVersion: 1,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile: { id: "profile", systemPrompt: "system", instructions: [], toolIds: [] },
    });
}

test("reset-legacy-goal-layout deletes only legacy Goal data and keeps shared state", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-legacy-layout-"));
    try {
        const goalsDirectory = join(workspace, "goals");
        await mkdir(goalsDirectory, { recursive: true });

        // 旧布局：快照文件、归档标记与派生摘要目录。
        const legacyGoalId = "goal-legacy";
        const encodedLegacy = encodePathSegment(legacyGoalId);
        await writeFile(join(goalsDirectory, `${encodedLegacy}.json`), "{}", "utf8");
        await writeFile(join(goalsDirectory, `${encodedLegacy}.json.archived`), "", "utf8");
        await mkdir(join(goalsDirectory, "catalog"), { recursive: true });
        await writeFile(join(goalsDirectory, "catalog", `${encodedLegacy}.json`), "{}", "utf8");

        // 新布局：Goal 目录保留。
        const currentGoal = goal("goal-current");
        await new JsonFileGoalStore(goalsDirectory).save(currentGoal);

        // 已退役的按类型目录。
        for (const name of ["trajectories", "traces", "metrics", "context-sidecars", "model-inputs"]) {
            await mkdir(join(workspace, name, "nested"), { recursive: true });
            await writeFile(join(workspace, name, "nested", "file.jsonl"), "{}\n", "utf8");
        }

        // 旧 Goal 的进程会话与工作区共享数据。
        await mkdir(join(workspace, "processes", encodedLegacy, "process-1"), { recursive: true });
        await writeFile(join(workspace, "processes", encodedLegacy, "process-1", "session.json"), "{}", "utf8");
        await writeFile(join(workspace, "processes", "keep-pointer"), "", "utf8");
        for (const name of ["workspace.json", "sandbox-grants.json", "permission-profile.json", "model-preference.json"]) {
            await writeFile(join(workspace, name), "{}", "utf8");
        }
        await mkdir(join(workspace, "benchmarks"), { recursive: true });
        await mkdir(join(workspace, "gepa"), { recursive: true });

        const dryRun = spawnSync("npx", ["tsx", resolve("scripts/reset-legacy-goal-layout.ts"), "--workspace", workspace], { encoding: "utf8" });
        assert.equal(dryRun.status, 0, dryRun.stderr);
        assert.match(dryRun.stdout, new RegExp(`\\[legacy\\] .*${encodedLegacy}\\.json`));
        assert.match(dryRun.stdout, /\[legacy-goal\] goal-legacy/);
        assert.match(dryRun.stdout, /Dry run only/);
        assert.equal(existsSync(join(goalsDirectory, `${encodedLegacy}.json`)), true);

        const applied = spawnSync("npx", ["tsx", resolve("scripts/reset-legacy-goal-layout.ts"), "--workspace", workspace, "--apply"], { encoding: "utf8" });
        assert.equal(applied.status, 0, applied.stderr);

        assert.equal(existsSync(join(goalsDirectory, `${encodedLegacy}.json`)), false);
        assert.equal(existsSync(join(goalsDirectory, `${encodedLegacy}.json.archived`)), false);
        assert.equal(existsSync(join(goalsDirectory, "catalog")), false);
        assert.equal(existsSync(join(workspace, "processes", encodedLegacy)), false);
        for (const name of ["trajectories", "traces", "metrics", "context-sidecars", "model-inputs"]) {
            assert.equal(existsSync(join(workspace, name)), false, name);
        }

        assert.deepEqual(
            (await readdir(goalsDirectory)).sort(),
            [encodePathSegment(currentGoal.id)],
        );
        assert.equal(
            await new JsonFileGoalStore(goalsDirectory).restore(currentGoal.id) !== undefined,
            true,
        );
        assert.equal(existsSync(goalSnapshotPath(goalsDirectory, currentGoal.id)), true);
        for (const name of ["workspace.json", "sandbox-grants.json", "permission-profile.json", "model-preference.json"]) {
            assert.equal(existsSync(join(workspace, name)), true, name);
        }
        assert.equal(existsSync(join(workspace, "processes", "keep-pointer")), true);
        assert.equal(existsSync(join(workspace, "benchmarks")), true);
        assert.equal(existsSync(join(workspace, "gepa")), true);
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});
