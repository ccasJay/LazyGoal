import assert from "node:assert/strict";
import { test } from "node:test";

import { LlmConfigurationError, readLlmConfig } from "../src/config";
import { loadRuntimeConfig } from "../src/config-loader";
import { createLlmAdapter, createLlmStageAdapters } from "../src/factory";
import { OpenAICompatible } from "../src/openai-compatible";
import { Gemini } from "../src/gemini";
import { PiAiAdapter } from "../src/pi-ai";

test("readLlmConfig 支持解析 two_stage 模式并兼容 strict 与 prompt_only", () => {
    const base = {
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-4o",
        LLM_API_KEY: "sk-test",
    };

    const configTwoStage = readLlmConfig({
        ...base,
        LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
    });
    assert.equal(configTwoStage.structuredOutputMode, "two_stage");

    const configStrict = readLlmConfig({
        ...base,
        LLM_STRUCTURED_OUTPUT_MODE: "strict",
    });
    assert.equal(configStrict.structuredOutputMode, "strict");

    const configPromptOnly = readLlmConfig({
        ...base,
        LLM_STRUCTURED_OUTPUT_MODE: "prompt_only",
    });
    assert.equal(configPromptOnly.structuredOutputMode, "prompt_only");
});

test("readLlmConfig 拒绝非法的 structured_output_mode 并指出包含 two_stage", () => {
    assert.throws(
        () => readLlmConfig({
            LLM_PROVIDER: "openai",
            LLM_MODEL: "gpt-4o",
            LLM_API_KEY: "sk-test",
            LLM_STRUCTURED_OUTPUT_MODE: "invalid_mode",
        }),
        (err: unknown) => err instanceof LlmConfigurationError
            && /two_stage/.test(err.message),
    );
});

test("不支持原生 strict 的 Provider 仍可配置 two_stage，并为两阶段选择 prompt_only", () => {
    for (const [provider, model] of [
        ["anthropic", "claude-sonnet-4-5"],
        ["openrouter", "~anthropic/claude-haiku-latest"],
        ["deepseek", "deepseek-v4-flash"],
    ] as const) {
        const config = readLlmConfig({
            LLM_PROVIDER: provider,
            LLM_MODEL: model,
            LLM_API_KEY: "sk-test",
            LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
        });
        const adapters = createLlmStageAdapters(config);
        assert.ok(adapters.thinkAdapter instanceof PiAiAdapter);
        assert.ok(adapters.decideAdapter instanceof PiAiAdapter);
        assert.equal(adapters.thinkAdapter.structuredOutputMode, "prompt_only");
        assert.equal(adapters.decideAdapter.structuredOutputMode, "prompt_only");
    }
});

test("two_stage 阶段绑定为同一模型创建 prompt_only Think 与 strict Decide", () => {
    const openaiConfig = readLlmConfig({
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-4o",
        LLM_API_KEY: "sk-test",
        LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
    });
    const openaiAdapter = createLlmAdapter(openaiConfig);
    assert.ok(openaiAdapter instanceof OpenAICompatible);
    assert.equal(openaiAdapter.structuredOutputMode, "strict");

    const geminiConfig = readLlmConfig({
        LLM_PROVIDER: "google",
        LLM_MODEL: "gemini-2.5-pro",
        LLM_API_KEY: "gm-test",
        LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
    });
    const geminiAdapter = createLlmAdapter(geminiConfig);
    assert.ok(geminiAdapter instanceof Gemini);
    assert.equal(geminiAdapter.structuredOutputMode, "strict");

    const openaiStages = createLlmStageAdapters(openaiConfig);
    assert.equal(openaiStages.thinkAdapter.structuredOutputMode, "prompt_only");
    assert.equal(openaiStages.decideAdapter.structuredOutputMode, "strict");
    const googleStages = createLlmStageAdapters(geminiConfig);
    assert.equal(googleStages.thinkAdapter.structuredOutputMode, "prompt_only");
    assert.equal(googleStages.decideAdapter.structuredOutputMode, "strict");

    const compatibleConfig = readLlmConfig({
        LLM_PROVIDER: "openai-compatible",
        LLM_MODEL: "custom-model",
        LLM_API_KEY: "sk-test",
        LLM_BASE_URL: "https://gateway.example/v1",
        LLM_CONTEXT_WINDOW_TOKENS: "32768",
        LLM_MAX_OUTPUT_TOKENS: "4096",
        LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
    });
    const compatibleStages = createLlmStageAdapters(compatibleConfig);
    assert.equal(compatibleStages.thinkAdapter.structuredOutputMode, "prompt_only");
    assert.ok(compatibleStages.decideAdapter instanceof OpenAICompatible);
    assert.equal(compatibleStages.decideAdapter.structuredOutputMode, "strict");
});

test("loadRuntimeConfig 支持两阶段配置", async () => {
    const runtimeConfig = await loadRuntimeConfig({
        cliArgs: {
            provider: "openai",
            model: "gpt-4o",
            apiKey: "sk-test",
            structuredOutputMode: "two_stage",
        },
    });

    assert.equal(runtimeConfig.llm.structuredOutputMode, "two_stage");
});
