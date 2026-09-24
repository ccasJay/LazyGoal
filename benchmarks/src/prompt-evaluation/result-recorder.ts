import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
    PROMPT_EVALUATION_PROTOCOL,
    type PromptEvaluationArtifactLocator,
    type PromptEvaluationResultV1,
    type PromptEvaluationTaskResult,
} from "./protocol.js";

/**
 * 以临时文件和 rename 原子发布一次 Prompt Evaluation 汇总。
 *
 * @remarks
 * Recorder 只接受同一 `evaluationId` 的完整结果，且不会读取 JSON Lines 进度来
 * 补全任务事实。重复提交会完整替换同一结果文件。
 *
 * @example
 * ```ts
 * const recorder = new PromptEvaluationResultRecorder("/tmp/evaluations/eval-1");
 * await recorder.commit(result);
 * ```
 */
export class PromptEvaluationResultRecorder {
    readonly path: string;
    private readonly evaluationId: string;

    /**
     * @param evaluationDirectory - 当前评测独占目录。
     * @param fileName - 结果文件名，默认 `result.json`。
     */
    constructor(evaluationDirectory: string, fileName = "result.json") {
        if (fileName.trim() === "" || fileName.includes("/") || fileName.includes("\\")) {
            throw new TypeError("Prompt Evaluation result fileName is invalid");
        }
        const directory = resolve(evaluationDirectory);
        this.evaluationId = directory.split(/[\\/]/u).at(-1) ?? "";
        if (this.evaluationId === "") throw new TypeError("Prompt Evaluation directory is invalid");
        this.path = join(directory, fileName);
    }

    /**
     * @param result - 当前评测的完整汇总。
     * @returns 已发布结果的绝对路径。
     * @throws 持久化结构无效、评测 ID 与目录不一致或文件发布失败时抛出。
     */
    async commit(result: PromptEvaluationResultV1): Promise<string> {
        const parsed = parsePromptEvaluationResult(result);
        if (parsed.evaluationId !== this.evaluationId) {
            throw new TypeError("Prompt Evaluation result identity does not match its directory");
        }
        await atomicWrite(this.path, parsed);
        return this.path;
    }
}

/**
 * 从持久化文件读取并严格校验 Prompt Evaluation 汇总。
 *
 * @param path - `result.json` 的路径。
 * @returns 当前版本的完整结果。
 * @throws 文件、JSON 或持久化结构无效时抛出。
 * @example
 * ```ts
 * const result = await readPromptEvaluationResult("/tmp/eval-1/result.json");
 * ```
 */
export async function readPromptEvaluationResult(path: string): Promise<PromptEvaluationResultV1> {
    const value: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
    return parsePromptEvaluationResult(value);
}

/** 对任意 JSON 值执行 Prompt Evaluation 汇总持久化边界校验。 */
export function parsePromptEvaluationResult(value: unknown): PromptEvaluationResultV1 {
    if (!isRecord(value)
        || value.protocol !== PROMPT_EVALUATION_PROTOCOL
        || !isNonEmptyString(value.evaluationId)
        || !isEvaluationStatus(value.status)
        || !isNonEmptyString(value.benchmarkId)
        || !isNonEmptyString(value.manifestPath)
        || !isNonEmptyString(value.candidateId)
        || !isNonEmptyString(value.baseProfileId)
        || typeof value.promptSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.promptSha256)
        || !isPromptSummary(value.promptSummary)
        || !isNonEmptyString(value.modelConfigId)
        || !isNonEmptyString(value.modelId)
        || typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt))
        || !Array.isArray(value.tasks)) {
        throw new TypeError("Invalid PromptEvaluationResultV1");
    }
    const tasks = value.tasks.map(parseTaskResult);
    return {
        protocol: PROMPT_EVALUATION_PROTOCOL,
        evaluationId: value.evaluationId,
        status: value.status,
        benchmarkId: value.benchmarkId,
        manifestPath: value.manifestPath,
        candidateId: value.candidateId,
        baseProfileId: value.baseProfileId,
        promptSha256: value.promptSha256,
        promptSummary: value.promptSummary,
        modelConfigId: value.modelConfigId,
        modelId: value.modelId,
        generatedAt: value.generatedAt,
        tasks,
    };
}

function parseTaskResult(value: unknown): PromptEvaluationTaskResult {
    if (!isRecord(value)
        || !isNonEmptyString(value.taskId)
        || !isTaskStatus(value.status)
        || (value.attemptPath !== null && !isNonEmptyString(value.attemptPath))
        || !isArtifactLocator(value.artifactLocator)
        || !Array.isArray(value.errors)
        || value.domainResult === undefined
        || (value.metricScore !== undefined
            && (typeof value.metricScore !== "number" || !Number.isFinite(value.metricScore)))
        || (value.metricScore !== undefined && value.domainResult === null)
        || ((value.status === "infrastructure_error" || value.status === "cancelled")
            && value.metricScore !== undefined)
        || ((value.status === "infrastructure_error" || value.status === "cancelled")
            && value.domainResult !== null)) {
        throw new TypeError("Invalid PromptEvaluationTaskResult");
    }
    const errors = value.errors.map((error) => {
        if (!isRecord(error)
            || !isNonEmptyString(error.stage)
            || !isNonEmptyString(error.message)
            || (error.code !== undefined && !isNonEmptyString(error.code))) {
            throw new TypeError("Invalid Prompt Evaluation task error");
        }
        return {
            stage: error.stage,
            message: error.message,
            ...(error.code === undefined ? {} : { code: error.code }),
        };
    });
    return {
        taskId: value.taskId,
        status: value.status,
        domainResult: value.domainResult,
        ...(value.metricScore === undefined ? {} : { metricScore: value.metricScore }),
        attemptPath: value.attemptPath,
        artifactLocator: value.artifactLocator,
        errors,
    };
}

async function atomicWrite(path: string, result: PromptEvaluationResultV1): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, `${JSON.stringify(result)}\n`, "utf8");
        await rename(temporary, path);
    } catch (error: unknown) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
    }
}

function isPromptSummary(value: unknown): value is PromptEvaluationResultV1["promptSummary"] {
    return isRecord(value)
        && isNonNegativeInteger(value.systemPromptCharacters)
        && isNonNegativeInteger(value.instructionCount)
        && isNonNegativeInteger(value.instructionCharacters);
}

function isArtifactLocator(value: unknown): value is PromptEvaluationArtifactLocator | null {
    if (value === null) return true;
    return isRecord(value)
        && typeof value.goalSnapshot === "string"
        && typeof value.trajectory === "string"
        && (value.diagnosticTrace === undefined || typeof value.diagnosticTrace === "string");
}

function isEvaluationStatus(value: unknown): value is PromptEvaluationResultV1["status"] {
    return value === "completed" || value === "infrastructure_error" || value === "cancelled";
}

function isTaskStatus(value: unknown): value is PromptEvaluationTaskResult["status"] {
    return value === "passed" || value === "failed" || value === "infrastructure_error" || value === "cancelled";
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
