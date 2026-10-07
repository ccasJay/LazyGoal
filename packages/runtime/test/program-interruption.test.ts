import { ExecutionAbortedError } from "../../execution-control/src/index";
import assert from "node:assert/strict";
import { test } from "node:test";
import { contract } from "../../contracts/src/index";
import { isSeatbeltSupported } from "../../sandbox/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { createExecuteProgramRegistration } from "../../tools/src/index";
import {
    createGoal,
    createToolRegistration,
    GoalCoordinator,
    InMemoryToolRegistry,
    InlineScheduler,
    Runner,
    type StepExecutor,
} from "../src/index";
import { currentProtocols, InMemoryTrajectoryStore, withDiscoveredProfileTools } from "./current-fixtures";

function setup(code: string, tool?: ReturnType<typeof createToolRegistration>, completeAfterFirst = false) {
    const created = withDiscoveredProfileTools(createGoal({
        ...currentProtocols,
        id: `program-interruption-${Math.random()}`,
        runId: "run",
        intent: "Run program",
        promptBundleVersion: 1,
        profile: {
            id: "program-interruption",
            systemPrompt: "Test",
            instructions: [],
            toolIds: ["execute_program", ...(tool === undefined ? [] : [tool.definition.id])],
        },
        maxSteps: 3,
    }));
    const goal = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                mode: "plan" as const,
                approvedTask: { objective: "Run program", completionCriteria: [] },
            },
        },
    };
    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    const registry = new InMemoryToolRegistry([
        createExecuteProgramRegistration(),
        ...(tool === undefined ? [] : [tool]),
    ]);
    let modelCalls = 0;
    const decision = () => completeAfterFirst && modelCalls++ > 0
        ? { kind: "complete" as const, summary: "Done", completionEvidence: [] }
        : { kind: "tool_call" as const, action: { actionId: "parent", toolId: "execute_program", input: { code } } };
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" as const }; },
        async execute() { return decision(); },
        async decide() { return { kind: "decision", decision: decision() }; },
        async think() { throw new Error("Unexpected Think"); },
    };
    return { goal, store, trajectoryStore, registry, executor };
}

test("PTC reports a stable failure without exposing a program exception", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const fixture = setup("throw new Error('private intermediate content');");
    await fixture.store.save(fixture.goal);
    const result = await new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: fixture.executor,
        toolRegistry: fixture.registry,
    }).run({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.lastStep?.kind, "action");
    if (result.state.lastStep?.kind !== "action") return;
    assert.equal(result.state.lastStep.observation.kind, "failure");
    if (result.state.lastStep.observation.kind !== "failure") return;
    assert.equal(result.state.lastStep.observation.code, "PTC_EXECUTION_ERROR");
    assert.equal(result.state.lastStep.observation.message, "Program execution failed.");
    assert.equal(JSON.stringify(result.state.lastStep.observation).includes("private intermediate content"), false);
});

test("PTC reports the rejected child Tool input field", {
    skip: !isSeatbeltSupported(),
}, async () => {
    let readCalls = 0;
    const read = createToolRegistration({
        definition: {
            id: "read_file",
            description: "Read test content",
            inputContract: contract.object({
                path: contract.string(),
                cursor: contract.optional(contract.string()),
            }),
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            readCalls += 1;
            return { kind: "success", output: "content", summary: "Read" };
        },
    });
    const fixture = setup("await tools.read_file({path:'README.md',cursor:null}); return 'done';", read, true);
    await fixture.store.save(fixture.goal);
    const result = await new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: fixture.executor,
        toolRegistry: fixture.registry,
    }).run({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(readCalls, 0);
    const events = await fixture.trajectoryStore.read({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id });
    const parent = events.find((event) =>
        event.eventType === "tool_finished" && event.payload.toolId === "execute_program");
    assert.equal(parent?.eventType, "tool_finished");
    if (parent?.eventType !== "tool_finished") return;
    assert.equal(parent.payload.observation.kind, "failure");
    if (parent.payload.observation.kind !== "failure") return;
    assert.equal(parent.payload.observation.code, "INVALID_TOOL_INPUT");
    assert.equal(parent.payload.observation.message, "Invalid input for read_file at $.cursor: Expected a string");
});

test("PTC stops before a 129th tool call", {
    skip: !isSeatbeltSupported(),
}, async () => {
    let calls = 0;
    const read = createToolRegistration({
        definition: {
            id: "count_read",
            description: "Count reads",
            inputContract: contract.object({}),
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            calls += 1;
            return { kind: "success", output: 1, summary: "Read" };
        },
    });
    const fixture = setup("for (let i = 0; i < 129; i++) await tools.count_read({}); return 1;", read);
    await fixture.store.save(fixture.goal);
    const result = await new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: fixture.executor,
        toolRegistry: fixture.registry,
    }).run({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(calls, 128);
    assert.equal(result.state.lastStep?.kind, "action");
    if (result.state.lastStep?.kind !== "action") return;
    assert.equal(result.state.lastStep.observation.kind, "failure");
    if (result.state.lastStep.observation.kind === "failure") {
        assert.equal(result.state.lastStep.observation.code, "PTC_CALL_LIMIT");
    }
});

test("PTC refuses nested programs and system tools", {
    skip: !isSeatbeltSupported(),
}, async () => {
    for (const code of [
        "await tools.execute_program({code:'return 1'}); return 2;",
        "await tools.system_lookup({}); return 2;",
    ]) {
        const fixture = setup(code);
        await fixture.store.save(fixture.goal);
        const result = await new Runner({
            store: fixture.store,
            trajectoryStore: fixture.trajectoryStore,
            executor: fixture.executor,
            toolRegistry: fixture.registry,
        }).run({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id });
        assert.equal(result.ok, true);
        if (!result.ok) continue;
        assert.equal(result.state.lastStep?.kind, "action");
        if (result.state.lastStep?.kind === "action") {
            assert.equal(result.state.lastStep.observation.kind, "failure");
            if (result.state.lastStep.observation.kind === "failure") {
                assert.equal(result.state.lastStep.observation.code, "PTC_INVALID_TOOL_CALL");
            }
        }
        assert.equal((await fixture.trajectoryStore.read({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id }))
            .some((event) => event.programId !== undefined), false);
    }
});

test("PTC rejects an oversized read result without committing a partial observation", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const read = createToolRegistration({
        definition: {
            id: "large_read",
            description: "Return a large value",
            inputContract: contract.object({}),
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            return { kind: "success", output: "x".repeat(16 * 1024 * 1024), summary: "Read" };
        },
    });
    const fixture = setup("await tools.large_read({}); return 1;", read);
    await fixture.store.save(fixture.goal);
    const ref = { goalId: fixture.goal.id, runId: fixture.goal.state.run.id };
    const result = await new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: fixture.executor,
        toolRegistry: fixture.registry,
    }).run(ref);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.stepCount, 1);
    assert.equal(result.state.lastStep?.kind, "action");
    if (result.state.lastStep?.kind === "action") {
        assert.equal(result.state.lastStep.observation.kind, "failure");
        if (result.state.lastStep.observation.kind === "failure") {
            assert.equal(result.state.lastStep.observation.code, "PTC_FRAME_LIMIT");
        }
    }
    const events = await fixture.trajectoryStore.read(ref);
    assert.equal(events.some((event) => event.eventType === "observation_recorded"
        && event.programId !== undefined), false);
});

test("PTC preserves an unknown write before settling a resource stop", {
    skip: !isSeatbeltSupported(),
}, async () => {
    let writes = 0;
    const write = createToolRegistration({
        definition: {
            id: "large_write",
            description: "Write and return a large value",
            inputContract: contract.object({}),
            isReadOnly: false,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            writes += 1;
            return { kind: "success", output: "x".repeat(16 * 1024 * 1024), summary: "Wrote" };
        },
    });
    const fixture = setup("await tools.large_write({}); return 1;", write, true);
    await fixture.store.save(fixture.goal);
    const runner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: fixture.executor,
        toolRegistry: fixture.registry,
    });
    const ref = { goalId: fixture.goal.id, runId: fixture.goal.state.run.id };
    const waiting = await runner.run(ref);
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;
    assert.equal(waiting.state.status, "waiting");
    assert.equal(waiting.state.pendingAction?.status, "outcome_unknown");
    assert.equal(waiting.state.pendingProgram?.pendingStop?.code, "PTC_FRAME_LIMIT");
    assert.equal(writes, 1);
    const actionId = waiting.state.pendingAction?.action.actionId;
    assert.ok(actionId);
    const coordinator = new GoalCoordinator({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        scheduler: new InlineScheduler(runner),
    });
    const resumed = await coordinator.resume({
        ref,
        action: { kind: "reject_action", actionId, reason: "Do not retry" },
    });
    assert.equal(resumed.ok, true);
    if (!resumed.ok) return;
    assert.equal(resumed.goal.state.run.status, "completed");
    assert.equal(writes, 1);
    const parent = (await fixture.trajectoryStore.read(ref)).find((event) =>
        event.eventType === "observation_recorded" && event.actionId === "parent");
    assert.equal(parent?.eventType, "observation_recorded");
    if (parent?.eventType === "observation_recorded") {
        assert.equal(parent.payload.observation.kind, "failure");
        if (parent.payload.observation.kind === "failure") {
            assert.equal(parent.payload.observation.code, "PTC_FRAME_LIMIT");
        }
    }
});

test("PTC shutdown leaves a resumable program without a fabricated failure", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const fixture = setup("while (true) {};");
    await fixture.store.save(fixture.goal);
    const controller = new AbortController();
    setTimeout(() => controller.abort("shutdown"), 100);
    const runner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: fixture.executor,
        toolRegistry: fixture.registry,
    });
    await assert.rejects(runner.run({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id },
        { signal: controller.signal }), ExecutionAbortedError);
    const saved = await fixture.store.restore(fixture.goal.id);
    assert.ok(saved?.state.run.pendingProgram);
    assert.equal(saved?.state.run.stepCount, 0);
});

test("PTC user cancellation settles one parent failure", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const fixture = setup("while (true) {};");
    await fixture.store.save(fixture.goal);
    const controller = new AbortController();
    setTimeout(() => controller.abort("user_cancel_program"), 100);
    const result = await new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: fixture.executor,
        toolRegistry: fixture.registry,
    }).run({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id },
        { signal: controller.signal });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.pendingProgram, undefined);
    assert.equal(result.state.stepCount, 1);
    assert.equal(result.state.lastStep?.kind, "action");
    if (result.state.lastStep?.kind === "action") {
        assert.equal(result.state.lastStep.observation.kind, "failure");
        if (result.state.lastStep.observation.kind === "failure") {
            assert.equal(result.state.lastStep.observation.code, "PTC_CANCELLED");
        }
    }
});

test("PTC recovery does not reset durably reserved active time", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const fixture = setup("while (true) {}", undefined, true);
    await fixture.store.save(fixture.goal);
    const ref = { goalId: fixture.goal.id, runId: fixture.goal.state.run.id };
    const controller = new AbortController();
    setTimeout(() => controller.abort("shutdown"), 100);
    const runner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: fixture.executor,
        toolRegistry: fixture.registry,
    });
    await assert.rejects(runner.run(ref, { signal: controller.signal }), ExecutionAbortedError);
    const saved = await fixture.store.restore(fixture.goal.id);
    const program = saved?.state.run.pendingProgram;
    assert.ok(program);
    const reservations = (await fixture.trajectoryStore.read(ref)).filter((event) =>
        event.eventType === "program_time_reserved" && event.payload.programId === program.programId);
    assert.ok(reservations.length >= 1);
    for (let index = reservations.length; index < 120; index += 1) {
        await fixture.trajectoryStore.append({
            ...ref,
            phase: "executing",
            executionUnitId: program.executionUnitId,
            actionId: program.action.actionId,
            eventType: "program_time_reserved",
            payload: {
                type: "program_time_reserved",
                programId: program.programId,
                sliceIndex: index,
                milliseconds: 1000,
            },
        });
    }
    const result = await runner.run(ref);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed");
    assert.equal(result.state.stepCount, 2);
    const parent = (await fixture.trajectoryStore.read(ref)).find((event) =>
        event.eventType === "observation_recorded" && event.actionId === "parent");
    assert.equal(parent?.eventType, "observation_recorded");
    if (parent?.eventType === "observation_recorded") {
        assert.equal(parent.payload.observation.kind, "failure");
        if (parent.payload.observation.kind === "failure") {
            assert.equal(parent.payload.observation.code, "PTC_TIME_LIMIT");
        }
    }
});

test("PTC does not start a worker when its time reservation cannot be persisted", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const fixture = setup("return 1;");
    await fixture.store.save(fixture.goal);
    const append = fixture.trajectoryStore.append.bind(fixture.trajectoryStore);
    fixture.trajectoryStore.append = async (draft) => {
        if (draft.eventType === "program_time_reserved") throw new Error("Disk unavailable");
        return append(draft);
    };
    const runner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: fixture.executor,
        toolRegistry: fixture.registry,
    });
    await assert.rejects(runner.run({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id }),
        /PTC_TIME_RESERVATION_FAILED/);
    const saved = await fixture.store.restore(fixture.goal.id);
    assert.ok(saved?.state.run.pendingProgram);
    assert.equal(saved.state.run.stepCount, 0);
});

test("PTC can be cancelled while a child approval is waiting without executing it", {
    skip: !isSeatbeltSupported(),
}, async () => {
    let writes = 0;
    const write = createToolRegistration({
        definition: {
            id: "write_file", description: "Write fixture", inputContract: contract.object({}), isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute() {
            writes += 1;
            return { kind: "success", output: "saved", summary: "Wrote" };
        },
    });
    const fixture = setup("await tools.write_file({}); return 1;", write);
    await fixture.store.save(fixture.goal);
    const runner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: fixture.executor,
        toolRegistry: fixture.registry,
        toolPolicy: { evaluate: ({ action }) => action.toolId === "write_file" ? "require_approval" : "allow" },
    });
    const ref = { goalId: fixture.goal.id, runId: fixture.goal.state.run.id };
    const waiting = await runner.run(ref);
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;
    assert.equal(waiting.state.pendingAction?.status, "awaiting_approval");
    const controller = new AbortController();
    controller.abort("user_cancel_program");
    const cancelled = await runner.run(ref, { signal: controller.signal });
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) return;
    assert.equal(cancelled.state.pendingProgram, undefined);
    assert.equal(cancelled.state.pendingAction, undefined);
    assert.equal(cancelled.state.stepCount, 1);
    assert.equal(writes, 0);
});
