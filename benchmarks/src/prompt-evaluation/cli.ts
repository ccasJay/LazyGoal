import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import type { LLMAdapter } from "../../../packages/llm/src/core/adapter.js";
import { loadRuntimeConfig } from "../../../packages/llm/src/config-loader.js";
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
} from "./runner.js";
import { PromptEvaluationResultRecorder } from "./result-recorder.js";

/** Prompt Evaluation 生产接线使用的 ALFWorld sidecar 源文件。 */
export const ALFWORLD_PROMPT_EVALUATION_SIDECAR_PATH = fileURLToPath(
    new URL("../../alfworld/python/sidecar.py", import.meta.url),
);

/** `eval prompt` CLI 的可注入边界。 */
export interface PromptEvaluationCliOptions {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly signal?: AbortSignal;
    readonly writeOutput?: (line: string) => void;
    readonly writeError?: (line: string) => void;
    /** 测试可注入的 registry；提供后不会构建 Worker。 */
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
        request = await readPromptEvaluationRequest(requestPath, { cwd });
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
    const gaiaPaths = request.benchmark.id === "gaia"
        ? await resolveBenchmarkHomePaths(workspaceRoot, "gaia", env)
        : undefined;
    if (request.benchmark.id === "gaia") {
        const workerArtifact = await buildBenchmarkWorker({
            projectRoot: workspaceRoot,
            entryPoint: resolve(workspaceRoot, "benchmarks/gaia/src/worker-entry.ts"),
            cacheDirectory: join(gaiaPaths!.cacheDirectory, "worker"),
            promptAssets: GAIA_ACP_WORKER_PROMPT_ASSETS,
        });
        return registryFor(new GaiaPromptEvaluationAdapter({ workerArtifact }));
    }

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
    return registryFor(new AlfworldPromptEvaluationAdapter({
        workspaceRoot,
        environment,
        workerArtifact,
        sidecarScriptPath: ALFWORLD_PROMPT_EVALUATION_SIDECAR_PATH,
    }));
}

function registryFor(
    adapter: GaiaPromptEvaluationAdapter | AlfworldPromptEvaluationAdapter,
): PromptEvaluationBenchmarkRegistry {
    return new PromptEvaluationBenchmarkRegistry([
        adapter as unknown as import("./runner.js").PromptEvaluationBenchmarkAdapter<unknown, unknown>,
    ]);
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
    const runner = isReflect
        ? runGepaReflectCli(rawArgv)
        : isResolveModels
        ? runGepaResolveModelsCli(rawArgv)
        : runPromptEvaluationCli(rawArgv);
    void runner.then((code) => {
        process.exitCode = code;
    }).catch((error: unknown) => {
        process.stderr.write(`${errorMessage(error)}\n`);
        process.exitCode = isReflect || isResolveModels ? 1 : PROMPT_EVALUATION_EXIT_CODES.infrastructureError;
    });
}
