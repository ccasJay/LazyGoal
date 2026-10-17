import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse, LLMStreamEvent } from "../../llm/src/core/types";
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
    readonly structuredOutputMode = "strict" as const;
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
    const adapter = new ScriptedAdapter(() => ({ content: "answer" }));
    const { publisher, events } = captureStream();

    const result = await callModel({ adapter, executionStream: publisher }, {
        context: context(),
        request: REQUEST,
        stage: "decide",
    });

    assert.equal(result.response.content, "answer");
    assert.equal(typeof result.callId, "string");
    assert.equal(adapter.calls, 1);
    assert.equal(adapter.requests[0]?.sessionId, "goal-call");
    assert.deepEqual(events.map((event) => event.kind), [
        "model_started",
        "assistant_text_delta",
        "model_completed",
    ]);
});

test("输入记录失败阻止 Adapter 调用，取消时不调用 Adapter", async () => {
    let calls = 0;
    const adapter = new ScriptedAdapter(() => { calls += 1; return { content: "unused" }; });

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
    const completeResponse: LLMResponse = { content: "streamed" };
    const streaming = new ScriptedAdapter(() => ({ content: "unused" }));
    const adapter = withStream(streaming, async function* (): AsyncIterable<LLMStreamEvent> {
        yield { kind: "started" };
        yield { kind: "assistant_text_delta", text: "streamed" };
        yield { kind: "completed", response: completeResponse };
    });

    const result = await callModel({ adapter }, { context: context(), request: REQUEST, stage: "decide" });
    assert.equal(result.response.content, "streamed");
    assert.equal(streaming.calls, 0, "stream 路径不得调用 generate");

    const noCompleted = withStream(new ScriptedAdapter(() => ({ content: "unused" })), async function* (): AsyncIterable<LLMStreamEvent> {
        yield { kind: "assistant_text_delta", text: "partial" };
    });
    await assert.rejects(
        callModel({ adapter: noCompleted }, { context: context(), request: REQUEST, stage: "decide" }),
        /LLM stream ended without a completed response/,
    );

    const duplicated = withStream(new ScriptedAdapter(() => ({ content: "unused" })), async function* (): AsyncIterable<LLMStreamEvent> {
        yield { kind: "completed", response: completeResponse };
        yield { kind: "completed", response: completeResponse };
    });
    await assert.rejects(
        callModel({ adapter: duplicated }, { context: context(), request: REQUEST, stage: "decide" }),
        /LLM stream produced multiple completed responses/,
    );
});

test("指标与诊断写入失败按 best effort 隔离，不改变调用结果", async () => {
    const adapter = new ScriptedAdapter(() => ({ content: "answer" }));
    const result = await callModel({
        adapter,
        metricsRecorder: {
            record: async () => { throw new Error("metrics down"); },
        },
        traceSink: {
            append: async () => { throw new Error("trace down"); },
        },
    }, { context: context(), request: REQUEST, stage: "decide" });

    assert.equal(result.response.content, "answer");
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
    const adapter = new ScriptedAdapter(() => ({ content: "answer" }));

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
