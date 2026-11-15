import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";

import {
    OpenAICompatible,
    OpenAIIncompleteResponseError,
    OpenAIRefusalError,
    StructuredOutputModeOpenAICompatible,
    type OpenAICompatibleConfig,
} from "../src/index";
import type { StructuredOutputMode } from "../../llm-core/src/llm-config";
import {
    createContentBlockStreamTracker,
    readAssistantText,
    readNormalizedUsage,
    readReasoningText,
    readToolCalls,
    type LLMRequest,
    type LLMStreamEvent,
} from "../../llm-core/src/index";

const TOOLS = [
    { id: "read_file", description: "Read a file", parametersSchema: { type: "object", properties: {} } },
    { id: "write_file", description: "Write a file", parametersSchema: { type: "object", properties: {} } },
];

function adapter(baseURL: string, config: Partial<OpenAICompatibleConfig> = {}, mode: StructuredOutputMode = "prompt_only") {
    return new StructuredOutputModeOpenAICompatible({
        apiKey: "test-key", baseURL: `${baseURL}/v1`, model: "stream-model",
        ...config,
    }, mode);
}

function requestDrivenAdapter(baseURL: string) {
    return new OpenAICompatible({ apiKey: "test-key", provider: "openai-compatible", baseURL: `${baseURL}/v1`, model: "stream-model" });
}

async function withServer(
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
    run: (baseURL: string) => Promise<void>,
): Promise<void> {
    const server = createServer((request, response) => { void handler(request, response); });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address !== null && typeof address !== "string");
    try {
        await run(`http://127.0.0.1:${address.port}`);
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}

/** 单个 SSE 数据帧；不附加结束标记，便于按到达顺序分段写入。 */
function frames(chunks: readonly unknown[]): string {
    return chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("");
}

function sse(chunks: readonly unknown[]): string {
    return `${frames(chunks)}data: [DONE]\n\n`;
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): Record<string, unknown> {
    return {
        id: "chatcmpl-1", object: "chat.completion.chunk", created: 1, model: "stream-model",
        choices: [{ index: 0, delta, finish_reason: finishReason }],
    };
}

async function readBody(request: IncomingMessage): Promise<Record<string, any>> {
    let data = "";
    request.setEncoding("utf8");
    for await (const piece of request) data += piece;
    return JSON.parse(data) as Record<string, any>;
}

test("真实 SDK 流映射分片文本、两个工具索引、晚到身份与用量尾部", async () => {
    const request = { messages: [{ role: "user", content: "开始" }], tools: TOOLS, toolChoice: "required" } satisfies LLMRequest;
    const recorded: Record<string, any>[] = [];
    let releaseTail!: () => void;
    const tailReleased = new Promise<void>(resolve => { releaseTail = resolve; });
    let tailWritten = false;

    await withServer(async (incoming, outgoing) => {
        recorded.push(await readBody(incoming));
        outgoing.writeHead(200, { "Content-Type": "text/event-stream" });
        outgoing.write(frames([
            chunk({ role: "assistant", content: "先说明" }),
            chunk({ reasoning_content: "先看实现" }),
            chunk({ content: "，再调用。" }),
            chunk({ tool_calls: [{ index: 0, id: "call-a", type: "function", function: { name: "read_file", arguments: '{"path"' } }] }),
        ]));
        await tailReleased;
        tailWritten = true;
        outgoing.write(sse([
            chunk({ tool_calls: [{ index: 0, function: { arguments: ':"README.md"}' } }] }),
            chunk({ tool_calls: [{ index: 1, id: "call-b", type: "function", function: { name: "write_file", arguments: '{"path":"out.md",' } }] }),
            chunk({ tool_calls: [{ index: 1, function: { arguments: '"content":"x"}' } }] }),
            chunk({}, "tool_calls"),
            { id: "chatcmpl-1", object: "chat.completion.chunk", created: 1, model: "stream-model", choices: [], usage: { prompt_tokens: 11, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 3 } } },
        ]));
        outgoing.end();
    }, async baseURL => {
        const events: LLMStreamEvent[] = [];
        const tracker = createContentBlockStreamTracker();
        let released = false;
        const stream = adapter(baseURL).stream?.(request);
        assert.ok(stream);
        for await (const event of stream) {
            tracker.accept(event);
            events.push(event);
            if (!released && events.some(item => item.kind === "content_block_delta")) {
                // 首个增量到达时，尾部 chunk 尚未写入：真实增量可被逐步观察。
                assert.equal(tailWritten, false);
                released = true;
                releaseTail();
            }
        }
        assert.equal(tailWritten, true);
        const response = tracker.result();

        assert.equal(events[0]?.kind, "started");
        assert.deepEqual(response.blocks.map(block => block.index), [0, 1, 2, 3]);
        assert.deepEqual(response.blocks.map(block => block.type), ["text", "reasoning", "tool_call", "tool_call"]);
        assert.equal(readAssistantText(response), "先说明，再调用。");
        assert.equal(readReasoningText(response), "先看实现");
        assert.deepEqual(readToolCalls(response), [
            { callId: "call-a", toolId: "read_file", argumentsJson: '{"path":"README.md"}' },
            { callId: "call-b", toolId: "write_file", argumentsJson: '{"path":"out.md","content":"x"}' },
        ]);
        assert.deepEqual(readNormalizedUsage(response.providerMetadata), {
            inputTokens: 11, outputTokens: 7, cachedInputTokens: 3,
        });
        assert.deepEqual((response.providerMetadata as Record<string, unknown>).finishReason, "tool_calls");
        assert.deepEqual(response.blocks.find(block => block.type === "reasoning" && block.source === "reasoning_content"), {
            index: 1, type: "reasoning", source: "reasoning_content", text: "先看实现",
        });
        assert.equal("reasoningContent" in (response.continuation ?? {}), false);
        // 已结束的工具块只在整个响应正常结束后才出现，且与最终响应逐项一致。
        const completedKinds = events.filter(event => event.kind === "content_block_completed").map(event => event.kind === "content_block_completed" ? event.block.index : -1);
        assert.deepEqual(completedKinds, [0, 1, 2, 3]);
        assert.equal(events.at(-1)?.kind, "completed");
    });

    assert.equal(recorded.length, 1, "流式调用只发起一次网络请求");
    assert.equal(recorded[0]?.stream, true);
    assert.deepEqual(recorded[0]?.stream_options, { include_usage: true });
    assert.equal(recorded[0]?.tool_choice, "required");
    assert.equal(recorded[0]?.parallel_tool_calls, false);
    assert.equal(recorded[0]?.response_format, undefined);
    assert.equal(recorded[0]?.tools.length, 2);
});

test("请求驱动的 OpenAI-compatible Adapter 共用实例并只按请求字段构造工具生成", async () => {
    const recorded: Record<string, any>[] = [];
    await withServer(async (incoming, outgoing) => {
        recorded.push(await readBody(incoming));
        outgoing.writeHead(200, { "Content-Type": "text/event-stream" });
        outgoing.end(sse([
            chunk({ tool_calls: [{ index: 0, id: "call-native", type: "function", function: { name: "read_file", arguments: "{}" } }] }),
            chunk({}, "stop"),
        ]));
    }, async baseURL => {
        const instance = requestDrivenAdapter(baseURL);
        assert.equal(Object.hasOwn(instance, "structuredOutputMode"), false);
        const events = [];
        assert.ok(instance.stream);
        for await (const event of instance.stream({
            messages: [{ role: "user", content: "Read." }],
            tools: [TOOLS[0]!],
            toolChoice: "auto",
            acceptedFinishReasons: ["stop", "tool_calls"],
        })) events.push(event);
        assert.equal(events.at(-1)?.kind, "completed");
    });

    assert.equal(recorded.length, 1);
    const request = recorded[0]!;
    assert.equal(request.tool_choice, "auto");
    assert.equal(request.parallel_tool_calls, undefined);
    assert.equal(request.stream_options, undefined);
    assert.equal(request.response_format, undefined);
    assert.deepEqual(request.tools, [{
        type: "function",
        function: { name: "read_file", description: "Read a file", parameters: TOOLS[0]!.parametersSchema },
    }]);
});

test("OpenAI-compatible 只在完整 stop/tool_calls 终态交付响应并保留 reasoning 来源", async () => {
    const requests: Record<string, any>[] = [];
    await withServer(async (incoming, outgoing) => {
        requests.push(await readBody(incoming));
        outgoing.writeHead(200, { "Content-Type": "text/event-stream" });
        outgoing.end(sse([
            chunk({ reasoning_content: "summary" }),
            chunk({ thought: "extension" }),
            chunk({ tool_calls: [{ index: 0, id: "call-id", type: "function", function: { name: "read_file", arguments: "{}" } }] }),
            chunk({}, "stop"),
        ]));
    }, async baseURL => {
        const events: LLMStreamEvent[] = [];
        for await (const event of requestDrivenAdapter(baseURL).stream({
            messages: [{ role: "user", content: "Read." }], tools: [TOOLS[0]!], toolChoice: "auto",
            acceptedFinishReasons: ["stop", "tool_calls"],
        })) events.push(event);
        const completed = events.at(-1);
        assert.equal(completed?.kind, "completed");
        if (completed?.kind !== "completed") return;
        assert.deepEqual(completed.response.blocks.filter(block => block.type === "reasoning").map(block => block.type === "reasoning" ? block.source : undefined), [
            "reasoning_content", "thought",
        ]);
        assert.deepEqual(completed.response.continuation, { identity: completed.response.continuation?.identity });
        assert.equal((completed.response.providerMetadata as Record<string, unknown>).finishReason, "stop");
    });
    assert.equal(requests.length, 1);

    for (const scenario of [
        { reason: "length", finish: "length", deltas: [{ tool_calls: [{ index: 0, id: "call-id", type: "function", function: { name: "read_file", arguments: "{}" } }] }] },
        { reason: "content_filter", finish: "content_filter", deltas: [{ content: "partial" }] },
        { reason: "missing_finish_reason", finish: null, deltas: [{ content: "partial" }] },
        { reason: "tool_calls_without_call", finish: "tool_calls", deltas: [] },
        { reason: "duplicate_finish_reason", finish: "stop", deltas: [{ content: "partial" }, { _duplicateTerminal: true }] },
        { reason: "unsupported_finish_reason", finish: "unknown", deltas: [{ content: "partial" }] },
        { reason: "missing_tool_call_id", finish: "tool_calls", deltas: [{ tool_calls: [{ index: 0, type: "function", function: { name: "read_file", arguments: "{}" } }] }] },
    ] as const) {
        await withServer(async (incoming, outgoing) => {
            await readBody(incoming);
            outgoing.writeHead(200, { "Content-Type": "text/event-stream" });
            outgoing.end(sse([
                ...scenario.deltas.flatMap(delta => "_duplicateTerminal" in delta
                    ? [chunk({}, "stop")]
                    : [chunk(delta)]),
                ...(scenario.finish === null ? [] : [chunk({}, scenario.finish)]),
            ]));
        }, async baseURL => {
            const events: LLMStreamEvent[] = [];
            await assert.rejects(async () => {
                for await (const event of requestDrivenAdapter(baseURL).stream({
                    messages: [{ role: "user", content: "Read." }], tools: [TOOLS[0]!], toolChoice: "auto",
                    acceptedFinishReasons: ["stop", "tool_calls"],
                })) events.push(event);
            }, (error: unknown) => error instanceof OpenAIIncompleteResponseError && error.reason === scenario.reason);
            assert.equal(events.some(event => event.kind === "completed"), false);
        });
    }

    await withServer(async (incoming, outgoing) => {
        await readBody(incoming);
        outgoing.writeHead(200, { "Content-Type": "text/event-stream" });
        outgoing.end(sse([chunk({ refusal: "not allowed" }), chunk({}, "stop")]));
    }, async baseURL => {
        await assert.rejects(async () => {
            for await (const _event of requestDrivenAdapter(baseURL).stream({ messages: [{ role: "user", content: "Read." }] })) { }
        }, (error: unknown) => error instanceof OpenAIRefusalError && error.code === "OPENAI_REFUSAL");
    });
});

test("截断、内容过滤、无有效结束与不支持内容都不产生成功响应，也不重发请求", async () => {
    const cases: readonly { readonly name: string; readonly chunks: readonly unknown[] }[] = [
        {
            name: "长度截断",
            chunks: [
                chunk({ tool_calls: [{ index: 0, id: "call-a", type: "function", function: { name: "read_file", arguments: '{"path":"README.md"}' } }] }),
                chunk({}, "length"),
            ],
        },
        { name: "内容过滤", chunks: [chunk({ content: "部分正文" }), chunk({}, "content_filter")] },
        { name: "无有效结束", chunks: [chunk({ content: "部分正文" })] },
        { name: "不支持内容", chunks: [chunk({ content: [{ type: "image_url", image_url: { url: "https://example.test/x.png" } }] }), chunk({}, "stop")] },
    ];

    for (const testCase of cases) {
        const recorded: Record<string, any>[] = [];
        await withServer(async (incoming, outgoing) => {
            recorded.push(await readBody(incoming));
            outgoing.writeHead(200, { "Content-Type": "text/event-stream" });
            outgoing.end(sse(testCase.chunks));
        }, async baseURL => {
            const events: LLMStreamEvent[] = [];
            const stream = adapter(baseURL).stream?.({
                messages: [{ role: "user", content: "开始" }], tools: TOOLS, toolChoice: "required",
            });
            assert.ok(stream);
            await assert.rejects(async () => {
                for await (const event of stream) events.push(event);
            }, (error: unknown) => error instanceof OpenAIIncompleteResponseError
                && error.code === "OPENAI_INCOMPLETE_RESPONSE", testCase.name);
            assert.equal(events.some(event => event.kind === "completed"), false, testCase.name);
        });
        assert.equal(recorded.length, 1, testCase.name);
    }
});

test("同一确定性内容的 generate 与 stream 读视图、续接与用量等价", async () => {
    const streamChunks = [
        chunk({ role: "assistant", content: "第一段" }),
        chunk({ reasoning_content: "内部推演" }),
        chunk({ content: "第二段" }),
        chunk({ tool_calls: [{ index: 0, id: "call-a", type: "function", function: { name: "read_file", arguments: '{"path":"README.md"}' } }] }),
        chunk({}, "tool_calls"),
        { id: "chatcmpl-1", object: "chat.completion.chunk", created: 1, model: "stream-model", choices: [], usage: { prompt_tokens: 11, completion_tokens: 7 } },
    ];
    const completion = {
        id: "chatcmpl-1", object: "chat.completion", created: 1, model: "stream-model",
        choices: [{
            index: 0, finish_reason: "tool_calls",
            message: {
                role: "assistant", content: "第一段第二段", reasoning_content: "内部推演",
                tool_calls: [{ id: "call-a", type: "function", function: { name: "read_file", arguments: '{"path":"README.md"}' } }],
            },
        }],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
    };

    await withServer(async (incoming, outgoing) => {
        const body = await readBody(incoming);
        outgoing.writeHead(200, { "Content-Type": body.stream === true ? "text/event-stream" : "application/json" });
        outgoing.end(body.stream === true ? sse(streamChunks) : JSON.stringify(completion));
    }, async baseURL => {
        const request = { messages: [{ role: "user", content: "开始" }], tools: TOOLS, toolChoice: "required" } satisfies LLMRequest;
        const instance = adapter(baseURL);
        const generated = await instance.generate(request);
        const events: LLMStreamEvent[] = [];
        const tracker = createContentBlockStreamTracker();
        assert.ok(instance.stream);
        for await (const event of instance.stream(request)) {
            tracker.accept(event);
            events.push(event);
        }
        const streamed = tracker.result();

        assert.equal(readAssistantText(streamed), readAssistantText(generated));
        assert.equal(readReasoningText(streamed), readReasoningText(generated));
        assert.deepEqual(readToolCalls(streamed), readToolCalls(generated));
        assert.deepEqual(readNormalizedUsage(streamed.providerMetadata), readNormalizedUsage(generated.providerMetadata));
        assert.deepEqual(streamed.continuation, generated.continuation);
    });
});

test("流式响应缺失用量尾部时用量整体缺省，不补零", async () => {
    await withServer(async (incoming, outgoing) => {
        await readBody(incoming);
        outgoing.writeHead(200, { "Content-Type": "text/event-stream" });
        outgoing.end(sse([chunk({ content: "回答" }), chunk({}, "stop")]));
    }, async baseURL => {
        const instance = adapter(baseURL);
        const events: LLMStreamEvent[] = [];
        assert.ok(instance.stream);
        for await (const event of instance.stream({ messages: [{ role: "user", content: "开始" }] })) events.push(event);
        const completed = events.at(-1);
        assert.equal(completed?.kind, "completed");
        const response = completed?.kind === "completed" ? completed.response : undefined;
        assert.equal(readAssistantText(response!), "回答");
        assert.equal(readNormalizedUsage(response!.providerMetadata), undefined);
        assert.equal(JSON.stringify(response!.providerMetadata).includes("inputTokens"), false);
    });
});

test("OpenAI native stream releases the supplier iterator without masking the primary failure", async () => {
    const adapter = new OpenAICompatible({ apiKey: "key", baseURL: "https://example.test/v1", model: "model" });
    let released = 0;
    (adapter as any).client = { chat: { completions: { create: async () => ({
        [Symbol.asyncIterator]() {
            let step = 0;
            return {
                async next() {
                    step += 1;
                    if (step === 1) {
                        return { done: false as const, value: {
                            id: "chatcmpl-1", model: "model", created: 0,
                            choices: [{ index: 0, delta: { content: "partial" }, finish_reason: null }],
                        } };
                    }
                    throw new Error("stream transport failed");
                },
                async return() {
                    released += 1;
                    throw new Error("iterator cleanup failed");
                },
            };
        },
    }) } } };

    const events: LLMStreamEvent[] = [];
    await assert.rejects(async () => {
        assert.ok(adapter.stream);
        for await (const event of adapter.stream({ messages: [{ role: "user", content: "开始" }] })) events.push(event);
    }, /stream transport failed/);
    assert.equal(released, 1);
    assert.equal(events.some(event => event.kind === "completed"), false);

    // 消费方提前退出同样释放本次迭代器。
    released = 0;
    assert.ok(adapter.stream);
    for await (const event of adapter.stream({ messages: [{ role: "user", content: "开始" }] })) {
        if (event.kind === "content_block_delta") break;
    }
    assert.equal(released, 1);
});
