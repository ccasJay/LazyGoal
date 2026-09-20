import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { runPromptEvaluationCli } from "../../src/prompt-evaluation/cli.js";
import type { PromptEvaluationEventV1 } from "../../src/prompt-evaluation/protocol.js";
import { readPromptEvaluationResult } from "../../src/prompt-evaluation/result-recorder.js";
import {
    PromptEvaluationBenchmarkRegistry,
    type PromptEvaluationBenchmarkAdapter,
} from "../../src/prompt-evaluation/runner.js";
import { buildBenchmarkWorker } from "../../src/worker-builder.js";
import {
    loadAlfworldEnvironmentFile,
    resolveAlfworldContainerEnvironment,
} from "./environment-config.js";
import { AlfworldPromptEvaluationAdapter } from "./prompt-evaluation-adapter.js";
import { loadManifest } from "./manifest.js";
import { loadAlfworldProfile } from "./profile.js";
import {
    ALFWORLD_ACP_WORKER_ENTRYPOINT,
    ALFWORLD_ACP_WORKER_PROMPT_ASSETS,
} from "./worker-config.js";

/**
 * 通过 Prompt Evaluation CLI 跑通 ALFWorld 容器、ACP、LLM RPC、评分与产物回收。
 *
 * @remarks
 * 该入口不进入默认回归，需要 Docker、ALFWorld 数据和测试 Profile。模型使用确定性
 * 替身，只验证接线，不把任务是否获胜作为 smoke 成败条件。
 *
 * @example
 * ```bash
 * npm --prefix benchmarks run prompt-evaluation:smoke
 * ```
 */
export async function runPromptEvaluationSmoke(): Promise<void> {
    const projectRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
    const fileEnv = await loadAlfworldEnvironmentFile(undefined, process.env);
    const environmentEnv = { ...fileEnv, ...process.env };
    const environment = resolveAlfworldContainerEnvironment({ env: environmentEnv, cwd: projectRoot });
    const profile = (await loadAlfworldProfile(projectRoot)).profile;
    const manifestPath = join(projectRoot, "benchmarks/alfworld/manifests/smoke.json");
    const manifest = await loadManifest(manifestPath, environment.dataRoot);
    const smokeTask = manifest.tasks[0];
    if (smokeTask === undefined) throw new Error("Prompt Evaluation smoke Manifest is empty");
    const workerArtifact = await buildBenchmarkWorker({
        projectRoot,
        entryPoint: ALFWORLD_ACP_WORKER_ENTRYPOINT,
        cacheDirectory: join(projectRoot, ".lazygoal/benchmarks/alfworld-worker-cache"),
        promptAssets: ALFWORLD_ACP_WORKER_PROMPT_ASSETS,
    });
    const adapter = new AlfworldPromptEvaluationAdapter({
        workspaceRoot: projectRoot,
        environment,
        workerArtifact,
        sidecarScriptPath: fileURLToPath(new URL("../python/sidecar.py", import.meta.url)),
        taskTimeoutMs: 900_000,
    });
    const registry = new PromptEvaluationBenchmarkRegistry([
        adapter as unknown as PromptEvaluationBenchmarkAdapter<unknown, unknown>,
    ]);
    const temporary = await mkdtemp(join(tmpdir(), "lazygoal-prompt-evaluation-smoke-"));
    try {
        const requestPath = join(temporary, "request.json");
        const outputDirectory = join(temporary, "output");
        await writeFile(requestPath, `${JSON.stringify({
            protocol: "prompt-evaluation@1",
            benchmark: {
                id: "alfworld",
                manifestPath,
            },
            candidate: {
                id: "alfworld-prompt-smoke",
                baseProfileId: profile.id,
                systemPrompt: profile.systemPrompt,
                instructions: profile.instructions,
            },
            model: { configId: "deterministic-smoke", modelId: "deterministic-smoke" },
            outputDirectory,
        })}\n`, "utf8");

        let calls = 0;
        const llmAdapter: LLMAdapter = {
            structuredOutputMode: "strict",
            generate: async (request) => {
                calls += 1;
                if (calls === 1) {
                    return { content: JSON.stringify({ result: {
                        kind: "task_proposal",
                        task: {
                            objective: `Complete ALFWorld task ${smokeTask.taskId}`,
                            completionCriteria: [{
                                text: "The environment reports won=true",
                                acceptance: null,
                            }],
                        },
                        approvalRequest: "Approve the ALFWorld Prompt Evaluation smoke task.",
                        memoryPatch: null,
                    } }) };
                }
                if (calls === 2) {
                    return { content: JSON.stringify({ result: {
                        kind: "tool_call",
                        action: {
                            actionId: "prompt-smoke-reset",
                            toolId: "alfworld_reset",
                            input: {},
                        },
                        memoryPatch: null,
                    } }) };
                }
                const context = request.messages.at(-1)?.content;
                if (typeof context !== "string") {
                    throw new Error("Prompt Evaluation smoke expected serialized execution context");
                }
                const parsed = JSON.parse(context) as {
                    trajectoryContext?: {
                        hot?: readonly { events?: readonly { eventType?: string; sequence?: number }[] }[];
                    };
                };
                const sequence = parsed.trajectoryContext?.hot?.flatMap((unit) => unit.events ?? [])
                    .filter((event) => event.eventType === "observation_recorded").at(-1)?.sequence;
                if (typeof sequence !== "number") {
                    throw new Error("Prompt Evaluation smoke did not receive reset observation");
                }
                return { content: JSON.stringify({ result: {
                    kind: "complete",
                    summary: "prompt evaluation container smoke",
                    completionEvidence: [{ criterionIndex: 0, evidenceSequences: [sequence] }],
                    memoryPatch: null,
                } }) };
            },
        };
        const eventLines: string[] = [];
        const exitCode = await runPromptEvaluationCli(
            ["eval", "prompt", "--request", requestPath],
            {
                cwd: projectRoot,
                registry,
                llmAdapter,
                writeOutput: (line) => eventLines.push(line),
                writeError: (line) => { throw new Error(line); },
            },
        );
        if (exitCode !== 0) throw new Error(`Prompt Evaluation smoke exited with ${exitCode}`);
        const terminal = JSON.parse(eventLines.at(-1) ?? "null") as PromptEvaluationEventV1 | null;
        if (terminal?.type !== "terminal" || terminal.resultPath === undefined) {
            throw new Error("Prompt Evaluation smoke did not emit a committed terminal result");
        }
        const result = await readPromptEvaluationResult(terminal.resultPath);
        const task = result.tasks[0];
        if (task === undefined || (task.status !== "passed" && task.status !== "failed")) {
            throw new Error("Prompt Evaluation smoke did not produce a domain judgment");
        }
        if (task.errors.length > 0) {
            throw new Error(task.errors.map((error) => `${error.stage}: ${error.message}`).join("; "));
        }
        if (task.attemptPath === null || task.artifactLocator === null) {
            throw new Error("Prompt Evaluation smoke did not persist Attempt and Runtime artifacts");
        }
        await Promise.all([
            access(task.attemptPath),
            access(join(dirname(task.attemptPath), task.artifactLocator.goalSnapshot)),
            access(join(dirname(task.attemptPath), task.artifactLocator.trajectory)),
        ]);
        if (calls !== 3) {
            throw new Error(`Prompt Evaluation smoke expected proposal, reset and completion calls, got ${calls}`);
        }
        process.stdout.write(`${JSON.stringify({
            status: "passed",
            evaluationId: result.evaluationId,
            taskId: task.taskId,
            domainStatus: task.status,
            modelCalls: calls,
        })}\n`);
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("prompt-evaluation-smoke.ts")) {
    void runPromptEvaluationSmoke().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
