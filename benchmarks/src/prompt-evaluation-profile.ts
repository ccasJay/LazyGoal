import { createHash } from "node:crypto";

import type { AgentProfile } from "../../packages/runtime/src/agent-profile.js";
import type { PromptEvaluationCandidate } from "./prompt-evaluation-protocol.js";

/** 候选 Prompt 的可审计指纹与有界摘要。 */
export interface PromptEvaluationPromptFingerprint {
    /** 对规范化 Prompt JSON 计算的十六进制 SHA-256。 */
    readonly promptSha256: string;
    /** 不重复保存 Prompt 原文的长度摘要。 */
    readonly promptSummary: {
        readonly systemPromptCharacters: number;
        readonly instructionCount: number;
        readonly instructionCharacters: number;
    };
}

/** 候选 Profile 派生或跨进程校验错误码。 */
export type PromptEvaluationProfileErrorCode =
    | "BASE_PROFILE_MISMATCH"
    | "INVALID_PROMPT"
    | "FROZEN_FIELD_CHANGED"
    | "INVALID_PROFILE";

/**
 * 候选 Profile 违反 Prompt-only 边界时抛出的稳定错误。
 *
 * @example
 * ```ts
 * try {
 *   derivePromptEvaluationProfile(base, candidate);
 * } catch (error) {
 *   if (error instanceof PromptEvaluationProfileError) console.error(error.field);
 * }
 * ```
 */
export class PromptEvaluationProfileError extends Error {
    readonly name = "PromptEvaluationProfileError";

    constructor(
        readonly code: PromptEvaluationProfileErrorCode,
        readonly field: string,
        message: string,
    ) {
        super(message);
    }
}

/**
 * 从 benchmark 基准 Profile 派生只改变 Prompt 文本的候选 Profile。
 *
 * @remarks
 * 返回值与嵌套数组都被冻结。Profile 身份、展示元数据和 Tool 白名单直接复制
 * 自基准 Profile；调用方不能通过候选请求覆盖这些字段。
 *
 * @param baseProfile - benchmark 已校验的基准 Profile。
 * @param candidate - 只包含候选身份和 Prompt 文本的协议对象。
 * @returns 可冻结到新 Goal 的独立 Profile。
 * @throws 基准标识不匹配或 Prompt 字段无效时抛出稳定字段错误。
 * @example
 * ```ts
 * const profile = derivePromptEvaluationProfile(base, {
 *   id: "candidate-1",
 *   baseProfileId: base.id,
 *   systemPrompt: "Solve carefully.",
 *   instructions: ["Use authorized tools."],
 * });
 * ```
 */
export function derivePromptEvaluationProfile(
    baseProfile: AgentProfile,
    candidate: PromptEvaluationCandidate,
): AgentProfile {
    validateBaseProfile(baseProfile);
    if (candidate.baseProfileId !== baseProfile.id) {
        throw new PromptEvaluationProfileError(
            "BASE_PROFILE_MISMATCH",
            "candidate.baseProfileId",
            `Candidate baseProfileId must be ${baseProfile.id}`,
        );
    }
    const systemPrompt = requirePromptText(candidate.systemPrompt, "candidate.systemPrompt");
    const instructions = requireInstructions(candidate.instructions, "candidate.instructions");
    return freezeProfile({
        id: baseProfile.id,
        ...(baseProfile.name === undefined ? {} : { name: baseProfile.name }),
        ...(baseProfile.description === undefined ? {} : { description: baseProfile.description }),
        systemPrompt,
        instructions,
        toolIds: [...baseProfile.toolIds],
    });
}

/**
 * 在 Worker wire boundary 重验候选 Profile 与基准 Profile 的冻结字段。
 *
 * @param value - ACP metadata 中反序列化得到的未知 Profile。
 * @param baseProfile - Worker 内置并受信任的 benchmark 基准 Profile。
 * @returns 深冻结的候选 Profile；仅 Prompt 字段可以不同。
 * @throws 结构无效或任何冻结字段变化时抛出稳定错误。
 * @example
 * ```ts
 * const profile = validatePromptEvaluationProfile(metadata.profile, workerBaseProfile);
 * ```
 */
export function validatePromptEvaluationProfile(
    value: unknown,
    baseProfile: AgentProfile,
): AgentProfile {
    validateBaseProfile(baseProfile);
    if (!isRecord(value)) {
        throw new PromptEvaluationProfileError(
            "INVALID_PROFILE",
            "profile",
            "Candidate Profile must be an object",
        );
    }
    const allowedKeys = new Set(["id", "name", "description", "systemPrompt", "instructions", "toolIds"]);
    for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
            throw new PromptEvaluationProfileError(
                "INVALID_PROFILE",
                `profile.${key}`,
                `Candidate Profile contains unknown field: ${key}`,
            );
        }
    }

    assertFrozenValue(value.id, baseProfile.id, "profile.id");
    assertFrozenValue(value.name, baseProfile.name, "profile.name");
    assertFrozenValue(value.description, baseProfile.description, "profile.description");
    if (!isStringArray(value.toolIds) || !sameStrings(value.toolIds, baseProfile.toolIds)) {
        throw new PromptEvaluationProfileError(
            "FROZEN_FIELD_CHANGED",
            "profile.toolIds",
            "Candidate Profile toolIds must match the benchmark base Profile",
        );
    }

    return freezeProfile({
        id: baseProfile.id,
        ...(baseProfile.name === undefined ? {} : { name: baseProfile.name }),
        ...(baseProfile.description === undefined ? {} : { description: baseProfile.description }),
        systemPrompt: requirePromptText(value.systemPrompt, "profile.systemPrompt"),
        instructions: requireInstructions(value.instructions, "profile.instructions"),
        toolIds: [...baseProfile.toolIds],
    });
}

/**
 * 为候选 Prompt 计算跨进程稳定的哈希和内容长度摘要。
 *
 * @remarks
 * 哈希输入固定为 UTF-8 JSON，键顺序为 `systemPrompt` 后 `instructions`。
 *
 * @param prompt - 只读取 Prompt 文本的对象。
 * @returns SHA-256 与不含原文的长度摘要。
 * @example
 * ```ts
 * const fingerprint = fingerprintPromptEvaluationCandidate(candidate);
 * ```
 */
export function fingerprintPromptEvaluationCandidate(
    prompt: Pick<PromptEvaluationCandidate, "systemPrompt" | "instructions">,
): PromptEvaluationPromptFingerprint {
    const systemPrompt = requirePromptText(prompt.systemPrompt, "candidate.systemPrompt");
    const instructions = requireInstructions(prompt.instructions, "candidate.instructions");
    const canonical = JSON.stringify({ systemPrompt, instructions });
    return Object.freeze({
        promptSha256: createHash("sha256").update(canonical, "utf8").digest("hex"),
        promptSummary: Object.freeze({
            systemPromptCharacters: systemPrompt.length,
            instructionCount: instructions.length,
            instructionCharacters: instructions.reduce((total, instruction) => total + instruction.length, 0),
        }),
    });
}

function validateBaseProfile(profile: AgentProfile): void {
    if (typeof profile.id !== "string" || profile.id.trim() === "") {
        throw new PromptEvaluationProfileError("INVALID_PROFILE", "baseProfile.id", "Base Profile id is invalid");
    }
    requirePromptText(profile.systemPrompt, "baseProfile.systemPrompt");
    requireInstructions(profile.instructions, "baseProfile.instructions");
    if (!isStringArray(profile.toolIds)) {
        throw new PromptEvaluationProfileError(
            "INVALID_PROFILE",
            "baseProfile.toolIds",
            "Base Profile toolIds must be a string array",
        );
    }
}

function requirePromptText(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new PromptEvaluationProfileError("INVALID_PROMPT", field, `${field} must be a non-empty string`);
    }
    return value;
}

function requireInstructions(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new PromptEvaluationProfileError("INVALID_PROMPT", field, `${field} must be a non-empty string array`);
    }
    return value.map((instruction, index) => requirePromptText(instruction, `${field}[${index}]`));
}

function freezeProfile(profile: AgentProfile): AgentProfile {
    return Object.freeze({
        ...profile,
        instructions: Object.freeze([...profile.instructions]),
        toolIds: Object.freeze([...profile.toolIds]),
    });
}

function assertFrozenValue(actual: unknown, expected: unknown, field: string): void {
    if (actual !== expected) {
        throw new PromptEvaluationProfileError(
            "FROZEN_FIELD_CHANGED",
            field,
            `${field} must match the benchmark base Profile`,
        );
    }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isStringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
