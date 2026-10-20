import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

(globalThis as any).React = React;

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    location: { hash: "", host: "localhost", protocol: "http:" },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
}

test("GoalBoard 搜索框包含 id 与 name 属性且在初始状态展示总数", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { GoalBoard } = await import("../src/components/GoalBoard");

  const dummyGoals = [
    {
      goalId: "g1",
      intent: "Fix login issue",
      archived: false,
      status: "completed",
      createdAt: "2026-01-01T00:00:00Z",
    },
    {
      goalId: "g2",
      intent: "Implement dark mode",
      archived: false,
      status: "pending",
      createdAt: "2026-01-01T00:00:00Z",
    },
  ] as any;

  const html = renderToStaticMarkup(
    React.createElement(GoalBoard, {
      goals: dummyGoals,
      metricsByGoal: {},
      goalsLoading: false,
      selectedGoalId: null,
      onSelectGoal: () => {},
      onOpenNewGoalDraft: () => {},
      onChangeArchive: async () => {},
      onDeleteGoal: async () => {},
      manageBusyId: null,
      manageError: null,
      onClearManageError: () => {},
      undoArchiveId: null,
      onRefreshGoals: async () => {},
      sessionError: null,
    })
  );

  assert.match(html, /id="goal-board-search"/);
  assert.match(html, /name="search"/);
  assert.match(html, /All goals/);
  assert.match(html, /<span>2<\/span>/);
});

test("任务批准卡片在批准按钮前展示完整有序阶段路线", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { TaskApprovalInteractionView } = await import("../src/interaction-panel");
  const { createInteractionSubmissionState } = await import("../src/interaction-state");
  const html = renderToStaticMarkup(React.createElement(TaskApprovalInteractionView, {
    detail: {
      kind: "task_approval",
      objective: "Implement the feature",
      approvalRequest: "Review the complete plan",
      completionCriteria: ["All checks pass"],
      stages: [
        { target: "Inspect current behavior", acceptanceCriteria: ["Find the entry point"] },
        { target: "Implement the change", acceptanceCriteria: ["Feature works", "Regression checks pass"] },
      ],
    },
    submission: createInteractionSubmissionState(),
    feedback: "",
    chrome: { label: "task_approval", stopping: false, busy: false },
    onEvent: () => {},
  }));

  const firstStage = html.indexOf("Inspect current behavior");
  const secondStage = html.indexOf("Implement the change");
  const approveButton = html.indexOf("Approve task");
  assert.ok(firstStage >= 0 && secondStage > firstStage && approveButton > secondStage);
  assert.match(html, /Find the entry point/);
  assert.match(html, /Regression checks pass/);
});

test("路线扩展 AskUser 卡片展示审批理由和完整候选阶段", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { QuestionInteractionView } = await import("../src/interaction-panel");
  const { createInteractionSubmissionState, createQuestionDraft } = await import("../src/interaction-state");
  const html = renderToStaticMarkup(React.createElement(QuestionInteractionView, {
    interactionId: "question:route-revision-approval",
    detail: {
      kind: "question",
      mode: "execution",
      questions: [{
        id: "q-1",
        header: "Plan route revision",
        question: "Approve the revised route?",
        multiSelect: false,
        options: [
          { id: "o-1", label: "Approve revised route" },
          { id: "o-2", label: "Keep current route" },
        ],
      }],
      routeRevision: {
        baseRevision: 1,
        reason: "New evidence adds a promised deliverable",
        approvalRequest: "Approve adding this report to the task?",
        approvalOptionId: "o-1",
        stages: [
          { target: "Repair the feature", acceptanceCriteria: ["Behavior works"] },
          { target: "Write compatibility report", acceptanceCriteria: ["Report covers affected callers"] },
        ],
      },
    },
    draft: createQuestionDraft(),
    submission: createInteractionSubmissionState(),
    chrome: { label: "Question", stopping: false, busy: false },
    skipConfirmOpen: false,
    onEvent: () => {},
  }));
  assert.match(html, /New evidence adds a promised deliverable/);
  assert.match(html, /Approve adding this report to the task\?/);
  assert.match(html, /Write compatibility report/);
  assert.match(html, /Report covers affected callers/);
});

test("Activity 独立展示完整 Plan Run 路线，不依赖执行步骤是否展开", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { PlanRouteList } = await import("../src/components/PlanRouteList");
  const html = renderToStaticMarkup(React.createElement(PlanRouteList, {
    route: {
      revision: 2,
      revisionReason: "A separate verification gate was identified",
      nextStageIndex: 1,
      stages: [
        { stageId: "stage-1", revision: 1, status: "accepted", target: "Inspect current behavior", acceptanceCriteria: ["Find the entry point"], acceptedSequence: 12 },
        { stageId: "stage-2", revision: 2, status: "executing", target: "Implement the change", acceptanceCriteria: ["Feature works", "Regression checks pass"] },
        { stageId: "stage-3", revision: 1, status: "pending", target: "Verify the result", acceptanceCriteria: ["Run targeted checks"] },
      ],
    },
  }));

  assert.match(html, /aria-label="Run plan"/);
  assert.match(html, /A separate verification gate was identified/);
  assert.ok(html.indexOf("Inspect current behavior") < html.indexOf("Implement the change"));
  assert.ok(html.indexOf("Implement the change") < html.indexOf("Verify the result"));
  assert.match(html, /Regression checks pass/);
  assert.match(html, /Accepted/);
  assert.match(html, /In progress/);
  assert.match(html, /Pending/);
});

test("SessionTimeline 保留真实来源身份并按交错顺序渲染消息、事实和终态", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { SessionTimeline } = await import("../src/components/SessionTimeline");
  const position = (sequence: number, itemKind: "fact" | "message" = "fact", order = 0) => ({
    runId: "run-1", runOrder: 0, sequence, itemKind, order,
  });
  const html = renderToStaticMarkup(React.createElement(SessionTimeline, {
    projection: {
      currentPlanRoute: {
        revision: 1,
        nextStageIndex: 1,
        nextStageOrdinal: 2,
        stages: [{
          stageId: "stage-1", revision: 1, status: "accepted", target: "Review the saved evidence",
          acceptanceCriteria: ["Use stable source positions"], acceptedSequence: 2,
        }],
      },
      items: [
        { kind: "run", itemId: "run:run-1", runId: "run-1", status: "completed", position: position(0) },
        { kind: "message", itemId: "message:user", runId: "run-1", role: "user", content: "Start review", position: position(0, "message") },
        { kind: "fact", itemId: "event:tool", runId: "run-1", title: "Tool started", eventType: "tool_started", position: position(1) },
        { kind: "message", itemId: "message:steer", runId: "run-1", role: "user", content: "Keep it short", position: position(2, "message") },
        { kind: "message", itemId: "message:progress", runId: "run-1", role: "assistant", purpose: "process", content: "Checking the source", position: position(3, "message") },
        { kind: "message", itemId: "message:answer", runId: "run-1", role: "assistant", purpose: "answer", content: "Review complete", position: position(4, "message") },
        { kind: "terminal", itemId: "terminal:run-1:completed", runId: "run-1", status: "completed", position: position(4) },
      ],
    },
    currentRunId: "run-1",
    runStatus: "completed",
    olderAvailable: true,
    showExecutionFacts: true,
    liveActivity: null,
    streamConnected: false,
    brandMark: "/logo.svg",
  }));

  const orderedIds = ["run:run-1", "message:user", "event:tool", "message:steer", "message:progress", "message:answer", "terminal:run-1:completed"];
  const positions = orderedIds.map((id) => html.indexOf(`data-item-id="${id}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  assert.match(html, /Earlier activity is outside this fixed page/);
  assert.match(html, /Review the saved evidence/);
  assert.match(html, /Progress/);
  assert.match(html, /Run completed/);
});

test("PermissionControl 单选框包含 id 和 name 属性并正确关联 label", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { PermissionControl } = await import("../src/components/PermissionControl");

  const html = renderToStaticMarkup(
    React.createElement(PermissionControl, {
      mode: "default",
      open: true,
      modeBusy: false,
      modeError: null,
      hasGoal: true,
      grants: [],
      grantsLoading: false,
      grantsError: null,
      revokingGrantId: null,
      onToggle: () => {},
      onClose: () => {},
      onChooseMode: () => {},
      onRevokeGrant: () => {},
    })
  );

  assert.match(html, /id="permission-mode-default"/);
  assert.match(html, /id="permission-mode-yolo"/);
  assert.match(html, /name="project-permission-mode"/);
  assert.match(html, /for="permission-mode-default"/);
  assert.match(html, /for="permission-mode-yolo"/);
});

test("TrajectoryRecords 渲染记录行时包含外层容器与内部交互按钮", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { TrajectoryRecords } = await import("../src/trajectory-records");

  const dummyEntries = [
    {
      eventId: "e1",
      sequence: 1,
      eventType: "goal_received",
      category: "decision",
      occurredAt: "2026-01-01T00:00:00Z",
      title: "Goal received",
      preview: "Initial intent",
    },
  ] as any;

  const html = renderToStaticMarkup(
    React.createElement(TrajectoryRecords, {
      goalId: "g1",
      runId: "r1",
      entries: dummyEntries,
      unverifiedPageBoundarySequences: [],
      refresh: {},
      selectEvent: () => {},
      selectedInput: null,
      selectInput: () => {},
      showSteps: true,
      showRequests: true,
      onCalls: () => {},
      onRevealSelection: () => {},
      selectedSequence: null,
      query: "",
      category: "All events",
    })
  );

  assert.match(html, /class="ct-record/);
  assert.match(html, /role="option"/);
  assert.match(html, /class="ct-record-body"/);
});
