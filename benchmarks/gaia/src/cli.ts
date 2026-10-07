import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";

import { readLLMConfig } from "../../../packages/config/src/index.js";
import { createLlmAdapter } from "../../../packages/llm/src/factory.js";
import { buildBenchmarkWorker } from "../../src/worker-builder.js";
import { resolveBenchmarkHomePaths } from "../../src/default-paths.js";
import { loadGaiaManifest } from "./manifest.js";
import { GaiaDatasetLoader } from "./dataset-loader.js";
import { runGaiaSupervisor } from "./supervisor.js";
import { runGaiaGradeCli } from "./grading.js";
import { aggregateGaiaReport, readGaiaAttempts, writeGaiaReport } from "./report.js";
import { GAIA_ACP_WORKER_PROMPT_ASSETS } from "./worker-entry.js";
import type { GaiaSplit } from "./types.js";

/**
 * 运行 `load gaia` 子命令：从 HuggingFace Hub 下载数据并构建 Manifest。
 */
export async function runGaiaLoadCli(argv: readonly string[]): Promise<number> {
    const { values } = parseArgs({
        args: argv.slice(2),
        options: {
            target: { type: "string", short: "t" },
            split: { type: "string", short: "s" },
            "hf-token": { type: "string" },
        },
        strict: false,
    });

    const benchmarkPaths = await resolveBenchmarkHomePaths(process.cwd(), "gaia");
    const targetDir = resolve((values.target as string) ?? join(benchmarkPaths.cacheDirectory, "data"));
    const split = ((values.split as string) ?? "validation") as GaiaSplit;
    const hfToken = (values["hf-token"] as string) ?? process.env.HF_TOKEN;

    if (split !== "validation" && split !== "test") {
        process.stderr.write(`错误: 不支持的 split: ${split}。仅支持 validation 或 test\n`);
        return 1;
    }

    process.stdout.write(`开始从 HuggingFace 下载 GAIA 数据集 (split: ${split}) 到 ${targetDir}...\n`);
    const loader = new GaiaDatasetLoader({ hfToken });

    try {
        const manifest = await loader.downloadSplit(split, targetDir);
        process.stdout.write(`下载完成！共加载 ${manifest.tasks.length} 个任务。\n`);
        process.stdout.write(`清单已保存至: ${join(targetDir, `manifest-${split}.json`)}\n`);
        return 0;
    } catch (error) {
        process.stderr.write(`下载失败: ${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
    }
}

import {
    type IsolatedEnvironment,
} from "../../src/index.js";

/**
 * GAIA CLI 运行时依赖注入接口，供单元测试模拟容器与环境。
 *
 * @example
 * ```ts
 * const deps: GaiaCliDependencies = {
 *     runner: async () => ({ exitCode: 0, status: "completed", artifact: null, errors: [] }),
 * };
 * ```
 */
export interface GaiaCliDependencies {
    /** 自定义隔离环境。 */
    readonly isolatedEnvironment?: IsolatedEnvironment;
    /** 自定义隔离容器驱动。 */
    readonly container?: import("../../src/isolated-environment.js").IsolatedContainer;
    /** 自定义 LLM 适配器。 */
    readonly adapter?: import("../../../packages/agent/src/index.js").LLMAdapter;
    /** 自定义 Worker 产物。 */
    readonly workerArtifact?: import("../../src/worker-builder.js").WorkerArtifact;
}

/**
 * 运行 `eval gaia` 子命令：执行 GAIA benchmark 评测。
 */
export async function runGaiaEvalCli(
    argv: readonly string[],
    dependencies?: GaiaCliDependencies,
): Promise<number> {
    const { values } = parseArgs({
        args: argv.slice(2),
        options: {
            manifest: { type: "string", short: "m" },
            output: { type: "string", short: "o" },
            "output-dir": { type: "string" },
            task: { type: "string" },
            provider: { type: "string" },
            model: { type: "string" },
            "base-image": { type: "string" },
            tui: { type: "boolean" },
            mode: { type: "string" },
            resume: { type: "string" },
            "max-steps": { type: "string" },
        },
        strict: false,
    });

    const isTui = Boolean(values.tui);
    if (isTui) {
        process.stderr.write("错误: --tui 交互模式已被移除，请使用标准 headless 评测命令\n");
        return 2;
    }

    const manifestPath = values.manifest as string | undefined;
    if (!manifestPath) {
        process.stderr.write("错误: 必须指定 --manifest <path>\n");
        process.stderr.write("用法: lazygoal eval gaia --manifest <path/to/manifest.json> [--output <dir>]\n");
        return 1;
    }

    const runId = `gaia-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const benchmarkPaths = await resolveBenchmarkHomePaths(process.cwd(), "gaia");
    const outputDirectory = resolve((values.output as string) ?? join(benchmarkPaths.runsDirectory, runId));
    await mkdir(outputDirectory, { recursive: true });

    // 加载 Manifest
    const manifest = await loadGaiaManifest(resolve(manifestPath));

    // 读取 LLM 配置
    const env = process.env;
    const provider = (values.provider as string | undefined) ?? env.LLM_PROVIDER;
    const model = (values.model as string | undefined) ?? env.LLM_MODEL;
    const llmConfig = readLLMConfig({
        ...env,
        ...(provider ? { LLM_PROVIDER: provider } : {}),
        ...(model ? { LLM_MODEL: model } : {}),
    });
    const adapter = createLlmAdapter(llmConfig);

    // 构建 GAIA Worker 产物
    process.stdout.write("构建 GAIA Worker 容器产物...\n");
    const workerArtifact = await buildBenchmarkWorker({
        projectRoot: resolve("."),
        entryPoint: resolve("benchmarks/gaia/src/worker-entry.ts"),
        cacheDirectory: join(benchmarkPaths.cacheDirectory, "worker"),
        promptAssets: GAIA_ACP_WORKER_PROMPT_ASSETS,
    });

    let targetTasks = manifest.tasks;
    if (values.task) {
        targetTasks = targetTasks.filter((t) => t.taskId === values.task);
        if (targetTasks.length === 0) {
            process.stderr.write(`错误: Manifest 中未找到 taskId 为 ${values.task} 的任务\n`);
            return 1;
        }
    }

    process.stdout.write(`开始评测 GAIA (${targetTasks.length} 个任务)，输出目录: ${outputDirectory}\n`);

    for (let i = 0; i < targetTasks.length; i++) {
        const task = targetTasks[i]!;
        process.stdout.write(`[${i + 1}/${targetTasks.length}] 正在评测任务 ${task.taskId} (Level ${task.level})...\n`);

        try {
            const supervisorResult = await runGaiaSupervisor({
                task,
                dataRoot: manifest.dataRoot,
                outputDirectory,
                llmAdapter: adapter,
                workerArtifact,
                ...(values["base-image"] ? { baseImage: values["base-image"] as string } : {}),
                runId,
            });

            const mark = supervisorResult.domainResult.correct ? "✓ 正确" : "✗ 错误";
            process.stdout.write(`    结果: ${supervisorResult.status}, 判定: ${mark}, 耗时: ${supervisorResult.durationMs}ms\n`);
        } catch (error) {
            process.stderr.write(`    任务 ${task.taskId} 执行异常: ${error instanceof Error ? error.message : String(error)}\n`);
        }
    }

    // 汇总报告
    process.stdout.write("\n正在生成评测汇总报告...\n");
    const attempts = await readGaiaAttempts(outputDirectory);
    const report = aggregateGaiaReport(attempts, manifest.tasks[0]?.split ?? "validation");
    const reportPath = join(outputDirectory, "report.json");
    await writeGaiaReport(reportPath, report);

    process.stdout.write(`\n=== GAIA 评测完成 ===\n`);
    process.stdout.write(`总题目数: ${report.summary.totalTasks}\n`);
    process.stdout.write(`已完成数: ${report.summary.completedTasks}\n`);
    process.stdout.write(`已作答数: ${report.summary.answeredTasks}\n`);
    process.stdout.write(`正确题目: ${report.summary.correctTasks}\n`);
    process.stdout.write(`整体正确率: ${(report.summary.accuracy * 100).toFixed(2)}%\n`);
    for (const l of [1, 2, 3] as const) {
        const st = report.summary.byLevel[l];
        process.stdout.write(
            `  Level ${l}: ${st.correct}/${st.total} (${(st.accuracy * 100).toFixed(2)}%)\n`,
        );
    }
    process.stdout.write(`完整报告保存至: ${reportPath}\n`);

    return 0;
}

/**
 * GAIA CLI 主分发入口。
 */
export async function runGaiaCli(
    argv: readonly string[] = process.argv.slice(2),
    dependencies?: GaiaCliDependencies,
): Promise<number> {
    if (argv.length === 0) {
        process.stdout.write("Usage: lazygoal <eval|load|grade> gaia [options]\n");
        return 1;
    }

    const command = argv[0];
    const target = argv[1];

    if (command === "eval" && target === "gaia") {
        return runGaiaEvalCli(argv, dependencies);
    }
    if ((command === "load" && target === "gaia") || (command === "gaia" && target === "load")) {
        return runGaiaLoadCli(argv);
    }
    if (command === "grade" && target === "gaia") {
        return runGaiaGradeCli(argv);
    }

    process.stderr.write(`未知 GAIA 命令: ${argv.join(" ")}\n`);
    process.stderr.write("可用命令: lazygoal eval gaia, lazygoal load gaia, lazygoal grade gaia\n");
    return 1;
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("cli.ts")) {
    void runGaiaCli().then((code) => {
        process.exitCode = code;
    }).catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
