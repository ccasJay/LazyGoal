import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executePairedGroups } from "../src/paired-runner.js";
test("failed restore retains full group, each group receives independent writable directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-pair-test-"));
    try {
        const groups = await executePairedGroups(directory, "model", async (group, output) => {
            await writeFile(join(output, "artifact.txt"), group);
            if (group === "restore") throw new Error("Expected failure");
            return { group, category: "completed", stages: [], model: "model", calls: [null], durationMs: 10, imageId: "image", artifacts: null, score: null, errors: [] };
        });
        assert.equal(groups.length, 2);
        assert.equal(groups[0]!.category, "infrastructure_error");
        assert.equal(groups[1]!.category, "completed");
        assert.equal(await readFile(join(directory, "restore", "artifact.txt"), "utf8"), "restore");
        assert.equal(await readFile(join(directory, "full", "artifact.txt"), "utf8"), "full");
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("an exhausted frozen prefix is recorded as budget failure and does not suppress the full group", async t => {
    const { ScriptBudgetExceeded } = await import("../src/script-driver.js");
    const directory = await mkdtemp(join(tmpdir(), "source-prefix-budget-")); t.after(() => rm(directory, { recursive: true, force: true }));
    const groups = await executePairedGroups(directory, "fixture", async group => {
        if (group === "restore") throw new ScriptBudgetExceeded("Frozen prefix exhausted total time budget", []);
        return { group, category: "completed", stages: [], model: "fixture", calls: [], durationMs: 0, imageId: null, artifacts: null, score: null, errors: [] };
    });
    assert.equal(groups[0]!.category, "budget_exceeded");
    assert.equal(groups[0]!.score?.combined, "failed");
    assert.equal(groups[1]!.category, "completed");
});
