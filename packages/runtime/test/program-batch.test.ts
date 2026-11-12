import assert from "node:assert/strict";
import { test } from "node:test";
import { isSeatbeltSupported } from "../../sandbox/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { createExecuteProgramRegistration } from "../../tools/src/index";
import {
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    type AgentDecision,
    type DecideStageResult,
    type Goal,
    type GoalStore,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import {
    InMemoryToolRegistry,
} from "../../tool-core/src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";
import { createTestBinding, objectInputSchema } from "../../tool-core/test/binding-fixtures";
import { createTestToolRegistration } from "../../tool-core/test/helpers";

const profile = {
    id: "program-batch",
    systemPrompt: "Test",
    instructions: [],
    toolIds: ["execute_program", "read_file", "write_file"],
};

function programGoal(id: string, runId: string): Goal {
    const created = createGoal({
        ...currentProtocols,
        id,
        runId,
        intent: "按顺序执行程序批次",
        promptBundleVersion: 1,
        profile,
        maxSteps: 10,
    });
    return {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                mode: "plan",
                approvedTask: { objective: "按顺序执行程序批次", completionCriteria: [] },
                exposedToolIds: [...profile.toolIds],
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing",
                    target: "按顺序执行程序批次",
                    acceptanceCriteria: ["测试完成"],
                },
            },
        },
    };
}

interface BatchFixture {
    readonly store: InMemoryGoalStore;
    readonly trajectoryStore: InMemoryTrajectoryStore;
    readonly registry: InMemoryToolRegistry;
    readonly calls: string[];
    readonly writes: () => number;
    readonly reads: () => number;
}

function createBatchFixture(): BatchFixture {
    const calls: string[] = [];
    let writes = 0;
    let reads = 0;
    const ReadInput = objectInputSchema({ path: { type: "string" } });
    const WriteInput = objectInputSchema({ path: { type: "string" }, content: { type: "string" } });
    const registry = new InMemoryToolRegistry([
        createExecuteProgramRegistration(),
        createTestToolRegistration({
            definition: {
                id: "read_file",
                description: "Read test content",
                inputBinding: createTestBinding("test.tool", ReadInput),
                isReadOnly: true,
            },
            replayPolicy: "safe",
            validate: () => ({ ok: true }),
            async execute({ input }) {
                reads += 1;
                calls.push(`read:${(input as { path: string }).path}`);
                return { kind: "success", output: "content", summary: "Read" };
            },
        }),
        createTestToolRegistration({
            definition: {
                id: "write_file",
                description: "Write test content",
                inputBinding: createTestBinding("test.tool", WriteInput),
                isReadOnly: false,
            },
            replayPolicy: "manual",
            validate: () => ({ ok: true }),
            async execute({ input }) {
                writes += 1;
                calls.push(`write:${(input as { path: string }).path}`);
                return { kind: "success", output: "ok", summary: "Wrote" };
            },
        }),
    ]);
    return {
        store: new InMemoryGoalStore(),
        trajectoryStore: new InMemoryTrajectoryStore(),
        registry,
        calls,
        writes: () => writes,
        reads: () => reads,
    };
}

function programAction(actionId: string, code: string) {
    return { actionId, toolId: "execute_program", input: { code } };
}

function readAction(actionId: string, path: string) {
    return { actionId, toolId: "read_file", input: { path } };
}

function batchDecision(
    ...decisions: readonly AgentDecision[]
): Extract<DecideStageResult, { readonly kind: "batch" }> {
    return { kind: "batch", decisions };
}

function completeDecision(summary: string): DecideStageResult {
    return { kind: "decision", decision: { kind: "complete", summary, completionEvidence: [] } };
}

function scriptedExecutor(
    decisions: (input: StepExecutionInput, call: number) => DecideStageResult,
): StepExecutor {
    let calls = 0;
    return {
        async decide(input) {
            calls += 1;
            return decisions(input, calls);
        },
        async think() { throw new Error("Unexpected Think"); },
        async reviewCompletion() { return { kind: "accept" }; },
    };
}

const childWriteCode = "const result = await tools.write_file({path:'child',content:'x'}); return {kind:result.observation.kind};";

test("程序位于新批次队首时，开始检查点保存剩余 Action 并在程序结算后按序继续", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const fixture = createBatchFixture();
    const goal = programGoal("program-batch-head", "run-program-batch-head");
    await fixture.store.save(goal);
    const ref = { goalId: goal.id, runId: goal.state.run.id };
    let modelCalls = 0;
    const executor = scriptedExecutor((_input, call) => {
        modelCalls = call;
        return call === 1
            ? batchDecision(
                { kind: "tool_call", action: programAction("parent", childWriteCode) },
                { kind: "tool_call", action: readAction("read-b", "b") },
                { kind: "tool_call", action: readAction("read-c", "c") },
            )
            : completeDecision("Done");
    });
    const runner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor,
        toolRegistry: fixture.registry,
        toolPolicy: { evaluate: ({ action }) => action.toolId === "write_file" ? "require_approval" : "allow" },
    });
    const waiting = await runner.run(ref);
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;
    assert.equal(waiting.state.status, "waiting");
    assert.equal(waiting.state.pendingAction?.action.toolId, "write_file");
    assert.ok(waiting.state.pendingProgram);
    assert.deepEqual(
        waiting.state.pendingActionBatch?.remaining.map((action) => action.actionId),
        ["read-b", "read-c"],
    );
    assert.equal(fixture.writes(), 0);
    assert.equal(fixture.reads(), 0);

    const coordinator = new GoalCoordinator({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        scheduler: new InlineScheduler(runner),
    });
    const completed = await coordinator.resume({
        ref,
        action: { kind: "approve_action", actionId: waiting.state.pendingAction!.action.actionId },
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.goal.state.run.status, "completed");
    assert.equal(completed.goal.state.run.pendingActionBatch, undefined);
    assert.equal(fixture.writes(), 1);
    assert.equal(fixture.reads(), 2);
    assert.deepEqual(fixture.calls, ["write:child", "read:b", "read:c"]);
    assert.equal(modelCalls, 2, "the batch must not request another Decide between actions");
    assert.equal(completed.goal.state.run.stepCount, 4);
});

test("程序位于批次中间时，开始检查点只消费队首并保留后续 Action", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const fixture = createBatchFixture();
    const goal = programGoal("program-batch-middle", "run-program-batch-middle");
    await fixture.store.save(goal);
    const ref = { goalId: goal.id, runId: goal.state.run.id };
    let modelCalls = 0;
    const executor = scriptedExecutor((_input, call) => {
        modelCalls = call;
        return call === 1
            ? batchDecision(
                { kind: "tool_call", action: readAction("read-a", "a") },
                { kind: "tool_call", action: programAction("parent-middle", childWriteCode) },
                { kind: "tool_call", action: readAction("read-c", "c") },
            )
            : completeDecision("Done");
    });
    const runner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor,
        toolRegistry: fixture.registry,
        toolPolicy: { evaluate: ({ action }) => action.toolId === "write_file" ? "require_approval" : "allow" },
    });
    const waiting = await runner.run(ref);
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;
    assert.equal(waiting.state.status, "waiting");
    assert.ok(waiting.state.pendingProgram);
    assert.deepEqual(
        waiting.state.pendingActionBatch?.remaining.map((action) => action.actionId),
        ["read-c"],
    );
    assert.deepEqual(fixture.calls, ["read:a"]);

    const coordinator = new GoalCoordinator({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        scheduler: new InlineScheduler(runner),
    });
    const completed = await coordinator.resume({
        ref,
        action: { kind: "approve_action", actionId: waiting.state.pendingAction!.action.actionId },
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.goal.state.run.status, "completed");
    assert.equal(completed.goal.state.run.pendingActionBatch, undefined);
    assert.deepEqual(fixture.calls, ["read:a", "write:child", "read:c"]);
    assert.equal(modelCalls, 2, "the batch must not request another Decide between actions");
    assert.equal(completed.goal.state.run.stepCount, 4);
});

test("程序位于批次末尾时，开始检查点清空批次游标", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const fixture = createBatchFixture();
    const goal = programGoal("program-batch-tail", "run-program-batch-tail");
    await fixture.store.save(goal);
    const ref = { goalId: goal.id, runId: goal.state.run.id };
    const executor = scriptedExecutor((_input, call) => call === 1
        ? batchDecision(
            { kind: "tool_call", action: readAction("read-a", "a") },
            { kind: "tool_call", action: programAction("parent-tail", childWriteCode) },
        )
        : completeDecision("Done"));
    const runner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor,
        toolRegistry: fixture.registry,
        toolPolicy: { evaluate: ({ action }) => action.toolId === "write_file" ? "require_approval" : "allow" },
    });
    const waiting = await runner.run(ref);
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;
    assert.equal(waiting.state.status, "waiting");
    assert.ok(waiting.state.pendingProgram);
    assert.equal(waiting.state.pendingActionBatch, undefined);

    const coordinator = new GoalCoordinator({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        scheduler: new InlineScheduler(runner),
    });
    const completed = await coordinator.resume({
        ref,
        action: { kind: "approve_action", actionId: waiting.state.pendingAction!.action.actionId },
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.goal.state.run.status, "completed");
    assert.deepEqual(fixture.calls, ["read:a", "write:child"]);
});

test("父程序审批等待已消费批次项，批准启动时不会二次推进游标", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const fixture = createBatchFixture();
    const goal = programGoal("program-batch-parent-approval", "run-program-batch-parent-approval");
    await fixture.store.save(goal);
    const ref = { goalId: goal.id, runId: goal.state.run.id };
    const executor = scriptedExecutor((_input, call) => call === 1
        ? batchDecision(
            { kind: "tool_call", action: programAction("parent-approval", childWriteCode) },
            { kind: "tool_call", action: readAction("read-b", "b") },
        )
        : completeDecision("Done"));
    const runner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor,
        toolRegistry: fixture.registry,
        toolPolicy: {
            evaluate: ({ action }) => action.toolId === "execute_program" || action.toolId === "write_file"
                ? "require_approval"
                : "allow",
        },
    });
    const parentWaiting = await runner.run(ref);
    assert.equal(parentWaiting.ok, true);
    if (!parentWaiting.ok) return;
    assert.equal(parentWaiting.state.status, "waiting");
    assert.equal(parentWaiting.state.pendingAction?.action.actionId, "parent-approval");
    assert.equal(parentWaiting.state.pendingProgram, undefined);
    assert.deepEqual(
        parentWaiting.state.pendingActionBatch?.remaining.map((action) => action.actionId),
        ["read-b"],
    );

    const coordinator = new GoalCoordinator({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        scheduler: new InlineScheduler(runner),
    });
    const childWaiting = await coordinator.resume({
        ref,
        action: { kind: "approve_action", actionId: "parent-approval" },
    });
    assert.equal(childWaiting.ok, true);
    if (!childWaiting.ok || childWaiting.kind !== "waiting") assert.fail("Expected child approval wait");
    assert.equal(childWaiting.goal.state.run.pendingAction?.action.toolId, "write_file");
    assert.ok(childWaiting.goal.state.run.pendingProgram);
    assert.deepEqual(
        childWaiting.goal.state.run.pendingActionBatch?.remaining.map((action) => action.actionId),
        ["read-b"],
        "approval start must not consume the batch twice",
    );

    const completed = await coordinator.resume({
        ref,
        action: { kind: "approve_action", actionId: childWaiting.goal.state.run.pendingAction!.action.actionId },
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.goal.state.run.status, "completed");
    assert.deepEqual(fixture.calls, ["write:child", "read:b"]);
    assert.equal(completed.goal.state.run.pendingActionBatch, undefined);
});

test("程序开始检查点保存前失败时不启动 worker，恢复后仍从原批次位置继续", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const fixture = createBatchFixture();
    const goal = programGoal("program-batch-start-save", "run-program-batch-start-save");
    await fixture.store.save(goal);
    const ref = { goalId: goal.id, runId: goal.state.run.id };
    let failStart = true;
    const store: GoalStore = {
        restore: (goalId) => fixture.store.restore(goalId),
        save: async (candidate) => {
            if (failStart && candidate.state.run.pendingProgram !== undefined) {
                failStart = false;
                throw new Error("program start checkpoint failed");
            }
            await fixture.store.save(candidate);
        },
    };
    const executor = scriptedExecutor((_input, call) => call === 1
        ? batchDecision(
            { kind: "tool_call", action: programAction("parent-save", childWriteCode) },
            { kind: "tool_call", action: readAction("read-b", "b") },
        )
        : completeDecision("Done"));
    const runner = new Runner({
        store,
        trajectoryStore: fixture.trajectoryStore,
        executor,
        toolRegistry: fixture.registry,
        toolPolicy: { evaluate: ({ action }) => action.toolId === "write_file" ? "require_approval" : "allow" },
    });
    await assert.rejects(runner.run(ref), /program start checkpoint failed/);
    assert.equal(fixture.writes(), 0);
    assert.equal(fixture.reads(), 0);
    const unchanged = await fixture.store.restore(goal.id);
    assert.ok(unchanged);
    assert.equal(unchanged.state.run.pendingProgram, undefined);
    assert.equal(unchanged.state.run.pendingActionBatch, undefined);

    const recoveredRunner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: scriptedExecutor((_input, call) => call === 1
            ? batchDecision(
                { kind: "tool_call", action: programAction("parent-save", childWriteCode) },
                { kind: "tool_call", action: readAction("read-b", "b") },
            )
            : completeDecision("Done")),
        toolRegistry: fixture.registry,
        toolPolicy: { evaluate: ({ action }) => action.toolId === "write_file" ? "require_approval" : "allow" },
    });
    const waiting = await recoveredRunner.run(ref);
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;
    assert.equal(waiting.state.status, "waiting");
    assert.ok(waiting.state.pendingProgram);
    assert.deepEqual(
        waiting.state.pendingActionBatch?.remaining.map((action) => action.actionId),
        ["read-b"],
    );
    const coordinator = new GoalCoordinator({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        scheduler: new InlineScheduler(recoveredRunner),
    });
    const completed = await coordinator.resume({
        ref,
        action: { kind: "approve_action", actionId: waiting.state.pendingAction!.action.actionId },
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.goal.state.run.status, "completed");
    assert.equal(fixture.writes(), 1);
    assert.deepEqual(fixture.calls, ["write:child", "read:b"]);
});

test("程序开始检查点保存后、worker 启动前中断时以同一检查点恢复", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const fixture = createBatchFixture();
    const goal = programGoal("program-batch-start-saved", "run-program-batch-start-saved");
    await fixture.store.save(goal);
    const ref = { goalId: goal.id, runId: goal.state.run.id };
    let failAfterSave = true;
    const store: GoalStore = {
        restore: (goalId) => fixture.store.restore(goalId),
        save: async (candidate) => {
            await fixture.store.save(candidate);
            if (failAfterSave && candidate.state.run.pendingProgram !== undefined) {
                failAfterSave = false;
                throw new Error("host stopped before worker start");
            }
        },
    };
    const executor = scriptedExecutor((_input, call) => call === 1
        ? batchDecision(
            { kind: "tool_call", action: programAction("parent-saved", childWriteCode) },
            { kind: "tool_call", action: readAction("read-b", "b") },
        )
        : completeDecision("Done"));
    const runner = new Runner({
        store,
        trajectoryStore: fixture.trajectoryStore,
        executor,
        toolRegistry: fixture.registry,
        toolPolicy: { evaluate: ({ action }) => action.toolId === "write_file" ? "require_approval" : "allow" },
    });
    await assert.rejects(runner.run(ref), /host stopped before worker start/);
    assert.equal(fixture.writes(), 0);
    const saved = await fixture.store.restore(goal.id);
    assert.ok(saved);
    assert.ok(saved.state.run.pendingProgram);
    assert.deepEqual(
        saved.state.run.pendingActionBatch?.remaining.map((action) => action.actionId),
        ["read-b"],
    );
    const programId = saved.state.run.pendingProgram.programId;
    const programStarted = (await fixture.trajectoryStore.read(ref))
        .find((event) => event.eventType === "program_started");
    assert.equal(programStarted?.eventType, "program_started");
    if (programStarted?.eventType === "program_started") {
        assert.equal(programStarted.payload.programId, programId);
    }

    const recoveredRunner = new Runner({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        executor: scriptedExecutor((_input, call) => call === 1
            ? batchDecision(
                { kind: "tool_call", action: programAction("parent-saved", childWriteCode) },
                { kind: "tool_call", action: readAction("read-b", "b") },
            )
            : completeDecision("Done")),
        toolRegistry: fixture.registry,
        toolPolicy: { evaluate: ({ action }) => action.toolId === "write_file" ? "require_approval" : "allow" },
    });
    const waiting = await recoveredRunner.run(ref);
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;
    assert.equal(waiting.state.status, "waiting");
    assert.equal(waiting.state.pendingProgram?.programId, programId);
    assert.equal(waiting.state.pendingAction?.action.toolId, "write_file");
    assert.equal(fixture.writes(), 0);

    const coordinator = new GoalCoordinator({
        store: fixture.store,
        trajectoryStore: fixture.trajectoryStore,
        scheduler: new InlineScheduler(recoveredRunner),
    });
    const completed = await coordinator.resume({
        ref,
        action: { kind: "approve_action", actionId: waiting.state.pendingAction!.action.actionId },
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.goal.state.run.status, "completed");
    assert.equal(fixture.writes(), 1);
    assert.deepEqual(fixture.calls, ["write:child", "read:b"]);
});
