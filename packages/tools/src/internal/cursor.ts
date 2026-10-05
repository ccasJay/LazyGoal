import { createHash } from "node:crypto";

/**
 * 计算任意 JSON 结构可规范化的 sha256 摘要（hex 字符串）。
 *
 * @param value - 参与哈希计算的对象或基元。
 * @returns 64 位十六进制哈希字符串。
 */
export function computeCanonicalDigest(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
    if (value === null || typeof value !== "object") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
        const val = record[key];
        if (val !== undefined) {
            result[key] = canonicalize(val);
        }
    }
    return result;
}

/**
 * 将任意结构编码为 URL 安全的 base64 字符串（base64url）。
 *
 * @param payload - 待编码的可序列化数据。
 * @returns base64url 格式字符串。
 */
export function encodeCursor<T>(payload: T): string {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * 解码并校验 base64url 游标。
 *
 * @param cursor - 用户或模型传入的 base64url 字符串。
 * @param expectedToolId - 期望绑定的工具 ID。
 * @param expectedQueryDigest - 期望绑定的查询摘要。
 * @returns 解码后的游标数据；若校验失败（损坏、工具不符、查询不符）返回 undefined。
 */
export function decodeAndValidateCursor<T extends { toolId: string; queryDigest: string }>(
    cursor: string,
    expectedToolId: string,
    expectedQueryDigest: string,
): T | undefined {
    if (typeof cursor !== "string" || cursor.trim() === "" || cursor.length > 8192) {
        return undefined;
    }
    try {
        const json = Buffer.from(cursor, "base64url").toString("utf8");
        const parsed = JSON.parse(json) as unknown;
        if (
            parsed !== null
            && typeof parsed === "object"
            && (parsed as any).toolId === expectedToolId
            && (parsed as any).queryDigest === expectedQueryDigest
        ) {
            return parsed as T;
        }
        return undefined;
    } catch {
        return undefined;
    }
}
