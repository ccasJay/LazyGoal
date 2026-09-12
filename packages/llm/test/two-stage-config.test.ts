import assert from "node:assert/strict";
import { test } from "node:test";

import { LlmConfigurationError, readLlmConfig } from "../src/config";
import { loadRuntimeConfig } from "../src/config-loader";
import { createLlmAdapter } from "../src/factory";
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

test("不支持 strict 模式的 Provider 配置 two_stage 时明确报错", () => {
    assert.throws(
        () => readLlmConfig({
            LLM_PROVIDER: "anthropic",
            LLM_MODEL: "claude-sonnet-4-5",
            LLM_API_KEY: "sk-test",
            LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
        }),
        (err: unknown) => err instanceof LlmConfigurationError
            && /does not support two_stage output/.test(err.message),
    );
});

test("createLlmAdapter 在 two_stage 模式下创建原生 OpenAI/Gemini Adapter", () => {
    const openaiConfig = readLlmConfig({
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-4o",
        LLM_API_KEY: "sk-test",
        LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
    });
    const openaiAdapter = createLlmAdapter(openaiConfig);
    assert.ok(openaiAdapter instanceof OpenAICompatible);
    assert.equal(openaiAdapter.structuredOutputMode, "two_stage");

    const geminiConfig = readLlmConfig({
        LLM_PROVIDER: "google",
        LLM_MODEL: "gemini-2.5-pro",
        LLM_API_KEY: "gm-test",
        LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
    });
    const geminiAdapter = createLlmAdapter(geminiConfig);
    assert.ok(geminiAdapter instanceof Gemini);
    assert.equal(geminiAdapter.structuredOutputMode, "two_stage");
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
