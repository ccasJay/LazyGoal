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
