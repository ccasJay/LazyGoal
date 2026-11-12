import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isSeatbeltSupported } from "../../sandbox/src/index";
import { createExecuteProgramRegistration } from "../../tools/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type ToolValidationResult,
} from "../../tool-core/src/index";
import { InMemoryGoalStore, JsonFileGoalStore, JsonFileTrajectoryStore } from "../../storage/src/index";
import {
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    type DecideStageResult,
    type GoalStore,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";
import { createTestBinding, objectInputSchema, openObjectSchema, sandboxCommandSchema } from "../../tool-core/test/binding-fixtures";
import { createTestToolRegistration } from "../../tool-core/test/helpers";
import { createProgramCallEnvelope } from "../src/action-approval";

const WRITE_INPUT = objectInputSchema({ path: { type: "string" }, content: { type: "string" } });

/** 记录真实执行入参的受控写入 Tool。 */
function createRecordingWriteTool(inputs: { path: string; content: string }[]) {
    return {
        definition: {
            id: "write_file",
            description: "受控写入 Tool",
            inputBinding: createTestBinding("test.tool", WRITE_INPUT),
            isReadOnly: false,
        },
        replayPolicy: "safe" as const,
        validate: (): ToolValidationResult => ({ ok: true }),
        async execute(request: { readonly input: unknown }) {
            inputs.push(request.input as { path: string; content: string });
            return { kind: "success" as const, output: "saved", summary: "Wrote" };
        },
    };
}

/** 写类 Tool 必须先经用户审批的策略。 */
const REQUIRE_APPROVAL = {
    evaluate: ({ tool }: { readonly tool: { readonly id: string; readonly isReadOnly?: boolean } }) =>
        tool.id === "execute_program" || tool.isReadOnly === true
            ? "allow" as const
            : "require_approval" as const,
};

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

test("PTC 子调用按修订后的最终参数执行，并把修订说明返回给程序", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-ptc-revision-"));
    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    const inputs: { path: string; content: string }[] = [];
    const registry = new InMemoryToolRegistry([
        createExecuteProgramRegistration(),
        createTestToolRegistration(createRecordingWriteTool(inputs)),
    ]);

    const code = [
        "const first = await tools.write_file({path:'a.txt', content:'original'});",
        "const second = await tools.write_file({path:'c.txt', content:'third'});",
        "return {first:first.observation.kind, second:second.observation.kind, revision:first.revision ?? null};",
    ].join("");
    const created = createGoal({
        ...currentProtocols,
        id: "ptc-revision-goal",
        runId: "ptc-revision-run",
        intent: "PTC 修订执行",
        promptBundleVersion: 1,
        profile: {
            id: "ptc-revision",
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
                approvedTask: { objective: "PTC 修订执行", completionCriteria: [] },
                exposedToolIds: ["execute_program", "write_file"],
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing" as const,
                    target: "PTC 修订执行",
                    acceptanceCriteria: ["测试完成"],
                },
            },
        },
    };
    await store.save(goal);

    let modelCalls = 0;
    const decide = (): DecideStageResult => {
        modelCalls += 1;
        return modelCalls === 1
            ? {
                kind: "decision",
                decision: {
                    kind: "tool_call",
                    action: { actionId: "parent-1", toolId: "execute_program", input: { code } },
                },
            }
            : { kind: "decision", decision: { kind: "complete", summary: "Done", completionEvidence: [] } };
    };
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" as const }; },
        async decide(_input: StepExecutionInput) { return decide(); },
        async think(): Promise<never> { throw new Error("Unexpected Think"); },
    };
    const runner = new Runner({
        store,
        trajectoryStore,
        executor,
        toolRegistry: registry,
        toolPolicy: REQUIRE_APPROVAL,
    });
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        scheduler: new InlineScheduler(runner),
        toolRegistry: registry,
        workspaceId: "ws-1",
        workspaceRoot,
    });
    const ref = { goalId: goal.id, runId: goal.state.run.id };

    // 第一次：程序内的写调用进入审批等待。
    const first = await coordinator.advance(ref);
    assert.ok(first.ok, JSON.stringify(first.ok ? {} : first.error));
    if (!first.ok) return;
    assert.equal(first.kind, "waiting");
    assert.equal(first.waitingFor, "action_approval");
    const childActionId = first.goal.state.run.pendingAction?.action.actionId;
    assert.ok(childActionId !== undefined);
    assert.deepEqual(inputs, []);

    // 修订为 B 并批准。
    const review = await coordinator.reviewActionApproval({
        ref,
        actionId: childActionId,
        input: { path: "b.txt", content: "revised" },
    });
    assert.ok(review.ok, JSON.stringify(review.ok ? {} : review));
    if (!review.ok) return;
    const approved = await coordinator.resume({
        ref,
        action: {
            kind: "approve_action_revision",
            actionId: childActionId,
            input: { path: "b.txt", content: "revised" },
            reviewRef: review.review.reviewRef,
        },
    });
    assert.ok(approved.ok, JSON.stringify(approved.ok ? {} : approved.error));
    if (!approved.ok) return;

    // 实际执行的写调用使用最终参数 B，原请求 A 未被执行。
    assert.deepEqual(inputs, [{ path: "b.txt", content: "revised" }]);

    // 程序继续发起第二次调用并再次等待审批。
    const second = await coordinator.advance(ref);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.kind, "waiting");
    assert.equal(second.waitingFor, "action_approval");
    const secondActionId = second.goal.state.run.pendingAction?.action.actionId;
    assert.ok(secondActionId !== undefined);
    assert.notEqual(secondActionId, childActionId);

    // 批准第二次调用：程序重建并重放第一次调用。
    const completed = await coordinator.resume({
        ref,
        action: { kind: "approve_action", actionId: secondActionId },
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;

    // 第一次调用没有被重复执行，第二次调用正常执行。
    assert.equal(inputs.length, 2);
    assert.deepEqual(inputs[0], { path: "b.txt", content: "revised" });
    assert.deepEqual(inputs[1], { path: "c.txt", content: "third" });

    // 程序收到的结果信封携带一致的修订说明。
    const events = await trajectoryStore.read(ref);
    const parentObservation = events.find((event) =>
        event.eventType === "observation_recorded" && event.actionId === "parent-1");
    assert.ok(parentObservation !== undefined);
    if (parentObservation?.eventType === "observation_recorded") {
        const output = parentObservation.payload.observation.kind === "success"
            ? parentObservation.payload.observation.output
            : undefined;
        assert.ok(output !== undefined);
        const revision = (output as { readonly revision?: { readonly reviewRef: string; readonly originalInput: unknown; readonly finalInput: unknown; readonly source: string } }).revision;
        assert.ok(revision !== undefined);
        assert.equal(revision.source, "user");
        assert.equal(revision.reviewRef, review.review.reviewRef);
        assert.deepEqual(revision.originalInput, { path: "a.txt", content: "original" });
        assert.deepEqual(revision.finalInput, { path: "b.txt", content: "revised" });
    }

    // 原暂存事实保留原请求参数。
    const staged = events.find((event) =>
        event.eventType === "action_staged" && event.actionId === childActionId);
    assert.ok(staged !== undefined);
    if (staged?.eventType === "action_staged") {
        assert.deepEqual(staged.payload.action.input, { path: "a.txt", content: "original" });
    }
    await rm(workspaceRoot, { recursive: true, force: true });
});

test("未保存的旧 action_revised 不覆盖后来提交的原样批准", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-ptc-stale-revision-tail-"));
    try {
        const store = new JsonFileGoalStore(join(workspaceRoot, "goals"));
        const trajectoryStore = new JsonFileTrajectoryStore(join(workspaceRoot, "trajectory"));
        const inputs: { path: string; content: string }[] = [];
        const registry = new InMemoryToolRegistry([
            createExecuteProgramRegistration(),
            createTestToolRegistration(createRecordingWriteTool(inputs)),
        ]);
        const code = [
            "const first = await tools.write_file({path:'a.txt',content:'original'});",
            "const second = await tools.write_file({path:'c.txt',content:'third'});",
            "return {first:first.revision ?? null, second:second.observation.kind};",
        ].join("");
        const created = createGoal({
            ...currentProtocols,
            id: "ptc-stale-revision-tail-goal",
            runId: "ptc-stale-revision-tail-run",
            intent: "Keep a failed revision out of a later approved replay",
            promptBundleVersion: 1,
            profile: {
                id: "ptc-stale-revision-tail",
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
                    approvedTask: { objective: "Keep a failed revision out", completionCriteria: [] },
                    exposedToolIds: ["execute_program", "write_file"],
                    currentStage: {
                        stageId: "stage-1",
                        revision: 1,
                        status: "executing" as const,
                        target: "Keep a failed revision out",
                        acceptanceCriteria: ["The approved Action determines replay"],
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
                            action: { actionId: "stale-revision-parent", toolId: "execute_program", input: { code } },
                        },
                    }
                    : { kind: "decision", decision: { kind: "complete", summary: "Done", completionEvidence: [] } };
            },
            async think(): Promise<never> { throw new Error("Unexpected Think"); },
        };
        const makeRunner = () => new Runner({
            store,
            trajectoryStore,
            executor,
            toolRegistry: registry,
            toolPolicy: REQUIRE_APPROVAL,
        });
        const initialRunner = makeRunner();
        const coordinator = new GoalCoordinator({
            store,
            trajectoryStore,
            scheduler: new InlineScheduler(initialRunner),
            toolRegistry: registry,
            workspaceId: "ws-1",
            workspaceRoot,
        });
        const ref = { goalId: goal.id, runId: goal.state.run.id };
        const waiting = await initialRunner.runUntilBlocked(ref);
        assert.equal(waiting.ok, true);
        if (!waiting.ok) return;
        const firstActionId = waiting.state.pendingAction?.action.actionId;
        assert.ok(firstActionId);

        const review = await coordinator.reviewActionApproval({
            ref,
            actionId: firstActionId,
            input: { path: "b.txt", content: "revised" },
        });
        assert.equal(review.ok, true);
        if (!review.ok) return;
        const failingStore: GoalStore = {
            restore: (goalId) => store.restore(goalId),
            async save() { throw new Error("revision Snapshot save failed"); },
        };
        const failedRevision = await assert.rejects(new GoalCoordinator({
            store: failingStore,
            trajectoryStore,
            scheduler: new InlineScheduler(initialRunner),
            toolRegistry: registry,
            workspaceId: "ws-1",
            workspaceRoot,
        }).resume({
            ref,
            action: {
                kind: "approve_action_revision",
                actionId: firstActionId,
                input: { path: "b.txt", content: "revised" },
                reviewRef: review.review.reviewRef,
            },
        }), /revision Snapshot save failed/);
        assert.equal(failedRevision, undefined);
        assert.deepEqual(inputs, []);

        const originalApproval = await coordinator.resume({
            ref,
            action: { kind: "approve_action", actionId: firstActionId },
        });
        assert.equal(originalApproval.ok, true);
        if (!originalApproval.ok) return;
        assert.equal(originalApproval.kind, "waiting");
        const secondActionId = originalApproval.goal.state.run.pendingAction?.action.actionId;
        assert.ok(secondActionId);
        assert.notEqual(secondActionId, firstActionId);

        const completed = await coordinator.resume({
            ref,
            action: { kind: "approve_action", actionId: secondActionId },
        });
        assert.equal(completed.ok, true);
        if (!completed.ok) return;
        assert.equal(completed.kind, "terminal");
        assert.deepEqual(inputs, [
            { path: "a.txt", content: "original" },
            { path: "c.txt", content: "third" },
        ]);

        const events = await trajectoryStore.read(ref);
        const parent = events.find((event) => event.eventType === "observation_recorded"
            && event.actionId === "stale-revision-parent");
        assert.equal(parent?.eventType, "observation_recorded");
        if (parent?.eventType === "observation_recorded") {
            assert.equal(parent.payload.observation.kind, "success");
            if (parent.payload.observation.kind === "success") {
                assert.deepEqual(parent.payload.observation.output, {
                    first: null,
                    second: "success",
                });
            }
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("PTC 拒绝未知重试后重开 worker，按同一修订信封恢复结算", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-ptc-decline-revision-"));
    try {
        const store = new JsonFileGoalStore(join(workspaceRoot, "goals"));
        const trajectoryStore = new JsonFileTrajectoryStore(join(workspaceRoot, "trajectory"));
        const inputs: { path: string; content: string }[] = [];
        const uncertainWrite = createTestToolRegistration({
            definition: {
                id: "write_file",
                description: "Write with an uncertain outcome",
                inputBinding: createTestBinding("test.tool", WRITE_INPUT),
                isReadOnly: false,
            },
            replayPolicy: "manual",
            validate: (): ToolValidationResult => ({ ok: true }),
            async execute(request: { readonly input: unknown }) {
                inputs.push(request.input as { path: string; content: string });
                throw new Error("write result is unknown");
            },
        });
        const registry = new InMemoryToolRegistry([
            createExecuteProgramRegistration(),
            uncertainWrite,
        ]);
        const code = [
            "const result = await tools.write_file({path:'a.txt',content:'original'});",
            "return {code:result.observation.code, finalPath:result.revision.finalInput.path};",
        ].join("");
        const created = createGoal({
            ...currentProtocols,
            id: "ptc-decline-revision-goal",
            runId: "ptc-decline-revision-run",
            intent: "Decline an uncertain revised write",
            promptBundleVersion: 1,
            profile: {
                id: "ptc-decline-revision",
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
                    approvedTask: { objective: "Decline an uncertain revised write", completionCriteria: [] },
                    exposedToolIds: ["execute_program", "write_file"],
                    currentStage: {
                        stageId: "stage-1",
                        revision: 1,
                        status: "executing" as const,
                        target: "Decline an uncertain revised write",
                        acceptanceCriteria: ["The unknown result is settled"],
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
                            action: { actionId: "decline-parent", toolId: "execute_program", input: { code } },
                        },
                    }
                    : { kind: "decision", decision: { kind: "complete", summary: "Done", completionEvidence: [] } };
            },
            async think(): Promise<never> { throw new Error("Unexpected Think"); },
        };
        const runner = new Runner({
            store,
            trajectoryStore,
            executor,
            toolRegistry: registry,
            toolPolicy: REQUIRE_APPROVAL,
        });
        const declineScheduleEntered = deferred();
        const releaseDeclineSchedule = deferred();
        let scheduleCalls = 0;
        const coordinator = new GoalCoordinator({
            store,
            trajectoryStore,
            scheduler: {
                async schedule(scheduleRef, options, control) {
                    scheduleCalls += 1;
                    if (scheduleCalls === 2) {
                        declineScheduleEntered.resolve();
                        await releaseDeclineSchedule.promise;
                        return {
                            ok: false,
                            error: { code: "RUN_NOT_FOUND", message: "deferred until Runtime restart" },
                        };
                    }
                    return runner.runUntilBlocked(scheduleRef, options, control);
                },
            },
            toolRegistry: registry,
            workspaceId: "ws-1",
            workspaceRoot,
        });
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const waiting = await runner.runUntilBlocked(ref);
        assert.equal(waiting.ok, true);
        if (!waiting.ok) return;
        assert.equal(waiting.state.status, "waiting");
        const actionId = waiting.state.pendingAction?.action.actionId;
        assert.ok(actionId);
        const review = await coordinator.reviewActionApproval({
            ref,
            actionId,
            input: { path: "b.txt", content: "revised" },
        });
        assert.equal(review.ok, true);
        if (!review.ok) return;

        const unknown = await coordinator.resume({
            ref,
            action: {
                kind: "approve_action_revision",
                actionId,
                input: { path: "b.txt", content: "revised" },
                reviewRef: review.review.reviewRef,
            },
        });
        assert.equal(unknown.ok, true);
        if (!unknown.ok) return;
        assert.equal(unknown.kind, "waiting");
        assert.equal(unknown.goal.state.run.pendingAction?.status, "outcome_unknown");
        assert.equal(unknown.goal.state.run.pendingProgram?.pendingStop, undefined);
        const recoveryRef = unknown.goal.state.run.pendingAction?.recoveryRef;
        assert.ok(recoveryRef);
        assert.deepEqual(inputs, [{ path: "b.txt", content: "revised" }]);

        const settlingDecline = coordinator.resume({
            ref,
            action: {
                kind: "decline_unknown_action_retry",
                actionId,
                recoveryRef,
                reason: "Do not repeat the write",
            },
        });
        await declineScheduleEntered.promise;
        const persistedStore = new JsonFileGoalStore(join(workspaceRoot, "goals"));
        const persistedTrajectory = new JsonFileTrajectoryStore(join(workspaceRoot, "trajectory"));
        const persisted = await persistedStore.restore(goal.id);
        assert.ok(persisted);
        if (!persisted) return;
        assert.ok(persisted.state.run.pendingProgram);
        const eventsBeforeRestart = await persistedTrajectory.read(ref);
        const declineObservation = eventsBeforeRestart.find((event) =>
            event.eventType === "observation_recorded" && event.actionId === actionId);
        assert.equal(declineObservation?.eventType, "observation_recorded");
        const revisedFact = eventsBeforeRestart.find((event) =>
            event.eventType === "action_revised" && event.actionId === actionId);
        assert.equal(revisedFact?.eventType, "action_revised");
        if (declineObservation?.eventType === "observation_recorded"
            && revisedFact?.eventType === "action_revised") {
            const expectedEnvelope = createProgramCallEnvelope(
                declineObservation.payload.observation,
                0,
                {
                    reviewRef: revisedFact.payload.reviewRef,
                    originalInput: revisedFact.payload.originalInput,
                    finalInput: revisedFact.payload.finalInput,
                    source: revisedFact.payload.revisionSource ?? "user",
                },
            );
            assert.equal(
                persisted.state.run.pendingProgram.resultBytes,
                Buffer.byteLength(JSON.stringify(expectedEnvelope)),
            );
        }

        releaseDeclineSchedule.resolve();
        const declined = await settlingDecline;
        assert.equal(declined.ok, false);
        assert.deepEqual(inputs, [{ path: "b.txt", content: "revised" }]);

        const reopenedRunner = new Runner({
            store: persistedStore,
            trajectoryStore: persistedTrajectory,
            executor,
            toolRegistry: registry,
            toolPolicy: REQUIRE_APPROVAL,
        });
        const resumed = await reopenedRunner.runUntilBlocked(ref);
        assert.equal(resumed.ok, true);
        if (!resumed.ok) return;
        assert.equal(resumed.state.status, "completed");
        assert.deepEqual(inputs, [{ path: "b.txt", content: "revised" }]);

        const events = await persistedTrajectory.read(ref);
        assert.equal(events.some((event) => event.eventType === "action_reexecution_declined"), true);
        const parent = events.find((event) => event.eventType === "observation_recorded" && event.actionId === "decline-parent");
        assert.equal(parent?.eventType, "observation_recorded");
        if (parent?.eventType === "observation_recorded") {
            assert.equal(parent.payload.observation.kind, "success");
            if (parent.payload.observation.kind === "success") {
                assert.deepEqual(parent.payload.observation.output, {
                    code: "REEXECUTION_DECLINED",
                    finalPath: "b.txt",
                });
            }
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});
