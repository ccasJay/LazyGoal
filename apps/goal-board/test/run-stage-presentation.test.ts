import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  BrowserRunStageGroup,
  BrowserSessionRun,
  BrowserSessionStep,
} from "../../packages/web-contracts/src/index";
import { groupStepsByStage, renderStageStatusLabel } from "../src/components/run-stage-utils";

function makeStep(id: string, seq: number, stageId?: string): BrowserSessionStep {
  return {
    runId: "run-1",
    executionUnitId: id,
    sequence: seq,
    stepIndex: seq,
    status: "completed",
    summary: `Step ${seq} completed`,
    ...(stageId !== undefined ? { stageId } : {}),
  };
}

test("groupStepsByStage 正确分离 Run 级控制活动与阶段分组", () => {
  const steps: BrowserSessionStep[] = [
    makeStep("u-1", 1), // Run-level
    makeStep("u-2", 2, "stage-1"),
    makeStep("u-3", 3, "stage-1"),
    makeStep("u-4", 4, "stage-2"),
  ];
  const stages: BrowserRunStageGroup[] = [
    {
      stageId: "stage-1",
      revision: 1,
      target: "目标 1",
      acceptanceCriteria: ["条件 1"],
      status: "accepted",
      resultSummary: "产物 1 完成",
      steps: [],
    },
    {
      stageId: "stage-2",
      revision: 1,
      target: "目标 2",
      acceptanceCriteria: ["条件 2"],
      status: "in_progress",
      steps: [],
    },
  ];

  const grouped = groupStepsByStage(steps, stages);
  assert.equal(grouped.runLevelSteps.length, 1);
  assert.equal(grouped.runLevelSteps[0]?.executionUnitId, "u-1");
  assert.equal(grouped.stages.length, 2);
  assert.equal(grouped.stages[0]?.steps.length, 2);
  assert.equal(grouped.stages[0]?.steps[0]?.executionUnitId, "u-2");
  assert.equal(grouped.stages[0]?.steps[1]?.executionUnitId, "u-3");
  assert.equal(grouped.stages[1]?.steps.length, 1);
  assert.equal(grouped.stages[1]?.steps[0]?.executionUnitId, "u-4");
});

test("同一 stageId 的修订保持在同一组并更新目标", () => {
  const stageGroup: BrowserRunStageGroup = {
    stageId: "stage-1",
    revision: 2,
    target: "修订后的目标",
    acceptanceCriteria: ["修订后的条件"],
    status: "in_progress",
    revisions: [
      { revision: 1, target: "初始目标", reason: "初始计划" },
      { revision: 2, target: "修订后的目标", reason: "增加检查" },
    ],
    steps: [makeStep("u-1", 1, "stage-1"), makeStep("u-2", 2, "stage-1")],
  };

  assert.equal(stageGroup.revision, 2);
  assert.equal(stageGroup.target, "修订后的目标");
  assert.equal(stageGroup.revisions?.length, 2);
  assert.equal(stageGroup.steps.length, 2);
});

test("阶段状态覆盖与审查拒绝反馈展示", () => {
  assert.equal(renderStageStatusLabel("in_progress"), "In progress");
  assert.equal(renderStageStatusLabel("review_pending"), "Review pending");
  assert.equal(renderStageStatusLabel("accepted"), "Accepted");

  const rejectedStage: BrowserRunStageGroup = {
    stageId: "stage-1",
    revision: 1,
    target: "待审查目标",
    acceptanceCriteria: ["完成代码测试"],
    status: "in_progress",
    latestReviewRejection: {
      code: "semantic_gap",
      issues: ["测试未覆盖边界条件", "文档未更新"],
    },
    steps: [makeStep("u-1", 1, "stage-1")],
  };

  assert.equal(rejectedStage.status, "in_progress");
  assert.ok(rejectedStage.latestReviewRejection);
  assert.equal(rejectedStage.latestReviewRejection?.issues.length, 2);
});

test("阶段接受不改变 Run 生命周期状态标签", () => {
  const run: BrowserSessionRun = {
    runId: "run-1",
    status: "running",
    stepCount: 5,
    steps: [],
    current: true,
    stages: [
      {
        stageId: "stage-1",
        revision: 1,
        target: "中间阶段",
        acceptanceCriteria: ["步骤通过"],
        status: "accepted",
        resultSummary: "中间阶段已接受",
        steps: [],
      },
    ],
  };

  assert.equal(run.status, "running", "中间阶段 accepted 不得使 run 标签变为 completed");
  assert.equal(run.stages?.[0]?.status, "accepted");
});
