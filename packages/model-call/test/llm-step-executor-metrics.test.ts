import { toolResponseFixture } from "../../agent/test/tool-response-fixture";
import { blockResponse } from "../../llm-core/test/response-fixtures";
import { readToolCalls } from "../../llm-core/src/index";
import { ExecutionAbortedError } from "../../execution-control/src/index";
import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm-core/src/index";
import type { LLMRequest, LLMResponse, LLMStreamEvent } from "../../llm-core/src/index";
import {
    createGoal,
    type ModelCallMetricRecord,
    type ModelCallMetricsRecorder,
} from "../../runtime/src/index";
import type { Goal, GoalMessage } from "../../runtime/src/domain";
import {
    LLMStepExecutor,
} from "../../model-execution/src/index";
import { createDefaultPromptBundleRenderer } from "../../prompt-bundle/src/index";
import { DropOldestContextCompactor } from "../../context-budget/src/index";
import { createCurrentContextAssembler, currentProtocols, currentWorkingMemory } from "../../agent/test/current-fixtures";
import { testUserMessage } from "../../runtime/test/current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();
const profile = {
    id: "metrics-profile",
    systemPrompt: "你是执行代理。",
    instructions: ["完成当前目标"],
    toolIds: [],
};
const task = {
    objective: "检查指标记录",
    completionCriteria: [{ text: "返回完成决策" }],
};

function createGoalForMetrics(): Goal {
    const created = createGoal({
        id: "goal-metrics",
        intent: task.objective,
        promptBundleVersion: 1,
        ...currentProtocols,
        profile,
        runId: "run-metrics",
    });
    const message: GoalMessage = testUserMessage("请检查指标记录。");

    return {
        ...created,
        state: {
            ...created.state,
            workflow: { phase: "executing" },
            run: {
                ...created.state.run,
                status: "running",
                mode: "plan",
                approvedTask: task,
            },
            messages: [message],
        },
    };
}

function completedResponse(providerMetadata?: LLMResponse["providerMetadata"]): LLMResponse {
    return {
        ...toolResponseFixture(JSON.stringify({
            result: {
                kind: "complete",
                summary: "检查完成",
                completionEvidence: [],
                memoryPatch: null,
                contextNotes: null,
            },
        })),
        ...(providerMetadata === undefined ? {} : { providerMetadata }),
    };
}

class CaptureMetricsStore implements ModelCallMetricsRecorder {
    readonly records: ModelCallMetricRecord[] = [];

    async record(record: ModelCallMetricRecord): Promise<void> {
        this.records.push(record);
    }
}

function executorFor(adapter: LLMAdapter, metricsRecorder: ModelCallMetricsRecorder): LLMStepExecutor {
    return new LLMStepExecutor({
        adapter,
        renderer,
        contextCompactor,
        metricsRecorder,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });
}

function input(): Parameters<LLMStepExecutor["execute"]>[0] {
    return {
        goal: createGoalForMetrics(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
        executionUnitId: "unit-metrics",
    };
}

test("LLMStepExecutor records provider usage, request duration, and first-text-to-completion duration", async () => {
    const metricsStore = new CaptureMetricsStore();
    const decisionText = JSON.stringify({
        result: {
            kind: "complete",
            summary: "检查完成",
            completionEvidence: [],
            memoryPatch: null,
            contextNotes: null,
        },
    });
    const streamedResponse: LLMResponse = {
        ...blockResponse(
            { type: "text", format: "json", text: decisionText },
            { type: "tool_call", callId: "fixture-call", toolId: "system_complete_task",
                argumentsJson: JSON.stringify({ summary: "检查完成", completionEvidence: [], memoryPatch: null }) },
        ),
        providerMetadata: { usage: { inputTokens: 120, outputTokens: 18, cachedInputTokens: 45 } },
    };
    const adapter: LLMAdapter = {
        async generate(): Promise<LLMResponse> {
            throw new Error("stream should be used");
        },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            yield { kind: "started" };
            await new Promise((resolve) => setTimeout(resolve, 15));
            yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "json" };
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: decisionText.slice(0, 5) };
            await new Promise((resolve) => setTimeout(resolve, 2));
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: decisionText.slice(5) };
            yield { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "json", text: decisionText } };
            yield { kind: "content_block_started", index: 1, blockType: "tool_call", delivery: "incremental" };
            const argumentsJson = "{\"summary\":\"检查完成\",\"completionEvidence\":[],\"memoryPatch\":null}";
            yield { kind: "content_block_delta", index: 1, deltaKind: "tool_arguments", delta: argumentsJson };
            yield { kind: "content_block_completed", delivery: "incremental",
                block: { index: 1, type: "tool_call", callId: "fixture-call", toolId: "system_complete_task", argumentsJson } };
            yield { kind: "completed", response: streamedResponse };
        },
    };

    const decision = await executorFor(adapter, metricsStore).execute(input());

    assert.equal(decision.kind, "complete");
    assert.equal(metricsStore.records.length, 2);
    const [started, finished] = metricsStore.records;
    assert.equal(started?.recordType, "call_started");
    assert.equal(finished?.recordType, "call_finished");
    if (started?.recordType !== "call_started" || finished?.recordType !== "call_finished") {
        assert.fail("expected a started and finished call record");
    }
    assert.equal(started.goalId, "goal-metrics");
    assert.equal(started.runId, "run-metrics");
    assert.equal(started.executionUnitId, "unit-metrics");
    assert.equal(started.callId, finished.callId);
    assert.equal(finished.outcome, "completed");
    assert.deepEqual(finished.usage, {
        source: "provider_reported",
        inputTokens: 120,
        outputTokens: 18,
        cachedInputTokens: 45,
    });
    assert.ok(Number.isFinite(finished.requestDurationMs));
    assert.ok((finished.requestDurationMs ?? 0) > 0);
    assert.ok((finished.decodeDurationMs ?? 0) > 0);
    assert.ok((finished.requestDurationMs ?? 0) > (finished.decodeDurationMs ?? 0));
});

test("LLMStepExecutor records unrecognized provider usage as an estimate and omits non-stream speed", async () => {
    const metricsStore = new CaptureMetricsStore();
    const adapter: LLMAdapter = {
        async generate(): Promise<LLMResponse> {
            return {
                ...completedResponse(),
                providerMetadata: { piUsage: { input: 100, output: 20 } },
            };
        },
    };

    const decision = await executorFor(adapter, metricsStore).execute(input());

    assert.equal(decision.kind, "complete");
    const finished = metricsStore.records.find((record) => record.recordType === "call_finished");
    assert.ok(finished && finished.recordType === "call_finished");
    assert.equal(finished.usage.source, "estimated");
    assert.ok(finished.usage.source === "estimated" && finished.usage.inputTokens > 0);
    assert.ok(Number.isFinite(finished.requestDurationMs));
    assert.ok((finished.requestDurationMs ?? 0) > 0);
    assert.equal(finished.decodeDurationMs, undefined);
});

test("LLMStepExecutor records failed calls and isolates metric Store failures", async () => {
    const failedCallRecords = new CaptureMetricsStore();
    const failingAdapter: LLMAdapter = {
        async generate(): Promise<never> {
            throw new Error("provider unavailable");
        },
    };
    await assert.rejects(
        executorFor(failingAdapter, failedCallRecords).execute(input()),
        /provider unavailable/,
    );
    const failed = failedCallRecords.records.find((record) => record.recordType === "call_finished");
    assert.ok(failed && failed.recordType === "call_finished");
    assert.equal(failed.outcome, "failed");
    assert.ok(Number.isFinite(failed.requestDurationMs));
    assert.ok((failed.requestDurationMs ?? 0) > 0);
    assert.deepEqual(failed.usage, { source: "unavailable" });

    const unavailableRecorder: ModelCallMetricsRecorder = {
        async record(): Promise<void> {
            throw new Error("metrics unavailable");
        },
    };
    const successfulAdapter: LLMAdapter = {
        async generate(_request: LLMRequest): Promise<LLMResponse> {
            return completedResponse();
        },
    };
    const decision = await executorFor(successfulAdapter, unavailableRecorder).execute(input());
    assert.equal(decision.kind, "complete");
});

test("LLMStepExecutor 以 goal id 作为请求会话身份传给适配器", async () => {
    let captured: LLMRequest | undefined;
    const adapter: LLMAdapter = {
        async generate(request: LLMRequest): Promise<LLMResponse> {
            captured = request;
            return completedResponse();
        },
    };
    const decision = await executorFor(adapter, new CaptureMetricsStore()).execute(input());
    assert.equal(decision.kind, "complete");
    assert.equal(captured?.sessionId, "goal-metrics");
});

test("多块流式调用仍只记录一次调用开始与结束，且取消使用 cancelled 结果", async () => {
    const metricsStore = new CaptureMetricsStore();
    const adapter: LLMAdapter = {
        async generate(): Promise<LLMResponse> { throw new Error("stream should be used"); },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            const call = readToolCalls(completedResponse())[0]!;
            yield { kind: "started" };
            yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "json" };
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "{" };
            yield { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "text", format: "json", text: "{" } };
            yield { kind: "content_block_started", index: 1, blockType: "reasoning", delivery: "whole" };
            yield { kind: "content_block_completed", delivery: "whole", block: { index: 1, type: "reasoning", text: "推演" } };
            yield { kind: "content_block_started", index: 2, blockType: "tool_call", delivery: "incremental" };
            yield { kind: "content_block_delta", index: 2, deltaKind: "tool_arguments", delta: call.argumentsJson };
            yield { kind: "content_block_completed", delivery: "incremental", block: { index: 2, type: "tool_call", ...call } };
            yield { kind: "completed", response: blockResponse({ type: "text", format: "json", text: "{" }, { type: "reasoning", text: "推演" }, { type: "tool_call", ...call }) };
        },
    };

    const decision = await executorFor(adapter, metricsStore).execute(input());
    assert.equal(decision.kind, "complete");
    assert.deepEqual(metricsStore.records.map(record => record.recordType), ["call_started", "call_finished"]);
    const finished = metricsStore.records[1];
    assert.ok(finished?.recordType === "call_finished");
    assert.equal(finished.usage.source, "estimated");

    const cancelling = new AbortController();
    const cancelStore = new CaptureMetricsStore();
    const cancelledAdapter: LLMAdapter = {
        async generate(): Promise<LLMResponse> { throw new Error("stream should be used"); },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            yield { kind: "started" };
            yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "json" };
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "partial" };
            cancelling.abort();
            yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "late" };
        },
    };
    await assert.rejects(
        executorFor(cancelledAdapter, cancelStore).execute({
            ...input(),
            control: { signal: cancelling.signal },
        }),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    const cancelled = cancelStore.records.find(record => record.recordType === "call_finished");
    assert.ok(cancelled?.recordType === "call_finished");
    assert.equal(cancelled.outcome, "cancelled");
    assert.deepEqual(cancelled.usage, { source: "unavailable" });
});

test("整块交付的流不伪造首个正文到完成的解码耗时", async () => {
    const metricsStore = new CaptureMetricsStore();
    const call = readToolCalls(completedResponse())[0]!;
    const adapter: LLMAdapter = {
        async generate(): Promise<LLMResponse> { throw new Error("stream should be used"); },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            yield { kind: "started" };
            yield { kind: "content_block_started", index: 0, blockType: "tool_call", delivery: "whole" };
            yield { kind: "content_block_completed", delivery: "whole", block: { index: 0, type: "tool_call", ...call } };
            yield { kind: "completed", response: blockResponse({ type: "tool_call", ...call }) };
        },
    };

    const decision = await executorFor(adapter, metricsStore).execute(input());
    assert.equal(decision.kind, "complete");
    const finished = metricsStore.records.find(record => record.recordType === "call_finished");
    assert.ok(finished?.recordType === "call_finished");
    assert.equal(finished.decodeDurationMs, undefined, "整块交付不得伪装逐 token 解码速率");
    assert.ok((finished.requestDurationMs ?? 0) > 0);
});
