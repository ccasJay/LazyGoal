import assert from "node:assert/strict";
import { test } from "node:test";
import { WORKER_ACP_SDK_VERSION, WORKER_NODE_IMAGE, WORKER_NODE_VERSION, WORKER_PLATFORM, type WorkerManifest } from "../src/worker-builder.js";
import { preflightWorker, WorkerPreflightError, type WorkerPreflightOptions } from "../src/worker-preflight.js";

const baseCommit = "a".repeat(40);
const workerSha256 = "b".repeat(64);
const nodeSha256 = "c".repeat(64);
const imageId = `sha256:${"d".repeat(64)}`;

const manifest: WorkerManifest = {
    manifestVersion: 1,
    workerSha256,
    sourceDigest: "e".repeat(64),
    lockDigest: "f".repeat(64),
    promptDigest: "0".repeat(64),
    buildDigest: "1".repeat(64),
    nodeVersion: WORKER_NODE_VERSION,
    nodeImage: WORKER_NODE_IMAGE,
    nodeImageId: imageId,
    platform: WORKER_PLATFORM,
    acpProtocolVersion: 1,
    acpSdkVersion: WORKER_ACP_SDK_VERSION,
    entryPoint: "src/worker.ts",
    workerFile: "worker.mjs",
    nodeFile: "node",
    nodeSha256,
    promptAssets: ["prompt.txt"],
};

function options(overrides: Partial<WorkerPreflightOptions> = {}): WorkerPreflightOptions {
    return { containerName: "lazygoal-test", imageId, baseCommit, manifest, ...overrides };
}

test("preflight checks platform, injected files, base commit and conda before returning facts", async () => {
    const calls: readonly string[][] = [];
    const run = async (_command: string, args: readonly string[]) => {
        (calls as string[][]).push([...args]);
        if (args[0] === "image") return { code: 0, stdout: "linux/amd64\n", stderr: "" };
        const command = args.at(-1);
        if (command === "--version") return { code: 0, stdout: "v22.22.2\n", stderr: "" };
        if (command === "ldd /opt/lazygoal/node") return { code: 0, stdout: "libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6\n", stderr: "" };
        if (command === "sha256sum /opt/lazygoal/worker.mjs") return { code: 0, stdout: `${workerSha256}  /opt/lazygoal/worker.mjs\n`, stderr: "" };
        if (command === "sha256sum /opt/lazygoal/node") return { code: 0, stdout: `${nodeSha256}  /opt/lazygoal/node\n`, stderr: "" };
        if (args.includes("rev-parse")) return { code: 0, stdout: `${baseCommit}\n`, stderr: "" };
        if (command?.includes("conda activate testbed")) return { code: 0, stdout: "Python 3.11.0\n", stderr: "" };
        throw new Error(`unexpected preflight command: ${args.join(" ")}`);
    };
    const result = await preflightWorker({ ...options(), run });
    assert.deepEqual(result, { platform: "linux/amd64", nodeVersion: "22.22.2", workerSha256, nodeSha256, baseCommit, condaPython: "Python 3.11.0" });
    assert.ok(calls.every((args) => !args.some((arg) => /API_KEY|TOKEN|AUTH/i.test(arg))));
});

test("preflight stops at the first failed boundary and preserves a bounded diagnostic", async () => {
    const calls: readonly string[][] = [];
    await assert.rejects(preflightWorker({
        ...options(),
        run: async (_command, args) => {
            (calls as string[][]).push([...args]);
            if (args[0] === "image") return { code: 0, stdout: "linux/arm64\n", stderr: "" };
            return { code: 0, stdout: "", stderr: "should not run" };
        },
    }), (error: unknown) => error instanceof WorkerPreflightError && error.check === "platform" && error.message.includes("linux/arm64"));
    assert.equal(calls.length, 1);
});

test("preflight rejects a digest mismatch before conda activation", async () => {
    let condaCalled = false;
    await assert.rejects(preflightWorker({
        ...options(),
        run: async (_command, args) => {
            if (args[0] === "image") return { code: 0, stdout: "linux/amd64\n", stderr: "" };
            const command = args.at(-1);
            if (command === "--version") return { code: 0, stdout: "v22.22.2\n", stderr: "" };
            if (command === "ldd /opt/lazygoal/node") return { code: 0, stdout: "libc.so.6 => /lib/libc.so.6\n", stderr: "" };
            if (command === "sha256sum /opt/lazygoal/worker.mjs") return { code: 0, stdout: `${"9".repeat(64)}  /opt/lazygoal/worker.mjs\n`, stderr: "" };
            if (command?.includes("conda activate testbed")) condaCalled = true;
            return { code: 0, stdout: `${baseCommit}\n`, stderr: "" };
        },
    }), (error: unknown) => error instanceof WorkerPreflightError && error.check === "worker_digest");
    assert.equal(condaCalled, false);
});
