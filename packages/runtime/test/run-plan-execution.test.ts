import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    type AgentDecision,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { InMemoryToolRegistry } from "../../tool-core/src/index";
import { BaseTestStepExecutor, currentProtocols, trajectoryStoreFor } from "./current-fixtures";

class PlannedRouteExecutor extends BaseTestStepExecutor {
    private index = 0;

    async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
        this.index += 1;
        if (this.index === 1) {
            assert.equal(goal.state.run.planRoute, undefined);
            return {
                kind: "task_proposal",
                task: { objective: "完成多阶段工作", completionCriteria: [] },
                planRoute: { stages: [
                    { target: "调查现状", acceptanceCriteria: ["定位需要修改的部分"] },
                    { target: "实现并验证", acceptanceCriteria: ["实现目标行为", "相关验证通过"] },
                ] },
                approvalRequest: "请批准任务和完整阶段路线。",
            };
        }
        const route = goal.state.run.planRoute;
        assert.ok(route, "approved Plan Run must persist its complete route before execution");
        assert.equal(goal.state.goalPlan, undefined);
        if (this.index === 2) {
            assert.equal(goal.state.run.status, "running");
            assert.equal(goal.state.run.currentStage, undefined);
            assert.equal(route.nextStageIndex, 0);
            assert.equal(route.stages[0]?.status, "pending");
            return { kind: "run_stage_update", target: "调查现状", acceptanceCriteria: ["定位需要修改的部分"] };
        }
        if (this.index === 3) {
            assert.equal(goal.state.run.currentStage?.stageId, "stage-1");
            assert.equal(route.nextStageIndex, 0);
            assert.equal(route.stages[0]?.status, "executing");
            return { kind: "run_stage_complete", stageId: "stage-1", summary: "调查完成", evidenceSequences: [] };
        }
        if (this.index === 4) {
            assert.equal(goal.state.run.status, "running", "accepting a middle route stage must not finish the Run");
            assert.equal(goal.state.run.currentStage?.stageId, "stage-1");
            assert.equal(goal.state.run.currentStage?.status, "accepted");
            assert.equal(route.nextStageIndex, 1);
            assert.equal(route.stages[0]?.status, "accepted");
            assert.equal(route.stages[1]?.status, "pending");
            return { kind: "run_stage_update", target: "实现并验证", acceptanceCriteria: ["实现目标行为", "相关验证通过"] };
        }
        if (this.index === 5) {
            assert.equal(goal.state.run.status, "running");
            assert.equal(goal.state.run.currentStage?.stageId, "stage-2");
            assert.equal(route.nextStageIndex, 1);
            assert.equal(route.stages[1]?.status, "executing");
            return { kind: "run_stage_complete", stageId: "stage-2", summary: "实现和验证完成", evidenceSequences: [] };
        }
        assert.equal(goal.state.run.status, "running", "accepting the final phase must still go through final completion review");
        assert.equal(route.nextStageIndex, 2);
        assert.deepEqual(route.stages.map(({ status }) => status), ["accepted", "accepted"]);
        assert.equal(goal.state.run.currentStage?.status, "accepted");
        return { kind: "complete", summary: "全部交付完成", completionEvidence: [] };
    }

}

test("approve_task installs the approved route and advances its stages in order in the same Run", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const goal = createGoal({
        ...currentProtocols,
        id: "plan-route-execution",
        runId: "run-plan-route-execution",
        intent: "完成多阶段工作",
        promptBundleVersion: 1,
        profile: { id: "plan-route", systemPrompt: "Plan", instructions: [], toolIds: [] },
        mode: "plan",
    });
    await store.save(goal);
    const registry = new InMemoryToolRegistry([]);
    const runner = new Runner({ store, trajectoryStore: trajectory, executor: new PlannedRouteExecutor(), toolRegistry: registry });
    const coordinator = new GoalCoordinator({ store, trajectoryStore: trajectory, toolRegistry: registry, scheduler: new InlineScheduler(runner) });
    const ref = { goalId: goal.id, runId: goal.state.run.id };

    const proposed = await coordinator.advance(ref);
    assert.equal(proposed.ok, true);
    if (!proposed.ok || proposed.kind !== "waiting") assert.fail("Expected route proposal approval wait");
    const pending = proposed.goal.state.run.pendingInteraction;
    assert.equal(pending?.kind, "task_approval");
    if (pending?.kind !== "task_approval") return;

    const approved = await coordinator.resume({ ref, action: { kind: "approve_task", requestId: pending.requestId } });
    assert.equal(approved.ok, true);
    if (!approved.ok || approved.kind !== "terminal") assert.fail("Expected final completion after all route stages");

    const finalGoal = await store.restore(goal.id);
    assert.equal(finalGoal?.state.run.id, ref.runId);
    assert.equal(finalGoal?.state.run.status, "completed", JSON.stringify(finalGoal?.state.run));
    assert.deepEqual(finalGoal?.state.run.planRoute?.stages.map(({ status }) => status), ["accepted", "accepted"]);
    assert.equal(finalGoal?.state.run.planRoute?.nextStageIndex, 2);
    assert.equal(finalGoal?.state.goalPlan, undefined);
    const events = await trajectory.read(ref);
    assert.deepEqual(events.filter(({ eventType }) => eventType === "run_stage_declared").map(({ payload }) => (payload as any).stageId), ["stage-1", "stage-2"]);
    assert.deepEqual(events.filter(({ eventType }) => eventType === "run_stage_accepted").map(({ payload }) => (payload as any).stageId), ["stage-1", "stage-2"]);
    assert.equal(events.filter(({ eventType }) => eventType === "task_approved").length, 1);
});

class InScopeRouteRevisionExecutor extends BaseTestStepExecutor {
    private index = 0;

    async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
        this.index += 1;
        if (this.index === 1) return {
            kind: "task_proposal",
            task: { objective: "修复一个连贯交付", completionCriteria: [] },
            planRoute: { stages: [{ target: "定位并修复", acceptanceCriteria: ["行为正确", "回归通过"] }] },
            approvalRequest: "请批准任务和路线。",
        };
        if (this.index === 2) return {
            kind: "run_stage_update",
            target: "定位并修复",
            acceptanceCriteria: ["行为正确", "回归通过"],
        };
        if (this.index === 3) {
            assert.equal(goal.state.run.planRoute?.revision, 1);
            return {
                kind: "run_plan_route_update",
                baseRevision: 1,
                reason: "调查发现修复必须先确认调用边界",
                route: { stages: [{ target: "确认调用边界并修复", acceptanceCriteria: ["边界明确", "行为正确", "回归通过"] }] },
            };
        }
        if (this.index === 4) {
            assert.equal(goal.state.run.planRoute?.revision, 2);
            assert.equal(goal.state.run.planRoute?.revisionReason, "调查发现修复必须先确认调用边界");
            assert.equal(goal.state.run.planRoute?.stages[0]?.target, "确认调用边界并修复");
            assert.equal(goal.state.run.currentStage?.revision, 2);
            assert.equal(goal.state.run.currentStage?.target, "确认调用边界并修复");
            return {
                kind: "run_stage_complete",
                stageId: "stage-1",
                summary: "修复完成并验证通过",
                evidenceSequences: [],
            };
        }
        return { kind: "complete", summary: "修复和回归已完成", completionEvidence: [] };
    }
}

test("获批范围内路线修订记录理由并原子同步活动阶段", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const goal = createGoal({
        ...currentProtocols,
        id: "plan-route-in-scope-revision",
        runId: "run-plan-route-in-scope-revision",
        intent: "修复一个连贯交付",
        promptBundleVersion: 1,
        profile: { id: "plan-route-revision", systemPrompt: "Plan", instructions: [], toolIds: [] },
        mode: "plan",
    });
    await store.save(goal);
    const registry = new InMemoryToolRegistry([]);
    const runner = new Runner({ store, trajectoryStore: trajectory, executor: new InScopeRouteRevisionExecutor(), toolRegistry: registry });
    const coordinator = new GoalCoordinator({ store, trajectoryStore: trajectory, toolRegistry: registry, scheduler: new InlineScheduler(runner) });
    const ref = { goalId: goal.id, runId: goal.state.run.id };
    const proposed = await coordinator.advance(ref);
    assert.equal(proposed.ok, true);
    if (!proposed.ok || proposed.kind !== "waiting" || proposed.goal.state.run.pendingInteraction?.kind !== "task_approval") {
        assert.fail("Expected initial task proposal approval");
    }
    const approved = await coordinator.resume({
        ref,
        action: { kind: "approve_task", requestId: proposed.goal.state.run.pendingInteraction.requestId },
    });
    assert.equal(approved.ok, true);
    if (!approved.ok || approved.kind !== "terminal") assert.fail("Expected route completion");
    assert.equal(approved.goal.state.run.planRoute?.revision, 2);
    assert.equal(approved.goal.state.run.planRoute?.revisionReason, "调查发现修复必须先确认调用边界");
    const events = await trajectory.read(ref);
    assert.equal(events.filter((event) => event.eventType === "run_plan_route_revised").length, 1);
    const revisedEvent = events.find((event) => event.eventType === "run_plan_route_revised");
    assert.equal((revisedEvent?.payload as any).reason, "调查发现修复必须先确认调用边界");
    assert.equal((await store.restore(goal.id))?.state.run.currentStage?.revision, 2);
});
