import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createModelOutputContractBundle, SystemCompletionReviewDeclaration, type CompletionReviewResult,
} from "../../model-contracts/src/index";
import { createGoal, ModelStageFeedbackError, type ModelInputRecord, type ModelCallMetricRecord } from "../../runtime/src/index";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMResponse, LLMStreamEvent } from "../../llm/src/core/types";
import { LLMStepExecutor, createDefaultPromptBundleRenderer, DropOldestContextCompactor } from "../src/index";
import type { CompletionReviewInput } from "../../runtime/src/step-executor";
import { currentProtocols } from "./current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
function input(): CompletionReviewInput {
    const goal = createGoal({ ...currentProtocols, id: "review-goal", runId: "review-run", intent: "Say hello",
        promptBundleVersion: 1, profile: { id: "review", systemPrompt: "Answer the user.", instructions: [], toolIds: [] } });
    return { goal, authorizedTools: [], executionUnitId: "unit-review", evidence: [],
        candidate: { kind: "complete", summary: "Hello.", evidenceSequences: [] } };
}

test("text and native review contracts reject empty feedback and business decisions", () => {
    const bundle = createModelOutputContractBundle<CompletionReviewResult>({ kind: "completion_review" });
    for (const result of [{ kind: "accept" }, { kind: "reject", feedback: "Read source to support the claim." }]) {
        assert.deepEqual(bundle.decode({ result }), result);
        assert.deepEqual(SystemCompletionReviewDeclaration.decode({ result }), result);
    }
    for (const result of [{ kind: "reject", feedback: " \n" }, { kind: "complete", summary: "Done" }, { kind: "accept", feedback: "extra" }]) {
        assert.throws(() => bundle.decode({ result }));
        assert.throws(() => SystemCompletionReviewDeclaration.decode({ result }));
    }
});

for (const mode of ["strict", "prompt_only"] as const) {
    test(`${mode}: review has its own call, metrics and complete input without public text`, async () => {
        const records: ModelInputRecord[] = [];
        const metrics: ModelCallMetricRecord[] = [];
        const stream = new InMemoryExecutionStreamPublisher();
        let published = 0;
        const subscription = stream.subscribe({ goalId: "review-goal", runId: "review-run" });
        subscription.onEvent(() => { published++; });
        const reviewInput = input();
        const adapter: LLMAdapter = { structuredOutputMode: mode, async generate(request) {
            assert.deepEqual(request.tools?.map(tool => tool.id), ["system_review_completion"]);
            assert.equal(request.toolChoice, "required");
            assert.equal(request.structuredOutput !== undefined, mode === "strict");
            const content = JSON.parse(request.messages[1]!.content);
            assert.deepEqual(content.candidate, reviewInput.candidate);
            assert.deepEqual(content.committedEvidence, []);
            assert.deepEqual(content.conversation, reviewInput.goal.state.messages);
            return { content: "Internal review text.", toolCalls: [{ callId: "review-result", toolId: "system_review_completion", argumentsJson: '{"result":{"kind":"accept"}}' }],
                providerMetadata: { usage: { inputTokens: 20, outputTokens: 5 } } };
        } };
        const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: new DropOldestContextCompactor(),
            modelInputStore: { async append(record) { records.push(record); }, async read() { return records; } },
            metricsRecorder: { async record(record) { metrics.push(record); } } });
        assert.deepEqual(await executor.reviewCompletion({ ...reviewInput, executionStream: stream }), { kind: "accept" });
        assert.equal(records.length, 1);
        assert.equal(records[0]!.stage, "completion_review");
        assert.equal(metrics.length, 2);
        assert.ok(metrics.every(record => record.callId === records[0]!.callId));
        assert.equal(published, 0);
        subscription.close();
        stream.dispose();
    });
}

for (const [name, response] of Object.entries({
    malformed: { content: "{broken" },
    blank: { content: '{"result":{"kind":"reject","feedback":" "}}' },
    businessDecision: { content: '{"result":{"kind":"complete","summary":"done"}}' },
    undeclaredTool: { content: "", toolCalls: [{ callId: "bad", toolId: "bash", argumentsJson: "{}" }] },
    multipleResults: { content: "", toolCalls: [1, 2].map(index => ({ callId: String(index), toolId: "system_review_completion", argumentsJson: '{"result":{"kind":"accept"}}' })) },
} satisfies Record<string, LLMResponse>)) {
    test(`invalid review ${name} goes through Decide correction`, async () => {
        const adapter: LLMAdapter = { structuredOutputMode: "strict", async generate() { return response; } };
        const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: new DropOldestContextCompactor() });
        await assert.rejects(executor.reviewCompletion(input()), error => error instanceof ModelStageFeedbackError
            && error.feedback.stage === "decide" && error.feedback.goalId === "review-goal");
    });
}

test("required review input overflow is rejected before any model call", async () => {
    let calls = 0;
    const adapter: LLMAdapter = { structuredOutputMode: "strict", async generate() { calls++; return { content: '{"result":{"kind":"accept"}}' }; } };
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: new DropOldestContextCompactor() });
    const review = input();
    const large = { ...review, goal: { ...review.goal, state: { ...review.goal.state, messages: [{ role: "user" as const, content: "source".repeat(40_000) }] } } };
    await assert.rejects(executor.reviewCompletion(large), /exceeds the model budget/);
    assert.equal(calls, 0);
});

test("streaming review text, reasoning and result arguments stay outside the public stream", async () => {
    const stream = new InMemoryExecutionStreamPublisher();
    const subscription = stream.subscribe({ goalId: "review-goal", runId: "review-run" });
    let published = 0;
    subscription.onEvent(() => { published++; });
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate() { throw new Error("Expected streaming review"); },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            yield { kind: "started" };
            yield { kind: "assistant_text_delta", text: "Internal review" };
            yield { kind: "reasoning_delta", text: "Internal reasoning" };
            yield { kind: "model_tool_call_delta", delta: '{"result":{"kind":"accept"}}' };
            yield { kind: "completed", response: { content: "", toolCalls: [{ callId: "native-review", toolId: "system_review_completion", argumentsJson: '{"result":{"kind":"accept"}}' }] } };
        },
    };
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: new DropOldestContextCompactor() });
    assert.deepEqual(await executor.reviewCompletion({ ...input(), executionStream: stream }), { kind: "accept" });
    assert.equal(published, 0);
    subscription.close();
    stream.dispose();
});
