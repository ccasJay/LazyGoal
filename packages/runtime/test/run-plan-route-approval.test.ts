import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    type AgentDecision,
    type GoalStore,
    type StepExecutionInput,
} from "../src/index";
import { InMemoryGoalStore, goalSnapshotCodec } from "../../storage/src/index";
import { InMemoryToolRegistry } from "../../tool-core/src/index";
import { BaseTestStepExecutor, currentProtocols, trajectoryStoreFor } from "./current-fixtures";

class RouteExpansionExecutor extends BaseTestStepExecutor {
    private index: number;

    constructor(initialIndex = 0) {
        super();
        this.index = initialIndex;
    }

    get callCount(): number {
        return this.index;
    }

    async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
        this.index += 1;
        if (this.index === 1) return {
            kind: "task_proposal",
            task: { objective: "处理已批准范围内的修复", completionCriteria: [] },
            planRoute: { stages: [{ target: "完成修复", acceptanceCriteria: ["行为正确"] }] },
            approvalRequest: "请批准当前任务路线。",
        };
        if (this.index === 2) return {
            kind: "run_stage_update",
            target: "完成修复",
            acceptanceCriteria: ["行为正确"],
        };
        if (this.index === 3) return {
            kind: "run_plan_route_update",
            baseRevision: 1,
            reason: "调查发现用户要求还需要单独兼容性报告",
            route: { stages: [
                { target: "完成修复", acceptanceCriteria: ["行为正确"] },
                { target: "编写兼容性报告", acceptanceCriteria: ["报告覆盖受影响调用方"] },
            ] },
            approvalRequest: "兼容性报告扩大了原承诺，请决定是否加入本次任务。",
        };

        const route = goal.state.run.planRoute;
        assert.ok(route);
        if (this.index === 4) {
            assert.equal(route.revision, goal.state.messages.some((message) =>
                message.role === "user" && message.content.includes("Approve revised route")) ? 2 : 1);
            assert.equal(route.stages.length, route.revision === 2 ? 2 : 1);
            return {
                kind: "run_stage_complete",
                stageId: "stage-1",
                summary: "修复完成",
                evidenceSequences: [],
            };
        }
        const currentStage = goal.state.run.currentStage;
        if (route.nextStageIndex < route.stages.length && currentStage?.status === "accepted") {
            const next = route.stages[route.nextStageIndex]!;
            return { kind: "run_stage_update", target: next.target, acceptanceCriteria: next.acceptanceCriteria };
        }
        if (currentStage?.status === "executing") {
            return {
                kind: "run_stage_complete",
                stageId: currentStage.stageId,
                summary: `${currentStage.target} 完成`,
                evidenceSequences: [],
            };
        }
        assert.equal(route.nextStageIndex, route.stages.length);
        return { kind: "complete", summary: "任务完成", completionEvidence: [] };
    }
}

async function createRouteExpansionRig() {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const goal = createGoal({
        ...currentProtocols,
        id: "plan-route-approval",
        runId: "run-plan-route-approval",
        intent: "处理已批准范围内的修复",
        promptBundleVersion: 1,
        profile: { id: "plan-route-approval", systemPrompt: "Plan", instructions: [], toolIds: [] },
        mode: "plan",
    });
    await store.save(goal);
    const registry = new InMemoryToolRegistry([]);
    const runner = new Runner({ store, trajectoryStore: trajectory, executor: new RouteExpansionExecutor(), toolRegistry: registry });
    const coordinator = new GoalCoordinator({ store, trajectoryStore: trajectory, toolRegistry: registry, scheduler: new InlineScheduler(runner) });
    return { store, trajectory, goal, runner, coordinator, ref: { goalId: goal.id, runId: goal.state.run.id } };
}

test("范围扩展先等待用户决定；批准后原子修订路线并在同一 Run 继续", async () => {
    const { store, trajectory, goal, coordinator, ref } = await createRouteExpansionRig();
    const proposed = await coordinator.advance(ref);
    assert.equal(proposed.ok, true);
    if (!proposed.ok || proposed.kind !== "waiting" || proposed.goal.state.run.pendingInteraction?.kind !== "task_approval") {
        assert.fail("Expected initial task approval");
    }
    const taskApproval = proposed.goal.state.run.pendingInteraction;
    const waiting = await coordinator.resume({
        ref,
        action: { kind: "approve_task", requestId: taskApproval.requestId },
    });
    assert.equal(waiting.ok, true);
    if (!waiting.ok || waiting.kind !== "waiting" || waiting.goal.state.run.pendingInteraction?.kind !== "ask_user") {
        assert.fail("Expected route expansion approval wait");
    }
    const pending = waiting.goal.state.run.pendingInteraction;
    assert.equal(pending.routeRevision?.baseRevision, 1);
    assert.equal(pending.routeRevision?.reason, "调查发现用户要求还需要单独兼容性报告");
    assert.equal(pending.routeRevision?.candidate.stages.length, 2);
    assert.equal(waiting.goal.state.run.planRoute?.revision, 1, "candidate must not mutate the approved route before the user decision");
    assert.equal(waiting.goal.state.run.planRoute?.stages.length, 1);

    const restored = goalSnapshotCodec.decode(goalSnapshotCodec.encode(waiting.goal));
    assert.deepEqual(restored.state.run.pendingInteraction, pending);

    const restoredExecutor = new RouteExpansionExecutor(3);
    const registry = new InMemoryToolRegistry([]);
    const restoredRunner = new Runner({ store, trajectoryStore: trajectory, executor: restoredExecutor, toolRegistry: registry });
    const restoredCoordinator = new GoalCoordinator({ store, trajectoryStore: trajectory, toolRegistry: registry, scheduler: new InlineScheduler(restoredRunner) });
    const completed = await restoredCoordinator.resume({
        ref,
        action: { kind: "answer_ask_user", requestId: pending.requestId, answers: [{ questionId: "q-1", optionIds: [pending.routeRevision!.approvalOptionId] }] },
    });
    assert.equal(completed.ok, true);
    if (!completed.ok || completed.kind !== "terminal") assert.fail("Expected execution to finish after route approval");
    assert.equal(completed.goal.state.run.id, ref.runId);
    assert.equal(completed.goal.state.run.planRoute?.revision, 2);
    assert.equal(completed.goal.state.run.planRoute?.revisionReason, "调查发现用户要求还需要单独兼容性报告");
    assert.deepEqual(completed.goal.state.run.planRoute?.stages.map((stage) => stage.status), ["accepted", "accepted"]);
    assert.equal(completed.goal.state.goalPlan, undefined);
    const events = await trajectory.read(ref);
    assert.equal(events.filter((event) => event.eventType === "run_plan_route_revised").length, 1);
    assert.equal(events.filter((event) => event.eventType === "task_approved").length, 1);
    assert.equal((await store.restore(goal.id))?.state.run.planRoute?.revision, 2);
});

test("用户拒绝路线扩展时保留原路线并继续其余获批工作", async () => {
    const { store, trajectory, goal, coordinator, ref } = await createRouteExpansionRig();
    const proposed = await coordinator.advance(ref);
    if (!proposed.ok || proposed.kind !== "waiting" || proposed.goal.state.run.pendingInteraction?.kind !== "task_approval") {
        assert.fail("Expected initial task approval");
    }
    const waiting = await coordinator.resume({
        ref,
        action: { kind: "approve_task", requestId: proposed.goal.state.run.pendingInteraction.requestId },
    });
    if (!waiting.ok || waiting.kind !== "waiting" || waiting.goal.state.run.pendingInteraction?.kind !== "ask_user") {
        assert.fail("Expected route expansion approval wait");
    }
    const pending = waiting.goal.state.run.pendingInteraction;
    const completed = await coordinator.resume({
        ref,
        action: { kind: "answer_ask_user", requestId: pending.requestId, answers: [{ questionId: "q-1", optionIds: ["o-2"] }] },
    });
    assert.equal(completed.ok, true);
    if (!completed.ok || completed.kind !== "terminal") assert.fail("Expected existing route to finish");
    assert.equal(completed.goal.state.run.planRoute?.revision, 1);
    assert.equal(completed.goal.state.run.planRoute?.stages.length, 1);
    assert.equal((await store.restore(goal.id))?.state.run.planRoute?.revision, 1);
    assert.equal((await trajectory.read(ref)).filter((event) => event.eventType === "run_plan_route_revised").length, 0);
});

test("路线修订审批检查点失败时不开始后续阶段", async () => {
    const backingStore = new InMemoryGoalStore();
    let failRevisionSave = false;
    const store: GoalStore = {
        restore: (goalId) => backingStore.restore(goalId),
        save: async (goal) => {
            if (failRevisionSave && goal.state.run.planRoute?.revision === 2) {
                throw new Error("route revision checkpoint failed");
            }
            await backingStore.save(goal);
        },
    };
    const trajectory = trajectoryStoreFor(backingStore);
    const goal = createGoal({
        ...currentProtocols,
        id: "plan-route-revision-checkpoint-failure",
        runId: "run-plan-route-revision-checkpoint-failure",
        intent: "处理已批准范围内的修复",
        promptBundleVersion: 1,
        profile: { id: "route-revision-checkpoint", systemPrompt: "Plan", instructions: [], toolIds: [] },
        mode: "plan",
    });
    await store.save(goal);
    const executor = new RouteExpansionExecutor();
    const registry = new InMemoryToolRegistry([]);
    const runner = new Runner({ store, trajectoryStore: trajectory, executor, toolRegistry: registry });
    const coordinator = new GoalCoordinator({ store, trajectoryStore: trajectory, toolRegistry: registry, scheduler: new InlineScheduler(runner) });
    const ref = { goalId: goal.id, runId: goal.state.run.id };
    const proposed = await coordinator.advance(ref);
    if (!proposed.ok || proposed.kind !== "waiting" || proposed.goal.state.run.pendingInteraction?.kind !== "task_approval") {
        assert.fail("Expected initial task approval");
    }
    const routeApproval = await coordinator.resume({
        ref,
        action: { kind: "approve_task", requestId: proposed.goal.state.run.pendingInteraction.requestId },
    });
    if (!routeApproval.ok || routeApproval.kind !== "waiting" || routeApproval.goal.state.run.pendingInteraction?.kind !== "ask_user") {
        assert.fail("Expected route revision approval wait");
    }
    const pending = routeApproval.goal.state.run.pendingInteraction;
    assert.equal(executor.callCount, 3);
    failRevisionSave = true;
    await assert.rejects(coordinator.resume({
        ref,
        action: { kind: "answer_ask_user", requestId: pending.requestId, answers: [{ questionId: "q-1", optionIds: ["o-1"] }] },
    }), /route revision checkpoint failed/);
    assert.equal(executor.callCount, 3, "no model/tool action may follow a failed route revision checkpoint");
    const unchanged = await backingStore.restore(goal.id);
    assert.equal(unchanged?.state.run.planRoute?.revision, 1);
    assert.equal(unchanged?.state.run.pendingInteraction?.kind, "ask_user");
});

test("路线审批等待中的停止不批准候选，迟到的批准与整体回复都不再生效", async () => {
    const { store, runner, coordinator, ref } = await createRouteExpansionRig();
    const proposed = await coordinator.advance(ref);
    assert.equal(proposed.ok, true);
    if (!proposed.ok || proposed.kind !== "waiting" || proposed.goal.state.run.pendingInteraction?.kind !== "task_approval") {
        assert.fail("Expected initial task approval");
    }
    const taskApproval = proposed.goal.state.run.pendingInteraction;
    const waiting = await coordinator.resume({
        ref,
        action: { kind: "approve_task", requestId: taskApproval.requestId },
    });
    assert.equal(waiting.ok, true);
    if (!waiting.ok || waiting.kind !== "waiting" || waiting.goal.state.run.pendingInteraction?.kind !== "ask_user") {
        assert.fail("Expected route expansion approval wait");
    }
    const pending = waiting.goal.state.run.pendingInteraction;
    const approvalOptionId = pending.routeRevision!.approvalOptionId;

    const interrupted = await runner.interrupt(ref, "interrupt-route-approval");
    assert.equal(interrupted.ok, true);
    await runner.runUntilBlocked(ref).catch(() => undefined);

    const afterInterrupt = (await store.restore(ref.goalId))!;
    assert.equal(afterInterrupt.state.run.pendingInteraction, undefined, "被停止的路线审批等待立即失效");
    assert.equal(afterInterrupt.state.run.planRoute?.revision, 1, "候选路线不因停止被批准");
    assert.equal(afterInterrupt.state.run.status, "cancelled");

    for (const action of [
        { kind: "answer_ask_user" as const, requestId: pending.requestId, answers: [{ questionId: pending.questions[0]!.id, optionIds: [approvalOptionId] }] },
        { kind: "reply_to_question" as const, requestId: pending.requestId, content: "我批准扩展后的路线" },
        { kind: "skip_question" as const, requestId: pending.requestId },
    ]) {
        const late = await coordinator.resume({ ref, action });
        assert.equal(late.ok, false, "停止后旧路线审批引用不可复活");
    }
    const final = (await store.restore(ref.goalId))!;
    assert.equal(final.state.run.planRoute?.revision, 1);
    assert.equal(final.state.run.status, "cancelled");
    assert.deepEqual(final.state.run.pendingInteraction, undefined);
});
