import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  BrowserGoalListItem,
  BrowserGoalSession,
} from "../../packages/web-contracts/src/index";

test("cardStatusPresentation 精确区分 Failed 与 Stopped 状态", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { hash: "" } },
  });

  try {
    const { cardStatusPresentation } = await import("../src/types");

    assert.deepEqual(cardStatusPresentation("failed"), {
      label: "Failed",
      className: "failed",
    });
    assert.deepEqual(cardStatusPresentation("cancelled"), {
      label: "Stopped",
      className: "stopped",
    });
    assert.deepEqual(cardStatusPresentation("completed"), {
      label: "Completed",
      className: "completed",
    });
    assert.deepEqual(cardStatusPresentation("running"), {
      label: "Running",
      className: "running",
    });
    assert.deepEqual(cardStatusPresentation("waiting"), {
      label: "Needs input",
      className: "needs-input",
    });
    assert.deepEqual(cardStatusPresentation("created"), {
      label: "Ready",
      className: "ready",
    });
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("sessionStatus 与 sessionStatusTone 保持一致性", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { hash: "" } },
  });

  try {
    const { sessionStatus, sessionStatusTone } = await import("../src/types");

    const baseSession: BrowserGoalSession = {
      goalId: "g-1",
      intent: "测试目标",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archived: false,
      runStatus: "failed",
      currentRunId: "r-1",
      messages: [],
      runs: [],
    };

    assert.equal(sessionStatus(baseSession), "Failed");
    assert.equal(sessionStatusTone(baseSession), "failed");

    const stoppedSession: BrowserGoalSession = {
      ...baseSession,
      runStatus: "cancelled",
    };
    assert.equal(sessionStatus(stoppedSession), "Stopped");
    assert.equal(sessionStatusTone(stoppedSession), "stopped");

    const waitingApprovalSession: BrowserGoalSession = {
      ...baseSession,
      runStatus: "waiting",
      pendingAction: {
        actionId: "a-1",
        status: "awaiting_approval",
        executionUnitId: "u-1",
        proposal: "执行危险指令",
      },
    };
    assert.equal(sessionStatus(waitingApprovalSession), "Awaiting approval");
    assert.equal(sessionStatusTone(waitingApprovalSession), "needs-input attention");
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("statusFromRun 正确将 failed 与 cancelled 归为 Stopped 列", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { hash: "" } },
  });

  try {
    const { statusFromRun } = await import("../src/types");

    assert.equal(statusFromRun("failed"), "Stopped");
    assert.equal(statusFromRun("cancelled"), "Stopped");
    assert.equal(statusFromRun("completed"), "Completed");
    assert.equal(statusFromRun("running"), "Running");
    assert.equal(statusFromRun("waiting"), "Needs input");
    assert.equal(statusFromRun("created"), "Ready");
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
