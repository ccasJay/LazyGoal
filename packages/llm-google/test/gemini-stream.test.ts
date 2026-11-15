import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";

import {
    Gemini,
    GeminiIncompleteResponseError,
} from "../src/index";
import {
    LLMRequestModeMismatchError,
    createContentBlockStreamTracker,
    readAssistantText,
    readNormalizedUsage,
    readReasoningText,
    readToolCalls,
    type LLMRequest,
    type LLMStreamEvent,
} from "../../llm-core/src/index";
import { nativeResponseMessage } from "../../model-response/src/index";
import {
    createBoundModelOutputContractBundle,
    modelOutputBindings,
    type AgentDecision,
    type BoundModelOutputRequest,
    type ModelOutputBundle,
} from "../../model-contracts/src/index";

function createModelOutputContractBundle<Result extends AgentDecision = AgentDecision>(
    request: BoundModelOutputRequest,
): ModelOutputBundle<Result> {
    return createBoundModelOutputContractBundle<Result>(request, modelOutputBindings);
}

const TOOLS = [
    { id: "read_file", description: "Read a file", parametersSchema: { type: "object", properties: {} } },
];

function adapter(baseURL: string, structuredOutputMode: "strict" | "prompt_only" = "prompt_only") {
    return new Gemini({ apiKey: "test-key", baseURL, model: "gemini-2.5-flash", structuredOutputMode });
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

function sse(chunks: readonly unknown[]): string {
    return `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("")}`;
}

async function readBody(request: IncomingMessage): Promise<Record<string, any>> {
    let data = "";
    request.setEncoding("utf8");
    for await (const piece of request) data += piece;
    return JSON.parse(data) as Record<string, any>;
}

function candidate(parts: readonly unknown[], finishReason?: string): Record<string, unknown> {
    return { candidates: [{ content: { role: "model", parts }, ...(finishReason === undefined ? {} : { finishReason }) }] };
}

test("真实 SDK 流按 Part 顺序分离文本、thought 与整块函数参数，并原样保留续接", async () => {
    const partsInOrder = [
        { text: "第一段" },
        { text: "，续写。" },
        { text: "内部推演", thought: true, thoughtSignature: "sig-1" },
        { functionCall: { id: "call-a", name: "read_file", args: { path: "README.md" } }, thoughtSignature: "sig-2" },
        { text: "结尾" },
    ];
    const recorded: { path: string; body: Record<string, any> }[] = [];
    await withServer(async (incoming, outgoing) => {
        recorded.push({ path: incoming.url ?? "", body: await readBody(incoming) });
        if (incoming.url?.includes("streamGenerateContent") !== true) {
            outgoing.writeHead(200, { "Content-Type": "application/json" });
            outgoing.end(JSON.stringify({ ...candidate([partsInOrder[4]!], "STOP"), usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 } }));
            return;
        }
        outgoing.writeHead(200, { "Content-Type": "text/event-stream" });
        outgoing.end(sse([
            candidate([partsInOrder[0]!]),
            candidate([partsInOrder[1]!]),
            candidate([partsInOrder[2]!]),
            candidate([partsInOrder[3]!]),
            { ...candidate([partsInOrder[4]!], "STOP"), usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 } },
        ]));
    }, async baseURL => {
        const instance = adapter(baseURL);
        const request: LLMRequest = { messages: [{ role: "user", content: "开始" }], tools: TOOLS, toolChoice: "required" };
        const events: LLMStreamEvent[] = [];
        const tracker = createContentBlockStreamTracker();
        assert.ok(instance.stream);
        for await (const event of instance.stream(request)) {
            tracker.accept(event);
            events.push(event);
        }
        const response = tracker.result();

        assert.match(recorded[0]!.path, /models\/gemini-2\.5-flash:streamGenerateContent\?alt=sse/u);
        assert.deepEqual(recorded[0]!.body.toolConfig.functionCallingConfig.mode, "ANY");
        assert.deepEqual(recorded[0]!.body.tools[0].functionDeclarations[0].name, "read_file");

        assert.deepEqual(response.blocks.map(block => `${block.index}:${block.type}`), [
            "0:text", "1:reasoning", "2:tool_call", "3:text",
        ]);
        assert.equal(readAssistantText(response), "第一段，续写。结尾");
        assert.equal(readReasoningText(response), "内部推演");
        assert.deepEqual(readToolCalls(response), [{
            callId: "call-a", toolId: "read_file", argumentsJson: '{"path":"README.md"}',
        }]);
        // 整块交付的工具参数：开始即完成，不伪造增量。
        const toolEvents = events.filter(event => event.kind === "content_block_started"
            ? event.blockType === "tool_call" : event.kind === "content_block_completed" && event.block.type === "tool_call");
        assert.deepEqual(toolEvents.map(event => event.kind), ["content_block_started", "content_block_completed"]);
        assert.equal(toolEvents[0]!.kind === "content_block_started" ? toolEvents[0]!.delivery : undefined, "whole");
        assert.equal(events.some(event => event.kind === "content_block_delta" && event.deltaKind === "tool_arguments"), false);
        assert.deepEqual(readNormalizedUsage(response.providerMetadata), { inputTokens: 5, outputTokens: 7 });

        // 续接 Parts 与签名按到达顺序原样保存。
        assert.deepEqual(response.continuation?.parts, partsInOrder);

        // 下一轮请求原样回放 Parts 与签名，并以函数响应配对调用身份。
        const assistantHistory = nativeResponseMessage(response);
        if ("blocks" in assistantHistory) throw new Error("Gemini history must preserve its existing parts shape");
        const replay: LLMRequest = {
            messages: [
                request.messages[0]!,
                assistantHistory,
                { role: "tool", callId: "call-a", toolId: "read_file", content: '{"observation":{"kind":"success","output":"file"}}' },
                { role: "user", content: "继续" },
            ],
            tools: TOOLS,
            toolChoice: "required",
        };
        await instance.generate(replay);
        assert.deepEqual(recorded[1]!.body.contents[1].parts, partsInOrder);
        assert.deepEqual(recorded[1]!.body.contents[2].parts[0].functionResponse, {
            name: "read_file", id: "call-a", response: { observation: { kind: "success", output: "file" } },
        });
    });

    assert.equal(recorded.length, 2);
});

test("strict 结构化流缓冲原文，投影完成后才交付唯一规范块", async () => {
    const bundle = createModelOutputContractBundle({ kind: "executing", taskPresent: true, planMode: true, authorizedTools: [] });
    const rawText = JSON.stringify({ result: { kind: "complete", summary: "完成", memoryPatch: "__lazygoal_null__", completionEvidence: "__lazygoal_absent__" } });
    const recorded: { path: string; body: Record<string, any> }[] = [];
    await withServer(async (incoming, outgoing) => {
        recorded.push({ path: incoming.url ?? "", body: await readBody(incoming) });
        if (incoming.url?.includes("streamGenerateContent") !== true) {
            outgoing.writeHead(200, { "Content-Type": "application/json" });
            outgoing.end(JSON.stringify(candidate([{ text: rawText }], "STOP")));
            return;
        }
        outgoing.writeHead(200, { "Content-Type": "text/event-stream" });
        outgoing.end(sse([
            candidate([{ text: rawText.slice(0, 30) }]),
            candidate([{ text: rawText.slice(30) }]),
            candidate([], "STOP"),
        ]));
    }, async baseURL => {
        const request: LLMRequest = { messages: [{ role: "user", content: "回答" }], structuredOutput: { name: bundle.name, schema: bundle.jsonSchema } };
        const instance = adapter(baseURL, "strict");
        const generated = await instance.generate(request);
        assert.equal(recorded[0]!.path.includes("streamGenerateContent"), false);

        const events: LLMStreamEvent[] = [];
        const tracker = createContentBlockStreamTracker();
        assert.ok(instance.stream);
        for await (const event of instance.stream(request)) {
            tracker.accept(event);
            events.push(event);
        }
        const streamed = tracker.result();
        assert.equal(recorded[1]!.path.includes("streamGenerateContent?alt=sse"), true);
        assert.equal(recorded[1]!.body.generationConfig.responseMimeType, "application/json");
        assert.equal(recorded[1]!.body.generationConfig.responseSchema.type, "OBJECT");

        // 投影前不发布任何哨兵原文，也不产生增量。
        assert.deepEqual(events.map(event => event.kind), [
            "started", "content_block_started", "content_block_completed", "completed",
        ]);
        const block = streamed.blocks[0];
        assert.equal(block?.type === "text" ? block.format : undefined, "json");
        const projected = JSON.parse(readAssistantText(streamed));
        assert.equal(projected.result.kind, "complete");
        assert.equal(projected.result.memoryPatch, null);
        assert.equal("completionEvidence" in projected.result, false);
        // generate 与 stream 共用同一投影规则。
        assert.equal(readAssistantText(streamed), readAssistantText(generated));
        assert.deepEqual(streamed.blocks, generated.blocks);
    });
});

test("截断、安全阻断、未知 Part 与无正常结束的流都失败且不重发", async () => {
    const cases: readonly { readonly name: string; readonly chunks: readonly unknown[] }[] = [
        { name: "长度截断", chunks: [candidate([{ text: "部分" }]), candidate([], "MAX_TOKENS")] },
        { name: "安全阻断", chunks: [candidate([{ text: "部分" }]), candidate([], "SAFETY")] },
        { name: "未知 Part", chunks: [candidate([{ inlineData: { mimeType: "image/png", data: "AAAA" } }]), candidate([], "STOP")] },
        { name: "无结束原因", chunks: [candidate([{ text: "部分" }])] },
        { name: "提示词被阻断", chunks: [{ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }] },
    ];

    for (const testCase of cases) {
        let requests = 0;
        await withServer(async (incoming, outgoing) => {
            requests += 1;
            await readBody(incoming);
            outgoing.writeHead(200, { "Content-Type": "text/event-stream" });
            outgoing.end(sse(testCase.chunks));
        }, async baseURL => {
            const events: LLMStreamEvent[] = [];
            const instance = adapter(baseURL);
            assert.ok(instance.stream);
            await assert.rejects(async () => {
                for await (const event of instance.stream!({ messages: [{ role: "user", content: "开始" }] })) events.push(event);
            }, (error: unknown) => error instanceof GeminiIncompleteResponseError
                || error instanceof LLMRequestModeMismatchError, testCase.name);
            assert.equal(events.some(event => event.kind === "completed"), false, testCase.name);
        });
        assert.equal(requests, 1, testCase.name);
    }
});

test("Gemini native stream releases the supplier iterator without masking the primary failure", async () => {
    const instance = adapter("http://127.0.0.1:1");
    let released = 0;
    (instance as any).client = { models: { generateContentStream: async () => ({
        [Symbol.asyncIterator]() {
            let step = 0;
            return {
                async next() {
                    step += 1;
                    if (step === 1) return { done: false as const, value: candidate([{ text: "部分正文" }]) };
                    throw new Error("stream transport failed");
                },
                async return() {
                    released += 1;
                    throw new Error("iterator cleanup failed");
                },
            };
        },
    }) } };

    const events: LLMStreamEvent[] = [];
    assert.ok(instance.stream);
    await assert.rejects(async () => {
        for await (const event of instance.stream!({ messages: [{ role: "user", content: "开始" }] })) events.push(event);
    }, /stream transport failed/);
    assert.equal(released, 1);
    assert.equal(events.some(event => event.kind === "completed"), false);

    released = 0;
    for await (const event of instance.stream!({ messages: [{ role: "user", content: "开始" }] })) {
        if (event.kind === "content_block_delta") break;
    }
    assert.equal(released, 1);
});
