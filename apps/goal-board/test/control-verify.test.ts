import assert from "node:assert/strict";
import { test } from "node:test";

import type { BrowserControlIntentCommand } from "../../../packages/web-contracts/src/index";

const sessionGoal = {
  goalId: "goal-1",
  intent: "验证核验路径",
  currentRunId: "run-1",
  runStatus: "waiting",
  currentRunMode: "normal",
  currentRunStepCount: 0,
  history: {
    messages: { included: false, source: "activity" },
    steps: { included: false, source: "activity" },
    stages: { included: false, source: "activity" },
  },
};

function installWindow(): PropertyDescriptor | undefined {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hash: "#test-access" } } });
  return previous;
}

function restoreWindow(previous: PropertyDescriptor | undefined): void {
  if (previous) Object.defineProperty(globalThis, "window", previous);
  else Reflect.deleteProperty(globalThis, "window");
}

test("控制入口把拒绝收据作为结果返回，网络失败才归为 unknown", async (t) => {
  const previous = installWindow();
  try {
    const { browserApi } = await import("../src/api");
    t.mock.method(globalThis, "fetch", async () => Response.json(
      { intentId: "intent-1", status: "rejected", error: "stale_run", refresh: true },
      { status: 409 },
    ));
    const rejected = await browserApi.submitControl({ kind: "plan_mode", intentId: "intent-1", goalId: "goal-1", runId: "run-1" });
    assert.deepEqual(rejected, { intentId: "intent-1", status: "rejected", error: "stale_run", refresh: true });

    t.mock.method(globalThis, "fetch", async () => {
      throw new Error("network down");
    });
    const unknown = await browserApi.submitControl({ kind: "plan_mode", intentId: "intent-2", goalId: "goal-1", runId: "run-1" });
    assert.deepEqual(unknown, { intentId: "intent-2", status: "unknown" });
  } finally {
    restoreWindow(previous);
  }
});

test("统一核验复用各资源现有身份", async (t) => {
  const previous = installWindow();
  try {
    const { verifyControlIntent } = await import("../src/control/verify");
    const routes = new Map<string, () => Response>();
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const url = String(input);
      const match = [...routes.entries()]
        .filter(([prefix]) => url === prefix || url.startsWith(`${prefix}?`) || url.startsWith(`${prefix}/`))
        .sort(([left], [right]) => right.length - left.length)[0];
      return match === undefined ? Response.json({ error: "not_found" }, { status: 404 }) : match[1]();
    });

    // SessionInput：收据存在即已受理，不存在要求按原身份重试。
    routes.set("/api/goals/goal-1/inputs/input-found", () => Response.json({
      ok: true,
      found: true,
      receipt: { goalId: "goal-1", inputId: "input-found", kind: "message", sequence: 1, status: "pending", admittedAtRevision: 1 },
    }));
    routes.set("/api/goals/goal-1/inputs/input-missing", () => Response.json({ ok: true, found: false }));
    assert.equal(await verifyControlIntent(sessionInput("input-found")), "applied");
    assert.equal(await verifyControlIntent(sessionInput("input-missing")), "not_applied");

    // 权限模式：当前模式一致即已应用；同一 revision 且不一致即未应用。
    routes.set("/api/project/permission-mode", () => Response.json({ ok: true, mode: "yolo", revision: 3, workspaceId: "ws-1" }));
    assert.equal(await verifyControlIntent({
      kind: "permission_mode", intentId: "permission-1", mode: "yolo", expectedRevision: 2,
    }), "applied");
    assert.equal(await verifyControlIntent({
      kind: "permission_mode", intentId: "permission-2", mode: "default", expectedRevision: 3,
    }), "not_applied");
    assert.equal(await verifyControlIntent({
      kind: "permission_mode", intentId: "permission-3", mode: "default", expectedRevision: 2,
    }), "unknown");

    // Grant：摘要中不存在即已撤销。
    routes.set("/api/goals/goal-1/grants", () => Response.json({ ok: true, goalId: "goal-1", runId: "run-1", grants: [] }));
    assert.equal(await verifyControlIntent({
      kind: "grant_revoke", intentId: "grant-1", goalId: "goal-1", runId: "run-1", grantId: "grant-1", scope: "goal",
    }), "applied");

    // Goal：存在即删除未应用，不存在即删除已应用。
    routes.set("/api/goals", () => Response.json({ goals: [{ goalId: "goal-1", runId: "run-1", intent: "x", workflowPhase: "executing", runStatus: "completed", updatedAt: "2026-01-01T00:00:00.000Z", archived: false }], unreadableCount: 0 }));
    assert.equal(await verifyControlIntent({ kind: "goal_delete", intentId: "delete-1", goalId: "goal-1" }), "not_applied");
    assert.equal(await verifyControlIntent({ kind: "goal_delete", intentId: "delete-2", goalId: "goal-absent" }), "applied");

    // 模型选择：当前目录的选择一致即已应用。
    routes.set("/api/models", () => Response.json({
      provider: "openai",
      currentModelId: "model-2",
      models: [
        { id: "model-1", displayName: "Model 1", availabilitySource: "live", metadataSource: "live", selectable: true },
        { id: "model-2", displayName: "Model 2", availabilitySource: "live", metadataSource: "live", selectable: true },
      ],
    }));
    assert.equal(await verifyControlIntent({
      kind: "model_selection", intentId: "model-1", goalId: "goal-1", runId: "run-1", modelId: "model-2", persistAsDefault: false,
    }), "applied");

    // 审批预检：等待中的 Action 仍存在时才允许重新预检。
    routes.set("/api/goals/goal-1", () => Response.json({ goal: { ...sessionGoal, pendingAction: { actionId: "action-1", toolId: "write_file", status: "awaiting_approval", inputPreview: "{}", inputPreviewTruncated: false } } }));
    assert.equal(await verifyControlIntent({
      kind: "action_review", intentId: "review-1", goalId: "goal-1", runId: "run-1", actionId: "action-1",
    }), "not_applied");
    assert.equal(await verifyControlIntent({
      kind: "action_review", intentId: "review-2", goalId: "goal-1", runId: "run-1", actionId: "action-2",
    }), "unknown");
  } finally {
    restoreWindow(previous);
  }
});

test("核验读取失败返回 unknown，不推断未执行", async (t) => {
  const previous = installWindow();
  try {
    const { verifyControlIntent } = await import("../src/control/verify");
    t.mock.method(globalThis, "fetch", async () => {
      throw new Error("network down");
    });
    assert.equal(await verifyControlIntent(sessionInput("input-1")), "unknown");
    assert.equal(await verifyControlIntent({
      kind: "permission_mode", intentId: "permission-1", mode: "yolo", expectedRevision: 1,
    }), "unknown");
  } finally {
    restoreWindow(previous);
  }
});

function sessionInput(inputId: string): BrowserControlIntentCommand {
  return {
    kind: "session_input",
    intentId: inputId,
    goalId: "goal-1",
    input: { kind: "message", inputId, content: "继续" },
  };
}
