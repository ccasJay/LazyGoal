import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { HeadlessModelUsage, BenchmarkPersistenceLocator } from "./headless-composition-root.js";

/** Benchmark Attempt 的共享终态分类。 */
export type BenchmarkAttemptStatus = "completed" | "failed" | "cancelled" | "infrastructure_error";

/**
 * Prompt Evaluation 写入公共 Attempt 的候选与模型身份。
 *
 * @remarks
 * 元数据不重复保存 Prompt 原文；完整候选 Profile 已冻结在 Goal Snapshot 中。
 * 该对象一经首次提交便属于 Attempt 身份，后续阶段更新不得改变。
 *
 * @example
 * ```ts
 * const metadata: PromptEvaluationAttemptMetadata = {
 *   evaluationId: "eval-1",
 *   candidateId: "candidate-1",
 *   baseProfileId: "alfworld-profile",
 *   promptSha256: "a".repeat(64),
 *   promptSummary: {
 *     systemPromptCharacters: 20,
 *     instructionCount: 2,
 *     instructionCharacters: 40,
 *   },
 *   modelConfigId: "default",
 *   modelId: "model-1",
 * };
 * ```
 */
export interface PromptEvaluationAttemptMetadata {
    readonly evaluationId: string;
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
}

/**
 * 可跨 benchmark 持久化的 Attempt 公共事实；`domainResult` 保留领域专属结果。
 *
 * @remarks
 * 该结构是持久化文件边界。环境/Worker 摘要为可选不透明对象，评分字段必须放在
 * `domainResult` 中，避免共享层解释 SWE-bench 或 ALFWorld 的领域语义。
 *
 * @example
 * ```ts
 * const record: BenchmarkAttemptRecord<{ won: boolean }> = {
 *   benchmarkId: "alfworld", taskId: "game-1", goalId: "goal-1", runId: "run-1",
 *   attempt: 1, status: "completed", durationMs: 1200, usage: null,
 *   errors: [], artifactLocator: null, domainResult: { won: true },
 * };
 * ```
 */
export interface BenchmarkAttemptRecord<TDomain = unknown> {
    readonly benchmarkId: string;
    readonly taskId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly attempt: number;
    readonly status: BenchmarkAttemptStatus;
    readonly durationMs: number;
    readonly usage: HeadlessModelUsage | null;
    readonly errors: readonly BenchmarkAttemptError[];
    readonly artifactLocator: BenchmarkPersistenceLocator | null;
    /** 领域层结果；共享记录器只做 JSON 持久化，不解释字段。 */
    readonly domainResult: TDomain;
    /** 可选环境身份摘要，例如镜像 ID 或运行时版本。 */
    readonly environment?: Readonly<Record<string, unknown>>;
    /** 可选 Worker 身份摘要，例如 bundle 和 Node 摘要。 */
    readonly worker?: Readonly<Record<string, unknown>>;
    /** 最近一次已提交的领域阶段；用于中断后的审计。 */
    readonly lastStage?: string;
    /** 由 Prompt Evaluation 发起时附加的不可变候选与模型身份。 */
    readonly promptEvaluation?: PromptEvaluationAttemptMetadata;
}

/**
 * Attempt 记录的有界阶段错误。
 *
 * @example
 * ```ts
 * const error: BenchmarkAttemptError = {
 *   stage: "preflight", code: "MISSING_RUNTIME", message: "Python unavailable",
 * };
 * ```
 */
export interface BenchmarkAttemptError {
    readonly stage: string;
    readonly code?: string;
    readonly message: string;
}

/**
 * AttemptRecorder 的文件配置。
 *
 * @example
 * ```ts
 * const options: AttemptRecorderOptions = {
 *   rootDirectory: ".lazygoal/run/task-1",
 * };
 * ```
 */
export interface AttemptRecorderOptions {
    /** Attempt 文件所在目录；目录本身会自动创建。 */
    readonly rootDirectory: string;
    /** 文件名，默认 `attempt.json`。 */
    readonly fileName?: string;
}

/**
 * 以临时文件 + rename 原子写入单个 Attempt，并提供阶段更新与恢复读取。
 *
 * @remarks
 * 每次 `commit` 或 `update` 都完整替换当前记录；文件中不会出现半个 JSON。更新只能
 * 改变记录内容，不会改变 benchmark/task/Goal/Run/attempt 身份。读取损坏文件直接失败。
 *
 * @example
 * ```ts
 * const recorder = new AttemptRecorder({ rootDirectory: ".lazygoal/run/task-1" });
 * await recorder.commit(record);
 * await recorder.update({ status: "completed", lastStage: "artifacts" });
 * ```
 */
export class AttemptRecorder<TDomain = unknown> {
    readonly path: string;
    private current: BenchmarkAttemptRecord<TDomain> | undefined;

    /**
     * @param options - 记录文件目录，或直接传入目标文件路径（兼容测试夹具）。
     */
    constructor(options: AttemptRecorderOptions | string) {
        if (typeof options === "string") {
            this.path = resolve(options).endsWith(".json") ? resolve(options) : join(resolve(options), "attempt.json");
        } else {
            const fileName = options.fileName ?? "attempt.json";
            if (fileName.includes("/") || fileName.includes("\\") || fileName.trim() === "") throw new TypeError("Attempt fileName is invalid");
            this.path = join(resolve(options.rootDirectory), fileName);
        }
    }

    /**
     * 原子保存完整 Attempt。
     *
     * @param record - 当前阶段的完整公共与领域事实。
     * @returns 已发布的绝对文件路径。
     * @throws 身份不一致、记录字段非法或文件发布失败时抛出。
     */
    async commit(record: BenchmarkAttemptRecord<TDomain>): Promise<string> {
        validateRecord(record);
        if (this.current !== undefined && !sameIdentity(this.current, record)) {
            throw new TypeError("Attempt identity cannot change after the first commit");
        }
        await atomicWrite(this.path, record);
        this.current = record;
        return this.path;
    }

    /**
     * 合并并原子保存阶段更新；首次更新必须先有 `commit` 或可读取的文件。
     *
     * @param update - 需要替换的字段；身份字段不能改变。
     * @returns 已发布的绝对文件路径。
     */
    async update(update: Partial<BenchmarkAttemptRecord<TDomain>>): Promise<string> {
        const base = this.current ?? await this.read();
        if (base === undefined) throw new Error("Cannot update an Attempt before its first commit");
        const next = { ...base, ...update } as BenchmarkAttemptRecord<TDomain>;
        return this.commit(next);
    }

    /** `commit` 的语义别名，便于阶段型调用方表达持久化动作。 */
    async save(record: BenchmarkAttemptRecord<TDomain>): Promise<string> {
        return this.commit(record);
    }

    /**
     * 读取当前记录；不存在时返回 `undefined`，损坏文件直接抛出。
     */
    async read(): Promise<BenchmarkAttemptRecord<TDomain> | undefined> {
        try {
            const parsed: unknown = JSON.parse(await readFile(this.path, "utf8"));
            const record = parseBenchmarkAttemptRecord<TDomain>(parsed);
            this.current = record;
            return record;
        } catch (error) {
            if (isMissingFile(error)) return undefined;
            throw error;
        }
    }
}

/**
 * 从指定文件读取并校验 Attempt 记录。
 *
 * @param path - Attempt JSON 文件路径。
 * @returns 校验后的领域记录。
 * @throws 文件不存在、JSON 损坏或公共字段非法时抛出。
 * @example
 * ```ts
 * const record = await readBenchmarkAttempt(".lazygoal/run/task-1/attempt.json");
 * ```
 */
export async function readBenchmarkAttempt<TDomain = unknown>(path: string): Promise<BenchmarkAttemptRecord<TDomain>> {
    const parsed: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
    return parseBenchmarkAttemptRecord<TDomain>(parsed);
}

/** 对任意 JSON 值执行 Attempt 公共字段校验。 */
export function parseBenchmarkAttemptRecord<TDomain = unknown>(value: unknown): BenchmarkAttemptRecord<TDomain> {
    if (!isRecord(value)
        || typeof value.benchmarkId !== "string" || value.benchmarkId.trim() === ""
        || typeof value.taskId !== "string" || value.taskId.trim() === ""
        || typeof value.goalId !== "string" || value.goalId.trim() === ""
        || typeof value.runId !== "string" || value.runId.trim() === ""
        || typeof value.attempt !== "number" || !Number.isSafeInteger(value.attempt) || value.attempt < 1
        || !isAttemptStatus(value.status)
        || typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs) || value.durationMs < 0
        || !isUsage(value.usage)
        || !Array.isArray(value.errors)
        || value.domainResult === undefined
        || !isLocator(value.artifactLocator)
        || (value.environment !== undefined && !isRecord(value.environment))
        || (value.worker !== undefined && !isRecord(value.worker))
        || (value.lastStage !== undefined && typeof value.lastStage !== "string")
        || (value.promptEvaluation !== undefined && !isPromptEvaluationMetadata(value.promptEvaluation))) {
        throw new TypeError("Invalid BenchmarkAttemptRecord");
    }
    const errors: BenchmarkAttemptError[] = [];
    for (const error of value.errors) {
        if (!isRecord(error) || typeof error.stage !== "string" || typeof error.message !== "string"
            || (error.code !== undefined && typeof error.code !== "string")) throw new TypeError("Invalid Attempt error");
        errors.push({ stage: error.stage, message: error.message, ...(error.code === undefined ? {} : { code: error.code }) });
    }
    return {
        benchmarkId: value.benchmarkId,
        taskId: value.taskId,
        goalId: value.goalId,
        runId: value.runId,
        attempt: value.attempt as number,
        status: value.status,
        durationMs: value.durationMs,
        usage: value.usage as HeadlessModelUsage | null,
        errors,
        artifactLocator: value.artifactLocator as BenchmarkPersistenceLocator | null,
        domainResult: value.domainResult as TDomain,
        ...(value.environment === undefined ? {} : { environment: value.environment as Readonly<Record<string, unknown>> }),
        ...(value.worker === undefined ? {} : { worker: value.worker as Readonly<Record<string, unknown>> }),
        ...(value.lastStage === undefined ? {} : { lastStage: value.lastStage }),
        ...(value.promptEvaluation === undefined
            ? {}
            : { promptEvaluation: value.promptEvaluation as unknown as PromptEvaluationAttemptMetadata }),
    };
}

async function atomicWrite(path: string, record: BenchmarkAttemptRecord<unknown>): Promise<void> {
    const destination = resolve(path);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, `${JSON.stringify(record)}\n`, "utf8");
        await rename(temporary, destination);
    } catch (error) {
        await import("node:fs/promises").then(({ rm }) => rm(temporary, { force: true })).catch(() => undefined);
        throw error;
    }
}

function validateRecord<TDomain>(record: BenchmarkAttemptRecord<TDomain>): void {
    parseBenchmarkAttemptRecord(record as unknown);
}

function sameIdentity<TDomain>(a: BenchmarkAttemptRecord<TDomain>, b: BenchmarkAttemptRecord<TDomain>): boolean {
    return a.benchmarkId === b.benchmarkId && a.taskId === b.taskId && a.goalId === b.goalId
        && a.runId === b.runId && a.attempt === b.attempt
        && samePromptEvaluationMetadata(a.promptEvaluation, b.promptEvaluation);
}

function samePromptEvaluationMetadata(
    left: PromptEvaluationAttemptMetadata | undefined,
    right: PromptEvaluationAttemptMetadata | undefined,
): boolean {
    if (left === undefined || right === undefined) return left === right;
    return JSON.stringify(left) === JSON.stringify(right);
}

function isAttemptStatus(value: unknown): value is BenchmarkAttemptStatus {
    return value === "completed" || value === "failed" || value === "cancelled" || value === "infrastructure_error";
}

function isUsage(value: unknown): value is HeadlessModelUsage | null {
    if (value === null) return true;
    return isRecord(value)
        && typeof value.inputTokens === "number" && Number.isSafeInteger(value.inputTokens) && value.inputTokens >= 0
        && typeof value.outputTokens === "number" && Number.isSafeInteger(value.outputTokens) && value.outputTokens >= 0
        && typeof value.missingCalls === "number" && Number.isSafeInteger(value.missingCalls) && value.missingCalls >= 0;
}

function isLocator(value: unknown): value is BenchmarkPersistenceLocator | null {
    if (value === null) return true;
    return isRecord(value)
        && typeof value.goalSnapshot === "string"
        && typeof value.trajectory === "string"
        && (value.diagnosticTrace === undefined || typeof value.diagnosticTrace === "string");
}

function isPromptEvaluationMetadata(value: unknown): value is PromptEvaluationAttemptMetadata {
    if (!isRecord(value)
        || !isNonEmptyString(value.evaluationId)
        || !isNonEmptyString(value.candidateId)
        || !isNonEmptyString(value.baseProfileId)
        || typeof value.promptSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.promptSha256)
        || !isRecord(value.promptSummary)
        || !isNonNegativeInteger(value.promptSummary.systemPromptCharacters)
        || !isNonNegativeInteger(value.promptSummary.instructionCount)
        || !isNonNegativeInteger(value.promptSummary.instructionCharacters)
        || !isNonEmptyString(value.modelConfigId)
        || !isNonEmptyString(value.modelId)) {
        return false;
    }
    return Object.keys(value).every((key) => [
        "evaluationId",
        "candidateId",
        "baseProfileId",
        "promptSha256",
        "promptSummary",
        "modelConfigId",
        "modelId",
    ].includes(key))
        && Object.keys(value.promptSummary).every((key) => [
            "systemPromptCharacters",
            "instructionCount",
            "instructionCharacters",
        ].includes(key));
}

function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
    return isRecord(error) && error.code === "ENOENT";
}
