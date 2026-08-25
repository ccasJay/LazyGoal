import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { test } from "node:test";

import {
    SidecarAbortedError,
    SidecarClient,
    SidecarError,
    type SidecarProcess,
    type SidecarTask,
    type SpawnSidecar,
} from "../src/sidecar-client.js";

const task: SidecarTask = {
    taskId: "task-1",
    gameFile: "valid_seen/task-1/game.tw-pddl",
    split: "valid_seen",
    seed: 1,
    maxSteps: 20,
};

class FakeProcess extends EventEmitter implements SidecarProcess {
    readonly stdout = new PassThrough();
    readonly stderr = new PassThrough();
    readonly stdin: Writable;
    exitCode: number | null = null;
    killed = false;
    readonly requests: Array<Record<string, unknown>> = [];
    respond = true;
    responseOffset = 0;

    constructor() {
        super();
        this.stdin = new Writable({
            write: (chunk, _encoding, callback) => {
                const request = JSON.parse(String(chunk)) as Record<string, unknown>;
                this.requests.push(request);
                if (this.respond) this.answer(request);
                callback();
            },
        });
    }

    kill(): boolean {
        if (this.exitCode !== null) return false;
        this.killed = true;
        this.exitCode = 143;
        this.emit("exit", this.exitCode, "SIGTERM");
        return true;
    }

    answer(request: Record<string, unknown>): void {
        const requestId = Number(request.requestId) + this.responseOffset;
        switch (request.op) {
            case "health":
                this.stdout.write(JSON.stringify({
                    requestId,
                    ok: true,
                    result: {
                        pythonVersion: "3.9.19",
                        alfworldVersion: "0.4.2",
                        textworldVersion: "1.6.2",
                        dataRoot: "/data/alfworld",
                        textworldOnly: true,
                    },
                }) + "\n");
                break;
            case "reset":
                this.stdout.write(JSON.stringify({
                    requestId,
                    ok: true,
                    result: {
                        taskId: "task-1",
                        gameFile: task.gameFile,
                        observation: "You are in a room.",
                        admissibleCommands: ["look"],
                    },
                }) + "\n");
                break;
            case "step":
                this.stdout.write(JSON.stringify({
                    requestId,
                    ok: true,
                    result: {
                        observation: "Nothing happens.",
                        done: false,
                        won: false,
                        goalConditionSuccessRate: 0,
                        admissibleCommands: ["look"],
                        accepted: true,
                        error: null,
                    },
                }) + "\n");
                break;
            case "close":
                this.stdout.write(JSON.stringify({
                    requestId,
                    ok: true,
                    result: { closed: true },
                }) + "\n");
                queueMicrotask(() => {
                    if (this.exitCode === null) {
                        this.exitCode = 0;
                        this.emit("exit", 0, null);
                    }
                });
                break;
        }
    }
}

function createSpawn(fake: FakeProcess, options: { readonly capture?: (options: Record<string, unknown>) => void } = {}): SpawnSidecar {
    return (_command, _args, spawnOptions) => {
        options.capture?.(spawnOptions as unknown as Record<string, unknown>);
        return fake;
    };
}

function client(fake: FakeProcess, overrides: Record<string, unknown> = {}): SidecarClient {
    return new SidecarClient({
        pythonExecutable: "/python",
        scriptPath: "/sidecar.py",
        dataRoot: "/data/alfworld",
        spawnProcess: createSpawn(fake),
        ...overrides,
    });
}

test("SidecarClient uses shell:false and completes health/reset/step/close in order", async () => {
    const fake = new FakeProcess();
    let spawnOptions: Record<string, unknown> | undefined;
    const sidecar = new SidecarClient({
        pythonExecutable: "/python",
        scriptPath: "/sidecar.py",
        dataRoot: "/data/alfworld",
        spawnProcess: createSpawn(fake, { capture: (options) => { spawnOptions = options; } }),
    });

    const health = await sidecar.start();
    const reset = await sidecar.reset(task);
    const step = await sidecar.step("look");
    await sidecar.close();

    assert.equal(health.textworldOnly, true);
    assert.equal(reset.taskId, "task-1");
    assert.equal(step.accepted, true);
    assert.deepEqual(fake.requests.map((request) => request.op), ["health", "reset", "step", "close"]);
    assert.equal(spawnOptions?.shell, false);
});

test("SidecarClient rejects concurrent requests and terminates the unknown session", async () => {
    const fake = new FakeProcess();
    const sidecar = client(fake);
    await sidecar.start();
    await sidecar.reset(task);
    fake.respond = false;

    const first = sidecar.step("look");
    await assert.rejects(
        () => sidecar.step("inventory"),
        (error: unknown) => error instanceof SidecarError && error.code === "CONCURRENT_REQUEST",
    );
    await assert.rejects(
        () => first,
        (error: unknown) => error instanceof SidecarError && error.code === "CONCURRENT_REQUEST",
    );
    assert.equal(fake.killed, true);
});

test("SidecarClient turns timeout and abort into terminal errors", async () => {
    const timeoutProcess = new FakeProcess();
    const timeoutClient = client(timeoutProcess, { timeoutMs: 10 });
    await timeoutClient.start();
    timeoutProcess.respond = false;
    await assert.rejects(
        () => timeoutClient.step("look"),
        (error: unknown) => error instanceof SidecarError && error.code === "TIMEOUT",
    );
    assert.equal(timeoutProcess.killed, true);

    const abortProcess = new FakeProcess();
    const abortClient = client(abortProcess);
    await abortClient.start();
    abortProcess.respond = false;
    const controller = new AbortController();
    const request = abortClient.step("look", controller.signal);
    controller.abort();
    await assert.rejects(
        () => request,
        (error: unknown) => error instanceof SidecarAbortedError && error.code === "ABORTED",
    );
    assert.equal(abortProcess.killed, true);
});

test("SidecarClient rejects mismatched response IDs and unexpected process exit", async () => {
    const mismatchProcess = new FakeProcess();
    mismatchProcess.responseOffset = 1;
    const mismatchClient = client(mismatchProcess);
    await assert.rejects(
        () => mismatchClient.start(),
        (error: unknown) => error instanceof SidecarError && error.code === "PROTOCOL_ERROR",
    );

    const exitProcess = new FakeProcess();
    const exitClient = client(exitProcess);
    await exitClient.start();
    exitProcess.respond = false;
    const request = exitClient.step("look");
    await new Promise<void>((resolve) => setImmediate(resolve));
    exitProcess.exitCode = 1;
    exitProcess.emit("exit", 1, null);
    await assert.rejects(
        () => request,
        (error: unknown) => error instanceof SidecarError && error.code === "PROCESS_EXITED",
    );
});
