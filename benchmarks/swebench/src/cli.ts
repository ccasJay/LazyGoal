import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { createDefaultPromptBundleRenderer, DropOldestContextCompactor } from "../../../packages/agent/src/index.js";
import { OpenAICompatible } from "../../../packages/llm/src/openai-compatible.js";
import { preflightSwebench, runSwebenchEvaluation } from "./evaluation.js";
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

/**
 * 运行显式评测；配置失败返回 1，参数错误返回 2，中止返回 130。
 * @remarks
 * 未解决题目属于正常评分结果；基础设施或评分缺失返回 1。完整报告写入 output，
 * stdout 只打印机器可读摘要，进度与诊断写 stderr。SIGINT/SIGTERM 触发资源清理。
 */
export async function runSwebenchCli(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
    let command: SwebenchCommand;
    try { command = parseSwebenchArgs(argv); }
    catch (error) { process.stderr.write(`${message(error)}\n`); return 2; }
    const controller = new AbortController();
    const abort = () => controller.abort();
    process.on("SIGINT", abort);
    process.on("SIGTERM", abort);
    try {
        const manifest = await loadSwebenchManifest(command.manifest);
        const apiKey = process.env.LLM_API_KEY?.trim();
        const baseURL = process.env.LLM_BASE_URL?.trim();
        const model = process.env.LLM_MODEL?.trim();
        const mode = process.env.LLM_STRUCTURED_OUTPUT_MODE?.trim();
        if (!apiKey || !baseURL || !model || (mode !== "strict" && mode !== "prompt_only")) {
            throw new Error("Set LLM_API_KEY, LLM_BASE_URL, LLM_MODEL and LLM_STRUCTURED_OUTPUT_MODE (strict or prompt_only)");
        }
        await preflightSwebench(command.python, undefined, controller.signal);
        await mkdir(dirname(command.output), { recursive: true });
        const report = await runSwebenchEvaluation({
            manifest, outputDirectory: command.output, workspaceRoot: process.cwd(), python: command.python, modelId: model,
            llmAdapter: new OpenAICompatible({ apiKey, baseURL, model, structuredOutputMode: mode }),
            renderer: await createDefaultPromptBundleRenderer(), contextCompactor: new DropOldestContextCompactor(),
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
