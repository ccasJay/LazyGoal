import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import type { LLMAdapter } from "../../../packages/llm/src/core/adapter.js";
import { loadRuntimeConfig } from "../../../packages/config/src/index.js";
import { createLlmAdapter } from "../../../packages/llm/src/factory.js";
import { runGepaReflectCli } from "./reflection-bridge.js";
import { runGepaResolveModelsCli } from "./model-bridge.js";

export { runGepaReflectCli, runGepaResolveModelsCli };
import { AlfworldPromptEvaluationAdapter } from "../../alfworld/src/prompt-evaluation-adapter.js";
import {
    loadAlfworldEnvironmentFile,
    resolveAlfworldContainerEnvironment,
} from "../../alfworld/src/environment-config.js";
import {
    ALFWORLD_ACP_WORKER_ENTRYPOINT,
    ALFWORLD_ACP_WORKER_PROMPT_ASSETS,
} from "../../alfworld/src/worker-config.js";
import { GaiaPromptEvaluationAdapter } from "../../gaia/src/prompt-evaluation-adapter.js";
import { GAIA_ACP_WORKER_PROMPT_ASSETS } from "../../gaia/src/worker-entry.js";
import { TuaBenchPromptEvaluationAdapter } from "../../tua-bench/src/prompt-evaluation-adapter.js";
import { TUA_BENCH_ACP_WORKER_PROMPT_ASSETS } from "../../tua-bench/src/worker-entry.js";
import {
    auditTuaGepaCandidate,
    inspectTuaGepaDataset,
    type TuaGepaCandidateAuditRequest,
    type TuaGepaDatasetRequest,
} from "../../tua-bench/src/gepa-inspector.js";
import { fingerprintPromptEvaluationCandidate } from "./profile.js";
import { buildBenchmarkWorker } from "../worker-builder.js";
import { resolveBenchmarkHomePaths } from "../default-paths.js";
import {
    PROMPT_EVALUATION_EXIT_CODES,
    PROMPT_EVALUATION_PROTOCOL,
    readPromptEvaluationRequest,
    type PromptEvaluationEventV1,
    type PromptEvaluationRequestV1,
} from "./protocol.js";
import {
    PromptEvaluationBenchmarkRegistry,
    PromptEvaluationRunner,
    type PromptEvaluationBenchmarkAdapter,
} from "./runner.js";
import { PromptEvaluationResultRecorder } from "./result-recorder.js";

/** Prompt Evaluation 生产接线使用的 ALFWorld sidecar 源文件。 */
export const ALFWORLD_PROMPT_EVALUATION_SIDECAR_PATH = fileURLToPath(
    new URL("../../alfworld/python/sidecar.py", import.meta.url),
);

type ProductionAdapter = PromptEvaluationBenchmarkAdapter<unknown, unknown>;
type ProductionAdapterFactory = (
    workspaceRoot: string,
    env: NodeJS.ProcessEnv,
) => Promise<ProductionAdapter>;

/**
 * 以只读方式检查 GEPA 请求中的 TUA 数据集，并输出机器可读快照。
 *
 * @param argv - `gepa inspect-tua --request <path>` 参数。
 * @returns 零表示预检成功；无效请求或数据资源缺失返回非零。
 * @example
 * ```ts
 * const exitCode = await runGepaInspectTuaCli([
 *   "gepa", "inspect-tua", "--request", "/tmp/gepa-request.json",
 * ]);
 * ```
 */
export async function runGepaInspectTuaCli(argv: readonly string[]): Promise<number> {
    try {
        const parsed = parseArgs({
            args: [...argv.slice(2)],
            options: { request: { type: "string" } },
            allowPositionals: false,
            strict: true,
        });
        const requestPath = parsed.values.request;
        if (typeof requestPath !== "string" || requestPath.trim() === "") {
            throw new Error("Usage: lazygoal gepa inspect-tua --request <path>");
        }
        const raw: unknown = JSON.parse(await readFile(resolve(requestPath), "utf8"));
        const dataset = (raw !== null && typeof raw === "object" && "tuaDataset" in raw)
            ? (raw as { readonly tuaDataset: unknown }).tuaDataset
            : raw;
        if (!isTuaGepaDatasetRequest(dataset)) {
            throw new Error("GEPA request tuaDataset is missing or malformed");
        }
        const inspection = await inspectTuaGepaDataset(dataset);
        process.stdout.write(`${JSON.stringify(inspection)}\n`);
        return 0;
    } catch (error: unknown) {
        process.stderr.write(`${errorMessage(error)}\n`);
        return 2;
    }
}

/**
 * 对 GEPA TUA 候选做脱敏字面泄漏审计并输出机器可读结果。
 *
 * @param argv - `gepa audit-tua-candidate --request <path>` 参数。
 * @returns 零表示审计成功；请求无效或数据资源缺失返回非零。
 * @example
 * ```ts
 * const exitCode = await runGepaAuditTuaCandidateCli([
 *   "gepa", "audit-tua-candidate", "--request", "/tmp/audit-request.json",
 * ]);
 * ```
 */
export async function runGepaAuditTuaCandidateCli(argv: readonly string[]): Promise<number> {
    try {
        const parsed = parseArgs({
            args: [...argv.slice(2)],
            options: { request: { type: "string" } },
            allowPositionals: false,
            strict: true,
        });
        const requestPath = parsed.values.request;
        if (typeof requestPath !== "string" || requestPath.trim() === "") {
            throw new Error("Usage: lazygoal gepa audit-tua-candidate --request <path>");
        }
        const raw: unknown = JSON.parse(await readFile(resolve(requestPath), "utf8"));
        if (!isTuaGepaCandidateAuditRequest(raw)) {
            throw new Error("TUA candidate audit request is malformed");
        }
        const fingerprint = fingerprintPromptEvaluationCandidate({
            systemPrompt: raw.systemPrompt,
            instructions: raw.instructions,
        });
        if (fingerprint.promptSha256 !== raw.candidateId.replace(/^sha256:/u, "")) {
            throw new Error("TUA candidate audit identity does not match its Prompt fields");
        }
        const result = await auditTuaGepaCandidate(raw);
        process.stdout.write(`${JSON.stringify(result)}\n`);
        return 0;
    } catch (error: unknown) {
        process.stderr.write(`${errorMessage(error)}\n`);
        return 2;
    }
}

function isTuaGepaDatasetRequest(value: unknown): value is TuaGepaDatasetRequest {
    if (value === null || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return typeof record.repoRoot === "string"
        && record.repoRoot.trim() !== ""
        && Array.isArray(record.trainTaskIds)
        && record.trainTaskIds.every((taskId) => typeof taskId === "string")
        && Array.isArray(record.validationTaskIds)
        && record.validationTaskIds.every((taskId) => typeof taskId === "string")
        && Array.isArray(record.holdoutTaskIds)
        && record.holdoutTaskIds.every((taskId) => typeof taskId === "string");
}

function isTuaGepaCandidateAuditRequest(value: unknown): value is TuaGepaCandidateAuditRequest {
    if (value === null || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return typeof record.repoRoot === "string"
        && record.repoRoot.trim() !== ""
        && Array.isArray(record.taskIds)
        && record.taskIds.every((taskId) => typeof taskId === "string")
        && typeof record.candidateId === "string"
        && /^(?:sha256:)?[a-f0-9]{64}$/u.test(record.candidateId)
        && typeof record.systemPrompt === "string"
        && Array.isArray(record.instructions)
        && record.instructions.every((instruction) => typeof instruction === "string");
}

const PRODUCTION_ADAPTER_FACTORIES: ReadonlyMap<string, ProductionAdapterFactory> = new Map([
    ["alfworld", createAlfworldPromptEvaluationAdapter],
    ["gaia", createGaiaPromptEvaluationAdapter],
    ["tua-bench", createTuaBenchPromptEvaluationAdapter],
]);

/** `eval prompt` CLI 的可注入边界。 */
export interface PromptEvaluationCliOptions {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly signal?: AbortSignal;
    readonly writeOutput?: (line: string) => void;
    readonly writeError?: (line: string) => void;
    /** 可注入的 registry；其 ID 集合定义请求支持范围，提供后不会构建 Worker。 */
    readonly registry?: PromptEvaluationBenchmarkRegistry;
    /** 测试可注入的模型 adapter；提供后不会读取供应商配置。 */
    readonly llmAdapter?: LLMAdapter;
    /** 测试可注入的评测 ID 生成器。 */
    readonly evaluationIdGenerator?: () => string;
    /** 测试可注入的 ISO 时间生成器。 */
    readonly now?: () => string;
}

/**
 * 执行机器可调用的单候选 Prompt Evaluation CLI。
 *
 * @remarks
 * stdout 每次调用只写一行一个非权威协议事件。结果先原子提交，终态事件才附带
 * `resultPath`；领域失败仍返回 `0`，基础设施、无效请求和取消分别返回 `1/2/130`。
 *
 * @param argv - `eval prompt --request <path>` 参数。
 * @param options - 进程环境、输出和测试替身。
 * @returns 稳定 CLI 退出码。
 * @example
 * ```ts
 * const code = await runPromptEvaluationCli([
 *   "eval", "prompt", "--request", "/tmp/request.json",
 * ]);
 * ```
 */
export async function runPromptEvaluationCli(
    argv: readonly string[] = process.argv.slice(2),
    options: PromptEvaluationCliOptions = {},
): Promise<number> {
    const writeOutput = options.writeOutput ?? ((line: string) => process.stdout.write(`${line}\n`));
    const writeError = options.writeError ?? ((line: string) => process.stderr.write(`${line}\n`));
    const cwd = resolve(options.cwd ?? process.cwd());
    let request: PromptEvaluationRequestV1;
    try {
        const requestPath = parseRequestPath(argv);
        const supportedBenchmarkIds = options.registry?.ids()
            ?? new Set(PRODUCTION_ADAPTER_FACTORIES.keys());
        request = await readPromptEvaluationRequest(requestPath, { cwd, supportedBenchmarkIds });
    } catch (error: unknown) {
        writeError(errorMessage(error));
        return PROMPT_EVALUATION_EXIT_CODES.invalidRequest;
    }

    let llmAdapter: LLMAdapter;
    try {
        if (options.llmAdapter !== undefined) {
            llmAdapter = options.llmAdapter;
        } else {
            const runtimeConfig = await loadRuntimeConfig({
                env: options.env ?? process.env,
                cliArgs: {
                    profile: request.model.configId,
                    model: request.model.modelId,
                },
            });
            llmAdapter = createLlmAdapter(runtimeConfig.llm);
        }
    } catch (error: unknown) {
        writeError(errorMessage(error));
        return PROMPT_EVALUATION_EXIT_CODES.invalidRequest;
    }

    let registry: PromptEvaluationBenchmarkRegistry;
    try {
        registry = options.registry ?? await createProductionRegistry(request, cwd, options.env ?? process.env);
    } catch (error: unknown) {
        writeError(errorMessage(error));
        return PROMPT_EVALUATION_EXIT_CODES.infrastructureError;
    }

    const ownedAbortController = options.signal === undefined ? new AbortController() : undefined;
    const signal = options.signal ?? ownedAbortController!.signal;
    const abort = () => ownedAbortController?.abort();
    if (ownedAbortController !== undefined) {
        process.once("SIGINT", abort);
        process.once("SIGTERM", abort);
    }

    let terminalEvent: PromptEvaluationEventV1 | undefined;
    try {
        const runner = new PromptEvaluationRunner({
            registry,
            ...(options.evaluationIdGenerator === undefined
                ? {}
                : { evaluationIdGenerator: options.evaluationIdGenerator }),
            ...(options.now === undefined ? {} : { now: options.now }),
        });
        let result;
        try {
            result = await runner.run(request, {
                llmAdapter,
                signal,
                onEvent: (event) => {
                    if (event.type === "terminal") terminalEvent = event;
                    else writeOutput(JSON.stringify(event));
                },
            });
        } catch (error: unknown) {
            writeError(errorMessage(error));
            return PROMPT_EVALUATION_EXIT_CODES.invalidRequest;
        }

        let resultPath: string;
        try {
            const recorder = new PromptEvaluationResultRecorder(join(
                request.outputDirectory,
                "evaluations",
                result.evaluationId,
            ));
            resultPath = await recorder.commit(result);
        } catch (error: unknown) {
            writeOutput(JSON.stringify(createInfrastructureTerminal(
                result.evaluationId,
                error,
                options.now?.() ?? new Date().toISOString(),
            )));
            return PROMPT_EVALUATION_EXIT_CODES.infrastructureError;
        }

        const terminal = terminalEvent ?? {
            protocol: PROMPT_EVALUATION_PROTOCOL,
            evaluationId: result.evaluationId,
            type: "terminal" as const,
            authoritative: false as const,
            taskId: null,
            stage: result.status,
            timestamp: options.now?.() ?? new Date().toISOString(),
        };
        writeOutput(JSON.stringify({ ...terminal, resultPath }));
        if (result.status === "cancelled") return PROMPT_EVALUATION_EXIT_CODES.cancelled;
        if (result.status === "infrastructure_error") {
            return PROMPT_EVALUATION_EXIT_CODES.infrastructureError;
        }
        return PROMPT_EVALUATION_EXIT_CODES.completed;
    } finally {
        if (ownedAbortController !== undefined) {
            process.removeListener("SIGINT", abort);
            process.removeListener("SIGTERM", abort);
        }
    }
}

function parseRequestPath(argv: readonly string[]): string {
    let parsed: ReturnType<typeof parseArgs>;
    try {
        parsed = parseArgs({
            args: [...argv],
            options: { request: { type: "string" } },
            allowPositionals: true,
            strict: true,
        });
    } catch (error: unknown) {
        throw new Error(`Invalid Prompt Evaluation arguments: ${errorMessage(error)}`);
    }
    if (parsed.positionals.length !== 2
        || parsed.positionals[0] !== "eval"
        || parsed.positionals[1] !== "prompt") {
        throw new Error("Usage: lazygoal eval prompt --request <path>");
    }
    const requestPath = parsed.values.request;
    if (typeof requestPath !== "string" || requestPath.trim() === "") {
        throw new Error("Prompt Evaluation requires --request <path>");
    }
    return requestPath;
}

async function createProductionRegistry(
    request: PromptEvaluationRequestV1,
    workspaceRoot: string,
    env: NodeJS.ProcessEnv,
): Promise<PromptEvaluationBenchmarkRegistry> {
    const factory = PRODUCTION_ADAPTER_FACTORIES.get(request.benchmark.id);
    if (factory === undefined) {
        throw new Error(`Unsupported Prompt Evaluation benchmark: ${request.benchmark.id}`);
    }
    return new PromptEvaluationBenchmarkRegistry([
        await factory(workspaceRoot, env),
    ]);
}

async function createGaiaPromptEvaluationAdapter(
    workspaceRoot: string,
    env: NodeJS.ProcessEnv,
): Promise<ProductionAdapter> {
    const paths = await resolveBenchmarkHomePaths(workspaceRoot, "gaia", env);
    const workerArtifact = await buildBenchmarkWorker({
        projectRoot: workspaceRoot,
        entryPoint: resolve(workspaceRoot, "benchmarks/gaia/src/worker-entry.ts"),
        cacheDirectory: join(paths.cacheDirectory, "worker"),
        promptAssets: GAIA_ACP_WORKER_PROMPT_ASSETS,
    });
    return new GaiaPromptEvaluationAdapter({ workerArtifact }) as unknown as ProductionAdapter;
}

async function createTuaBenchPromptEvaluationAdapter(
    workspaceRoot: string,
    env: NodeJS.ProcessEnv,
): Promise<ProductionAdapter> {
    const paths = await resolveBenchmarkHomePaths(workspaceRoot, "tua-bench", env);
    const workerArtifact = await buildBenchmarkWorker({
        projectRoot: workspaceRoot,
        entryPoint: resolve(workspaceRoot, "benchmarks/tua-bench/src/worker-entry.ts"),
        cacheDirectory: join(paths.cacheDirectory, "worker"),
        promptAssets: TUA_BENCH_ACP_WORKER_PROMPT_ASSETS,
    });
    return new TuaBenchPromptEvaluationAdapter({ workerArtifact }) as unknown as ProductionAdapter;
}

async function createAlfworldPromptEvaluationAdapter(
    workspaceRoot: string,
    env: NodeJS.ProcessEnv,
): Promise<ProductionAdapter> {
    const fileEnv = await loadAlfworldEnvironmentFile(undefined, env);
    const mergedEnv = { ...fileEnv, ...env };
    const environment = resolveAlfworldContainerEnvironment({ env: mergedEnv, cwd: workspaceRoot });
    const alfworldPaths = await resolveBenchmarkHomePaths(workspaceRoot, "alfworld", env);
    const workerArtifact = await buildBenchmarkWorker({
        projectRoot: workspaceRoot,
        entryPoint: resolve(workspaceRoot, ALFWORLD_ACP_WORKER_ENTRYPOINT),
        cacheDirectory: join(alfworldPaths.cacheDirectory, "worker"),
        promptAssets: ALFWORLD_ACP_WORKER_PROMPT_ASSETS,
    });
    return new AlfworldPromptEvaluationAdapter({
        workspaceRoot,
        environment,
        workerArtifact,
        sidecarScriptPath: ALFWORLD_PROMPT_EVALUATION_SIDECAR_PATH,
    }) as unknown as ProductionAdapter;
}

function createInfrastructureTerminal(
    evaluationId: string,
    error: unknown,
    timestamp: string,
): PromptEvaluationEventV1 {
    return {
        protocol: PROMPT_EVALUATION_PROTOCOL,
        evaluationId,
        type: "terminal",
        authoritative: false,
        taskId: null,
        stage: "infrastructure_error",
        timestamp,
        error: {
            code: "RESULT_PERSISTENCE_FAILED",
            message: errorMessage(error).slice(0, 1_000),
        },
    };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

const entrypoint = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (entrypoint === fileURLToPath(import.meta.url)) {
    const rawArgv = process.argv.slice(2);
    const isReflect = rawArgv[0] === "gepa" && rawArgv[1] === "reflect";
    const isResolveModels = rawArgv[0] === "gepa" && rawArgv[1] === "resolve-models";
    const isInspectTua = rawArgv[0] === "gepa" && rawArgv[1] === "inspect-tua";
    const isAuditTuaCandidate = rawArgv[0] === "gepa" && rawArgv[1] === "audit-tua-candidate";
    const runner = isReflect
        ? runGepaReflectCli(rawArgv)
        : isResolveModels
        ? runGepaResolveModelsCli(rawArgv)
        : isInspectTua
        ? runGepaInspectTuaCli(rawArgv)
        : isAuditTuaCandidate
        ? runGepaAuditTuaCandidateCli(rawArgv)
        : runPromptEvaluationCli(rawArgv);
    void runner.then((code) => {
        process.exitCode = code;
    }).catch((error: unknown) => {
        process.stderr.write(`${errorMessage(error)}\n`);
        process.exitCode = isReflect || isResolveModels || isInspectTua || isAuditTuaCandidate
            ? 1
            : PROMPT_EVALUATION_EXIT_CODES.infrastructureError;
    });
}
