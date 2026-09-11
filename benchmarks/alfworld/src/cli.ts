import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
} from "../../../packages/agent/src/index.js";
import { readLlmConfig } from "../../../packages/llm/src/config.js";
import { createLlmAdapter } from "../../../packages/llm/src/factory.js";
import {
    EvaluationRunner,
} from "./evaluation-runner.js";
import { buildBenchmarkWorker } from "../../src/worker-builder.js";
import { AttemptRecorder } from "../../src/attempt-recorder.js";
import { runAlfworldSupervisor } from "./supervisor.js";
import {
    ALFWORLD_ACP_WORKER_ENTRYPOINT,
    ALFWORLD_ACP_WORKER_PROMPT_ASSETS,
} from "./worker-config.js";
import {
    ALFWORLD_PROFILE_ID,
    loadAlfworldProfile,
    type LoadedAlfworldProfile,
} from "./profile.js";
import {
    loadAlfworldEnvironmentFile,
    preflightAlfworldEnvironment,
    resolveAlfworldEnvironment,
    resolveAlfworldContainerEnvironment,
    runAlfworldPythonProbe,
    type AlfworldEnvironmentConfig,
    type AlfworldPreflightResult,
    type PythonProbeResult,
} from "./environment-config.js";
import { loadManifest, type AlfworldManifest } from "./manifest.js";
import {
    serializeEvaluationReport,
    regradeEvaluationReport,
    type EpisodeAttempt,
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
 * 独立 ALFWorld 评分命令；只读取已有报告和 Attempt 产物。
 *
 * @example
 * ```ts
 * const command: AlfworldGradeCommand = {
 *   reportPath: "/tmp/alfworld/report.json", minSuccessRate: 0,
 * };
 * ```
 */
export interface AlfworldGradeCommand {
    readonly reportPath: string;
    readonly minSuccessRate: number;
}

/**
 * 评分 CLI 的可注入输出边界。
 *
 * @example
 * ```ts
 * const options: AlfworldGradeCliOptions = {
 *   cwd: "/tmp", writeOutput: console.log,
 * };
 * ```
 */
export interface AlfworldGradeCliOptions {
    readonly cwd?: string;
    readonly writeOutput?: (text: string) => void;
    readonly writeError?: (text: string) => void;
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
 * 解析不启动模型的 `grade alfworld` 参数。
 *
 * @param argv - 不含 Node/bin 的评分参数。
 * @param cwd - 相对路径解析根。
 * @returns 已定位的历史报告和可选成功率阈值。
 * @throws 参数缺失、路径为空或阈值无效时抛出错误。
 * @example
 * ```ts
 * const command = parseAlfworldGradeArgs(["grade", "alfworld", "--output", "/tmp/run"]);
 * ```
 */
export function parseAlfworldGradeArgs(
    argv: readonly string[],
    cwd = process.cwd(),
): AlfworldGradeCommand {
    let parsed: ReturnType<typeof parseArgs>;
    try {
        parsed = parseArgs({
            args: [...argv],
            options: {
                report: { type: "string" },
                output: { type: "string" },
                "min-success-rate": { type: "string" },
            },
            allowPositionals: true,
            strict: true,
        });
    } catch (error: unknown) {
        throw new Error(`Invalid ALFWorld grade arguments: ${toErrorMessage(error)}`);
    }
    if (parsed.positionals.length !== 2 || parsed.positionals[0] !== "grade" || parsed.positionals[1] !== "alfworld") {
        throw new Error("Usage: lazygoal grade alfworld --report <path> [--min-success-rate <0..1>]");
    }
    const report = asOptionalString(parsed.values.report);
    const output = asOptionalString(parsed.values.output);
    if ((report === undefined || report.trim() === "") && (output === undefined || output.trim() === "")) {
        throw new Error("ALFWorld grade requires --report <path> or --output <directory>");
    }
    if (report !== undefined && report.trim() === "") throw new Error("--report must be non-empty");
    if (output !== undefined && output.trim() === "") throw new Error("--output must be non-empty");
    const reportPath = report === undefined
        ? join(resolve(cwd, output!), "report.json")
        : resolve(cwd, report);
    return {
        reportPath,
        minSuccessRate: parseUnitInterval(asOptionalString(parsed.values["min-success-rate"]), "--min-success-rate", 0),
    };
}

/**
 * 从现有 ALFWorld 报告重新聚合评分；不会读取 LLM 配置或启动 sidecar。
 *
 * @param argv - 形如 `grade alfworld --report <path>` 的参数。
 * @param options - 工作目录与输出替身。
 * @returns 报告成功率达到阈值时返回 0，否则返回 1；参数或 I/O 错误返回 2/1。
 * @example
 * ```ts
 * const code = await runAlfworldGradeCli(["grade", "alfworld", "--report", "run/report.json"]);
 * ```
 */
export async function runAlfworldGradeCli(
    argv: readonly string[] = process.argv.slice(2),
    options: AlfworldGradeCliOptions = {},
): Promise<number> {
    const writeOutput = options.writeOutput ?? ((text: string) => process.stdout.write(text));
    const writeError = options.writeError ?? ((text: string) => process.stderr.write(`${text}\n`));
    let command: AlfworldGradeCommand;
    try {
        command = parseAlfworldGradeArgs(argv, options.cwd ?? process.cwd());
    } catch (error: unknown) {
        writeError(toErrorMessage(error));
        return 2;
    }
    try {
        const saved = JSON.parse(await readFile(command.reportPath, "utf8")) as EvaluationReport;
        const report = regradeEvaluationReport(saved);
        await markAlfworldAttemptRecords(dirname(command.reportPath), report);
        await atomicWrite(command.reportPath, serializeEvaluationReport(report));
        writeOutput(JSON.stringify({ reportPath: command.reportPath, status: "completed", summary: report.summary }) + "\n");
        return report.summary.successRate >= command.minSuccessRate ? 0 : 1;
    } catch (error: unknown) {
        writeError(toErrorMessage(error));
        return 1;
    }
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
    if (argv[0] === "grade" && argv[1] === "alfworld") {
        return runAlfworldGradeCli(argv, options);
    }
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
        const environment = options.evaluate === undefined
            ? resolveAlfworldContainerEnvironment({ env: environmentEnv, cwd: workspaceRoot })
            : resolveAlfworldEnvironment({ env: environmentEnv, cwd: workspaceRoot });
        const manifest = await loadManifest(command.manifestPath, environment.dataRoot);
        const preflight = options.evaluate === undefined
            ? {
                pythonVersion: "container",
                alfworldVersion: environment.alfworldVersion,
                textworldVersion: environment.textworldVersion,
                dataRoot: environment.dataRoot,
                textworldOnly: true as const,
            }
            : await preflightAlfworldEnvironment(environment, {
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
    const adapter = createLlmAdapter(readLlmConfig(env));
    const renderer = await createDefaultPromptBundleRenderer();
    const contextCompactor = new DropOldestContextCompactor();
    const workerArtifact = await buildBenchmarkWorker({
        projectRoot: context.workspaceRoot,
        entryPoint: ALFWORLD_ACP_WORKER_ENTRYPOINT,
        cacheDirectory: join(context.workspaceRoot, ".lazygoal/benchmarks/alfworld-worker-cache"),
        promptAssets: ALFWORLD_ACP_WORKER_PROMPT_ASSETS,
    });
    const scriptPath = fileURLToPath(new URL("../python/sidecar.py", import.meta.url));
    const executeEpisode = async ({ task, signal }: import("./evaluation-runner.js").EpisodeExecutionContext) => {
        const result = await runAlfworldSupervisor({
            task,
            environment: context.environment,
            workerArtifact,
            llmAdapter: adapter,
            outputDirectory: join(context.workspaceRoot, ".lazygoal/benchmarks/alfworld-runs", context.metadata.manifest.name),
            taskTimeoutMs: task.maxSteps * 60_000,
            ...(signal === undefined ? {} : { signal }),
            sidecarScriptPath: scriptPath,
        });
        const infrastructureError = result.errors.find((error) => error.stage !== "agent");
        const agentError = result.errors.find((error) => error.stage === "agent");
        return {
            environment: result.environment,
            model: result.model,
            environmentSummary: {
                imageId: result.imageId,
                pythonVersion: context.preflight.pythonVersion,
                alfworldVersion: context.preflight.alfworldVersion,
                textworldVersion: context.preflight.textworldVersion,
            },
            worker: {
                workerSha256: workerArtifact.manifest.workerSha256,
                nodeSha256: workerArtifact.manifest.nodeSha256,
                nodeVersion: workerArtifact.manifest.nodeVersion,
                platform: workerArtifact.manifest.platform,
            },
            persistence: result.persistence,
            ...(infrastructureError === undefined ? {} : {
                failure: {
                    category: "infrastructure" as const,
                    code: infrastructureError.code ?? infrastructureError.stage,
                },
            }),
            ...(infrastructureError === undefined && agentError !== undefined ? {
                failure: {
                    category: "unknown" as const,
                    code: agentError.code ?? agentError.stage,
                },
            } : {}),
        };
    };
    return new EvaluationRunner({
        metadata: context.metadata,
        executeEpisode,
        maxInfrastructureRetries: context.command.maxInfrastructureRetries,
        attemptsDirectory: join(context.workspaceRoot, ".lazygoal/benchmarks/alfworld-runs", context.metadata.manifest.name, "attempts"),
    }).run();
}

async function atomicWrite(path: string, content: string): Promise<void> {
    const temporary = `${path}.${process.pid}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
}

async function markAlfworldAttemptRecords(outputDirectory: string, report: EvaluationReport): Promise<void> {
    const root = join(outputDirectory, "attempts");
    const paths: string[] = [];
    await collectAttemptFiles(root, paths);
    for (const path of paths) {
        const recorder = new AttemptRecorder(path);
        const current = await recorder.read();
        if (current === undefined) continue;
        const attempt = report.attempts.find((candidate) =>
            candidate.taskId === current.taskId && candidate.retrySequence + 1 === current.attempt,
        );
        if (attempt === undefined) throw new Error(`Attempt record has no matching ALFWorld report entry: ${path}`);
        await recorder.update({
            status: attemptStatus(attempt),
            lastStage: "grading",
            artifactLocator: attempt.persistence ?? current.artifactLocator,
            domainResult: {
                won: attempt.won,
                steps: attempt.steps,
                goalConditionSuccessRate: attempt.goalConditionSuccessRate,
                failureCategory: attempt.failureCategory,
                errorCode: attempt.errorCode,
            },
        });
    }
}

function attemptStatus(attempt: EpisodeAttempt): "completed" | "failed" | "cancelled" | "infrastructure_error" {
    if (attempt.won) return "completed";
    if (attempt.failureCategory === "aborted") return "cancelled";
    if (attempt.failureCategory === "infrastructure" || attempt.failureCategory === "protocol" || attempt.failureCategory === "timeout") {
        return "infrastructure_error";
    }
    return "failed";
}

async function collectAttemptFiles(directory: string, output: string[]): Promise<void> {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error: unknown) {
        if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
    }
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await collectAttemptFiles(path, output);
        else if (entry.isFile() && /^attempt-\d+\.json$/u.test(entry.name)) output.push(path);
    }
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
