import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { buildBenchmarkWorker } from "../../src/worker-builder.js";
import { resolveBenchmarkHomePaths } from "../../src/default-paths.js";
import { IsolatedEnvironment } from "../../src/isolated-environment.js";
import { loadTuaBenchManifest } from "./manifest-loader.js";
import { TuaBenchEnvironmentSpec } from "./environment-spec.js";
import { TUA_BENCH_ACP_WORKER_PROMPT_ASSETS } from "./worker-entry.js";

/**
 * 在真实 Docker 沙箱内执行 TUA-Bench 端到端容器冒烟评测。
 *
 * @remarks
 * 该入口通过真实 Docker 容器验证 Worker 编译打包、容器注入、setup 脚本、preflight 预检、
 * ACP 双通道交互、bash_exec 工具执行以及 tests/test.sh 官方评分与产物回收完整生命周期。
 *
 * @example
 * ```bash
 * npx tsx benchmarks/tua-bench/src/worker-smoke.ts
 * ```
 */
export async function runTuaBenchWorkerSmoke(): Promise<void> {
    const projectRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
    const benchmarkPaths = await resolveBenchmarkHomePaths(projectRoot, "tua-bench");
    const smokeRepoDir = join(projectRoot, "benchmarks/tua-bench/manifests/smoke-repo");

    process.stdout.write("1. 正在解析 TUA-Bench 烟雾任务清单...\n");
    const manifest = await loadTuaBenchManifest(smokeRepoDir);
    const task = manifest.tasks[0];
    if (task === undefined) {
        throw new Error("TUA-Bench 烟雾任务加载失败：未找到有效任务");
    }
    process.stdout.write(`   已加载任务：${task.taskId} [${task.taskFamily}] (镜像: ${task.imageRef})\n`);

    process.stdout.write("2. 正在构建容器内执行的 ACP Worker 产物（含内嵌 Prompt 模板与 Node 运行时）...\n");
    const artifact = await buildBenchmarkWorker({
        projectRoot,
        entryPoint: join(projectRoot, "benchmarks/tua-bench/src/worker-entry.ts"),
        cacheDirectory: join(benchmarkPaths.cacheDirectory, "worker"),
        promptAssets: TUA_BENCH_ACP_WORKER_PROMPT_ASSETS,
    });
    process.stdout.write(`   Worker 构建完成！Worker SHA-256: ${artifact.manifest.workerSha256.slice(0, 16)}...\n`);

    const outputDirectory = await mkdtemp(join(tmpdir(), "lazygoal-tua-smoke-output-"));

    try {
        process.stdout.write("3. 准备模型决策流与沙箱环境...\n");
        process.env.DEBUG_BENCHMARK_WORKER = "1";
        let stepCount = 0;
        const adapter: LLMAdapter = {
            structuredOutputMode: "strict",
            generate: async (request) => {
                stepCount += 1;
                process.stdout.write(`   [LLM Adapter] 收到第 ${stepCount} 次模型调用请求...\n`);
                if (stepCount === 1) {
                    process.stdout.write("   [Agent Step 1] 提交任务执行方案建议 (task_proposal)...\n");
                    return {
                        content: JSON.stringify({
                            result: {
                                kind: "task_proposal",
                                task: {
                                    objective: `解决终端任务：${task.name}`,
                                    completionCriteria: [{
                                        text: "成功修正 report.txt 并确认通过",
                                        acceptance: null,
                                    }],
                                },
                                approvalRequest: "请批准执行该 TUA-Bench 任务",
                                memoryPatch: null,
                            },
                        }),
                    };
                }
                if (stepCount === 2) {
                    process.stdout.write("   [Agent Step 2] 决定调用 bash_exec 修复 /home/agent/report.txt...\n");
                    return {
                        content: JSON.stringify({
                            result: {
                                kind: "tool_call",
                                action: {
                                    actionId: "act-fix-report",
                                    toolId: "bash_exec",
                                    input: {
                                        command: "sed -i 's/INCORRECT/CORRECT/' /home/agent/report.txt",
                                        timeoutMs: null,
                                        workdir: null,
                                    },
                                },
                                memoryPatch: null,
                            },
                        }),
                    };
                }
                process.stdout.write("   [Agent Step 3] 检查完成，宣告任务目标达成 (complete)...\n");
                let observationSeq: number | undefined;
                try {
                    const lastMsg = request.messages.at(-1)?.content;
                    if (typeof lastMsg === "string") {
                        const parsed = JSON.parse(lastMsg) as {
                            trajectoryContext?: {
                                hot?: readonly {
                                    events?: readonly { eventType?: string; sequence?: number }[];
                                }[];
                            };
                        };
                        observationSeq = parsed.trajectoryContext?.hot
                            ?.flatMap((unit) => unit.events ?? [])
                            .filter((event) => event.eventType === "observation_recorded")
                            .at(-1)?.sequence;
                    }
                } catch {
                    // ignore context parsing error for sequence fallback
                }

                return {
                    content: JSON.stringify({
                        result: {
                            kind: "complete",
                            summary: "Successfully updated report.txt to Status: CORRECT",
                            completionEvidence: [{
                                criterionIndex: 0,
                                evidenceSequences: typeof observationSeq === "number" ? [observationSeq] : [],
                            }],
                            memoryPatch: null,
                        },
                    }),
                };
            },
        };

        const spec = new TuaBenchEnvironmentSpec({
            task,
            workerArtifact: artifact,
        });

        const environment = new IsolatedEnvironment();

        process.stdout.write(`4. 启动 Docker 沙箱容器 (${task.imageRef}) 并接入 ACP 执行通道...\n`);
        const result = await environment.run({
            task,
            spec,
            outputDirectory,
            workerArtifact: artifact,
            taskTimeoutMs: 180_000,
            acp: {
                llmAdapter: adapter,
                prompt: [{ type: "text", text: task.instruction }],
                sessionMeta: {
                    ...task,
                    goalId: "smoke-goal-001",
                    runId: "smoke-run-001",
                    structuredOutputMode: "strict",
                },
                onUpdate: (update) => {
                    process.stdout.write(`   [ACP Update] ${JSON.stringify(update)}\n`);
                },
            },
        });

        process.stdout.write("5. 沙箱执行结束，验证产物回收与评分结果...\n");
        if (result.errors.length > 0) {
            throw new Error(`执行出现阶段错误: ${result.errors.map((e) => `${e.stage}: ${e.message}`).join("; ")}`);
        }

        const artifacts = result.artifact;
        if (!artifacts) {
            throw new Error("未回收任何评测产物");
        }

        process.stdout.write(`   验证脚本退出码: ${artifacts.verifierExitCode}\n`);
        process.stdout.write(`   原始评分 (reward): ${artifacts.reward}\n`);
        process.stdout.write(`   通过状态 (passed): ${artifacts.domainResult.passed}\n`);
        process.stdout.write(`   验证脚本输出: ${artifacts.verifierStdout.trim()}\n`);

        if (artifacts.domainResult.passed !== true) {
            throw new Error(`评测未通过：预期 passed 为 true，实际为 ${artifacts.domainResult.passed} (错误: ${artifacts.domainResult.verifierError})`);
        }

        process.stdout.write("\n=========================================\n");
        process.stdout.write("✅ TUA-Bench 官方基准沙箱冒烟测试成功！\n");
        process.stdout.write("=========================================\n");
        process.stdout.write(JSON.stringify({
            status: "success",
            taskId: task.taskId,
            taskFamily: task.taskFamily,
            reward: artifacts.reward,
            passed: artifacts.domainResult.passed,
            outputDirectory,
        }, null, 2) + "\n");
    } finally {
        await rm(outputDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("worker-smoke.ts")) {
    runTuaBenchWorkerSmoke().catch((error: unknown) => {
        process.stderr.write(`\n❌ 测试失败: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
