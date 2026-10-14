import assert from "node:assert/strict";
import { test } from "node:test";
import { contract } from "../../contracts/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { createToolRegistration, InMemoryToolRegistry } from "../../tool-core/src/index";
import { createGoal, Runner, type StepExecutor } from "../src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

test("Plan pre-approval investigation uses Tool policy before any executing stage is declared", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({ ...currentProtocols, id: "pre-approval-stage", runId: "run-1", intent: "Investigate before proposing a task", promptBundleVersion: 1,
        profile: { id: "test", systemPrompt: "Investigate", instructions: [], toolIds: ["inspect"] } });
    await store.save({ ...initial, state: { ...initial.state, run: { ...initial.state.run, mode: "plan", exposedToolIds: ["inspect"] } } });
    let executions = 0;
    const registry = new InMemoryToolRegistry([createToolRegistration({
        definition: { id: "inspect", description: "Inspect the workspace", isReadOnly: true, inputContract: contract.object({}) }, replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute() { executions += 1; return { kind: "success", output: "Inspected", summary: "Inspected" }; },
    })]);
    const executor: StepExecutor = {
        async decide({ goal, runtimeFeedback }) {
            assert.equal(runtimeFeedback, undefined);
            assert.equal(goal.state.run.currentStage, undefined);
            return { kind: "decision", decision: goal.state.run.stepCount === 0
                ? { kind: "tool_call", action: { actionId: "inspect-1", toolId: "inspect", input: {} } }
                : { kind: "task_proposal", task: { objective: "Apply the inspected change", completionCriteria: [] }, approvalRequest: "Approve the task?" } };
        },
        async think() { throw new Error("Unexpected think"); },
        async reviewCompletion() { throw new Error("Task proposal is not completion"); },
    };
    const runner = new Runner({ store, trajectoryStore: trajectory, executor, toolRegistry: registry, toolPolicy: { evaluate: () => "allow" } });
    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.run.status, "waiting");
    assert.equal(saved?.state.run.pendingInteraction?.kind, "task_approval");
    assert.equal(saved?.state.run.currentStage, undefined);
    assert.equal(executions, 1);
    assert.equal(trajectory.events.filter(event => event.eventType === "observation_recorded").length, 1);
});
