import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    IsolatedEnvironment,
    type EnvironmentSpec,
    type ProcessRunner,
} from "../src/index.js";

function fakeProcess(calls: { command: string; args: readonly string[] }[]): ProcessRunner {
    return async (command, args) => {
        calls.push({ command, args });
        if (args[0] === "image") return { code: 0, stdout: `sha256:${"b".repeat(64)}\n`, stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
    };
}

test("未实现 resolveNetworkMode 的现有 Spec 默认使用 network none 创建容器", async (t) => {
    const output = await mkdtemp(join(tmpdir(), "lazygoal-isolated-net-"));
    t.after(() => rm(output, { recursive: true, force: true }));

    const calls: { command: string; args: readonly string[] }[] = [];
    const environment = new IsolatedEnvironment({ run: fakeProcess(calls) });

    const defaultSpec: EnvironmentSpec<{ id: string }, { ok: true }> = {
        benchmarkId: "legacy-test",
        resolveImage: () => ({ mode: "custom", image: "legacy:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/work" }),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() { return { ok: true }; },
    };

    const result = await environment.run({
        task: { id: "task-legacy" },
        spec: defaultSpec,
        outputDirectory: output,
    });

    assert.equal(result.status, "completed");
    const create = calls.find((c) => c.command === "docker" && c.args[0] === "create");
    assert.ok(create);
    const netIndex = create.args.indexOf("--network");
    assert.notEqual(netIndex, -1);
    assert.equal(create.args[netIndex + 1], "none");
});

test("实现 resolveNetworkMode 返回 bridge 时容器使用 network bridge 创建", async (t) => {
    const output = await mkdtemp(join(tmpdir(), "lazygoal-isolated-net-"));
    t.after(() => rm(output, { recursive: true, force: true }));

    const calls: { command: string; args: readonly string[] }[] = [];
    const environment = new IsolatedEnvironment({ run: fakeProcess(calls) });

    const bridgeSpec: EnvironmentSpec<{ id: string; net: "bridge" | "none" }, { ok: true }> = {
        benchmarkId: "tua-bridge-test",
        resolveImage: () => ({ mode: "custom", image: "bridge:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/home/agent" }),
        resolveNetworkMode: (task) => task.net,
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() { return { ok: true }; },
    };

    const result = await environment.run({
        task: { id: "task-bridge", net: "bridge" },
        spec: bridgeSpec,
        outputDirectory: output,
    });

    assert.equal(result.status, "completed");
    const create = calls.find((c) => c.command === "docker" && c.args[0] === "create");
    assert.ok(create);
    const netIndex = create.args.indexOf("--network");
    assert.notEqual(netIndex, -1);
    assert.equal(create.args[netIndex + 1], "bridge");
});

test("实现 resolveNetworkMode 返回 none 时容器使用 network none 创建", async (t) => {
    const output = await mkdtemp(join(tmpdir(), "lazygoal-isolated-net-"));
    t.after(() => rm(output, { recursive: true, force: true }));

    const calls: { command: string; args: readonly string[] }[] = [];
    const environment = new IsolatedEnvironment({ run: fakeProcess(calls) });

    const bridgeSpec: EnvironmentSpec<{ id: string; net: "bridge" | "none" }, { ok: true }> = {
        benchmarkId: "tua-none-test",
        resolveImage: () => ({ mode: "custom", image: "none:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/home/agent" }),
        resolveNetworkMode: (task) => task.net,
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() { return { ok: true }; },
    };

    const result = await environment.run({
        task: { id: "task-none", net: "none" },
        spec: bridgeSpec,
        outputDirectory: output,
    });

    assert.equal(result.status, "completed");
    const create = calls.find((c) => c.command === "docker" && c.args[0] === "create");
    assert.ok(create);
    const netIndex = create.args.indexOf("--network");
    assert.notEqual(netIndex, -1);
    assert.equal(create.args[netIndex + 1], "none");
});

