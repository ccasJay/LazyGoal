import { Environment } from "nunjucks";
import type { ILoader } from "nunjucks";

import { stableJson } from "../../../context-budget/src/index";

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
