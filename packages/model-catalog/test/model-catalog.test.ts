import assert from "node:assert/strict";
import test from "node:test";

import type { LLMConfig } from "../../llm-core/src/index";
import {
    createLlmModelCatalog,
    determineSelectability,
    ModelCatalogError,
    sortModelDescriptors,
    type CatalogSource,
    type LlmModelDescriptor,
} from "../src/index";

const OPENAI_CONFIG: LLMConfig = {
    provider: "openai",
    model: "gpt-4o",
    apiKey: "test-key",
};

function source(overrides: Partial<CatalogSource> = {}): CatalogSource {
    return {
        provider: "openai",
        protocol: "chat-completions",
        staticModels: [{
            id: "gpt-4o",
            displayName: "GPT-4o",
            contextWindowTokens: 128_000,
            maxOutputTokens: 16_384,
        }],
        ...overrides,
    };
}

test("在线 ID 决定可用集合，静态元数据补全缺失字段", async () => {
    const catalog = createLlmModelCatalog({
        sources: [source({
            discover: async () => [
                { id: "gpt-4o" },
                { id: "gpt-4.1", displayName: "GPT-4.1", contextWindowTokens: 1_000_000, maxOutputTokens: 32_000 },
            ],
        })],
        isProtocolImplemented: () => true,
    });
    const models = await catalog.list(OPENAI_CONFIG);
    assert.deepEqual(models.map(model => model.id), ["gpt-4o", "gpt-4.1"]);
    const merged = models.find(model => model.id === "gpt-4o");
    assert.equal(merged?.displayName, "GPT-4o");
    assert.equal(merged?.contextWindowTokens, 128_000);
    assert.equal(merged?.availabilitySource, "live");
    assert.equal(merged?.metadataSource, "catalog");
    assert.equal(merged?.protocol, "chat-completions");
});

test("在线重复 ID 去重且当前模型排在首位", async () => {
    const catalog = createLlmModelCatalog({
        sources: [source({
            staticModels: [],
            discover: async () => [{ id: "b" }, { id: "a" }, { id: "b" }],
        })],
        isProtocolImplemented: () => true,
    });
    const models = await catalog.list({ ...OPENAI_CONFIG, model: "b" });
    assert.deepEqual(models.map(model => model.id), ["b", "a"]);
});

test("允许降级的故障回退到静态目录，鉴权与协议错误直接抛出", async () => {
    for (const kind of ["timeout", "unavailable", "unsupported"] as const) {
        const catalog = createLlmModelCatalog({
            sources: [source({ discover: async () => { throw new ModelCatalogError(kind, "degradable"); } })],
            isProtocolImplemented: () => true,
        });
        const models = await catalog.list(OPENAI_CONFIG);
        assert.equal(models[0]?.availabilitySource, "catalog", kind);
    }
    for (const kind of ["authentication", "permission", "protocol", "cancelled"] as const) {
        const catalog = createLlmModelCatalog({
            sources: [source({ discover: async () => { throw new ModelCatalogError(kind, "fatal"); } })],
            isProtocolImplemented: () => true,
        });
        await assert.rejects(catalog.list(OPENAI_CONFIG), (error: unknown) => error instanceof ModelCatalogError && error.kind === kind);
    }
});

test("未提供发现函数或静态目录为空时使用配置回退", async () => {
    const catalog = createLlmModelCatalog({
        sources: [source({ provider: "openai-compatible", staticModels: [] })],
        isProtocolImplemented: () => true,
    });
    const models = await catalog.list({
        provider: "openai-compatible",
        model: "gateway-model",
        apiKey: "test-key",
        baseURL: "https://gateway.example.test/v1",
        contextWindowTokens: 64_000,
        maxOutputTokens: 8_192,
    });
    assert.equal(models.length, 1);
    assert.equal(models[0]?.id, "gateway-model");
    assert.equal(models[0]?.availabilitySource, "configured");
    assert.equal(models[0]?.selectable, true);
});

test("协议未实现时所有模型不可选", async () => {
    const catalog = createLlmModelCatalog({
        sources: [source()],
        isProtocolImplemented: () => false,
    });
    const models = await catalog.list(OPENAI_CONFIG);
    assert.equal(models[0]?.selectable, false);
    assert.match(models[0]?.unavailableReason ?? "", /protocol/i);
});

test("没有登记目录来源的供应商明确失败", async () => {
    const catalog = createLlmModelCatalog({ sources: [], isProtocolImplemented: () => true });
    await assert.rejects(catalog.list(OPENAI_CONFIG), (error: unknown) =>
        error instanceof ModelCatalogError && error.kind === "unsupported");
});

test("可选性判定覆盖非文本、工具缺失、容量与预算条件", () => {
    assert.deepEqual(determineSelectability({ id: "gpt-4o", protocolImplemented: true, requireTokenCapacity: false }), {
        selectable: true,
    });
    assert.equal(determineSelectability({
        id: "text-embedding-3", protocolImplemented: true, requireTokenCapacity: false,
    }).selectable, false);
    assert.equal(determineSelectability({
        id: "gpt-4o", protocolImplemented: true, supportsTools: false, requireTokenCapacity: false,
    }).selectable, false);
    assert.equal(determineSelectability({
        id: "gpt-4o", protocolImplemented: true, requireTokenCapacity: true,
    }).selectable, false);
    assert.equal(determineSelectability({
        id: "gpt-4o", protocolImplemented: true, contextWindowTokens: 128, maxOutputTokens: 128,
        requireTokenCapacity: false,
    }).selectable, false);
    assert.equal(determineSelectability({
        id: "gpt-4o", protocolImplemented: true, contextWindowTokens: 128, maxOutputTokens: 64,
        requireTokenCapacity: true,
    }).selectable, true);
});

test("排序保持当前项、可选性与名称顺序", () => {
    const descriptor = (id: string, selectable: boolean, displayName = id): LlmModelDescriptor => ({
        provider: "openai", id, displayName, protocol: "chat-completions",
        availabilitySource: "catalog", metadataSource: "catalog", selectable,
    });
    const sorted = sortModelDescriptors([
        descriptor("z", true), descriptor("b", false), descriptor("a", true), descriptor("current", false),
    ], "current");
    assert.deepEqual(sorted.map(model => model.id), ["current", "a", "z", "b"]);
});

test("OpenCode Go 要求在线模型具备容量元数据", async () => {
    const catalog = createLlmModelCatalog({
        sources: [source({
            provider: "opencode-go",
            staticModels: [],
            requireLiveCapacity: true,
            discover: async () => [{ id: "dynamic-model", isTextGeneration: true, supportsTools: true }],
        })],
        isProtocolImplemented: () => true,
    });
    const models = await catalog.list({ ...OPENAI_CONFIG, provider: "opencode-go", model: "dynamic-model" });
    assert.equal(models[0]?.selectable, false);
});
