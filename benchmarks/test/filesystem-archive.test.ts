import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { hashArchiveFile, loadFilesystemArchive } from "../src/filesystem-archive.js";
import { IsolatedEnvironment } from "../src/isolated-environment.js";
import type { ProcessRunner } from "../src/process.js";
test("corrupted archive is rejected before Docker load; image identity is verified after load", async t => {
    const root = await mkdtemp(join(tmpdir(), "filesystem-test-")); t.after(() => rm(root, { recursive: true, force: true }));
    const file = join(root, "filesystem.tar"); await writeFile(file, "fixture");
    const archive = { file: "filesystem.tar" as const, imageId: `sha256:${"a".repeat(64)}`, sha256: await hashArchiveFile(file) };
    const calls: string[] = [];
    const run: ProcessRunner = async (_command, args) => { calls.push(args[0]!); return { code: 0, stderr: "", stdout: archive.imageId }; };
    await loadFilesystemArchive(root, archive, run);
    assert.deepEqual(calls, ["load", "image"]);
    await writeFile(file, "tampered"); calls.length = 0;
    await assert.rejects(() => loadFilesystemArchive(root, archive, run), /corrupted/);
    assert.equal(calls.length, 0);
    await symlink(file, join(root, "link")); await assert.rejects(() => hashArchiveFile(join(root, "link")), /regular file/);
});
for (const violation of ["mounted", "process"] as const) test(`filesystem capture rejects ${violation} state without committing and cleans container`, async t => {
    const root = await mkdtemp(join(tmpdir(), "capture-reject-")); t.after(() => rm(root, { recursive: true, force: true }));
    const calls: string[] = []; let topCalls = 0;
    const run: ProcessRunner = async (_cmd, args) => {
        calls.push(args[0]!);
        const stdout = args[0] === "image" ? `sha256:${"a".repeat(64)}` : args[0] === "top" ? `PID START\n1 baseline\n${violation === "process" && ++topCalls > 1 ? "2 child\n" : ""}` : args[0] === "inspect" ? '[{"Type":"volume"}]' : "";
        return { code: 0, stdout, stderr: "" };
    };
    const result = await new IsolatedEnvironment({ run }).run({ task: null, outputDirectory: root, spec: {
        benchmarkId: "archive", resolveImage: () => ({ mode: "custom", image: "fixture:latest" }), getWorkerEntryConfig: () => ({}),
        prepareEnvironment: async () => {}, preflight: async env => { await env.captureAgentProcessBaseline!(); return { ok: true }; },
        collectArtifacts: async env => env.saveFilesystemArchive!(root),
    } });
    assert.equal(result.artifact, null);
    assert.match(result.errors.map(e => e.message).join(" "), violation === "mounted" ? /mounted state/ : /processes remain/);
    assert.equal(calls.includes("commit"), false);
    assert.equal(calls.includes("rm"), true);
});
