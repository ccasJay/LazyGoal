import assert from "node:assert/strict";
import { test } from "node:test";

import {
    AnthropicMessagesAdapter,
    ChatCompletionsAdapter,
    IMPLEMENTED_PROTOCOLS,
    createAnthropicAdapter,
    createDefaultProviderRegistry,
    createGoogleAdapter,
    createOpenAICompatibleAdapter,
    createOpenAIAdapter,
    createOpenCodeGoAdapter,
    createOpenRouterAdapter,
    createDeepSeekAdapter,
    isProtocolImplemented,
    type ProviderAdapterDefinition,
} from "../src/index";
import { Gemini } from "../../llm-google/src/index";
import type { LLMConfig } from "../../llm-core/src/index";

/**
 * 迁移前登记的每家供应商的最小可构造连接；矩阵要求逐项可构造且协议可分发。
 *
 * @remarks
 * `protocol` 是适配器声明的线格式；单测断言它属于已实现集合，且实际构造出的
 * 适配器身份与声明协议一致，避免"声明一套、执行另一套"。
 */
const MATRIX: readonly { readonly declaration: ProviderAdapterDefinition; readonly config: LLMConfig; readonly expectedProtocol: string }[] = [
    {
        declaration: createDefaultProviderRegistry().require("openai"),
        config: { provider: "openai", apiKey: "sk-test", model: "gpt-4.1-mini" },
        expectedProtocol: "chat-completions",
    },
    {
        declaration: createDefaultProviderRegistry().require("anthropic"),
        config: { provider: "anthropic", apiKey: "sk-test", model: "claude-sonnet-4-5" },
        expectedProtocol: "anthropic-messages",
    },
    {
        declaration: createDefaultProviderRegistry().require("google"),
        config: { provider: "google", apiKey: "sk-test", model: "gemini-2.5-flash" },
        expectedProtocol: "google-generate-content",
    },
    {
        declaration: createDefaultProviderRegistry().require("deepseek"),
        config: { provider: "deepseek", apiKey: "sk-test", model: "deepseek-chat" },
        expectedProtocol: "chat-completions",
    },
    {
        declaration: createDefaultProviderRegistry().require("openrouter"),
        config: { provider: "openrouter", apiKey: "sk-test", model: "~anthropic/claude-haiku-latest" },
        expectedProtocol: "chat-completions",
    },
    {
        declaration: createDefaultProviderRegistry().require("opencode-go"),
        config: { provider: "opencode-go", apiKey: "sk-test", model: "beam-free" },
        expectedProtocol: "chat-completions",
    },
    {
        declaration: createDefaultProviderRegistry().require("openai-compatible"),
        config: {
            provider: "openai-compatible", apiKey: "sk-test", model: "local-model",
            baseURL: "https://gateway.example/v1", contextWindowTokens: 8192, maxOutputTokens: 1024,
        },
        expectedProtocol: "chat-completions",
    },
];

test("覆盖矩阵：迁移前每家供应商都已登记，协议属于已实现集合", () => {
    const registry = createDefaultProviderRegistry();
    const registered = new Map(registry.definitions().map(definition => [definition.id, definition]));
    for (const entry of MATRIX) {
        const declaration = registered.get(entry.declaration.id);
        assert.ok(declaration !== undefined, `${entry.declaration.id} must be registered`);
        assert.equal(declaration.protocol, entry.expectedProtocol, entry.declaration.id);
        assert.equal(isProtocolImplemented(declaration.protocol), true, `${entry.declaration.id} protocol must be implemented`);
    }
    const declared = new Set(MATRIX.map(entry => entry.declaration.protocol));
    for (const protocol of declared) {
        assert.ok(IMPLEMENTED_PROTOCOLS.includes(protocol), `${protocol} must be listed as implemented`);
    }
});

test("覆盖矩阵：每个声明的协议都能构造出身份一致的适配器，且不发请求", async () => {
    const originalFetch = globalThis.fetch;
    const networkCalls: string[] = [];
    globalThis.fetch = (async (input: unknown) => {
        networkCalls.push(String(input));
        throw new Error("unexpected network call");
    }) as typeof fetch;
    try {
        for (const entry of MATRIX) {
            const adapter = entry.declaration.createAdapter(entry.config);
            switch (entry.expectedProtocol) {
                case "anthropic-messages": {
                    assert.ok(adapter instanceof AnthropicMessagesAdapter, entry.declaration.id);
                    assert.equal(adapter.nativeConversationIdentity.protocol, "anthropic-messages");
                    assert.equal(adapter.nativeConversationIdentity.provider, "anthropic");
                    break;
                }
                case "google-generate-content": {
                    assert.ok(adapter instanceof Gemini, entry.declaration.id);
                    assert.equal(adapter.nativeConversationIdentity.protocol, "gemini-content");
                    assert.equal(adapter.nativeConversationIdentity.provider, "google");
                    break;
                }
                default: {
                    assert.ok(adapter instanceof ChatCompletionsAdapter, entry.declaration.id);
                    assert.equal(adapter.nativeConversationIdentity.protocol, "openai-chat");
                    break;
                }
            }
        }
        assert.deepEqual(networkCalls, [], "adapter construction must not touch the network");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("覆盖矩阵：OpenCode Go 登记模型可在协议声明下分发到 chat wire", async () => {
    // 服务端登记模型在 Snapshot 中记录 protocol；恢复后按该协议分发到 chat wire，
    // 不再依赖 executionApi 字段。这里断言分发结果与声明协议一致。
    const adapter = createOpenCodeGoAdapter({
        provider: "opencode-go", apiKey: "sk-test", model: "minimax-m3.1-flash-free",
        protocol: "chat-completions", contextWindowTokens: 1_000_000, maxOutputTokens: 524_288,
    });
    assert.ok(adapter instanceof ChatCompletionsAdapter);
    assert.equal(adapter.nativeConversationIdentity.protocol, "openai-chat");
    assert.equal(adapter.connection.supportsRequiredToolChoice, true);
});

test("覆盖矩阵保持独立构造入口与默认注册表一致", () => {
    // 逐家工厂与注册表声明必须同源，避免出现第二份供应商清单。
    assert.ok(createOpenAIAdapter({ provider: "openai", apiKey: "k", model: "m" }) instanceof ChatCompletionsAdapter);
    assert.ok(createAnthropicAdapter({ provider: "anthropic", apiKey: "k", model: "m" }) instanceof AnthropicMessagesAdapter);
    assert.ok(createGoogleAdapter({ provider: "google", apiKey: "k", model: "m" }) instanceof Gemini);
    assert.ok(createDeepSeekAdapter({ provider: "deepseek", apiKey: "k", model: "m" }) instanceof ChatCompletionsAdapter);
    assert.ok(createOpenRouterAdapter({ provider: "openrouter", apiKey: "k", model: "m" }) instanceof ChatCompletionsAdapter);
    assert.ok(createOpenAICompatibleAdapter({
        provider: "openai-compatible", apiKey: "k", model: "m",
        baseURL: "https://gateway.example/v1", contextWindowTokens: 8192, maxOutputTokens: 1024,
    }) instanceof ChatCompletionsAdapter);
});
