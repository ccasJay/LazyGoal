import type { JsonValue } from "../../contracts/src/index";

/** JSON 文本提取失败原因；用于调用方区分空响应、正文夹带与语法错误。 */
export type JsonTextFailure = "empty" | "not_json" | "invalid_syntax";

/**
 * 从模型文本中提取纯 JSON 正文。
 *
 * @remarks
 * 只接受纯裸 JSON 文本，或首尾由单个完整 ``` 或 ```json 代码块包裹的文本。
 * 混杂自然语言的前后正文与残缺代码块一律拒绝，不猜测模型意图。
 *
 * @param content - 原始模型输出文本。
 * @returns 去除代码块包裹后的 JSON 正文；不符合提取规则时返回 `undefined`。
 *
 * @example
 * ```ts
 * const payload = extractJsonText('```json\n{"result":{}}\n```');
 * ```
 */
export function extractJsonText(content: string): string | undefined {
    const trimmed = content.trim();
    if (trimmed.length === 0) return undefined;
    const match = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/iu.exec(trimmed);
    if (match !== null) {
        const inside = match[1]?.trim() ?? "";
        return inside.length === 0 ? undefined : inside;
    }
    if (trimmed.includes("```")) return undefined;
    return trimmed;
}

/**
 * 修复常见的非严格 JSON 文本。
 *
 * @remarks
 * 只做无语义歧义的修复：去除零宽字符、BOM、行尾空白与对象/数组末尾多余逗号。
 * 不补齐缺失括号、不改写引号，也不猜测截断内容，避免把错误结构伪装成合法结果。
 *
 * @param payload - 已提取的 JSON 文本。
 * @returns 修复后的文本；无变化时返回同一内容。
 *
 * @example
 * ```ts
 * const repaired = repairJsonText('{"a":1,}');
 * ```
 */
export function repairJsonText(payload: string): string {
    return payload
        .replace(/^\uFEFF/u, "")
        .replace(/\u200B|\u200C|\u200D|\u2060/gu, "")
        .replace(/,\s*([}\]])/gu, "$1")
        .trim();
}

/**
 * 解析模型文本中的 JSON 值，并在语法失败时尝试无语义修复。
 *
 * @param content - 原始模型输出文本。
 * @returns 解析成功的 JSON 值，或稳定的失败原因。
 *
 * @example
 * ```ts
 * const result = parseJsonText('```json\n{"answer":"ok"}\n```');
 * if (result.ok) console.log(result.value);
 * ```
 */
export function parseJsonText(
    content: string,
): { readonly ok: true; readonly value: JsonValue } | { readonly ok: false; readonly reason: JsonTextFailure } {
    const payload = extractJsonText(content);
    if (payload === undefined) {
        return { ok: false, reason: content.trim().length === 0 ? "empty" : "not_json" };
    }
    const first = tryParse(payload);
    if (first !== undefined) return { ok: true, value: first };
    const repaired = repairJsonText(payload);
    if (repaired !== payload) {
        const second = tryParse(repaired);
        if (second !== undefined) return { ok: true, value: second };
    }
    return { ok: false, reason: "invalid_syntax" };
}

function tryParse(payload: string): JsonValue | undefined {
    try {
        return JSON.parse(payload) as JsonValue;
    } catch {
        return undefined;
    }
}
