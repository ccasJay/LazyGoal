import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    IsolatedEnvironment,
    type EnvironmentSpec,
    type ProcessOptions,
    type ProcessRunner,
} from "../src/index.js";

interface ProcessCall {
    readonly command: string;
    readonly args: readonly string[];
    readonly options: ProcessOptions;
}

function fakeProcess(calls: ProcessCall[]): ProcessRunner {
    return async (command, args, options) => {
        calls.push({ command, args, options });
        if (args[0] === "image") return { code: 0, stdout: `sha256:${"b".repeat(64)}\n`, stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
    };
}

test("未实现 resolveNetworkMode 的现有 Spec 默认使用 network none 创建容器", async (t) => {
    const output = await mkdtemp(join(tmpdir(), "lazygoal-isolated-net-"));
    t.after(() => rm(output, { recursive: true, force: true }));

    const calls: ProcessCall[] = [];
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

    const calls: ProcessCall[] = [];
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

    const calls: ProcessCall[] = [];
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

test("显式代理继承只把标准代理变量注入 bridge 容器", async (t) => {
    const output = await mkdtemp(join(tmpdir(), "lazygoal-isolated-proxy-"));
    t.after(() => rm(output, { recursive: true, force: true }));

    const calls: ProcessCall[] = [];
    const environment = new IsolatedEnvironment({
        run: fakeProcess(calls),
        hostEnvironment: {
            HTTP_PROXY: "http://user:secret@127.0.0.1:7890",
            HTTPS_PROXY: "http://proxy.example:8443",
            NO_PROXY: "localhost,127.0.0.1",
            UNRELATED_SECRET: "must-not-enter-container",
        },
    });
    const proxySpec: EnvironmentSpec<{ id: string }, { ok: true }> = {
        benchmarkId: "proxy-test",
        resolveImage: () => ({ mode: "custom", image: "proxy:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/work" }),
        resolveNetworkMode: () => "bridge",
        inheritHostProxyEnvironment: () => true,
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() { return { ok: true }; },
    };

    const result = await environment.run({
        task: { id: "task-proxy" },
        spec: proxySpec,
        outputDirectory: output,
    });

    assert.equal(result.status, "completed");
    const create = calls.find((call) => call.command === "docker" && call.args[0] === "create");
    assert.ok(create);
    assert.ok(create.args.includes("host.docker.internal:host-gateway"));
    const injectedNames = create.args.flatMap((value, index) => (
        value === "--env" ? [create.args[index + 1]] : []
    ));
    assert.deepEqual(injectedNames, ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"]);
    assert.ok(!create.args.some((value) => value?.includes("secret")));
    assert.ok(!create.args.includes("UNRELATED_SECRET"));
    assert.equal(
        create.options.env?.HTTP_PROXY,
        "http://user:secret@host.docker.internal:7890/",
    );
    assert.equal(create.options.env?.NO_PROXY, "localhost,127.0.0.1");
});

test("代理继承拒绝 network none，且不会创建容器", async (t) => {
    const output = await mkdtemp(join(tmpdir(), "lazygoal-isolated-proxy-none-"));
    t.after(() => rm(output, { recursive: true, force: true }));

    const calls: ProcessCall[] = [];
    const environment = new IsolatedEnvironment({
        run: fakeProcess(calls),
        hostEnvironment: { HTTP_PROXY: "http://proxy.example:8080" },
    });
    const invalidSpec: EnvironmentSpec<{ id: string }, { ok: true }> = {
        benchmarkId: "proxy-none-test",
        resolveImage: () => ({ mode: "custom", image: "proxy:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/work" }),
        inheritHostProxyEnvironment: () => true,
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() { return { ok: true }; },
    };

    const result = await environment.run({
        task: { id: "task-proxy-none" },
        spec: invalidSpec,
        outputDirectory: output,
    });

    assert.equal(result.status, "infrastructure_error");
    assert.match(result.errors[0]?.message ?? "", /requires bridge/u);
    assert.equal(calls.some((call) => call.args[0] === "create"), false);
});
