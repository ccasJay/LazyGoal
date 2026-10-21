import assert from "node:assert/strict";
import test from "node:test";

import type { LLMConfig } from "../../llm-core/src/index.js";
import {
    createLlmModelCatalog,
    DefaultLlmModelCatalog,
    determineSelectability,
    ModelCatalogError,
    sortModelDescriptors,
    type LlmModelDescriptor,
    type ProviderModelFetcher,
    type RawFetchedModel,
} from "../src/index.js";

const baseOpenAIConfig: LLMConfig = {
    provider: "openai",
    model: "gpt-4o",
    apiKey: "sk-secret-key-12345",
    structuredOutputMode: "strict",
};

test("ModelCatalog: 在线 ID 决定可用集合，并用 pi-ai Catalog 补全元数据与来源标记", async () => {
    // 注入 fake fetcher，返回 2 个在线模型，其中一个只有 ID
    const fakeFetcher: ProviderModelFetcher = {
        async fetchModels() {
            return [
                {
                    id: "gpt-4o",
                    displayName: "GPT-4o (Live)",
                    contextWindowTokens: 128000,
                    maxOutputTokens: 16384,
                    reasoning: false,
                    vision: true,
                },
                {
                    // 仅有 ID，其余元数据依赖 pi-ai Catalog 补全
                    id: "gpt-4.1-mini",
                },
            ];
        },
    };

    const catalog = createLlmModelCatalog(fakeFetcher);
    const result = await catalog.list(baseOpenAIConfig);

    // 只有在线返回的 2 个 ID，不混入静态目录中的其它数十个模型
    assert.equal(result.length, 2);
    assert.deepEqual(
        result.map((m) => m.id),
        ["gpt-4o", "gpt-4.1-mini"],
    );

    const gpt4o = result.find((m) => m.id === "gpt-4o")!;
    assert.equal(gpt4o.availabilitySource, "live");
    assert.equal(gpt4o.metadataSource, "live");
    assert.equal(gpt4o.displayName, "GPT-4o (Live)");
    assert.equal(gpt4o.selectable, true);

    const mini = result.find((m) => m.id === "gpt-4.1-mini")!;
    assert.equal(mini.availabilitySource, "live");
    assert.equal(mini.metadataSource, "catalog");
    // Catalog 补全的 contextWindow 应大于 0
    assert(mini.contextWindowTokens !== undefined && mini.contextWindowTokens > 0);
    assert.equal(mini.selectable, true);
});

test("ModelCatalog: 重复 ID 在线结果去重", async () => {
    const fakeFetcher: ProviderModelFetcher = {
        async fetchModels() {
            return [
                { id: "gpt-4o", displayName: "First" },
                { id: "gpt-4o", displayName: "Duplicate Second" },
            ];
        },
    };

    const catalog = createLlmModelCatalog(fakeFetcher);
    const result = await catalog.list(baseOpenAIConfig);

    assert.equal(result.length, 1);
    assert.equal(result[0]?.displayName, "First");
});

test("ModelCatalog: 稳定排序（当前项优先、可选项优先、displayName 升序、id 升序）", () => {
    const descriptors: LlmModelDescriptor[] = [
        {
            provider: "openai",
            id: "z-model",
            displayName: "Zebra Model",
            contextWindowTokens: 8000,
            availabilitySource: "live",
            metadataSource: "live",
            selectable: true,
        },
        {
            provider: "openai",
            id: "a-unselectable",
            displayName: "Alpha Unselectable",
            availabilitySource: "live",
            metadataSource: "live",
            selectable: false,
            unavailableReason: "No context window",
        },
        {
            provider: "openai",
            id: "b-model",
            displayName: "Beta Model",
            contextWindowTokens: 8000,
            availabilitySource: "live",
            metadataSource: "live",
            selectable: true,
        },
        {
            provider: "openai",
            id: "current-model",
            displayName: "Middle Current Model",
            contextWindowTokens: 8000,
            availabilitySource: "live",
            metadataSource: "live",
            selectable: true,
        },
    ];

    const sorted = sortModelDescriptors(descriptors, "current-model");
    assert.deepEqual(
        sorted.map((m) => m.id),
        [
            "current-model", // 当前模型第一位
            "b-model",       // 可选择项中 Beta 排在 Zebra 前
            "z-model",
            "a-unselectable", // 不可选项排在最后
        ],
    );
});

test("ModelCatalog: 不可选条件判定（非文本、模式不兼容、Token 预算缺少容量）", () => {
    // 1. 非文本模型
    const nonText = determineSelectability(
        "openai",
        "text-embedding-3-small",
        8192,
        undefined,
        { isTextGeneration: false },
        baseOpenAIConfig,
    );
    assert.equal(nonText.selectable, false);
    assert.match(nonText.unavailableReason ?? "", /text generation/);

    // 2. Google 缺少 generateContent
    const googleNoGen = determineSelectability(
        "google",
        "models/custom-google-model",
        8192,
        undefined,
        { supportedGenerationMethods: ["embedContent"] },
        { ...baseOpenAIConfig, provider: "google" },
    );
    assert.equal(googleNoGen.selectable, false);
    assert.match(googleNoGen.unavailableReason ?? "", /generateContent/);

    // 3. strict 模式不支持
    const strictMismatch = determineSelectability(
        "anthropic",
        "claude-sonnet-4-5",
        200000,
        8192,
        {},
        {
            provider: "anthropic",
            model: "claude-sonnet-4-5",
            apiKey: "key",
            structuredOutputMode: "strict",
        },
    );
    assert.equal(strictMismatch.selectable, false);
    assert.match(strictMismatch.unavailableReason ?? "", /strict/);

    // 字符预算允许缺少容量；Token 预算需要完整容量。
    const missingContext = determineSelectability(
        "openai",
        "custom-model",
        undefined,
        undefined,
        {},
        baseOpenAIConfig,
    );
    assert.equal(missingContext.selectable, true);

    const tokenMissingContext = determineSelectability(
        "openai", "custom-model", undefined, undefined, {}, baseOpenAIConfig, true,
    );
    assert.equal(tokenMissingContext.selectable, false);
    assert.match(tokenMissingContext.unavailableReason ?? "", /context window/);

    const tokenMissingOutput = determineSelectability(
        "openai", "custom-model", 128000, undefined, {}, baseOpenAIConfig, true,
    );
    assert.equal(tokenMissingOutput.selectable, false);
    assert.match(tokenMissingOutput.unavailableReason ?? "", /max output/);

    const invalidCapacityPair = determineSelectability(
        "openai", "custom-model", 8192, 8192, {}, baseOpenAIConfig,
    );
    assert.equal(invalidCapacityPair.selectable, false);
    assert.match(invalidCapacityPair.unavailableReason ?? "", /less than context window/);
});

test("ModelCatalog: 网关模型缺少容量时按预算模式判定可选性", async () => {
    const catalog = createLlmModelCatalog({
        async fetchModels() {
            return [{ id: "gemini-3.8-flash-high", displayName: "Gemini 3.8 Flash", supportedGenerationMethods: ["generateContent"] }];
        },
    });
    const config: LLMConfig = { ...baseOpenAIConfig, provider: "google" };

    const characterModels = await catalog.list(config);
    assert.equal(characterModels[0]?.selectable, true);
    assert.equal(characterModels[0]?.contextWindowTokens, undefined);
    assert.equal(characterModels[0]?.maxOutputTokens, undefined);

    const tokenModels = await catalog.list(config, { requireTokenCapacity: true });
    assert.equal(tokenModels[0]?.selectable, false);
    assert.match(tokenModels[0]?.unavailableReason ?? "", /context window/);
});

test("ModelCatalog: 允许降级故障（timeout, unavailable, unsupported）触发静态目录或配置兜底", async () => {
    // 1. OpenAI 遇到 timeout 降级到静态 pi-ai Catalog
    const timeoutFetcher: ProviderModelFetcher = {
        async fetchModels() {
            throw new ModelCatalogError("timeout", "Network timed out after 5000ms");
        },
    };
    const catalog1 = createLlmModelCatalog(timeoutFetcher);
    const result1 = await catalog1.list(baseOpenAIConfig);
    assert(result1.length > 0);
    assert(result1.every((m) => m.availabilitySource === "catalog"));

    // 2. openai-compatible 遇到 unavailable 只能兜底回退到当前配置模型
    const compatConfig: LLMConfig = {
        provider: "openai-compatible",
        model: "custom-local-llm",
        apiKey: "test-key",
        baseURL: "http://localhost:8000/v1",
        structuredOutputMode: "prompt_only",
        contextWindowTokens: 4096,
        maxOutputTokens: 1024,
    };
    const unavailableFetcher: ProviderModelFetcher = {
        async fetchModels() {
            throw new ModelCatalogError("unavailable", "Endpoint unreachable 503");
        },
    };
    const catalog2 = createLlmModelCatalog(unavailableFetcher);
    const result2 = await catalog2.list(compatConfig);
    assert.equal(result2.length, 1);
    assert.equal(result2[0]?.id, "custom-local-llm");
    assert.equal(result2[0]?.availabilitySource, "configured");
    assert.equal(result2[0]?.metadataSource, "configured");
    assert.equal(result2[0]?.contextWindowTokens, 4096);
});

test("ModelCatalog: 不允许降级故障（authentication, permission, protocol, cancelled）抛出错误阻止切换且不泄露凭据", async () => {
    const errorKinds = ["authentication", "permission", "protocol", "cancelled"] as const;

    for (const kind of errorKinds) {
        const rejectingFetcher: ProviderModelFetcher = {
            async fetchModels() {
                throw new ModelCatalogError(kind, `Failed due to ${kind}`);
            },
        };

        const catalog = createLlmModelCatalog(rejectingFetcher);
        await assert.rejects(
            async () => {
                await catalog.list(baseOpenAIConfig);
            },
            (err: unknown) => {
                assert(err instanceof ModelCatalogError);
                assert.equal(err.kind, kind);
                // 确保错误信息中不含敏感 API Key
                assert.doesNotMatch(err.message, /sk-secret-key/);
                return true;
            },
        );
    }
});

const opencodeGoConfig: LLMConfig = {
    provider: "opencode-go",
    model: "kimi-k3",
    apiKey: "oc-secret-key-12345",
    structuredOutputMode: "prompt_only",
};

test("ModelCatalog: opencode-go 在线结果用静态目录补全元数据", async () => {
    const fakeFetcher: ProviderModelFetcher = {
        async fetchModels() {
            return [
                { id: "kimi-k3" },
                { id: "glm-5.3", displayName: "GLM-5.3 (Live)" },
            ];
        },
    };

    const catalog = createLlmModelCatalog(fakeFetcher);
    const result = await catalog.list(opencodeGoConfig);

    assert.deepEqual(result.map((m) => m.id), ["kimi-k3", "glm-5.3"]);
    const kimi = result.find((m) => m.id === "kimi-k3")!;
    assert.equal(kimi.availabilitySource, "live");
    assert.equal(kimi.metadataSource, "catalog");
    assert.ok(kimi.contextWindowTokens !== undefined && kimi.contextWindowTokens > 0);
    assert.equal(kimi.selectable, true);

    const glm = result.find((m) => m.id === "glm-5.3")!;
    assert.equal(glm.displayName, "GLM-5.3 (Live)");
    assert.equal(glm.metadataSource, "mixed");
});

test("ModelCatalog: opencode-go 在线新增但适配器未知的模型不可选", async () => {
    const catalog = createLlmModelCatalog({
        async fetchModels() {
            return [
                { id: "beam-free", contextWindowTokens: 128000, maxOutputTokens: 8192 },
                { id: "longcat-2.5-preview-free" },
            ];
        },
    });
    for (const requireTokenCapacity of [false, true]) {
        const models = await catalog.list(opencodeGoConfig, { requireTokenCapacity });
        const unknown = models.find(model => model.id === "beam-free")!;
        assert.equal(unknown.availabilitySource, "live");
        assert.equal(unknown.selectable, false);
        assert.equal(unknown.unavailableReason, "Model is not supported by the installed OpenCode Go adapter.");
        assert.equal(models.find(model => model.id === "longcat-2.5-preview-free")?.selectable, true);
    }
});

test("ModelCatalog: 目标 OpenCode Go 模型用独立执行元数据动态标记可选", async () => {
    const catalog = createLlmModelCatalog({
        async fetchModels() {
            return [{ id: "minimax-m3.1-flash-free" }];
        },
    });

    const models = await catalog.list(opencodeGoConfig, { requireTokenCapacity: true });
    const target = models.find(model => model.id === "minimax-m3.1-flash-free");

    assert.ok(target);
    assert.equal(target.availabilitySource, "live");
    assert.equal(target.metadataSource, "execution");
    assert.equal(target.executionApi, "openai-completions");
    assert.equal(target.contextWindowTokens, 1_000_000);
    assert.equal(target.maxOutputTokens, 524_288);
    assert.equal(target.selectable, true);
});

test("ModelCatalog: 执行元数据不会将离线 OpenCode Go 模型加入在线结果", async () => {
    const catalog = createLlmModelCatalog({
        async fetchModels() {
            return [{ id: "kimi-k3" }];
        },
    });

    const models = await catalog.list(opencodeGoConfig);

    assert.equal(models.some(model => model.id === "minimax-m3.1-flash-free"), false);
});

test("ModelCatalog: opencode-go 无在线拉取时回退静态目录", async () => {
    const catalog = new DefaultLlmModelCatalog();
    const result = await catalog.list(opencodeGoConfig);

    assert.ok(result.length > 0);
    assert.ok(result.some((m) => m.id === "kimi-k3"));
    assert.equal(result.every((m) => m.availabilitySource === "catalog"), true);
    assert.equal(result.every((m) => m.metadataSource === "catalog"), true);
});

test("ModelCatalog: opencode-go 鉴权失败禁止降级到静态目录", async () => {
    const rejectingFetcher: ProviderModelFetcher = {
        async fetchModels() {
            throw new ModelCatalogError("authentication", "Provider \"opencode-go\" authentication failed.", 401);
        },
    };

    const catalog = createLlmModelCatalog(rejectingFetcher);
    await assert.rejects(
        async () => { await catalog.list(opencodeGoConfig); },
        (err: unknown) => err instanceof ModelCatalogError && err.kind === "authentication",
    );
});
