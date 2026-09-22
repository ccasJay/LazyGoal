import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { buildBenchmarkWorker } from "../../src/worker-builder.js";
import { resolveBenchmarkHomePaths } from "../../src/default-paths.js";
import {
    loadAlfworldEnvironmentFile,
    resolveAlfworldContainerEnvironment,
} from "./environment-config.js";
import { loadManifest } from "./manifest.js";
import { runAlfworldSupervisor } from "./supervisor.js";
import { ALFWORLD_ACP_WORKER_ENTRYPOINT, ALFWORLD_ACP_WORKER_PROMPT_ASSETS } from "./worker-config.js";

/**
 * 使用真实 Docker 验证 ALFWorld Worker、Python sidecar 和 ACP 双通道。
 *
 * @remarks
 * 该入口是显式 smoke，不进入默认回归；它需要 `.env.alfworld` 或
 * `ALFWORLD_DATA` 和 Docker，不读取宿主 `ALFWORLD_PYTHON`，模型 Adapter 是立即
 * 完成的确定性替身。
 *
 * @example
 * ```bash
 * npm --prefix benchmarks run alfworld:worker-smoke
 * ```
 */
export async function runAlfworldWorkerSmoke(): Promise<void> {
    const projectRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
    const benchmarkPaths = await resolveBenchmarkHomePaths(projectRoot, "alfworld");
    const fileEnv = await loadAlfworldEnvironmentFile(undefined, process.env);
    const environmentEnv = { ...fileEnv, ...process.env };
    const dataRoot = environmentEnv.ALFWORLD_DATA;
    if (dataRoot === undefined || dataRoot.trim() === "") throw new Error("ALFWORLD_DATA is required for ALFWorld container smoke");
    const environment = resolveAlfworldContainerEnvironment({ env: environmentEnv, cwd: projectRoot });
    const manifest = await loadManifest(join(projectRoot, "benchmarks/alfworld/manifests/smoke.json"), dataRoot);
    const task = manifest.tasks[0];
    if (task === undefined) throw new Error("ALFWorld smoke manifest is empty");
    const artifact = await buildBenchmarkWorker({
        projectRoot,
        entryPoint: ALFWORLD_ACP_WORKER_ENTRYPOINT,
        cacheDirectory: join(benchmarkPaths.cacheDirectory, "worker"),
        promptAssets: ALFWORLD_ACP_WORKER_PROMPT_ASSETS,
    });
    const outputDirectory = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-worker-smoke-"));
    try {
        let calls = 0;
        const adapter: LLMAdapter = {
            structuredOutputMode: "strict",
            generate: async (request) => {
                calls += 1;
                if (calls === 1) {
                    return { content: JSON.stringify({ result: {
                        kind: "task_proposal",
                        task: {
                            objective: `Complete ALFWorld task ${task.taskId}`,
                            completionCriteria: [{
                                text: "The environment reports won=true",
                                acceptance: null,
                            }],
                        },
                        approvalRequest: "Approve the ALFWorld smoke task.",
                        memoryPatch: null,
                    } }) };
                }
                if (calls === 2) {
                    return { content: JSON.stringify({ result: {
                        kind: "tool_call",
                        action: { actionId: "container-smoke-reset", toolId: "alfworld_reset", input: {} },
                        memoryPatch: null,
                    } }) };
                }
                const context = request.messages.at(-1)?.content;
                if (typeof context !== "string") throw new Error("ALFWorld smoke expected serialized execution context");
                const parsed = JSON.parse(context) as { trajectoryContext?: { hot?: readonly { events?: readonly { eventType?: string; sequence?: number }[] }[] } };
                const sequence = parsed.trajectoryContext?.hot?.flatMap((unit) => unit.events ?? [])
                    .filter((event) => event.eventType === "observation_recorded").at(-1)?.sequence;
                if (typeof sequence !== "number") throw new Error("ALFWorld smoke did not receive the reset observation");
                return { content: JSON.stringify({ result: {
                    kind: "complete",
                    summary: "container smoke",
                    completionEvidence: [{ criterionIndex: 0, evidenceSequences: [sequence] }],
                    memoryPatch: null,
                } }) };
            },
        };
        const result = await runAlfworldSupervisor({
            task,
            environment,
            workerArtifact: artifact,
            llmAdapter: adapter,
            outputDirectory,
            // 托管镜像首次构建包含 Python 依赖编译；冷缓存也需保留有限的较长超时。
            taskTimeoutMs: 900_000,
        });
        if (result.errors.length > 0) throw new Error(result.errors.map((error) => `${error.stage}: ${error.message}`).join("; "));
        if (calls !== 3) throw new Error(`ALFWorld smoke expected proposal, reset and completion calls, got ${calls}`);
        process.stdout.write(JSON.stringify({ status: "passed", taskId: task.taskId, modelCalls: calls, won: result.environment.won }) + "\n");
    } finally {
        await rm(outputDirectory, { recursive: true, force: true });
    }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("worker-smoke.ts")) {
    void runAlfworldWorkerSmoke().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
