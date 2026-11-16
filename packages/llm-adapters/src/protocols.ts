import { LLMConfigurationError, type ProtocolId } from "../../llm-core/src/index";

/** Chat Completions 线格式的协议标识。 */
export const CHAT_COMPLETIONS_PROTOCOL = "chat-completions";

/** Anthropic Messages 线格式的协议标识。 */
export const ANTHROPIC_MESSAGES_PROTOCOL = "anthropic-messages";

/** Google GenerateContent 线格式的协议标识。 */
export const GOOGLE_GENERATE_CONTENT_PROTOCOL = "google-generate-content";

/**
 * 当前仓库已实现 wire 的协议标识。
 *
 * @remarks
 * 执行分发只接受这里的协议；新增 `wire-*` 包时在此登记，未登记的协议在
 * 选择适配器时明确失败，不回退到 Chat Completions 或其它翻译路径。
 */
export const IMPLEMENTED_PROTOCOLS: readonly ProtocolId[] = Object.freeze([
    CHAT_COMPLETIONS_PROTOCOL,
    ANTHROPIC_MESSAGES_PROTOCOL,
    GOOGLE_GENERATE_CONTENT_PROTOCOL,
]);

/**
 * 判定协议是否已有对应 wire 实现。
 *
 * @param protocol - 开放协议标识。
 * @returns 已登记实现时为 `true`。
 *
 * @example
 * ```ts
 * const ok = isProtocolImplemented("chat-completions");
 * ```
 */
export function isProtocolImplemented(protocol: ProtocolId): boolean {
    return IMPLEMENTED_PROTOCOLS.includes(protocol);
}

/**
 * 断言协议已实现；未实现时明确失败并指明缺失协议。
 *
 * @param protocol - 待执行模型声明的协议。
 * @throws LLMConfigurationError 协议没有对应 wire 实现时抛出。
 *
 * @example
 * ```ts
 * assertProtocolImplemented(declaration.protocol);
 * ```
 */
export function assertProtocolImplemented(protocol: ProtocolId): void {
    if (isProtocolImplemented(protocol)) return;
    throw new LLMConfigurationError(
        [],
        `Protocol "${protocol}" has no wire implementation; implemented protocols: ${IMPLEMENTED_PROTOCOLS.join(", ")}`,
    );
}
