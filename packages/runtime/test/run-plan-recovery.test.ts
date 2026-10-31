import assert from "node:assert/strict";
import { test } from "node:test";
import { ExecutionAbortedError } from "../../execution-control/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { createToolRegistration, InMemoryToolRegistry } from "../../tool-core/src/index";
import {
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    type AgentDecision,
    type GoalStore,
    type StepExecutionInput,
} from "../src/index";
import { BaseTestStepExecutor, currentProtocols, trajectoryStoreFor } from "./current-fixtures";
import { createTestBinding, objectInputSchema, openObjectSchema, sandboxCommandSchema } from "../../tool-core/test/binding-fixtures";
import { createTestToolRegistration } from "../../tool-core/test/helpers";

class InterruptAfterFirstAcceptedStage extends BaseTestStepExecutor {
    private index = 0;

    async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
        this.index += 1;
        if (this.index === 1) return {
            kind: "task_proposal",
            task: { objective: "完成分阶段执行", completionCriteria: [] },
            planRoute: { stages: [
                { target: "完成阶段一", acceptanceCriteria: ["产生一次验证记录"] },
                { target: "完成阶段二", acceptanceCriteria: ["完成最终验证"] },
            ] },
            approvalRequest: "请批准完整路线。",
        };
        if (this.index === 2) return {
            kind: "run_stage_update",
            target: "完成阶段一",
            acceptanceCriteria: ["产生一次验证记录"],
        };
        if (this.index === 3) return {
            kind: "tool_call",
            action: { actionId: "route-recovery-side-effect", toolId: "record_once", input: {} },
        };
        if (this.index === 4) return {
            kind: "run_stage_complete",
            stageId: "stage-1",
            summary: "阶段一完成",
            evidenceSequences: [],
        };
        assert.equal(goal.state.run.planRoute?.stages[0]?.status, "accepted");
        assert.equal(goal.state.run.planRoute?.nextStageIndex, 1);
        throw new ExecutionAbortedError();
    }
}

class FinishRestoredRoute extends BaseTestStepExecutor {
    private index = 0;

    async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
        this.index += 1;
        assert.equal(goal.state.run.approvedTask?.objective, "完成分阶段执行");
        assert.equal(goal.state.run.pendingInteraction, undefined, "restoration must not request task approval again");
        if (this.index === 1) {
            assert.equal(goal.state.run.currentStage?.stageId, "stage-1");
            assert.equal(goal.state.run.currentStage?.status, "accepted");
            assert.equal(goal.state.run.planRoute?.nextStageIndex, 1);
            assert.equal(goal.state.run.planRoute?.stages[0]?.status, "accepted");
            return {
                kind: "run_stage_update",
                target: "完成阶段二",
                acceptanceCriteria: ["完成最终验证"],
            };
        }
        if (this.index === 2) {
            assert.equal(goal.state.run.currentStage?.stageId, "stage-2");
            assert.equal(goal.state.run.currentStage?.status, "executing");
            assert.equal(goal.state.run.planRoute?.nextStageIndex, 1);
            assert.deepEqual(goal.state.run.planRoute?.stages.map(({ status }) => status), ["accepted", "executing"]);
            return {
            kind: "run_stage_complete",
            stageId: "stage-2",
            summary: "阶段二完成",
            evidenceSequences: [],
            };
        }
        assert.equal(goal.state.run.status, "running");
        assert.equal(goal.state.run.currentStage?.stageId, "stage-2");
        assert.equal(goal.state.run.currentStage?.status, "accepted");
        assert.equal(goal.state.run.planRoute?.nextStageIndex, 2);
        assert.deepEqual(goal.state.run.planRoute?.stages.map(({ status }) => status), ["accepted", "accepted"]);
        return { kind: "complete", summary: "完成", completionEvidence: [] };
    }
}

test("恢复已批准路线从下一个待执行阶段继续，且不重放已接受阶段副作用", async () => {
    const backingStore = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(backingStore);
    let recorded = 0;
    const tool = createTestToolRegistration({
        definition: { id: "record_once", description: "Record one durable side effect", inputBinding: createTestBinding("test.fixture", objectInputSchema()), isReadOnly: true },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() { recorded += 1; return { kind: "success", output: "recorded", summary: "recorded" }; },
    });
    const registry = new InMemoryToolRegistry([tool]);
    const goal = createGoal({
        ...currentProtocols,
        id: "plan-route-recovery",
        runId: "run-plan-route-recovery",
        intent: "完成分阶段执行",
        promptBundleVersion: 1,
        profile: { id: "plan-route-recovery", systemPrompt: "Plan", instructions: [], toolIds: ["record_once"] },
        mode: "plan",
    });
    await backingStore.save({
        ...goal,
        state: { ...goal.state, run: { ...goal.state.run, exposedToolIds: ["record_once"] } },
    });
    const runner1 = new Runner({ store: backingStore, trajectoryStore: trajectory, executor: new InterruptAfterFirstAcceptedStage(), toolRegistry: registry });
    const coordinator1 = new GoalCoordinator({ store: backingStore, trajectoryStore: trajectory, toolRegistry: registry, scheduler: new InlineScheduler(runner1) });
    const ref = { goalId: goal.id, runId: goal.state.run.id };

    const proposed = await coordinator1.advance(ref);
    assert.equal(proposed.ok, true);
    if (!proposed.ok || proposed.kind !== "waiting") assert.fail("Expected approval wait");
    const pending = proposed.goal.state.run.pendingInteraction;
    if (pending?.kind !== "task_approval") assert.fail("Expected task approval");
    await assert.rejects(
        coordinator1.resume({ ref, action: { kind: "approve_task", requestId: pending.requestId } }),
        ExecutionAbortedError,
    );
    assert.equal(recorded, 1);

    const restored = await backingStore.restore(goal.id);
    assert.equal(restored?.state.run.status, "running");
    assert.equal(restored?.state.run.pendingInteraction, undefined);
    assert.equal(restored?.state.run.planRoute?.nextStageIndex, 1);
    assert.deepEqual(restored?.state.run.planRoute?.stages.map(({ status }) => status), ["accepted", "pending"]);
    assert.equal(restored?.state.run.currentStage?.stageId, "stage-1");
    assert.equal(restored?.state.run.currentStage?.status, "accepted");

    const runner2 = new Runner({ store: backingStore, trajectoryStore: trajectory, executor: new FinishRestoredRoute(), toolRegistry: registry });
    const coordinator2 = new GoalCoordinator({ store: backingStore, trajectoryStore: trajectory, toolRegistry: registry, scheduler: new InlineScheduler(runner2) });
    const resumed = await coordinator2.advance(ref);
    assert.equal(resumed.ok, true);
    if (!resumed.ok || resumed.kind !== "terminal") assert.fail("Expected restored route completion");
    assert.equal(resumed.goal.state.run.status, "completed", JSON.stringify(resumed.goal.state.run));
    assert.equal(recorded, 1, "the committed stage-one side effect must not be replayed");
    assert.equal((await trajectory.read(ref)).filter((event) => event.eventType === "task_approved").length, 1);
});

test("批准路线的 Snapshot 检查点失败时不继续执行工具", async () => {
    const backingStore = new InMemoryGoalStore();
    let failApprovedRouteSave = false;
    const store: GoalStore = {
        restore: (goalId) => backingStore.restore(goalId),
        save: async (value) => {
            if (failApprovedRouteSave && value.state.run.approvedTask !== undefined && value.state.run.planRoute !== undefined) {
                throw new Error("route checkpoint failed");
            }
            await backingStore.save(value);
        },
    };
    const trajectory = trajectoryStoreFor(backingStore);
    let calls = 0;
    let sideEffects = 0;
    class ProposalExecutor extends BaseTestStepExecutor {
        async execute(): Promise<AgentDecision> {
            calls += 1;
            if (calls === 1) return {
                kind: "task_proposal",
                task: { objective: "提交路线后执行", completionCriteria: [] },
                planRoute: { stages: [{ target: "完成任务", acceptanceCriteria: ["执行成功"] }] },
                approvalRequest: "请批准。",
            };
            return { kind: "tool_call", action: { actionId: "should-not-run", toolId: "record_once", input: {} } };
        }
    }
    const registry = new InMemoryToolRegistry([createTestToolRegistration({
        definition: { id: "record_once", description: "Record a side effect", inputBinding: createTestBinding("test.fixture", objectInputSchema()), isReadOnly: false },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() { sideEffects += 1; return { kind: "success", output: "recorded", summary: "recorded" }; },
    })]);
    const goal = createGoal({
        ...currentProtocols,
        id: "plan-route-checkpoint-failure",
        runId: "run-plan-route-checkpoint-failure",
        intent: "提交路线后执行",
        promptBundleVersion: 1,
        profile: { id: "checkpoint-failure", systemPrompt: "Plan", instructions: [], toolIds: ["record_once"] },
        mode: "plan",
    });
    await store.save(goal);
    const runner = new Runner({ store, trajectoryStore: trajectory, executor: new ProposalExecutor(), toolRegistry: registry });
    const coordinator = new GoalCoordinator({ store, trajectoryStore: trajectory, toolRegistry: registry, scheduler: new InlineScheduler(runner) });
    const ref = { goalId: goal.id, runId: goal.state.run.id };
    const proposed = await coordinator.advance(ref);
    assert.equal(proposed.ok, true);
    if (!proposed.ok || proposed.kind !== "waiting") assert.fail("Expected approval wait");
    if (proposed.goal.state.run.pendingInteraction?.kind !== "task_approval") assert.fail("Expected pending task approval");
    const requestId = proposed.goal.state.run.pendingInteraction.requestId;
    const boundary = proposed.goal.state.run.committedThroughSequence;

    failApprovedRouteSave = true;
    await assert.rejects(coordinator.resume({ ref, action: { kind: "approve_task", requestId } }), /route checkpoint failed/);
    assert.equal(calls, 1, "approval checkpoint failure must stop before the next model/tool call");
    assert.equal(sideEffects, 0);
    const unchanged = await backingStore.restore(goal.id);
    assert.equal(unchanged?.state.run.pendingInteraction?.kind, "task_approval");
    assert.equal(unchanged?.state.run.planRoute, undefined);
    assert.equal(unchanged?.state.run.committedThroughSequence, boundary);
});
