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
