import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    IsolatedEnvironment,
    type EnvironmentSpec,
    type EnvironmentHandle,
    type IsolatedContainer,
    type ProcessRunner,
    type InteractiveProcess,
} from "../src/index.js";

function fixtureSpec(calls: string[]): EnvironmentSpec<{ id: string }, { readonly ok: true }> {
    return {
        benchmarkId: "fixture",
        resolveImage: () => ({ mode: "custom", image: "fixture:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/work" }),
        async prepareEnvironment(env) {
            calls.push(`prepare:${env.workdir}`);
            const result = await env.exec("echo prepare");
            assert.equal(result.code, 0);
        },
        async preflight(env) {
            calls.push(`preflight:${env.workdir}`);
            return { ok: true };
        },
        async collectArtifacts(env, output) {
            calls.push(`collect:${env.workdir}:${output}`);
            return { ok: true };
        },
    };
}

function fakeProcess(calls: { command: string; args: readonly string[] }[]): ProcessRunner {
    return async (command, args) => {
        calls.push({ command, args });
        if (args[0] === "image") return { code: 0, stdout: `sha256:${"a".repeat(64)}\n`, stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
    };
}

function fakeInteractive(): InteractiveProcess {
    const input = new TransformStream<Uint8Array, Uint8Array>();
    const output = new TransformStream<Uint8Array, Uint8Array>();
    const diagnostics = new TransformStream<Uint8Array, Uint8Array>();
    return {
        input: input.writable,
        output: output.readable,
        errorOutput: diagnostics.readable,
        closed: Promise.resolve({ code: 0, stdout: "", stderr: "" }),
        kill() {},
    };
}

test("IsolatedEnvironment owns secure container lifecycle and exposes a restricted handle", async (t) => {
    const output = await mkdtemp(join(tmpdir(), "lazygoal-isolated-"));
    t.after(() => rm(output, { recursive: true, force: true }));
    const calls: { command: string; args: readonly string[] }[] = [];
    const specCalls: string[] = [];
    const environment = new IsolatedEnvironment({ run: fakeProcess(calls) });
    const result = await environment.run({
        task: { id: "task-1" },
        spec: fixtureSpec(specCalls),
        outputDirectory: output,
    });
    assert.equal(result.status, "completed");
    assert.deepEqual(result.artifact, { ok: true });
    assert.deepEqual(specCalls.map((value) => value.split(":")[0]), ["prepare", "preflight", "collect"]);
    const create = calls.find((call) => call.args[0] === "create");
    assert.ok(create);
    assert.ok(create.args.includes("none"));
    assert.ok(create.args.includes("ALL"));
    assert.ok(create.args.includes("no-new-privileges"));
    assert.ok(!Object.prototype.hasOwnProperty.call(result, "containerName"));
});

test("IsolatedEnvironment cancellation prevents a successful terminal result", async () => {
    const controller = new AbortController();
    controller.abort();
    const calls: { command: string; args: readonly string[] }[] = [];
    const result = await new IsolatedEnvironment({ run: fakeProcess(calls) }).run({
        task: { id: "cancelled" },
        spec: fixtureSpec([]),
        outputDirectory: join(tmpdir(), "lazygoal-cancelled"),
        signal: controller.signal,
    });
    assert.equal(result.status, "cancelled");
    assert.equal(result.artifact, null);
    assert.equal(calls.length, 0);
});

test("IsolatedEnvironment can drive an ACP-ready Worker callback after preflight", async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    let callbackCalled = false;
    const result = await new IsolatedEnvironment({
        run: fakeProcess(calls),
        interactiveRun: async () => fakeInteractive(),
    }).run({
        task: { id: "agent" },
        spec: fixtureSpec([]),
        outputDirectory: join(tmpdir(), "lazygoal-agent"),
        runAgent: async ({ environment, worker, mux }) => {
            callbackCalled = environment.workdir === "/work" && worker !== undefined && mux !== undefined;
        },
    });
    assert.equal(result.status, "completed");
    assert.equal(callbackCalled, true);
});

test("trusted process snapshots reject scoring while an Agent child process remains", async (t) => {
    const output = await mkdtemp(join(tmpdir(), "lazygoal-process-quiescence-"));
    t.after(() => rm(output, { recursive: true, force: true }));
    let topCount = 0;
    const environment = new IsolatedEnvironment({
        run: async (_command, args) => {
            if (args[0] === "image") return { code: 0, stdout: `sha256:${"a".repeat(64)}\n`, stderr: "" };
            if (args[0] === "top") {
                topCount += 1;
                const baseline = "1 Mon Jan 1 00:00:00 2026\n";
                return {
                    code: 0,
                    stdout: topCount === 1 ? baseline : `${baseline}99 Mon Jan 1 00:01:00 2026\n`,
                    stderr: "",
                };
            }
            return { code: 0, stdout: "", stderr: "" };
        },
        interactiveRun: async () => fakeInteractive(),
    });
    const spec: EnvironmentSpec<{ id: string }, { readonly scored: true }> = {
        benchmarkId: "process-quiescence",
        resolveImage: () => ({ mode: "custom", image: "fixture:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/work" }),
        async prepareEnvironment() {},
        async preflight(handle) {
            await handle.captureAgentProcessBaseline?.();
            return { ok: true };
        },
        async collectArtifacts(handle) {
            await handle.assertAgentProcessesExited?.();
            return { scored: true };
        },
    };
    const result = await environment.run({
        task: { id: "task" },
        spec,
        outputDirectory: output,
        runAgent: async () => {},
    });

    assert.equal(result.status, "infrastructure_error");
    assert.equal(result.artifact, null);
    assert.match(result.errors.map((error) => error.message).join(" "), /Agent process\(es\) remain/u);
});

test("IsolatedEnvironment cleans up stray agent processes before scoring when baseline recovers", async (t) => {
    const output = await mkdtemp(join(tmpdir(), "iso-proc-clean-"));
    t.after(() => rm(output, { recursive: true, force: true }));

    let topCount = 0;
    const calls: string[] = [];
    const environment = new IsolatedEnvironment({
        run: async (_command, args) => {
            if (args[0] === "image") return { code: 0, stdout: `sha256:${"a".repeat(64)}\n`, stderr: "" };
            if (args[0] === "exec") {
                calls.push(`exec:${args.join(" ")}`);
                return { code: 0, stdout: "", stderr: "" };
            }
            if (args[0] === "top") {
                topCount += 1;
                const baseline = "1 Mon Jan 1 00:00:00 2026\n";
                // topCount 1: baseline; topCount 2: stray process present; topCount 3: after cleanup, back to baseline
                return {
                    code: 0,
                    stdout: topCount === 2 ? `${baseline}99 Mon Jan 1 00:01:00 2026\n` : baseline,
                    stderr: "",
                };
            }
            return { code: 0, stdout: "", stderr: "" };
        },
        interactiveRun: async () => fakeInteractive(),
    });
    const spec: EnvironmentSpec<{ id: string }, { readonly scored: true }> = {
        benchmarkId: "process-quiescence-recovery",
        resolveImage: () => ({ mode: "custom", image: "fixture:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/work" }),
        async prepareEnvironment() {},
        async preflight(handle) {
            await handle.captureAgentProcessBaseline?.();
            return { ok: true };
        },
        async collectArtifacts(handle) {
            await handle.assertAgentProcessesExited?.();
            return { scored: true };
        },
    };
    const result = await environment.run({
        task: { id: "task" },
        spec,
        outputDirectory: output,
        runAgent: async () => {},
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(result.artifact, { scored: true });
    assert.equal(result.errors.length, 0);
    assert.ok(calls.some((c) => c.includes("lazygoal-agent-baseline-pids")));
});

function fakeHandle(workdir: string, signal: AbortSignal, calls: string[]): EnvironmentHandle {
    return {
        workdir,
        exec: async (command) => {
            calls.push(`exec:${command}:${signal.aborted ? "aborted" : "active"}`);
            return { code: 0, stdout: "", stderr: "" };
        },
        copyInto: async (source, target) => { calls.push(`copy-in:${source}->${target}`); },
        copyOut: async (source, target) => {
            calls.push(`copy-out:${source}->${target}:${signal.aborted ? "aborted" : "active"}`);
            return target;
        },
    };
}

function customContainer(calls: string[], closeError = false): IsolatedContainer {
    return {
        imageId: `sha256:${"e".repeat(64)}`,
        async start() { calls.push("start"); },
        async injectWorker() { calls.push("inject"); },
        createHandle: (workdir, signal) => fakeHandle(workdir, signal, calls),
        async openWorkerProcess() { calls.push("open"); return fakeInteractive(); },
        async close() {
            calls.push("close");
            if (closeError) throw new Error("close failed");
        },
    };
}

test("IsolatedEnvironment keeps artifact collection alive after cancellation", async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    const spec: EnvironmentSpec<{ id: string }, { readonly collected: true }> = {
        benchmarkId: "cancel-artifacts",
        resolveImage: () => ({ mode: "custom", image: "fixture:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/work" }),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts(env) {
            await env.exec("collect");
            return { collected: true };
        },
    };
    const result = await new IsolatedEnvironment().run({
        task: { id: "cancel-artifacts" },
        spec,
        outputDirectory: join(tmpdir(), "lazygoal-cancel-artifacts"),
        container: customContainer(calls),
        signal: controller.signal,
        runAgent: async () => { controller.abort(); },
    });
    assert.equal(result.status, "cancelled");
    assert.deepEqual(result.artifact, { collected: true });
    assert.ok(calls.includes("exec:collect:active"));
});

test("IsolatedEnvironment records artifact and cleanup failures as infrastructure errors", async () => {
    const calls: string[] = [];
    const spec: EnvironmentSpec<{ id: string }, null> = {
        benchmarkId: "failure-stages",
        resolveImage: () => ({ mode: "custom", image: "fixture:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/work" }),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() { throw new Error("copy failed"); },
    };
    const result = await new IsolatedEnvironment().run({
        task: { id: "failure-stages" },
        spec,
        outputDirectory: join(tmpdir(), "lazygoal-failure-stages"),
        container: customContainer(calls, true),
    });
    assert.equal(result.status, "infrastructure_error");
    assert.deepEqual(result.errors.map((error) => error.stage), ["artifact_collect", "cleanup"]);
    assert.deepEqual(calls, ["start", "inject", "close"]);
});

test("IsolatedEnvironment rejects Dockerfile image injection before any Docker call", async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const spec: EnvironmentSpec<{ id: string }, null> = {
        benchmarkId: "unsafe-image",
        resolveImage: () => ({ mode: "managed", baseImage: "node:latest\nRUN touch /tmp/escaped", installCommands: [] }),
        getWorkerEntryConfig: () => ({}),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() { return null; },
    };
    await assert.rejects(
        new IsolatedEnvironment({ run: fakeProcess(calls) }).run({
            task: { id: "unsafe-image" },
            spec,
            outputDirectory: join(tmpdir(), "lazygoal-unsafe-image"),
        }),
        /unsupported characters/,
    );
    assert.equal(calls.length, 0);
});

test("IsolatedEnvironment removes a named container when Docker create fails", async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const run: ProcessRunner = async (command, args) => {
        calls.push({ command, args });
        if (args[0] === "image") return { code: 0, stdout: `sha256:${"a".repeat(64)}\tlinux/amd64\n`, stderr: "" };
        if (args[0] === "create") return { code: 1, stdout: "", stderr: "create failed" };
        return { code: 0, stdout: "", stderr: "" };
    };
    const result = await new IsolatedEnvironment({ run }).run({
        task: { id: "create-failure" },
        spec: fixtureSpec([]),
        outputDirectory: join(tmpdir(), "lazygoal-create-failure"),
    });
    assert.equal(result.status, "infrastructure_error");
    assert.ok(calls.some((call) => call.args[0] === "rm"));
});

test("IsolatedEnvironment forceSignal 触发时提前终止产物回收并执行有界容器删除", async () => {
    const calls: string[] = [];
    const forceController = new AbortController();
    let collectAborted = false;

    const spec: EnvironmentSpec<{ id: string }, null> = {
        benchmarkId: "force-signal",
        resolveImage: () => ({ mode: "custom", image: "fixture:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/work" }),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() {
            calls.push("collect_start");
            // 模拟慢产物收集：永不 resolve，等待外部 force 信号打断
            await new Promise<never>(() => {});
            return null;
        },
    };

    const container = customContainer(calls);
    const envPromise = new IsolatedEnvironment().run({
        task: { id: "force-signal-task" },
        spec,
        outputDirectory: join(tmpdir(), "lazygoal-force-signal"),
        container,
        forceSignal: forceController.signal,
        runAgent: async () => {
            // Agent 正常结束，进入 finally
        },
    });

    // 延迟 20ms 后发出 force 信号打断产物收集
    setTimeout(() => {
        forceController.abort();
    }, 20);

    const result = await envPromise;
    assert.equal(result.status, "infrastructure_error");
    const collectError = result.errors.find((e) => e.stage === "artifact_collect");
    assert.ok(collectError);
    assert.match(collectError.message, /force signal/);
    assert.ok(calls.includes("collect_start"));
    assert.ok(calls.includes("close")); // 容器最终依然被 close 删除
});

test("IsolatedEnvironment forceSignal 下共享清理预算耗尽时跳过产物回收但保证容器删除", async () => {
    const calls: string[] = [];
    const forceController = new AbortController();
    let collectCalled = false;

    const spec: EnvironmentSpec<{ id: string }, null> = {
        benchmarkId: "grace-exhausted",
        resolveImage: () => ({ mode: "custom", image: "fixture:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/work" }),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() {
            collectCalled = true;
            return null;
        },
    };

    // 假 Worker 不退出，耗尽 30ms 的总预算
    const slowWorker: InteractiveProcess = {
        ...fakeInteractive(),
        closed: new Promise<never>(() => {}), // 永不退出
    };

    const container: IsolatedContainer = {
        ...customContainer(calls),
        async openWorkerProcess() {
            return slowWorker;
        },
    };

    const result = await new IsolatedEnvironment().run({
        task: { id: "grace-task" },
        spec,
        outputDirectory: join(tmpdir(), "lazygoal-grace-exhausted"),
        container,
        artifactGraceMs: 30, // 预算 30ms
        forceSignal: forceController.signal,
        runAgent: async () => {
            // Agent 正常完成
        },
    });

    // 由于预算在 worker settle 时已耗尽，产物回收被跳过
    assert.equal(collectCalled, false);
    assert.ok(result.errors.some((e) => e.stage === "transport" || e.stage === "artifact_collect"));
    assert.ok(calls.includes("close")); // 容器仍然被删除
});

test("IsolatedEnvironment 容器删除失败时错误记录包含容器标识且结果为 infrastructure_error", async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const run: ProcessRunner = async (command, args) => {
        calls.push({ command, args });
        if (args[0] === "image") return { code: 0, stdout: `sha256:${"a".repeat(64)}\tlinux/amd64\n`, stderr: "" };
        if (args[0] === "create") return { code: 0, stdout: "cid123", stderr: "" };
        if (args[0] === "start") return { code: 0, stdout: "", stderr: "" };
        if (args[0] === "rm") return { code: 1, stdout: "", stderr: "Docker daemon error: container busy" };
        return { code: 0, stdout: "", stderr: "" };
    };

    const result = await new IsolatedEnvironment({ run }).run({
        task: { id: "delete-fail-task" },
        spec: fixtureSpec([]),
        outputDirectory: join(tmpdir(), "lazygoal-delete-fail"),
        forceSignal: new AbortController().signal,
    });

    assert.equal(result.status, "infrastructure_error");
    const cleanupError = result.errors.find((e) => e.stage === "cleanup");
    assert.ok(cleanupError);
    // 报错信息中必须包含本次容器标识（名称匹配 lazygoal-fixture-）
    assert.match(cleanupError.message, /lazygoal-fixture-/);
});

test("IsolatedEnvironment taskTimeoutMs 超时时标记为 failed 并记录 TASK_TIMEOUT 错误，而不是 cancelled", async () => {
    const calls: string[] = [];
    const spec: EnvironmentSpec<{ id: string }, { readonly collected: boolean }> = {
        benchmarkId: "timeout-task",
        resolveImage: () => ({ mode: "custom", image: "fixture:latest" }),
        getWorkerEntryConfig: () => ({ cwd: "/work" }),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() {
            return { collected: true };
        },
    };
    const result = await new IsolatedEnvironment().run({
        task: { id: "timeout-test" },
        spec,
        outputDirectory: join(tmpdir(), "lazygoal-timeout-test"),
        container: customContainer(calls),
        taskTimeoutMs: 50,
        runAgent: async ({ signal }) => {
            await new Promise((resolve) => {
                if (signal.aborted) resolve(undefined);
                else signal.addEventListener("abort", () => resolve(undefined), { once: true });
            });
        },
    });

    assert.equal(result.status, "failed");
    assert.deepEqual(result.artifact, { collected: true });
    const timeoutError = result.errors.find((e) => e.code === "TASK_TIMEOUT");
    assert.ok(timeoutError, "应当记录 TASK_TIMEOUT 错误");
    assert.equal(timeoutError.stage, "agent");
});
