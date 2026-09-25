import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse, LLMStreamEvent } from "../../llm/src/core/types";
import {
    createGoal,
    type ModelCallMetricRecord,
    type ModelCallMetricsRecorder,
} from "../../runtime/src/index";
import type { Goal, GoalMessage } from "../../runtime/src/domain";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLMStepExecutor,
} from "../src/index";
import {
    createCurrentContextAssembler,
    currentProtocols,
    currentWorkingMemory,
} from "./current-fixtures";

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
    const message: GoalMessage = {
        role: "user",
        content: "请检查指标记录。",
    };

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
        content: JSON.stringify({
            result: {
                kind: "complete",
                summary: "检查完成",
                completionEvidence: [],
                memoryPatch: null,
            },
        }),
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

test("LLMStepExecutor records provider usage and first-text-to-completion duration", async () => {
    const metricsStore = new CaptureMetricsStore();
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(): Promise<LLMResponse> {
            throw new Error("stream should be used");
        },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            yield { kind: "started" };
            yield { kind: "assistant_text_delta", text: "{" };
            await new Promise((resolve) => setTimeout(resolve, 2));
            yield { kind: "assistant_text_delta", text: "}" };
            yield {
                kind: "completed",
                response: completedResponse({
                    usage: { inputTokens: 120, outputTokens: 18, cachedInputTokens: 45 },
                }),
            };
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
    assert.ok((finished.decodeDurationMs ?? 0) > 0);
});

test("LLMStepExecutor leaves pi-ai diagnostic usage unavailable and omits non-stream speed", async () => {
    const metricsStore = new CaptureMetricsStore();
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
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
    assert.deepEqual(finished.usage, { source: "unavailable" });
    assert.equal(finished.decodeDurationMs, undefined);
});

test("LLMStepExecutor records failed calls and isolates metric Store failures", async () => {
    const failedCallRecords = new CaptureMetricsStore();
    const failingAdapter: LLMAdapter = {
        structuredOutputMode: "strict",
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
    assert.deepEqual(failed.usage, { source: "unavailable" });

    const unavailableRecorder: ModelCallMetricsRecorder = {
        async record(): Promise<void> {
            throw new Error("metrics unavailable");
        },
    };
    const successfulAdapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(_request: LLMRequest): Promise<LLMResponse> {
            return completedResponse();
        },
    };
    const decision = await executorFor(successfulAdapter, unavailableRecorder).execute(input());
    assert.equal(decision.kind, "complete");
});
