import assert from "node:assert/strict";
import { test } from "node:test";

import { LLMConfigurationError, type LLMConfig } from "../../llm-core/src/index";
import { Gemini } from "../../llm-google/src/index";
import { OpenAICompatible } from "../../llm-openai/src/index";
import { PiAiAdapter } from "../../llm-pi-ai/src/index";
import * as entry from "../src/index";
import {
    createLlmAdapter,
    createLlmStageAdapters,
    createReflectionLlmAdapter,
} from "../src/index";

const openai: LLMConfig = {
    provider: "openai", model: "gpt-4.1-mini", apiKey: "sk-test", structuredOutputMode: "prompt_only",
};

test("llm 入口只公开三个默认工厂", () => {
    assert.deepEqual(Object.keys(entry).sort(), [
        "createLlmAdapter",
        "createLlmStageAdapters",
        "createReflectionLlmAdapter",
    ]);
});

test("createLlmAdapter 的实现、固定模式与身份和直接构造一致且不发网络请求", () => {
    const networkCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
        networkCalls.push(String(input));
        throw new Error("unexpected network call");
    }) as typeof fetch;
    try {
        const anthropic = createLlmAdapter({
            provider: "anthropic", model: "claude-sonnet-4-5", apiKey: "sk-test", structuredOutputMode: "prompt_only",
        });
        assert.ok(anthropic instanceof PiAiAdapter);
        assert.equal(anthropic.structuredOutputMode, "prompt_only");

        const openaiStrict = createLlmAdapter({ ...openai, structuredOutputMode: "strict" });
        assert.ok(openaiStrict instanceof OpenAICompatible);
        assert.equal(openaiStrict.structuredOutputMode, "strict");
        const openaiDirect = new OpenAICompatible({
            provider: "openai", model: "gpt-4.1-mini", apiKey: "sk-test",
            baseURL: "https://api.openai.com/v1", structuredOutputMode: "strict",
        });
        assert.equal(openaiStrict.constructor, openaiDirect.constructor);
        assert.deepEqual(openaiStrict.nativeConversationIdentity, openaiDirect.nativeConversationIdentity);

        const googleStrict = createLlmAdapter({
            provider: "google", model: "gemini-2.5-flash", apiKey: "sk-test", structuredOutputMode: "strict",
        });
        assert.ok(googleStrict instanceof Gemini);
        assert.deepEqual(googleStrict.nativeConversationIdentity, {
            provider: "google", endpoint: "https://generativelanguage.googleapis.com/v1beta",
            model: "gemini-2.5-flash", protocol: "gemini-content",
        });

        const compatibleStrict = createLlmAdapter({
            provider: "openai-compatible", model: "local-model", apiKey: "sk-test",
            baseURL: "https://gateway.example/v1", contextWindowTokens: 8192, maxOutputTokens: 1024,
            structuredOutputMode: "strict",
        });
        assert.ok(compatibleStrict instanceof OpenAICompatible);
        assert.equal(compatibleStrict.nativeConversationIdentity.endpoint, "https://gateway.example/v1");

        assert.throws(() => createLlmAdapter({
            provider: "deepseek", model: "deepseek-v4-pro", apiKey: "sk-test", structuredOutputMode: "strict",
        }), (error: unknown) => {
            assert.ok(error instanceof LLMConfigurationError);
            assert.equal(error.code, "INVALID_LLM_CONFIG");
            assert.match(error.message, /does not support strict/);
            return true;
        });

        assert.throws(() => createLlmAdapter({ ...openai, model: "unknown-model" }),
            (error: unknown) => error instanceof LLMConfigurationError && /Unknown model/.test(error.message));
        assert.throws(() => createLlmAdapter({ ...openai, maxOutputTokens: 999999999 }),
            (error: unknown) => error instanceof LLMConfigurationError && /exceed model/.test(error.message));

        assert.deepEqual(networkCalls, []);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("two_stage 经工厂解析为供应商对应的 Decide 模式", () => {
    const openaiTwoStage = createLlmAdapter({ ...openai, structuredOutputMode: "two_stage" });
    assert.ok(openaiTwoStage instanceof OpenAICompatible);
    assert.equal(openaiTwoStage.structuredOutputMode, "strict");

    const anthropicTwoStage = createLlmAdapter({
        provider: "anthropic", model: "claude-sonnet-4-5", apiKey: "sk-test", structuredOutputMode: "two_stage",
    });
    assert.ok(anthropicTwoStage instanceof PiAiAdapter);
    assert.equal(anthropicTwoStage.structuredOutputMode, "prompt_only");
});

test("createLlmStageAdapters 固定 Think/Decide 差异且对象不可变", () => {
    const stages = createLlmStageAdapters({ ...openai, structuredOutputMode: "two_stage" });
    assert.ok(Object.isFrozen(stages));
    // Think 走反思工厂的原生优先规则；Decide 对原生供应商固定 strict。
    assert.ok(stages.thinkAdapter instanceof OpenAICompatible);
    assert.equal(stages.thinkAdapter.structuredOutputMode, "prompt_only");
    assert.ok(stages.decideAdapter instanceof OpenAICompatible);
    assert.equal(stages.decideAdapter.structuredOutputMode, "strict");

    const piStages = createLlmStageAdapters({
        provider: "deepseek", model: "deepseek-v4-pro", apiKey: "sk-test", structuredOutputMode: "two_stage",
    });
    assert.ok(piStages.thinkAdapter instanceof PiAiAdapter);
    assert.ok(piStages.decideAdapter instanceof PiAiAdapter);
    assert.equal(piStages.decideAdapter.structuredOutputMode, "prompt_only");
});

test("createReflectionLlmAdapter 保持原生优先规则", () => {
    const googleReflection = createReflectionLlmAdapter({
        provider: "google", apiKey: "sk-test", model: "custom-gemini-model", structuredOutputMode: "prompt_only",
    });
    assert.ok(googleReflection instanceof Gemini);
    assert.equal(googleReflection.structuredOutputMode, "prompt_only");

    const openaiReflection = createReflectionLlmAdapter({
        provider: "openai", apiKey: "sk-test", model: "private-model", structuredOutputMode: "prompt_only",
    });
    assert.ok(openaiReflection instanceof OpenAICompatible);

    const anthropicReflection = createReflectionLlmAdapter({
        provider: "anthropic", apiKey: "sk-test", model: "claude-sonnet-4-5", structuredOutputMode: "prompt_only",
    });
    assert.ok(anthropicReflection instanceof PiAiAdapter);
});
