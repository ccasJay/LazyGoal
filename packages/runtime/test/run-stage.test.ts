import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createInitialRunStage,
    reviseRunStage,
    acceptCurrentRunStage,
    rejectCurrentRunStage,
    RunStageTransitionError,
    type RunStageState,
    type DeclareRunStageInput,
    type ReviseRunStageInput,
} from "../src/run-stage";

test("1.1 & 2.1: Runtime allocates stage identity, revision starts at 1, requires non-empty target and criteria", () => {
    const input: DeclareRunStageInput = {
        target: "梳理模块职责",
        acceptanceCriteria: ["列出所有导出符号", "说明所有权"],
    };
    const stage = createInitialRunStage(input, 1);
    assert.equal(stage.stageId, "stage-1");
    assert.equal(stage.revision, 1);
    assert.equal(stage.status, "executing");
    assert.equal(stage.target, "梳理模块职责");
    assert.deepEqual(stage.acceptanceCriteria, ["列出所有导出符号", "说明所有权"]);
    assert.equal(stage.previousStageResultRef, undefined);
    assert.equal(stage.latestReviewRejection, undefined);

    // 空 target 应当被拒绝
    assert.throws(
        () => createInitialRunStage({ target: "   ", acceptanceCriteria: ["标准 1"] }, 1),
        RunStageTransitionError,
    );
    // 空 acceptanceCriteria 应当被拒绝
    assert.throws(
        () => createInitialRunStage({ target: "目标", acceptanceCriteria: [] }, 1),
        RunStageTransitionError,
    );
    assert.throws(
        () => createInitialRunStage({ target: "目标", acceptanceCriteria: ["   "] }, 1),
        RunStageTransitionError,
    );
});

test("1.3: Creating new stage requires previous stage to be accepted", () => {
    const previousUnaccepted: RunStageState = {
        stageId: "stage-1",
        revision: 1,
        status: "executing",
        target: "第一阶段",
        acceptanceCriteria: ["条件 1"],
    };

    // 前序阶段未接受时开启新阶段必须抛出 RunStageTransitionError
    assert.throws(
        () => createInitialRunStage({ target: "第二阶段", acceptanceCriteria: ["条件 2"] }, 2, previousUnaccepted),
        RunStageTransitionError,
    );

    const previousAccepted: RunStageState = {
        stageId: "stage-1",
        revision: 1,
        status: "accepted",
        target: "第一阶段",
        acceptanceCriteria: ["条件 1"],
        acceptedSequence: 10,
    };

    // 前序阶段已接受时正常创建下一阶段，并记录引用
    const nextStage = createInitialRunStage(
        { target: "第二阶段", acceptanceCriteria: ["条件 2"] },
        2,
        previousAccepted,
    );
    assert.equal(nextStage.stageId, "stage-2");
    assert.equal(nextStage.revision, 1);
    assert.equal(nextStage.status, "executing");
    assert.deepEqual(nextStage.previousStageResultRef, {
        stageId: "stage-1",
        sequence: 10,
    });
});

test("2.2: Stage revision requires valid reason and exact baseRevision match, atomically rejects stale revision", () => {
    const stage: RunStageState = {
        stageId: "stage-1",
        revision: 2,
        status: "executing",
        target: "目标 v2",
        acceptanceCriteria: ["条件 A", "条件 B"],
    };

    // 过期 revision（例如使用 revision 1 修订 revision 2）必须被原子拒绝
    const staleInput: ReviseRunStageInput = {
        stageId: "stage-1",
        baseRevision: 1,
        reason: "补充条件",
        target: "目标 v3",
        acceptanceCriteria: ["条件 A", "条件 B", "条件 C"],
    };
    assert.throws(() => reviseRunStage(stage, staleInput), RunStageTransitionError);

    // stageId 不匹配必须拒绝
    assert.throws(
        () => reviseRunStage(stage, { ...staleInput, baseRevision: 2, stageId: "stage-999" }),
        RunStageTransitionError,
    );

    // 空 reason 必须拒绝
    assert.throws(
        () => reviseRunStage(stage, { ...staleInput, baseRevision: 2, reason: "  " }),
        RunStageTransitionError,
    );

    // 合法修订成功，revision 递增
    const revised = reviseRunStage(stage, {
        stageId: "stage-1",
        baseRevision: 2,
        reason: "因新发现调整目标",
        target: "新目标",
        acceptanceCriteria: ["新条件 1"],
    });
    assert.equal(revised.revision, 3);
    assert.equal(revised.target, "新目标");
    assert.deepEqual(revised.acceptanceCriteria, ["新条件 1"]);
    assert.equal(revised.status, "executing");
});

test("3.2 & 4.1: Review rejection updates latestReviewRejection and keeps executing; review accept marks accepted", () => {
    const stage: RunStageState = {
        stageId: "stage-1",
        revision: 1,
        status: "executing",
        target: "阶段 1",
        acceptanceCriteria: ["条件 1"],
    };

    // 审查拒绝：状态依然为 executing，并记录最新缺口
    const rejected = rejectCurrentRunStage(stage, "缺少必要事实支持", 15);
    assert.equal(rejected.status, "executing");
    assert.equal(rejected.revision, 1);
    assert.deepEqual(rejected.latestReviewRejection, {
        feedback: "缺少必要事实支持",
        rejectedAtSequence: 15,
    });

    // 拒绝后修订：依然保留历史拒绝信息或更新修订
    const revisedAfterReject = reviseRunStage(rejected, {
        stageId: "stage-1",
        baseRevision: 1,
        reason: "根据审查反馈调整条件",
        target: "阶段 1 修订",
        acceptanceCriteria: ["条件 1 细化"],
    });
    assert.equal(revisedAfterReject.revision, 2);
    // 审查拒绝缺口在修订后仍可保留以备核对
    assert.deepEqual(revisedAfterReject.latestReviewRejection, {
        feedback: "缺少必要事实支持",
        rejectedAtSequence: 15,
    });

    // 审查接受：状态标记为 accepted，并记录 acceptedSequence，清除 latestReviewRejection
    const accepted = acceptCurrentRunStage(revisedAfterReject, 20);
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.acceptedSequence, 20);
    assert.equal(accepted.latestReviewRejection, undefined);

    // 对已 accepted 阶段不能再拒绝或修订
    assert.throws(() => rejectCurrentRunStage(accepted, "无效", 21), RunStageTransitionError);
    assert.throws(
        () => reviseRunStage(accepted, {
            stageId: "stage-1",
            baseRevision: 2,
            reason: "再改",
            target: "改",
            acceptanceCriteria: ["改"],
        }),
        RunStageTransitionError,
    );
});
