import assert from "node:assert/strict";
import { test } from "node:test";

import { TransientModelRequestFailure } from "../../execution-control/src/index";
import {
    LLMConfigurationError,
    LLMRequestModeMismatchError,
    LLMStreamProtocolError,
    classifyTransientModelFailure,
    createContentBlockStreamTracker,
    readAssistantText,
    readNormalizedUsage,
    readReasoningText,
    readToolCalls,
    toSafeTokenCount,
    type LLMAdapter,
    type LLMRequest,
    type LLMResponse,
    type LLMStreamEvent,
} from "../src/index";
import { blockResponse } from "./response-fixtures";

test("经公共入口实现的确定性 Adapter 可直接消费请求、响应与流契约", async () => {
    const generate = async (request: LLMRequest): Promise<LLMResponse> => ({
        blocks: [{ index: 0, type: "text", format: "plain", text: `echo:${request.messages.length}` }],
        providerMetadata: { usage: { inputTokens: 12, outputTokens: 34, cachedInputTokens: 5 } },
    });
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        generate,
        async *stream(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
            yield { kind: "started" };
            yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" };
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "echo" };
            yield { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "echo" } };
            yield { kind: "completed", response: await generate(request) };
        },
    };

    const request: LLMRequest = {
        messages: [
            { role: "system", content: "只回答 echo" },
            { role: "user", content: "hello" },
        ],
        sessionId: "goal-1",
    };
    const response = await adapter.generate(request);
    assert.equal(readAssistantText(response), "echo:2");
    assert.deepEqual(
        readNormalizedUsage(response.providerMetadata),
        { inputTokens: 12, outputTokens: 34, cachedInputTokens: 5 },
    );

    const events: LLMStreamEvent[] = [];
    assert.ok(adapter.stream);
    for await (const event of adapter.stream(request)) events.push(event);
    assert.deepEqual(events.map(event => event.kind), ["started", "content_block_started", "content_block_delta", "content_block_completed", "completed"]);
    const completed = events.at(-1);
    assert.equal(completed?.kind === "completed" ? readAssistantText(completed.response) : undefined, readAssistantText(response));
});

test("内容块流追踪器按块身份组装，并在唯一成功完成后核验最终结果", () => {
    const response = blockResponse(
        { type: "text", text: "组装正文" },
        { type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: '{"path":"README.md"}' },
    );
    const tracker = createContentBlockStreamTracker();
    tracker.accept({ kind: "started" });
    tracker.accept({ kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" });
    tracker.accept({ kind: "content_block_delta", index: 0, deltaKind: "text", delta: "组装" });
    tracker.accept({ kind: "content_block_delta", index: 0, deltaKind: "text", delta: "正文" });
    tracker.accept({ kind: "content_block_started", index: 1, blockType: "tool_call", delivery: "incremental" });
    tracker.accept({ kind: "content_block_delta", index: 1, deltaKind: "tool_arguments", delta: '{"path":"README.md"}' });
    tracker.accept({
        kind: "content_block_completed", delivery: "incremental",
        block: { index: 1, type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: '{"path":"README.md"}' },
    });
    tracker.accept({
        kind: "content_block_completed", delivery: "incremental",
        block: { index: 0, type: "text", format: "plain", text: "组装正文" },
    });
    tracker.accept({ kind: "completed", response });

    assert.deepEqual(tracker.result(), response);
});

test("内容块流追踪器拒绝未知索引、重复边界、类型冲突、结束后追加与最终失配", () => {
    const expectRejected = (events: readonly LLMStreamEvent[], message: RegExp): void => {
        assert.throws(() => {
            const tracker = createContentBlockStreamTracker();
            for (const event of events) tracker.accept(event);
            tracker.result();
        }, (error: unknown) => error instanceof LLMStreamProtocolError
            && error.code === "LLM_STREAM_PROTOCOL_ERROR" && message.test(error.message));
    };
    const startedText = { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" } as const;
    const sealedText = {
        kind: "content_block_completed", delivery: "incremental",
        block: { index: 0, type: "text", format: "plain", text: "text" },
    } as const;
    const completedResponse = { kind: "completed", response: blockResponse({ type: "text", text: "text" }) } as const;

    expectRejected([{ kind: "content_block_delta", index: 0, deltaKind: "text", delta: "orphan" }], /unknown block/);
    expectRejected([startedText, startedText], /out of order/);
    expectRejected([startedText, { kind: "content_block_delta", index: 0, deltaKind: "reasoning", delta: "wrong" }], /does not match block 0 type/);
    expectRejected([startedText, sealedText, { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "late" }], /appended after block 0 ended/);
    expectRejected([startedText, completedResponse], /unfinished block/);
    expectRejected([startedText, completedResponse, completedResponse], /multiple completed responses|after the completed response/);
    expectRejected([startedText, sealedText, completedResponse, { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "tail" }], /after the completed response/);
    expectRejected([startedText, sealedText], /without a completed response/);
    expectRejected([
        startedText,
        { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "streamed" },
        { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "streamed" } },
        { kind: "completed", response: blockResponse({ type: "text", text: "different" }) },
    ], /does not match the ended stream block/);
});

test("归一化用量读取在缺失或非法时省略而不补零", () => {
    assert.equal(toSafeTokenCount(0), 0);
    assert.equal(toSafeTokenCount(-1), undefined);
    assert.equal(toSafeTokenCount(Number.NaN), undefined);
    assert.equal(toSafeTokenCount(Number.POSITIVE_INFINITY), undefined);
    assert.equal(toSafeTokenCount("12"), undefined);
    assert.equal(readNormalizedUsage(undefined), undefined);
    assert.equal(readNormalizedUsage({}), undefined);
    assert.equal(readNormalizedUsage({ usage: {} }), undefined);
    assert.equal(readNormalizedUsage({ usage: { inputTokens: 1, outputTokens: Number.NaN } }), undefined);
    assert.deepEqual(
        readNormalizedUsage({ usage: { inputTokens: 1, outputTokens: 2 } }),
        { inputTokens: 1, outputTokens: 2 },
    );
});

test("共享配置错误与暂时故障分类使用既有身份", () => {
    const configError = new LLMConfigurationError(["LLM_MODEL"]);
    assert.ok(configError instanceof Error);
    assert.equal(configError.name, "LLMConfigurationError");
    assert.equal(configError.code, "INVALID_LLM_CONFIG");
    assert.deepEqual(configError.missing, ["LLM_MODEL"]);
    assert.equal(configError.message, "Missing required environment variable(s): LLM_MODEL");

    const mismatch = new LLMRequestModeMismatchError("strict mode requires structuredOutput in LLMRequest");
    assert.equal(mismatch.name, "LLMRequestModeMismatchError");
    assert.equal(mismatch.code, "LLM_REQUEST_MODE_MISMATCH");

    const failure = classifyTransientModelFailure({ status: 429, headers: { "retry-after": "2" } });
    assert.ok(failure instanceof TransientModelRequestFailure);
    assert.equal(failure.reason, "rate_limited");
    assert.equal(failure.retryAfterMs, 2000);
    assert.equal(classifyTransientModelFailure({ status: 401 }), undefined);
});
