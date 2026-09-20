import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type {
    BenchmarkAttemptError,
} from "../attempt-recorder.js";

/** Prompt Evaluation 当前唯一受支持的线协议标识。 */
export const PROMPT_EVALUATION_PROTOCOL = "prompt-evaluation@1" as const;

/** Prompt Evaluation CLI 的稳定退出码。 */
export const PROMPT_EVALUATION_EXIT_CODES = Object.freeze({
    completed: 0,
    infrastructureError: 1,
    invalidRequest: 2,
    cancelled: 130,
} as const);

/** 首批可通过 Prompt Evaluation 调用的 benchmark 标识。 */
export type PromptEvaluationBenchmarkId = "alfworld" | "gaia";

/** Prompt Evaluation 请求中的 benchmark 定位。 */
export interface PromptEvaluationBenchmarkReference {
    /** 已注册 benchmark 的稳定标识。 */
    readonly id: PromptEvaluationBenchmarkId;
    /** 已解析为绝对路径的单个 Manifest。 */
    readonly manifestPath: string;
}

/** 仅包含可变 Prompt 字段的候选描述。 */
export interface PromptEvaluationCandidate {
    /** 由外部优化器分配的候选稳定标识。 */
    readonly id: string;
    /** 候选所基于的 benchmark Profile 标识。 */
    readonly baseProfileId: string;
    /** 替换基准 Profile 的 system Prompt。 */
    readonly systemPrompt: string;
    /** 替换基准 Profile 的有序 instructions。 */
    readonly instructions: readonly string[];
}

/** 不含凭据的模型配置身份。 */
export interface PromptEvaluationModelReference {
    /** LazyGoal 本地模型配置标识。 */
    readonly configId: string;
    /** 本次评测使用的模型标识。 */
    readonly modelId: string;
}

/**
 * LazyPrompt 提交给 LazyGoal 的单候选评测请求。
 *
 * @remarks
 * 请求只描述一个候选和一个 benchmark Manifest。路径在解析阶段规范化为绝对
 * 路径；模型凭据、工具授权和 Prompt Bundle 不属于该协议。
 *
 * @example
 * ```ts
 * const request: PromptEvaluationRequestV1 = {
 *   protocol: "prompt-evaluation@1",
 *   benchmark: { id: "alfworld", manifestPath: "/tmp/smoke.json" },
 *   candidate: {
 *     id: "candidate-1",
 *     baseProfileId: "alfworld-default",
 *     systemPrompt: "Solve the task.",
 *     instructions: ["Use the authorized tools."],
 *   },
 *   model: { configId: "default", modelId: "model-1" },
 *   outputDirectory: "/tmp/evaluations",
 * };
 * ```
 */
export interface PromptEvaluationRequestV1 {
    /** 当前协议判别符；不接受历史或未来版本。 */
    readonly protocol: typeof PROMPT_EVALUATION_PROTOCOL;
    /** benchmark 与 Manifest 定位。 */
    readonly benchmark: PromptEvaluationBenchmarkReference;
    /** 只包含 Prompt 文本的候选。 */
    readonly candidate: PromptEvaluationCandidate;
    /** 不含凭据的模型配置身份。 */
    readonly model: PromptEvaluationModelReference;
    /** 评测产物根目录；解析后为绝对路径。 */
    readonly outputDirectory: string;
}

/** 单任务的权威评测状态。 */
export type PromptEvaluationTaskStatus =
    | "passed"
    | "failed"
    | "infrastructure_error"
    | "cancelled";

/**
 * 一个 Manifest 任务的 Prompt Evaluation 结果。
 *
 * @remarks
 * `passed` 与 `failed` 只能由 benchmark adapter 的领域评分产生；基础设施失败
 * 和取消不得伪造 `domainResult`。
 *
 * @example
 * ```ts
 * const result: PromptEvaluationTaskResult<{ won: boolean }> = {
 *   taskId: "task-1",
 *   status: "failed",
 *   domainResult: { won: false },
 *   attemptPath: "/tmp/attempt.json",
 *   artifactLocator: null,
 *   errors: [],
 * };
 * ```
 */
export interface PromptEvaluationTaskResult<TDomain = unknown> {
    /** Manifest 内的稳定任务标识。 */
    readonly taskId: string;
    /** 执行状态与领域判定合成后的稳定分类。 */
    readonly status: PromptEvaluationTaskStatus;
    /** benchmark 自己拥有的领域结果；基础设施失败或取消时为 `null`。 */
    readonly domainResult: TDomain | null;
    /** 已提交 Attempt 的绝对路径；尚未提交时为 `null`。 */
    readonly attemptPath: string | null;
    /** Goal Snapshot、Trajectory 与可选 Trace 的稳定定位。 */
    readonly artifactLocator: PromptEvaluationArtifactLocator | null;
    /** 执行链记录的有界阶段错误。 */
    readonly errors: readonly BenchmarkAttemptError[];
}

/** Prompt Evaluation 汇总中保留的 LazyGoal 产物定位。 */
export interface PromptEvaluationArtifactLocator {
    readonly goalSnapshot: string;
    readonly trajectory: string;
    readonly diagnosticTrace?: string;
}

/** Prompt Evaluation 汇总的稳定终态。 */
export type PromptEvaluationStatus =
    | "completed"
    | "infrastructure_error"
    | "cancelled";

/**
 * 原子写入的 Prompt Evaluation 汇总结果。
 *
 * @example
 * ```ts
 * const result: PromptEvaluationResultV1 = {
 *   protocol: "prompt-evaluation@1",
 *   evaluationId: "eval-1",
 *   status: "completed",
 *   benchmarkId: "alfworld",
 *   manifestPath: "/tmp/smoke.json",
 *   candidateId: "candidate-1",
 *   baseProfileId: "alfworld-profile",
 *   promptSha256: "a".repeat(64),
 *   promptSummary: {
 *     systemPromptCharacters: 20,
 *     instructionCount: 1,
 *     instructionCharacters: 30,
 *   },
 *   modelConfigId: "default",
 *   modelId: "model-1",
 *   generatedAt: new Date().toISOString(),
 *   tasks: [],
 * };
 * ```
 */
export interface PromptEvaluationResultV1 {
    readonly protocol: typeof PROMPT_EVALUATION_PROTOCOL;
    readonly evaluationId: string;
    readonly status: PromptEvaluationStatus;
    readonly benchmarkId: PromptEvaluationBenchmarkId;
    readonly manifestPath: string;
    readonly candidateId: string;
    readonly baseProfileId: string;
    readonly promptSha256: string;
    readonly promptSummary: {
        readonly systemPromptCharacters: number;
        readonly instructionCount: number;
        readonly instructionCharacters: number;
    };
    readonly modelConfigId: string;
    readonly modelId: string;
    readonly generatedAt: string;
    readonly tasks: readonly PromptEvaluationTaskResult[];
}

/** Prompt Evaluation 事件所处的稳定阶段。 */
export type PromptEvaluationEventStage =
    | "accepted"
    | "task_started"
    | "task_progress"
    | "task_completed"
    | "completed"
    | "infrastructure_error"
    | "cancelled";

/**
 * CLI stdout 上的一条 JSON Lines 事件。
 *
 * @remarks
 * 事件只用于观察进度，`authoritative` 固定为 `false`。调用方必须以原子结果和
 * Attempt 为权威事实，不能从最后一条事件推断评分。
 *
 * @example
 * ```ts
 * const event: PromptEvaluationEventV1 = {
 *   protocol: "prompt-evaluation@1",
 *   evaluationId: "eval-1",
 *   type: "progress",
 *   authoritative: false,
 *   taskId: "task-1",
 *   stage: "task_started",
 *   timestamp: new Date().toISOString(),
 * };
 * ```
 */
export interface PromptEvaluationEventV1 {
    readonly protocol: typeof PROMPT_EVALUATION_PROTOCOL;
    readonly evaluationId: string;
    readonly type: "progress" | "terminal";
    readonly authoritative: false;
    readonly taskId: string | null;
    readonly stage: PromptEvaluationEventStage;
    readonly timestamp: string;
    readonly resultPath?: string;
    readonly error?: {
        readonly code: string;
        readonly message: string;
    };
}

/** Prompt Evaluation 请求校验错误码。 */
export type PromptEvaluationRequestErrorCode =
    | "INVALID_JSON"
    | "INVALID_PROTOCOL"
    | "INVALID_SCHEMA"
    | "UNKNOWN_FIELD"
    | "UNSUPPORTED_BENCHMARK"
    | "INVALID_PATH";

/**
 * 请求在任何执行副作用前被拒绝时抛出的稳定错误。
 *
 * @example
 * ```ts
 * try {
 *   await parsePromptEvaluationRequest(raw);
 * } catch (error) {
 *   if (error instanceof PromptEvaluationRequestError) console.error(error.code, error.field);
 * }
 * ```
 */
export class PromptEvaluationRequestError extends Error {
    readonly name = "PromptEvaluationRequestError";

    constructor(
        readonly code: PromptEvaluationRequestErrorCode,
        readonly field: string,
        message: string,
        options: ErrorOptions = {},
    ) {
        super(message, options);
    }
}

/** 请求解析阶段允许注入的只读环境依赖。 */
export interface PromptEvaluationRequestParseOptions {
    /** 相对路径的解析根；默认当前工作目录。 */
    readonly cwd?: string;
    /** 当前组合根实际注册的 benchmark ID。 */
    readonly supportedBenchmarkIds?: ReadonlySet<string>;
    /** 测试可注入的只读文件状态探针。 */
    readonly statPath?: typeof stat;
}

const ROOT_KEYS = ["protocol", "benchmark", "candidate", "model", "outputDirectory"] as const;
const BENCHMARK_KEYS = ["id", "manifestPath"] as const;
const CANDIDATE_KEYS = ["id", "baseProfileId", "systemPrompt", "instructions"] as const;
const MODEL_KEYS = ["configId", "modelId"] as const;
const DEFAULT_BENCHMARK_IDS = new Set<string>(["alfworld", "gaia"]);

/**
 * 校验并规范化未知 Prompt Evaluation 请求。
 *
 * @param value - JSON 反序列化后的未知值。
 * @param options - 路径根、已注册 benchmark 与只读文件探针。
 * @returns 深冻结且路径绝对化的当前版本请求。
 * @throws `PromptEvaluationRequestError`，且失败前不会创建目录、容器或模型调用。
 * @example
 * ```ts
 * const request = await parsePromptEvaluationRequest(JSON.parse(text), { cwd: "/workspace" });
 * ```
 */
export async function parsePromptEvaluationRequest(
    value: unknown,
    options: PromptEvaluationRequestParseOptions = {},
): Promise<PromptEvaluationRequestV1> {
    const root = requireRecord(value, "$", ROOT_KEYS);
    if (root.protocol !== PROMPT_EVALUATION_PROTOCOL) {
        throw new PromptEvaluationRequestError(
            "INVALID_PROTOCOL",
            "$.protocol",
            `Unsupported Prompt Evaluation protocol: ${String(root.protocol)}`,
        );
    }

    const benchmark = requireRecord(root.benchmark, "$.benchmark", BENCHMARK_KEYS);
    const benchmarkId = requireString(benchmark.id, "$.benchmark.id");
    const supported = options.supportedBenchmarkIds ?? DEFAULT_BENCHMARK_IDS;
    if (!supported.has(benchmarkId) || (benchmarkId !== "alfworld" && benchmarkId !== "gaia")) {
        throw new PromptEvaluationRequestError(
            "UNSUPPORTED_BENCHMARK",
            "$.benchmark.id",
            `Unsupported Prompt Evaluation benchmark: ${benchmarkId}`,
        );
    }

    const cwd = resolve(options.cwd ?? process.cwd());
    const manifestPath = resolvePath(requireString(benchmark.manifestPath, "$.benchmark.manifestPath"), cwd);
    await requireRegularFile(manifestPath, "$.benchmark.manifestPath", options.statPath ?? stat);

    const candidate = requireRecord(root.candidate, "$.candidate", CANDIDATE_KEYS);
    const instructions = requireInstructions(candidate.instructions);
    const model = requireRecord(root.model, "$.model", MODEL_KEYS);
    const outputDirectory = resolvePath(requireString(root.outputDirectory, "$.outputDirectory"), cwd);
    await requireDirectoryWhenPresent(outputDirectory, "$.outputDirectory", options.statPath ?? stat);

    return Object.freeze({
        protocol: PROMPT_EVALUATION_PROTOCOL,
        benchmark: Object.freeze({ id: benchmarkId, manifestPath }),
        candidate: Object.freeze({
            id: requireString(candidate.id, "$.candidate.id"),
            baseProfileId: requireString(candidate.baseProfileId, "$.candidate.baseProfileId"),
            systemPrompt: requireString(candidate.systemPrompt, "$.candidate.systemPrompt"),
            instructions: Object.freeze(instructions),
        }),
        model: Object.freeze({
            configId: requireString(model.configId, "$.model.configId"),
            modelId: requireString(model.modelId, "$.model.modelId"),
        }),
        outputDirectory,
    });
}

/**
 * 从 JSON 文件读取并校验 Prompt Evaluation 请求。
 *
 * @param requestPath - 请求文件路径，可相对于 `options.cwd`。
 * @param options - 与 {@link parsePromptEvaluationRequest} 相同的只读解析选项。
 * @returns 已规范化的当前版本请求。
 * @throws 文件读取、JSON 解析或请求校验失败时抛出稳定错误。
 * @example
 * ```ts
 * const request = await readPromptEvaluationRequest("request.json", { cwd: "/workspace" });
 * ```
 */
export async function readPromptEvaluationRequest(
    requestPath: string,
    options: PromptEvaluationRequestParseOptions = {},
): Promise<PromptEvaluationRequestV1> {
    const cwd = resolve(options.cwd ?? process.cwd());
    const absolutePath = resolvePath(requireString(requestPath, "requestPath"), cwd);
    let text: string;
    try {
        text = await readFile(absolutePath, "utf8");
    } catch (error: unknown) {
        throw new PromptEvaluationRequestError(
            "INVALID_PATH",
            "requestPath",
            `Prompt Evaluation request file is not readable: ${absolutePath}`,
            { cause: error },
        );
    }
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch (error: unknown) {
        throw new PromptEvaluationRequestError(
            "INVALID_JSON",
            "requestPath",
            `Prompt Evaluation request is not valid JSON: ${absolutePath}`,
            { cause: error },
        );
    }
    return parsePromptEvaluationRequest(value, { ...options, cwd });
}

function requireRecord<const TKeys extends readonly string[]>(
    value: unknown,
    field: string,
    allowedKeys: TKeys,
): Record<TKeys[number], unknown> {
    if (!isRecord(value)) {
        throw new PromptEvaluationRequestError("INVALID_SCHEMA", field, `${field} must be an object`);
    }
    const allowed = new Set<string>(allowedKeys);
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            throw new PromptEvaluationRequestError(
                "UNKNOWN_FIELD",
                `${field}.${key}`,
                `Unknown Prompt Evaluation field: ${field}.${key}`,
            );
        }
    }
    for (const key of allowedKeys) {
        if (!(key in value)) {
            throw new PromptEvaluationRequestError(
                "INVALID_SCHEMA",
                `${field}.${key}`,
                `Missing Prompt Evaluation field: ${field}.${key}`,
            );
        }
    }
    return value as Record<TKeys[number], unknown>;
}

function requireString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new PromptEvaluationRequestError(
            "INVALID_SCHEMA",
            field,
            `${field} must be a non-empty string`,
        );
    }
    return value;
}

function requireInstructions(value: unknown): string[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new PromptEvaluationRequestError(
            "INVALID_SCHEMA",
            "$.candidate.instructions",
            "$.candidate.instructions must be a non-empty string array",
        );
    }
    return value.map((instruction, index) => requireString(
        instruction,
        `$.candidate.instructions[${index}]`,
    ));
}

function resolvePath(path: string, cwd: string): string {
    return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

async function requireRegularFile(
    path: string,
    field: string,
    statPath: typeof stat,
): Promise<void> {
    try {
        const info = await statPath(path);
        if (!info.isFile()) throw new Error("not a regular file");
    } catch (error: unknown) {
        throw new PromptEvaluationRequestError(
            "INVALID_PATH",
            field,
            `${field} must reference a readable regular file: ${path}`,
            { cause: error },
        );
    }
}

async function requireDirectoryWhenPresent(
    path: string,
    field: string,
    statPath: typeof stat,
): Promise<void> {
    try {
        const info = await statPath(path);
        if (!info.isDirectory()) throw new Error("not a directory");
    } catch (error: unknown) {
        if (isMissingPathError(error)) return;
        throw new PromptEvaluationRequestError(
            "INVALID_PATH",
            field,
            `${field} must reference a directory or a path that does not yet exist: ${path}`,
            { cause: error },
        );
    }
}

function isMissingPathError(error: unknown): boolean {
    return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
