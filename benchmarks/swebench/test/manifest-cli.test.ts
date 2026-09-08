import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadSwebenchManifest, parseSwebenchManifest } from "../src/manifest.js";
import { parseSwebenchArgs } from "../src/cli.js";
import { parseSwebenchTasks } from "../src/container.js";

test("checked-in manifest pins revision, instances and finite budgets", async () => {
    const manifest = await loadSwebenchManifest(fileURLToPath(new URL("../manifests/smoke.json", import.meta.url)));
    assert.equal(manifest.instanceIds.length, 5);
    for (const change of [
        { revision: "main" }, { maxSteps: 0 }, { maxSteps: 1.5 }, { taskTimeoutSeconds: Infinity },
        { instanceIds: [manifest.instanceIds[0], manifest.instanceIds[0]] }, { instanceIds: ["../escape"] },
        { instanceIds: [] }, { unknown: true }, { dataset: "other" },
    ]) assert.throws(() => parseSwebenchManifest({ ...manifest, ...change }), /Invalid SWE-bench manifest/);
    assert.throws(() => parseSwebenchManifest({ ...manifest, testTimeoutSeconds: 86400,
        instanceIds: Array.from({ length: 30 }, (_, i) => `astropy__astropy-${i}`) }), /timer limit/);
});

test("single-task manifest exercises one complete official instance", async () => {
    const manifest = await loadSwebenchManifest(fileURLToPath(new URL("../manifests/single.json", import.meta.url)));
    assert.deepEqual(manifest.instanceIds, ["astropy__astropy-12907"]);
    assert.equal(manifest.revision, "c104f840cc67f8b6eec6f759ebc8b2693d585d4a");
});

test("CLI requires explicit routing and never accepts retry options", () => {
    assert.deepEqual(parseSwebenchArgs(["eval", "swebench", "--manifest", "fixed.json", "--output", "run", "--python", "/venv/python"], "/workspace"),
        { manifest: "/workspace/fixed.json", output: "/workspace/run", python: "/venv/python" });
    for (const args of [["eval", "swebench"], ["eval", "alfworld", "--manifest", "a"],
        ["eval", "swebench", "--manifest", "a", "--retries", "2"],
        ["eval", "swebench", "--manifest", "a", "--output", ""]]) {
        assert.throws(() => parseSwebenchArgs(args));
    }
});

test("real bin routes SWE-bench argument errors without starting TUI or Python", () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../../bin/lazygoal.cjs", import.meta.url)), "eval", "swebench"],
        { encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage: lazygoal eval swebench/);
    assert.equal(result.stdout, "");
});

test("Python task projection excludes grading-only data and rejects arbitrary image references", () => {
    const row = { instance_id: "astropy__astropy-12907", repo: "astropy/astropy", base_commit: "a".repeat(40),
        problem_statement: "Fix this issue", image: "swebench/sweb.eval.x86_64.astropy_1776_astropy-12907:latest",
        patch: "GOLD", test_patch: "TEST", FAIL_TO_PASS: ["secret"] };
    const tasks = parseSwebenchTasks({ tasks: [row] });
    assert.equal("patch" in tasks[0]!, false);
    assert.equal("test_patch" in tasks[0]!, false);
    assert.equal("FAIL_TO_PASS" in tasks[0]!, false);
    assert.throws(() => parseSwebenchTasks({ tasks: [{ ...row, image: "arbitrary/image" }] }));
});
