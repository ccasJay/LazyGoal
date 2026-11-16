import assert from "node:assert/strict";
import test from "node:test";

import { LLMConfigurationError, type LLMConfig } from "../../llm-core/src/index";
import {
    createOpenAIProviderAdapter,
    createProviderRegistry,
    type ProviderAdapterDefinition,
} from "../src/index";

const OPENAI_CONFIG: LLMConfig = {
    provider: "openai",
    apiKey: "test-key",
    model: "gpt-4o",
};

test("注册表接受已声明供应商并拒绝未知标识", () => {
    const registry = createProviderRegistry([createOpenAIProviderAdapter()]);
    assert.deepEqual(registry.ids(), ["openai"]);
    assert.equal(registry.has("openai"), true);
    assert.equal(registry.has("unknown"), false);
    assert.throws(
        () => registry.require("unknown"),
        (error: unknown) => error instanceof LLMConfigurationError
            && /unknown provider/i.test(error.message)
            && /openai/.test(error.message),
    );
});

test("注册表拒绝重复或空标识", () => {
    const definition = createOpenAIProviderAdapter();
    assert.throws(
        () => createProviderRegistry([definition, definition]),
        (error: unknown) => error instanceof LLMConfigurationError && /duplicate/i.test(error.message),
    );
    const empty: ProviderAdapterDefinition = { ...definition, id: "" };
    assert.throws(
        () => createProviderRegistry([empty]),
        (error: unknown) => error instanceof LLMConfigurationError && /empty/i.test(error.message),
    );
});

test("OpenAI 适配器只声明标识、协议、目录来源与执行工厂", () => {
    const definition = createOpenAIProviderAdapter();
    assert.equal(definition.id, "openai");
    assert.equal(definition.protocol, "chat-completions");
    assert.equal(definition.catalog.provider, "openai");
    assert.equal(definition.catalog.protocol, "chat-completions");
    assert.equal(typeof definition.catalog.discover, "function");
    assert.ok(definition.catalog.staticModels.length > 0);

    const adapter = definition.createAdapter(OPENAI_CONFIG);
    assert.equal(typeof adapter.generate, "function");
    assert.equal(typeof adapter.stream, "function");
});

test("适配器工厂拒绝非 OpenAI 连接", () => {
    const definition = createOpenAIProviderAdapter();
    assert.throws(
        () => definition.createAdapter({ ...OPENAI_CONFIG, provider: "deepseek" } as LLMConfig),
        (error: unknown) => error instanceof LLMConfigurationError,
    );
});
