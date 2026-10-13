import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createModelOutputContractBundle, SystemCompletionReviewDeclaration, type CompletionReviewResult,
} from "../../model-contracts/src/index";
import { allocateImmutableEvent, CompletionReviewInputBudgetError, createGoal, ModelStageFeedbackError,
    type ModelInputRecord, type ModelCallMetricRecord, type TrajectoryEvent } from "../../runtime/src/index";
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
    await assert.rejects(executor.reviewCompletion(large), error => error instanceof CompletionReviewInputBudgetError
        && error.code === "COMPLETION_REVIEW_INPUT_TOO_LARGE");
    assert.equal(calls, 0);
});

test("review retains cited source observations once when many files are read", async () => {
    const evidence: TrajectoryEvent[] = [];
    const sequences: number[] = [];
    for (let index = 0; index < 20; index++) {
        const actionId = `read-${index}`;
        const path = `docs/source-${index}.md`;
        const observation = { kind: "success" as const, output: { path, text: `${path}:${"source".repeat(750)}` }, summary: "Read source" };
        const common = { goalId: "review-goal", runId: "review-run", phase: "executing" as const, actionId };
        const start = index * 3 + 1;
        evidence.push(allocateImmutableEvent({ ...common, eventType: "action_staged",
            payload: { type: "action_staged", action: { actionId, toolId: "read_file", input: { path } }, approvalStatus: "approved" } }, start, `event-${start}`));
        evidence.push(allocateImmutableEvent({ ...common, eventType: "tool_finished",
            payload: { type: "tool_finished", actionId, toolId: "read_file", observation } }, start + 1, `event-${start + 1}`));
        evidence.push(allocateImmutableEvent({ ...common, eventType: "observation_recorded",
            payload: { type: "observation_recorded", actionId, observation } }, start + 2, `event-${start + 2}`));
        sequences.push(start + 2);
    }
    let calls = 0;
    const adapter: LLMAdapter = { structuredOutputMode: "strict", async generate(request) {
        calls++;
        const content = JSON.parse(request.messages[1]!.content);
        assert.deepEqual(content.candidate.evidenceSequences, sequences);
        assert.equal(content.committedEvidence.length, 40);
        assert.equal(content.committedEvidence.filter((event: TrajectoryEvent) => event.eventType === "tool_finished").length, 0);
        assert.equal(content.committedEvidence.filter((event: TrajectoryEvent) => event.eventType === "observation_recorded").length, 20);
        assert.ok(request.messages[1]!.content.includes("docs/source-19.md:source"));
        return { content: "", toolCalls: [{ callId: "review-result", toolId: "system_review_completion",
            argumentsJson: '{"result":{"kind":"accept"}}' }] };
    } };
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: new DropOldestContextCompactor() });
    const review = input();
    assert.deepEqual(await executor.reviewCompletion({ ...review, evidence,
        candidate: { kind: "complete", summary: "The cited sources support the report.", evidenceSequences: sequences } }), { kind: "accept" });
    assert.equal(calls, 1);
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

test("review receives the actual source request and scoped lookup without an optional Patch", async () => {
    const fixture = input();
    const request = "Read project memory files, select a real historical decision and propose a reversal condition.";
    const goal = { ...fixture.goal, state: { ...fixture.goal.state, messages: [{ role: "user" as const, content: request }] } };
    const candidate = { kind: "complete" as const, summary: "A generic example is to split a monolith into microservices.", evidenceSequences: [] };
    const adapter: LLMAdapter = { structuredOutputMode: "strict", async generate(modelRequest) {
        const content = JSON.parse(modelRequest.messages[1]!.content);
        assert.equal(content.conversation[0].content, request);
        assert.deepEqual(content.candidate, candidate);
        assert.equal(content.historicalLookup.sourceScope, "goal_history");
        assert.match(content.historicalLookup.limitations, /not searched/);
        assert.deepEqual(content.committedEvidence, []);
        return { content: '{"result":{"kind":"reject","feedback":"Read the requested repository files and identify a documented real decision."}}' };
    } };
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: new DropOldestContextCompactor() });
    const reviewed = await executor.reviewCompletion({ ...fixture, goal, candidate, contextLookupResult: { status: "not_found", lookupId: "query", reason: "no_context_match" } });
    assert.deepEqual(reviewed, { kind: "reject", feedback: "Read the requested repository files and identify a documented real decision." });
});

test("deduplicates paired tool output text while preserving action identity and failed observation", async () => {
    const fixture = input();
    const action1 = "act-read-success";
    const longSuccessText = "export const answer = 42; " + "repeat-content-".repeat(50);
    const successObs = { kind: "success" as const, output: { path: "src/a.ts", text: longSuccessText }, summary: "Read success" };

    const action2 = "act-read-fail";
    const failObs = { kind: "failure" as const, code: "FILE_NOT_FOUND", message: "File not found", retryable: false };

    const events: TrajectoryEvent[] = [
        // action 1: 包含 action_staged, tool_finished 和 observation_recorded
        allocateImmutableEvent({ goalId: "review-goal", runId: "review-run", phase: "executing", actionId: action1, eventType: "action_staged",
            payload: { type: "action_staged", action: { actionId: action1, toolId: "read_file", input: { path: "src/a.ts" } }, approvalStatus: "approved" } }, 1),
        allocateImmutableEvent({ goalId: "review-goal", runId: "review-run", phase: "executing", actionId: action1, eventType: "tool_finished",
            payload: { type: "tool_finished", actionId: action1, toolId: "read_file", observation: successObs } }, 2),
        allocateImmutableEvent({ goalId: "review-goal", runId: "review-run", phase: "executing", actionId: action1, eventType: "observation_recorded",
            payload: { type: "observation_recorded", actionId: action1, observation: successObs } }, 3),

        // action 2: 只有 action_staged 与 tool_finished (失败观测)
        allocateImmutableEvent({ goalId: "review-goal", runId: "review-run", phase: "executing", actionId: action2, eventType: "action_staged",
            payload: { type: "action_staged", action: { actionId: action2, toolId: "read_file", input: { path: "src/missing.ts" } }, approvalStatus: "approved" } }, 4),
        allocateImmutableEvent({ goalId: "review-goal", runId: "review-run", phase: "executing", actionId: action2, eventType: "tool_finished",
            payload: { type: "tool_finished", actionId: action2, toolId: "read_file", observation: failObs } }, 5),

        // 内部 Think 与阶段声明不作为外部事实
        allocateImmutableEvent({ goalId: "review-goal", runId: "review-run", phase: "executing", eventType: "think_completed",
            payload: { type: "think_completed", requestId: "req-1", stepOrdinal: 1, goal: "analyze", output: "think output" } }, 6),
        allocateImmutableEvent({ goalId: "review-goal", runId: "review-run", phase: "executing", eventType: "run_stage_declared",
            payload: { type: "run_stage_declared", stageId: "stage-1", revision: 1, target: "Analyze code", acceptanceCriteria: ["Tests pass"] } }, 7),
    ];

    let recordedContent: any = null;
    const adapter: LLMAdapter = { structuredOutputMode: "strict", async generate(modelRequest) {
        recordedContent = JSON.parse(modelRequest.messages[1]!.content);
        return { content: "", toolCalls: [{ callId: "c1", toolId: "system_review_completion", argumentsJson: '{"result":{"kind":"accept"}}' }] };
    } };
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: new DropOldestContextCompactor() });
    await executor.reviewCompletion({ ...fixture, evidence: events });

    assert.ok(recordedContent !== null);
    // 检查成对事件的 tool_finished 已被去重，但唯一的 tool_finished (action 2) 被保留
    const committed = recordedContent.committedEvidence as TrajectoryEvent[];
    assert.equal(committed.some(e => e.eventType === "think_completed"), false);
    assert.equal(committed.some(e => e.eventType === "run_stage_declared"), false);
    // action1 的 tool_finished 应当被剔除，只有 observation_recorded
    assert.equal(committed.filter(e => e.actionId === action1 && e.eventType === "tool_finished").length, 0);
    assert.equal(committed.filter(e => e.actionId === action1 && e.eventType === "observation_recorded").length, 1);
    // action2 的 tool_finished 应当被保留
    assert.equal(committed.filter(e => e.actionId === action2 && e.eventType === "tool_finished").length, 1);
    // 整个 payload 中，长正文 longSuccessText 只出现一次（在 observation_recorded 中）
    const occurrences = (JSON.stringify(committed).match(/repeat-content-/g) || []).length;
    assert.equal(occurrences, 50); // 只有一份
});

test("review request includes current stage and supports run_stage_complete candidate", async () => {
    const fixture = input();
    const currentStage = {
        stageId: "stage-inspect",
        revision: 2,
        status: "executing" as const,
        target: "Inspect auth module",
        acceptanceCriteria: ["Identify auth boundaries"],
        latestReviewRejection: { feedback: "Missing boundaries" },
    };
    const candidate = {
        kind: "run_stage_complete" as const,
        stageId: "stage-inspect",
        summary: "Auth boundaries identified in src/auth.ts.",
    };

    let recordedContent: any = null;
    const adapter: LLMAdapter = { structuredOutputMode: "strict", async generate(modelRequest) {
        recordedContent = JSON.parse(modelRequest.messages[1]!.content);
        return { content: "", toolCalls: [{ callId: "c1", toolId: "system_review_completion", argumentsJson: '{"result":{"kind":"accept"}}' }] };
    } };
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: new DropOldestContextCompactor() });
    await executor.reviewCompletion({ ...fixture, candidate, currentStage });

    assert.ok(recordedContent !== null);
    assert.deepEqual(recordedContent.candidate, candidate);
    assert.deepEqual(recordedContent.currentStage, {
        stageId: "stage-inspect",
        revision: 2,
        target: "Inspect auth module",
        acceptanceCriteria: ["Identify auth boundaries"],
        status: "executing",
        latestReviewRejection: { feedback: "Missing boundaries" },
    });
});

test("review request includes historical accepted stage evidence for overall verification", async () => {
    const fixture = input();
    const histEvent = allocateImmutableEvent({
        goalId: "review-goal", runId: "review-run", phase: "executing", actionId: "hist-read", eventType: "observation_recorded",
        payload: { type: "observation_recorded", actionId: "hist-read", observation: { kind: "success", output: { text: "prior stage fact" }, summary: "done" } },
    }, 1);

    let recordedContent: any = null;
    const adapter: LLMAdapter = { structuredOutputMode: "strict", async generate(modelRequest) {
        recordedContent = JSON.parse(modelRequest.messages[1]!.content);
        return { content: "", toolCalls: [{ callId: "c1", toolId: "system_review_completion", argumentsJson: '{"result":{"kind":"accept"}}' }] };
    } };
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: new DropOldestContextCompactor() });
    await executor.reviewCompletion({ ...fixture, historicalAcceptedEvidence: [histEvent] });

    assert.ok(recordedContent !== null);
    assert.ok(recordedContent.historicalAcceptedEvidence !== undefined);
    assert.equal(recordedContent.historicalAcceptedEvidence.length, 1);
    assert.match(JSON.stringify(recordedContent.historicalAcceptedEvidence), /prior stage fact/);
});


test("review omits unrelated assistant history while retaining original user constraints and source positions", async () => {
    const fixture = input();
    const messages = [
        { role: "user" as const, content: "Keep the public API unchanged." },
        { role: "assistant" as const, assistant: { profileId: "review" }, content: "irrelevant-history".repeat(40_000) },
        { role: "assistant" as const, assistant: { profileId: "review" }, content: "Which result should I verify?" },
        { role: "user" as const, content: "Now verify the final result." },
    ];
    let called = false;
    const adapter: LLMAdapter = { structuredOutputMode: "strict", async generate(request) {
        called = true;
        const content = JSON.parse(request.messages[1]!.content);
        assert.deepEqual(content.conversation, [messages[0], messages[2], messages[3]]);
        assert.deepEqual(content.conversationSources.map((source: { messageIndex: number }) => source.messageIndex), [0, 2, 3]);
        assert.equal(content.originalIntent, fixture.goal.definition.intent);
        assert.deepEqual(content.profile, fixture.goal.definition.profile);
        assert.deepEqual(content.candidate, fixture.candidate);
        return { content: '{"result":{"kind":"accept"}}' };
    } };
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: new DropOldestContextCompactor() });
    await executor.reviewCompletion({ ...fixture, goal: { ...fixture.goal, state: { ...fixture.goal.state, messages } } });
    assert.equal(called, true);
});
