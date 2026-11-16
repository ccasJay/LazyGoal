import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
    streamAnthropicMessages,
    type AnthropicMessagesConnection,
} from "../src/client";
import { AnthropicMessagesIncompleteError, AnthropicMessagesRefusalError } from "../src/errors";
import type { LLMRequest, NativeConversationIdentity } from "../../llm-core/src/index";

const identity: NativeConversationIdentity = {
    provider: "anthropic",
    endpoint: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
    protocol: "anthropic-messages",
};

/** 一次测试服务器的录制响应序列；每条目按 SSE 帧数组发送。 */
const responses: { frames?: string[]; status?: number }[] = [];
let capturedHeaders: Record<string, string> = {};

function sse(events: readonly { readonly type: string }[]): string[] {
    return events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

const BLOCK_START = (index: number, block: Record<string, unknown>) => ({ type: "content_block_start", index, content_block: block });
const BLOCK_DELTA = (index: number, delta: Record<string, unknown>) => ({ type: "content_block_delta", index, delta });
const BLOCK_STOP = (index: number) => ({ type: "content_block_stop", index });
const MESSAGE_START = { type: "message_start", message: { id: "msg_1", model: "claude-sonnet-4-5", usage: { input_tokens: 12, output_tokens: 1 } } };
const MESSAGE_DELTA = (stopReason: string, outputTokens?: number) => ({
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens ?? 7 },
});
const MESSAGE_STOP = { type: "message_stop" };

describe("Anthropic Messages wire stream", () => {
    let server: Server;
    let baseURL: string;

    before(async () => {
        server = createServer((request, response) => {
            const recorded = responses.shift();
            response.writeHead(recorded?.status ?? 200, { "Content-Type": "text/event-stream" });
            for (const frame of recorded?.frames ?? []) response.write(frame);
            response.end();
            capturedHeaders = { ...request.headers } as Record<string, string>;
        });
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
        baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    after(async () => { server.close(); });

    function connection(): AnthropicMessagesConnection {
        return {
            url: `${baseURL}/v1/messages`,
            headers: { "x-api-key": "secret-key", "anthropic-version": "2023-06-01" },
            model: "claude-sonnet-4-5",
            maxOutputTokens: 1024,
            identity,
        };
    }

    const decideRequest: LLMRequest = {
        messages: [{ role: "user", content: "检查实现" }],
        tools: [{ id: "bash", description: "运行", parametersSchema: { type: "object", properties: {} } }],
        toolChoice: "required",
        acceptedFinishReasons: ["tool_calls"],
        maxOutputTokens: 512,
        sessionId: "goal-1",
    };

    test("tool-use stream maps deltas, keeps raw arguments and reports usage", async () => {
        responses.push({ frames: sse([
            MESSAGE_START,
            BLOCK_START(0, { type: "text", text: "" }),
            BLOCK_DELTA(0, { type: "text_delta", text: "检查中" }),
            BLOCK_STOP(0),
            BLOCK_START(1, { type: "tool_use", id: "toolu_9", name: "bash", input: {} }),
            BLOCK_DELTA(1, { type: "input_json_delta", partial_json: "{\"command\": 介" }),
            { type: "ping" },
            BLOCK_DELTA(1, { type: "input_json_delta", partial_json: "\"ls\"" }),
            BLOCK_STOP(1),
            MESSAGE_DELTA("tool_use", 23),
            MESSAGE_STOP,
        ]) });
        const events: string[] = [];
        let completed = false;
        for await (const event of streamAnthropicMessages(connection(), decideRequest)) {
            events.push(event.kind);
            if (event.kind === "completed") {
                completed = true;
                const meta = event.response.providerMetadata as Record<string, unknown>;
                assert.deepEqual(event.response.blocks, [
                    { index: 0, type: "text", format: "plain", text: "检查中" },
                    { index: 1, type: "tool_call", callId: "toolu_9", toolId: "bash", argumentsJson: "{\"command\": 介\"ls\"" },
                ]);
                assert.equal(event.response.continuation?.identity.protocol, "anthropic-messages");
                assert.deepEqual(event.response.continuation?.blocks, [
                    { type: "text", text: "检查中" },
                    { type: "tool_use", id: "toolu_9", name: "bash", input: {} },
                ]);
                assert.deepEqual(meta.usage, { inputTokens: 12, outputTokens: 23 });
                assert.equal(meta.requestId, "msg_1");
            }
        }
        assert.ok(completed);
        assert.deepEqual(events[0], "started");
        assert.equal(events.at(-1), "completed");
    });

    test("thinking signature deltas are buffered and replayed verbatim in the continuation", async () => {
        responses.push({ frames: sse([
            MESSAGE_START,
            BLOCK_START(0, { type: "thinking", thinking: "" }),
            BLOCK_DELTA(0, { type: "thinking_delta", thinking: "分" }),
            BLOCK_DELTA(0, { type: "thinking_delta", thinking: "析中" }),
            BLOCK_DELTA(0, { type: "signature_delta", signature: "sig-" }),
            BLOCK_DELTA(0, { type: "signature_delta", signature: "abc" }),
            BLOCK_STOP(0),
            BLOCK_START(1, { type: "text", text: "" }),
            BLOCK_DELTA(1, { type: "text_delta", text: "回答" }),
            BLOCK_STOP(1),
            MESSAGE_DELTA("end_turn"),
            MESSAGE_STOP,
        ]) });
        const request: LLMRequest = { messages: [{ role: "user", content: "问题" }], maxOutputTokens: 512 };
        for await (const event of streamAnthropicMessages(connection(), request)) {
            if (event.kind === "completed") {
                assert.deepEqual(event.response.blocks, [
                    { index: 0, type: "reasoning", text: "分析中" },
                    { index: 1, type: "text", format: "plain", text: "回答" },
                ]);
                assert.deepEqual(event.response.continuation?.blocks, [
                    { type: "thinking", thinking: "分析中", signature: "sig-abc" },
                    { type: "text", text: "回答" },
                ]);
            }
        }
    });

    test("thinking block without a signature is rejected at the protocol boundary", async () => {
        responses.push({ frames: sse([
            MESSAGE_START,
            BLOCK_START(0, { type: "thinking", thinking: "" }),
            BLOCK_DELTA(0, { type: "thinking_delta", thinking: "无签名" }),
            BLOCK_STOP(0),
            BLOCK_START(1, { type: "text", text: "" }),
            BLOCK_DELTA(1, { type: "text_delta", text: "回答" }),
            BLOCK_STOP(1),
            MESSAGE_DELTA("end_turn"),
            MESSAGE_STOP,
        ]) });
        const request: LLMRequest = { messages: [{ role: "user", content: "问题" }] };
        await assert.rejects(
            async () => { for await (const _ of streamAnthropicMessages(connection(), request)) { /* drain */ } },
            (error: unknown) => error instanceof AnthropicMessagesIncompleteError && error.reason === "missing_thinking_signature",
        );
    });

    test("truncation, HTTP failure, refusal and provider error terminate without completed", async () => {
        const request: LLMRequest = { messages: [{ role: "user", content: "问题" }] };
        const drain = async (frames: string[], status?: number): Promise<void> => {
            responses.push(status === undefined ? { frames } : { frames, status });
            for await (const event of streamAnthropicMessages(connection(), request)) {
                assert.notEqual(event.kind, "completed", "failed streams must not produce completed");
            }
        };

        // EOF without any event is an empty stream.
        await assert.rejects(drain([]),
            (error: unknown) => error instanceof AnthropicMessagesIncompleteError && error.reason === "empty_stream");
        // Events but no stop reason is truncation.
        await assert.rejects(
            drain(sse([
                MESSAGE_START,
                BLOCK_START(0, { type: "text", text: "" }),
                BLOCK_DELTA(0, { type: "text_delta", text: "半个回答" }),
            ])),
            (error: unknown) => error instanceof AnthropicMessagesIncompleteError && error.reason === "missing_stop_reason",
        );
        // Non-2xx fails with the HTTP status.
        await assert.rejects(drain([], 529), (error: unknown) => error instanceof Error && /HTTP 529/.test(error.message));
        // Refusal stops the stream without completed.
        await assert.rejects(
            drain(sse([
                MESSAGE_START,
                BLOCK_START(0, { type: "text", text: "" }),
                BLOCK_DELTA(0, { type: "text_delta", text: "不行" }),
                BLOCK_STOP(0),
                MESSAGE_DELTA("refusal"),
            ])),
            AnthropicMessagesRefusalError,
        );
        // max_tokens truncation is rejected at the protocol boundary.
        await assert.rejects(
            drain(sse([
                MESSAGE_START,
                BLOCK_START(0, { type: "text", text: "" }),
                BLOCK_DELTA(0, { type: "text_delta", text: "很长" }),
                BLOCK_STOP(0),
                MESSAGE_DELTA("max_tokens"),
                MESSAGE_STOP,
            ])),
            (error: unknown) => error instanceof AnthropicMessagesIncompleteError && error.reason === "max_tokens",
        );
        // Unknown SSE event types are rejected as protocol violations.
        await assert.rejects(
            drain(sse([{ type: "mystery_event" }, MESSAGE_START, MESSAGE_DELTA("end_turn"), MESSAGE_STOP])),
            (error: unknown) => error instanceof AnthropicMessagesIncompleteError && error.reason === "unsupported_content",
        );
    });

    test("requests carry api key header, version header and no OpenAI fields", async () => {
        responses.push({ frames: sse([MESSAGE_START, MESSAGE_DELTA("end_turn"), MESSAGE_STOP]) });
        const request: LLMRequest = { messages: [{ role: "user", content: "hi" }] };
        for await (const _ of streamAnthropicMessages(connection(), request)) { void _; }
        assert.equal(capturedHeaders["x-api-key"], "secret-key");
        assert.equal(capturedHeaders["anthropic-version"], "2023-06-01");
        void decideRequest;
    });
});
