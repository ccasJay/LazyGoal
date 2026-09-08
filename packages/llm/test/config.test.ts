import assert from "node:assert/strict";
import { test } from "node:test";
import { readLlmConfig, LlmConfigurationError } from "../src/config";
import { createLlmAdapter } from "../src/factory";
import { OpenAICompatible } from "../src/openai-compatible";
import { Gemini } from "../src/gemini";
import { PiAiAdapter } from "../src/pi-ai";

const base = {
    LLM_PROVIDER: "openai", LLM_MODEL: "gpt-4.1-mini",
    LLM_API_KEY: "explicit-key", LLM_STRUCTURED_OUTPUT_MODE: "prompt_only",
};
const custom = {
    ...base, LLM_PROVIDER: "openai-compatible", LLM_MODEL: "local-model",
    LLM_BASE_URL: "http://127.0.0.1:9999/v1",
    LLM_CONTEXT_WINDOW_TOKENS: "8192", LLM_MAX_OUTPUT_TOKENS: "1024",
};

test("configuration requires explicit provider, model, key and mode", () => {
    assert.throws(() => readLlmConfig({}), (error: unknown) => {
        assert.ok(error instanceof LlmConfigurationError);
        assert.deepEqual(error.missing, ["LLM_PROVIDER", "LLM_MODEL", "LLM_API_KEY", "LLM_STRUCTURED_OUTPUT_MODE"]);
        return true;
    });
    assert.equal(readLlmConfig({ ...base, LLM_API_KEY: "  explicit-key  " }).apiKey, "explicit-key");
    assert.throws(() => readLlmConfig({ ...base, LLM_PROVIDER: "unknown" }), /Unsupported LLM_PROVIDER/);
    assert.throws(() => readLlmConfig({ ...base, LLM_STRUCTURED_OUTPUT_MODE: "auto" }), /Invalid LLM_STRUCTURED_OUTPUT_MODE/);
});

test("factory dispatches all six providers without network or ambient credentials", () => {
    for (const [provider, model] of [
        ["openai", "gpt-4.1-mini"], ["google", "gemini-2.5-flash"],
        ["anthropic", "claude-sonnet-4-5"], ["deepseek", "deepseek-v4-flash"],
        ["openrouter", "anthropic/claude-3-haiku"],
    ] as const) {
        assert.ok(createLlmAdapter(readLlmConfig({ ...base, LLM_PROVIDER: provider, LLM_MODEL: model })) instanceof PiAiAdapter);
        const strict = { ...base, LLM_PROVIDER: provider, LLM_MODEL: model, LLM_STRUCTURED_OUTPUT_MODE: "strict" };
        if (provider === "openai") assert.ok(createLlmAdapter(readLlmConfig(strict)) instanceof OpenAICompatible);
        else if (provider === "google") assert.ok(createLlmAdapter(readLlmConfig(strict)) instanceof Gemini);
        else assert.throws(() => readLlmConfig(strict), /does not support strict/);
    }
    assert.ok(createLlmAdapter(readLlmConfig(custom)) instanceof PiAiAdapter);
    assert.ok(createLlmAdapter(readLlmConfig({ ...custom, LLM_STRUCTURED_OUTPUT_MODE: "strict" })) instanceof OpenAICompatible);
});

test("unsupported strict also fails for typed factory callers", () => {
    assert.throws(() => createLlmAdapter({ provider: "anthropic", apiKey: "key", model: "claude-sonnet-4-5", structuredOutputMode: "strict" }), /does not support strict/);
});

test("endpoint overrides are explicit and never silently ignored", () => {
    assert.equal(readLlmConfig(base).provider, "openai");
    for (const provider of ["google", "anthropic", "openrouter", "deepseek"]) {
        assert.throws(() => readLlmConfig({ ...base, LLM_PROVIDER: provider, LLM_BASE_URL: "https://proxy.test" }), /LLM_BASE_URL is not supported/);
    }
    for (const url of ["url", "ftp://host", "https://key:secret@host", "https://host?key=secret", "https://host#fragment"]) {
        assert.throws(() => readLlmConfig({ ...base, LLM_BASE_URL: url }), /LLM_BASE_URL must be/);
    }
});

test("custom models require explicit valid capacities", () => {
    assert.throws(() => readLlmConfig({ ...custom, LLM_BASE_URL: "", LLM_MAX_OUTPUT_TOKENS: "" }), (error: unknown) => {
        assert.ok(error instanceof LlmConfigurationError);
        assert.deepEqual(error.missing, ["LLM_BASE_URL", "LLM_MAX_OUTPUT_TOKENS"]);
        return true;
    });
    for (const invalid of ["0", "-1", "1.5", "Infinity", "9007199254740992"]) {
        assert.throws(() => readLlmConfig({ ...custom, LLM_CONTEXT_WINDOW_TOKENS: invalid }), /positive safe integer/);
        assert.throws(() => readLlmConfig({ ...base, LLM_MAX_OUTPUT_TOKENS: invalid }), /positive safe integer/);
    }
    assert.throws(() => readLlmConfig({ ...custom, LLM_MAX_OUTPUT_TOKENS: "8192" }), /must be less than/);
});

test("catalog resolution and capacity errors happen during factory construction", () => {
    assert.throws(() => createLlmAdapter(readLlmConfig({ ...base, LLM_MODEL: "unknown-model" })), /Unknown model/);
    assert.throws(() => createLlmAdapter(readLlmConfig({ ...base, LLM_MAX_OUTPUT_TOKENS: "999999999" })), /exceed model/);
    // Native strict endpoints retain their existing support for arbitrary model identifiers.
    assert.ok(createLlmAdapter(readLlmConfig({ ...base, LLM_MODEL: "private-model", LLM_STRUCTURED_OUTPUT_MODE: "strict" })) instanceof OpenAICompatible);
});
