import assert from "node:assert/strict";
import { test } from "node:test";

import {
    IMPLEMENTED_PROTOCOLS,
    assertProtocolImplemented,
    createProviderRegistry,
    isProtocolImplemented,
    type ProviderAdapterDefinition,
} from "../src/index";
import { LLMConfigurationError, type LLMConfig } from "../../llm-core/src/index";

/** 声明了没有 wire 实现的协议；用于验证分发拒绝与不回退。 */
function unimplementedDeclaration(): ProviderAdapterDefinition {
    return {
        id: "responses-only",
        protocol: "openai-responses",
        catalog: { provider: "responses-only", protocol: "openai-responses", staticModels: [] },
        createAdapter: () => {
            throw new Error("must never construct an adapter for an unimplemented protocol");
        },
    };
}

test("未实现的协议在分发前明确失败并指明缺失协议", () => {
    assert.throws(
        () => assertProtocolImplemented("openai-responses"),
        (error: unknown) => error instanceof LLMConfigurationError
            && /Protocol "openai-responses" has no wire implementation/.test(error.message)
            && /chat-completions/.test(error.message),
    );
    assert.throws(
        () => assertProtocolImplemented(""),
        (error: unknown) => error instanceof LLMConfigurationError && error.message.includes("has no wire implementation"),
    );
});

test("已实现协议通过守卫，且清单覆盖三家 wire", () => {
    for (const protocol of IMPLEMENTED_PROTOCOLS) {
        assert.equal(isProtocolImplemented(protocol), true, protocol);
        assert.doesNotThrow(() => assertProtocolImplemented(protocol));
    }
    assert.ok(IMPLEMENTED_PROTOCOLS.includes("chat-completions"));
    assert.ok(IMPLEMENTED_PROTOCOLS.includes("anthropic-messages"));
    assert.ok(IMPLEMENTED_PROTOCOLS.includes("google-generate-content"));
});

test("注册表可以登记未知协议的声明，但分发守卫拒绝且不回退到 chat", () => {
    const registry = createProviderRegistry([unimplementedDeclaration()]);
    assert.equal(registry.has("responses-only"), true, "声明本身可以被登记");
    const declaration = registry.require("responses-only");
    assert.equal(declaration.protocol, "openai-responses");
    assert.throws(
        () => {
            // 分发路径：先校验协议实现，再调用工厂；不允许翻译为 Chat Completions。
            assertProtocolImplemented(declaration.protocol);
            declaration.createAdapter({ provider: "responses-only", apiKey: "k", model: "m" } as LLMConfig);
        },
        (error: unknown) => error instanceof LLMConfigurationError
            && /openai-responses/.test(error.message),
    );
});

test("分发拒绝不得静默降级：未实现协议的工厂永远不会被调用", () => {
    let factoryCalls = 0;
    const definition: ProviderAdapterDefinition = {
        ...unimplementedDeclaration(),
        createAdapter: () => {
            factoryCalls += 1;
            throw new Error("unreachable");
        },
    };
    const registry = createProviderRegistry([definition]);
    try {
        assertProtocolImplemented(registry.require("responses-only").protocol);
    } catch {
        // 期望：守卫先失败。
    }
    assert.equal(factoryCalls, 0, "unimplemented protocol must fail before any adapter工厂调用");
});
