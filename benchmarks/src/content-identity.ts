import { createHash } from "node:crypto";
/** 内容身份使用实际字节；不以 Git HEAD 替代工作树。 */
export function digest(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
/** 确定性 JSON 身份；数组顺序保留，对象键排序。 */
export function identity(value: unknown): string { return digest(canonical(value)); }
function canonical(value: unknown): string {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value !== null && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
    return JSON.stringify(value);
}
