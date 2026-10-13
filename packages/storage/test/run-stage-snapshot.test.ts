import assert from "node:assert/strict";
import { test } from "node:test";
import {
    goalSnapshotCodec,
} from "../src/goal-snapshot-codec";
import type { GoalSnapshotV1 } from "../src/goal-snapshot";
import type { Goal } from "../../runtime/src/domain";
import { createGoal } from "../../runtime/src/index";

const currentProtocols = {
    memoryProtocol: { kind: "structured" as const, version: 1 as const },
    modelContextProtocol: { kind: "trajectory-layered" as const, version: 1 as const },
    contextRetrievalProtocol: { kind: "bm25-lite" as const, version: 1 as const },
};

test("6.1: RunStageState roundtrip in Snapshot preserves stage identity, revision, rejection, and previous refs", () => {
    const goal = createGoal({
        ...currentProtocols,
        id: "goal-stage-test",
        runId: "run-stage-1",
        intent: "完成阶段化任务",
        promptBundleVersion: 1,
        profile: { id: "test", systemPrompt: "test", instructions: [], toolIds: [] },
    });

    // 附带阶段状态的 Goal
    const goalWithStage: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                currentStage: {
                    stageId: "stage-2",
                    revision: 3,
                    status: "executing",
                    target: "实现存储往返",
                    acceptanceCriteria: ["测试通过", "覆盖边界"],
                    previousStageResultRef: {
                        stageId: "stage-1",
                        sequence: 12,
                    },
                    latestReviewRejection: {
                        feedback: "缺少错误覆盖",
                        rejectedAtSequence: 18,
                    },
                },
            },
        },
    };

    const encoded = goalSnapshotCodec.encode(goalWithStage);
    const decoded = goalSnapshotCodec.decode(encoded);

    assert.equal(decoded.state.run.currentStage?.stageId, "stage-2");
    assert.equal(decoded.state.run.currentStage?.revision, 3);
    assert.equal(decoded.state.run.currentStage?.status, "executing");
    assert.equal(decoded.state.run.currentStage?.target, "实现存储往返");
    assert.deepEqual(decoded.state.run.currentStage?.acceptanceCriteria, ["测试通过", "覆盖边界"]);
    assert.deepEqual(decoded.state.run.currentStage?.previousStageResultRef, {
        stageId: "stage-1",
        sequence: 12,
    });
    assert.deepEqual(decoded.state.run.currentStage?.latestReviewRejection, {
        feedback: "缺少错误覆盖",
        rejectedAtSequence: 18,
    });
});

test("6.1: Snapshot without currentStage roundtrips safely as undefined", () => {
    const goal = createGoal({
        ...currentProtocols,
        id: "goal-no-stage",
        runId: "run-1",
        intent: "无阶段任务",
        promptBundleVersion: 1,
        profile: { id: "test", systemPrompt: "test", instructions: [], toolIds: [] },
    });

    const encoded = goalSnapshotCodec.encode(goal);
    const decoded = goalSnapshotCodec.decode(encoded);

    assert.equal(decoded.state.run.currentStage, undefined);
});
