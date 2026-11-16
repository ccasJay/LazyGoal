import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter, LLMRequest, LLMResponse, LLMStreamEvent } from "../../llm-core/src/index";
import { readAssistantText } from "../../llm-core/src/index";
import { blockResponse, textResponse } from "../../llm-core/test/response-fixtures";
import type { ModelInputRecord } from "../../runtime/src/model-input";
import type { ExecutionStreamEventDraft, ExecutionStreamPublisher } from "../../execution-stream/src/index";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import { ExecutionAbortedError } from "../../execution-control/src/index";
import { callModel, type ModelCallContext } from "../src/index";

const REQUEST: LLMRequest = { messages: [{ role: "user", content: "hello" }] };

function context(overrides: Partial<ModelCallContext> = {}): ModelCallContext {
    return {
        goalId: "goal-stream",
        runId: "run-stream",
        stepIndex: 1,
        modelId: "test-model",
        conversationMessages: [],
        sections: [],
        ...overrides,
    };
}

function streamingAdapter(events: readonly LLMStreamEvent[]): LLMAdapter & { generateCalls: number } {
    let generateCalls = 0;
    return {
        get generateCalls() { return generateCalls; },
        async generate(): Promise<LLMResponse> {
            generateCalls += 1;
            throw new Error("stream adapter must not call generate");
        },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            for (const event of events) yield event;
        },
    };
}

function captureEvents(): {
    readonly publisher: ExecutionStreamPublisher;
    readonly drafts: ExecutionStreamEventDraft[];
} {
    const drafts: ExecutionStreamEventDraft[] = [];
    return {
        drafts,
        publisher: { publish(event: ExecutionStreamEventDraft) { drafts.push(event); } } as unknown as ExecutionStreamPublisher,
    };
}

test("交错块、晚到工具身份与整块 reasoning 在同一流中同源，并按可见性发布", async () => {
    const response: LLMResponse = blockResponse(
        { type: "text", text: "第一段第二段" },
        { type: "tool_call", callId: "call-late", toolId: "read_file", argumentsJson: '{"path":"README.md"}' },
        { type: "reasoning", text: "受限推理" },
    );
    const adapter = streamingAdapter([
        { kind: "started" },
        { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
        { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "第一段" },
        { kind: "content_block_started", index: 1, blockType: "tool_call", delivery: "incremental" },
        { kind: "content_block_delta", index: 1, deltaKind: "tool_arguments", delta: '{"path"' },
        { kind: "content_block_delta", index: 1, deltaKind: "tool_arguments", delta: ':"README.md"}' },
        { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "第二段" },
        {
            kind: "content_block_completed", delivery: "incremental",
            block: { index: 1, type: "tool_call", callId: "call-late", toolId: "read_file", argumentsJson: '{"path":"README.md"}' },
        },
        { kind: "content_block_started", index: 2, blockType: "reasoning", delivery: "whole" },
        { kind: "content_block_completed", delivery: "whole", block: { index: 2, type: "reasoning", text: "受限推理" } },
        {
            kind: "content_block_completed", delivery: "incremental",
            block: { index: 0, type: "text", format: "plain", text: "第一段第二段" },
        },
        { kind: "completed", response },
    ]);
    const inputs: ModelInputRecord[] = [];
    const metrics: { readonly recordType: string; readonly callId: string }[] = [];
    const publisher = new InMemoryExecutionStreamPublisher();
    const publicEvents: { readonly kind: string; readonly visibility: string; readonly payload: unknown }[] = [];
    const restrictedEvents: { readonly kind: string; readonly payload: unknown }[] = [];
    publisher.subscribe({ goalId: "goal-stream", runId: "run-stream" })
        .onEvent(event => { publicEvents.push({ kind: event.kind, visibility: event.visibility, payload: event.payload }); });
    publisher.subscribe({ goalId: "goal-stream", runId: "run-stream" }, { minimumVisibility: "restricted", includeReasoning: true })
        .onEvent(event => { restrictedEvents.push({ kind: event.kind, payload: event.payload }); });

    const result = await callModel({
        adapter,
        executionStream: publisher,
        modelInputStore: { append: async (record) => { inputs.push(record); }, read: async () => inputs },
        metricsRecorder: { record: async (record) => { metrics.push({ recordType: record.recordType, callId: record.callId }); } },
    }, { context: context(), request: REQUEST, stage: "decide" });

    assert.deepEqual(result.response, response);
    assert.equal(adapter.generateCalls, 0);
    assert.equal((publicEvents.find(event => event.kind === "model_started")?.payload as { stage?: string }).stage, "decide");
    // 公开订阅只看到普通正文与安全生命周期。
    assert.deepEqual(publicEvents.map(event => event.kind), [
        "model_started",
        "model_block_started",
        "model_block_delta",
        "model_block_delta",
        "model_block_completed",
        "model_completed",
    ]);
    const publicText = publicEvents.filter(event => event.kind === "model_block_delta")
        .map(event => (event.payload as { readonly delta: string }).delta).join("");
    assert.equal(publicText, "第一段第二段");
    assert.deepEqual(publicEvents.filter(event => event.kind === "model_block_delta").map(event => event.visibility), ["public", "public"]);
    assert.equal(publicEvents.some(event => event.visibility !== "public"), false);
    // 受限订阅按块身份看到 reasoning 与工具参数；调用与块身份一致。
    const identities = restrictedEvents
        .filter(event => event.kind.startsWith("model_block_"))
        .map(event => event.payload as { readonly modelCallId: string; readonly blockIndex: number });
    assert.ok(identities.length > 0);
    assert.ok(identities.every(identity => identity.modelCallId === result.callId));
    assert.deepEqual([...new Set(identities.map(identity => identity.blockIndex))], [0, 1, 2]);
    const reasoningCompleted = restrictedEvents.find(event => event.kind === "model_block_completed"
        && (event.payload as { readonly blockType?: string }).blockType === "reasoning");
    assert.deepEqual(reasoningCompleted?.payload, {
        modelCallId: result.callId, blockIndex: 2, blockType: "reasoning", delivery: "whole", text: "受限推理",
    });
    // 输入记录、指标与观察共用同一 callId。
    assert.equal(inputs[0]!.callId, result.callId);
    assert.ok(metrics.every(record => record.callId === result.callId));
    assert.deepEqual(metrics.map(record => record.recordType), ["call_started", "call_finished"]);
});

const REJECTED_SEQUENCES: readonly { readonly name: string; readonly events: readonly LLMStreamEvent[] }[] = [
    {
        name: "未知索引",
        events: [
            { kind: "started" },
            { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "orphan" },
        ],
    },
    {
        name: "重复开始",
        events: [
            { kind: "started" },
            { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
            { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
        ],
    },
    {
        name: "结束后追加",
        events: [
            { kind: "started" },
            { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
            { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "" } },
            { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "late" },
        ],
    },
    {
        name: "增量类型冲突",
        events: [
            { kind: "started" },
            { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
            { kind: "content_block_delta", index: 0, deltaKind: "reasoning", delta: "wrong kind" },
        ],
    },
    {
        name: "整块收到增量",
        events: [
            { kind: "started" },
            { kind: "content_block_started", index: 0, blockType: "tool_call", delivery: "whole" },
            { kind: "content_block_delta", index: 0, deltaKind: "tool_arguments", delta: "{}" },
        ],
    },
    {
        name: "结束内容改写",
        events: [
            { kind: "started" },
            { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
            { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "原始" },
            { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "替换" } },
        ],
    },
    {
        name: "重复完成",
        events: [
            { kind: "started" },
            { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
            { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "a" } },
            { kind: "completed", response: blockResponse({ type: "text", text: "a" }) },
            { kind: "completed", response: blockResponse({ type: "text", text: "a" }) },
        ],
    },
    {
        name: "成功后继续输出",
        events: [
            { kind: "started" },
            { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
            { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "a" } },
            { kind: "completed", response: blockResponse({ type: "text", text: "a" }) },
            { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "tail" },
        ],
    },
];

for (const sequence of REJECTED_SEQUENCES) {
    test(`非法块序列被拒绝：${sequence.name}`, async () => {
        await assert.rejects(
            callModel({ adapter: streamingAdapter(sequence.events) }, { context: context(), request: REQUEST, stage: "decide" }),
            (error: unknown) => error instanceof Error
                && error.name === "LLMStreamProtocolError"
                && (error as { readonly code?: string }).code === "LLM_STREAM_PROTOCOL_ERROR",
        );
    });
}

test("缺失完成、未封口块与最终块失配都不得返回成功响应", async () => {
    await assert.rejects(
        callModel({ adapter: streamingAdapter([
            { kind: "started" },
            { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
            { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "partial" },
        ]) }, { context: context(), request: REQUEST, stage: "decide" }),
        /without a completed response|unfinished block/,
    );

    await assert.rejects(
        callModel({ adapter: streamingAdapter([
            { kind: "started" },
            { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
            { kind: "completed", response: blockResponse({ type: "text", text: "" }) },
        ]) }, { context: context(), request: REQUEST, stage: "decide" }),
        /unfinished block/,
    );

    await assert.rejects(
        callModel({ adapter: streamingAdapter([
            { kind: "started" },
            { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
            { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "streamed" },
            { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "streamed" } },
            { kind: "completed", response: blockResponse({ type: "text", text: "different" }) },
        ]) }, { context: context(), request: REQUEST, stage: "decide" }),
        /does not match the ended stream block/,
    );
});

test("完成候选后必须等待正常 EOF，尾部异常使本次调用失败", async () => {
    const completedResponse = blockResponse({ type: "text", text: "streamed" });
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const adapter: LLMAdapter = {
        async generate(): Promise<LLMResponse> { throw new Error("stream adapter must not call generate"); },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            yield { kind: "started" };
            yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" };
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "streamed" };
            yield { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "streamed" } };
            yield { kind: "completed", response: completedResponse };
            await barrier;
        },
    };

    let settled = false;
    const pending = callModel({ adapter }, { context: context(), request: REQUEST, stage: "decide" })
        .finally(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(settled, false, "完成候选后不得在 EOF 之前返回");
    release();
    assert.deepEqual((await pending).response, completedResponse);

    await assert.rejects(
        callModel({ adapter: streamingAdapterWithTailError(completedResponse) }, { context: context(), request: REQUEST, stage: "decide" }),
        /stream transport failed after completion/,
    );
});

function streamingAdapterWithTailError(response: LLMResponse): LLMAdapter {
    return {
        async generate(): Promise<LLMResponse> { throw new Error("stream adapter must not call generate"); },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            yield { kind: "started" };
            yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" };
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "streamed" };
            yield { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "streamed" } };
            yield { kind: "completed", response };
            throw new Error("stream transport failed after completion");
        },
    };
}

test("只实现 generate 的 Adapter 在返回前发布开始状态，并按整块方式观察", async () => {
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const { drafts, publisher } = captureEvents();
    const response = blockResponse(
        { type: "text", text: "整块正文" },
        { type: "tool_call", callId: "call-whole", toolId: "read_file", argumentsJson: '{"path":"README.md"}' },
    );
    const adapter: LLMAdapter = {
        async generate(): Promise<LLMResponse> {
            await barrier;
            return response;
        },
    };

    const pending = callModel({ adapter, executionStream: publisher }, { context: context(), request: REQUEST, stage: "decide" });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(drafts.map(draft => draft.kind), ["model_started"], "generate 返回前必须已发布开始状态");
    assert.equal((drafts[0]?.payload as { stage?: string }).stage, "decide");
    release();
    const result = await pending;

    assert.deepEqual(result.response, response);
    assert.deepEqual(drafts.map(draft => draft.kind), [
        "model_started",
        "model_block_started",
        "model_block_completed",
        "model_block_started",
        "model_block_completed",
        "model_completed",
    ]);
    assert.equal(drafts.some(draft => draft.kind === "model_block_delta"), false, "整块观察不得伪造增量");
    const visible = drafts.filter(draft => draft.kind === "model_block_completed")
        .map(draft => ({ visibility: draft.visibility, payload: draft.payload }));
    assert.deepEqual(visible[0]?.visibility, "public");
    assert.deepEqual(visible[1]?.visibility, "diagnostic");
    assert.deepEqual(visible[0]?.payload, {
        modelCallId: result.callId, blockIndex: 0, blockType: "text", delivery: "whole",
        format: "plain", text: "整块正文",
    });
    assert.deepEqual(visible[1]?.payload, {
        modelCallId: result.callId, blockIndex: 1, blockType: "tool_call", delivery: "whole",
        callId: "call-whole", toolId: "read_file", argumentsJson: '{"path":"README.md"}',
    });
    assert.deepEqual(drafts.at(-1)?.payload, { modelCallId: result.callId, hasToolCalls: true });
});

test("失败或取消时发布安全终止摘要，指明未完成块且不携带块内容", async () => {
    const failing: LLMAdapter = {
        async generate(): Promise<LLMResponse> { throw new Error("stream adapter must not call generate"); },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            yield { kind: "started" };
            yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" };
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "PRIVATE_PARTIAL_TEXT" };
            throw new Error("stream transport failed");
        },
    };
    const failure = captureEvents();
    await assert.rejects(
        callModel({ adapter: failing, executionStream: failure.publisher }, { context: context(), request: REQUEST, stage: "decide" }),
        /stream transport failed/,
    );
    const terminated = failure.drafts.find(draft => draft.kind === "model_failed");
    assert.ok(terminated);
    const terminationPayload = terminated.payload as { readonly modelCallId: string; readonly unfinishedBlockIndexes: readonly number[] };
    assert.deepEqual(terminationPayload.unfinishedBlockIndexes, [0]);
    assert.equal(typeof terminationPayload.modelCallId, "string");
    assert.equal(JSON.stringify(failure.drafts).includes("PRIVATE_PARTIAL_TEXT"), true, "增量本身在失败前已按可见性发布");

    const controller = new AbortController();
    const cancelling: LLMAdapter = {
        async generate(): Promise<LLMResponse> { throw new Error("stream adapter must not call generate"); },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            yield { kind: "started" };
            yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" };
            yield { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "complete" } };
            yield { kind: "content_block_started", index: 1, blockType: "reasoning", delivery: "incremental" };
            controller.abort();
            yield { kind: "content_block_delta", index: 1, deltaKind: "reasoning", delta: "late" };
        },
    };
    const cancellation = captureEvents();
    await assert.rejects(
        callModel({ adapter: cancelling, executionStream: cancellation.publisher }, {
            context: context(), request: REQUEST, stage: "decide", control: { signal: controller.signal },
        }),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    const cancelled = cancellation.drafts.find(draft => draft.kind === "model_cancelled");
    assert.ok(cancelled);
    const cancelledPayload = cancelled.payload as { readonly modelCallId: string; readonly unfinishedBlockIndexes: readonly number[] };
    assert.deepEqual(cancelledPayload.unfinishedBlockIndexes, [1], "已结束的块不列为未完成");
    assert.equal(cancelled.visibility, "public");
    const startedDraft = cancellation.drafts.find(draft => draft.kind === "model_started");
    assert.equal(cancelledPayload.modelCallId, (startedDraft?.payload as { readonly modelCallId?: string } | undefined)?.modelCallId);
});

test("公开、诊断与显式 reasoning 订阅互不越界，块边界与完成事件也不旁路泄漏", async () => {
    const PLAIN_MARKER = "PUBLIC_PLAIN_TEXT";
    const JSON_MARKER = "PRIVATE_JSON_MARKER";
    const ARGUMENT_MARKER = "PRIVATE_ARGUMENT_MARKER";
    const REASONING_MARKER = "PRIVATE_REASONING_MARKER";
    const METADATA_MARKER = "PRIVATE_METADATA_MARKER";
    const jsonText = `{"result":{"kind":"complete","summary":"${JSON_MARKER}"}}`;

    let calls = 0;
    const adapter: LLMAdapter = {
        async generate(): Promise<LLMResponse> { throw new Error("stream adapter must not call generate"); },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            calls += 1;
            yield { kind: "started" };
            if (calls === 1) {
                yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" };
                yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: PLAIN_MARKER.slice(0, 6) };
                yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: PLAIN_MARKER.slice(6) };
                yield { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: PLAIN_MARKER } };
                yield {
                    kind: "completed",
                    response: { ...textResponse(PLAIN_MARKER), providerMetadata: { marker: METADATA_MARKER } },
                };
                return;
            }
            yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "whole", format: "json" };
            yield { kind: "content_block_completed", delivery: "whole", block: { index: 0, type: "text", format: "json", text: jsonText } };
            yield { kind: "content_block_started", index: 1, blockType: "tool_call", delivery: "whole" };
            yield {
                kind: "content_block_completed", delivery: "whole",
                block: { index: 1, type: "tool_call", callId: "call-isolated", toolId: "read_file", argumentsJson: `{"path":"${ARGUMENT_MARKER}"}` },
            };
            yield { kind: "content_block_started", index: 2, blockType: "reasoning", delivery: "whole" };
            yield { kind: "content_block_completed", delivery: "whole", block: { index: 2, type: "reasoning", text: REASONING_MARKER } };
            yield {
                kind: "completed",
                response: blockResponse(
                    { type: "text", format: "json", text: jsonText },
                    { type: "tool_call", callId: "call-isolated", toolId: "read_file", argumentsJson: `{"path":"${ARGUMENT_MARKER}"}` },
                    { type: "reasoning", text: REASONING_MARKER },
                ),
            };
        },
    };

    const publisher = new InMemoryExecutionStreamPublisher();
    const collect = (policy?: Parameters<InMemoryExecutionStreamPublisher["subscribe"]>[1]) => {
        const events: { readonly kind: string; readonly visibility: string; readonly coalescingKey?: string; readonly payload: unknown }[] = [];
        const subscription = publisher.subscribe({ goalId: "goal-stream", runId: "run-stream" }, policy);
        subscription.onEvent(event => events.push({
            kind: event.kind, visibility: event.visibility,
            ...(event.coalescingKey === undefined ? {} : { coalescingKey: event.coalescingKey }),
            payload: event.payload,
        }));
        return { events, subscription };
    };
    const publicView = collect();
    const diagnosticView = collect({ minimumVisibility: "diagnostic" });
    const reasoningView = collect({ minimumVisibility: "restricted", includeReasoning: true });

    const first = await callModel({ adapter, executionStream: publisher }, { context: context(), request: REQUEST, stage: "decide" });
    const second = await callModel({ adapter, executionStream: publisher }, { context: context(), request: REQUEST, stage: "decide" });

    // 默认订阅只得到既有允许的普通正文与安全生命周期，且同一块相邻增量合并。
    const publicKinds = publicView.events.map(event => event.kind);
    assert.deepEqual(publicKinds, [
        "model_started", "model_block_started", "model_block_delta", "model_block_delta", "model_block_completed", "model_completed",
        "model_started", "model_completed",
    ]);
    // 回调订阅立即交付，不合并；同块相邻增量的合并由缓冲订阅用例覆盖。
    assert.deepEqual(
        publicView.events.filter(event => event.kind === "model_block_delta")
            .map(event => (event.payload as { readonly delta: string }).delta).join(""),
        PLAIN_MARKER,
    );
    assert.equal(publicView.events.filter(event => event.kind === "model_block_delta").length > 0, true);
    for (const marker of [JSON_MARKER, ARGUMENT_MARKER, REASONING_MARKER, METADATA_MARKER]) {
        assert.equal(JSON.stringify(publicView.events).includes(marker), false, marker);
    }
    // 公共完成事件只带安全摘要与调用身份，不携带整个响应。
    const completions = publicView.events.filter(event => event.kind === "model_completed").map(event => event.payload);
    assert.deepEqual(completions, [
        { modelCallId: first.callId, hasToolCalls: false },
        { modelCallId: second.callId, hasToolCalls: true },
    ]);

    // 诊断订阅得到结构化 JSON 与工具参数，但仍看不到 reasoning 与供应商 metadata。
    assert.ok(JSON.stringify(diagnosticView.events).includes(JSON_MARKER));
    assert.ok(JSON.stringify(diagnosticView.events).includes(ARGUMENT_MARKER));
    assert.equal(JSON.stringify(diagnosticView.events).includes(REASONING_MARKER), false);
    assert.equal(JSON.stringify(diagnosticView.events).includes(METADATA_MARKER), false);
    const diagnosticVisibilities = [...new Set(diagnosticView.events.filter(event => event.visibility !== "public").map(event => event.visibility))];
    assert.deepEqual(diagnosticVisibilities, ["diagnostic"]);

    // 只有显式开启的受限订阅才能获得公开 reasoning 摘要。
    assert.ok(JSON.stringify(reasoningView.events).includes(REASONING_MARKER));
    assert.equal(JSON.stringify(reasoningView.events).includes(METADATA_MARKER), false);
    assert.equal(reasoningView.events.some(event => event.visibility === "restricted" && event.kind === "model_block_completed"), true);

    // 每条增量只能归入自己的调用与块：合并键以调用身份与块索引结尾。
    for (const event of diagnosticView.events.filter(item => item.kind === "model_block_delta")) {
        const blockIndex = (event.payload as { readonly blockIndex?: number }).blockIndex;
        assert.equal(event.coalescingKey, `model-block:${(event.payload as { readonly modelCallId: string }).modelCallId}:${blockIndex}`);
        assert.ok(event.coalescingKey.endsWith(`:${blockIndex}`));
    }
    assert.equal(new Set([first.callId, second.callId]).size, 2);
});

test("缓冲订阅按同一块的相邻增量合并，跨块与跨调用保持独立", async () => {
    const adapter: LLMAdapter = {
        async generate(): Promise<LLMResponse> { throw new Error("stream adapter must not call generate"); },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            yield { kind: "started" };
            yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" };
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "第一" };
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "段" };
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "。" };
            yield { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "第一段。" } };
            yield { kind: "content_block_started", index: 1, blockType: "tool_call", delivery: "incremental" };
            yield { kind: "content_block_delta", index: 1, deltaKind: "tool_arguments", delta: '{"a"' };
            yield { kind: "content_block_delta", index: 1, deltaKind: "tool_arguments", delta: ":1}" };
            yield { kind: "content_block_completed", delivery: "incremental", block: { index: 1, type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: '{"a":1}' } };
            yield { kind: "completed", response: blockResponse(
                { type: "text", text: "第一段。" },
                { type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: '{"a":1}' },
            ) };
        },
    };
    const publisher = new InMemoryExecutionStreamPublisher();
    const subscription = publisher.subscribe({ goalId: "goal-stream", runId: "run-stream" }, { minimumVisibility: "diagnostic" });
    const iterator = subscription[Symbol.asyncIterator]();

    const first = await callModel({ adapter, executionStream: publisher }, { context: context(), request: REQUEST, stage: "decide" });
    await callModel({ adapter, executionStream: publisher }, { context: context(), request: REQUEST, stage: "decide" });

    const events: { readonly kind: string; readonly payload: unknown; readonly coalescedFrom?: number }[] = [];
    // 两次调用各产生：started、块开始、合并增量、块结束、块开始、合并增量、块结束、完成。
    while (events.length < 16) {
        const next = await Promise.race([
            iterator.next(),
            new Promise<"idle">(resolve => setTimeout(() => resolve("idle"), 50)),
        ]);
        if (next === "idle" || next.done === true) break;
        events.push({ kind: next.value.kind, payload: next.value.payload,
            ...(next.value.coalescedFrom === undefined ? {} : { coalescedFrom: next.value.coalescedFrom }) });
    }
    subscription.close();
    assert.equal(events.length, 16, `缓冲事件数量: ${events.map(event => event.kind).join(",")}`);

    // 缓冲期间同一块的相邻增量合并为一条，跨度不同的块与调用各保持独立。
    const deltas = events.filter(event => event.kind === "model_block_delta");
    assert.deepEqual(deltas.map(event => (event.payload as { readonly delta: string }).delta),
        ["第一段。", '{"a":1}', "第一段。", '{"a":1}']);
    assert.equal(deltas[0]?.coalescedFrom, 3);
    assert.equal(events.filter(event => event.kind === "model_started").length, 2);
    assert.equal((events.find(event => event.kind === "model_started")?.payload as { readonly modelCallId?: string }).modelCallId, first.callId);
});

test("发布故障与慢订阅者不改变调用结果，也不触发 Interrupt", async () => {
    let calls = 0;
    const adapter = streamingAdapter([
        { kind: "started" },
        { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
        { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "answer" },
        { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "answer" } },
        { kind: "completed", response: textResponse("answer") },
    ]);
    calls += 1;

    // 发布抛错属于观察通道故障：调用结果保持不变。
    const throwingPublisher = { publish() { throw new Error("subscriber exploded"); } } as unknown as ExecutionStreamPublisher;
    const result = await callModel({ adapter, executionStream: throwingPublisher }, { context: context(), request: REQUEST, stage: "decide" });
    assert.equal(readAssistantText(result.response), "answer");
    assert.equal(calls, 1);

    // 慢订阅者因背压关闭，快订阅者与模型调用继续成功。
    const publisher = new InMemoryExecutionStreamPublisher();
    const slow = publisher.subscribe({ goalId: "goal-stream", runId: "run-stream" }, { maxQueueSize: 1 });
    const fast: string[] = [];
    publisher.subscribe({ goalId: "goal-stream", runId: "run-stream" }, { maxQueueSize: 32 })
        .onEvent(event => { fast.push(event.kind); });
    const streamed = await callModel({ adapter, executionStream: publisher }, { context: context(), request: REQUEST, stage: "decide" });
    assert.equal(readAssistantText(streamed.response), "answer");
    assert.deepEqual(fast, ["model_started", "model_block_started", "model_block_delta", "model_block_completed", "model_completed"]);
    assert.equal(slow.closed, true);
    slow.close();
    publisher.dispose();
});

test("大段分片只保留一份所需输出，不按分片写持久化记录", async () => {
    const fragments = 400;
    const adapter = streamingAdapter([
        { kind: "started" },
        { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" },
        ...Array.from({ length: fragments }, (_unused, index) => ({
            kind: "content_block_delta" as const, index: 0, deltaKind: "text" as const, delta: `${index % 10}`,
        })),
        { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: Array.from({ length: fragments }, (_unused, index) => `${index % 10}`).join("") } },
        { kind: "completed", response: textResponse(Array.from({ length: fragments }, (_unused, index) => `${index % 10}`).join("")) },
    ]);
    const inputs: ModelInputRecord[] = [];
    const metrics: string[] = [];
    const traces: unknown[] = [];
    const result = await callModel({
        adapter,
        modelInputStore: { append: async record => { inputs.push(record); }, read: async () => inputs },
        metricsRecorder: { record: async record => { metrics.push(record.recordType); } },
        traceSink: { append: async record => { traces.push(record); } },
    }, { context: context(), request: REQUEST, stage: "decide" });

    assert.equal(readAssistantText(result.response).length, fragments);
    // 记录与指标按调用而非按分片计数；观测状态只保留一份累计输出。
    assert.equal(inputs.length, 1);
    assert.deepEqual(metrics, ["call_started", "call_finished"]);
    assert.equal(traces.length, 2);
    assert.equal(result.response.blocks.length, 1);
});
