import { ExecutionAbortedError } from "../../execution-control/src/index";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isSeatbeltSupported, resolveEffectiveSandboxScope } from "../../sandbox/src/index";
import { InMemoryGoalStore, JsonFileGoalStore, JsonFileTrajectoryStore } from "../../storage/src/index";
import { createExecuteProgramRegistration } from "../../tools/src/index";
import {
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    type DecideStageResult,
    type JsonValue,
    type StepExecutor,
} from "../src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
} from "../../tool-core/src/index";
import { currentProtocols, InMemoryTrajectoryStore, withDiscoveredProfileTools } from "./current-fixtures";
import { createTestBinding, objectInputSchema, openObjectSchema, sandboxCommandSchema } from "../../tool-core/test/binding-fixtures";
import { createTestToolRegistration } from "../../tool-core/test/helpers";

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

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
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
    const read = createTestToolRegistration({
        definition: {
            id: "read_file",
            description: "Read test content",
            inputBinding: createTestBinding("test.fixture", objectInputSchema({
                path: { type: "string" },
                cursor: { type: "string" },
            }, ["path"])),
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
    const read = createTestToolRegistration({
        definition: {
            id: "count_read",
            description: "Count reads",
            inputBinding: createTestBinding("test.tool", objectInputSchema()),
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
    const read = createTestToolRegistration({
        definition: {
            id: "large_read",
            description: "Return a large value",
            inputBinding: createTestBinding("test.tool", objectInputSchema()),
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
    const write = createTestToolRegistration({
        definition: {
            id: "large_write",
            description: "Write and return a large value",
            inputBinding: createTestBinding("test.tool", objectInputSchema()),
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
    const recoveryRef = waiting.state.pendingAction?.recoveryRef;
    assert.ok(recoveryRef);
    const resumed = await coordinator.resume({
        ref,
        action: { kind: "decline_unknown_action_retry", actionId, recoveryRef, reason: "Do not retry" },
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

test("PTC pendingStop re-executes a revised child Action with its approved input", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const inputs: string[] = [];
    const write = createTestToolRegistration({
        definition: {
            id: "large_write",
            description: "Write and return a large value",
            inputBinding: createTestBinding("test.tool", objectInputSchema({
                path: { type: "string" },
                content: { type: "string" },
            })),
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute(request) {
            inputs.push((request.input as { readonly path: string }).path);
            return { kind: "success", output: "x".repeat(16 * 1024 * 1024), summary: "Wrote" };
        },
    });
    const fixture = setup("await tools.large_write({path:'a.txt',content:'original'}); return 1;", write, true);
    await fixture.store.save(fixture.goal);
    const runner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: fixture.executor,
        toolRegistry: fixture.registry,
        toolPolicy: {
            evaluate: ({ tool }) => tool.id === "execute_program" ? "allow" : "require_approval",
        },
    });
    const ref = { goalId: fixture.goal.id, runId: fixture.goal.state.run.id };
    const coordinator = new GoalCoordinator({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        scheduler: new InlineScheduler(runner),
        toolRegistry: fixture.registry,
    });

    const waitingForApproval = await runner.run(ref);
    assert.equal(waitingForApproval.ok, true);
    if (!waitingForApproval.ok) return;
    assert.equal(waitingForApproval.state.pendingAction?.status, "awaiting_approval");
    const actionId = waitingForApproval.state.pendingAction?.action.actionId;
    assert.ok(actionId);
    const review = await coordinator.reviewActionApproval({
        ref,
        actionId,
        input: { path: "b.txt", content: "revised" },
    });
    assert.equal(review.ok, true, JSON.stringify(review));
    if (!review.ok) return;

    const stopped = await coordinator.resume({
        ref,
        action: {
            kind: "approve_action_revision",
            actionId,
            input: { path: "b.txt", content: "revised" },
            reviewRef: review.review.reviewRef,
        },
    });
    assert.equal(stopped.ok, true);
    if (!stopped.ok) return;
    assert.equal(stopped.kind, "waiting");
    assert.equal(stopped.goal.state.run.pendingAction?.status, "outcome_unknown");
    assert.equal(stopped.goal.state.run.pendingProgram?.pendingStop?.code, "PTC_FRAME_LIMIT");
    assert.deepEqual(inputs, ["b.txt"]);

    const recoveryRef = stopped.goal.state.run.pendingAction?.recoveryRef;
    assert.ok(recoveryRef);
    const retried = await coordinator.resume({
        ref,
        action: { kind: "retry_unknown_action", actionId, recoveryRef },
    });
    assert.equal(retried.ok, true);
    if (!retried.ok) return;
    assert.equal(retried.kind, "waiting");
    assert.equal(retried.goal.state.run.pendingProgram?.pendingStop?.code, "PTC_FRAME_LIMIT");
    assert.deepEqual(inputs, ["b.txt", "b.txt"]);
});

test("重开 JSON Snapshot 后 pendingStop 的获批 Action 准备、沙箱计划和执行都使用最终参数", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-ptc-pending-stop-reopen-"));
    try {
        await Promise.all([
            writeFile(join(workspaceRoot, "a.txt"), "original"),
            writeFile(join(workspaceRoot, "b.txt"), "revised"),
        ]);
        const store = new JsonFileGoalStore(join(workspaceRoot, "goals"));
        const trajectoryStore = new JsonFileTrajectoryStore(join(workspaceRoot, "trajectory"));
        const preparedInputs: string[] = [];
        const executedInputs: string[] = [];
        const plannedInputs: Array<{ readonly path: string; readonly extraPaths: readonly string[] }> = [];
        const largeWrite = createTestToolRegistration({
            definition: {
                id: "large_write",
                description: "Write and return a resource-limited value",
                inputBinding: createTestBinding("test.tool", openObjectSchema()),
                isReadOnly: false,
            },
            replayPolicy: "manual",
            validate(input) {
                const value = input as { readonly path: string };
                preparedInputs.push(value.path);
                return { ok: true };
            },
            async execute(request) {
                executedInputs.push((request.input as { readonly path: string }).path);
                return { kind: "success", output: "x".repeat(16 * 1024 * 1024), summary: "Wrote" };
            },
        });
        const registry = new InMemoryToolRegistry([
            createExecuteProgramRegistration(),
            largeWrite,
        ]);
        const code = [
            "await tools.large_write({path:'a.txt',sandboxAccess:{files:[{path:'a.txt',access:'write',kind:'file',purpose:'write original'}]}});",
            "return 1;",
        ].join("");
        const created = withDiscoveredProfileTools(createGoal({
            ...currentProtocols,
            id: "goal-ptc-pending-stop-reopen",
            runId: "run-ptc-pending-stop-reopen",
            intent: "Recover an approved PTC write after a resource stop",
            promptBundleVersion: 1,
            profile: {
                id: "profile-ptc-pending-stop-reopen",
                systemPrompt: "Test",
                instructions: [],
                toolIds: ["execute_program", "large_write"],
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
                    approvedTask: { objective: "Recover an approved PTC write", completionCriteria: [] },
                    exposedToolIds: ["execute_program", "large_write"],
                    currentStage: {
                        stageId: "stage-1",
                        revision: 1,
                        status: "executing" as const,
                        target: "Recover an approved PTC write",
                        acceptanceCriteria: ["The actual write parameters match approval"],
                    },
                },
            },
        };
        await store.save(goal);

        let modelCalls = 0;
        const executor: StepExecutor = {
            async reviewCompletion() { return { kind: "accept" as const }; },
            async decide(): Promise<DecideStageResult> {
                modelCalls += 1;
                return modelCalls === 1
                    ? {
                        kind: "decision",
                        decision: {
                            kind: "tool_call",
                            action: { actionId: "pending-stop-parent", toolId: "execute_program", input: { code } },
                        },
                    }
                    : { kind: "decision", decision: { kind: "complete", summary: "Done", completionEvidence: [] } };
            },
            async think(): Promise<never> { throw new Error("Unexpected Think"); },
        };
        const toolPolicy = {
            evaluate: ({ tool }: { readonly tool: { readonly id: string; readonly isReadOnly?: boolean } }) =>
                tool.id === "execute_program" || tool.isReadOnly === true
                    ? "allow" as const
                    : "require_approval" as const,
        };
        const sandboxPlanResolver = async ({ action, effectiveScope }: {
            readonly action: { readonly toolId: string; readonly input: unknown };
            readonly effectiveScope?: { readonly extraFiles: readonly { readonly canonicalPath: string }[] } | undefined;
        }) => {
            if (action.toolId === "large_write") {
                plannedInputs.push({
                    path: (action.input as { readonly path: string }).path,
                    extraPaths: effectiveScope?.extraFiles.map((file) => file.canonicalPath) ?? [],
                });
            }
            return undefined;
        };
        const firstRunner = new Runner({
            store,
            trajectoryStore,
            executor,
            toolRegistry: registry,
            toolPolicy,
            workspaceRoot,
            sandboxPlanResolver,
        });
        const firstCoordinator = new GoalCoordinator({
            store,
            trajectoryStore,
            scheduler: new InlineScheduler(firstRunner),
            toolRegistry: registry,
            workspaceId: "ws-1",
            workspaceRoot,
        });
        const ref = { goalId: goal.id, runId: goal.state.run.id };
        const revisedPath = await realpath(join(workspaceRoot, "b.txt"));

        const waiting = await firstCoordinator.advance(ref);
        assert.equal(waiting.ok, true);
        if (!waiting.ok) return;
        assert.equal(waiting.kind, "waiting");
        assert.equal(waiting.waitingFor, "action_approval");
        const actionId = waiting.goal.state.run.pendingAction?.action.actionId;
        assert.ok(actionId);
        const finalInput = {
            path: "b.txt",
            sandboxAccess: {
                files: [{ path: "b.txt", access: "write", kind: "file", purpose: "write revised" }],
            },
        } as unknown as JsonValue;
        const review = await firstCoordinator.reviewActionApproval({ ref, actionId, input: finalInput });
        assert.equal(review.ok, true);
        if (!review.ok) return;

        const stopped = await firstCoordinator.resume({
            ref,
            action: {
                kind: "approve_action_revision",
                actionId,
                input: finalInput,
                reviewRef: review.review.reviewRef,
            },
        });
        assert.equal(stopped.ok, true);
        if (!stopped.ok) return;
        assert.equal(stopped.kind, "waiting");
        assert.equal(stopped.goal.state.run.pendingProgram?.pendingStop?.code, "PTC_FRAME_LIMIT");
        const staleRecoveryRef = stopped.goal.state.run.pendingAction?.recoveryRef;
        assert.ok(staleRecoveryRef);
        assert.deepEqual(executedInputs, ["b.txt"]);
        const stoppedProgram = stopped.goal.state.run.pendingProgram;
        assert.ok(stoppedProgram);
        const originalStopMessage = "The parent was already stopped at its return budget.";
        await store.save({
            ...stopped.goal,
            state: {
                ...stopped.goal.state,
                run: {
                    ...stopped.goal.state.run,
                    pendingProgram: {
                        ...stoppedProgram,
                        pendingStop: { code: "PTC_RETURN_LIMIT", message: originalStopMessage },
                    },
                },
            },
        });
        assert.deepEqual(plannedInputs.at(-1), {
            path: "b.txt",
            extraPaths: [revisedPath],
        });

        const reopenedStore = new JsonFileGoalStore(join(workspaceRoot, "goals"));
        const reopenedTrajectory = new JsonFileTrajectoryStore(join(workspaceRoot, "trajectory"));
        const reopenedRunner = new Runner({
            store: reopenedStore,
            trajectoryStore: reopenedTrajectory,
            executor,
            toolRegistry: registry,
            toolPolicy,
            workspaceRoot,
            sandboxPlanResolver,
        });
        const reopenedCoordinator = new GoalCoordinator({
            store: reopenedStore,
            trajectoryStore: reopenedTrajectory,
            scheduler: new InlineScheduler(reopenedRunner),
            toolRegistry: registry,
            workspaceId: "ws-1",
            workspaceRoot,
        });
        const stale = await reopenedCoordinator.resume({
            ref,
            action: { kind: "retry_unknown_action", actionId, recoveryRef: "stale-recovery-ref" },
        });
        assert.equal(stale.ok, false);
        assert.deepEqual(executedInputs, ["b.txt"]);

        const retried = await reopenedCoordinator.resume({
            ref,
            action: { kind: "retry_unknown_action", actionId, recoveryRef: staleRecoveryRef },
        });
        assert.equal(retried.ok, true);
        if (!retried.ok) return;
        assert.equal(retried.kind, "waiting");
        assert.equal(retried.goal.state.run.pendingProgram?.pendingStop?.code, "PTC_RETURN_LIMIT");
        assert.equal(retried.goal.state.run.pendingProgram?.pendingStop?.message, originalStopMessage);
        assert.deepEqual(executedInputs, ["b.txt", "b.txt"]);
        assert.ok(preparedInputs.filter((path) => path === "b.txt").length >= 2);
        assert.deepEqual(plannedInputs.at(-1), {
            path: "b.txt",
            extraPaths: [revisedPath],
        });

        const latest = await reopenedStore.restore(goal.id);
        const nextRecoveryRef = latest?.state.run.pendingAction?.recoveryRef;
        assert.ok(nextRecoveryRef);
        const declined = await reopenedCoordinator.resume({
            ref,
            action: {
                kind: "decline_unknown_action_retry",
                actionId,
                recoveryRef: nextRecoveryRef,
                reason: "Do not retry again",
            },
        });
        assert.equal(declined.ok, true);
        if (!declined.ok) return;
        assert.equal(declined.kind, "terminal");
        assert.deepEqual(executedInputs, ["b.txt", "b.txt"]);
        const finalEvents = await reopenedTrajectory.read(ref);
        const parentFailure = finalEvents.find((event) =>
            event.eventType === "observation_recorded" && event.actionId === "parent");
        if (parentFailure?.eventType === "observation_recorded") {
            assert.equal(parentFailure.payload.observation.kind, "failure");
            if (parentFailure.payload.observation.kind === "failure") {
                assert.equal(parentFailure.payload.observation.code, "PTC_RETURN_LIMIT");
                assert.equal(parentFailure.payload.observation.message, originalStopMessage);
            }
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
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

test("PTC replay mismatch settles the still-running Run as failed", {
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
    const pendingProgram = saved.state.run.pendingProgram;
    await fixture.store.save({
        ...saved,
        state: {
            ...saved.state,
            run: {
                ...saved.state.run,
                pendingProgram: {
                    ...pendingProgram,
                    workerHash: `${pendingProgram.workerHash[0] === "0" ? "1" : "0"}${pendingProgram.workerHash.slice(1)}`,
                },
            },
        },
    });

    const result = await runner.run({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id });

    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.state.status, "failed");
        assert.equal(result.state.pendingProgram, undefined);
        assert.deepEqual(result.state.stopReason, {
            kind: "execution_error",
            code: "TOOL_EXECUTION_ERROR",
            message: "PTC_REPLAY_MISMATCH",
        });
    }
    assert.ok(fixture.trajectoryStore.events.some((event) =>
        event.eventType === "execution_error"
            && event.payload.code === "TOOL_EXECUTION_ERROR"
            && event.payload.message === "PTC_REPLAY_MISMATCH"));
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
    const write = createTestToolRegistration({
        definition: {
            id: "write_file", description: "Write fixture", inputBinding: createTestBinding("test.fixture", objectInputSchema()), isReadOnly: false,
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

test("User Interrupt records unknown PTC parent and child outcomes, then cancels without another model call", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const entered = deferred();
    let toolCalls = 0;
    let modelCalls = 0;
    const write = createTestToolRegistration({
        definition: {
            id: "interrupt_write",
            description: "Write with interruptible execution",
            inputBinding: createTestBinding("test.tool", objectInputSchema({ value: { type: "string" } })),
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute(_request: any, control: any) {
            toolCalls += 1;
            entered.resolve();
            return new Promise((_, reject) => control?.signal?.addEventListener("abort", () => reject(new ExecutionAbortedError()), { once: true }));
        },
    });
    const fixture = setup("await tools.interrupt_write({value:'x'}); return 'done';", write);
    await fixture.store.save(fixture.goal);
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" as const }; },
        async execute() { throw new Error("Unexpected legacy Execute"); },
        async decide() {
            modelCalls += 1;
            return { kind: "decision" as const, decision: modelCalls === 1
                ? { kind: "tool_call" as const, action: { actionId: "parent", toolId: "execute_program", input: { code: "await tools.interrupt_write({value:'x'}); return 'done';" } } }
                : { kind: "fail" as const, error: "Inspection finished" } };
        },
        async think() { throw new Error("Unexpected Think"); },
    };
    const runner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor,
        toolRegistry: new InMemoryToolRegistry([createExecuteProgramRegistration(), write]),
    });
    const execution = runner.runUntilBlocked({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id });
    await entered.promise;
    const accepted = await runner.interrupt({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id }, "interrupt-ptc");
    assert.equal(accepted.ok, true);
    const result = await execution;
    assert.equal(result.ok, true);
    assert.equal(modelCalls, 1);
    assert.equal(toolCalls, 1);
    if (!result.ok) return;
    assert.equal(result.state.status, "cancelled");
    assert.equal(result.state.pendingProgram, undefined);
    assert.equal(result.state.pendingAction, undefined);
    const events = await fixture.trajectoryStore.read({ goalId: fixture.goal.id, runId: fixture.goal.state.run.id });
    assert.equal(events.some((event) => event.eventType === "run_interrupted_action_unknown" && event.actionId === "parent"), true);
    assert.equal(events.filter((event) => event.eventType === "run_interrupted_action_unknown").length, 2);
    assert.equal(events.some((event) => event.eventType === "tool_finished" && event.actionId === "parent"), false);
});
