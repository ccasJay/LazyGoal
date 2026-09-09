import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { SwebenchContainer, type SwebenchTask } from "../src/container.js";
import type { WorkerPreflightResult } from "../src/worker-preflight.js";
import { runSwebenchSupervisor } from "../src/supervisor.js";
import type { WorkerArtifact, WorkerManifest } from "../src/worker-builder.js";
import type { SwebenchAcpTaskMetadata } from "../src/worker-runtime.js";

const task: SwebenchTask = {
    instance_id: "astropy__astropy-12907",
    repo: "astropy/astropy",
    base_commit: "a".repeat(40),
    problem_statement: "Fix the issue.",
    image: "swebench/sweb.eval.x86_64.astropy_1776_astropy-12907:latest",
};
const metadata: SwebenchAcpTaskMetadata = {
    instanceId: task.instance_id,
    repo: task.repo,
    baseCommit: task.base_commit,
    problemStatement: task.problem_statement,
    goalId: "goal-1",
    runId: "run-1",
    maxSteps: 4,
    structuredOutputMode: "strict",
};
const manifest: WorkerManifest = {
    manifestVersion: 1,
    entryPoint: "worker.ts",
    workerFile: "worker.mjs",
    nodeFile: "node",
    workerSha256: "b".repeat(64),
    sourceDigest: "c".repeat(64),
    lockDigest: "d".repeat(64),
    promptDigest: "e".repeat(64),
    buildDigest: "f".repeat(64),
    nodeVersion: "22.22.2",
    nodeImage: "node:22.22.2-bookworm-slim",
    nodeImageId: "sha256:" + "1".repeat(64),
    nodeSha256: "2".repeat(64),
    platform: "linux/amd64",
    acpProtocolVersion: 1,
    acpSdkVersion: "1.4.0",
    promptAssets: [],
};
const artifact: WorkerArtifact = {
    digest: "3".repeat(64),
    directory: "/tmp/worker",
    workerPath: "/tmp/worker/worker.mjs",
    nodePath: "/tmp/worker/node",
    manifestPath: "/tmp/worker/manifest.json",
    manifest,
    cacheHit: false,
};
const llmAdapter: LLMAdapter = {
    structuredOutputMode: "strict",
    generate: async () => { throw new Error("model must not be called by cleanup tests"); },
};

class FakeContainer extends SwebenchContainer {
    constructor(
        readonly events: string[],
        private readonly failures: ReadonlySet<string> = new Set(),
        private readonly hangCopy = false,
    ) {
        super("fake-container", task, async () => ({ code: 0, stdout: "", stderr: "" }));
    }

    override async start(): Promise<void> {
        this.events.push("start");
        if (this.failures.has("start")) throw new Error("start failed");
    }

    override async injectWorker(): Promise<void> {
        this.events.push("inject");
        if (this.failures.has("inject")) throw new Error("inject failed");
    }

    override async preflightWorker(): Promise<WorkerPreflightResult> {
        this.events.push("preflight");
        if (this.failures.has("preflight")) throw new Error("preflight failed");
        return {
            platform: "linux/amd64",
            nodeVersion: "22.22.2",
            workerSha256: manifest.workerSha256,
            nodeSha256: manifest.nodeSha256,
            baseCommit: task.base_commit,
            condaPython: "Python 3.11.0",
        };
    }

    override async copyWorkerArtifact(
        _instanceId: string,
        outputDirectory: string,
        kind: "goals" | "trajectories" | "traces",
    ): Promise<string> {
        this.events.push(`copy:${kind}`);
        if (this.hangCopy) return new Promise<string>(() => undefined);
        if (this.failures.has(kind)) throw new Error(`${kind} copy failed`);
        const directory = join(outputDirectory, "runtime", kind);
        await mkdir(directory, { recursive: true });
        if (kind === "goals") {
            await writeFile(join(directory, Buffer.from(metadata.goalId).toString("base64url") + ".json"),
                JSON.stringify({ id: metadata.goalId, state: { run: { id: metadata.runId } } }));
        }
        return directory;
    }

    override async exportPatch(): Promise<string> {
        this.events.push("patch");
        if (this.failures.has("patch")) throw new Error("patch export failed");
        return "diff --git a/f.py b/f.py\n";
    }

    override async close(): Promise<void> {
        this.events.push("close");
    }
}

function options(container: SwebenchContainer, outputDirectory: string, artifactGraceMs = 100): Parameters<typeof runSwebenchSupervisor>[0] {
    return {
        task,
        container,
        artifact,
        manifest,
        metadata,
        llmAdapter,
        outputDirectory,
        taskTimeoutMs: 5000,
        artifactGraceMs,
        openWorkerProcess: async () => {
            if (container instanceof FakeContainer) container.events.push("open");
            throw new Error("worker handshake failed");
        },
    };
}

test("Supervisor records independent artifact failures and closes after the final export", async () => {
    const output = await mkdtemp(join(tmpdir(), "swe-supervisor-"));
    const events: string[] = [];
    const result = await runSwebenchSupervisor(options(
        new FakeContainer(events, new Set(["trajectories", "traces", "patch"])), output,
    ));
    assert.deepEqual(events, ["start", "inject", "preflight", "open", "copy:goals", "copy:trajectories", "copy:traces", "patch", "close"]);
    assert.equal(result.patch, null);
    assert.equal(result.persistence?.goalSnapshot, "runtime/goals");
    assert.equal(result.persistence?.trajectory, "runtime/goals");
    assert.equal(result.errors.filter((error) => error.stage === "artifact_copy").length, 2);
    assert.equal(result.errors.filter((error) => error.stage === "patch_export").length, 1);
    assert.equal(result.errors[0]?.stage, "transport");
});

test("Supervisor still copies and removes the container when setup fails", async () => {
    const output = await mkdtemp(join(tmpdir(), "swe-supervisor-"));
    const events: string[] = [];
    const result = await runSwebenchSupervisor(options(new FakeContainer(events, new Set(["start"])), output));
    assert.deepEqual(events, ["start", "copy:goals", "copy:trajectories", "copy:traces", "patch", "close"]);
    assert.equal(result.errors[0]?.stage, "container_start");
    assert.equal(result.patch?.startsWith("diff --git"), true);
    assert.equal(result.persistence?.goalSnapshot, "runtime/goals");
});

test("Supervisor does not wait forever for an artifact operation after the grace deadline", async () => {
    const output = await mkdtemp(join(tmpdir(), "swe-supervisor-"));
    const events: string[] = [];
    const started = Date.now();
    const result = await runSwebenchSupervisor(options(new FakeContainer(events, new Set(), true), output, 20));
    assert.ok(Date.now() - started < 1000);
    assert.deepEqual(events, ["start", "inject", "preflight", "open", "copy:goals", "close"]);
    assert.equal(result.patch, null);
    assert.ok(result.errors.some((error) => error.stage === "artifact_copy"));
});
