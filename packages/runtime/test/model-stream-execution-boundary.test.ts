import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import { ExecutionAbortedError, TransientModelRequestFailure } from "../../execution-control/src/index";
import type { LLMAdapter, LLMToolCall } from "../../llm-core/src/index";
import type { LLMRequest, LLMResponse, LLMStreamEvent } from "../../llm-core/src/index";
import { blockResponse } from "../../llm-core/test/response-fixtures";
import { createToolRegistration, InMemoryToolRegistry } from "../../tool-core/src/index";
import { createDefaultPromptBundleRenderer } from "../../prompt-bundle/src/index";
import { DropOldestContextCompactor } from "../../context-budget/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import type { ExecutionStreamPublisher } from "../../execution-stream/src/index";
import { createGoal, Runner } from "../src/index";
import type { AgentProfile, Goal, TrajectoryEvent } from "../src/index";
import { LLMStepExecutor } from "../../model-execution/src/index";
import {
    createCurrentContextAssembler,
    currentProtocols,
    currentWorkingMemory,
} from "../../agent/test/current-fixtures";
import { trajectoryStoreFor } from "./current-fixtures";
import { createTransitionalToolInputBinding } from "../../tool-core/test/transitional-binding";
import { createTestToolRegistration } from "../../tool-core/test/helpers";

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();

const profile: AgentProfile = {
    id: "boundary-profile",
    systemPrompt: "按批注执行",
    instructions: ["先取证再完成"],
    toolIds: ["bash"],
};

function bashRegistration(execute: (command: string) => Promise<{
    readonly kind: "success";
    readonly output: { readonly text: string };
    readonly summary: string;
}>) {
    return createTestToolRegistration({
        definition: {
            id: "bash",
            description: "Run one read-only command",
            isReadOnly: true,
            inputBinding: createTransitionalToolInputBinding({ contractId: "test.tool", version: 1, contract: contract.object({ command: contract.string() }) }),
            inputContract: contract.object({ command: contract.string() }),
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute({ input }: { readonly input: { readonly command: string } }) {
            return execute(input.command);
        },
    });
}

function createExecutingGoal(goalId: string, runId: string): Goal {
    const created = createGoal({
        ...currentProtocols,
        id: goalId,
        runId,
        intent: "验证流式执行边界",
        promptBundleVersion: 1,
        profile,
    });
    return {
        ...created,
        state: {
            ...created.state,
            workflow: { phase: "executing" },
            run: {
                ...created.state.run, status: "running", mode: "plan", exposedToolIds: ["bash"], approvedTask: {
                    objective: "验证流式执行边界",
                    completionCriteria: [{ text: "同一响应完成后才进入执行" }],
                },
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing",
                    target: "验证流式执行边界",
                    acceptanceCriteria: ["同一响应完成后才进入执行"],
                },
            },
        },
    };
}

function executorFor(adapter: LLMAdapter): LLMStepExecutor {
    return new LLMStepExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });
}

function isReviewRequest(request: LLMRequest): boolean {
    return request.tools?.some(tool => tool.id === "system_review_completion") === true;
}

/** 一次工具块的完整流事件序列；参数按原始 JSON 文本分片交付。 */
function toolCallEvents(block: LLMToolCall, fragments?: readonly string[]): LLMStreamEvent[] {
    const parts = fragments ?? [block.argumentsJson];
    return [
        { kind: "started" },
        { kind: "content_block_started", index: 0, blockType: "tool_call", delivery: "incremental" },
        ...parts.map(fragment => ({ kind: "content_block_delta", index: 0, deltaKind: "tool_arguments", delta: fragment }) as const),
        { kind: "content_block_completed", delivery: "incremental", block: { index: 0, type: "tool_call", ...block } },
    ];
}

function latestObservationSequence(events: readonly TrajectoryEvent[]): number | undefined {
    return events.filter(event => event.payload.type === "observation_recorded").at(-1)?.sequence;
}

test("完整工具块在响应正常结束前不创建待审批操作或工具效果", async () => {
    const goalId = "goal-stream-boundary";
    const runId = "run-stream-boundary";
    const store = new InMemoryGoalStore();
    await store.save(createExecutingGoal(goalId, runId));
    const trajectoryStore = trajectoryStoreFor(store);
    const executed: string[] = [];
    const registry = new InMemoryToolRegistry([bashRegistration(async command => {
        executed.push(command);
        return { kind: "success", output: { text: "AGENTS.md" }, summary: "Observed" };
    })]);

    let releaseBarrier!: () => void;
    const barrier = new Promise<void>(resolve => { releaseBarrier = resolve; });
    let barrierReached = false;
    let calls = 0;
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(): Promise<LLMResponse> {
            throw new Error("stream adapter must not call generate");
        },
        async *stream(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
            calls += 1;
            if (isReviewRequest(request)) {
                const review: LLMToolCall = {
                    callId: `call-review-${calls}`, toolId: "system_review_completion",
                    argumentsJson: JSON.stringify({ result: { kind: "accept" } }),
                };
                yield* toolCallEvents(review);
                yield { kind: "completed", response: blockResponse({ type: "tool_call", ...review }) };
                return;
            }
            if (calls === 1) {
                const call: LLMToolCall = { callId: "call-bash-1", toolId: "bash", argumentsJson: JSON.stringify({ command: "ls -la" }) };
                yield* toolCallEvents(call, ['{"command"', ':"ls -la"}']);
                // 完整工具块已经到达，但整个响应尚未结束：此处等待屏障，调用不得进入执行。
                barrierReached = true;
                await barrier;
                yield { kind: "completed", response: blockResponse({ type: "tool_call", ...call }) };
                return;
            }
            const events = await trajectoryStore.read({ goalId, runId });
            const sequence = latestObservationSequence(events);
            assert.ok(typeof sequence === "number");
            const complete: LLMToolCall = {
                callId: `call-complete-${calls}`, toolId: "system_complete_task",
                argumentsJson: JSON.stringify({
                    summary: "The stream boundary was verified with one committed observation.",
                    completionEvidence: [{ criterionIndex: 0, evidenceSequences: [sequence] }],
                    memoryPatch: null,
                }),
            };
            yield* toolCallEvents(complete);
            yield { kind: "completed", response: blockResponse({ type: "tool_call", ...complete }) };
        },
    };

    const runner = new Runner({ store, trajectoryStore, executor: executorFor(adapter), toolRegistry: registry });
    const running = runner.run({ goalId, runId });

    while (!barrierReached) await new Promise(resolve => setTimeout(resolve, 5));
    await new Promise(resolve => setTimeout(resolve, 30));
    // 屏障期间：没有执行、没有待审批操作、没有行动或观察事件。
    assert.deepEqual(executed, []);
    const snapshot = await store.restore(goalId);
    assert.equal(snapshot?.state.run.pendingAction, undefined);
    const beforeRelease = await trajectoryStore.read({ goalId, runId });
    assert.equal(beforeRelease.some(event => event.payload.type === "action_staged"), false);
    assert.equal(beforeRelease.some(event => event.payload.type === "observation_recorded"), false);

    releaseBarrier();
    const result = await running;
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed", JSON.stringify({ status: result.state.status }));
    assert.deepEqual(executed, ["ls -la"]);
    const events = await trajectoryStore.read({ goalId, runId });
    assert.equal(events.filter(event => event.payload.type === "tool_started").length, 1);
    assert.equal(events.filter(event => event.payload.type === "observation_recorded").length, 1);
});

test("完整工具块后失败或取消不产生本次响应的工具效果，合法重试使用新的调用身份", async () => {
    const goalId = "goal-stream-failure";
    const runId = "run-stream-failure";
    const store = new InMemoryGoalStore();
    await store.save(createExecutingGoal(goalId, runId));
    const trajectoryStore = trajectoryStoreFor(store);
    const executed: string[] = [];
    const registry = new InMemoryToolRegistry([bashRegistration(async command => {
        executed.push(command);
        return { kind: "success", output: { text: "AGENTS.md" }, summary: "Observed" };
    })]);

    const publishedCallIds: string[] = [];
    const executionStream: ExecutionStreamPublisher = {
        publish(event) {
            const payload = event.payload as { readonly modelCallId?: string };
            if (payload.modelCallId !== undefined) publishedCallIds.push(`${event.kind}:${payload.modelCallId}`);
        },
        subscribe() { throw new Error("not used"); },
        subscribeGoal() { throw new Error("unused"); },
        close() {},
        closeGoal() {},
        dispose() {},
    };

    let calls = 0;
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(): Promise<LLMResponse> {
            throw new Error("stream adapter must not call generate");
        },
        async *stream(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
            calls += 1;
            if (isReviewRequest(request)) {
                const review: LLMToolCall = {
                    callId: `call-review-${calls}`, toolId: "system_review_completion",
                    argumentsJson: JSON.stringify({ result: { kind: "accept" } }),
                };
                yield* toolCallEvents(review);
                yield { kind: "completed", response: blockResponse({ type: "tool_call", ...review }) };
                return;
            }
            const events = await trajectoryStore.read({ goalId, runId });
            const observed = events.some(event => event.payload.type === "observation_recorded");
            if (calls === 1 || !observed) {
                const call: LLMToolCall = {
                    callId: `call-attempt-${calls}`, toolId: "bash",
                    argumentsJson: JSON.stringify({ command: `attempt-${calls}` }),
                };
                yield* toolCallEvents(call);
                if (calls === 1) {
                    // 完整工具块已到达后请求失败：本次响应没有任何执行资格。
                    throw new TransientModelRequestFailure("connection", { retryAfterMs: 10 });
                }
                yield { kind: "completed", response: blockResponse({ type: "tool_call", ...call }) };
                return;
            }
            const sequence = latestObservationSequence(events);
            assert.ok(typeof sequence === "number");
            const complete: LLMToolCall = {
                callId: `call-complete-${calls}`, toolId: "system_complete_task",
                argumentsJson: JSON.stringify({
                    summary: "The retried call produced the only tool effect.",
                    completionEvidence: [{ criterionIndex: 0, evidenceSequences: [sequence] }],
                    memoryPatch: null,
                }),
            };
            yield* toolCallEvents(complete);
            yield { kind: "completed", response: blockResponse({ type: "tool_call", ...complete }) };
        },
    };

    const runner = new Runner({ store, trajectoryStore, executor: executorFor(adapter), toolRegistry: registry, executionStream });
    const result = await runner.run({ goalId, runId });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    // 第一次尝试的完整工具块没有产生任何工具效果；合法重试沿用既有预算并产生新调用身份。
    assert.deepEqual(executed, ["attempt-2"]);
    // 未提交片段不进入 Goal 对话，也不出现在下一次请求中。
    const messages = (await store.restore(goalId))!.state.messages;
    assert.equal(messages.some(message => message.content.includes("attempt-1")), false);
    assert.equal(JSON.stringify(messages).includes("call-attempt-1"), false);
    const nextRequest = (adapter as unknown as { lastRequest?: LLMRequest }).lastRequest;
    if (nextRequest !== undefined) {
        assert.equal(JSON.stringify(nextRequest.messages).includes("attempt-1"), false);
    }
    const events = await trajectoryStore.read({ goalId, runId });
    assert.equal(events.filter(event => event.payload.type === "tool_started").length, 1);
    assert.equal(events.filter(event => event.payload.type === "model_request_retry_recorded").length, 1);
    const modelCallIds = publishedCallIds.filter(entry => entry.startsWith("model_started:"))
        .map(entry => entry.slice("model_started:".length));
    assert.ok(modelCallIds.length >= 2, `expected at least two calls, got ${modelCallIds.length}`);
    assert.equal(new Set(modelCallIds).size, modelCallIds.length, `每次调用使用独立 modelCallId: ${publishedCallIds.join(" | ")}`);
    // 失败调用的终止摘要在同一调用身份上发布，且不携带任何块内容。
    assert.ok(publishedCallIds.includes(`model_failed:${modelCallIds[0]}`));
    assert.equal(JSON.stringify(publishedCallIds).includes("attempt-1"), false);
});

test("派发前取消、chunk 间取消与迭代清理失败都保留主错误", async () => {
    const canceled = new AbortController();
    canceled.abort();
    let dispatched = 0;
    const preAborted: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(): Promise<LLMResponse> {
            dispatched += 1;
            return blockResponse({ type: "text", text: "unused" });
        },
    };
    await assert.rejects(
        executorFor(preAborted).decide({
            goal: createExecutingGoal("goal-cancel", "run-cancel"),
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
            thinkHistory: [],
            control: { signal: canceled.signal },
        }),
        // 派发前取消沿既有取消信号传播（现有装配在派发前使用 AbortSignal.throwIfAborted）。
        (error: unknown) => error instanceof ExecutionAbortedError
            || (error as Error | undefined)?.name === "AbortError",
    );
    assert.equal(dispatched, 0);

    const controller = new AbortController();
    let cleanupAttempted = false;
    let primaryMessages: string[] = [];
    const chunkAborted: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(): Promise<LLMResponse> {
            throw new Error("stream adapter must not call generate");
        },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            try {
                yield { kind: "started" };
                yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "json" };
                yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "partial" };
                controller.abort();
                yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "late" };
            } finally {
                // 迭代清理自身失败也不得覆盖主错误。
                cleanupAttempted = true;
                throw new Error("iterator cleanup failed");
            }
        },
    };

    await assert.rejects(
        executorFor(chunkAborted).decide({
            goal: createExecutingGoal("goal-cancel-chunks", "run-cancel-chunks"),
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
            thinkHistory: [],
            control: { signal: controller.signal },
        }),
        (error: unknown) => {
            primaryMessages = [error instanceof Error ? error.message : String(error)];
            return error instanceof ExecutionAbortedError;
        },
    );
    assert.equal(cleanupAttempted, true);
    assert.equal(primaryMessages.some(message => /cleanup failed/.test(message)), false);
});
