import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

import { loadRuntimeConfig, readLLMConfig, resolveLazyGoalHomePaths } from "../../config/src/index";
import { LLMConfigurationError } from "../../llm-core/src/index";
import { ChatCompletionsAdapter } from "../../llm-adapters/src/index";
import { createLlmAdapter, createLlmStageAdapters } from "../src/index";
import { Gemini } from "../../llm-google/src/index";
import { PiAiAdapter } from "../../llm-pi-ai/src/index";

test("readLLMConfig 支持解析 two_stage 模式并兼容 strict 与 prompt_only", () => {
    const base = {
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-4o",
        LLM_API_KEY: "sk-test",
    };

    assert.equal(readLLMConfig({ ...base, LLM_STRUCTURED_OUTPUT_MODE: "two_stage" }).structuredOutputMode, "two_stage");
    assert.equal(readLLMConfig({ ...base, LLM_STRUCTURED_OUTPUT_MODE: "strict" }).structuredOutputMode, "strict");
    assert.equal(readLLMConfig({ ...base, LLM_STRUCTURED_OUTPUT_MODE: "prompt_only" }).structuredOutputMode, "prompt_only");
});

test("readLLMConfig 拒绝非法的 structured_output_mode 并指出包含 two_stage", () => {
    assert.throws(
        () => readLLMConfig({
            LLM_PROVIDER: "openai",
            LLM_MODEL: "gpt-4o",
            LLM_API_KEY: "sk-test",
            LLM_STRUCTURED_OUTPUT_MODE: "invalid_mode",
        }),
        (err: unknown) => err instanceof LLMConfigurationError
            && /two_stage/.test(err.message),
    );
});

test("已注册供应商使用同一请求驱动适配器，Anthropic 保持 prompt_only", () => {
    for (const [provider, model] of [
        ["deepseek", "deepseek-v4-pro"],
        ["openrouter", "~anthropic/claude-haiku-latest"],
        ["opencode-go", "kimi-k3"],
    ] as const) {
        const config = readLLMConfig({
            LLM_PROVIDER: provider,
            LLM_MODEL: model,
            LLM_API_KEY: "sk-test",
            LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
        });
        const adapters = createLlmStageAdapters(config);
        assert.ok(adapters.thinkAdapter instanceof ChatCompletionsAdapter, provider);
        assert.equal(adapters.thinkAdapter, adapters.decideAdapter, provider);
    }

    const anthropic = readLLMConfig({
        LLM_PROVIDER: "anthropic",
        LLM_MODEL: "claude-sonnet-4-5",
        LLM_API_KEY: "sk-test",
        LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
    });
    assert.ok(createLlmStageAdapters(anthropic).thinkAdapter instanceof PiAiAdapter);
});

test("two_stage 阶段绑定按供应商注册表与既有实现分配", () => {
    const openaiConfig = readLLMConfig({
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-4o",
        LLM_API_KEY: "sk-test",
        LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
    });
    assert.ok(createLlmAdapter(openaiConfig) instanceof ChatCompletionsAdapter);
    const openaiStages = createLlmStageAdapters(openaiConfig);
    assert.equal(openaiStages.thinkAdapter, openaiStages.decideAdapter);

    const geminiConfig = readLLMConfig({
        LLM_PROVIDER: "google",
        LLM_MODEL: "gemini-2.5-pro",
        LLM_API_KEY: "gm-test",
        LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
    });
    assert.ok(createLlmAdapter(geminiConfig) instanceof Gemini);
    const googleStages = createLlmStageAdapters(geminiConfig);
    assert.ok(googleStages.thinkAdapter instanceof Gemini);
    assert.ok(googleStages.decideAdapter instanceof Gemini);

    const compatibleConfig = readLLMConfig({
        LLM_PROVIDER: "openai-compatible",
        LLM_MODEL: "custom-model",
        LLM_API_KEY: "sk-test",
        LLM_BASE_URL: "https://gateway.example/v1",
        LLM_CONTEXT_WINDOW_TOKENS: "32768",
        LLM_MAX_OUTPUT_TOKENS: "4096",
        LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
    });
    const compatibleStages = createLlmStageAdapters(compatibleConfig);
    assert.equal(compatibleStages.thinkAdapter, compatibleStages.decideAdapter);
    assert.ok(compatibleStages.decideAdapter instanceof ChatCompletionsAdapter);
});

test("loadRuntimeConfig 从 providers 声明解析 two_stage 选型", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-two-stage-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await mkdir(homePaths.homeDirectory, { recursive: true });
        await writeFile(homePaths.configFile, `
[providers.openai.main]
api_key = "sk-test"
[[providers.openai.main.models]]
id = "gpt-4o"
context_window = 128000
max_output_tokens = 16384
[llm]
provider = "main"
model = "gpt-4o"
`);
        const runtimeConfig = await loadRuntimeConfig({
            homePaths,
            cliArgs: { structuredOutputMode: "two_stage" },
        });
        assert.equal(runtimeConfig.llm.structuredOutputMode, "two_stage");
        assert.equal(runtimeConfig.llm.provider, "main");
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});
