import { after as afterAllTests } from "node:test";
import { mkdtemp as createBoundaryWorkspace, rm as removeBoundaryWorkspace } from "node:fs/promises";
import { tmpdir as boundaryTmpdir } from "node:os";
import { join as joinBoundaryPath } from "node:path";

const boundaryWorkspaceRoot = await createBoundaryWorkspace(joinBoundaryPath(boundaryTmpdir(), "lazygoal-permission-boundary-"));
afterAllTests(async () => { await removeBoundaryWorkspace(boundaryWorkspaceRoot, { recursive: true, force: true }); });
import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryGoalStore } from "../../storage/src/index";
import { createToolRegistration, InMemoryToolRegistry } from "../../tool-core/src/index";
import { createGoal, createInitialRunStage, Runner, type StepExecutor } from "../src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";
import { createTestBinding, objectInputSchema, openObjectSchema, sandboxCommandSchema } from "../../tool-core/test/binding-fixtures";
import { createTestToolRegistration } from "../../tool-core/test/helpers";

test("Plan pre-approval investigation uses Tool policy before any executing stage is declared", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({ ...currentProtocols, id: "pre-approval-stage", runId: "run-1", intent: "Investigate before proposing a task", promptBundleVersion: 1,
        profile: { id: "test", systemPrompt: "Investigate", instructions: [], toolIds: ["inspect", "write"] } });
    await store.save({ ...initial, state: { ...initial.state, run: { ...initial.state.run, mode: "plan", exposedToolIds: ["inspect", "write"] } } });
    let readExecutions = 0;
    let writeExecutions = 0;
    const registry = new InMemoryToolRegistry([createTestToolRegistration({
        definition: { id: "inspect", description: "Inspect the workspace", isReadOnly: true, inputBinding: createTestBinding("test.fixture", objectInputSchema())}, replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute() { readExecutions += 1; return { kind: "success", output: "Inspected", summary: "Inspected" }; },
    }), createTestToolRegistration({
        definition: { id: "write", description: "Change the workspace", isReadOnly: false, inputBinding: createTestBinding("test.fixture", objectInputSchema())}, replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute() { writeExecutions += 1; return { kind: "success", output: "Changed", summary: "Changed" }; },
    })]);
    const executor: StepExecutor = {
        async decide({ goal, runtimeFeedback, authorizedTools }) {
            assert.equal(runtimeFeedback, undefined);
            assert.equal(goal.state.run.currentStage, undefined);
            assert.deepEqual(authorizedTools.map(({ id }) => id), ["inspect"]);
            return { kind: "decision", decision: goal.state.run.stepCount === 0
                ? { kind: "tool_call", action: { actionId: "inspect-1", toolId: "inspect", input: {} } }
                : { kind: "task_proposal", planRoute: { stages: [{ target: "Complete the proposed task", acceptanceCriteria: ["The task outcome is verified"] }] }, task: { objective: "Apply the inspected change", completionCriteria: [] }, approvalRequest: "Approve the task?" } };
        },
        async think() { throw new Error("Unexpected think"); },
        async reviewCompletion() { throw new Error("Task proposal is not completion"); },
    };
    const runner = new Runner({ workspaceRoot: boundaryWorkspaceRoot, store, trajectoryStore: trajectory, executor, toolRegistry: registry, toolPolicy: { evaluate: () => "allow" } });
    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.run.status, "waiting");
    assert.equal(saved?.state.run.pendingInteraction?.kind, "task_approval");
    assert.equal(saved?.state.run.currentStage, undefined);
    assert.equal(readExecutions, 1);
    assert.equal(writeExecutions, 0);
    assert.equal(trajectory.events.filter(event => event.eventType === "observation_recorded").length, 1);
});

test("Plan pre-approval Runtime rejects a forged write Tool call before any side effect", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({ ...currentProtocols, id: "pre-approval-forged-write", runId: "run-1", intent: "Investigate before proposing a task", promptBundleVersion: 1,
        profile: { id: "test", systemPrompt: "Investigate", instructions: [], toolIds: ["write"] } });
    await store.save({ ...initial, state: { ...initial.state, run: { ...initial.state.run, mode: "plan", exposedToolIds: ["write"] } } });
    let writes = 0;
    const registry = new InMemoryToolRegistry([createTestToolRegistration({
        definition: { id: "write", description: "Change the workspace", isReadOnly: false, inputBinding: createTestBinding("test.fixture", objectInputSchema())}, replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute() { writes += 1; return { kind: "success", output: "Changed", summary: "Changed" }; },
    })]);
    let decideCalls = 0;
    const executor: StepExecutor = {
        async decide({ runtimeFeedback }) {
            decideCalls += 1;
            if (runtimeFeedback !== undefined) {
                assert.equal(runtimeFeedback.issues[0]?.code, "TOOL_NOT_AUTHORIZED");
                return { kind: "decision", decision: { kind: "task_proposal", planRoute: { stages: [{ target: "Complete the proposed task", acceptanceCriteria: ["The task outcome is verified"] }] }, task: { objective: "Apply the inspected change", completionCriteria: [] }, approvalRequest: "Approve the task?" } };
            }
            return { kind: "decision", decision: { kind: "tool_call", action: { actionId: "forged-write-1", toolId: "write", input: {} } } };
        },
        async think() { throw new Error("Unexpected think"); },
        async reviewCompletion() { throw new Error("Task proposal is not completion"); },
    };
    const runner = new Runner({ workspaceRoot: boundaryWorkspaceRoot, store, trajectoryStore: trajectory, executor, toolRegistry: registry, toolPolicy: { evaluate: () => "allow" } });
    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(decideCalls, 2);
    assert.equal(writes, 0);
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.run.status, "waiting");
    assert.equal(saved?.state.run.pendingInteraction?.kind, "task_approval");
    assert.equal(trajectory.events.some(event => event.eventType === "observation_recorded"), false);
});

test("Normal Run keeps its existing write Tool access behind the current RunStage", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({ ...currentProtocols, id: "normal-write-stage", runId: "run-1", intent: "Change the workspace", promptBundleVersion: 1,
        profile: { id: "test", systemPrompt: "Make the change", instructions: [], toolIds: ["write"] } });
    await store.save({
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                exposedToolIds: ["write"],
                currentStage: createInitialRunStage({ target: "Apply the requested change", acceptanceCriteria: ["Write succeeds"] }, 1),
            },
        },
    });
    let writes = 0;
    const registry = new InMemoryToolRegistry([createTestToolRegistration({
        definition: { id: "write", description: "Change the workspace", isReadOnly: false, inputBinding: createTestBinding("test.fixture", objectInputSchema())}, replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute() { writes += 1; return { kind: "success", output: "Changed", summary: "Changed" }; },
    })]);
    let decideCalls = 0;
    const executor: StepExecutor = {
        async decide() {
            decideCalls += 1;
            return { kind: "decision", decision: decideCalls === 1
                ? { kind: "tool_call", action: { actionId: "normal-write-1", toolId: "write", input: {} } }
                : { kind: "wait", reason: "Wait for the next request" } };
        },
        async think() { throw new Error("Unexpected think"); },
        async reviewCompletion() { throw new Error("Run is waiting, not completing"); },
    };
    const runner = new Runner({ workspaceRoot: boundaryWorkspaceRoot, store, trajectoryStore: trajectory, executor, toolRegistry: registry, toolPolicy: { evaluate: () => "allow" } });
    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(writes, 1);
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.run.status, "waiting");
    assert.equal(saved?.state.run.mode, "normal");
});
