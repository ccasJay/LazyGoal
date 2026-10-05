import assert from "node:assert/strict";
import { test } from "node:test";
import { contract } from "../../contracts/src/index";
import { isSeatbeltSupported } from "../../sandbox/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { createExecuteProgramRegistration } from "../../tools/src/index";
import { TrajectoryExecutionUnitAdapter } from "../../agent/src/index";
import { buildCommittedContextDocuments } from "../../context-retrieval/src/index";
import {
    createGoal,
    createToolRegistration,
    ExecutionAbortedError,
    GoalCoordinator,
    InMemoryToolRegistry,
    InlineScheduler,
    Runner,
    type StepExecutor,
} from "../src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";

test("PTC executes a program and inner tool without an extra model step", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const created = createGoal({
        ...currentProtocols,
        id: "ptc-goal",
        runId: "ptc-run",
        intent: "Count content",
        promptBundleVersion: 1,
        profile: {
            id: "ptc-test",
            systemPrompt: "Test",
            instructions: [],
            toolIds: ["execute_program", "read_file"],
        },
        maxSteps: 3,
    });
    const goal = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                mode: "plan" as const,
                approvedTask: { objective: "Count content", completionCriteria: [] },
                exposedToolIds: ["execute_program", "read_file"],
            },
        },
    };
    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    await store.save(goal);
    let modelCalls = 0;
    const decisions = [
        {
            kind: "tool_call" as const,
            action: {
                actionId: "parent-1",
                toolId: "execute_program",
                input: {
                    code: "const result = await tools.read_file({path:'README.md'}); return {length:result.observation.output.length, references:result.sourceReferences};",
                },
            },
        },
        { kind: "complete" as const, summary: "Done", completionEvidence: [] },
    ];
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" as const }; },
        async execute() { return decisions[modelCalls++]!; },
        async decide() { return { kind: "decision", decision: decisions[modelCalls++]! }; },
        async think() { throw new Error("Unexpected Think"); },
    };
    let readCalls = 0;
    const ReadInput = contract.object({ path: contract.string() });
    const registry = new InMemoryToolRegistry([
        createExecuteProgramRegistration(),
        createToolRegistration({
            definition: {
                id: "read_file",
                description: "Read test content",
                inputContract: ReadInput,
                isReadOnly: true,
            },
            replayPolicy: "safe",
            validate: () => ({ ok: true }),
            async execute() {
                readCalls += 1;
                return { kind: "success", output: "abc", summary: "Read" };
            },
        }),
    ]);
    const runner = new Runner({ store, trajectoryStore, executor, toolRegistry: registry });
    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed");
    assert.equal(result.state.stepCount, 2);
    assert.equal(modelCalls, 2);
    assert.equal(readCalls, 1);
    const events = await trajectoryStore.read({ goalId: goal.id, runId: goal.state.run.id });
    const units = new TrajectoryExecutionUnitAdapter().adapt(events, {
        committedThroughSequence: result.state.committedThroughSequence,
        goalId: goal.id,
        runId: goal.state.run.id,
    });
    assert.equal(units.some((unit) => unit.events.some((event) => event.programId !== undefined)), false);
    const documents = buildCommittedContextDocuments({
        goalId: goal.id,
        runId: goal.state.run.id,
        committedThroughSequence: result.state.committedThroughSequence,
        events,
    });
    const childIds = new Set(events.filter((event) => event.programId !== undefined)
        .map((event) => event.eventId));
    assert.equal(documents.some((document) => document.sourceEventIds.some((id) => childIds.has(id))), false);
    const parent = events.find((event) =>
        event.eventType === "observation_recorded" && event.actionId === "parent-1");
    assert.equal(parent?.eventType, "observation_recorded");
    if (parent?.eventType === "observation_recorded") {
        assert.equal(parent.payload.observation.kind, "success");
        if (parent.payload.observation.kind === "success") {
            assert.deepEqual(parent.payload.observation.output, {
                length: 3,
                references: [events.find((event) =>
                    event.eventType === "observation_recorded"
                    && event.programId !== undefined)?.sequence],
            });
        }
    }
});

test("PTC rejects a child Tool outside the exposed set before preparation or execution", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const created = createGoal({
        ...currentProtocols,
        id: "ptc-hidden-child-goal",
        runId: "ptc-hidden-child-run",
        intent: "Read one file",
        promptBundleVersion: 1,
        profile: {
            id: "ptc-hidden-child",
            systemPrompt: "Test",
            instructions: [],
            toolIds: ["execute_program", "read_file"],
        },
        maxSteps: 2,
    });
    const goal = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                mode: "plan" as const,
                approvedTask: { objective: "Read one file", completionCriteria: [] },
                exposedToolIds: ["execute_program"],
            },
        },
    };
    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    await store.save(goal);
    const hiddenDecision = { kind: "tool_call" as const, action: {
                actionId: "hidden-child-parent",
                toolId: "execute_program",
                input: { code: "await tools.read_file({path:'README.md'}); return 'done';" },
            } };
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" as const }; },
        async execute() { return hiddenDecision; },
        async decide() { return { kind: "decision", decision: hiddenDecision }; },
        async think() { throw new Error("Unexpected Think"); },
    };
    let prepareCalls = 0;
    let readCalls = 0;
    const registry = new InMemoryToolRegistry([
        createExecuteProgramRegistration(),
        createToolRegistration({
            definition: { id: "read_file", description: "Read", inputContract: contract.object({ path: contract.string() }), isReadOnly: true },
            replayPolicy: "safe",
            validate() { prepareCalls += 1; return { ok: true }; },
            async execute() { readCalls += 1; return { kind: "success", output: "private", summary: "Read" }; },
        }),
    ]);
    const result = await new Runner({ store, trajectoryStore, executor, toolRegistry: registry }).run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    assert.equal(prepareCalls, 0);
    assert.equal(readCalls, 0);
});

test("PTC never automatically replays an unknown write even if the tool says safe", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const created = createGoal({
        ...currentProtocols,
        id: "ptc-unknown-goal",
        runId: "ptc-unknown-run",
        intent: "Write once",
        promptBundleVersion: 1,
        profile: {
            id: "ptc-test",
            systemPrompt: "Test",
            instructions: [],
            toolIds: ["execute_program", "write_file"],
        },
        maxSteps: 3,
    });
    const goal = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                mode: "plan" as const,
                approvedTask: { objective: "Write once", completionCriteria: [] },
                exposedToolIds: ["execute_program", "write_file"],
            },
        },
    };
    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    await store.save(goal);
    let modelCalls = 0;
    const decision = {
        kind: "tool_call" as const,
        action: {
            actionId: "unknown-parent",
            toolId: "execute_program",
            input: { code: "const x = await tools.write_file({path:'a'}); return x.observation.kind;" },
        },
    };
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" as const }; },
        async execute() { modelCalls += 1; return decision; },
        async decide() { modelCalls += 1; return { kind: "decision", decision }; },
        async think() { throw new Error("Unexpected Think"); },
    };
    let writes = 0;
    const WriteInput = contract.object({ path: contract.string() });
    const registry = new InMemoryToolRegistry([
        createExecuteProgramRegistration(),
        createToolRegistration({
            definition: {
                id: "write_file",
                description: "A write falsely declared safe",
                inputContract: WriteInput,
                isReadOnly: false,
            },
            replayPolicy: "safe",
            validate: () => ({ ok: true }),
            async execute() {
                writes += 1;
                throw new ExecutionAbortedError();
            },
        }),
    ]);
    const ref = { goalId: goal.id, runId: goal.state.run.id };
    const dependencies = { store, trajectoryStore, executor, toolRegistry: registry };
    await assert.rejects(new Runner(dependencies).run(ref), ExecutionAbortedError);
    assert.equal(writes, 1);
    const pending = await store.restore(goal.id);
    assert.equal(pending?.state.run.pendingAction?.attemptsStarted, 1);
    assert.ok(pending?.state.run.pendingProgram);
    const recovered = await new Runner(dependencies).run(ref);
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;
    assert.equal(recovered.state.status, "waiting");
    assert.equal(recovered.state.pendingAction?.status, "outcome_unknown");
    assert.equal(recovered.state.stepCount, 0);
    assert.equal(writes, 1);
    assert.equal(modelCalls, 1);
});

test("PTC pauses for a real child approval and resumes the same code", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const created = createGoal({
        ...currentProtocols,
        id: "ptc-approval-goal",
        runId: "ptc-approval-run",
        intent: "Write content",
        promptBundleVersion: 1,
        profile: {
            id: "ptc-test",
            systemPrompt: "Test",
            instructions: [],
            toolIds: ["execute_program", "write_file"],
        },
        maxSteps: 3,
    });
    const goal = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                mode: "plan" as const,
                approvedTask: { objective: "Write content", completionCriteria: [] },
                exposedToolIds: ["execute_program", "write_file"],
            },
        },
    };
    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    await store.save(goal);
    let modelCalls = 0;
    const decisions = [
        {
            kind: "tool_call" as const,
            action: {
                actionId: "write-parent",
                toolId: "execute_program",
                input: {
                    code: "const result = await tools.write_file({path:'a',content:'ok'}); return {kind:result.observation.kind};",
                },
            },
        },
        { kind: "complete" as const, summary: "Done", completionEvidence: [] },
    ];
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" as const }; },
        async execute() { return decisions[modelCalls++]!; },
        async decide() { return { kind: "decision", decision: decisions[modelCalls++]! }; },
        async think() { throw new Error("Unexpected Think"); },
    };
    let writes = 0;
    const WriteInput = contract.object({ path: contract.string(), content: contract.string() });
    const registry = new InMemoryToolRegistry([
        createExecuteProgramRegistration(),
        createToolRegistration({
            definition: {
                id: "write_file",
                description: "Write test content",
                inputContract: WriteInput,
                isReadOnly: false,
            },
            replayPolicy: "manual",
            validate: () => ({ ok: true }),
            async execute() {
                writes += 1;
                return { kind: "success", output: "ok", summary: "Wrote" };
            },
        }),
    ]);
    const runner = new Runner({
        store, trajectoryStore, executor, toolRegistry: registry,
        toolPolicy: {
            evaluate: ({ action }) => action.toolId === "write_file" ? "require_approval" : "allow",
        },
    });
    const ref = { goalId: goal.id, runId: goal.state.run.id };
    const waiting = await runner.run(ref);
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;
    assert.equal(waiting.state.status, "waiting");
    assert.equal(waiting.state.stepCount, 0);
    assert.equal(writes, 0);
    const actionId = waiting.state.pendingAction?.action.actionId;
    assert.ok(actionId);
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        scheduler: new InlineScheduler(runner),
    });
    const completed = await coordinator.resume({
        ref,
        action: { kind: "approve_action", actionId },
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.goal.state.run.status, "completed");
    assert.equal(completed.goal.state.run.stepCount, 2);
    assert.equal(modelCalls, 2);
    assert.equal(writes, 1);

    modelCalls = 0;
    const rejectedGoal = {
        ...goal,
        id: "ptc-rejected-goal",
        state: {
            ...goal.state,
            run: { ...goal.state.run, id: "ptc-rejected-run" },
        },
    };
    await store.save(rejectedGoal);
    const rejectedRef = {
        goalId: rejectedGoal.id,
        runId: rejectedGoal.state.run.id,
    };
    const rejectedWaiting = await runner.run(rejectedRef);
    assert.equal(rejectedWaiting.ok, true);
    if (!rejectedWaiting.ok) return;
    const rejectedActionId = rejectedWaiting.state.pendingAction?.action.actionId;
    assert.ok(rejectedActionId);
    const rejected = await coordinator.resume({
        ref: rejectedRef,
        action: { kind: "reject_action", actionId: rejectedActionId, reason: "Denied" },
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) return;
    assert.equal(rejected.goal.state.run.status, "completed");
    assert.equal(rejected.goal.state.run.stepCount, 2);
    assert.equal(writes, 1);
    const parentObservation = (await trajectoryStore.read(rejectedRef)).find((event) =>
        event.eventType === "observation_recorded" && event.actionId === "write-parent");
    assert.equal(parentObservation?.eventType, "observation_recorded");
    if (parentObservation?.eventType === "observation_recorded"
        && parentObservation.payload.observation.kind === "success") {
        assert.deepEqual(parentObservation.payload.observation.output, { kind: "rejected" });
    }

    modelCalls = 0;
    const entryGoal = {
        ...goal,
        id: "ptc-entry-approval-goal",
        state: {
            ...goal.state,
            run: { ...goal.state.run, id: "ptc-entry-approval-run" },
        },
    };
    await store.save(entryGoal);
    const entryRef = { goalId: entryGoal.id, runId: entryGoal.state.run.id };
    const entryRunner = new Runner({
        store, trajectoryStore, executor, toolRegistry: registry,
        toolPolicy: {
            evaluate: ({ action }) => action.toolId === "execute_program" ? "require_approval" : "allow",
        },
    });
    const entryWaiting = await entryRunner.run(entryRef);
    assert.equal(entryWaiting.ok, true);
    if (!entryWaiting.ok) return;
    assert.equal(entryWaiting.state.pendingAction?.action.toolId, "execute_program");
    assert.equal(writes, 1);
    const entryCoordinator = new GoalCoordinator({
        store, trajectoryStore, scheduler: new InlineScheduler(entryRunner),
    });
    const entryCompleted = await entryCoordinator.resume({
        ref: entryRef,
        action: { kind: "approve_action", actionId: entryWaiting.state.pendingAction!.action.actionId },
    });
    assert.equal(entryCompleted.ok, true);
    if (!entryCompleted.ok) return;
    assert.equal(entryCompleted.goal.state.run.status, "completed");
    assert.equal(writes, 2);
});
