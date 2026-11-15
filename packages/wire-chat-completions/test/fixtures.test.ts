import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    ServerSentEventDecoder,
    type LLMRequest,
    type LLMStreamEvent,
    type ServerSentEvent,
} from "../../llm-core/src/index";
import {
    ChatCompletionsIncompleteError,
    ChatCompletionsStreamAssembler,
    chatTextFormat,
} from "../src/index";

const identity = {
    provider: "openai-compatible" as const,
    endpoint: "https://gateway.example.test/v1",
    model: "fixture-model",
    protocol: "openai-chat" as const,
};

const TOOLS = [
    {
        id: "read_file",
        description: "Read a file",
        parametersSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
    },
    {
        id: "write_file",
        description: "Write a file",
        parametersSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
    },
];

function optionsFor(request: LLMRequest) {
    return {
        identity,
        request,
        textFormat: chatTextFormat(request),
        toolCallIds: { generateMissing: "keep" as const, streamMissing: "reject" as const },
    };
}

async function readFixture(name: string): Promise<string> {
    return readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

async function readJson<T>(name: string): Promise<T> {
    return JSON.parse(await readFixture(name)) as T;
}

/**
 * 回放一段预录 SSE：只经过分帧与事件映射，不创建连接、不发起网络请求。
 * 分片边界固定为 7 字符，用于证明分帧不依赖真实到达边界。
 */
async function replayInto(name: string, request: LLMRequest, events: LLMStreamEvent[]): Promise<void> {
    const text = await readFixture(`${name}.sse`);
    const decoder = new ServerSentEventDecoder();
    const assembler = new ChatCompletionsStreamAssembler(optionsFor(request));
    events.push({ kind: "started" });
    let done = false;
    const consume = (event: ServerSentEvent) => {
        if (done || event.data === "[DONE]") {
            done = true;
            return;
        }
        for (const mapped of assembler.push(JSON.parse(event.data))) events.push(mapped);
    };
    for (let offset = 0; offset < text.length; offset += 7) {
        for (const event of decoder.push(text.slice(offset, offset + 7))) consume(event);
    }
    for (const event of decoder.finish()) consume(event);
    for (const mapped of assembler.finish()) events.push(mapped);
}

test("预录文本与 reasoning 流逐帧复现，且不需要凭据", async () => {
    const request: LLMRequest = {
        messages: [{ role: "user", content: "Summarize." }],
        structuredOutput: {
            name: "answer",
            schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false },
        },
    };
    const events: LLMStreamEvent[] = [];
    await replayInto("chat-stream-text-reasoning", request, events);
    const expected = await readJson("chat-stream-text-reasoning.events.json");
    assert.deepEqual(events, expected);
});

test("预录工具调用流逐帧复现分片参数与晚到身份", async () => {
    const request: LLMRequest = {
        messages: [{ role: "user", content: "Read." }],
        tools: TOOLS,
        toolChoice: "required",
        acceptedFinishReasons: ["stop", "tool_calls"],
    };
    const events: LLMStreamEvent[] = [];
    await replayInto("chat-stream-tool-calls", request, events);
    const expected = await readJson("chat-stream-tool-calls.events.json");
    assert.deepEqual(events, expected);
});

test("预录截断流以稳定分类失败且不产生成功完成", async () => {
    const request: LLMRequest = { messages: [{ role: "user", content: "Summarize." }] };
    const expected = await readJson<{ readonly reason: string }>("chat-stream-truncated.error.json");
    const events: LLMStreamEvent[] = [];
    await assert.rejects(
        replayInto("chat-stream-truncated", request, events),
        (error: unknown) => error instanceof ChatCompletionsIncompleteError && error.reason === expected.reason,
    );
    assert.equal(events.some(event => event.kind === "completed"), false);
});
