import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidate, scenario, worker } from "./fixtures.js";
import { validateCheckpoint } from "../src/checkpoint.js";
test("checkpoint permits new source with the current protocol and rejects runtime, image, Profile and file drift", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-checkpoint-test-"));
    try {
        await candidate(directory);
        const valid = await validateCheckpoint(directory, scenario, worker, "image");
        assert.equal(valid.boundary.status, "failed");
        const reused = await validateCheckpoint(directory, scenario, { ...worker, sourceDigest: "dirty-tree" }, "image");
        assert.equal(reused.worker.sourceDigest, worker.sourceDigest);
        await assert.rejects(() => validateCheckpoint(directory, scenario, { ...worker, nodeImageId: "different-node" }, "image"), /mismatch/);
        await assert.rejects(() => validateCheckpoint(directory, scenario, worker, "changed-image"), /mismatch/);
        await assert.rejects(() => validateCheckpoint(directory, { ...scenario, profile: { ...scenario.profile, systemPrompt: "changed" } }, worker, "image"), /mismatch/);
        await writeFile(join(directory, "project", "config.json"), '{"later":true}');
        await assert.rejects(() => validateCheckpoint(directory, scenario, worker, "image"), /corrupted/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
test("archive rejects symlinks and hidden files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-archive-test-"));
    try {
        await candidate(directory);
        await symlink("/etc/passwd", join(directory, "project", "escape"));
        await assert.rejects(() => validateCheckpoint(directory, scenario, worker, "image"), /symlink/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
