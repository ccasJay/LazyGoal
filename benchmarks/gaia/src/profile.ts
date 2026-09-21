import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { AgentProfile } from "../../../packages/runtime/src/index.js";

/** GAIA Worker 只允许使用的结构化输出模式。 */
export const GAIA_STRUCTURED_OUTPUT_MODE = "strict" as const;

/** GAIA Worker 支持且仅支持的四个工具 ID 列表。 */
export const GAIA_PROFILE_TOOL_IDS = Object.freeze([
    "read_file",
    "web_search",
    "web_fetch",
    "submit_answer",
] as const);

/** GAIA Worker 容器内固定的 Agent Profile。 */
export const GAIA_WORKER_PROFILE: AgentProfile = Object.freeze({
    id: "gaia-worker-profile",
    name: "GAIA QA evaluation agent",
    description: "Container profile for GAIA question answering evaluation.",
    systemPrompt: "You are an AI assistant solving a GAIA benchmark question. Read question.txt using its workspace-relative path (do not prefix it with /workspace), use available tools (read_file, web_search, web_fetch) to research facts, and call submit_answer exactly once with your final answer.",
    instructions: Object.freeze([
        "Inspect question.txt, files, and attachments in the workspace using read_file with workspace-relative paths.",
        "Search information online using web_search and web_fetch.",
        "Submit your final answer using submit_answer as soon as you have found the answer.",
        "You may call submit_answer only once. After submitting, your task is completed.",
    ]),
    toolIds: GAIA_PROFILE_TOOL_IDS,
});

/** 写入磁盘的 GAIA Profile JSON 结构。 */
export interface GaiaWorkerProfileDocument {
    /** 当前 Profile 文件格式版本。 */
    readonly schemaVersion: 1;
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly systemPrompt: string;
    readonly instructions: readonly string[];
    readonly toolIds: readonly string[];
}

/** GAIA Profile 物化或加载失败时的稳定错误。 */
export class GaiaProfileValidationError extends Error {
    readonly name = "GaiaProfileValidationError";

    constructor(
        readonly code: "INVALID_FORMAT" | "PROFILE_DRIFT" | "IO_ERROR",
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
    }
}

/**
 * 将 Worker 内置 Profile 转换成 GEPA Profile JSON 文档。
 *
 * @returns 与 `GAIA_WORKER_PROFILE` 完全一致且包含当前文件格式版本的文档。
 *
 * @example
 * ```ts
 * const document = toGaiaWorkerProfileDocument();
 * console.log(document.id); // gaia-worker-profile
 * ```
 */
export function toGaiaWorkerProfileDocument(): GaiaWorkerProfileDocument {
    return {
        schemaVersion: 1,
        id: GAIA_WORKER_PROFILE.id,
        name: GAIA_WORKER_PROFILE.name ?? "",
        description: GAIA_WORKER_PROFILE.description ?? "",
        systemPrompt: GAIA_WORKER_PROFILE.systemPrompt,
        instructions: [...GAIA_WORKER_PROFILE.instructions],
        toolIds: [...GAIA_WORKER_PROFILE.toolIds],
    };
}

/**
 * 校验从磁盘或 wire boundary 读取的 GAIA Profile 文档。
 *
 * @param value - JSON 反序列化后的未知值。
 * @returns 与 Worker 内置 Profile 语义一致的冻结 Profile。
 * @throws 文档结构错误或任一冻结字段漂移时抛出 `GaiaProfileValidationError`。
 *
 * @example
 * ```ts
 * const profile = validateGaiaWorkerProfileDocument(JSON.parse(json));
 * ```
 */
export function validateGaiaWorkerProfileDocument(value: unknown): AgentProfile {
    if (!isRecord(value)) {
        throw new GaiaProfileValidationError("INVALID_FORMAT", "GAIA Profile must be an object");
    }
    const allowed = new Set([
        "schemaVersion",
        "id",
        "name",
        "description",
        "systemPrompt",
        "instructions",
        "toolIds",
    ]);
    const unknown = Object.keys(value).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
        throw new GaiaProfileValidationError(
            "INVALID_FORMAT",
            `GAIA Profile contains unknown fields: ${unknown.join(", ")}`,
        );
    }
    const expected = toGaiaWorkerProfileDocument();
    if (value.schemaVersion !== expected.schemaVersion) {
        throw new GaiaProfileValidationError("INVALID_FORMAT", "GAIA Profile schemaVersion is unsupported");
    }
    if (value.id !== expected.id
        || value.name !== expected.name
        || value.description !== expected.description
        || value.systemPrompt !== expected.systemPrompt
        || !sameStrings(value.instructions, expected.instructions)
        || !sameStrings(value.toolIds, expected.toolIds)) {
        throw new GaiaProfileValidationError(
            "PROFILE_DRIFT",
            "GAIA Profile does not match the Worker source Profile",
        );
    }
    return GAIA_WORKER_PROFILE;
}

/**
 * 从标准 Profile JSON 加载并校验 GAIA Worker Profile。
 *
 * @param profilePath - Profile JSON 文件路径。
 * @returns 与 Worker 内置 Profile 一致的冻结 Profile。
 * @throws 文件读取、JSON 解析或字段漂移时抛出 `GaiaProfileValidationError`。
 *
 * @example
 * ```ts
 * const profile = await loadGaiaWorkerProfile("/tmp/gaia/profile.json");
 * ```
 */
export async function loadGaiaWorkerProfile(profilePath: string): Promise<AgentProfile> {
    const resolvedPath = resolve(profilePath);
    let raw: string;
    try {
        raw = await readFile(resolvedPath, "utf8");
    } catch (error) {
        throw new GaiaProfileValidationError(
            "IO_ERROR",
            `Could not read GAIA Profile: ${resolvedPath}`,
            { cause: error },
        );
    }
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch (error) {
        throw new GaiaProfileValidationError(
            "INVALID_FORMAT",
            `GAIA Profile is not valid JSON: ${resolvedPath}`,
            { cause: error },
        );
    }
    return validateGaiaWorkerProfileDocument(value);
}

/**
 * 原子物化 GAIA Worker Profile 到指定 JSON 文件。
 *
 * @param profilePath - 要写入的 Profile JSON 路径。
 * @returns 实际写入的绝对路径。
 * @throws 目标目录或临时文件写入失败时抛出 `GaiaProfileValidationError`。
 *
 * @example
 * ```ts
 * const path = await materializeGaiaWorkerProfile("/tmp/gaia/profile.json");
 * ```
 */
export async function materializeGaiaWorkerProfile(profilePath: string): Promise<string> {
    const resolvedPath = resolve(profilePath);
    const temporaryPath = `${resolvedPath}.tmp-${randomUUID()}`;
    try {
        await mkdir(dirname(resolvedPath), { recursive: true });
        await writeFile(
            temporaryPath,
            `${JSON.stringify(toGaiaWorkerProfileDocument(), null, 2)}\n`,
            { encoding: "utf8", flag: "wx" },
        );
        await rename(temporaryPath, resolvedPath);
        return resolvedPath;
    } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => {});
        throw new GaiaProfileValidationError(
            "IO_ERROR",
            `Could not materialize GAIA Profile: ${resolvedPath}`,
            { cause: error },
        );
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameStrings(left: unknown, right: readonly string[]): boolean {
    return Array.isArray(left)
        && left.length === right.length
        && left.every((value, index) => value === right[index]);
}
