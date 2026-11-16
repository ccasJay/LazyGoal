import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm-core/src/index";
import type { LLMRequest, LLMResponse, LLMStreamEvent } from "../../llm-core/src/index";
import { readAssistantText } from "../../llm-core/src/index";
import { textResponse } from "../../llm-core/test/response-fixtures";
import type { ModelInputRecord } from "../../runtime/src/model-input";
import type {
    ExecutionStreamEventDraft,
    ExecutionStreamPublisher,
} from "../../execution-stream/src/index";
import { ExecutionAbortedError } from "../../execution-control/src/index";
import { callModel, type ModelCallContext } from "../src/index";

const REQUEST: LLMRequest = { messages: [{ role: "user", content: "hello" }] };

function context(overrides: Partial<ModelCallContext> = {}): ModelCallContext {
    return {
        goalId: "goal-call",
        runId: "run-call",
        stepIndex: 1,
        modelId: "test-model",
        conversationMessages: [],
        sections: [],
        ...overrides,
    };
}

class ScriptedAdapter implements LLMAdapter {
    calls = 0;
    readonly requests: LLMRequest[] = [];

    constructor(
        private readonly responder: (request: LLMRequest) => LLMResponse | Promise<LLMResponse>,
    ) {}

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.calls += 1;
        this.requests.push(request);
        return this.responder(request);
    }
}

function withStream(
    adapter: ScriptedAdapter,
    stream: NonNullable<LLMAdapter["stream"]>,
): LLMAdapter {
    return Object.assign(adapter, { stream });
}

function captureStream(): { publisher: ExecutionStreamPublisher; events: ExecutionStreamEventDraft[] } {
    const events: ExecutionStreamEventDraft[] = [];
    return {
        events,
        publisher: {
            publish(event) {
                events.push(event as ExecutionStreamEventDraft);
            },
        } as ExecutionStreamPublisher,
    };
}

test("仅注入确定性 Adapter 与请求即可完成一次调用并发布既有可见性事件", async () => {
    const adapter = new ScriptedAdapter(() => textResponse("answer"));
    const { publisher, events } = captureStream();

    const result = await callModel({ adapter, executionStream: publisher }, {
        context: context(),
        request: REQUEST,
        stage: "decide",
    });

    assert.equal(readAssistantText(result.response), "answer");
    assert.equal(typeof result.callId, "string");
    assert.equal(adapter.calls, 1);
    assert.equal(adapter.requests[0]?.sessionId, "goal-call");
    // 无流式能力时按整块方式观察：开始状态在 generate 之后补齐，不伪造增量。
    assert.deepEqual(events.map((event) => event.kind), [
        "model_started",
        "model_block_started",
        "model_block_completed",
        "model_completed",
    ]);
});

test("输入记录失败阻止 Adapter 调用，取消时不调用 Adapter", async () => {
    let calls = 0;
    const adapter = new ScriptedAdapter(() => { calls += 1; return textResponse("unused"); });

    await assert.rejects(
        callModel({
            adapter,
            modelInputStore: {
                append: async () => { throw new Error("storage unavailable"); },
                read: async () => [],
            },
        }, { context: context(), request: REQUEST, stage: "decide" }),
        /storage unavailable/,
    );
    assert.equal(calls, 0);

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        callModel({ adapter }, {
            context: context(),
            request: REQUEST,
            stage: "decide",
            control: { signal: controller.signal },
        }),
        (error: unknown) => error instanceof ExecutionAbortedError || (error as Error).name === "ExecutionAbortedError",
    );
    assert.equal(calls, 0);
});

test("流必须提供唯一 completed 响应，缺失或重复都判协议错误", async () => {
    const completeResponse: LLMResponse = textResponse("streamed");
    const streaming = new ScriptedAdapter(() => textResponse("unused"));
    const adapter = withStream(streaming, async function* (): AsyncIterable<LLMStreamEvent> {
        yield { kind: "started" };
        yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" };
        yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "streamed" };
        yield { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "streamed" } };
        yield { kind: "completed", response: completeResponse };
    });

    const result = await callModel({ adapter }, { context: context(), request: REQUEST, stage: "decide" });
    assert.equal(readAssistantText(result.response), "streamed");
    assert.equal(streaming.calls, 0, "stream 路径不得调用 generate");

    const noCompleted = withStream(new ScriptedAdapter(() => textResponse("unused")), async function* (): AsyncIterable<LLMStreamEvent> {
        yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" };
        yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "partial" };
    });
    await assert.rejects(
        callModel({ adapter: noCompleted }, { context: context(), request: REQUEST, stage: "decide" }),
        /LLM stream ended without a completed response/,
    );

    const duplicated = withStream(new ScriptedAdapter(() => textResponse("unused")), async function* (): AsyncIterable<LLMStreamEvent> {
        yield { kind: "completed", response: completeResponse };
        yield { kind: "completed", response: completeResponse };
    });
    await assert.rejects(
        callModel({ adapter: duplicated }, { context: context(), request: REQUEST, stage: "decide" }),
        /multiple completed responses|after the completed response/,
    );
});

test("仅流路径按调用与块身份发布公开活动，完成后不再输出", async () => {
    const { publisher, events } = captureStream();
    const adapter = withStream(new ScriptedAdapter(() => textResponse("unused")), async function* (): AsyncIterable<LLMStreamEvent> {
        yield { kind: "started" };
        yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "plain" };
        yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "streamed" };
        yield { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "plain", text: "streamed" } };
        yield { kind: "completed", response: textResponse("streamed") };
    });

    const result = await callModel({ adapter, executionStream: publisher }, {
        context: context(), request: REQUEST, stage: "decide",
    });

    assert.deepEqual(events.map(event => event.kind), [
        "model_started",
        "model_block_started",
        "model_block_delta",
        "model_block_completed",
        "model_completed",
    ]);
    assert.ok(events.every(event => (event.payload as { readonly modelCallId?: string }).modelCallId === result.callId));
    assert.deepEqual(events.map(event => event.visibility), ["public", "public", "public", "public", "public"]);
    assert.equal(events.find(event => event.kind === "model_block_completed")?.delivery, "control");
    assert.equal(events.find(event => event.kind === "model_block_delta")?.coalescingKey, `model-block:${result.callId}:0`);
});

test("指标与诊断写入失败按 best effort 隔离，不改变调用结果", async () => {
    const adapter = new ScriptedAdapter(() => textResponse("answer"));
    const result = await callModel({
        adapter,
        metricsRecorder: {
            record: async () => { throw new Error("metrics down"); },
        },
        traceSink: {
            append: async () => { throw new Error("trace down"); },
        },
    }, { context: context(), request: REQUEST, stage: "decide" });

    assert.equal(readAssistantText(result.response), "answer");
});

test("输入记录保留消息来源归类与 Stage/指标事实顺序", async () => {
    const saved: ModelInputRecord[] = [];
    const metrics: { readonly recordType: string; readonly outcome?: string }[] = [];
    const traces: unknown[] = [];
    const request: LLMRequest = {
        messages: [
            { role: "user", content: "真实提问" },
            { role: "user", content: "SECTION" },
            { role: "user", content: "阶段输出" },
            { role: "user", content: "控制" },
        ],
    };
    const adapter = new ScriptedAdapter(() => textResponse("answer"));

    await callModel({
        adapter,
        modelInputStore: { append: async (record) => { saved.push(record); }, read: async () => saved },
        metricsRecorder: { record: async (record) => { metrics.push(record); } },
        traceSink: { append: async (record) => { traces.push(record); } },
    }, {
        context: context({
            conversationMessages: [{ role: "user", content: "真实提问" }],
            sections: ["SECTION"],
            stageOutputs: ["阶段输出"],
            executionUnitId: "unit-1",
        }),
        request,
        stage: "think",
    });

    assert.equal(saved.length, 1);
    assert.equal(saved[0]!.stage, "think");
    assert.equal(saved[0]!.stepIndex, 1);
    assert.equal(saved[0]!.executionUnitId, "unit-1");
    assert.deepEqual(saved[0]!.messages.map((message) => message.source), [
        "conversation",
        "section",
        "stage",
        "working_context",
    ]);
    assert.deepEqual(metrics.map((record) => record.recordType), ["call_started", "call_finished"]);
    assert.equal(metrics[0]!.outcome, undefined);
    assert.equal(metrics[1]!.outcome, "completed");
    assert.ok(traces.length >= 2);
});
