import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ANTHROPIC_VERSION,
    DEFAULT_ANTHROPIC_BASE_URL,
    AnthropicMessagesAdapter,
    createAnthropicAdapter,
    createAnthropicCatalogSource,
    createAnthropicProviderAdapter,
    createProviderRegistry,
} from "../src/index";
import { LLMConfigurationError } from "../../llm-core/src/index";

test("adapter declares Anthropic endpoint facts, version header and native identity", () => {
    const adapter = createAnthropicAdapter({ provider: "anthropic", apiKey: "secret", model: "claude-sonnet-4-5" });
    assert.ok(adapter instanceof AnthropicMessagesAdapter);
    const messages = adapter as AnthropicMessagesAdapter;
    const connection = messages.connection;
    assert.equal(connection.url, `${DEFAULT_ANTHROPIC_BASE_URL}/messages`);
    assert.equal(connection.headers["x-api-key"], "secret");
    assert.equal(connection.headers["anthropic-version"], ANTHROPIC_VERSION);
    assert.equal(connection.model, "claude-sonnet-4-5");
    assert.deepEqual(messages.nativeConversationIdentity, {
        provider: "anthropic",
        endpoint: DEFAULT_ANTHROPIC_BASE_URL,
        model: "claude-sonnet-4-5",
        protocol: "anthropic-messages",
    });
});

test("explicit base URL replaces the endpoint prefix of url and identity", () => {
    const adapter = createAnthropicAdapter({
        provider: "anthropic", apiKey: "secret", model: "claude-sonnet-4-5",
        baseURL: "https://gateway.example/anthropic/v1/",
    }) as AnthropicMessagesAdapter;
    const connection = adapter.connection;
    assert.equal(connection.url, "https://gateway.example/anthropic/v1/messages");
    assert.equal(adapter.nativeConversationIdentity.endpoint, "https://gateway.example/anthropic/v1");
});

test("adapter factory rejects connections from other providers", () => {
    assert.throws(
        () => createAnthropicAdapter({ provider: "openai", apiKey: "secret", model: "gpt-4o" } as never),
        (error: unknown) => error instanceof LLMConfigurationError && /is not the Anthropic adapter/.test(error.message),
    );
});

test("registry serves the Anthropic declaration with its catalog source", () => {
    const registry = createProviderRegistry([createAnthropicProviderAdapter()]);
    assert.equal(registry.has("anthropic"), true);
    const definition = registry.require("anthropic");
    assert.equal(definition.protocol, "anthropic-messages");
    const source = createAnthropicCatalogSource();
    assert.equal(definition.catalog.provider, source.provider);
    assert.equal(definition.catalog.protocol, source.protocol);
    assert.equal(typeof source.discover, "function");
    assert.ok(definition.catalog.staticModels.length > 0, "Anthropic declaration carries its static catalog");
});
