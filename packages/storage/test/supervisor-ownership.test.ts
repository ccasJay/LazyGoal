import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { SupervisorOwnership } from "../src/supervisor-ownership";

test("ownership excludes another owner and close waits for active operations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "supervisor-owner-"));
    try {
        const path = join(dir, "owner.db");
        const owner = new SupervisorOwnership(path);
        assert.throws(() => new SupervisorOwnership(path), /locked/);
        let unblock!: () => void;
        const blocked = new Promise<void>((resolve) => { unblock = resolve; });
        const work = owner.run(async () => { await blocked; return 42; });
        const closing = owner.close();
        await assert.rejects(owner.run(async () => 0), /closed/);
        assert.throws(() => new SupervisorOwnership(path), /locked/);
        unblock();
        assert.equal(await work, 42);
        await closing;
        const replacement = new SupervisorOwnership(path);
        await assert.rejects(owner.run(async () => 0), /closed/);
        await replacement.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});


test("a killed owner releases the kernel lock without PID or timeout inference", async () => {
    const dir = await mkdtemp(join(tmpdir(), "supervisor-owner-"));
    const childPath = fileURLToPath(new URL("./fixtures/supervisor-ownership-child.ts", import.meta.url));
    const path = join(dir, "owner.db");
    const child = spawn(process.execPath, ["--import", "tsx", childPath, path], { stdio: ["pipe", "pipe", "pipe"] });
    try {
        const [chunk] = await once(child.stdout!, "data");
        assert.match(String(chunk), /ready/);
        assert.throws(() => new SupervisorOwnership(path), /locked/);
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
        const owner = new SupervisorOwnership(path);
        await owner.close();
    } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await rm(dir, { recursive: true, force: true });
    }
});
