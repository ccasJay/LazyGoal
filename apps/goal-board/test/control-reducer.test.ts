import assert from "node:assert/strict";
import { test } from "node:test";

import { controlSnapshot } from "./control-fixtures";

import type {
  BrowserControlIntentCommand,
  BrowserControlReceipt,
  BrowserControlSnapshot,
  BrowserGoalEvent,
  BrowserSessionInputReceipt,
} from "../../../packages/web-contracts/src/index";
import {
  acceptControlSnapshot,
  applyControlEvent,
  disconnectControlStream,
  beginControlIntent,
  createControlState,
  markControlScopesFresh,
  settleControlIntent,
  selectControlGoal,
  verifyControlIntent,
} from "../src/control/reducer";

function snapshot(revision: number, overrides: { readonly runStatus?: BrowserControlSnapshot["session"]["runStatus"] } = {}): BrowserControlSnapshot {
  return {
    goal: {
      goalId: "goal-1",
      intent: "验证控制 reducer",
      currentRunId: "run-1",
      runStatus: overrides.runStatus ?? "running",
      currentRunMode: "normal",
      currentRunStepCount: 0,
      history: {
        messages: { included: false, source: "activity" },
        steps: { included: false, source: "activity" },
        stages: { included: false, source: "activity" },
      },
    },
    session: {
      goalId: "goal-1",
      runId: "run-1",
      runStatus: overrides.runStatus ?? "running",
      mode: "normal",
      commitRevision: revision,
      queueRevision: 0,
      queuePaused: false,
      pendingMessageCount: 0,
      pendingSteerCount: 0,
      needsRecovery: false,
      executionOwner: true,
      messages: { count: 0, recent: [] },
    },
  };
}

function syncEvent(revision: number): BrowserGoalEvent {
  return { type: "state_sync", goalId: "goal-1", state: snapshot(revision).session, snapshot: snapshot(revision) };
}

function receipt(intentId: string, status: "accepted" | "existing" | "rejected" | "unknown"): BrowserControlReceipt {
  if (status === "accepted" || status === "existing") {
    return {
      intentId,
      status,
      result: { kind: "session_input", result: { ok: true, existing: status === "existing", receipt: inputReceipt("input-1") } },
    };
  }
  if (status === "rejected") return { intentId, status, error: "INPUT_CONFLICT" };
  return { intentId, status };
}

function inputReceipt(inputId: string): BrowserSessionInputReceipt {
  return {
    goalId: "goal-1",
    inputId,
    kind: "message",
    sequence: 1,
    status: "pending",
    admittedAtRevision: 1,
  };
}

const sessionInput: BrowserControlIntentCommand = {
  kind: "session_input",
  intentId: "intent-input",
  goalId: "goal-1",
  input: { goalId: "goal-1", inputId: "input-1", kind: "message", content: "继续" },
};

const permissionMode: BrowserControlIntentCommand = {
  kind: "permission_mode",
  intentId: "intent-permission",
  mode: "yolo",
  expectedRevision: 2,
};

test("意图生命周期区分 pending、accepted、applied、rejected 与 unknown", () => {
  let state = selectControlGoal(createControlState(), "goal-1");
  state = beginControlIntent(state, sessionInput);
  assert.equal(state.intents[0]?.phase, "pending");

  state = settleControlIntent(state, receipt("intent-input", "accepted"));
  assert.equal(state.intents[0]?.phase, "accepted");

  const appliedReceipt: BrowserSessionInputReceipt = { ...inputReceipt("input-1"), status: "applied" };
  state = applyControlEvent(state, {
    type: "input_result",
    goalId: "goal-1",
    outcome: { goalId: "goal-1", inputId: "input-1", kind: "message", ok: true, receipt: appliedReceipt },
  });
  assert.equal(state.intents[0]?.phase, "applied");

  state = beginControlIntent(state, permissionMode);
  assert.equal(state.intents[1]?.phase, "pending");
  state = settleControlIntent(state, receipt("intent-permission", "accepted"));
  assert.equal(state.intents[1]?.phase, "applied");

  state = beginControlIntent(state, { kind: "goal_archive", intentId: "intent-archive", goalId: "goal-1", archived: true });
  state = settleControlIntent(state, receipt("intent-archive", "rejected"));
  assert.equal(state.intents[2]?.phase, "rejected");

  state = beginControlIntent(state, { kind: "goal_delete", intentId: "intent-delete", goalId: "goal-1" });
  state = settleControlIntent(state, receipt("intent-delete", "unknown"));
  assert.equal(state.intents[3]?.phase, "unknown");
});

test("同一 intentId 保留冻结载荷，核验只更新结论", () => {
  let state = beginControlIntent(createControlState(), sessionInput);
  const conflicting: BrowserControlIntentCommand = {
    kind: "session_input",
    intentId: "intent-input",
    goalId: "goal-1",
    input: { goalId: "goal-1", inputId: "input-1", kind: "message", content: "被改写的正文" },
  };
  state = beginControlIntent(state, conflicting);
  assert.equal(state.intents.length, 1);
  assert.equal(state.intents[0]?.intent.kind === "session_input" ? state.intents[0].intent.input.content : "", "继续");

  state = verifyControlIntent(state, "intent-input", "not_applied");
  assert.equal(state.intents[0]?.phase, "unknown");
  assert.equal(state.intents[0]?.verification, "not_applied");
  state = verifyControlIntent(state, "intent-input", "applied");
  assert.equal(state.intents[0]?.phase, "applied");
});

test("state_sync 应用权威快照并确认 create_session 与已应用输入", () => {
  let state = selectControlGoal(createControlState(), "goal-1");
  state = beginControlIntent(state, {
    kind: "create_session",
    intentId: "intent-create",
    goalId: "goal-1",
    inputId: "input-1",
    intent: "创建会话",
  });
  state = settleControlIntent(state, receipt("intent-create", "accepted"));
  state = beginControlIntent(state, sessionInput);
  state = settleControlIntent(state, receipt("intent-input", "accepted"));

  const applied: BrowserControlSnapshot = snapshot(3);
  const appliedSync: BrowserGoalEvent = {
    type: "state_sync",
    goalId: "goal-1",
    state: applied.session,
    snapshot: {
      ...applied,
      session: {
        ...applied.session,
        messages: {
          count: 1,
          recent: [{
            messageId: "msg-1",
            role: "user",
            runId: "run-1",
            position: { afterSequence: 0, order: 0 },
            sourceKind: "user_input",
            sourceId: "input-1",
          }],
        },
      },
    },
  };
  state = applyControlEvent(state, appliedSync);
  assert.equal(state.snapshot?.session.commitRevision, 3);
  assert.equal(state.connection.synced, true);
  assert.equal(state.connection.staleScopes.includes("session"), false);
  assert.equal(state.intents[0]?.phase, "applied");
  assert.equal(state.intents[1]?.phase, "applied");
});

test("低 commitRevision 的 state_sync 不覆盖已确认快照", () => {
  let state = applyControlEvent(selectControlGoal(createControlState(), "goal-1"), syncEvent(5));
  state = applyControlEvent(state, syncEvent(4));
  assert.equal(state.snapshot?.session.commitRevision, 5);
  assert.equal(state.connection.synced, true);
});

test("提交作用域幂等累积，定向读取后清除", () => {
  let state = applyControlEvent(selectControlGoal(createControlState(), "goal-1"), syncEvent(1));
  state = applyControlEvent(state, { type: "state_committed", goalId: "goal-1", commitRevision: 2, changed: ["activity", "trajectory"] });
  state = applyControlEvent(state, { type: "state_committed", goalId: "goal-1", commitRevision: 2, changed: ["activity", "trajectory"] });
  assert.deepEqual(state.connection.staleScopes, ["activity", "trajectory"]);

  state = markControlScopesFresh(state, ["activity"]);
  assert.deepEqual(state.connection.staleScopes, ["trajectory"]);
});

test("交互事件只使当前等待失效，已确认快照由窄读取推进", () => {
  const pending = controlSnapshot({ interactionRequestId: "request-new", interactionActionId: "action-1" });
  let state = acceptControlSnapshot(selectControlGoal(createControlState(), "goal-1"), pending);
  const settled: BrowserGoalEvent = {
    type: "interaction_settled", goalId: "goal-1", runId: "run-1",
    interactionId: "action_approval:request-old", kind: "action_approval",
  };
  assert.equal(applyControlEvent(state, settled), state);
  state = applyControlEvent(state, { ...settled, interactionId: "action_approval:request-new" });
  assert.equal(state.snapshot, pending);
  assert.deepEqual(state.connection.staleScopes, ["session"]);
  state = acceptControlSnapshot(state, snapshot(2));
  assert.equal(state.snapshot?.goal.interaction, undefined);
  assert.deepEqual(state.connection.staleScopes, []);
});

test("stream_fault 累积重新同步范围，closed 只断开连接", () => {
  let state = applyControlEvent(selectControlGoal(createControlState(), "goal-1"), syncEvent(1));
  state = applyControlEvent(state, { type: "stream_fault", goalId: "goal-1", code: "gap", resync: ["session", "activity"] });
  assert.deepEqual(state.connection.staleScopes, ["session", "activity"]);
  state = applyControlEvent(state, { type: "closed", goalId: "goal-1", reason: "closed" });
  assert.equal(state.connection.connected, false);
  assert.equal(state.connection.synced, false);
  assert.deepEqual(state.connection.staleScopes, ["session", "activity"]);
});

test("低修订 HTTP 与 SSE 无法覆盖完成状态或清除会话失效", () => {
  let state = applyControlEvent(selectControlGoal(createControlState(), "goal-1"), syncEvent(1));
  const completed = snapshot(2, { runStatus: "completed" });
  state = acceptControlSnapshot(state, completed);
  state = applyControlEvent(state, { type: "state_committed", goalId: "goal-1", commitRevision: 3, changed: ["session"] });
  assert.equal(acceptControlSnapshot(state, snapshot(1)), state);
  assert.equal(applyControlEvent(state, syncEvent(1)), state);
  assert.equal(state.snapshot, completed);
  assert.deepEqual(markControlScopesFresh(state, ["session"]).connection.staleScopes, ["session"]);
});

test("切换 Goal 清除旧快照与连接，B 的修订独立于 A", () => {
  const a = applyControlEvent(selectControlGoal(createControlState(), "goal-1"), syncEvent(10));
  const b = selectControlGoal(a, "goal-2");
  assert.equal(b.snapshot, null);
  assert.equal(b.connection.synced, false);
  assert.equal(applyControlEvent(b, syncEvent(11)), b);
  const first = snapshot(1);
  const next = { goal: { ...first.goal, goalId: "goal-2" }, session: { ...first.session, goalId: "goal-2" } };
  const synced = applyControlEvent(b, { type: "state_sync", goalId: "goal-2", state: next.session, snapshot: next });
  assert.equal(synced.snapshot, next);
  assert.equal(synced.connection.synced, true);
  assert.notEqual(selectControlGoal(synced, "goal-1").view, a.view);
});

test("后继 Run 接纳同 Goal 的更高修订，旧 Run 的状态与交互不覆盖当前状态", () => {
  const first = applyControlEvent(selectControlGoal(createControlState(), "goal-1"), syncEvent(1));
  const next = snapshot(2);
  const successor = { goal: { ...next.goal, currentRunId: "run-2" }, session: { ...next.session, runId: "run-2" } };
  const state = acceptControlSnapshot(first, successor);
  const late: readonly BrowserGoalEvent[] = [
    { type: "run_status_changed", goalId: "goal-1", runId: "run-1", status: "waiting", commitRevision: 1 },
    { type: "run_result", goalId: "goal-1", runId: "run-1", result: "completed" },
    { type: "interaction_opened", goalId: "goal-1", runId: "run-1", interactionId: "old", kind: "question" },
  ];
  for (const event of late) assert.equal(applyControlEvent(state, event), state);
  assert.equal(state.snapshot, successor);
});

test("重连低修订与缺失快照不能标记同步，当前连接须达到声明的修订", () => {
  let state = applyControlEvent(selectControlGoal(createControlState(), "goal-1"), syncEvent(5));
  state = disconnectControlStream(state);
  state = applyControlEvent(state, syncEvent(4));
  assert.equal(state.connection.synced, false);
  assert.equal(state.snapshot?.session.commitRevision, 5);
  state = applyControlEvent(state, { type: "state_sync", goalId: "goal-1", state: snapshot(7).session });
  assert.equal(acceptControlSnapshot(state, snapshot(6)), state);
  state = acceptControlSnapshot(state, snapshot(7));
  assert.equal(state.connection.synced, true);
  assert.equal(state.connection.stale, false);
});
