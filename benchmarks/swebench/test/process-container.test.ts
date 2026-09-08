import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createToolRegistration, isExecutionAbortedError } from "../../../packages/runtime/src/index.js";
import { createSwebenchShell, SwebenchContainer } from "../src/container.js";
import { requireSuccess, runProcess, type ProcessRunner } from "../src/process.js";

const task = { instance_id: "astropy__astropy-12907", repo: "astropy/astropy", base_commit: "a".repeat(40),
    problem_statement: "Issue", image: "swebench/sweb.eval.x86_64.astropy_1776_astropy-12907:latest" };
const ok = { code: 0, stdout: "", stderr: "" };

test("process runner bounds observations but refuses to silently truncate patches", async () => {
    const result = await runProcess(process.execPath, ["-e", "process.stdout.write('x'.repeat(10000))"],
        { timeoutMs: 5000, maxBytes: 100, truncate: true });
    assert.equal(result.stdout, "[earlier output truncated]\n" + "x".repeat(100));
    await assert.rejects(runProcess(process.execPath, ["-e", "process.stdout.write('x'.repeat(10000))"],
        { timeoutMs: 5000, maxBytes: 100 }), /output exceeds/);
    await assert.rejects(runProcess(process.execPath, ["-e", "setInterval(()=>{}, 1000)"], { timeoutMs: 30 }), /exceeded/);
});

test("process abort terminates the child and propagates Runtime abort semantics", async () => {
    const controller = new AbortController();
    const promise = runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 5000, signal: controller.signal });
    controller.abort();
    await assert.rejects(promise, isExecutionAbortedError);
    await assert.rejects(runProcess("missing-lazygoal-command", [], { timeoutMs: 1000 }), /ENOENT/);
});

test("container shell never mounts the host or forwards its credentials, and executes input as one container argument", async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const run: ProcessRunner = async (command, args) => {
        calls.push({ command, args });
        return { ...ok, stdout: args[0] === "image" ? "sha256:abc\n" : "ok" };
    };
    const container = new SwebenchContainer("unique", task, run);
    await container.start();
    const input = "printf '%s' 'a; $(echo b)'\nls";
    const registration = createToolRegistration(createSwebenchShell(container));
    assert.equal(registration.prepare({ command: input, timeoutSeconds: 121 }).ok, false);
    assert.equal(registration.prepare({ command: " " }).ok, false);
    const prepared = registration.prepare({ command: input, timeoutSeconds: 10 });
    assert.equal(prepared.ok, true);
    if (prepared.ok) await prepared.execute("action");
    const create = calls.find((c) => c.args[0] === "create")!;
    assert.ok(create.args.includes("none"));
    assert.ok(create.args.includes("linux/amd64"));
    assert.ok(!create.args.some((a) => ["-v", "--mount", "--volume", "-e", "--env", "--privileged"].includes(a)));
    const shell = calls.at(-1)!;
    assert.equal(shell.command, "docker");
    assert.equal(shell.args.at(-1), `source /opt/miniconda3/etc/profile.d/conda.sh && conda activate testbed && ${input}`);
    assert.ok(shell.args.includes("timeout"));
    await container.close();
    await container.close();
    assert.equal(calls.filter((c) => c.args[0] === "rm").length, 1);
});

test("a failed container start removes the partially created container", async () => {
    const calls: string[] = [];
    const container = new SwebenchContainer("unique", task, async (_command, args) => {
        calls.push(args[0]!);
        return args[0] === "start" ? { ...ok, code: 1, stderr: "daemon error" } : { ...ok, stdout: "sha256:abc" };
    });
    await assert.rejects(container.start(), /daemon error/);
    assert.equal(calls.at(-1), "rm");
});

test("exported patch includes committed, staged, unstaged, deleted and new files and applies to base", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swe-patch-"));
    const git = async (...args: string[]) => requireSuccess(await runProcess("git", args, { cwd: directory, timeoutMs: 5000 }), "git");
    try {
        await git("init", "-q");
        await git("config", "user.email", "test@example.invalid");
        await git("config", "user.name", "Test");
        await writeFile(join(directory, "tracked.txt"), "before\n");
        await writeFile(join(directory, "deleted.txt"), "delete me\n");
        await git("add", ".");
        await git("commit", "-qm", "base");
        const base_commit = (await git("rev-parse", "HEAD")).trim();
        await writeFile(join(directory, "tracked.txt"), "committed\n");
        await git("commit", "-qam", "agent commit");
        await writeFile(join(directory, "tracked.txt"), "staged\n");
        await git("add", "tracked.txt");
        await writeFile(join(directory, "tracked.txt"), "final\n");
        await writeFile(join(directory, "new.txt"), "new\n");
        await rm(join(directory, "deleted.txt"));
        const container = new SwebenchContainer("test", { ...task, base_commit }, async (_command, args, options) =>
            runProcess("/bin/bash", ["-c", args.at(-1)!], { ...options, cwd: directory }));
        const patch = await container.exportPatch();
        assert.match(patch, /new file mode/);
        assert.match(patch, /deleted file mode/);
        await git("reset", "--hard", base_commit);
        await writeFile(join(directory, "prediction.patch"), patch);
        await git("apply", "prediction.patch");
        assert.equal(await readFile(join(directory, "tracked.txt"), "utf8"), "final\n");
        assert.equal(await readFile(join(directory, "new.txt"), "utf8"), "new\n");
        await assert.rejects(readFile(join(directory, "deleted.txt")), /ENOENT/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
