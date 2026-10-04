import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { contract, type ModelAssistantMessage, type NativeConversationIdentity } from "../../contracts/src/index";
import { allocateImmutableEvent, createGoal, createToolRegistration, InMemoryToolRegistry, Runner, ExecutionAbortedError, GoalCoordinator, InlineScheduler, type TrajectoryEvent, type TrajectoryEventPayload } from "../../runtime/src/index";
import { JsonFileGoalStore, JsonFileTrajectoryStore, InMemoryGoalStore } from "../../storage/src/index";
import { collectNativeModelExchanges } from "../src/native-model-history";
import { TrajectoryEventProjector } from "../src/trajectory-event-projector";
import { createDefaultPromptBundleRenderer, createDefaultModelContextBudgetPolicy, createModelContextBudgetPolicy, createModelExecutionBinding, DropOldestContextCompactor, LLMStepExecutor, ModelInferenceProjector, TrajectoryModelContextAssembler } from "../src/index";
import { buildStepRequest } from "../src/prompt";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../../llm/src/core/adapter";
import { currentProtocols, currentWorkingMemory, createInMemoryTrajectoryStore } from "./current-fixtures";

const identity: NativeConversationIdentity = { provider: "google", endpoint: "https://generativelanguage.googleapis.com/v1beta", model: "test", protocol: "gemini-content" };
const projector = new TrajectoryEventProjector({ previewLimit: 100 });
const profile = { id: "native", systemPrompt: "Follow task", instructions: [], toolIds: ["read_file"] };
const renderer = await createDefaultPromptBundleRenderer();
const compactor = new DropOldestContextCompactor();
const initial = () => {
    const goal = createGoal({ ...currentProtocols, id: "native-goal", runId: "native-run", intent: "Read files", promptBundleVersion: 1, profile });
    return { ...goal, state: { ...goal.state, run: { ...goal.state.run, exposedToolIds: [...profile.toolIds] } } };
};
function message(toolId = "read_file", args: Record<string, unknown> = {}, signature = "signature"): ModelAssistantMessage {
    return { role: "assistant", content: "Checking", reasoning: "Summary", toolCalls: [{ callId: "provider-call", toolId, argumentsJson: JSON.stringify(args) }],
        continuation: { identity, parts: [{ text: "Checking" }, { functionCall: { name: toolId, args }, thoughtSignature: signature }] } };
}
function fixtures() {
    const events: TrajectoryEvent[] = [];
    const add = (payload: TrajectoryEventPayload, unit = "unit-1") => {
        const event = allocateImmutableEvent({ goalId: "native-goal", runId: "native-run", phase: "executing", executionUnitId: unit, eventType: payload.type, payload } as any, events.length + 1);
        events.push(event); return event;
    };
    const response = (toolId = "read_file", unit = "unit-1", signature = "signature") => add({ type: "model_response_received", stage: "decide", modelCallId: `call-${events.length}`, epochNumber: 0, conversationPosition: 0, message: message(toolId, {}, signature) }, unit);
    return { events, add, response };
}
function actionFixture(kind: "success" | "failure" | "rejected" = "success", signature = "signature") {
    const fixture = fixtures();
    const action = { actionId: "runtime-action", toolId: "read_file", input: {} };
    const observation = kind === "success" ? { kind, output: "x".repeat(1000), summary: "Observed" } : kind === "failure" ? { kind, error: "Failed", retryable: false } : { kind, reason: "Denied" };
    fixture.response("read_file", "unit-1", signature);
    fixture.add({ type: "decision_received", decision: { kind: "tool_call", action } });
    fixture.add({ type: "action_staged", action, approvalStatus: "approved" });
    if (kind !== "rejected") {
        fixture.add({ type: "tool_started", actionId: action.actionId, toolId: action.toolId, input: {} });
        fixture.add({ type: "tool_finished", actionId: action.actionId, toolId: action.toolId, observation } as any);
    }
    fixture.add({ type: "observation_recorded", actionId: action.actionId, observation } as any);
    return fixture;
}

for (const kind of ["success", "failure", "rejected"] as const) test(`native history returns committed ${kind} observation with independent IDs`, () => {
    const { events } = actionFixture(kind);
    const exchange = collectNativeModelExchanges(events, identity, projector).get("unit-1")![0]!;
    const tool = exchange.messages[1]!;
    assert.equal(tool.role, "tool");
    if (tool.role !== "tool") return;
    assert.equal(tool.callId, "provider-call");
    const result = JSON.parse(tool.content);
    assert.equal(result.actionId, "runtime-action");
    assert.equal(result.observation.kind, kind);
    if (kind === "success") assert.equal(result.observation.output.truncated, true);
});

test("pending approval and unfinished execution never fabricate tool results", () => {
    const { events } = actionFixture();
    const pending = events.slice(0, 3);
    assert.equal(collectNativeModelExchanges(pending, identity, projector).size, 0);
});

test("settled Think within unfinished step returns once through its native call", () => {
    const { events, add, response } = fixtures();
    add({ type: "think_requested", requestId: "think-1", stepOrdinal: 1, goal: "Inspect" });
    response("system_request_think");
    add({ type: "think_completed", requestId: "think-1", stepOrdinal: 1, goal: "Inspect", output: "Think output" });
    const exchanges = collectNativeModelExchanges(events, identity, projector).get("unit-1")!;
    assert.equal(exchanges.length, 1);
    assert.deepEqual(JSON.parse(exchanges[0]!.messages[1]!.content), { kind: "think_completed", output: "Think output" });
});

for (const kind of ["wait", "ask_user", "task_proposal", "complete", "fail"] as const) test(`system ${kind} returns an accepted-state acknowledgement`, () => {
    const { events, add, response } = fixtures();
    response(`system_${kind}`);
    add({ type: "decision_received", decision: { kind, reason: "Wait", summary: "Done", error: "Failed" } } as any);
    add(kind === "complete" ? { type: "run_completed", summary: "Done" } as any
        : kind === "fail" ? { type: "run_failed", error: "Failed" } as any
        : { type: "run_waiting", reason: "agent_wait" });
    const exchange = collectNativeModelExchanges(events, identity, projector).get("unit-1")![0]!;
    assert.equal(JSON.parse(exchange.messages[1]!.content).kind, "decision_accepted");
});

test("lookup result closes its system call", () => {
    const { events, add, response } = fixtures();
    response("system_context_lookup");
    add({ type: "decision_received", decision: { kind: "context_lookup", need: "historical_execution", question: "Find" } });
    add({ type: "context_lookup_requested", lookupId: "lookup", request: { need: "historical_execution", question: "Find" } } as any);
    add({ type: "context_lookup_not_found", lookupId: "lookup", result: { status: "not_found", lookupId: "lookup" } });
    const exchange = collectNativeModelExchanges(events, identity, projector).get("unit-1")![0]!;
    assert.equal(JSON.parse(exchange.messages[1]!.content).result.status, "not_found");
});

test("provider/model/endpoint changes and a semantic interlude terminate the native segment", () => {
    const { events, add } = actionFixture();
    for (const changed of [{ ...identity, model: "other" }, { ...identity, endpoint: "https://other.test/v1beta" }, { ...identity, provider: "openai" as const, protocol: "openai-chat" as const }]) {
        assert.equal(collectNativeModelExchanges(events, changed, projector).size, 0);
    }
    add({ type: "model_context_frame", stage: "decide", nativeIdentity: null, epochNumber: 0, conversationPosition: 0, sections: [] }, "semantic-step");
    assert.equal(collectNativeModelExchanges(events, identity, projector).size, 0);
});

async function assembledRequest(fixture: ReturnType<typeof actionFixture>, budget = 100000, boundary = fixture.events.length) {
    const store = createInMemoryTrajectoryStore();
    for (const event of fixture.events) { const { eventId: _, occurredAt: __, sequence: ___, ...draft } = event; await store.append(draft as any); }
    const goal = initial();
    const running = { ...goal, state: { ...goal.state, run: { ...goal.state.run, status: "running" as const, committedThroughSequence: boundary } } };
    return buildStepRequest(running, [], renderer, compactor, undefined, currentWorkingMemory,
        new TrajectoryModelContextAssembler({ trajectoryStore: store, policy: createModelContextBudgetPolicy({ modelInputBudget: budget }) }), undefined, undefined, "strict", "decide", undefined, identity);
}

test("assembler uses only committed exchanges, strips duplicate Hot payload, and keeps signed messages atomic", async () => {
    const fixture = actionFixture();
    const plan = await assembledRequest(fixture);
    assert.equal(plan.request.structuredOutput, undefined);
    assert.equal(plan.request.messages.filter(message => message.role === "tool").length, 1);
    assert.equal(JSON.stringify(plan.request.messages.at(-1)).includes("provider-call"), false);
    const tail = await assembledRequest(fixture, 100000, fixture.events.length - 1);
    assert.equal(tail.request.messages.some(message => message.role === "tool"), false);
    const large = await assembledRequest(actionFixture("success", "s".repeat(1000000)), 100000);
    assert.equal(large.request.messages.some(message => message.role === "tool" || message.role === "assistant" && message.continuation !== undefined), false);
    const warm = JSON.parse(large.request.messages.at(-1)!.content).trajectoryContext.warm;
    assert.ok(warm.some((entry: { evidenceSequences: number[] }) => entry.evidenceSequences.includes(fixture.events.at(-1)!.sequence)));
    assert.equal(JSON.stringify(warm).includes("thoughtSignature"), false);
});

test("native Decide rejects zero/multiple calls before dispatch", async () => {
    for (const calls of [[], [message().toolCalls![0]!, message().toolCalls![0]!]]) {
        const adapter: LLMAdapter = { structuredOutputMode: "strict", nativeConversationIdentity: identity, async generate() { return { content: "", toolCalls: calls }; } };
        const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: compactor, trajectoryContextAssembler: new TrajectoryModelContextAssembler({ trajectoryStore: createInMemoryTrajectoryStore(), policy: createDefaultModelContextBudgetPolicy() }) });
        const goal = initial();
        await assert.rejects(executor.decide({ goal: { ...goal, state: { ...goal.state, run: { ...goal.state.run, status: "running" } } }, authorizedTools: [], workingMemory: currentWorkingMemory, thinkHistory: [] }), (error: unknown) => {
            assert.ok(error instanceof Error && error.cause instanceof Error);
            assert.match(error.cause.message, /exactly one/);
            return true;
        });
    }
});

function nativeAdapter(generate: (request: LLMRequest) => Promise<LLMResponse>): LLMAdapter {
    return { structuredOutputMode: "strict", nativeConversationIdentity: identity, generate };
}
const responseFor = (toolId: string, args: Record<string, unknown>, callId = "provider-call"): LLMResponse => {
    const saved = message(toolId, args);
    return { ...saved, toolCalls: [{ ...saved.toolCalls![0]!, callId }] };
};
function executorFor(adapter: LLMAdapter, trajectoryStore: ReturnType<typeof createInMemoryTrajectoryStore>, thinkAdapter?: LLMAdapter) {
    const binding = createModelExecutionBinding({ generation: 1,
        selection: { provider: "google", modelId: "test", structuredOutputMode: "strict", inputEstimator: { kind: "character-v1" } },
        decideAdapter: adapter,
        thinkAdapter: thinkAdapter ?? { structuredOutputMode: "prompt_only", async generate() { throw new Error("Unexpected Think"); } },
        trajectoryStore,
    });
    return new LLMStepExecutor({ bindingProvider: { current: () => binding }, renderer, contextCompactor: compactor });
}

test("file-backed Runner restores native history after two tool steps without repeating tools", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-history-"));
    try {
        const store = new JsonFileGoalStore(join(directory, "goals"));
        const trajectory = new JsonFileTrajectoryStore(join(directory, "trajectory"));
        await store.save(initial());
        let executed = 0;
        const inputContract = contract.object({});
        const registry = new InMemoryToolRegistry([createToolRegistration({ definition: { id: "read_file", description: "Read", isReadOnly: true, inputContract }, replayPolicy: "safe", validate: () => ({ ok: true }),
            async execute() { executed++; return { kind: "success", output: { text: `file-${executed}` }, summary: "Observed" }; } })]);
        const requests: LLMRequest[] = [];
        const adapter = nativeAdapter(async request => {
            requests.push(request);
            if (requests.length === 3) throw new ExecutionAbortedError();
            assert.equal(request.messages.filter(message => message.role === "tool").length, requests.length - 1);
            return responseFor("read_file", {}, `provider-${requests.length}`);
        });
        await assert.rejects(new Runner({ store, trajectoryStore: trajectory, executor: executorFor(adapter, trajectory), toolRegistry: registry, toolPolicy: { evaluate: () => "allow" } })
            .run({ goalId: "native-goal", runId: "native-run" }), ExecutionAbortedError);
        assert.equal(executed, 2);
        const restoredStore = new JsonFileGoalStore(join(directory, "goals"));
        const restoredTrajectory = new JsonFileTrajectoryStore(join(directory, "trajectory"));
        const resumed = nativeAdapter(async request => {
            assert.deepEqual(request.messages.filter(message => message.role === "tool" || message.role === "assistant" && message.continuation !== undefined),
                requests[2]!.messages.filter(message => message.role === "tool" || message.role === "assistant" && message.continuation !== undefined));
            return responseFor("system_wait_for_input", { reason: "Await user" }, "wait-call");
        });
        const result = await new Runner({ store: restoredStore, trajectoryStore: restoredTrajectory, executor: executorFor(resumed, restoredTrajectory), toolRegistry: registry })
            .run({ goalId: "native-goal", runId: "native-run" });
        assert.equal(result.ok, true);
        if (result.ok) assert.equal(result.state.status, "waiting");
        assert.equal(executed, 2);
        const persisted = await restoredStore.restore("native-goal");
        const events = await restoredTrajectory.read({ goalId: "native-goal", runId: "native-run", toSequence: persisted!.state.run.committedThroughSequence });
        assert.equal(events.filter(event => event.eventType === "model_response_received").length, 3);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Runner restores a settled Think before final decision and sends its output only as tool result", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = createInMemoryTrajectoryStore();
    await store.save(initial());
    let calls = 0, thoughts = 0;
    const adapter = nativeAdapter(async () => {
        if (++calls === 1) return responseFor("system_request_think", { goal: "Inspect" });
        throw new ExecutionAbortedError();
    });
    const thinkAdapter: LLMAdapter = { structuredOutputMode: "prompt_only", async generate(request) {
        thoughts++;
        assert.equal(request.messages.some(message => message.role === "tool"), false);
        return { content: "Think output" };
    } };
    await assert.rejects(new Runner({ store, trajectoryStore: trajectory, executor: executorFor(adapter, trajectory, thinkAdapter) })
        .run({ goalId: "native-goal", runId: "native-run" }), ExecutionAbortedError);
    const resumed = nativeAdapter(async request => {
        const tools = request.messages.filter(message => message.role === "tool");
        assert.equal(tools.length, 1);
        assert.equal(JSON.parse(tools[0]!.content).output, "Think output");
        assert.equal(request.messages.filter(message => message.role === "assistant" && message.content === "Think output").length, 0);
        return responseFor("system_wait_for_input", { reason: "Await user" }, "wait-call");
    });
    const result = await new Runner({ store, trajectoryStore: trajectory, executor: executorFor(resumed, trajectory, thinkAdapter) })
        .run({ goalId: "native-goal", runId: "native-run" });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.state.status, "waiting");
    assert.equal(thoughts, 1);
});

test("accepted response checkpoint interrupted before decision does not bind a stale response to the recovered action", async () => {
    const inner = new InMemoryGoalStore();
    const trajectory = createInMemoryTrajectoryStore();
    await inner.save(initial());
    let interrupted = false;
    const store = { restore: (goalId: string) => inner.restore(goalId), async save(goal: ReturnType<typeof initial>) {
        await inner.save(goal);
        const events = await trajectory.read({ goalId: goal.id, runId: goal.state.run.id, toSequence: goal.state.run.committedThroughSequence });
        if (!interrupted && events.some(event => event.eventType === "model_response_received") && !events.some(event => event.eventType === "decision_received")) {
            interrupted = true; throw new ExecutionAbortedError();
        }
    } };
    let executed = 0;
    const registry = new InMemoryToolRegistry([createToolRegistration({ definition: { id: "read_file", description: "Read", isReadOnly: true, inputContract: contract.object({}) }, replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute() { executed++; return { kind: "success", output: "Read", summary: "Observed" }; } })]);
    await assert.rejects(new Runner({ store, trajectoryStore: trajectory, executor: executorFor(nativeAdapter(async () => responseFor("read_file", {}, "stale-call")), trajectory), toolRegistry: registry, toolPolicy: { evaluate: () => "allow" } })
        .run({ goalId: "native-goal", runId: "native-run" }), ExecutionAbortedError);
    assert.equal(executed, 0);
    let calls = 0;
    const resumed = nativeAdapter(async request => {
        if (++calls === 1) { assert.equal(request.messages.some(message => message.role === "tool"), false); return responseFor("read_file", {}, "recovered-call"); }
        const results = request.messages.filter(message => message.role === "tool");
        assert.equal(results.length, 1);
        assert.equal(results[0]!.callId, "recovered-call");
        return responseFor("system_wait_for_input", { reason: "Await user" });
    });
    const result = await new Runner({ store: inner, trajectoryStore: trajectory, executor: executorFor(resumed, trajectory), toolRegistry: registry, toolPolicy: { evaluate: () => "allow" } })
        .run({ goalId: "native-goal", runId: "native-run" });
    assert.equal(result.ok, true);
    assert.equal(executed, 1);
});

test("approval waiting restores the same native call ID and executes the approved action once", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = createInMemoryTrajectoryStore();
    await store.save(initial());
    let executed = 0;
    const registry = new InMemoryToolRegistry([createToolRegistration({ definition: { id: "read_file", description: "Read", isReadOnly: true, inputContract: contract.object({}) }, replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute() { executed++; return { kind: "success", output: "Read", summary: "Observed" }; } })]);
    const waiting = await new Runner({ store, trajectoryStore: trajectory, executor: executorFor(nativeAdapter(async () => responseFor("read_file", {})), trajectory), toolRegistry: registry, toolPolicy: { evaluate: () => "require_approval" } })
        .run({ goalId: "native-goal", runId: "native-run" });
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;
    assert.equal(waiting.state.status, "waiting");
    assert.equal(executed, 0);
    const pending = waiting.state.pendingAction!;
    const resumed = nativeAdapter(async request => {
        const results = request.messages.filter(message => message.role === "tool");
        assert.equal(results.length, 1);
        assert.equal(results[0]!.callId, "provider-call");
        assert.equal(JSON.parse(results[0]!.content).actionId, pending.action.actionId);
        return responseFor("system_wait_for_input", { reason: "Await user" }, "wait-call");
    });
    const runner = new Runner({ store, trajectoryStore: trajectory, executor: executorFor(resumed, trajectory), toolRegistry: registry, toolPolicy: { evaluate: () => "allow" } });
    const coordinator = new GoalCoordinator({ store, trajectoryStore: trajectory, scheduler: new InlineScheduler(runner) });
    const result = await coordinator.resume({ ref: { goalId: "native-goal", runId: "native-run" }, action: { kind: "approve_action", actionId: pending.action.actionId } });
    assert.equal(result.ok, true);
    assert.equal(executed, 1);
});
