import assert from "node:assert/strict";
import { test } from "node:test";
import {
    acceptRunPlanStage,
    activateRunPlanStage,
    createRunPlanRoute,
    reviseRunPlanExecution,
    RunPlanTransitionError,
    reviseRunPlanRoute,
    updateRunPlanStage,
    type RunPlanRouteCandidate,
} from "../src/run-plan";
import { createInitialRunStage } from "../src/run-stage";

const candidate: RunPlanRouteCandidate = {
    stages: [
        { target: "调查现有实现", acceptanceCriteria: ["定位相关契约"] },
        { target: "实现并验证变更", acceptanceCriteria: ["行为符合要求", "回归检查通过"] },
    ],
};

test("Plan Run 路线由 Runtime 分配稳定身份并按候选顺序推进", () => {
    const route = createRunPlanRoute(candidate);
    assert.equal(route.revision, 1);
    assert.equal(route.nextStageIndex, 0);
    assert.equal(route.nextStageOrdinal, 3);
    assert.deepEqual(route.stages.map(({ stageId, status, target }) => ({ stageId, status, target })), [
        { stageId: "stage-1", status: "pending", target: "调查现有实现" },
        { stageId: "stage-2", status: "pending", target: "实现并验证变更" },
    ]);

    const firstActive = activateRunPlanStage(route, "stage-1");
    assert.equal(firstActive.stages[0]?.status, "executing");
    assert.equal(firstActive.stages[1]?.status, "pending");
    assert.throws(() => activateRunPlanStage(firstActive, "stage-2"), RunPlanTransitionError);

    const firstAccepted = acceptRunPlanStage(firstActive, "stage-1", 12);
    assert.equal(firstAccepted.stages[0]?.status, "accepted");
    assert.equal(firstAccepted.stages[0]?.acceptedSequence, 12);
    assert.equal(firstAccepted.nextStageIndex, 1);
    const secondActive = activateRunPlanStage(firstAccepted, "stage-2");
    const complete = acceptRunPlanStage(secondActive, "stage-2", 19);
    assert.equal(complete.nextStageIndex, 2);
});

test("Plan Run 路线拒绝空阶段、空目标、空验收条件与非法流转", () => {
    assert.throws(() => createRunPlanRoute({ stages: [] }), RunPlanTransitionError);
    assert.throws(() => createRunPlanRoute({ stages: [{ target: "  ", acceptanceCriteria: ["条件"] }] }), RunPlanTransitionError);
    assert.throws(() => createRunPlanRoute({ stages: [{ target: "目标", acceptanceCriteria: [] }] }), RunPlanTransitionError);
    assert.throws(() => createRunPlanRoute({ stages: [{ target: "目标", acceptanceCriteria: ["  "] }] }), RunPlanTransitionError);

    const route = createRunPlanRoute(candidate);
    assert.throws(() => activateRunPlanStage(route, "stage-2"), RunPlanTransitionError);
    assert.throws(() => acceptRunPlanStage(route, "stage-1", 0), RunPlanTransitionError);
});

test("RunStage 声明必须匹配获批路线，当前阶段修订同步更新路线版本", () => {
    const route = createRunPlanRoute(candidate);
    assert.throws(() => updateRunPlanStage(route, {
        target: "跳过调查直接写代码",
        acceptanceCriteria: ["实现完成"],
    }), RunPlanTransitionError);

    const firstActive = updateRunPlanStage(route, {
        target: "调查现有实现",
        acceptanceCriteria: ["定位相关契约"],
    });
    assert.equal(firstActive.stages[0]?.status, "executing");
    assert.throws(() => updateRunPlanStage(firstActive, {
        target: "实现并验证变更",
        acceptanceCriteria: ["行为符合要求", "回归检查通过"],
    }), RunPlanTransitionError);

    const revised = updateRunPlanStage(firstActive, {
        stageId: "stage-1",
        baseRevision: 1,
        reason: "代码入口需要同时确认兼容边界",
        target: "调查现状并确认兼容边界",
        acceptanceCriteria: ["定位相关契约", "识别兼容风险"],
    });
    assert.equal(revised.revision, 2);
    assert.equal(revised.revisionReason, "代码入口需要同时确认兼容边界");
    assert.equal(revised.stages[0]?.revision, 2);
    assert.equal(revised.stages[0]?.status, "executing");
    assert.equal(revised.stages[1]?.status, "pending");
    assert.throws(() => updateRunPlanStage(revised, {
        stageId: "stage-1",
        baseRevision: 1,
        target: "过期修订",
        acceptanceCriteria: ["过期"],
    }), RunPlanTransitionError);
});

test("路线修订保留已接受前缀与未变阶段身份，并为新增阶段分配新身份", () => {
    const initial = createRunPlanRoute(candidate);
    const activeFirst = updateRunPlanStage(initial, {
        target: "调查现有实现",
        acceptanceCriteria: ["定位相关契约"],
    });
    const acceptedFirst = acceptRunPlanStage(activeFirst, "stage-1", 10);
    const activeSecond = updateRunPlanStage(acceptedFirst, {
        target: "实现并验证变更",
        acceptanceCriteria: ["行为符合要求", "回归检查通过"],
    });
    const revised = reviseRunPlanRoute(activeSecond, {
        stages: [
            { target: "调查现有实现", acceptanceCriteria: ["定位相关契约"] },
            { target: "实现并验证变更", acceptanceCriteria: ["行为符合要求", "回归检查通过", "检查兼容性"] },
            { target: "补充发布说明", acceptanceCriteria: ["说明变更行为"] },
        ],
    }, "现有验证结果表明需要增加兼容性检查");

    assert.equal(revised.revision, 2);
    assert.equal(revised.revisionReason, "现有验证结果表明需要增加兼容性检查");
    assert.equal(revised.nextStageIndex, 1);
    assert.deepEqual(revised.stages.map(({ stageId, revision, status }) => ({ stageId, revision, status })), [
        { stageId: "stage-1", revision: 1, status: "accepted" },
        { stageId: "stage-2", revision: 2, status: "executing" },
        { stageId: "stage-3", revision: 1, status: "pending" },
    ]);
    assert.equal(revised.nextStageOrdinal, 4);
    assert.throws(() => reviseRunPlanRoute(revised, {
        stages: [
            { target: "实现并验证变更", acceptanceCriteria: ["行为符合要求", "回归检查通过", "检查兼容性"] },
            { target: "调查现有实现", acceptanceCriteria: ["定位相关契约"] },
        ],
    }, "拒绝重写已接受阶段"), RunPlanTransitionError);
});

test("路线修订拒绝删改已接受结果或删除活动阶段", () => {
    const active = updateRunPlanStage(createRunPlanRoute(candidate), {
        target: "调查现有实现",
        acceptanceCriteria: ["定位相关契约"],
    });
    const accepted = acceptRunPlanStage(active, "stage-1", 10);
    const nextActive = updateRunPlanStage(accepted, {
        target: "实现并验证变更",
        acceptanceCriteria: ["行为符合要求", "回归检查通过"],
    });
    assert.throws(() => reviseRunPlanRoute(nextActive, {
        stages: [{ target: "调查重做", acceptanceCriteria: ["重新调查"] }, { target: "实现并验证变更", acceptanceCriteria: ["行为符合要求"] }],
    }, "不得改写已接受历史"), RunPlanTransitionError);
    assert.throws(() => reviseRunPlanRoute(nextActive, {
        stages: [{ target: "调查现有实现", acceptanceCriteria: ["定位相关契约"] }],
    }, "不得删除活动阶段"), RunPlanTransitionError);
});

test("完整路线修订同步修订当前活动 RunStage 镜像", () => {
    const route = createRunPlanRoute(candidate);
    const activeRoute = updateRunPlanStage(route, {
        target: "调查现有实现",
        acceptanceCriteria: ["定位相关契约"],
    });
    const activeStage = createInitialRunStage({ target: "调查现有实现", acceptanceCriteria: ["定位相关契约"] }, 1);
    const revised = reviseRunPlanExecution(activeRoute, {
        stages: [
            { target: "调查并确认兼容边界", acceptanceCriteria: ["定位相关契约", "列出兼容约束"] },
            { target: "实现并验证变更", acceptanceCriteria: ["行为符合要求", "回归检查通过"] },
        ],
    }, "调查发现该模块有额外兼容约束", activeStage);
    assert.equal(revised.route.revision, 2);
    assert.equal(revised.route.stages[0]?.revision, 2);
    assert.equal(revised.currentStage?.revision, 2);
    assert.equal(revised.currentStage?.target, "调查并确认兼容边界");
    assert.deepEqual(revised.currentStage?.acceptanceCriteria, ["定位相关契约", "列出兼容约束"]);
});
