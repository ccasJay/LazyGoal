import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidate, scenario, worker } from "./fixtures.js";
import { publishCheckpoint } from "../src/checkpoint.js";
import { identity } from "../src/artifacts.js";
test("unsafe boundary cannot publish a checkpoint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-capture-test-"));
    try {
        await candidate(directory);
        const checkpoint = JSON.parse(await readFile(join(directory, "checkpoint.json"), "utf8"));
        await rm(join(directory, "checkpoint.json"));
        await assert.rejects(() => publishCheckpoint(directory, scenario, { ...checkpoint.boundary, status: "running" }, worker, "image"), /boundary/);
        await assert.rejects(() => readFile(join(directory, "checkpoint.json")), /ENOENT/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
test("content fingerprints distinguish dirty source/template content independent of HEAD", () => {
    assert.notEqual(identity({ source: "before", prompt: "same", head: "same" }), identity({ source: "after", prompt: "same", head: "same" }));
    assert.notEqual(identity({ source: "same", prompt: "before", head: "same" }), identity({ source: "same", prompt: "after", head: "same" }));
});
