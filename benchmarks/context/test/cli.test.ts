import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { runContextCli, loadContextRoles } from "../src/cli.js";
test("context CLI routes without starting web server and rejects missing configuration", async () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../../bin/lazygoal.cjs", import.meta.url)), "eval", "context", "run"], { cwd: fileURLToPath(new URL("../../../", import.meta.url)), encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Expected non-empty text/);
    assert.doesNotMatch(result.stdout, /http:\/\//);
    await assert.rejects(() => runContextCli(["invalid"]), /Usage/);
    await assert.rejects(() => loadContextRoles({}, process.cwd()), /Expected object/);
});
test("freeze CLI records an explicit hash approval without model configuration", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { candidate } = await import("./fixtures.js");
    const { reviewCandidate, readFrozenCase } = await import("../src/corpus.js");
    const directory = await mkdtemp(join(tmpdir(), "context-cli-freeze-"));
    try {
        const source = join(directory, "candidate");
        await candidate(source);
        const hash = await reviewCandidate(source);
        const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../../bin/lazygoal.cjs", import.meta.url)),
            "eval", "context", "freeze", "--candidate", source, "--corpus", join(directory, "corpus"),
            "--set", "challenge", "--version", "cli", "--approve-hash", hash, "--approved-by", "explicit-test-reviewer"],
            { cwd: fileURLToPath(new URL("../../../", import.meta.url)), encoding: "utf8", timeout: 10000 });
        assert.equal(result.status, 0, result.stderr);
        const frozen = await readFrozenCase(result.stdout.trim());
        assert.equal(frozen.candidateHash, hash);
        assert.equal(frozen.approvedBy, "explicit-test-reviewer");
    } finally { await rm(directory, { recursive: true, force: true }); }
});
