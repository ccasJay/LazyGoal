import assert from "node:assert/strict";
import { test } from "node:test";

import { createGoal, Runner, type AgentProfile, type StepExecutor } from "../src/index";
import { ExecutionAbortedError } from "../../execution-control/src/index";
import { contract } from "../../contracts/src/index";
import { createToolRegistration, type Tool } from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = { id: "interrupt-profile", systemPrompt: "test", instructions: [], toolIds: [] };

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

test("Interrupt persists intent, stops only the active Run, and settles it as cancelled", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({ ...currentProtocols, promptBundleVersion: 1, id: "goal-interrupt", intent: "interrupt", profile, runId: "run-interrupt" });
    await store.save(initial);
    const entered = deferred();
    let calls = 0;
    const executor: StepExecutor = {
        async decide({ control }) {
            calls += 1;
            entered.resolve();
            return new Promise((_, reject) => {
                const signal = control?.signal;
                if (signal === undefined) return reject(new Error("missing cancellation signal"));
                signal.addEventListener("abort", () => reject(new ExecutionAbortedError()), { once: true });
            });
        },
        async think() { throw new Error("unexpected Think call"); },
        async reviewCompletion() { return { kind: "accept" }; },
    };
    const runner = new Runner({ store, trajectoryStore: trajectory, executor });
    const execution = runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    await entered.promise;

    const accepted = await runner.interrupt({ goalId: initial.id, runId: initial.state.run.id }, "interrupt-request-1");
    assert.deepEqual(accepted, {
        ok: true,
        goalId: initial.id,
        runId: initial.state.run.id,
        requestId: "interrupt-request-1",
        existing: false,
    });
    const result = await execution;
    assert.equal(result.ok, true);
    assert.equal(calls, 1);

    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.equal(saved.state.run.status, "cancelled");
    assert.deepEqual(saved.state.run.interruption, {
        requestId: "interrupt-request-1",
        status: "finished",
        repairCallsStarted: 0,
    });
    assert.deepEqual(trajectory.events.filter((event) => event.eventType.startsWith("run_interrupt") || event.eventType === "run_cancelled").map((event) => event.eventType), [
        "run_interrupt_requested", "run_cancelled",
    ]);
    assert.deepEqual(await runner.interrupt({ goalId: initial.id, runId: initial.state.run.id }, "interrupt-request-1"), {
        ok: true, goalId: initial.id, runId: initial.state.run.id, requestId: "interrupt-request-1", existing: true,
    });
});

test("Interrupted Tool records an unknown failure for repair and never fabricates tool_finished", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const toolProfile: AgentProfile = { ...profile, toolIds: ["write_probe"] };
    const created = createGoal({ ...currentProtocols, promptBundleVersion: 1, id: "goal-interrupt-tool", intent: "inspect interrupted write", profile: toolProfile, runId: "run-interrupt-tool" });
    const initial = { ...created, state: { ...created.state, run: { ...created.state.run, status: "running" as const, exposedToolIds: ["write_probe"] } } };
    await store.save(initial);
    const entered = deferred();
    let calls = 0;
    let toolCalls = 0;
    const executor: StepExecutor = {
        async decide({ goal }) {
            calls += 1;
            if (calls === 2) {
                assert.equal(goal.state.run.interruption?.status, "repairing");
                assert.match(goal.state.messages.at(-1)?.content ?? "", /effect is unknown/i);
            }
            return { kind: "decision", decision: { kind: "tool_call", action: { actionId: `action-write-${calls}`, toolId: "write_probe", input: { value: "x" } } } };
        },
        async think() { throw new Error("unexpected Think call"); },
        async reviewCompletion() { return { kind: "accept" }; },
    };
    const tool: Tool = {
        definition: { id: "write_probe", description: "May write externally", inputContract: contract.record(contract.string()), isReadOnly: false },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute(_request, control) {
            toolCalls += 1;
            entered.resolve();
            return new Promise((_, reject) => control?.signal?.addEventListener("abort", () => reject(new ExecutionAbortedError()), { once: true }));
        },
    };
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor,
        toolRegistry: { get: (toolId) => toolId === "write_probe" ? createToolRegistration(tool) : undefined },
    });
    const execution = runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    await entered.promise;
    const accepted = await runner.interrupt({ goalId: initial.id, runId: initial.state.run.id }, "interrupt-write");
    assert.equal(accepted.ok, true);
    const result = await execution;
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.equal(toolCalls, 1);

    const latest = await store.restore(initial.id);
    assert.equal(latest?.state.run.status, "cancelled");
    assert.equal(latest?.state.run.interruption?.outcomeUnknown, true);
    assert.equal(latest?.state.run.interruption?.repairCallsStarted, 1);
    const unknown = trajectory.events.find((event) => event.eventType === "observation_recorded" && event.payload.actionId === "action-write-1");
    assert.equal(unknown?.eventType, "observation_recorded", JSON.stringify(trajectory.events.map((event) => [event.eventType, event.actionId])));
    if (unknown?.eventType === "observation_recorded") {
        assert.equal(unknown.payload.observation.kind, "failure");
        if (unknown.payload.observation.kind === "failure") {
            assert.equal(unknown.payload.observation.code, "TOOL_INTERRUPTED_OUTCOME_UNKNOWN");
            assert.equal(unknown.payload.observation.retryable, false);
        }
    }
    assert.equal(trajectory.events.some((event) => event.eventType === "tool_finished" && event.actionId === "action-write-1"), false);
});

test("recovered Interrupt with an exhausted repair budget cancels without another model call", async () => {
    const store = new InMemoryGoalStore();
    const created = createGoal({ ...currentProtocols, promptBundleVersion: 1, id: "goal-interrupt-budget", intent: "repair budget", profile, runId: "run-interrupt-budget" });
    const initial = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                status: "running" as const,
                interruption: { requestId: "interrupt-budget", status: "repairing" as const, repairCallsStarted: 3, interruptedActions: [{ actionId: "action-1", toolId: "probe", input: {} }], outcomeUnknown: true },
            },
        },
    };
    await store.save(initial);
    let calls = 0;
    const runner = new Runner({ store, executor: {
        async decide() { calls += 1; return { kind: "decision", decision: { kind: "fail", error: "should not run" } }; },
        async think() { throw new Error("unexpected Think call"); },
        async reviewCompletion() { return { kind: "accept" }; },
    } });
    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(calls, 0);
    const latest = await store.restore(initial.id);
    assert.equal(latest?.state.run.status, "cancelled");
    assert.equal(latest?.state.run.interruption?.repairCallsStarted, 3);
});
