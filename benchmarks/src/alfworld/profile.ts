import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { AgentProfile } from "../../../packages/runtime/src/index.js";

export const ALFWORLD_PROFILE_ID = "alfworld-profile";
export const ALFWORLD_PROFILE_RELATIVE_PATH = ".lazygoal/profile/alfworld-profile.json";
export const ALFWORLD_PROFILE_TOOL_IDS = [
    "read_file",
    "grep",
    "alfworld_reset",
    "alfworld_step",
] as const;

/**
 * 已加载并校验的 ALFWorld Profile。
 *
 * @remarks
 * `profile` 会被冻结到评测 Goal；`contentHash` 用于报告追踪，Profile 文件本身
 * 仍属于工作区配置，不会写入 Goal Snapshot。
 *
 * @example
 * ```ts
 * const loaded = await loadAlfworldProfile("/workspace/project");
 * console.log(loaded.profile.id, loaded.contentHash);
 * ```
 */
export interface LoadedAlfworldProfile {
    readonly profile: AgentProfile;
    readonly profilePath: string;
    readonly contentHash: string;
}

export type AlfworldProfileErrorCode =
    | "PROFILE_NOT_FOUND"
    | "PROFILE_INVALID_JSON"
    | "PROFILE_INVALID_SCHEMA"
    | "PROFILE_ID_MISMATCH"
    | "PROFILE_TOOL_ALLOWLIST";

/**
 * ALFWorld Profile 缺失或违反固定授权契约时抛出的错误。
 *
 * @example
 * ```ts
 * try {
 *   await loadAlfworldProfile("/workspace/project");
 * } catch (error) {
 *   if (error instanceof AlfworldProfileError) console.error(error.code);
 * }
 * ```
 */
export class AlfworldProfileError extends Error {
    readonly name = "AlfworldProfileError";

    constructor(
        readonly code: AlfworldProfileErrorCode,
        message: string,
    ) {
        super(message);
    }
}

/**
 * 校验 ALFWorld Profile 的 Schema、标识、指令和固定 Tool 白名单。
 *
 * @param value - 从 JSON 解析得到的未知对象。
 * @returns 可冻结到 Goal 的 AgentProfile。
 * @throws Profile 结构、ID、指令或 Tool 白名单不合法时抛出错误。
 * @example
 * ```ts
 * const profile = validateAlfworldProfile(jsonValue);
 * ```
 */
export function validateAlfworldProfile(value: unknown): AgentProfile {
    if (!isRecord(value)) {
        throw new AlfworldProfileError("PROFILE_INVALID_SCHEMA", "ALFWorld Profile must be an object");
    }
    const keys = Object.keys(value);
    const allowedKeys = new Set(["id", "systemPrompt", "instructions", "toolIds"]);
    if (keys.some((key) => !allowedKeys.has(key))) {
        throw new AlfworldProfileError("PROFILE_INVALID_SCHEMA", "ALFWorld Profile contains unknown fields");
    }
    if (value.id !== ALFWORLD_PROFILE_ID) {
        throw new AlfworldProfileError(
            "PROFILE_ID_MISMATCH",
            `ALFWorld Profile id must be ${ALFWORLD_PROFILE_ID}`,
        );
    }
    if (typeof value.systemPrompt !== "string" || value.systemPrompt.trim() === "") {
        throw new AlfworldProfileError("PROFILE_INVALID_SCHEMA", "ALFWorld systemPrompt must be non-empty");
    }
    if (!isStringArray(value.instructions) || value.instructions.length === 0) {
        throw new AlfworldProfileError("PROFILE_INVALID_SCHEMA", "ALFWorld instructions must be non-empty strings");
    }
    if (!isStringArray(value.toolIds)) {
        throw new AlfworldProfileError("PROFILE_TOOL_ALLOWLIST", "ALFWorld toolIds must be an array of strings");
    }
    if (
        value.toolIds.length !== ALFWORLD_PROFILE_TOOL_IDS.length
        || value.toolIds.some((toolId, index) => toolId !== ALFWORLD_PROFILE_TOOL_IDS[index])
    ) {
        throw new AlfworldProfileError(
            "PROFILE_TOOL_ALLOWLIST",
            `ALFWorld toolIds must be exactly ${ALFWORLD_PROFILE_TOOL_IDS.join(", ")}`,
        );
    }
    const instructionText = value.instructions.join("\n");
    if (
        !instructionText.includes("alfworld_reset")
        || !instructionText.includes("alfworld_step")
        || !/bash/i.test(instructionText)
        || !/won\s*=\s*true/i.test(instructionText)
    ) {
        throw new AlfworldProfileError(
            "PROFILE_INVALID_SCHEMA",
            "ALFWorld instructions must require reset, one-step commands, no Bash and won=true completion",
        );
    }

    return {
        id: value.id,
        systemPrompt: value.systemPrompt,
        instructions: [...value.instructions],
        toolIds: [...value.toolIds],
    };
}

/**
 * 从 workspace 的 `.lazygoal/profile` 加载固定 ALFWorld Profile。
 *
 * @param workspaceRoot - workspace 绝对或相对根目录。
 * @returns Profile、绝对文件路径和内容哈希。
 * @throws 文件缺失、JSON 损坏或 Profile 契约不合法时抛出 `AlfworldProfileError`。
 * @example
 * ```ts
 * const loaded = await loadAlfworldProfile(process.cwd());
 * ```
 */
export async function loadAlfworldProfile(
    workspaceRoot: string,
): Promise<LoadedAlfworldProfile> {
    const profilePath = join(resolve(workspaceRoot), ALFWORLD_PROFILE_RELATIVE_PATH);
    let content: string;
    try {
        content = await readFile(profilePath, "utf8");
    } catch (error: unknown) {
        throw new AlfworldProfileError(
            "PROFILE_NOT_FOUND",
            `ALFWorld Profile is not readable: ${profilePath}`,
        );
    }

    let value: unknown;
    try {
        value = JSON.parse(content);
    } catch (error: unknown) {
        throw new AlfworldProfileError(
            "PROFILE_INVALID_JSON",
            `ALFWorld Profile JSON is invalid: ${profilePath}`,
        );
    }
    const profile = validateAlfworldProfile(value);
    return {
        profile,
        profilePath,
        contentHash: createHash("sha256").update(content, "utf8").digest("hex"),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
