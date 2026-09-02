import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
} from "../../../packages/agent/src/index.js";
import { OpenAICompatible } from "../../../packages/llm/src/openai-compatible.js";
import {
    createAlfworldEpisodeExecutor,
    EvaluationRunner,
} from "./evaluation-runner.js";
import {
    ALFWORLD_PROFILE_ID,
    loadAlfworldProfile,
    type LoadedAlfworldProfile,
} from "./profile.js";
import {
    loadAlfworldEnvironmentFile,
    preflightAlfworldEnvironment,
    resolveAlfworldEnvironment,
    runAlfworldPythonProbe,
    type AlfworldEnvironmentConfig,
    type AlfworldPreflightResult,
    type PythonProbeResult,
} from "./environment-config.js";
import { loadManifest, type AlfworldManifest } from "./manifest.js";
import { SidecarClient } from "./sidecar-client.js";
import {
    serializeEvaluationReport,
    type EvaluationReport,
    type EvaluationReportMetadata,
} from "./report.js";

const DEFAULT_PROFILE_ID = ALFWORLD_PROFILE_ID;
const DEFAULT_CONFIG_ID = "alfworld-textworld-v1";

/**
 * 评测 CLI 解析后的命令。
 *
 * @example
 * ```ts
 * const command: AlfworldEvalCommand = {
 *   profileId: "alfworld-profile", manifestPath: "/tmp/smoke.json",
 *   reportPath: null, minSuccessRate: 0, maxInfrastructureRetries: 0,
 *   configId: "alfworld-textworld-v1",
 * };
 * ```
 */
export interface AlfworldEvalCommand {
    readonly profileId: string;
    readonly manifestPath: string;
    readonly reportPath: string | null;
    readonly minSuccessRate: number;
    readonly maxInfrastructureRetries: number;
    readonly configId: string;
}

/**
 * 显式 `eval alfworld` CLI 的可注入边界。
 *
 * @example
 * ```ts
 * const options: AlfworldCliOptions = { cwd: "/workspace" };
 * ```
 */
export interface AlfworldCliOptions {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    /** 可选环境变量文件覆盖；未提供时读取 benchmarks/alfworld/.env.alfworld。 */
    readonly environmentFilePath?: string;
    readonly writeOutput?: (text: string) => void;
    readonly writeError?: (text: string) => void;
    /** 测试可注入 Python 探针，避免创建 Conda/sidecar 进程。 */
    readonly probePython?: (
        executable: string,
        script: string,
        env: NodeJS.ProcessEnv,
    ) => Promise<PythonProbeResult>;
    /** 测试可注入已构造的报告，仍会经过 Profile/Manifest/环境预检。 */
    readonly evaluate?: (context: AlfworldEvaluationContext) => Promise<EvaluationReport>;
}

/**
 * 评测实现收到的已完成配置验证上下文。
 *
 * @example
 * ```ts
 * const evaluate: AlfworldCliOptions["evaluate"] = async (context) => report;
 * ```
 */
export interface AlfworldEvaluationContext {
    readonly command: AlfworldEvalCommand;
    readonly workspaceRoot: string;
    readonly profile: LoadedAlfworldProfile;
    readonly manifest: AlfworldManifest;
    readonly environment: AlfworldEnvironmentConfig;
    readonly preflight: AlfworldPreflightResult;
    readonly metadata: EvaluationReportMetadata;
}

/**
 * 解析严格的 `eval alfworld` 参数。
 *
 * @param argv - 不包含 Node/bin 路径的参数数组。
 * @param cwd - 相对 Manifest 路径的解析根。
 * @returns 已校验的评测命令。
 * @throws 位置参数、选项、阈值或路径无效时抛出带稳定用法的 Error。
 * @example
 * ```ts
 * const command = parseAlfworldEvalArgs([
 *   "eval", "alfworld", "--manifest", "benchmarks/alfworld/manifests/smoke.json",
 * ], process.cwd());
 * ```
 */
export function parseAlfworldEvalArgs(
    argv: readonly string[],
    cwd = process.cwd(),
): AlfworldEvalCommand {
    let parsed: ReturnType<typeof parseArgs>;
    try {
        parsed = parseArgs({
            args: [...argv],
            options: {
                profile: { type: "string" },
                manifest: { type: "string" },
                report: { type: "string" },
                "min-success-rate": { type: "string" },
                "max-infrastructure-retries": { type: "string" },
                "config-id": { type: "string" },
            },
            allowPositionals: true,
            strict: true,
        });
    } catch (error: unknown) {
        throw new Error(`Invalid ALFWorld eval arguments: ${toErrorMessage(error)}`);
    }

    if (
        parsed.positionals.length !== 2
        || parsed.positionals[0] !== "eval"
        || parsed.positionals[1] !== "alfworld"
    ) {
        throw new Error(
            "Usage: lazygoal eval alfworld --manifest <path> [--profile <id>] "
            + "[--report <path>] [--min-success-rate <0..1>]",
        );
    }

    const manifestValue = parsed.values.manifest;
    if (typeof manifestValue !== "string" || manifestValue.trim() === "") {
        throw new Error("ALFWorld eval requires --manifest <path>");
    }

    const profileValue = parsed.values.profile;
    const profileId = typeof profileValue === "string" && profileValue.trim() !== ""
        ? profileValue.trim()
        : DEFAULT_PROFILE_ID;
    const manifestPath = isAbsolute(manifestValue)
        ? resolve(manifestValue)
        : resolve(cwd, manifestValue);
    const reportValue = parsed.values.report;
    const reportPath = typeof reportValue === "string" && reportValue.trim() !== ""
        ? resolve(cwd, reportValue)
        : null;
    const minSuccessRate = parseUnitInterval(
        asOptionalString(parsed.values["min-success-rate"]),
        "--min-success-rate",
        0,
    );
    const maxInfrastructureRetries = parseNonNegativeInteger(
        asOptionalString(parsed.values["max-infrastructure-retries"]),
        "--max-infrastructure-retries",
        0,
    );
    const configValue = parsed.values["config-id"];
    const configId = typeof configValue === "string" && configValue.trim() !== ""
        ? configValue.trim()
        : DEFAULT_CONFIG_ID;

    return {
        profileId,
        manifestPath,
        reportPath,
        minSuccessRate,
        maxInfrastructureRetries,
        configId,
    };
}

/**
 * 执行一次显式 ALFWorld 评测。
 *
 * @remarks
 * Profile、Manifest、Python/数据预检全部在构造模型 Adapter 或 sidecar Client
 * 前完成。报告无论是否达到阈值都会先写出；阈值未达成仅改变返回码。
 *
 * @param argv - 形如 `eval alfworld --manifest ...` 的参数。
 * @param options - 工作区、环境和测试替身。
 * @returns `0` 表示达到成功率阈值，参数/配置错误或阈值未达成返回非零码。
 * @throws 写报告失败等不可恢复的 I/O 错误；普通配置错误转换为返回码并写入 stderr。
 * @example
 * ```ts
 * const exitCode = await runAlfworldCli(process.argv.slice(2));
 * process.exitCode = exitCode;
 * ```
 */
export async function runAlfworldCli(
    argv: readonly string[] = process.argv.slice(2),
    options: AlfworldCliOptions = {},
): Promise<number> {
    const writeOutput = options.writeOutput ?? ((text: string) => process.stdout.write(text));
    const writeError = options.writeError ?? ((text: string) => process.stderr.write(`${text}\n`));
    let command: AlfworldEvalCommand;
    try {
        command = parseAlfworldEvalArgs(argv, options.cwd ?? process.cwd());
    } catch (error: unknown) {
        writeError(toErrorMessage(error));
        return 2;
    }

    const workspaceRoot = resolve(options.cwd ?? process.cwd());
    let environmentEnv = process.env;
    let context: AlfworldEvaluationContext;
    try {
        const profile = await loadAlfworldProfile(workspaceRoot);
        if (profile.profile.id !== command.profileId) {
            throw new Error(
                `ALFWorld Profile id mismatch: requested ${command.profileId}, file contains ${profile.profile.id}`,
            );
        }
        if (options.env === undefined || options.environmentFilePath !== undefined) {
            const fileEnv = await loadAlfworldEnvironmentFile(
                options.environmentFilePath,
                options.env ?? process.env,
            );
            environmentEnv = {
                ...fileEnv,
                ...(options.env ?? process.env),
            };
        } else {
            environmentEnv = options.env;
        }
        const environment = resolveAlfworldEnvironment({
            env: environmentEnv,
            cwd: workspaceRoot,
        });
        const manifest = await loadManifest(command.manifestPath, environment.dataRoot);
        const preflight = await preflightAlfworldEnvironment(environment, {
            probePython: options.probePython ?? runAlfworldPythonProbe,
        });
        context = {
            command,
            workspaceRoot,
            profile,
            manifest,
            environment,
            preflight,
            metadata: {
                manifest,
                profile: profile.profile,
                profileHash: profile.contentHash,
                promptBundleVersion: 1,
                configId: command.configId,
                modelId: environmentEnv.LLM_MODEL?.trim() || "unknown",
            },
        };
    } catch (error: unknown) {
        writeError(toErrorMessage(error));
        return 1;
    }

    try {
        const report = options.evaluate === undefined
            ? await runDefaultEvaluation(context, environmentEnv)
            : await options.evaluate(context);
        const serialized = serializeEvaluationReport(report);
        if (command.reportPath === null) {
            writeOutput(serialized);
        } else {
            await mkdir(dirname(command.reportPath), { recursive: true });
            await writeFile(command.reportPath, serialized, "utf8");
        }
        return report.summary.successRate >= command.minSuccessRate ? 0 : 1;
    } catch (error: unknown) {
        writeError(toErrorMessage(error));
        return 1;
    }
}

async function runDefaultEvaluation(
    context: AlfworldEvaluationContext,
    env: NodeJS.ProcessEnv,
): Promise<EvaluationReport> {
    const apiKey = env.LLM_API_KEY?.trim();
    const baseURL = env.LLM_BASE_URL?.trim();
    const model = env.LLM_MODEL?.trim();
    if (!apiKey || !baseURL || !model) {
        throw new Error("Missing required LLM_API_KEY, LLM_BASE_URL or LLM_MODEL for ALFWorld eval");
    }
    const adapter = new OpenAICompatible({ apiKey, baseURL, model });
    const renderer = await createDefaultPromptBundleRenderer();
    const contextCompactor = new DropOldestContextCompactor();
    const scriptPath = fileURLToPath(new URL("../python/sidecar.py", import.meta.url));
    const executeEpisode = createAlfworldEpisodeExecutor({
        profile: context.profile.profile,
        adapter,
        renderer,
        contextCompactor,
        workspaceRoot: context.workspaceRoot,
        persistenceRoot: join(context.workspaceRoot, ".lazygoal", "benchmarks"),
        enableTrace: true,
        createClient: () => new SidecarClient({
            pythonExecutable: context.environment.pythonExecutable,
            scriptPath,
            dataRoot: context.environment.dataRoot,
            env,
        }),
    });
    return new EvaluationRunner({
        metadata: context.metadata,
        executeEpisode,
        maxInfrastructureRetries: context.command.maxInfrastructureRetries,
    }).run();
}

function parseUnitInterval(
    value: string | undefined,
    name: string,
    fallback: number,
): number {
    if (value === undefined || value.trim() === "") return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error(`${name} must be a number between 0 and 1`);
    }
    return parsed;
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function parseNonNegativeInteger(
    value: string | undefined,
    name: string,
    fallback: number,
): number {
    if (value === undefined || value.trim() === "") return fallback;
    if (!/^\d+$/.test(value.trim())) throw new Error(`${name} must be a non-negative integer`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is too large`);
    return parsed;
}

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

const entrypoint = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (entrypoint === fileURLToPath(import.meta.url)) {
    void runAlfworldCli().then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error: unknown) => {
        process.stderr.write(`${toErrorMessage(error)}\n`);
        process.exitCode = 1;
    });
}
