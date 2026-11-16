import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

import { loadRuntimeConfig, readLLMConfig, resolveLazyGoalHomePaths } from "../../config/src/index";
import { ChatCompletionsAdapter } from "../../llm-adapters/src/index";
import { createLlmAdapter, createLlmStageAdapters } from "../src/index";
import { Gemini } from "../../llm-google/src/index";
import { PiAiAdapter } from "../../llm-pi-ai/src/index";

test("readLLMConfig 只读取连接事实，不再接受输出模式配置", () => {
    const base = {
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-4o",
        LLM_API_KEY: "sk-test",
    };
    const config = readLLMConfig(base);
    assert.equal(config.provider, "openai");
    assert.equal(config.model, "gpt-4o");
    assert.equal("structuredOutputMode" in config, false);
});

test("已注册供应商使用同一请求驱动适配器，Anthropic 保留 pi-ai", () => {
    for (const [provider, model] of [
        ["deepseek", "deepseek-v4-pro"],
        ["openrouter", "~anthropic/claude-haiku-latest"],
        ["opencode-go", "kimi-k3"],
    ] as const) {
        const config = readLLMConfig({
            LLM_PROVIDER: provider,
            LLM_MODEL: model,
            LLM_API_KEY: "sk-test",
        });
        const adapters = createLlmStageAdapters(config);
        assert.ok(adapters.thinkAdapter instanceof ChatCompletionsAdapter, provider);
        assert.equal(adapters.thinkAdapter, adapters.decideAdapter, provider);
    }

    const anthropic = readLLMConfig({
        LLM_PROVIDER: "anthropic",
        LLM_MODEL: "claude-sonnet-4-5",
        LLM_API_KEY: "sk-test",
    });
    assert.ok(createLlmStageAdapters(anthropic).thinkAdapter instanceof PiAiAdapter);
});

test("Think 与 Decide 共用同一实例，Google 使用原生 Gemini", () => {
    const openaiConfig = readLLMConfig({
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-4o",
        LLM_API_KEY: "sk-test",
    });
    assert.ok(createLlmAdapter(openaiConfig) instanceof ChatCompletionsAdapter);
    const openaiStages = createLlmStageAdapters(openaiConfig);
    assert.equal(openaiStages.thinkAdapter, openaiStages.decideAdapter);

    const geminiConfig = readLLMConfig({
        LLM_PROVIDER: "google",
        LLM_MODEL: "gemini-2.5-pro",
        LLM_API_KEY: "gm-test",
    });
    assert.ok(createLlmAdapter(geminiConfig) instanceof Gemini);
    const googleStages = createLlmStageAdapters(geminiConfig);
    assert.equal(googleStages.thinkAdapter, googleStages.decideAdapter);
    assert.ok(googleStages.decideAdapter instanceof Gemini);

    const compatibleConfig = readLLMConfig({
        LLM_PROVIDER: "openai-compatible",
        LLM_MODEL: "custom-model",
        LLM_API_KEY: "sk-test",
        LLM_BASE_URL: "https://gateway.example/v1",
        LLM_CONTEXT_WINDOW_TOKENS: "32768",
        LLM_MAX_OUTPUT_TOKENS: "4096",
    });
    const compatibleStages = createLlmStageAdapters(compatibleConfig);
    assert.equal(compatibleStages.thinkAdapter, compatibleStages.decideAdapter);
    assert.ok(compatibleStages.decideAdapter instanceof ChatCompletionsAdapter);
});

test("loadRuntimeConfig 从 providers 声明解析选型", async () => {
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
        const runtimeConfig = await loadRuntimeConfig({ homePaths });
        assert.equal(runtimeConfig.llm.provider, "main");
        assert.equal(runtimeConfig.llm.model, "gpt-4o");
        assert.equal("structuredOutputMode" in runtimeConfig.llm, false);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});
