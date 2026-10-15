import assert from "node:assert/strict";
import { test } from "node:test";
import { createGoal, type Goal } from "../../runtime/src/index";
import { goalSnapshotCodec } from "../src/goal-snapshot-codec";
import type { GoalSnapshotV1 } from "../src/goal-snapshot";

const currentProtocols = {
    memoryProtocol: { kind: "structured" as const, version: 1 as const },
    modelContextProtocol: { kind: "trajectory-layered" as const, version: 1 as const },
    contextRetrievalProtocol: { kind: "bm25-lite" as const, version: 1 as const },
};

test("Plan Run route roundtrips with the current stage cursor and accepted evidence", () => {
    const goal = createGoal({
        ...currentProtocols,
        id: "goal-plan-route",
        runId: "run-plan-route",
        intent: "执行多阶段任务",
        promptBundleVersion: 1,
        profile: { id: "test", systemPrompt: "test", instructions: [], toolIds: [] },
    });
    const withRoute: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                mode: "plan",
                approvedTask: { objective: "执行多阶段任务", completionCriteria: [{ text: "所有阶段完成" }] },
                committedThroughSequence: 12,
                planRoute: {
                    revision: 2,
                    revisionReason: "初步调查发现需要增加兼容性检查",
                    nextStageIndex: 1,
                    nextStageOrdinal: 3,
                    stages: [
                        { stageId: "stage-1", revision: 1, status: "accepted", target: "调查", acceptanceCriteria: ["找到入口"], acceptedSequence: 12 },
                        { stageId: "stage-2", revision: 1, status: "pending", target: "实现", acceptanceCriteria: ["验证通过"] },
                    ],
                },
            },
        },
    };

    const decoded = goalSnapshotCodec.decode(goalSnapshotCodec.encode(withRoute));
    assert.deepEqual(decoded.state.run.planRoute, withRoute.state.run.planRoute);
    assert.equal(decoded.state.run.currentStage, undefined);
    assert.deepEqual(decoded.state.goalPlan, withRoute.state.goalPlan);

    const normal = goalSnapshotCodec.decode(goalSnapshotCodec.encode(goal));
    assert.equal(normal.state.run.planRoute, undefined);
});

test("Snapshot rejects a full route on a normal Run and an invalid route cursor", () => {
    const goal = createGoal({
        ...currentProtocols,
        id: "goal-invalid-plan-route",
        runId: "run-invalid-plan-route",
        intent: "验证路线边界",
        promptBundleVersion: 1,
        profile: { id: "test", systemPrompt: "test", instructions: [], toolIds: [] },
    });
    const planRun = {
        ...goal.state.run,
        mode: "plan" as const,
        approvedTask: { objective: "验证路线边界", completionCriteria: [{ text: "路线合法" }] },
        planRoute: {
            revision: 1,
            nextStageIndex: 0,
            nextStageOrdinal: 2,
            stages: [{ stageId: "stage-1", revision: 1, status: "pending" as const, target: "调查", acceptanceCriteria: ["完成"] }],
        },
    };
    const snapshot = goalSnapshotCodec.encode({ ...goal, state: { ...goal.state, run: planRun } });
    const normalWithRoute: GoalSnapshotV1 = {
        ...snapshot,
        state: { ...snapshot.state, run: { ...snapshot.state.run, mode: "normal" } },
    };
    assert.throws(() => goalSnapshotCodec.decode(normalWithRoute));

    const validRoute = snapshot.state.run.planRoute!;
    const invalidCursor: GoalSnapshotV1 = {
        ...snapshot,
        state: { ...snapshot.state, run: { ...snapshot.state.run, planRoute: { ...validRoute, nextStageIndex: 2 } } },
    };
    assert.throws(() => goalSnapshotCodec.decode(invalidCursor));

    const skippedStage: GoalSnapshotV1 = {
        ...snapshot,
        state: {
            ...snapshot.state,
            run: {
                ...snapshot.state.run,
                planRoute: {
                    ...validRoute,
                    stages: validRoute.stages.map((stage) => ({ ...stage, status: "accepted" as const })),
                },
            },
        },
    };
    assert.throws(() => goalSnapshotCodec.decode(skippedStage));

    const unapprovedRoute: GoalSnapshotV1 = {
        ...snapshot,
        state: { ...snapshot.state, run: { ...snapshot.state.run, approvedTask: undefined } },
    };
    assert.throws(() => goalSnapshotCodec.decode(unapprovedRoute));

    const uncommittedAcceptance: GoalSnapshotV1 = {
        ...snapshot,
        state: {
            ...snapshot.state,
            run: {
                ...snapshot.state.run,
                planRoute: {
                    ...validRoute,
                    nextStageIndex: 1,
                    stages: validRoute.stages.map((stage) => ({
                        ...stage,
                        status: "accepted" as const,
                        acceptedSequence: 1,
                    })),
                },
            },
        },
    };
    assert.throws(() => goalSnapshotCodec.decode(uncommittedAcceptance));
});
