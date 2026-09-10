import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { readLlmConfig } from "../../../packages/llm/src/config.js";
import { createLlmAdapter } from "../../../packages/llm/src/factory.js";
import { buildSwebenchWorker } from "../../src/worker-builder.js";
import { SWE_ACP_WORKER_ENTRYPOINT, SWE_ACP_WORKER_PROMPT_ASSETS } from "./worker-config.js";
import { gradeSwebenchEvaluation, preflightSwebench, runSwebenchEvaluation } from "./evaluation.js";
import { loadSwebenchManifest } from "./manifest.js";

/**
 * 严格评测命令；output 必须是新目录以避免覆盖已有预测和评分缓存。
 * @example
 * ```ts
 * const command = parseSwebenchArgs(["eval", "swebench", "--manifest", "smoke.json"]);
 * ```
 */
export interface SwebenchCommand {
    readonly manifest: string;
    readonly output: string;
    readonly python: string;
}

/**
 * 独立 SWE-bench 评分命令；只读取现有目录并调用官方 harness。
 *
 * @example
 * ```ts
 * const command: SwebenchGradeCommand = {
 *   output: "/tmp/swebench-run", python: "python3",
 * };
 * ```
 */
export interface SwebenchGradeCommand {
    readonly output: string;
    readonly python: string;
}

/** 解析显式 eval swebench 参数；不加载 Python、Docker 或模型配置。 */
export function parseSwebenchArgs(argv: readonly string[], cwd = process.cwd()): SwebenchCommand {
    const parsed = parseArgs({ args: [...argv], strict: true, allowPositionals: true,
        options: { manifest: { type: "string" }, output: { type: "string" }, python: { type: "string" } } });
    if (parsed.positionals.length !== 2 || parsed.positionals[0] !== "eval" || parsed.positionals[1] !== "swebench"
        || !parsed.values.manifest?.trim()) {
        throw new Error("Usage: lazygoal eval swebench --manifest <path> [--output <new-directory>] [--python <executable>]");
    }
    if (parsed.values.output !== undefined && !parsed.values.output.trim()) throw new Error("--output must be non-empty");
    if (parsed.values.python !== undefined && !parsed.values.python.trim()) throw new Error("--python must be non-empty");
    return {
        manifest: resolve(cwd, parsed.values.manifest),
        output: resolve(cwd, parsed.values.output ?? `.lazygoal/benchmarks/swebench-runs/${randomUUID()}`),
        python: parsed.values.python ?? "python3",
    };
}

/** 解析 `grade swebench --output <directory>`，不加载模型配置。 */
export function parseSwebenchGradeArgs(argv: readonly string[], cwd = process.cwd()): SwebenchGradeCommand {
    let parsed: ReturnType<typeof parseArgs>;
    try {
        parsed = parseArgs({
            args: [...argv],
            strict: true,
            allowPositionals: true,
            options: { output: { type: "string" }, python: { type: "string" } },
        });
    } catch (error: unknown) {
        throw new Error(`Invalid SWE-bench grade arguments: ${message(error)}`);
    }
    if (parsed.positionals.length !== 2 || parsed.positionals[0] !== "grade" || parsed.positionals[1] !== "swebench") {
        throw new Error("Usage: lazygoal grade swebench --output <existing-directory> [--python <executable>]");
    }
    if (typeof parsed.values.output !== "string" || parsed.values.output.trim() === "") {
        throw new Error("SWE-bench grade requires --output <existing-directory>");
    }
    if (parsed.values.python !== undefined && (typeof parsed.values.python !== "string" || parsed.values.python.trim() === "")) {
        throw new Error("--python must be non-empty");
    }
    return {
        output: resolve(cwd, parsed.values.output),
        python: typeof parsed.values.python === "string" ? parsed.values.python : "python3",
    };
}

/** 执行独立 SWE-bench 官方评分，不会读取 LLM 环境变量或构造 Worker。 */
export async function runSwebenchGradeCli(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
    let command: SwebenchGradeCommand;
    try { command = parseSwebenchGradeArgs(argv); }
    catch (error) { process.stderr.write(`${message(error)}\n`); return 2; }
    try {
        const report = await gradeSwebenchEvaluation({ outputDirectory: command.output, python: command.python });
        process.stdout.write(JSON.stringify({ outputDirectory: command.output, status: report.status, summary: report.summary }) + "\n");
        return report.status === "completed" ? 0 : 1;
    } catch (error) {
        process.stderr.write(`${message(error)}\n`);
        return 1;
    }
}

/**
 * 运行显式评测；配置失败返回 1，参数错误返回 2，中止返回 130。
 * @remarks
 * 未解决题目属于正常评分结果；基础设施或评分缺失返回 1。完整报告写入 output，
 * stdout 只打印机器可读摘要，进度与诊断写 stderr。SIGINT/SIGTERM 触发资源清理。
 */
export async function runSwebenchCli(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
    if (argv[0] === "grade" && argv[1] === "swebench") return runSwebenchGradeCli(argv);
    let command: SwebenchCommand;
    try { command = parseSwebenchArgs(argv); }
    catch (error) { process.stderr.write(`${message(error)}\n`); return 2; }
    const controller = new AbortController();
    const abort = () => controller.abort();
    process.on("SIGINT", abort);
    process.on("SIGTERM", abort);
    try {
        const manifest = await loadSwebenchManifest(command.manifest);
        const config = readLlmConfig(process.env);
        const adapter = createLlmAdapter(config);
        await preflightSwebench(command.python, undefined, controller.signal);
        const workerArtifact = await buildSwebenchWorker({
            projectRoot: process.cwd(),
            entryPoint: SWE_ACP_WORKER_ENTRYPOINT,
            cacheDirectory: ".lazygoal/benchmarks/swebench-worker-cache",
            promptAssets: SWE_ACP_WORKER_PROMPT_ASSETS,
        });
        await mkdir(dirname(command.output), { recursive: true });
        const report = await runSwebenchEvaluation({
            manifest, outputDirectory: command.output, python: command.python, modelId: config.model,
            llmAdapter: adapter, workerArtifact,
            signal: controller.signal, onProgress: (text) => process.stderr.write(`${text}\n`),
        });
        process.stdout.write(JSON.stringify({ outputDirectory: command.output, status: report.status, summary: report.summary }) + "\n");
        return report.status === "aborted" ? 130 : report.status === "completed" ? 0 : 1;
    } catch (error) {
        process.stderr.write(`${message(error)}\n`);
        return controller.signal.aborted ? 130 : 1;
    } finally {
        process.off("SIGINT", abort);
        process.off("SIGTERM", abort);
    }
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    void runSwebenchCli().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
        process.stderr.write(`${message(error)}\n`);
        process.exitCode = 1;
    });
}
