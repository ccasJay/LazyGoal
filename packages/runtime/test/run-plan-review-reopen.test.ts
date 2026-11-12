import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ExecutionAbortedError } from "../../execution-control/src/index";
import {
    JsonFileGoalStore,
    JsonFileTrajectoryStore,
} from "../../storage/src/index";
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
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
} from "../src/index";
import { BaseTestStepExecutor, currentProtocols } from "./current-fixtures";

const profile = {
    id: "plan-review-reopen",
    systemPrompt: "Plan",
    instructions: [],
    toolIds: [],
};

function planGoal(id: string, runId: string): Goal {
    return createGoal({
        ...currentProtocols,
        id,
        runId,
        intent: "完成分阶段交付",
        promptBundleVersion: 1,
        profile,
        mode: "plan",
    });
}

function assertReopenedLastStage(goal: Goal, acceptedSequence: number): void {
    const run = goal.state.run;
    assert.equal(run.currentStage?.stageId, "stage-2");
    assert.equal(run.currentStage?.status, "executing");
    assert.equal(run.currentStage?.revision, 1);
    assert.equal(run.currentStage?.acceptedSequence, undefined);
    assert.match(run.currentStage?.latestReviewRejection?.feedback ?? "", /缺少最终建议/);

    const route = run.planRoute;
    assert.ok(route);
    assert.equal(route.revision, 1);
    assert.equal(route.nextStageIndex, 1);
    assert.deepEqual(route.stages.map(({ status }) => status), ["accepted", "executing"]);
    assert.equal(route.stages[0]?.stageId, "stage-1");
    assert.equal(route.stages[0]?.acceptedSequence, acceptedSequence);
    assert.equal(route.stages[1]?.stageId, "stage-2");
    assert.equal(route.stages[1]?.revision, 1);
    assert.equal(route.stages[1]?.acceptedSequence, undefined);
}

test("Plan 最终审查拒绝在同一检查点重开末阶段并回拨路线游标，修正后可在原 Run 重新接受", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-plan-review-reopen-"));
    try {
        const store = new JsonFileGoalStore(join(directory, "goals"));
        const trajectoryStore = new JsonFileTrajectoryStore(join(directory, "trajectory"));
        const initial = planGoal("plan-review-reopen", "run-plan-review-reopen");
        await store.save(initial);
        const ref = { goalId: initial.id, runId: initial.state.run.id };
        let firstStageAcceptedSequence = 0;
        let firstFinalAcceptSequence = 0;

        class RejectThenRepair extends BaseTestStepExecutor {
            private index = 0;

            async execute({ goal, runtimeFeedback }: StepExecutionInput): Promise<AgentDecision> {
                this.index += 1;
                const route = goal.state.run.planRoute;
                if (this.index === 1) {
                    assert.equal(route, undefined);
                    return {
                        kind: "task_proposal",
                        task: { objective: "完成分阶段交付", completionCriteria: [] },
                        planRoute: {
                            stages: [
                                { target: "调查现状", acceptanceCriteria: ["定位缺口"] },
                                { target: "实现并验证", acceptanceCriteria: ["行为正确", "回归通过"] },
                            ],
                        },
                        approvalRequest: "请批准任务和完整路线。",
                    };
                }
                assert.ok(route);
                if (this.index === 2) {
                    assert.equal(goal.state.run.approvedTask?.objective, "完成分阶段交付");
                    assert.equal(route.nextStageIndex, 0);
                    return { kind: "run_stage_update", target: "调查现状", acceptanceCriteria: ["定位缺口"] };
                }
                if (this.index === 3) {
                    assert.equal(route.stages[0]?.status, "executing");
                    return { kind: "run_stage_complete", stageId: "stage-1", summary: "调查完成", evidenceSequences: [] };
                }
                if (this.index === 4) {
                    assert.equal(route.nextStageIndex, 1);
                    assert.equal(route.stages[0]?.status, "accepted");
                    firstStageAcceptedSequence = route.stages[0]?.acceptedSequence ?? 0;
                    assert.ok(firstStageAcceptedSequence > 0);
                    return { kind: "run_stage_update", target: "实现并验证", acceptanceCriteria: ["行为正确", "回归通过"] };
                }
                if (this.index === 5) {
                    assert.equal(route.stages[1]?.status, "executing");
                    return { kind: "run_stage_complete", stageId: "stage-2", summary: "实现和验证完成", evidenceSequences: [] };
                }
                if (this.index === 6) {
                    assert.equal(route.nextStageIndex, 2);
                    assert.deepEqual(route.stages.map(({ status }) => status), ["accepted", "accepted"]);
                    firstFinalAcceptSequence = route.stages[1]?.acceptedSequence ?? 0;
                    assert.ok(firstFinalAcceptSequence > firstStageAcceptedSequence);
                    return {
                        kind: "complete",
                        summary: "Incomplete delivery",
                        completionEvidence: [],
                        memoryPatch: {
                            protocolVersion: 1,
                            operations: [{
                                type: "create_hypothesis",
                                hypothesis: { statement: "rejected-final-candidate" },
                            }],
                        },
                    };
                }
                if (this.index === 7) {
                    assertReopenedLastStage(goal, firstStageAcceptedSequence);
                    assert.match(runtimeFeedback?.issues[0]?.message ?? "", /缺少最终建议/);
                    return { kind: "run_stage_complete", stageId: "stage-2", summary: "修订后的交付", evidenceSequences: [] };
                }
                assert.equal(route.nextStageIndex, 2);
                assert.deepEqual(route.stages.map(({ status }) => status), ["accepted", "accepted"]);
                assert.ok((route.stages[1]?.acceptedSequence ?? 0) > firstFinalAcceptSequence);
                return { kind: "complete", summary: "Final delivery", completionEvidence: [] };
            }
        }

        const executor = new RejectThenRepair();
        let rejected = false;
        const reviewer: StepExecutor = {
            async decide(input) { return executor.decide(input); },
            async think() { throw new Error("Unexpected Think"); },
            async reviewCompletion({ candidate }) {
                if (!rejected && candidate.kind === "complete" && candidate.summary === "Incomplete delivery") {
                    rejected = true;
                    return { kind: "reject", feedback: "缺少最终建议" };
                }
                return { kind: "accept" };
            },
        };
        const runner = new Runner({ store, trajectoryStore, executor: reviewer });
        const coordinator = new GoalCoordinator({
            store,
            trajectoryStore,
            scheduler: new InlineScheduler(runner),
        });

        const proposed = await coordinator.advance(ref);
        assert.equal(proposed.ok, true);
        if (!proposed.ok || proposed.kind !== "waiting") assert.fail("Expected task approval wait");
        const pending = proposed.goal.state.run.pendingInteraction;
        if (pending?.kind !== "task_approval") assert.fail("Expected task approval");
        const completed = await coordinator.resume({
            ref,
            action: { kind: "approve_task", requestId: pending.requestId },
        });
        assert.equal(completed.ok, true);
        if (!completed.ok || completed.kind !== "terminal") assert.fail("Expected repaired Run completion");

        const finalGoal = await store.restore(initial.id);
        assert.ok(finalGoal);
        assert.equal(finalGoal.state.run.id, ref.runId);
        assert.equal(finalGoal.state.run.status, "completed");
        assert.equal(finalGoal.state.run.planRoute?.nextStageIndex, 2);
        assert.deepEqual(finalGoal.state.run.planRoute?.stages.map(({ status }) => status), ["accepted", "accepted"]);
        assert.equal(finalGoal.state.run.currentStage?.status, "accepted");
        assert.equal(finalGoal.state.run.currentStage?.latestReviewRejection, undefined);

        const events = await trajectoryStore.read(ref);
        const rejectedEvents = events.filter((event) => event.eventType === "run_stage_rejected");
        assert.equal(rejectedEvents.length, 1);
        assert.equal(rejectedEvents[0]?.payload.stageId, "stage-2");
        assert.equal(rejectedEvents[0]?.payload.feedback, "缺少最终建议");
        assert.equal(finalGoal.state.run.committedThroughSequence >= rejectedEvents[0]!.sequence, true);
        assert.equal(
            events.filter((event) => event.eventType === "run_stage_accepted"
                && event.payload.stageId === "stage-2").length,
            2,
            "re-acceptance must append a new accepted fact",
        );
        assert.equal(
            events.filter((event) => event.eventType === "memory_patch_accepted"
                && JSON.stringify(event.payload).includes("rejected-final-candidate")).length,
            0,
            "the rejected candidate Memory Patch must not be committed",
        );
        assert.equal(
            finalGoal.state.messages.some((message) => message.role === "assistant"
                && message.purpose === "answer"
                && message.content === "Incomplete delivery"),
            false,
            "the rejected candidate must not become a formal answer",
        );
        assert.equal(finalGoal.state.messages.at(-1)?.content, "Final delivery");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("从已提交的最终审查拒绝重开 Runtime 后直接完成，并追加新的接受事实", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-plan-review-restart-"));
    try {
        const store = new JsonFileGoalStore(join(directory, "goals"));
        const trajectoryStore = new JsonFileTrajectoryStore(join(directory, "trajectory"));
        const initial = planGoal("plan-review-restart", "run-plan-review-restart");
        await store.save(initial);
        const ref = { goalId: initial.id, runId: initial.state.run.id };
        let stageOneAcceptedSequence = 0;
        let firstFinalAcceptSequence = 0;

        class RejectLastStage extends BaseTestStepExecutor {
            private index = 0;

            async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
                this.index += 1;
                if (this.index === 1) return {
                    kind: "task_proposal",
                    task: { objective: "完成分阶段交付", completionCriteria: [] },
                    planRoute: {
                        stages: [
                            { target: "调查现状", acceptanceCriteria: ["定位缺口"] },
                            { target: "实现并验证", acceptanceCriteria: ["行为正确"] },
                        ],
                    },
                    approvalRequest: "请批准任务和完整路线。",
                };
                if (this.index === 2) return { kind: "run_stage_update", target: "调查现状", acceptanceCriteria: ["定位缺口"] };
                if (this.index === 3) return { kind: "run_stage_complete", stageId: "stage-1", summary: "调查完成" };
                if (this.index === 4) {
                    stageOneAcceptedSequence = goal.state.run.planRoute?.stages[0]?.acceptedSequence ?? 0;
                    assert.ok(stageOneAcceptedSequence > 0);
                    return { kind: "run_stage_update", target: "实现并验证", acceptanceCriteria: ["行为正确"] };
                }
                if (this.index === 5) return { kind: "run_stage_complete", stageId: "stage-2", summary: "实现完成" };
                if (this.index === 6) {
                    firstFinalAcceptSequence = goal.state.run.planRoute?.stages[1]?.acceptedSequence ?? 0;
                    assert.ok(firstFinalAcceptSequence > 0);
                    return { kind: "complete", summary: "Incomplete delivery", completionEvidence: [] };
                }
                throw new ExecutionAbortedError();
            }
        }

        const firstDecisions = new RejectLastStage();
        const firstRunner = new Runner({
            store,
            trajectoryStore,
            executor: {
                async decide(input) { return firstDecisions.decide(input); },
                async think() { throw new Error("Unexpected Think"); },
                async reviewCompletion({ candidate }) {
                    return candidate.kind === "complete" && candidate.summary === "Incomplete delivery"
                        ? { kind: "reject", feedback: "缺少最终建议" }
                        : { kind: "accept" };
                },
            },
        });
        const firstCoordinator = new GoalCoordinator({
            store,
            trajectoryStore,
            scheduler: new InlineScheduler(firstRunner),
        });
        const proposed = await firstCoordinator.advance(ref);
        assert.equal(proposed.ok, true);
        if (!proposed.ok || proposed.kind !== "waiting" || proposed.goal.state.run.pendingInteraction?.kind !== "task_approval") {
            assert.fail("Expected task approval wait");
        }
        await assert.rejects(
            firstCoordinator.resume({
                ref,
                action: { kind: "approve_task", requestId: proposed.goal.state.run.pendingInteraction.requestId },
            }),
            ExecutionAbortedError,
        );

        const rejectedSnapshot = await store.restore(initial.id);
        assert.ok(rejectedSnapshot);
        assert.equal(rejectedSnapshot.state.run.status, "running");
        assertReopenedLastStage(rejectedSnapshot, stageOneAcceptedSequence);
        const rejectedSequence = rejectedSnapshot.state.run.committedThroughSequence;

        class CompleteDirectly extends BaseTestStepExecutor {
            async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
                assert.equal(goal.state.run.id, ref.runId);
                assert.equal(goal.state.run.status, "running");
                assert.equal(goal.state.run.currentStage?.status, "executing");
                assert.match(goal.state.run.currentStage?.latestReviewRejection?.feedback ?? "", /缺少最终建议/);
                assert.equal(goal.state.run.planRoute?.nextStageIndex, 1);
                return { kind: "complete", summary: "Final delivery", completionEvidence: [] };
            }
        }

        const restartedRunner = new Runner({ store, trajectoryStore, executor: new CompleteDirectly() });
        const restartedCoordinator = new GoalCoordinator({
            store,
            trajectoryStore,
            scheduler: new InlineScheduler(restartedRunner),
        });
        const resumed = await restartedCoordinator.advance(ref);
        assert.equal(resumed.ok, true);
        if (!resumed.ok || resumed.kind !== "terminal") assert.fail("Expected completion after restart");

        const finalGoal = await store.restore(initial.id);
        assert.ok(finalGoal);
        assert.equal(finalGoal.state.run.status, "completed");
        assert.equal(finalGoal.state.run.planRoute?.nextStageIndex, 2);
        assert.equal(finalGoal.state.run.currentStage?.status, "accepted");
        assert.ok((finalGoal.state.run.currentStage?.acceptedSequence ?? 0) > rejectedSequence);
        const acceptedEvents = (await trajectoryStore.read(ref))
            .filter((event) => event.eventType === "run_stage_accepted" && event.payload.stageId === "stage-2");
        assert.equal(acceptedEvents.length, 2);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("末阶段仍在执行时最终审查拒绝保持路线游标，恢复后可直接完成", async () => {
    const goalDirectory = await mkdtemp(join(tmpdir(), "lazygoal-plan-review-active-"));
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-plan-review-active-trajectory-"));
    try {
        const store = new JsonFileGoalStore(goalDirectory);
        const trajectoryStore = new JsonFileTrajectoryStore(directory);
        const created = planGoal("plan-review-active", "run-plan-review-active");
        const initial: Goal = {
            ...created,
            state: {
                ...created.state,
                run: {
                    ...created.state.run,
                    status: "running",
                    approvedTask: { objective: "完成分阶段交付", completionCriteria: [] },
                    planRoute: {
                        revision: 1,
                        nextStageIndex: 1,
                        nextStageOrdinal: 3,
                        stages: [
                            { stageId: "stage-1", revision: 1, status: "accepted", target: "调查现状", acceptanceCriteria: ["定位缺口"], acceptedSequence: 0 },
                            { stageId: "stage-2", revision: 1, status: "executing", target: "实现并验证", acceptanceCriteria: ["行为正确"] },
                        ],
                    },
                    currentStage: {
                        stageId: "stage-2",
                        revision: 1,
                        status: "executing",
                        target: "实现并验证",
                        acceptanceCriteria: ["行为正确"],
                    },
                },
            },
        };
        await store.save(initial);
        const ref = { goalId: initial.id, runId: initial.state.run.id };
        let calls = 0;
        const executor: StepExecutor = {
            async decide() {
                calls += 1;
                if (calls > 1) throw new ExecutionAbortedError();
                return {
                    kind: "decision",
                    decision: { kind: "complete", summary: "Incomplete delivery", completionEvidence: [] },
                };
            },
            async think() { throw new Error("Unexpected Think"); },
            async reviewCompletion() { return { kind: "reject", feedback: "缺少最终建议" }; },
        };
        await assert.rejects(new Runner({ store, trajectoryStore, executor }).run(ref), ExecutionAbortedError);
        assert.equal(calls, 2);

        const result = await store.restore(initial.id);
        assert.ok(result);
        assert.equal(result.state.run.status, "running");
        assert.equal(result.state.run.planRoute?.nextStageIndex, 1);
        assert.deepEqual(result.state.run.planRoute?.stages.map(({ status }) => status), ["accepted", "executing"]);
        assert.equal(result.state.run.currentStage?.status, "executing");
        assert.equal(result.state.run.currentStage?.acceptedSequence, undefined);

        const restarted = await new Runner({
            store,
            trajectoryStore,
            executor: {
                async decide() {
                    assert.equal(calls, 2);
                    return { kind: "decision", decision: { kind: "complete", summary: "Final delivery", completionEvidence: [] } };
                },
                async think() { throw new Error("Unexpected Think"); },
                async reviewCompletion() { return { kind: "accept" }; },
            },
        }).run(ref);
        assert.equal(restarted.ok, true);
        if (!restarted.ok) return;
        assert.equal(restarted.state.status, "completed");
        assert.equal(restarted.state.planRoute?.nextStageIndex, 2);
        assert.equal(restarted.state.currentStage?.status, "accepted");
    } finally {
        await rm(goalDirectory, { recursive: true, force: true });
        await rm(directory, { recursive: true, force: true });
    }
});

test("拒绝事实保存失败时保留原阶段与路线，恢复后仍可完成", async () => {
    const goalDirectory = await mkdtemp(join(tmpdir(), "lazygoal-plan-review-save-"));
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-plan-review-save-trajectory-"));
    try {
        const backingStore = new JsonFileGoalStore(goalDirectory);
        const trajectoryStore = new JsonFileTrajectoryStore(directory);
        const created = planGoal("plan-review-save-failure", "run-plan-review-save-failure");
        const initial: Goal = {
            ...created,
            state: {
                ...created.state,
                run: {
                    ...created.state.run,
                    status: "running",
                    approvedTask: { objective: "完成分阶段交付", completionCriteria: [] },
                    planRoute: {
                        revision: 1,
                        nextStageIndex: 2,
                        nextStageOrdinal: 3,
                        stages: [
                            { stageId: "stage-1", revision: 1, status: "accepted", target: "调查现状", acceptanceCriteria: ["定位缺口"], acceptedSequence: 0 },
                            { stageId: "stage-2", revision: 1, status: "accepted", target: "实现并验证", acceptanceCriteria: ["行为正确"], acceptedSequence: 0 },
                        ],
                    },
                    currentStage: {
                        stageId: "stage-2",
                        revision: 1,
                        status: "accepted",
                        target: "实现并验证",
                        acceptanceCriteria: ["行为正确"],
                        acceptedSequence: 0,
                    },
                },
            },
        };
        await backingStore.save(initial);
        const store: GoalStore = {
            restore: (goalId) => backingStore.restore(goalId),
            save: async (goal) => {
                if (goal.state.run.currentStage?.latestReviewRejection !== undefined) {
                    throw new Error("rejection checkpoint failed");
                }
                await backingStore.save(goal);
            },
        };
        const ref = { goalId: initial.id, runId: initial.state.run.id };
        const executor: StepExecutor = {
            async decide() {
                return { kind: "decision", decision: { kind: "complete", summary: "Incomplete delivery", completionEvidence: [] } };
            },
            async think() { throw new Error("Unexpected Think"); },
            async reviewCompletion() { return { kind: "reject", feedback: "缺少最终建议" }; },
        };
        await assert.rejects(new Runner({ store, trajectoryStore, executor }).run(ref), /rejection checkpoint failed/);

        const unchanged = await backingStore.restore(initial.id);
        assert.ok(unchanged);
        assert.equal(unchanged.state.run.currentStage?.status, "accepted");
        assert.equal(unchanged.state.run.currentStage?.latestReviewRejection, undefined);
        assert.equal(unchanged.state.run.planRoute?.nextStageIndex, 2);
        assert.deepEqual(unchanged.state.run.planRoute?.stages.map(({ status }) => status), ["accepted", "accepted"]);
        const unchangedBoundary = unchanged.state.run.committedThroughSequence;
        const eventsAfterFailure = await trajectoryStore.read(ref);
        assert.equal(eventsAfterFailure.some((event) => event.eventType === "run_stage_rejected"), true);
        assert.equal(eventsAfterFailure.some((event) => event.eventType === "run_stage_rejected"
            && event.sequence > unchangedBoundary), true);

        const recovered = await new Runner({
            store: backingStore,
            trajectoryStore,
            executor: {
                async decide() {
                    return { kind: "decision", decision: { kind: "complete", summary: "Final delivery", completionEvidence: [] } };
                },
                async think() { throw new Error("Unexpected Think"); },
                async reviewCompletion() { return { kind: "accept" }; },
            },
        }).run(ref);
        assert.equal(recovered.ok, true);
        if (!recovered.ok) return;
        assert.equal(recovered.state.status, "completed");
    } finally {
        await rm(goalDirectory, { recursive: true, force: true });
        await rm(directory, { recursive: true, force: true });
    }
});

test("Snapshot 已保存但 marker 失败时以已保存的重开状态恢复", async () => {
    const goalDirectory = await mkdtemp(join(tmpdir(), "lazygoal-plan-review-marker-"));
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-plan-review-marker-trajectory-"));
    try {
        const backingStore = new JsonFileGoalStore(goalDirectory);
        const backingTrajectory = new JsonFileTrajectoryStore(directory);
        const created = planGoal("plan-review-marker-failure", "run-plan-review-marker-failure");
        const initial: Goal = {
            ...created,
            state: {
                ...created.state,
                run: {
                    ...created.state.run,
                    status: "running",
                    approvedTask: { objective: "完成分阶段交付", completionCriteria: [] },
                    planRoute: {
                        revision: 1,
                        nextStageIndex: 2,
                        nextStageOrdinal: 3,
                        stages: [
                            { stageId: "stage-1", revision: 1, status: "accepted", target: "调查现状", acceptanceCriteria: ["定位缺口"], acceptedSequence: 0 },
                            { stageId: "stage-2", revision: 1, status: "accepted", target: "实现并验证", acceptanceCriteria: ["行为正确"], acceptedSequence: 0 },
                        ],
                    },
                    currentStage: {
                        stageId: "stage-2",
                        revision: 1,
                        status: "accepted",
                        target: "实现并验证",
                        acceptanceCriteria: ["行为正确"],
                        acceptedSequence: 0,
                    },
                },
            },
        };
        await backingStore.save(initial);
        let markers = 0;
        const trajectoryStore: TrajectoryStore = {
            append(draft: TrajectoryEventDraft) {
                if (draft.eventType === "state_committed") {
                    markers += 1;
                    if (markers === 2) {
                        return Promise.reject(new Error("marker unavailable"));
                    }
                }
                return backingTrajectory.append(draft);
            },
            read(query: TrajectoryReadQuery) {
                return backingTrajectory.read(query);
            },
            readWithBoundary(query: TrajectoryReadQuery, boundary: number): Promise<TrajectoryReadResult> {
                return backingTrajectory.readWithBoundary(query, boundary);
            },
        };
        const ref = { goalId: initial.id, runId: initial.state.run.id };
        const executor: StepExecutor = {
            async decide() {
                return { kind: "decision", decision: { kind: "complete", summary: "Incomplete delivery", completionEvidence: [] } };
            },
            async think() { throw new Error("Unexpected Think"); },
            async reviewCompletion() { return { kind: "reject", feedback: "缺少最终建议" }; },
        };
        await assert.rejects(new Runner({ store: backingStore, trajectoryStore, executor }).run(ref), /marker unavailable/);

        const saved = await backingStore.restore(initial.id);
        assert.ok(saved);
        assert.equal(saved.state.run.status, "running");
        assert.equal(saved.state.run.currentStage?.status, "executing");
        assert.equal(saved.state.run.currentStage?.acceptedSequence, undefined);
        assert.equal(saved.state.run.planRoute?.nextStageIndex, 1);
        assert.deepEqual(saved.state.run.planRoute?.stages.map(({ status }) => status), ["accepted", "executing"]);
        assert.equal(saved.state.run.planRoute?.stages[1]?.acceptedSequence, undefined);

        let recoveredCalls = 0;
        await assert.rejects(new Runner({
            store: backingStore,
            trajectoryStore: backingTrajectory,
            executor: {
                async decide() {
                    recoveredCalls += 1;
                    if (recoveredCalls > 1) throw new ExecutionAbortedError();
                    return { kind: "decision", decision: { kind: "run_stage_complete", stageId: "stage-2", summary: "修订后的交付" } };
                },
                async think() { throw new Error("Unexpected Think"); },
                async reviewCompletion() { return { kind: "accept" }; },
            },
        }).run(ref), ExecutionAbortedError);
        assert.equal(recoveredCalls, 2);
        const reaccepted = await backingStore.restore(initial.id);
        assert.ok(reaccepted);
        assert.equal(reaccepted.state.run.status, "running");
        assert.equal(reaccepted.state.run.planRoute?.nextStageIndex, 2);
        assert.equal(reaccepted.state.run.currentStage?.status, "accepted");

        const completed = await new Runner({
            store: backingStore,
            trajectoryStore: backingTrajectory,
            executor: {
                async decide() {
                    return { kind: "decision", decision: { kind: "complete", summary: "Final delivery", completionEvidence: [] } };
                },
                async think() { throw new Error("Unexpected Think"); },
                async reviewCompletion() { return { kind: "accept" }; },
            },
        }).run(ref);
        assert.equal(completed.ok, true);
        if (!completed.ok) return;
        assert.equal(completed.state.status, "completed");
    } finally {
        await rm(goalDirectory, { recursive: true, force: true });
        await rm(directory, { recursive: true, force: true });
    }
});
