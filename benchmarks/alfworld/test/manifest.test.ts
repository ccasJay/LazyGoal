import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
    ALFWORLD_MANIFEST_VERSION,
    MAX_ALFWORLD_TASK_STEPS,
    ManifestValidationError,
    loadManifest,
    validateManifest,
} from "../src/manifest.js";

function task(order: number, taskId: string, gameFile = `valid_seen/${taskId}/game.tw-pddl`) {
    return {
        order,
        taskId,
        split: "valid_seen",
        gameFile,
        seed: order + 10,
        maxSteps: MAX_ALFWORLD_TASK_STEPS,
    };
}

function manifest(tasks: unknown[]) {
    return {
        version: ALFWORLD_MANIFEST_VERSION,
        name: "smoke",
        tasks,
    };
}

test("validateManifest preserves fixed task order and normalizes separators", () => {
    const result = validateManifest(
        manifest([
            task(0, "first", "valid_seen\\first\\game.tw-pddl"),
            task(1, "second"),
        ]),
        "/data/alfworld",
    );

    assert.deepEqual(result.tasks.map((entry) => entry.taskId), ["first", "second"]);
    assert.equal(result.tasks[0]?.gameFile, "valid_seen/first/game.tw-pddl");
    assert.deepEqual(result.tasks.map((entry) => entry.order), [0, 1]);
});

test("validateManifest rejects duplicate IDs, implicit empty sampling and unstable order", () => {
    assert.throws(
        () => validateManifest(manifest([task(0, "same"), task(1, "same")]), "/data/alfworld"),
        (error: unknown) =>
            error instanceof ManifestValidationError && error.code === "DUPLICATE_TASK_ID",
    );
    assert.throws(
        () => validateManifest(manifest([]), "/data/alfworld"),
        (error: unknown) =>
            error instanceof ManifestValidationError && error.code === "EMPTY_TASKS",
    );
    assert.throws(
        () => validateManifest(manifest([task(1, "out-of-order")]), "/data/alfworld"),
        (error: unknown) =>
            error instanceof ManifestValidationError && error.code === "INVALID_ORDER",
    );
});

test("validateManifest rejects absolute and escaping gamefile paths", () => {
    for (const gameFile of [
        "/tmp/secret/game.tw-pddl",
        "../../secret/game.tw-pddl",
        "C:\\secret\\game.tw-pddl",
    ]) {
        assert.throws(
            () => validateManifest(manifest([task(0, "unsafe", gameFile)]), "/data/alfworld"),
            (error: unknown) =>
                error instanceof ManifestValidationError &&
                ["INVALID_GAME_FILE", "PATH_ESCAPES_DATA_ROOT"].includes(error.code),
        );
    }
});

test("validateManifest enforces split, seed and per-task step bounds", () => {
    const invalidTasks = [
        { ...task(0, "bad-split"), split: "valid_random" },
        { ...task(0, "bad-seed"), seed: -1 },
        { ...task(0, "bad-steps"), maxSteps: MAX_ALFWORLD_TASK_STEPS + 1 },
    ];
    const expected = ["INVALID_SPLIT", "INVALID_SEED", "INVALID_STEP_LIMIT"] as const;
    invalidTasks.forEach((invalid, index) => {
        assert.throws(
            () => validateManifest(manifest([invalid]), "/data/alfworld"),
            (error: unknown) =>
                error instanceof ManifestValidationError && error.code === expected[index],
        );
    });
});

test("loadManifest parses a fixed file without implicit sampling", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-manifest-"));
    try {
        const manifestPath = join(workspace, "smoke.json");
        await writeFile(manifestPath, JSON.stringify(manifest([task(0, "fixed")])), "utf8");
        const result = await loadManifest(manifestPath, "/data/alfworld");
        assert.equal(result.name, "smoke");
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

test("repository Smoke and Regression manifests are fixed valid_seen task sets", async () => {
    const benchmarksRoot = fileURLToPath(new URL("../../", import.meta.url));
    for (const name of ["smoke", "regression"] as const) {
        const loaded = await loadManifest(
            join(benchmarksRoot, "alfworld/manifests", `${name}.json`),
            "/absolute/alfworld-data",
        );
        assert.equal(loaded.name, name);
        assert.ok(loaded.tasks.length >= 1);
        assert.ok(loaded.tasks.every((task) => task.split === "valid_seen"));
        assert.deepEqual(
            loaded.tasks.map((task) => task.order),
            loaded.tasks.map((_task, index) => index),
        );
    }
});
