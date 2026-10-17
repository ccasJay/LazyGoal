import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { test } from "node:test";

import type { LLMAdapter } from "../../packages/llm/src/core/adapter.js";
import { toolResponseFixture } from "../../packages/agent/test/tool-response-fixture.js";
import {
    WORKER_NODE_IMAGE,
    buildBenchmarkWorker,
    type WorkerArtifact,
} from "../src/worker-builder.js";
import { MultiplexedConnection, createAcpMuxStream } from "../src/multiplex.js";
import { createLlmRpcServer } from "../src/llm-rpc.js";
import { CONTEXT_PROMPT_ASSETS } from "../context/src/worker-entry.js";
import { parseScenario } from "../context/src/scenario.js";
import { runContextSession } from "../context/src/session-client.js";
import { ALFWORLD_ACP_WORKER_ENTRYPOINT, ALFWORLD_ACP_WORKER_PROMPT_ASSETS } from "../alfworld/src/worker-config.js";
import { SWE_ACP_WORKER_ENTRYPOINT, SWE_ACP_WORKER_PROMPT_ASSETS } from "../swebench/src/worker-config.js";
import { GAIA_ACP_WORKER_PROMPT_ASSETS } from "../gaia/src/worker-entry.js";
import { TUA_BENCH_ACP_WORKER_PROMPT_ASSETS } from "../tua-bench/src/worker-entry.js";

const projectRoot = resolve(import.meta.dirname, "../..");

const WORKER_ENTRIES = [
    { name: "context", entryPoint: "benchmarks/context/src/worker-entry.ts", assets: CONTEXT_PROMPT_ASSETS },
    { name: "alfworld", entryPoint: ALFWORLD_ACP_WORKER_ENTRYPOINT, assets: ALFWORLD_ACP_WORKER_PROMPT_ASSETS },
    { name: "swebench", entryPoint: SWE_ACP_WORKER_ENTRYPOINT, assets: SWE_ACP_WORKER_PROMPT_ASSETS },
    { name: "gaia", entryPoint: "benchmarks/gaia/src/worker-entry.ts", assets: GAIA_ACP_WORKER_PROMPT_ASSETS },
    { name: "tua-bench", entryPoint: "benchmarks/tua-bench/src/worker-entry.ts", assets: TUA_BENCH_ACP_WORKER_PROMPT_ASSETS },
] as const;

function buildWorker(
    entryPoint: string,
    promptAssets: readonly string[],
    cacheDirectory: string,
): Promise<WorkerArtifact> {
    return buildBenchmarkWorker({
        projectRoot,
        entryPoint,
        cacheDirectory,
        promptAssets: [...promptAssets],
        nodeRuntimePath: process.execPath,
        nodeImageId: `sha256:${"0".repeat(64)}`,
    });
}

/** 模板正文以 JSON 字符串内嵌；非换行前缀保持字面量，可稳定断言。 */
function distinctiveLine(body: string): string {
    const lines = body
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .sort((left, right) => right.length - left.length);
    const line = lines[0];
    assert.ok(line !== undefined && line.length >= 8, "template body must contain a distinctive line");
    return JSON.stringify(line).slice(1, -1);
}

test("各现有 Worker 入口实际打包并内嵌当前模板真源", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-components-workers-"));
    try {
        for (const worker of WORKER_ENTRIES) {
            const first = await buildWorker(worker.entryPoint, worker.assets, join(directory, "cache"));
            const expectedAssets = worker.assets
                .map((asset) => asset)
                .sort();
            assert.deepEqual(first.manifest.promptAssets, expectedAssets, `${worker.name} must record its prompt assets`);
            assert.match(first.manifest.promptDigest, /^[0-9a-f]{64}$/);
            assert.match(first.manifest.sourceDigest, /^[0-9a-f]{64}$/);

            const workerText = await readFile(first.workerPath, "utf8");
            for (const asset of expectedAssets) {
                const body = await readFile(join(projectRoot, asset), "utf8");
                assert.ok(
                    workerText.includes(distinctiveLine(body)),
                    `${worker.name} must embed the current body of ${asset}`,
                );
            }

            const second = await buildWorker(worker.entryPoint, worker.assets, join(directory, "cache"));
            assert.equal(second.digest, first.digest, `${worker.name} must rebuild to the same identity`);
            assert.equal(second.cacheHit, true);
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("共享 Worker 产物脱离源码模板目录完成一次确定性会话", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-components-worker-run-"));
    const artifact = await buildWorker(
        "benchmarks/context/src/worker-entry.ts",
        CONTEXT_PROMPT_ASSETS,
        join(directory, "cache"),
    );
    const workspace = join(directory, "workspace");
    const stateRoot = join(directory, "state");
    // 产物以本机 Node 直接运行：bundle 与内嵌资产来自 artifact，运行不依赖源码模板目录。
    const child = spawn(process.execPath, [artifact.workerPath], {
        cwd: directory,
        env: { ...process.env, LAZYGOAL_CONTEXT_STATE_ROOT: stateRoot },
        stdio: ["pipe", "pipe", "pipe"],
    });
    const stderr: string[] = [];
    child.stderr.on("data", (chunk: Buffer) => { stderr.push(chunk.toString("utf8")); });
    const mux = new MultiplexedConnection({
        input: Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
        output: Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
    });
    const requests: string[] = [];
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        generate: async (request) => {
            requests.push(JSON.stringify(request.messages));
            if (request.tools?.[0]?.id === "system_review_completion") {
                return toolResponseFixture(JSON.stringify({ result: { kind: "accept" } }));
            }
            const messages = JSON.stringify(request.messages);
            if (messages.includes("Say hello")) {
                return toolResponseFixture(JSON.stringify({
                    result: { kind: "complete", summary: "Hello.", evidenceSequences: [], memoryPatch: null, contextNotes: null },
                }));
            }
            return toolResponseFixture(JSON.stringify({
                result: { kind: "wait", reason: "Await user input", memoryPatch: null, contextNotes: null },
            }));
        },
    };
    const rpc = createLlmRpcServer({ stream: mux.channel("llm"), adapter });
    const scenario = parseScenario({
        id: "worker-artifact-run",
        image: WORKER_NODE_IMAGE,
        initialFiles: {},
        checkpointAfter: 0,
        profile: { id: "worker-artifact-profile", systemPrompt: "Follow the request.", instructions: [], toolIds: ["context_shell"] },
        budget: { maxSteps: 8, maxCalls: 20, stageTimeoutMs: 30_000, totalTimeoutMs: 60_000 },
        stages: [
            { operation: "launch", prompt: "Wait for input.", expect: "waiting", waitingFor: "blocked" },
            { operation: "resume", prompt: "Say hello.", expect: "completed" },
        ],
        verifier: "true",
        rubric: { text: "A greeting", threshold: 0.5 },
        limitations: "Local artifact run with a deterministic model substitute.",
    });

    try {
        let records;
        try {
            records = await runContextSession(
                createAcpMuxStream(mux),
                scenario,
                "prompt_only",
                AbortSignal.timeout(60_000),
            );
        } catch (error) {
            const records = (error as { readonly records?: unknown }).records;
            throw new Error(`${error instanceof Error ? error.message : String(error)}\nRecords: ${JSON.stringify(records)}\nWorker stderr:\n${stderr.join("")}`);
        }
        assert.equal(records[0]?.boundary.status, "waiting", stderr.join("\n"));
        assert.equal(records[1]?.boundary.status, "completed", stderr.join("\n"));
        assert.ok(requests.length >= 1, "产物必须真实发起模型请求");
        assert.ok(requests.some((request) => request.includes("Active Decide Instructions")), "请求必须使用内嵌模板渲染的固定指令");
        assert.ok(requests.some((request) => request.includes("working_context") || request.includes("execution")), "请求必须到达执行阶段");

        // 产物未从题目目录读取模板：工作区与状态根内不存在 `.njk` 资产。
        for (const root of [directory, workspace, stateRoot]) {
            const files = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
            assert.equal(files.some((entry) => entry.isFile() && entry.name.endsWith(".njk")), false, `${root} 不得包含模板资产`);
        }
        const stateFiles = await readdir(stateRoot, { recursive: true, withFileTypes: true });
        assert.ok(stateFiles.length > 0, "会话必须把状态写入注入的状态根");
    } finally {
        await rpc.close().catch(() => undefined);
        child.kill("SIGKILL");
        await mux.close().catch(() => undefined);
        await rm(directory, { recursive: true, force: true });
    }
});
