import assert from "node:assert/strict";
import { test } from "node:test";

import type { BrowserGoalSessionState } from "../../../packages/web-contracts/src/index";
import type { ControlIntentState } from "../src/control/types";
import {
  selectUnverifiedWorkbenchActions,
  selectWorkbenchActions,
  workbenchReasonText,
  type WorkbenchActionContext,
} from "../src/workbench-actions";

function session(overrides: Partial<BrowserGoalSessionState> = {}): BrowserGoalSessionState {
  return {
    goalId: "goal-1",
    intent: "Review the change",
    currentRunId: "run-1",
    runStatus: "running",
    currentRunMode: "normal",
    currentRunStepCount: 0,
    history: {
      messages: { included: false, source: "activity" },
      steps: { included: false, source: "activity" },
      stages: { included: false, source: "activity" },
    },
    ...overrides,
  };
}

function context(overrides: Partial<WorkbenchActionContext> = {}): WorkbenchActionContext {
  return {
    session: session(),
    busy: false,
    connected: true,
    stale: false,
    sessionUnreadable: false,
    canSendText: true,
    stopping: false,
    ...overrides,
  };
}

test("未选择 Goal 时每个动作都报告同一原因", () => {
  const actions = selectWorkbenchActions(context({ session: null }));
  for (const action of Object.values(actions)) {
    assert.equal(action.available, false);
    assert.equal(action.available === false ? action.reason : undefined, "no-goal-selected");
  }
});

test("运行中的正常会话允许发送、Steer 与停止，不可恢复的 Run 不提供恢复", () => {
  const actions = selectWorkbenchActions(context());
  assert.equal(actions.send_message.available, true);
  assert.equal(actions.steer.available, true);
  assert.equal(actions.stop.available, true);
  assert.equal(actions.resume.available === false ? actions.resume.reason : undefined, "recovery-unavailable");
});

test("状态过期只限制依赖最新状态的动作，停止既有 Run 仍可用", () => {
  const stale = selectWorkbenchActions(context({ stale: true }));
  assert.equal(stale.send_message.available, false);
  assert.equal(stale.send_message.available === false ? stale.send_message.reason : undefined, "state-stale");
  assert.equal(stale.steer.available, false);
  assert.equal(stale.resume.available, false);
  assert.equal(stale.stop.available, true);
});

test("连接重建优先于状态过期报告", () => {
  const actions = selectWorkbenchActions(context({ connected: false, stale: true }));
  assert.equal(actions.send_message.available === false ? actions.send_message.reason : undefined, "connection-reconnecting");
  assert.equal(actions.stop.available, true);
});

test("在途命令与读取失败阻断全部动作", () => {
  const busy = selectWorkbenchActions(context({ busy: true }));
  for (const action of Object.values(busy)) {
    assert.equal(action.available === false ? action.reason : undefined, "command-in-flight", action.id);
  }
  const unreadable = selectWorkbenchActions(context({ sessionUnreadable: true }));
  for (const action of Object.values(unreadable)) {
    assert.equal(action.available === false ? action.reason : undefined, "session-unreadable", action.id);
  }
});

test("Steer 需要运行中的 Run 且没有未完成的停止请求", () => {
  const waiting = selectWorkbenchActions(context({ session: session({ runStatus: "waiting" }) }));
  assert.equal(waiting.steer.available === false ? waiting.steer.reason : undefined, "run-not-running");

  const stoppingInterruption = selectWorkbenchActions(context({
    session: session({ interruption: { requestId: "stop-1", status: "requested" } }),
  }));
  assert.equal(stoppingInterruption.steer.available === false ? stoppingInterruption.steer.reason : undefined, "interaction-pending");

  const finishedInterruption = selectWorkbenchActions(context({
    session: session({ interruption: { requestId: "stop-1", status: "finished" } }),
  }));
  assert.equal(finishedInterruption.steer.available, true);
});

test("Resume 只在 Run 可恢复且状态新鲜时可用", () => {
  const inactive = selectWorkbenchActions(context({ session: session({ execution: { state: "inactive", committedThroughSequence: 1 } }) }));
  assert.equal(inactive.resume.available === false ? inactive.resume.reason : undefined, "recovery-unavailable");

  const recoverable = selectWorkbenchActions(context({ session: session({ execution: { state: "recoverable", committedThroughSequence: 1 } }) }));
  assert.equal(recoverable.resume.available, true);
});

test("停止已受理时不再提供重复停止", () => {
  const actions = selectWorkbenchActions(context({ stopping: true }));
  assert.equal(actions.stop.available === false ? actions.stop.reason : undefined, "stop-in-progress");
});

test("可用性随上下文变化重新派生且不保留上一次结论", () => {
  const before = selectWorkbenchActions(context());
  assert.equal(before.send_message.available, true);
  const after = selectWorkbenchActions(context({ stale: true }));
  assert.equal(after.send_message.available, false);
  assert.equal(selectWorkbenchActions(context()).send_message.available, true);
});

test("结果不明的动作按原意图身份投影，其他命令不混入", () => {
  const intents: readonly ControlIntentState[] = [
    { intent: { kind: "session_input", intentId: "i-1", goalId: "goal-1", input: { kind: "message", inputId: "i-1", content: "hi" } }, phase: "unknown" },
    { intent: { kind: "session_input", intentId: "i-2", goalId: "goal-1", input: { kind: "interrupt", inputId: "i-2", runId: "run-1" } }, phase: "unknown" },
    { intent: { kind: "session_input", intentId: "i-3", goalId: "goal-1", input: { kind: "resume", inputId: "i-3", runId: "run-1", commitRevision: 1 } }, phase: "unknown" },
    { intent: { kind: "session_input", intentId: "i-4", goalId: "goal-1", input: { kind: "respond", inputId: "i-4", requestId: "req-1", response: { kind: "skip_question" } } }, phase: "unknown" },
    { intent: { kind: "session_input", intentId: "i-5", goalId: "goal-1", input: { kind: "steer", inputId: "i-5", runId: "run-1", content: "focus" } }, phase: "pending" },
    { intent: { kind: "plan_mode", intentId: "i-6", goalId: "goal-1", runId: "run-1" }, phase: "unknown" },
  ];
  const unresolved = selectUnverifiedWorkbenchActions(intents);
  assert.deepEqual(unresolved.map((entry) => [entry.intentId, entry.actionId]), [
    ["i-1", "send_message"],
    ["i-2", "stop"],
    ["i-3", "resume"],
  ]);
});

test("每个不可用原因都有非空且互不相同的说明", () => {
  const reasons = [
    "no-goal-selected",
    "session-unreadable",
    "command-in-flight",
    "connection-reconnecting",
    "state-stale",
    "send-unavailable",
    "run-not-running",
    "interaction-pending",
    "stop-in-progress",
    "recovery-unavailable",
  ] as const;
  const texts = reasons.map(workbenchReasonText);
  for (const text of texts) assert.ok(text.trim().length > 0);
  assert.equal(new Set(texts).size, texts.length);
});
