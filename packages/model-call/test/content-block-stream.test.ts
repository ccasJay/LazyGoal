import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter, LLMRequest, LLMResponse, LLMStreamEvent } from "../../llm-core/src/index";
import { blockResponse } from "../../llm-core/test/response-fixtures";
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
        structuredOutputMode: "strict",
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
        structuredOutputMode: "strict",
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
        structuredOutputMode: "strict",
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
        structuredOutputMode: "strict",
        async generate(): Promise<LLMResponse> {
            await barrier;
            return response;
        },
    };

    const pending = callModel({ adapter, executionStream: publisher }, { context: context(), request: REQUEST, stage: "decide" });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(drafts.map(draft => draft.kind), ["model_started"], "generate 返回前必须已发布开始状态");
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
        structuredOutputMode: "strict",
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
        structuredOutputMode: "strict",
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
