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
