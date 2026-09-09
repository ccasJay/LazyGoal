import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { buildSwebenchWorker } from "./worker-builder.js";
import { parseSwebenchTasks, SwebenchContainer } from "./container.js";
import { BRIDGE_PATH } from "./evaluation.js";
import { loadSwebenchManifest } from "./manifest.js";
import { requireSuccess, runInteractiveProcess, runProcess } from "./process.js";
import { runSwebenchSupervisor } from "./supervisor.js";
import { SWE_ACP_WORKER_ENTRYPOINT, SWE_ACP_WORKER_PROMPT_ASSETS } from "./worker-config.js";

/**
 * 使用真实 Docker 和固定单题 Manifest 验证 Worker 的完整跨进程边界。
 *
 * @remarks
 * 该入口故意不进入默认回归：它需要 Docker、SWE-bench Python 环境和官方题目镜像，
 * 但模型 Adapter 是宿主内的确定性替身，不会产生供应商请求。脚本会检查 Node/动态库/
 * Conda 预检、ACP/LLM 双通道、五个容器 Tool、宿主模型响应和最终 patch。
 *
 * @example
 * ```bash
 * npm run swebench:worker-smoke --prefix benchmarks
 * ```
 */
export async function runSwebenchWorkerSmoke(): Promise<void> {
    const projectRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
    const python = process.env.SWEBENCH_PYTHON ?? "python3";
    const manifest = await loadSwebenchManifest(join(projectRoot, "benchmarks/swebench/manifests/single.json"));
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-swebench-worker-smoke-"));
    const preparedManifest = join(workspace, "manifest.json");
    const preparedOutput = join(workspace, "prepared");
    const artifactOutput = join(workspace, "artifacts");
    await Promise.all([
        mkdir(preparedOutput, { recursive: true }),
        mkdir(artifactOutput, { recursive: true }),
        writeFile(preparedManifest, JSON.stringify(manifest) + "\n"),
    ]);
    try {
        const prepared = JSON.parse(requireSuccess(await runProcess(python, [BRIDGE_PATH, "prepare", preparedManifest, preparedOutput], {
            timeoutMs: 300_000,
            maxBytes: 16 * 1024 * 1024,
            truncate: true,
        }), "Prepare SWE-bench smoke task"));
        const task = parseSwebenchTasks(prepared)[0];
        if (task === undefined) throw new Error("SWE-bench smoke manifest produced no task");
        const artifact = await buildSwebenchWorker({
            projectRoot,
            entryPoint: SWE_ACP_WORKER_ENTRYPOINT,
            cacheDirectory: join(projectRoot, ".lazygoal/benchmarks/swebench-worker-cache"),
            promptAssets: SWE_ACP_WORKER_PROMPT_ASSETS,
        });
        let modelCalls = 0;
        let updateCount = 0;
        const llmAdapter: LLMAdapter = {
            structuredOutputMode: "strict",
            generate: async (request) => {
                modelCalls += 1;
                if (modelCalls === 1) {
                    return { content: JSON.stringify({ result: {
                        kind: "tool_call",
                        action: { actionId: "worker-smoke-write", toolId: "write_file", input: { path: "lazygoal-worker-smoke.txt", content: "worker smoke\n" } },
                        memoryPatch: null,
                    } }) };
                }
                const context = request.messages.at(-1)?.content;
                if (typeof context !== "string") throw new TypeError("Worker smoke expected serialized execution context");
                const parsed = JSON.parse(context) as { trajectoryContext?: { hot?: readonly { events?: readonly { eventType?: string; sequence?: number }[] }[] } };
                const sequence = parsed.trajectoryContext?.hot?.flatMap((unit) => unit.events ?? [])
                    .filter((event) => event.eventType === "observation_recorded").at(-1)?.sequence;
                if (typeof sequence !== "number") throw new Error("Worker smoke did not receive the write observation");
                return { content: JSON.stringify({ result: {
                    kind: "complete", summary: "Worker smoke completed", completionEvidence: [{ criterionIndex: 0, evidenceSequences: [sequence] }], memoryPatch: null,
                } }) };
            },
        };
        const metadata = {
            instanceId: task.instance_id,
            repo: task.repo,
            baseCommit: task.base_commit,
            problemStatement: task.problem_statement,
            goalId: `smoke-goal-${randomUUID()}`,
            runId: `smoke-run-${randomUUID()}`,
            maxSteps: manifest.maxSteps,
            structuredOutputMode: llmAdapter.structuredOutputMode,
        } as const;
        const result = await runSwebenchSupervisor({
            task,
            container: new SwebenchContainer(`lazygoal-worker-smoke-${randomUUID()}`, task),
            artifact,
            manifest: artifact.manifest,
            metadata,
            llmAdapter,
            outputDirectory: artifactOutput,
            taskTimeoutMs: manifest.taskTimeoutSeconds * 1000,
            openWorkerProcess: async (command, args, options) => {
                const worker = await runInteractiveProcess(command, args, options);
                const [diagnostic, control] = worker.errorOutput.tee();
                void drainDiagnostic(diagnostic);
                return { ...worker, errorOutput: control };
            },
            onUpdate: () => { updateCount += 1; },
        });
        if (result.errors.length > 0) throw new Error(`Worker smoke failed: ${result.errors.map((error) => `${error.stage}: ${error.message}`).join("; ")}`);
        if (result.stopReason !== "end_turn" || result.patch === null || !result.patch.includes("lazygoal-worker-smoke.txt")) {
            throw new Error(`Worker smoke produced an unexpected result: ${result.stopReason}`);
        }
        if (modelCalls !== 2 || updateCount < 2) throw new Error(`Worker smoke did not exercise both channels: modelCalls=${modelCalls}, updates=${updateCount}`);
        const patchPath = join(artifactOutput, `${task.instance_id}.patch`);
        if (!(await readFile(patchPath, "utf8")).includes("lazygoal-worker-smoke.txt")) throw new Error("Worker smoke patch was not persisted");
        process.stdout.write(JSON.stringify({ status: "passed", instanceId: task.instance_id, modelCalls, updateCount, workerSha256: artifact.manifest.workerSha256 }) + "\n");
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

async function drainDiagnostic(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            chunks.push(next.value);
        }
    } finally {
        reader.releaseLock();
    }
    if (chunks.length > 0) process.stderr.write(new TextDecoder().decode(concat(chunks)));
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
    const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return output;
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("worker-smoke.ts")) {
    void runSwebenchWorkerSmoke().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
