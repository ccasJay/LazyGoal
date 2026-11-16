import assert from "node:assert/strict";
import { test } from "node:test";

import {
    DEFAULT_ANTHROPIC_MAX_TOKENS,
    buildAnthropicMessagesRequest,
    toAnthropicMessages,
} from "../src/request";
import type { LLMMessage, LLMRequest, NativeConversationIdentity } from "../../llm-core/src/index";

const identity: NativeConversationIdentity = {
    provider: "anthropic",
    endpoint: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
    protocol: "anthropic-messages",
};

const continuationBlocks = [
    { type: "thinking" as const, thinking: "检查差异", signature: "sig-1" },
    { type: "text" as const, text: "检查完成" },
];

const continuedHistory: readonly LLMMessage[] = [
    { role: "user", content: "检查实现" },
    {
        role: "assistant",
        content: "检查完成",
        reasoning: "检查差异",
        continuation: { identity, blocks: continuationBlocks },
    },
    { role: "tool", callId: "call-1", toolId: "read_file", content: "{\"ok\":true}" },
] as readonly LLMMessage[];

test("request body carries model, required max_tokens, merged system and mapped tools", () => {
    const request: LLMRequest = {
        messages: [
            { role: "system", content: "第一行" },
            { role: "system", content: "第二行" },
            { role: "user", content: "检查实现" },
        ],
        tools: [{
            id: "read_file",
            description: "读取文件",
            parametersSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
        }],
        toolChoice: "required",
        maxOutputTokens: 1024,
    };
    const body = buildAnthropicMessagesRequest(request, { model: "claude-sonnet-4-5", identity });
    assert.deepEqual(body, {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: "第一行\n第二行",
        messages: [{ role: "user", content: [{ type: "text", text: "检查实现" }] }],
        tools: [{
            name: "read_file",
            description: "读取文件",
            input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
        }],
        tool_choice: { type: "any" },
    });
});

test("assistant history replays thinking signatures verbatim via continuation blocks", () => {
    const messages = toAnthropicMessages(continuedHistory, identity);
    assert.deepEqual(messages, [
        { role: "user", content: [{ type: "text", text: "检查实现" }] },
        {
            role: "assistant",
            content: [
                { type: "thinking", thinking: "检查差异", signature: "sig-1" },
                { type: "text", text: "检查完成" },
            ],
        },
        {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: "call-1", content: "{\"ok\":true}" }],
        },
    ]);
});

test("tool result merges into the preceding user message and system must precede conversation", () => {
    const messages = toAnthropicMessages([
        { role: "system", content: "sys" },
        { role: "user", content: "问题" },
        { role: "tool", callId: "call-9", toolId: "bash", content: "{}" },
    ] as readonly LLMMessage[], identity);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], {
        role: "user",
        content: [
            { type: "text", text: "问题" },
            { type: "tool_result", tool_use_id: "call-9", content: "{}" },
        ],
    });

    assert.throws(
        () => toAnthropicMessages([
            { role: "user", content: "先说话" },
            { role: "system", content: "迟到的 system" },
        ] as readonly LLMMessage[], identity),
        (error: unknown) => error instanceof Error && /System messages must precede/.test(error.message),
    );
});

test("identity mismatch and blockless native history are rejected before any request", () => {
    const other: NativeConversationIdentity = { ...identity, model: "claude-haiku-4-5" };
    assert.throws(
        () => toAnthropicMessages([continuedHistory[1]!] as readonly LLMMessage[], other),
        (error: unknown) => error instanceof Error && /another provider, endpoint, model or protocol/.test(error.message),
    );
    const withoutBlocks = {
        role: "assistant",
        content: "检查完成",
        continuation: { identity, reasoningContent: "检查差异" },
    } as unknown as LLMMessage;
    assert.throws(
        () => toAnthropicMessages([withoutBlocks], identity),
        (error: unknown) => error instanceof Error && /requires its continuation blocks/.test(error.message),
    );
});

test("max_tokens defaults, honors request override and rejects limits beyond the model", () => {
    const base: LLMRequest = { messages: [{ role: "user", content: "hi" }] };
    assert.equal(buildAnthropicMessagesRequest(base, { model: "m", identity }).max_tokens, DEFAULT_ANTHROPIC_MAX_TOKENS);
    assert.equal(
        buildAnthropicMessagesRequest(base, { model: "m", identity, defaultMaxOutputTokens: 2048 }).max_tokens,
        2048,
    );
    assert.equal(
        buildAnthropicMessagesRequest({ ...base, maxOutputTokens: 512 }, { model: "m", identity, defaultMaxOutputTokens: 2048 }).max_tokens,
        512,
    );
    assert.throws(
        () => buildAnthropicMessagesRequest(base, { model: "m", identity, defaultMaxOutputTokens: 4096, modelMaxTokens: 2048 }),
        (error: unknown) => error instanceof Error && /exceeds model/.test(error.message),
    );
});

test("tool_choice maps required to any, none to none and defaults to auto", () => {
    const tools = [{
        id: "bash", description: "运行命令",
        parametersSchema: { type: "object", properties: {} },
    }];
    assert.equal(
        buildAnthropicMessagesRequest({ messages: [], tools, toolChoice: "none" }, { model: "m", identity }).tool_choice?.type,
        "none",
    );
    const defaultChoice = buildAnthropicMessagesRequest({ messages: [], tools }, { model: "m", identity });
    assert.equal(defaultChoice.tool_choice?.type, "auto");
    // maps required to any per mapped in the first test
    assert.equal(defaultChoice.tools?.length, 1);
});
