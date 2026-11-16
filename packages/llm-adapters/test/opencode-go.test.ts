import assert from "node:assert/strict";
import test from "node:test";

import type { LLMConfig } from "../../llm-core/src/index";
import {
    ChatCompletionsAdapter,
    DEFAULT_OPENAI_BASE_URL,
    LAZYGOAL_USER_AGENT,
    OPENCODE_GO_BASE_URL,
    OPENCODE_GO_SESSION_HEADER,
    createDefaultProviderRegistry,
    createOpenAICatalogSource,
    createOpenCodeGoAdapter,
    createOpenCodeGoProviderAdapter,
} from "../src/index";

const CONFIG: LLMConfig = {
    provider: "opencode-go",
    apiKey: "go-key",
    model: "beam-free",
};

const DYNAMIC_CONFIG: LLMConfig = {
    provider: "opencode-go",
    apiKey: "go-key",
    model: "minimax-m3.1-flash-free",
    executionApi: "openai-completions",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 524_288,
    reasoning: true,
    supportsRequiredToolChoice: false,
};

const TOOLS = [{ id: "read_file", description: "Read a file", parametersSchema: { type: "object", properties: {} } }];

async function captureGenerate(config: LLMConfig, request: Parameters<ReturnType<typeof createOpenCodeGoAdapter>["generate"]>[0]) {
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
        await createOpenCodeGoAdapter(config).generate(request);
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.ok(captured);
    return captured;
}

test("OpenCode Go 适配器声明固定端点、会话头与 Chat Completions 协议", () => {
    const definition = createOpenCodeGoProviderAdapter();
    assert.equal(definition.id, "opencode-go");
    assert.equal(definition.protocol, "chat-completions");
    assert.equal(definition.catalog.provider, "opencode-go");
    assert.equal(definition.catalog.requireLiveCapacity, true);
    assert.equal(typeof definition.catalog.discover, "function");
    assert.ok(definition.createAdapter(CONFIG) instanceof ChatCompletionsAdapter);
});

test("OpenCode Go 请求使用固定端点、自有 User-Agent 与稳定会话头", async () => {
    const captured = await captureGenerate(CONFIG, {
        messages: [{ role: "user", content: "hi" }],
        sessionId: "goal-1",
    });
    assert.equal(captured.url, `${OPENCODE_GO_BASE_URL}/chat/completions`);
    assert.equal(captured.headers["User-Agent"], LAZYGOAL_USER_AGENT);
    assert.equal(captured.headers[OPENCODE_GO_SESSION_HEADER], "goal-1");
    assert.equal(captured.headers.Authorization, "Bearer go-key");

    const withoutSession = await captureGenerate(CONFIG, { messages: [{ role: "user", content: "hi" }] });
    assert.equal(withoutSession.headers[OPENCODE_GO_SESSION_HEADER], undefined);
    assert.equal(withoutSession.headers["User-Agent"], LAZYGOAL_USER_AGENT);
});

test("OpenCode Go 在模型不支持时把 required 工具选择降级为 auto", async () => {
    const downgraded = await captureGenerate(DYNAMIC_CONFIG, {
        messages: [{ role: "user", content: "hi" }],
        tools: TOOLS,
        toolChoice: "required",
    });
    assert.equal(downgraded.body.tool_choice, "auto");

    const required = await captureGenerate(CONFIG, {
        messages: [{ role: "user", content: "hi" }],
        tools: TOOLS,
        toolChoice: "required",
    });
    assert.equal(required.body.tool_choice, "required");
});

test("默认注册表登记内置供应商与其目录来源", () => {
    const registry = createDefaultProviderRegistry();
    assert.deepEqual(registry.ids(), ["openai", "deepseek", "openrouter", "opencode-go", "openai-compatible"]);
    assert.equal(registry.require("opencode-go").catalog.provider, "opencode-go");
    assert.equal(registry.require("openai").catalog.provider, "openai");
    assert.ok(createOpenAICatalogSource().staticModels.length > 0);
    assert.notEqual(OPENCODE_GO_BASE_URL, DEFAULT_OPENAI_BASE_URL);
});
