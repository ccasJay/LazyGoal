import { Environment } from "nunjucks";
import type { ILoader } from "nunjucks";

/**
 * 把 CRLF/CR 统一转为 LF。
 *
 * @remarks
 * 模板源码与渲染结果都会经过该规范化，确保 system 消息不受运行平台换行差异影响，
 * 满足跨平台字符级一致的确定性要求。
 *
 * @param text - 可能包含 CRLF 或 CR 的文本。
 * @returns 仅含 LF 的文本。
 */
export function normalizeNewlines(text: string): string {
    return text.replace(/\r\n?/g, "\n");
}

/**
 * 按稳定代码单元顺序比较两个字符串。
 *
 * @remarks
 * 不使用受 locale 影响的 `localeCompare`，也不按 UTF-16 符号语言排序，
 * 而是逐字符比较 code unit 数值，保证跨环境结果一致。用于 `stableJson` 的键排序
 * 与 Authorized Tools 的 Tool ID 排序。
 */
export function compareCodeUnits(a: string, b: string): number {
    const length = Math.min(a.length, b.length);

    for (let i = 0; i < length; i += 1) {
        const left = a.charCodeAt(i);
        const right = b.charCodeAt(i);

        if (left !== right) {
            return left - right;
        }
    }

    return a.length - b.length;
}

/**
 * 递归把对象键按代码单元顺序排序；数组保持原顺序。
 *
 * @remarks
 * 仅重排对象键，不改变数组元素顺序，也不改变任何标量值。
 */
function sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortKeysDeep);
    }

    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};

        for (const key of Object.keys(record).sort(compareCodeUnits)) {
            sorted[key] = sortKeysDeep(record[key]);
        }

        return sorted;
    }

    return value;
}

/**
 * 同步 `stableJson` Nunjucks Filter。
 *
 * @remarks
 * 对象键按稳定代码单元顺序递归排序、数组保持原顺序，再用两空格缩进序列化，
 * 使相同数据始终产生相同 JSON 文本。空数组固定输出 `[]`。该 Filter 是 Prompt
 * 环境唯一允许的自定义 Filter，且必须是同步的。
 *
 * @param value - 需要序列化的运行时数据（如 ToolDefinition 或 inputSchema）。
 * @returns 两空格缩进、键序稳定的 JSON 字符串。
 */
export function stableJson(value: unknown): string {
    const serialized = JSON.stringify(sortKeysDeep(value), null, 2);

    return serialized === undefined ? "null" : serialized;
}

/**
 * 创建用于渲染 Prompt 的封闭 Nunjucks Environment。
 *
 * @remarks
 * 该 Environment 不共享任何全局状态，配置 `autoescape: false`（Prompt 是纯文本，
 * 避免 Profile 或 JSON 被转成 HTML entity）、`throwOnUndefined: true`（必需变量
 * 缺失立即失败）、`trimBlocks: true` 与 `lstripBlocks: true`（控制块换行确定）。
 * 除 `stableJson` 外不注册任何扩展，也不提供文件系统 Loader。
 *
 * @param loader - 只接受已注册模板 ID 的内存 Loader。
 * @returns 配置完成并注册 `stableJson` Filter 的独立 Environment。
 */
export function createPromptEnvironment(loader: ILoader): Environment {
    const environment = new Environment(loader, {
        autoescape: false,
        throwOnUndefined: true,
        trimBlocks: true,
        lstripBlocks: true,
    });

    environment.addFilter("stableJson", stableJson, false);

    return environment;
}
