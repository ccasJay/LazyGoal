import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidate } from "./fixtures.js";
import { reviewCandidate, freezeCandidate, readFrozenCase } from "../src/corpus.js";
test("explicit approval freezes immutable versions; stale hash and changed content reject", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-corpus-test-"));
    try {
        const source = join(directory, "candidate");
        await candidate(source);
        const hash = await reviewCandidate(source);
        await assert.rejects(() => freezeCandidate(source, directory, "core", "one", "stale", "reviewer"), /stale/);
        const frozen = await freezeCandidate(source, directory, "challenge", "one", hash, "reviewer");
        assert.equal((await readFrozenCase(frozen)).approvedBy, "reviewer");
        await assert.rejects(() => freezeCandidate(source, directory, "challenge", "one", hash, "reviewer"), /EEXIST/);
        const promoted = await freezeCandidate(source, directory, "core", "one", hash, "second-reviewer");
        assert.equal((await readFrozenCase(promoted)).set, "core");
        await writeFile(join(frozen, "case", "project", "config.json"), "changed");
        await assert.rejects(() => readFrozenCase(frozen), /corrupted/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
