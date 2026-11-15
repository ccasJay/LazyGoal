import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { LLMRequest } from "../../llm-core/src/index";
import { buildChatCompletionsRequest, buildChatCompletionsStreamRequest } from "../src/index";

const identity = {
    provider: "openai-compatible" as const,
    endpoint: "https://gateway.example.test/v1",
    model: "fixture-model",
    protocol: "openai-chat" as const,
};

async function readGolden(name: string): Promise<unknown> {
    return JSON.parse(await readFile(fileURLToPath(new URL(`./golden/${name}`, import.meta.url)), "utf8")) as unknown;
}

test("非流式文本请求与迁移前 golden 逐字段相等", async () => {
    const request: LLMRequest = {
        messages: [
            { role: "system", content: "You are helpful." },
            { role: "user", content: "Summarize." },
        ],
        maxOutputTokens: 1024,
        structuredOutput: {
            name: "answer",
            schema: {
                type: "object",
                properties: { answer: { type: "string" } },
                required: ["answer"],
                additionalProperties: false,
            },
        },
    };
    const body = buildChatCompletionsRequest(request, { model: "golden-model", identity });
    assert.deepEqual(body, await readGolden("request-plain.json"));
});

test("工具流式请求与迁移前 golden 逐字段相等", async () => {
    const request: LLMRequest = {
        messages: [{ role: "user", content: "Read." }],
        tools: [{
            id: "read_file",
            description: "Read a file",
            parametersSchema: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
                additionalProperties: false,
            },
        }],
        toolChoice: "required",
        toolArgumentConstraint: "strict",
        parallelToolCalls: false,
        includeUsage: true,
    };
    const body = buildChatCompletionsStreamRequest(request, { model: "golden-model", identity });
    assert.deepEqual(body, await readGolden("request-tools-stream.json"));
});

test("无原生结构约束的网关请求不发送 response_format", async () => {
    const request: LLMRequest = {
        messages: [{ role: "user", content: "Summarize." }],
        maxOutputTokens: 512,
        structuredOutput: {
            name: "answer",
            schema: { type: "object", properties: { answer: { type: "string" } } },
        },
    };
    const body = buildChatCompletionsRequest(request, {
        model: "gateway-model",
        identity,
        nativeStructuredOutput: false,
    });
    assert.deepEqual(body, await readGolden("request-gateway-no-native.json"));
});
