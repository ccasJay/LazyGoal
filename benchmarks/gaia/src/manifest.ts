import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { GaiaLevel, GaiaManifest, GaiaManifestTask, GaiaSplit } from "./types";

/** GAIA 清单校验错误类型码。 */
export type GaiaManifestValidationErrorCode =
    | "INVALID_FORMAT"
    | "INVALID_SOURCE"
    | "INVALID_DATA_ROOT"
    | "EMPTY_TASKS"
    | "DUPLICATE_TASK_ID"
    | "INVALID_TASK"
    | "INVALID_LEVEL"
    | "INVALID_SPLIT"
    | "TASK_NOT_FOUND"
    | "SINGLE_TASK_REQUIRED"
    | "UNSUPPORTED_SINGLE_TASK"
    | "DATA_ROOT_NOT_FOUND"
    | "OUTPUT_PATH_INVALID";

/**
 * GAIA 清单校验错误。
 *
 * @example
 * ```ts
 * throw new GaiaManifestValidationError("INVALID_FORMAT", "Manifest must be an object");
 * ```
 */
export class GaiaManifestValidationError extends Error {
    readonly name = "GaiaManifestValidationError";

    constructor(
        readonly code: GaiaManifestValidationErrorCode,
        message: string,
    ) {
        super(message);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLevel(value: unknown): GaiaLevel {
    if (value === 1 || value === 2 || value === 3) {
        return value;
    }
    throw new GaiaManifestValidationError("INVALID_LEVEL", `Invalid GAIA level: ${String(value)}`);
}

function parseSplit(value: unknown): GaiaSplit {
    if (value === "validation" || value === "test") {
        return value;
    }
    throw new GaiaManifestValidationError("INVALID_SPLIT", `Invalid GAIA split: ${String(value)}`);
}

function parseTask(value: unknown, index: number): GaiaManifestTask {
    if (!isRecord(value)) {
        throw new GaiaManifestValidationError(
            "INVALID_TASK",
            `GAIA task at index ${index} must be an object`,
        );
    }

    if (typeof value.taskId !== "string" || value.taskId.trim().length === 0) {
        throw new GaiaManifestValidationError(
            "INVALID_TASK",
            `GAIA task at index ${index} taskId must be a non-empty string`,
        );
    }

    if (typeof value.question !== "string" || value.question.trim().length === 0) {
        throw new GaiaManifestValidationError(
            "INVALID_TASK",
            `GAIA task ${value.taskId} question must be a non-empty string`,
        );
    }

    const level = parseLevel(value.level);
    const split = parseSplit(value.split);

    let expectedAnswer: string | null = null;
    if (split === "test") {
        expectedAnswer = null;
    } else {
        if (typeof value.expectedAnswer === "string") {
            expectedAnswer = value.expectedAnswer;
        } else if (value.expectedAnswer === null || value.expectedAnswer === undefined) {
            expectedAnswer = null;
        } else {
            throw new GaiaManifestValidationError(
                "INVALID_TASK",
                `GAIA task ${value.taskId} expectedAnswer must be string or null`,
            );
        }
    }

    const rawAttachments = Array.isArray(value.attachments) ? value.attachments : [];
    const attachments: string[] = [];
    for (const att of rawAttachments) {
        if (typeof att !== "string" || att.trim().length === 0) {
            throw new GaiaManifestValidationError(
                "INVALID_TASK",
                `GAIA task ${value.taskId} attachment must be a non-empty relative path`,
            );
        }
        const normalized = att.replaceAll("\\", "/").trim();
        if (normalized.startsWith("/") || normalized.includes("..")) {
            throw new GaiaManifestValidationError(
                "INVALID_TASK",
                `GAIA task ${value.taskId} attachment path must be relative and cannot escape: ${att}`,
            );
        }
        attachments.push(normalized);
    }

    return {
        taskId: value.taskId.trim(),
        question: value.question,
        expectedAnswer,
        level,
        split,
        attachments: Object.freeze(attachments),
    };
}

/**
 * 校验并标准化 GAIA 任务清单。
 *
 * @param value - 待验证的原始 JSON 反序列化数据。
 * @returns 规范化的 GaiaManifest 结构。
 * @throws 结构不合法、字段缺失或任务 ID 重复时抛出 `GaiaManifestValidationError`。
 *
 * @example
 * ```ts
 * const manifest = validateGaiaManifest(rawJson);
 * ```
 */
export function validateGaiaManifest(value: unknown): GaiaManifest {
    if (!isRecord(value)) {
        throw new GaiaManifestValidationError("INVALID_FORMAT", "GAIA manifest must be an object");
    }

    if (value.source !== "huggingface") {
        throw new GaiaManifestValidationError(
            "INVALID_SOURCE",
            `GAIA manifest source must be 'huggingface', got: ${String(value.source)}`,
        );
    }

    if (
        typeof value.dataRoot !== "string"
        || value.dataRoot.trim().length === 0
        || !isAbsolute(value.dataRoot.trim())
    ) {
        throw new GaiaManifestValidationError(
            "INVALID_DATA_ROOT",
            "GAIA manifest dataRoot must be a non-empty absolute path",
        );
    }

    if (typeof value.loadedAt !== "string" || Number.isNaN(Date.parse(value.loadedAt))) {
        throw new GaiaManifestValidationError(
            "INVALID_FORMAT",
            "GAIA manifest loadedAt must be a valid ISO 8601 string",
        );
    }

    if (!Array.isArray(value.tasks)) {
        throw new GaiaManifestValidationError("INVALID_FORMAT", "GAIA manifest tasks must be an array");
    }

    if (value.tasks.length === 0) {
        throw new GaiaManifestValidationError("EMPTY_TASKS", "GAIA manifest tasks must not be empty");
    }

    const seenIds = new Set<string>();
    const tasks: GaiaManifestTask[] = [];

    for (let i = 0; i < value.tasks.length; i++) {
        const task = parseTask(value.tasks[i], i);
        if (seenIds.has(task.taskId)) {
            throw new GaiaManifestValidationError(
                "DUPLICATE_TASK_ID",
                `Duplicate GAIA taskId: ${task.taskId}`,
            );
        }
        seenIds.add(task.taskId);
        tasks.push(task);
    }

    return {
        source: "huggingface",
        loadedAt: value.loadedAt,
        dataRoot: value.dataRoot,
        tasks: Object.freeze(tasks),
    };
}

/**
 * 从本地文件加载并校验 GAIA 清单。
 *
 * @param manifestPath - 清单文件绝对路径。
 * @returns 校验通过的 GaiaManifest。
 * @throws 文件读取失败或内容校验失败时抛出异常。
 *
 * @example
 * ```ts
 * const manifest = await loadGaiaManifest("/path/to/manifest.json");
 * ```
 */
export async function loadGaiaManifest(manifestPath: string): Promise<GaiaManifest> {
    const content = await readFile(manifestPath, "utf8");
    let json: unknown;
    try {
        json = JSON.parse(content);
    } catch (err) {
        throw new GaiaManifestValidationError(
            "INVALID_FORMAT",
            `Failed to parse GAIA manifest JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    return validateGaiaManifest(json);
}

/**
 * 将 GAIA 清单序列化并写入指定文件。
 *
 * @param manifestPath - 目标写入路径。
 * @param manifest - 清单对象。
 *
 * @example
 * ```ts
 * await saveGaiaManifest("/path/to/manifest.json", manifest);
 * ```
 */
export async function saveGaiaManifest(
    manifestPath: string,
    manifest: GaiaManifest,
): Promise<void> {
    const validated = validateGaiaManifest(manifest);
    const content = JSON.stringify(validated, null, 2) + "\n";
    await writeFile(manifestPath, content, "utf8");
}
