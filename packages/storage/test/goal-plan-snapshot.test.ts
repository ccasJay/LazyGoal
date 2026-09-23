import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    type AgentProfile,
    type Goal,
} from "../../runtime/src/index";
import {
    GoalSnapshotProtocolError,
    goalSnapshotCodec,
} from "../src/index";
import {
    assertValidTrajectoryEventDraft,
    classifyTrajectoryEvent,
    type TrajectoryEventDraft,
} from "../../runtime/src/trajectory";

const profile: AgentProfile = {
    id: "profile-plan",
    systemPrompt: "You are a plan agent.",
    instructions: ["维护计划"],
    toolIds: [],
};

function createPlanGoal(): Goal {
    const goal = createGoal({
        id: "goal-plan-snapshot",
        intent: "实现计划快照",
        promptBundleVersion: 1,
        profile,
        runId: "run-plan-current",
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            run: { ...goal.state.run, mode: "plan" },
            goalPlan: {
                revision: 2,
                items: [
                    { id: "todo-1", content: "建立领域模型", position: 0, status: "completed" },
                    { id: "todo-2", content: "接入快照", position: 1, status: "pending" },
                ],
            },
            completedRuns: [{
                runId: "run-plan-previous",
                stepCount: 3,
                committedThroughSequence: 8,
                messageRange: { start: 0, end: 1 },
            }],
        },
    };
}

test("Run mode、independent GoalPlan and completedRuns round-trip", () => {
    const goal = createPlanGoal();
    const encoded = goalSnapshotCodec.encode(goal);
    const decoded = goalSnapshotCodec.decode(encoded);

    assert.equal(encoded.state.run.mode, "plan");
    assert.deepEqual(decoded, goal);
    assert.deepEqual(decoded.state.goalPlan?.items[1], goal.state.goalPlan?.items[1]);
    assert.deepEqual(decoded.state.completedRuns, goal.state.completedRuns);
});

test("Snapshot allows GoalPlan independent of Run mode and rejects invalid Todo structure", () => {
    const encoded = goalSnapshotCodec.encode(createPlanGoal());
    const normalWithPlan = {
        ...structuredClone(encoded),
        state: {
            ...structuredClone(encoded).state,
            run: { ...structuredClone(encoded).state.run, mode: "normal" as const },
        },
    };
    assert.deepEqual(goalSnapshotCodec.decode(normalWithPlan).state.goalPlan, createPlanGoal().state.goalPlan);

    const duplicate = structuredClone(encoded);
    const duplicateItems = duplicate.state.goalPlan!.items as unknown as Array<{
        readonly id: string;
        readonly content: string;
        readonly position: number;
        readonly status: "pending" | "in_progress" | "completed" | "cancelled";
    }>;
    duplicateItems[1] = {
        ...duplicate.state.goalPlan!.items[1]!,
        id: duplicate.state.goalPlan!.items[0]!.id,
    };
    assert.throws(() => goalSnapshotCodec.decode(duplicate), GoalSnapshotProtocolError);
});

test("Trajectory 支持 Plan Mode、GoalPlan 更新和新 Run 事实事件", () => {
    const drafts: readonly TrajectoryEventDraft[] = [
        {
            goalId: "goal-1",
            runId: "run-1",
            phase: "executing",
            eventType: "plan_mode_entered",
            payload: { type: "plan_mode_entered" },
        },
        {
            goalId: "goal-1",
            runId: "run-1",
            phase: "executing",
            eventType: "goal_plan_updated",
            payload: {
                type: "goal_plan_updated",
                revision: 1,
                operations: [{ type: "add", content: "建立模型" }],
            },
        },
        {
            goalId: "goal-1",
            runId: "run-2",
            phase: "executing",
            eventType: "run_created",
            payload: { type: "run_created", mode: "normal" },
        },
    ];
    for (const draft of drafts) assert.doesNotThrow(() => assertValidTrajectoryEventDraft(draft));
    assert.equal(classifyTrajectoryEvent({ eventType: "goal_plan_updated" }), "decision");
    assert.equal(classifyTrajectoryEvent({ eventType: "run_created" }), "lifecycle");
});
