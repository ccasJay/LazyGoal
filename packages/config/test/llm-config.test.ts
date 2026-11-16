import assert from "node:assert/strict";
import { test } from "node:test";
import { readLLMConfig } from "../src/index";
import { LLMConfigurationError } from "../../llm-core/src/index";
import { createLlmAdapter, createReflectionLlmAdapter } from "../../llm/src/index";
import { ChatCompletionsAdapter } from "../../llm-adapters/src/index";
import { Gemini } from "../../llm-google/src/index";
import { AnthropicMessagesAdapter } from "../../llm-adapters/src/index";

const base = {
    LLM_PROVIDER: "openai", LLM_MODEL: "gpt-4.1-mini",
    LLM_API_KEY: "explicit-key",
};
const custom = {
    ...base, LLM_PROVIDER: "openai-compatible", LLM_MODEL: "local-model",
    LLM_BASE_URL: "http://127.0.0.1:9999/v1",
    LLM_CONTEXT_WINDOW_TOKENS: "8192", LLM_MAX_OUTPUT_TOKENS: "1024",
};

test("configuration requires explicit provider, model and key", () => {
    assert.throws(() => readLLMConfig({}), (error: unknown) => {
        assert.ok(error instanceof LLMConfigurationError);
        assert.equal(error.name, "LLMConfigurationError");
        assert.equal(error.code, "INVALID_LLM_CONFIG");
        assert.deepEqual(error.missing, ["LLM_PROVIDER", "LLM_MODEL", "LLM_API_KEY"]);
        return true;
    });
    assert.equal(readLLMConfig({ ...base, LLM_API_KEY: "  explicit-key  " }).apiKey, "explicit-key");
    // 供应商标识为开放字符串；是否已注册由组合根注册表校验。
    assert.equal(readLLMConfig({ ...base, LLM_PROVIDER: "my-gateway" }).provider, "my-gateway");
});

test("factory dispatches registered providers to request-driven adapters", () => {
    for (const [provider, model] of [
        ["openai", "gpt-4.1-mini"], ["deepseek", "deepseek-v4-pro"],
        ["openrouter", "~anthropic/claude-haiku-latest"], ["opencode-go", "kimi-k3"],
    ] as const) {
        const config = readLLMConfig({ ...base, LLM_PROVIDER: provider, LLM_MODEL: model });
        assert.ok(createLlmAdapter(config) instanceof ChatCompletionsAdapter, provider);
    }

    const anthropic = readLLMConfig({ ...base, LLM_PROVIDER: "anthropic", LLM_MODEL: "claude-sonnet-4-5" });
    assert.ok(createLlmAdapter(anthropic) instanceof AnthropicMessagesAdapter);

    const google = readLLMConfig({ ...base, LLM_PROVIDER: "google", LLM_MODEL: "gemini-2.5-flash" });
    assert.ok(createLlmAdapter(google) instanceof Gemini);

    assert.ok(createLlmAdapter(readLLMConfig(custom)) instanceof ChatCompletionsAdapter);
});

test("unknown provider is rejected by the typed factory", () => {
    assert.throws(
        () => createLlmAdapter({ provider: "unknown-gateway", apiKey: "key", model: "model" }),
        (error: unknown) => error instanceof LLMConfigurationError && /Unknown provider/.test(error.message),
    );
});

test("endpoint overrides are explicit and never silently ignored", () => {
    assert.equal(readLLMConfig(base).provider, "openai");
    for (const provider of ["anthropic", "openrouter", "deepseek"]) {
        assert.throws(() => readLLMConfig({ ...base, LLM_PROVIDER: provider, LLM_BASE_URL: "https://proxy.test" }), /LLM_BASE_URL is not supported/);
    }
    for (const url of ["url", "ftp://host", "https://key:secret@host", "https://host?key=secret", "https://host#fragment"]) {
        assert.throws(() => readLLMConfig({ ...base, LLM_BASE_URL: url }), /LLM_BASE_URL must be/);
    }
});

test("custom models require explicit valid capacities", () => {
    assert.throws(() => readLLMConfig({ ...custom, LLM_BASE_URL: "", LLM_MAX_OUTPUT_TOKENS: "" }), (error: unknown) => {
        assert.ok(error instanceof LLMConfigurationError);
        assert.deepEqual(error.missing, ["LLM_BASE_URL", "LLM_MAX_OUTPUT_TOKENS"]);
        return true;
    });
    for (const invalid of ["0", "-1", "1.5", "Infinity", "9007199254740992"]) {
        assert.throws(() => readLLMConfig({ ...custom, LLM_CONTEXT_WINDOW_TOKENS: invalid }), /positive safe integer/);
        assert.throws(() => readLLMConfig({ ...base, LLM_MAX_OUTPUT_TOKENS: invalid }), /positive safe integer/);
    }
    assert.throws(() => readLLMConfig({ ...custom, LLM_MAX_OUTPUT_TOKENS: "8192" }), /must be less than/);
});

test("chat adapters accept arbitrary model identifiers without catalog lookup", () => {
    assert.ok(createLlmAdapter(readLLMConfig({ ...base, LLM_MODEL: "unknown-model" })) instanceof ChatCompletionsAdapter);
    assert.ok(createLlmAdapter(readLLMConfig({ ...base, LLM_MODEL: "private-model" })) instanceof ChatCompletionsAdapter);
});

test("createReflectionLlmAdapter dispatches native runtime providers for google and openai", () => {
    const googleReflection = createReflectionLlmAdapter({
        provider: "google",
        apiKey: "test-key",
        model: "custom-gemini-model",
        baseURL: "http://127.0.0.1:8317/v1beta",
    });
    assert.ok(googleReflection instanceof Gemini);

    const openaiReflection = createReflectionLlmAdapter({
        provider: "openai",
        apiKey: "test-key",
        model: "custom-openai-model",
        baseURL: "http://127.0.0.1:8317/v1",
    });
    assert.ok(openaiReflection instanceof ChatCompletionsAdapter);

    const anthropicReflection = createReflectionLlmAdapter({
        provider: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-5",
    });
    assert.ok(anthropicReflection instanceof AnthropicMessagesAdapter);
});
