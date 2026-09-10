import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    WORKER_ACP_SDK_VERSION,
    WORKER_NODE_VERSION,
    buildSwebenchWorker,
    extractWorkerNode,
    readWorkerManifest,
} from "../../src/worker-builder.js";

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-worker-builder-"));
    await writeFile(join(root, "entry.ts"), 'import { value } from "./dep.js"; console.log(value);\n', "utf8");
    await writeFile(join(root, "dep.ts"), "export const value = 1;\n", "utf8");
    await writeFile(join(root, "prompt.txt"), "prompt-v1\n", "utf8");
    await writeFile(join(root, "root.lock"), "lock-v1\n", "utf8");
    await writeFile(join(root, "bench.lock"), "bench-v1\n", "utf8");
    await writeFile(join(root, "node"), "node-runtime-v1\n", { encoding: "utf8", mode: 0o755 });
    return root;
}

test("WorkerBuilder caches identical inputs and records reproducible identity", async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const options = {
        projectRoot: root,
        entryPoint: "entry.ts",
        cacheDirectory: join(root, "cache"),
        lockFiles: ["root.lock", "bench.lock"],
        promptAssets: ["prompt.txt"],
        nodeRuntimePath: join(root, "node"),
        nodeImageId: `sha256:${"a".repeat(64)}`,
    } as const;
    const first = await buildSwebenchWorker(options);
    const second = await buildSwebenchWorker(options);
    assert.equal(first.digest, second.digest);
    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.equal(first.manifest.nodeVersion, WORKER_NODE_VERSION);
    assert.equal(first.manifest.acpSdkVersion, WORKER_ACP_SDK_VERSION);
    assert.equal(first.manifest.nodeImageId, `sha256:${"a".repeat(64)}`);
    assert.ok(first.nodePath);
    assert.equal(await readFile(first.workerPath, "utf8").then((text) => text.includes("value")), true);
    assert.equal(await readFile(first.workerPath, "utf8").then((text) => text.includes("prompt-v1")), true);
    assert.deepEqual(await readWorkerManifest(first.directory), first.manifest);
});

test("source, lock and Prompt asset changes all invalidate the cache digest", async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const options = {
        projectRoot: root,
        entryPoint: "entry.ts",
        cacheDirectory: join(root, "cache"),
        lockFiles: ["root.lock", "bench.lock"],
        promptAssets: ["prompt.txt"],
        nodeRuntimePath: join(root, "node"),
        nodeImageId: `sha256:${"a".repeat(64)}`,
    } as const;
    const first = await buildSwebenchWorker(options);
    await writeFile(join(root, "dep.ts"), "export const value = 2;\n", "utf8");
    const sourceChanged = await buildSwebenchWorker(options);
    assert.notEqual(sourceChanged.digest, first.digest);
    await writeFile(join(root, "root.lock"), "lock-v2\n", "utf8");
    const lockChanged = await buildSwebenchWorker(options);
    assert.notEqual(lockChanged.digest, sourceChanged.digest);
    await writeFile(join(root, "prompt.txt"), "prompt-v2\n", "utf8");
    const promptChanged = await buildSwebenchWorker(options);
    assert.notEqual(promptChanged.digest, lockChanged.digest);
});

test("concurrent cache misses publish one complete Worker directory", async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const options = {
        projectRoot: root,
        entryPoint: "entry.ts",
        cacheDirectory: join(root, "cache"),
        lockFiles: ["root.lock", "bench.lock"],
        nodeRuntimePath: join(root, "node"),
        nodeImageId: `sha256:${"a".repeat(64)}`,
    } as const;
    const [first, second] = await Promise.all([
        buildSwebenchWorker(options),
        buildSwebenchWorker(options),
    ]);
    assert.equal(first.digest, second.digest);
    assert.equal(await readWorkerManifest(first.directory).then((manifest) => manifest?.workerSha256), first.manifest.workerSha256);
    assert.equal(await readFile(first.manifestPath, "utf8").then((text) => text.endsWith("\n")), true);
});

test("Node content and image identity invalidate the Worker cache", async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const options = {
        projectRoot: root,
        entryPoint: "entry.ts",
        cacheDirectory: join(root, "cache"),
        lockFiles: ["root.lock", "bench.lock"],
        nodeRuntimePath: join(root, "node"),
        nodeImageId: `sha256:${"a".repeat(64)}`,
    } as const;
    const first = await buildSwebenchWorker(options);
    await writeFile(join(root, "node"), "node-runtime-v2\n", { encoding: "utf8", mode: 0o755 });
    const nodeChanged = await buildSwebenchWorker(options);
    assert.notEqual(nodeChanged.digest, first.digest);
    const imageChanged = await buildSwebenchWorker({ ...options, nodeImageId: `sha256:${"b".repeat(64)}` });
    assert.notEqual(imageChanged.digest, nodeChanged.digest);
});

test("manifest tampering is treated as a cache miss and rebuilt atomically", async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const options = {
        projectRoot: root,
        entryPoint: "entry.ts",
        cacheDirectory: join(root, "cache"),
        lockFiles: ["root.lock", "bench.lock"],
        nodeRuntimePath: join(root, "node"),
        nodeImageId: `sha256:${"a".repeat(64)}`,
    } as const;
    const first = await buildSwebenchWorker(options);
    await writeFile(first.manifestPath, JSON.stringify({ ...first.manifest, nodeImageId: `sha256:${"c".repeat(64)}` }) + "\n", "utf8");
    const rebuilt = await buildSwebenchWorker(options);
    assert.equal(rebuilt.cacheHit, false);
    assert.equal((await readWorkerManifest(rebuilt.directory))?.nodeImageId, options.nodeImageId);
});

test("extractWorkerNode pins the platform and publishes a complete runtime cache", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-node-extractor-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const imageId = `sha256:${"d".repeat(64)}`;
    const commands: string[][] = [];
    const runtime = await extractWorkerNode({
        cacheDirectory: root,
        run: async (_command, args) => {
            commands.push([...args]);
            if (args[0] === "pull") return { code: 0, stdout: "", stderr: "" };
            if (args[0] === "image" && args[1] === "inspect") return { code: 0, stdout: `${imageId}\tlinux\tamd64\n`, stderr: "" };
            if (args[0] === "create") return { code: 0, stdout: "container-id\n", stderr: "" };
            if (args[0] === "cp") {
                await writeFile(args[2]!, "node-runtime\n", { encoding: "utf8", mode: 0o755 });
                return { code: 0, stdout: "", stderr: "" };
            }
            return { code: 0, stdout: "", stderr: "" };
        },
    });
    assert.equal(runtime.imageId, imageId);
    assert.equal(await readFile(runtime.path, "utf8"), "node-runtime\n");
    assert.deepEqual(commands[0]?.slice(0, 3), ["pull", "--platform", "linux/amd64"]);
    assert.ok(commands.some((args) => args[0] === "rm" && args[2] === "container-id"));
});
