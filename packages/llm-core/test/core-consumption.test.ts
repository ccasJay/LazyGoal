import assert from "node:assert/strict";
import { test } from "node:test";

import { TransientModelRequestFailure } from "../../execution-control/src/index";
import {
    LLMConfigurationError,
    LLMRequestModeMismatchError,
    classifyTransientModelFailure,
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
            yield { kind: "assistant_text_delta", text: "echo" };
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
    assert.deepEqual(events.map(event => event.kind), ["started", "assistant_text_delta", "completed"]);
    const completed = events.at(-1);
    assert.equal(completed?.kind === "completed" ? readAssistantText(completed.response) : undefined, readAssistantText(response));
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
