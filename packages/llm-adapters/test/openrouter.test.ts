import assert from "node:assert/strict";
import test from "node:test";

import type { LLMConfig } from "../../llm-core/src/index";
import {
    ChatCompletionsAdapter,
    DEFAULT_OPENROUTER_BASE_URL,
    createOpenRouterAdapter,
    createOpenRouterProviderAdapter,
} from "../src/index";

const CONFIG: LLMConfig = {
    provider: "openrouter",
    apiKey: "openrouter-key",
    model: "openai/gpt-4o",
    structuredOutputMode: "prompt_only",
};

test("OpenRouter 适配器声明固定端点、目录与 Chat Completions 协议", () => {
    const definition = createOpenRouterProviderAdapter();
    assert.equal(definition.id, "openrouter");
    assert.equal(definition.protocol, "chat-completions");
    assert.equal(definition.catalog.provider, "openrouter");
    assert.equal(definition.catalog.protocol, "chat-completions");
    assert.equal(typeof definition.catalog.discover, "function");
    assert.ok(definition.createAdapter(CONFIG) instanceof ChatCompletionsAdapter);
});

test("OpenRouter 请求发往 OpenAI-compatible 端点并只带 Bearer 认证", async () => {
    let captured: { readonly url: string; readonly headers: Record<string, string>; readonly body: Record<string, any> } | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
        captured = {
            url: String(url),
            headers: init?.headers as Record<string, string>,
            body: JSON.parse(String(init?.body)) as Record<string, any>,
        };
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }) as typeof fetch;
    try {
        await createOpenRouterAdapter(CONFIG).generate({
            messages: [{ role: "user", content: "hi" }],
            structuredOutput: { name: "answer", schema: { type: "object" } },
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.ok(captured);
    assert.equal(captured.url, `${DEFAULT_OPENROUTER_BASE_URL}/chat/completions`);
    assert.equal(captured.headers.Authorization, "Bearer openrouter-key");
    assert.equal(captured.body.response_format, undefined);
});
