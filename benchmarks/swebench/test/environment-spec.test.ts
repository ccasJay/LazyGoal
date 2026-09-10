import assert from "node:assert/strict";
import { test } from "node:test";
import { WORKER_ACP_SDK_VERSION, WORKER_NODE_IMAGE, WORKER_NODE_VERSION, WORKER_PLATFORM, type WorkerManifest } from "../../src/worker-builder.js";
import type { EnvironmentHandle } from "../../src/isolated-environment.js";
import { SwebenchEnvironmentSpec } from "../src/environment-spec.js";
import type { SwebenchTask } from "../src/container.js";

const task: SwebenchTask = {
    instance_id: "astropy__astropy-12907",
    repo: "astropy/astropy",
    base_commit: "a".repeat(40),
    problem_statement: "Fix the issue.",
    image: "swebench/sweb.eval.x86_64.astropy_1776_astropy-12907:latest",
};

const manifest: WorkerManifest = {
    manifestVersion: 1,
    workerSha256: "b".repeat(64),
    sourceDigest: "c".repeat(64),
    lockDigest: "d".repeat(64),
    promptDigest: "e".repeat(64),
    buildDigest: "f".repeat(64),
    nodeVersion: WORKER_NODE_VERSION,
    nodeImage: WORKER_NODE_IMAGE,
    nodeImageId: `sha256:${"1".repeat(64)}`,
    platform: WORKER_PLATFORM,
    acpProtocolVersion: 1,
    acpSdkVersion: WORKER_ACP_SDK_VERSION,
    entryPoint: "benchmarks/swebench/src/worker.ts",
    workerFile: "worker.mjs",
    nodeFile: "node",
    nodeSha256: "2".repeat(64),
    promptAssets: [],
};

const metadata = {
    instanceId: task.instance_id,
    repo: task.repo,
    baseCommit: task.base_commit,
    problemStatement: task.problem_statement,
    goalId: "goal-1",
    runId: "run-1",
    maxSteps: 4,
    structuredOutputMode: "strict" as const,
};

function handle(calls: string[]): EnvironmentHandle {
    return {
        workdir: "/testbed",
        exec: async (command) => {
            calls.push(command);
            if (command === "git reset --hard aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && git clean -fd && git diff --exit-code aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") {
                return { code: 0, stdout: "", stderr: "" };
            }
            if (command.includes("--version")) return { code: 0, stdout: "v22.22.2\n", stderr: "" };
            if (command === "ldd /opt/lazygoal/node") return { code: 0, stdout: "libc.so.6 => /lib/libc.so.6\n", stderr: "" };
            if (command === "sha256sum /opt/lazygoal/worker.mjs") return { code: 0, stdout: `${manifest.workerSha256}  /opt/lazygoal/worker.mjs\n`, stderr: "" };
            if (command === "sha256sum /opt/lazygoal/node") return { code: 0, stdout: `${manifest.nodeSha256}  /opt/lazygoal/node\n`, stderr: "" };
            if (command === "git rev-parse HEAD") return { code: 0, stdout: `${task.base_commit}\n`, stderr: "" };
            if (command.includes("conda activate testbed")) return { code: 0, stdout: "Python 3.11.0\n", stderr: "" };
            throw new Error(`unexpected command: ${command}`);
        },
        copyInto: async () => undefined,
        copyOut: async (_source, target) => target,
    };
}

test("SWE-bench EnvironmentSpec resets through the restricted handle and runs generic preflight", async () => {
    const calls: string[] = [];
    const spec = new SwebenchEnvironmentSpec({
        task,
        artifact: {
            digest: manifest.buildDigest,
            directory: "/tmp/worker",
            workerPath: "/tmp/worker/worker.mjs",
            nodePath: "/tmp/worker/node",
            manifestPath: "/tmp/worker/manifest.json",
            manifest,
            cacheHit: false,
        },
        manifest,
        metadata,
    });
    const env = handle(calls);
    await spec.prepareEnvironment(env);
    const preflight = await spec.preflight(env);
    assert.equal(preflight.ok, true);
    assert.ok(calls[0]?.startsWith("git reset --hard"));
    assert.ok(calls.some((command) => command.includes("conda activate testbed")));
});
