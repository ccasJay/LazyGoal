import assert from "node:assert/strict";
import test from "node:test";

import type { LLMConfig } from "../../llm-core/src/index";
import {
    ChatCompletionsAdapter,
    DEFAULT_OPENAI_BASE_URL,
    createOpenAIAdapter,
    createOpenAIProviderAdapter,
} from "../src/index";

const CONFIG: LLMConfig = {
    provider: "openai",
    apiKey: "openai-key",
    model: "gpt-4o",
};

function jsonResponse(): Response {
    return new Response(JSON.stringify({
        choices: [{ message: { content: '{"answer":"ok"}', reasoning_content: "summary" }, finish_reason: "stop" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("OpenAI 适配器声明官方端点、目录与 Chat Completions 协议", () => {
    const definition = createOpenAIProviderAdapter();
    assert.equal(definition.id, "openai");
    assert.equal(definition.protocol, "chat-completions");
    assert.equal(definition.catalog.provider, "openai");
    assert.equal(definition.catalog.protocol, "chat-completions");
    assert.equal(typeof definition.catalog.discover, "function");
    assert.ok(definition.createAdapter(CONFIG) instanceof ChatCompletionsAdapter);
});

test("OpenAI 请求发往官方端点、携带原生结构约束并回放 reasoning", async () => {
    let captured: { readonly url: string; readonly headers: Record<string, string>; readonly body: Record<string, any> } | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
        captured = {
            url: String(url),
            headers: init?.headers as Record<string, string>,
            body: JSON.parse(String(init?.body)) as Record<string, any>,
        };
        return jsonResponse();
    }) as typeof fetch;
    let continuation: unknown;
    try {
        const response = await createOpenAIAdapter(CONFIG).generate({
            messages: [{ role: "user", content: "hi" }],
            structuredOutput: { name: "answer", schema: { type: "object" } },
        });
        continuation = response.continuation;
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.ok(captured);
    assert.equal(captured.url, `${DEFAULT_OPENAI_BASE_URL}/chat/completions`);
    assert.equal(captured.headers.Authorization, "Bearer openai-key");
    assert.deepEqual(captured.body.response_format, {
        type: "json_schema",
        json_schema: { name: "answer", schema: { type: "object" }, strict: true },
    });
    assert.equal((continuation as { reasoningContent?: string }).reasoningContent, "summary");
});

test("OpenAI 端点覆盖只改变连接地址", async () => {
    let capturedUrl = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: unknown) => {
        capturedUrl = String(url);
        return jsonResponse();
    }) as typeof fetch;
    try {
        await createOpenAIAdapter({ ...CONFIG, baseURL: "https://gateway.example.test/v1" }).generate({
            messages: [{ role: "user", content: "hi" }],
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.equal(capturedUrl, "https://gateway.example.test/v1/chat/completions");
});
