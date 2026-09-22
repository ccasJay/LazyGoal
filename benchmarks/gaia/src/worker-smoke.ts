import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { buildBenchmarkWorker } from "../../src/worker-builder.js";
import { resolveBenchmarkHomePaths } from "../../src/default-paths.js";
import { loadGaiaManifest } from "./manifest.js";
import { runGaiaSupervisor } from "./supervisor.js";
import { GAIA_ACP_WORKER_PROMPT_ASSETS } from "./worker-entry.js";

/**
 * 使用真实 Docker 验证 GAIA Worker、环境适配、预检、ACP 双通道与答案回收。
 *
 * @remarks
 * 该入口是显式 smoke，不进入默认回归；它需要 Docker，模型 Adapter 是确定性替身，
 * 直接调用 `submit_answer` 提交目标答案。
 *
 * @example
 * ```bash
 * npm --prefix benchmarks run gaia:worker-smoke
 * ```
 */
export async function runGaiaWorkerSmoke(): Promise<void> {
    const projectRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
    const benchmarkPaths = await resolveBenchmarkHomePaths(projectRoot, "gaia");
    const manifestPath = join(projectRoot, "benchmarks/gaia/manifests/smoke.json");
    const manifest = await loadGaiaManifest(manifestPath);
    const task = manifest.tasks[0];
    if (task === undefined) {
        throw new Error("GAIA smoke manifest is empty");
    }

    const artifact = await buildBenchmarkWorker({
        projectRoot,
        entryPoint: join(projectRoot, "benchmarks/gaia/src/worker-entry.ts"),
        cacheDirectory: join(benchmarkPaths.cacheDirectory, "worker"),
        promptAssets: GAIA_ACP_WORKER_PROMPT_ASSETS,
    });

    const outputDirectory = await mkdtemp(join(tmpdir(), "lazygoal-gaia-worker-smoke-"));

    try {
        let calls = 0;
        const adapter: LLMAdapter = {
            structuredOutputMode: "strict",
            generate: async (request) => {
                calls += 1;
                if (calls === 1) {
                    return {
                        content: JSON.stringify({
                            result: {
                                kind: "task_proposal",
                                task: {
                                    objective: `Submit the answer for GAIA task ${task.taskId}`,
                                    completionCriteria: [{
                                        text: "The answer is submitted using submit_answer",
                                        acceptance: null,
                                    }],
                                },
                                approvalRequest: "Approve the GAIA smoke task.",
                                memoryPatch: null,
                            },
                        }),
                    };
                }
                if (calls === 2) {
                    return {
                        content: JSON.stringify({
                            result: {
                                kind: "tool_call",
                                action: {
                                    actionId: "container-smoke-submit",
                                    toolId: "submit_answer",
                                    input: { answer: "2" },
                                },
                                memoryPatch: null,
                            },
                        }),
                    };
                }
                const context = request.messages.at(-1)?.content;
                if (typeof context !== "string") {
                    throw new Error("GAIA smoke expected serialized execution context");
                }
                const parsed = JSON.parse(context) as {
                    trajectoryContext?: {
                        hot?: readonly { events?: readonly { eventType?: string; sequence?: number }[] }[];
                    };
                };
                const sequence = parsed.trajectoryContext?.hot?.flatMap((unit) => unit.events ?? [])
                    .filter((event) => event.eventType === "observation_recorded").at(-1)?.sequence;
                if (typeof sequence !== "number") {
                    throw new Error("GAIA smoke did not receive submit_answer observation");
                }
                return {
                    content: JSON.stringify({
                        result: {
                            kind: "complete",
                            summary: "Submitted answer 2",
                            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [sequence] }],
                            memoryPatch: null,
                        },
                    }),
                };
            },
        };

        const result = await runGaiaSupervisor({
            task,
            dataRoot: manifest.dataRoot,
            workerArtifact: artifact,
            llmAdapter: adapter,
            outputDirectory,
            baseImage: "lazygoal-gaia:latest",
            taskTimeoutMs: 900_000,
        });

        if (result.errors.length > 0) {
            throw new Error(result.errors.map((e) => `${e.stage}: ${e.message}`).join("; "));
        }

        if (result.domainResult.correct !== true) {
            throw new Error(`GAIA smoke expected correct answer '2', got '${result.domainResult.submittedAnswer}'`);
        }
        if (calls !== 3) {
            throw new Error(`GAIA smoke expected task proposal, submit action and completion, got ${calls} model calls`);
        }

        process.stdout.write(
            JSON.stringify({
                status: "passed",
                taskId: task.taskId,
                submittedAnswer: result.domainResult.submittedAnswer,
                correct: result.domainResult.correct,
            }) + "\n",
        );
    } finally {
        await rm(outputDirectory, { recursive: true, force: true });
    }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("worker-smoke.ts")) {
    void runGaiaWorkerSmoke().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
