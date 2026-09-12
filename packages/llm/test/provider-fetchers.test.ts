import assert from "node:assert/strict";
import test from "node:test";

import type { LlmConfig } from "../src/config.js";
import { createLlmModelCatalog, ModelCatalogError } from "../src/model-catalog.js";
import { DefaultProviderModelFetcher } from "../src/provider-fetchers.js";

const CANARY_API_KEY = "canary-secret-token-xyz987";

test("ProviderModelFetcher: OpenAI 正常拉取、默认与覆盖端点、认证头拼装与单页映射", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};

    const fakeFetch: typeof fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        return new Response(
            JSON.stringify({
                data: [
                    { id: "gpt-4o", object: "model" },
                    { id: "o3-mini", object: "model" },
                ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    };

    const fetcher = new DefaultProviderModelFetcher();

    // 1. 默认官方端点
    const config1: LlmConfig = {
        provider: "openai",
        model: "gpt-4o",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "strict",
    };
    const result1 = await fetcher.fetchModels(config1, { fetch: fakeFetch });
    assert.equal(capturedUrl, "https://api.openai.com/v1/models");
    assert.equal(capturedHeaders["Authorization"], `Bearer ${CANARY_API_KEY}`);
    assert.deepEqual(result1, [{ id: "gpt-4o" }, { id: "o3-mini" }]);

    // 2. 自定义 baseURL
    const config2: LlmConfig = {
        provider: "openai",
        model: "gpt-4o",
        apiKey: CANARY_API_KEY,
        baseURL: "https://custom.openai.proxy/v1/",
        structuredOutputMode: "strict",
    };
    await fetcher.fetchModels(config2, { fetch: fakeFetch });
    assert.equal(capturedUrl, "https://custom.openai.proxy/v1/models");
});

test("ProviderModelFetcher: Google 正常拉取、去除 models/ 前缀与两页分页遍历", async () => {
    const urls: string[] = [];
    const headersList: Record<string, string>[] = [];

    const fakeFetch: typeof fetch = async (input, init) => {
        const urlStr = String(input);
        urls.push(urlStr);
        headersList.push((init?.headers ?? {}) as Record<string, string>);

        const url = new URL(urlStr);
        const pageToken = url.searchParams.get("pageToken");

        if (!pageToken) {
            // 第 1 页
            return new Response(
                JSON.stringify({
                    models: [
                        {
                            name: "models/gemini-2.5-flash",
                            displayName: "Gemini 2.5 Flash",
                            inputTokenLimit: 1048576,
                            outputTokenLimit: 8192,
                            supportedGenerationMethods: ["generateContent", "countTokens"],
                        },
                    ],
                    nextPageToken: "token-page-2",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        } else if (pageToken === "token-page-2") {
            // 第 2 页
            return new Response(
                JSON.stringify({
                    models: [
                        {
                            name: "models/gemini-2.5-pro",
                            displayName: "Gemini 2.5 Pro",
                            inputTokenLimit: 2097152,
                            outputTokenLimit: 65536,
                            supportedGenerationMethods: ["generateContent"],
                        },
                    ],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        }

        throw new Error("Unexpected pageToken");
    };

    const fetcher = new DefaultProviderModelFetcher();
    const config: LlmConfig = {
        provider: "google",
        model: "gemini-2.5-flash",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "strict",
    };

    const models = await fetcher.fetchModels(config, { fetch: fakeFetch });

    assert.equal(urls.length, 2);
    assert.equal(urls[0], "https://generativelanguage.googleapis.com/v1beta/models");
    assert.equal(urls[1], "https://generativelanguage.googleapis.com/v1beta/models?pageToken=token-page-2");
    assert.equal(headersList[0]?.["x-goog-api-key"], CANARY_API_KEY);
    assert.equal(headersList[1]?.["x-goog-api-key"], CANARY_API_KEY);

    assert.equal(models.length, 2);
    assert.equal(models[0]?.id, "gemini-2.5-flash");
    assert.equal(models[0]?.displayName, "Gemini 2.5 Flash");
    assert.equal(models[0]?.contextWindowTokens, 1048576);
    assert.equal(models[0]?.maxOutputTokens, 8192);
    assert.equal(models[0]?.isTextGeneration, true);

    assert.equal(models[1]?.id, "gemini-2.5-pro");
    assert.equal(models[1]?.contextWindowTokens, 2097152);
});

test("ProviderModelFetcher: Google 拒绝不前进的重复 pageToken", async () => {
    let callCount = 0;
    const fakeFetch: typeof fetch = async () => {
        callCount++;
        return new Response(
            JSON.stringify({
                models: [{ name: "models/gemini-1.5-flash" }],
                nextPageToken: "stuck-token",
            }),
            { status: 200 },
        );
    };

    const fetcher = new DefaultProviderModelFetcher();
    const config: LlmConfig = {
        provider: "google",
        model: "gemini-1.5-flash",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "strict",
    };

    await assert.rejects(
        async () => {
            await fetcher.fetchModels(config, { fetch: fakeFetch });
        },
        (err: unknown) => {
            assert(err instanceof ModelCatalogError);
            assert.equal(err.kind, "protocol");
            assert.match(err.message, /non-advancing page token/);
            assert.doesNotMatch(err.message, new RegExp(CANARY_API_KEY));
            return true;
        },
    );
    assert.equal(callCount, 2);
});

test("ProviderModelFetcher: Anthropic 认证头、版本头与 cursor 分页遍历", async () => {
    const urls: string[] = [];
    const headersList: Record<string, string>[] = [];

    const fakeFetch: typeof fetch = async (input, init) => {
        const urlStr = String(input);
        urls.push(urlStr);
        headersList.push((init?.headers ?? {}) as Record<string, string>);

        const url = new URL(urlStr);
        const afterId = url.searchParams.get("after_id");

        if (!afterId) {
            return new Response(
                JSON.stringify({
                    data: [
                        { id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" },
                    ],
                    has_more: true,
                    last_id: "claude-sonnet-4-5",
                }),
                { status: 200 },
            );
        } else if (afterId === "claude-sonnet-4-5") {
            return new Response(
                JSON.stringify({
                    data: [
                        { id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
                    ],
                    has_more: false,
                }),
                { status: 200 },
            );
        }
        throw new Error("Unexpected after_id");
    };

    const fetcher = new DefaultProviderModelFetcher();
    const config: LlmConfig = {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "prompt_only",
    };

    const models = await fetcher.fetchModels(config, { fetch: fakeFetch });

    assert.equal(urls.length, 2);
    assert.equal(urls[0], "https://api.anthropic.com/v1/models");
    assert.equal(urls[1], "https://api.anthropic.com/v1/models?after_id=claude-sonnet-4-5");
    assert.equal(headersList[0]?.["x-api-key"], CANARY_API_KEY);
    assert.equal(headersList[0]?.["anthropic-version"], "2023-06-01");

    assert.equal(models.length, 2);
    assert.equal(models[0]?.id, "claude-sonnet-4-5");
    assert.equal(models[0]?.displayName, "Claude Sonnet 4.5");
    assert.equal(models[1]?.id, "claude-haiku-4-5");
});

test("ProviderModelFetcher: Anthropic 拒绝 has_more 为 true 但 last_id 不前进的 cursor", async () => {
    let callCount = 0;
    const fakeFetch: typeof fetch = async () => {
        callCount++;
        return new Response(
            JSON.stringify({
                data: [{ id: "claude-sonnet-4-5" }],
                has_more: true,
                last_id: "stuck-cursor",
            }),
            { status: 200 },
        );
    };

    const fetcher = new DefaultProviderModelFetcher();
    const config: LlmConfig = {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "prompt_only",
    };

    await assert.rejects(
        async () => {
            await fetcher.fetchModels(config, { fetch: fakeFetch });
        },
        (err: unknown) => {
            assert(err instanceof ModelCatalogError);
            assert.equal(err.kind, "protocol");
            assert.match(err.message, /non-advancing cursor/);
            return true;
        },
    );
    assert.equal(callCount, 2);
});

test("ProviderModelFetcher: OpenRouter 端点与富元数据映射（容量、输出上限、视觉能力）", async () => {
    let capturedUrl = "";
    let capturedAuth = "";

    const fakeFetch: typeof fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
        return new Response(
            JSON.stringify({
                data: [
                    {
                        id: "anthropic/claude-3.5-sonnet",
                        name: "Claude 3.5 Sonnet",
                        context_length: 200000,
                        top_provider: {
                            max_completion_tokens: 8192,
                        },
                        architecture: {
                            modality: "text+image->text",
                        },
                    },
                    {
                        id: "stabilityai/stable-diffusion-xl",
                        name: "SDXL",
                        architecture: {
                            modality: "text->image",
                        },
                    },
                ],
            }),
            { status: 200 },
        );
    };

    const fetcher = new DefaultProviderModelFetcher();
    const config: LlmConfig = {
        provider: "openrouter",
        model: "anthropic/claude-3.5-sonnet",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "prompt_only",
    };

    const models = await fetcher.fetchModels(config, { fetch: fakeFetch });

    assert.equal(capturedUrl, "https://openrouter.ai/api/v1/models");
    assert.equal(capturedAuth, `Bearer ${CANARY_API_KEY}`);

    assert.equal(models.length, 2);
    const m1 = models[0]!;
    assert.equal(m1.id, "anthropic/claude-3.5-sonnet");
    assert.equal(m1.displayName, "Claude 3.5 Sonnet");
    assert.equal(m1.contextWindowTokens, 200000);
    assert.equal(m1.maxOutputTokens, 8192);
    assert.equal(m1.vision, true);
    assert.equal(m1.isTextGeneration, true);

    const m2 = models[1]!;
    assert.equal(m2.id, "stabilityai/stable-diffusion-xl");
    assert.equal(m2.vision, false);
    assert.equal(m2.isTextGeneration, false);
});

test("ProviderModelFetcher: DeepSeek 官方端点与列表解析", async () => {
    let capturedUrl = "";
    let capturedAuth = "";

    const fakeFetch: typeof fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
        return new Response(
            JSON.stringify({
                data: [
                    { id: "deepseek-chat" },
                    { id: "deepseek-reasoner" },
                ],
            }),
            { status: 200 },
        );
    };

    const fetcher = new DefaultProviderModelFetcher();
    const config: LlmConfig = {
        provider: "deepseek",
        model: "deepseek-chat",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "prompt_only",
    };

    const models = await fetcher.fetchModels(config, { fetch: fakeFetch });

    assert.equal(capturedUrl, "https://api.deepseek.com/models");
    assert.equal(capturedAuth, `Bearer ${CANARY_API_KEY}`);
    assert.deepEqual(
        models.map((m) => m.id),
        ["deepseek-chat", "deepseek-reasoner"],
    );
});

test("ProviderModelFetcher: openai-compatible 端点、可选认证与 data/models 数组兼容", async () => {
    let capturedUrl = "";
    let capturedAuth: string | undefined = undefined;

    const fakeFetch: typeof fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"];
        return new Response(
            JSON.stringify({
                models: [
                    { id: "custom-qwen-72b" },
                    { id: "custom-deepseek-v3" },
                ],
            }),
            { status: 200 },
        );
    };

    const fetcher = new DefaultProviderModelFetcher();
    const config: LlmConfig = {
        provider: "openai-compatible",
        model: "custom-qwen-72b",
        apiKey: CANARY_API_KEY,
        baseURL: "http://127.0.0.1:8000/v1/",
        structuredOutputMode: "prompt_only",
        contextWindowTokens: 32768,
        maxOutputTokens: 4096,
    };

    const models = await fetcher.fetchModels(config, { fetch: fakeFetch });

    assert.equal(capturedUrl, "http://127.0.0.1:8000/v1/models");
    assert.equal(capturedAuth, `Bearer ${CANARY_API_KEY}`);
    assert.deepEqual(
        models.map((m) => m.id),
        ["custom-qwen-72b", "custom-deepseek-v3"],
    );
});

test("ProviderModelFetcher: HTTP 状态码映射到约定的脱敏错误分类且不泄露凭据或响应正文", async () => {
    const statusCases = [
        { status: 401, expectedKind: "authentication" },
        { status: 403, expectedKind: "permission" },
        { status: 404, expectedKind: "unsupported" },
        { status: 405, expectedKind: "unsupported" },
        { status: 501, expectedKind: "unsupported" },
        { status: 500, expectedKind: "unavailable" },
        { status: 502, expectedKind: "unavailable" },
        { status: 503, expectedKind: "unavailable" },
        { status: 400, expectedKind: "protocol" },
        { status: 429, expectedKind: "protocol" },
    ] as const;

    const fetcher = new DefaultProviderModelFetcher();
    const config: LlmConfig = {
        provider: "openai",
        model: "gpt-4o",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "strict",
    };

    for (const { status, expectedKind } of statusCases) {
        const fakeFetch: typeof fetch = async () => {
            return new Response("RAW SENSITIVE BODY TEXT: { error: 'secret-detail' }", {
                status,
                headers: { "Content-Type": "text/plain" },
            });
        };

        await assert.rejects(
            async () => {
                await fetcher.fetchModels(config, { fetch: fakeFetch });
            },
            (err: unknown) => {
                assert(err instanceof ModelCatalogError);
                assert.equal(err.kind, expectedKind);
                assert.equal(err.status, status);
                // 确保错误信息中不含敏感凭据及原始敏感响应体
                assert.doesNotMatch(err.message, new RegExp(CANARY_API_KEY));
                assert.doesNotMatch(err.message, /RAW SENSITIVE BODY/);
                return true;
            },
        );
    }
});

test("ProviderModelFetcher: 网络故障映射为 unavailable 且不泄露凭据", async () => {
    const fakeFetch: typeof fetch = async () => {
        throw new TypeError("fetch failed: ECONNREFUSED 127.0.0.1:80");
    };

    const fetcher = new DefaultProviderModelFetcher();
    const config: LlmConfig = {
        provider: "google",
        model: "gemini-2.5-flash",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "strict",
    };

    await assert.rejects(
        async () => {
            await fetcher.fetchModels(config, { fetch: fakeFetch });
        },
        (err: unknown) => {
            assert(err instanceof ModelCatalogError);
            assert.equal(err.kind, "unavailable");
            assert.doesNotMatch(err.message, new RegExp(CANARY_API_KEY));
            return true;
        },
    );
});

test("ProviderModelFetcher: 超时控制共享并映射为 timeout", async () => {
    const fakeFetch: typeof fetch = async (_input, init) => {
        return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
                const err = new Error("aborted");
                err.name = "AbortError";
                reject(err);
            });
        });
    };

    // 使用较短超时 20ms 测试超时机制
    const fetcher = new DefaultProviderModelFetcher(20);
    const config: LlmConfig = {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "prompt_only",
    };

    await assert.rejects(
        async () => {
            await fetcher.fetchModels(config, { fetch: fakeFetch });
        },
        (err: unknown) => {
            assert(err instanceof ModelCatalogError);
            assert.equal(err.kind, "timeout");
            assert.match(err.message, /timed out after 20ms/);
            assert.doesNotMatch(err.message, new RegExp(CANARY_API_KEY));
            return true;
        },
    );
});

test("ProviderModelFetcher: 外部 AbortSignal 取消映射为 cancelled", async () => {
    const fakeFetch: typeof fetch = async (_input, init) => {
        return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
                const err = new Error("aborted");
                err.name = "AbortError";
                reject(err);
            });
        });
    };

    const fetcher = new DefaultProviderModelFetcher(10000);
    const config: LlmConfig = {
        provider: "deepseek",
        model: "deepseek-chat",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "prompt_only",
    };

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);

    await assert.rejects(
        async () => {
            await fetcher.fetchModels(config, { fetch: fakeFetch, signal: controller.signal });
        },
        (err: unknown) => {
            assert(err instanceof ModelCatalogError);
            assert.equal(err.kind, "cancelled");
            assert.doesNotMatch(err.message, new RegExp(CANARY_API_KEY));
            return true;
        },
    );
});

test("ProviderModelFetcher: 非法 JSON 与畸形响应结构映射为 protocol 错误", async () => {
    const badCases = [
        "not valid json text",
        JSON.stringify({ notData: 123 }),
        JSON.stringify({ data: "not an array" }),
        JSON.stringify({ data: [{ noId: true }] }),
        JSON.stringify({ data: [{ id: "" }] }),
    ];

    const fetcher = new DefaultProviderModelFetcher();
    const config: LlmConfig = {
        provider: "openai",
        model: "gpt-4o",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "strict",
    };

    for (const badContent of badCases) {
        const fakeFetch: typeof fetch = async () => {
            return new Response(badContent, { status: 200, headers: { "Content-Type": "application/json" } });
        };

        await assert.rejects(
            async () => {
                await fetcher.fetchModels(config, { fetch: fakeFetch });
            },
            (err: unknown) => {
                assert(err instanceof ModelCatalogError);
                assert.equal(err.kind, "protocol");
                return true;
            },
        );
    }
});

test("ProviderModelFetcher: createLlmModelCatalog() 默认集成 DefaultProviderModelFetcher 并执行在线拉取", async () => {
    let called = false;
    const fakeFetch: typeof fetch = async () => {
        called = true;
        return new Response(
            JSON.stringify({
                data: [{ id: "gpt-4o" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    };

    const catalog = createLlmModelCatalog();
    const config: LlmConfig = {
        provider: "openai",
        model: "gpt-4o",
        apiKey: CANARY_API_KEY,
        structuredOutputMode: "strict",
    };

    const result = await catalog.list(config, { fetch: fakeFetch });
    assert.equal(called, true);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, "gpt-4o");
    assert.equal(result[0]?.availabilitySource, "live");
});
