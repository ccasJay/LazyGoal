import assert from "node:assert/strict";
import { test } from "node:test";

import { LLMConfigurationError, type LLMConfig } from "../../llm-core/src/index";
import { Gemini } from "../../llm-google/src/index";
import { PiAiAdapter } from "../../llm-pi-ai/src/index";
import { ChatCompletionsAdapter } from "../../llm-adapters/src/index";
import * as entry from "../src/index";
import {
    createLlmAdapter,
    createLlmStageAdapters,
    createReflectionLlmAdapter,
} from "../src/index";

const openai: LLMConfig = {
    provider: "openai", model: "gpt-4.1-mini", apiKey: "sk-test",
};

test("llm 入口只公开三个默认工厂", () => {
    assert.deepEqual(Object.keys(entry).sort(), [
        "createLlmAdapter",
        "createLlmStageAdapters",
        "createReflectionLlmAdapter",
    ]);
});

test("createLlmAdapter 按注册表选择适配器且不发网络请求", () => {
    const networkCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
        networkCalls.push(String(input));
        throw new Error("unexpected network call");
    }) as typeof fetch;
    try {
        const anthropic = createLlmAdapter({
            provider: "anthropic", model: "claude-sonnet-4-5", apiKey: "sk-test",
        });
        assert.ok(anthropic instanceof PiAiAdapter);

        const openaiAdapter = createLlmAdapter({ ...openai });
        assert.ok(openaiAdapter instanceof ChatCompletionsAdapter);

        const deepseek = createLlmAdapter({
            provider: "deepseek", model: "deepseek-v4-pro", apiKey: "sk-test",
        });
        assert.ok(deepseek instanceof ChatCompletionsAdapter);

        const googleStrict = createLlmAdapter({
            provider: "google", model: "gemini-2.5-flash", apiKey: "sk-test",
        });
        assert.ok(googleStrict instanceof Gemini);

        const compatible = createLlmAdapter({
            provider: "openai-compatible", model: "local-model", apiKey: "sk-test",
            baseURL: "https://gateway.example/v1", contextWindowTokens: 8192, maxOutputTokens: 1024,
        });
        assert.ok(compatible instanceof ChatCompletionsAdapter);
        assert.equal(
            (compatible as ChatCompletionsAdapter).connection.identity.endpoint,
            "https://gateway.example/v1",
        );

        assert.throws(() => createLlmAdapter({
            provider: "unknown-gateway", model: "model", apiKey: "sk-test",
        }), (error: unknown) => error instanceof LLMConfigurationError && /Unknown provider/.test(error.message));

        assert.deepEqual(networkCalls, []);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("two_stage 对已注册供应商选择请求驱动适配器，Anthropic 保持 prompt_only", () => {
    const openaiTwoStage = createLlmAdapter({ ...openai });
    assert.ok(openaiTwoStage instanceof ChatCompletionsAdapter);

    const anthropicTwoStage = createLlmAdapter({
        provider: "anthropic", model: "claude-sonnet-4-5", apiKey: "sk-test",
    });
    assert.ok(anthropicTwoStage instanceof PiAiAdapter);
});

test("createLlmStageAdapters 复用请求驱动适配器，保留既有实现阶段差异", () => {
    const stages = createLlmStageAdapters({ ...openai });
    assert.ok(Object.isFrozen(stages));
    assert.ok(stages.thinkAdapter instanceof ChatCompletionsAdapter);
    assert.equal(stages.thinkAdapter, stages.decideAdapter);

    const deepseekStages = createLlmStageAdapters({
        provider: "deepseek", model: "deepseek-v4-pro", apiKey: "sk-test",
    });
    assert.ok(deepseekStages.thinkAdapter instanceof ChatCompletionsAdapter);
    assert.equal(deepseekStages.thinkAdapter, deepseekStages.decideAdapter);

    const googleStages = createLlmStageAdapters({
        provider: "google", model: "gemini-2.5-pro", apiKey: "sk-test",
    });
    assert.ok(googleStages.thinkAdapter instanceof Gemini);
    assert.ok(googleStages.decideAdapter instanceof Gemini);
});

test("createReflectionLlmAdapter 对注册表供应商使用同一适配器", () => {
    const googleReflection = createReflectionLlmAdapter({
        provider: "google", apiKey: "sk-test", model: "custom-gemini-model",
    });
    assert.ok(googleReflection instanceof Gemini);

    const openaiReflection = createReflectionLlmAdapter({
        provider: "openai", apiKey: "sk-test", model: "private-model",
    });
    assert.ok(openaiReflection instanceof ChatCompletionsAdapter);

    const anthropicReflection = createReflectionLlmAdapter({
        provider: "anthropic", apiKey: "sk-test", model: "claude-sonnet-4-5",
    });
    assert.ok(anthropicReflection instanceof PiAiAdapter);
});
