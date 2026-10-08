import assert from "node:assert/strict";
import { test } from "node:test";

import { createGoal, Runner, type AgentProfile, type StepExecutor } from "../src/index";
import { contract } from "../../contracts/src/index";
import { createToolRegistration, type Tool } from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "steer-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: [],
};

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

test("Steer is durably accepted during a model call and applied once in order on the same Run", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-steer",
        intent: "test steer",
        profile,
        runId: "run-steer",
        maxSteps: 3,
    });
    await store.save(initial);

    const entered = deferred();
    const release = deferred();
    const sampledMessages: string[][] = [];
    let calls = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide({ goal }) {
            calls += 1;
            sampledMessages.push(goal.state.messages.map((message) => message.content));
            if (calls === 1) {
                entered.resolve();
                await release.promise;
            }
            return { kind: "decision", decision: { kind: "fail", error: "test terminal" }, modelContextFrame: { stage: "decide", epochNumber: goal.state.run.contextEpoch.number, conversationPosition: goal.state.messages.length, sections: [] } };
        },
        async think() { throw new Error("unexpected Think call"); },
    };
    const runner = new Runner({ store, trajectoryStore: trajectory, executor });
    const execution = runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    await entered.promise;

    const first = await runner.steer({ goalId: initial.id, runId: initial.state.run.id }, "steer-1", "first steer");
    const second = await runner.steer({ goalId: initial.id, runId: initial.state.run.id }, "steer-2", "second steer");
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.existing, false);
    assert.equal(second.existing, false);
    release.resolve();

    const result = await execution;
    assert.equal(result.ok, true);
    assert.equal(calls, 2, JSON.stringify({ result, snapshot: await store.restore(initial.id), sampledMessages }));
    assert.deepEqual(sampledMessages[1], ["test steer", "first steer", "second steer"]);

    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.equal(saved.state.run.id, initial.state.run.id);
    assert.deepEqual(saved.state.messages.map((message) => message.content), ["test steer", "first steer", "second steer", "test terminal"]);
    assert.deepEqual(saved.state.run.steerInputs, [
        { messageId: "steer-1", status: "applied", messageIndex: 1 },
        { messageId: "steer-2", status: "applied", messageIndex: 2 },
    ]);
    assert.deepEqual(trajectory.events.filter((event) => event.eventType.startsWith("steer_input_")).map((event) => event.eventType), [
        "steer_input_received", "steer_input_received", "steer_input_applied", "steer_input_applied",
    ]);

    assert.deepEqual(await runner.steer({ goalId: initial.id, runId: initial.state.run.id }, "steer-1", "first steer"), {
        ok: true, goalId: initial.id, runId: initial.state.run.id, messageId: "steer-1", existing: true,
    });
    assert.deepEqual(await runner.steer({ goalId: initial.id, runId: initial.state.run.id }, "steer-1", "different text"), {
        ok: false, error: "STEER_CONFLICT",
    });
});


test("Steer received during a Tool waits for its committed Observation before entering model history", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const toolProfile: AgentProfile = { ...profile, toolIds: ["probe"] };
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-steer-tool",
        intent: "test tool steer",
        profile: toolProfile,
        runId: "run-steer-tool",
        maxSteps: 3,
    });
    const prepared = { ...initial, state: { ...initial.state, run: { ...initial.state.run, exposedToolIds: ["probe"] } } };
    await store.save(prepared);
    const entered = deferred();
    const release = deferred();
    const tool: Tool = {
        definition: {
            id: "probe",
            description: "Test tool",
            inputContract: contract.record(contract.string()),
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            entered.resolve();
            await release.promise;
            return { kind: "success", output: "effect confirmed", summary: "tool done" };
        },
    };
    const sampledMessages: string[][] = [];
    let calls = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide({ goal }) {
            calls += 1;
            sampledMessages.push(goal.state.messages.map((message) => message.content));
            return calls === 1
                ? { kind: "decision", decision: { kind: "tool_call", action: { actionId: "action-1", toolId: "probe", input: {} } } }
                : { kind: "decision", decision: { kind: "fail", error: "test terminal" } };
        },
        async think() { throw new Error("unexpected Think call"); },
    };
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor,
        toolRegistry: { get: () => createToolRegistration(tool) },
    });
    const execution = runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    await entered.promise;
    const accepted = await runner.steer({ goalId: initial.id, runId: initial.state.run.id }, "during-tool", "tool 完成后应用");
    assert.equal(accepted.ok, true);
    release.resolve();

    const result = await execution;
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.deepEqual(sampledMessages[1], ["test tool steer", "tool 完成后应用"]);
    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.ok(saved.state.messages.some((message) => message.content === "tool 完成后应用"));
    assert.equal(saved.state.run.stepCount, 2);
});

test("accepted Steer survives an execution restart and is injected once", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-steer-restart",
        intent: "test steer recovery",
        profile,
        runId: "run-steer-restart",
        maxSteps: 3,
    });
    await store.save(initial);
    const entered = deferred();
    const release = deferred();
    const firstRunner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor: {
            async reviewCompletion() { return { kind: "accept" }; },
            async decide() {
                entered.resolve();
                await release.promise;
                return { kind: "decision", decision: { kind: "fail", error: "obsolete response" } };
            },
            async think() { throw new Error("unexpected Think call"); },
        },
    });
    const controller = new AbortController();
    const execution = firstRunner.runUntilBlocked(
        { goalId: initial.id, runId: initial.state.run.id },
        {},
        { signal: controller.signal },
    );
    await entered.promise;
    assert.equal((await firstRunner.steer({ goalId: initial.id, runId: initial.state.run.id }, "survives-restart", "恢复后输入")).ok, true);
    controller.abort();
    release.resolve();
    await assert.rejects(execution);

    let recoveredMessages: string[] = [];
    const resumedRunner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor: {
            async reviewCompletion() { return { kind: "accept" }; },
            async decide({ goal }) {
                recoveredMessages = goal.state.messages.map((message) => message.content);
                return { kind: "decision", decision: { kind: "fail", error: "recovered response" } };
            },
            async think() { throw new Error("unexpected Think call"); },
        },
    });
    const resumed = await resumedRunner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(resumed.ok, true);
    assert.deepEqual(recoveredMessages, ["test steer recovery", "恢复后输入"]);
    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.deepEqual(saved.state.run.steerInputs, [
        { messageId: "survives-restart", status: "applied", messageIndex: 1 },
    ]);
});
