import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BrowserControlIntentCommand,
  BrowserControlReceipt,
  BrowserControlSnapshot,
  BrowserGoalEvent,
  BrowserSessionInputReceipt,
} from "../../../packages/web-contracts/src/index";
import {
  applyControlEvent,
  beginControlIntent,
  createControlState,
  markControlScopesFresh,
  settleControlIntent,
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
  let state = createControlState();
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
  let state = createControlState();
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
  let state = applyControlEvent(createControlState(), syncEvent(5));
  state = applyControlEvent(state, syncEvent(4));
  assert.equal(state.snapshot?.session.commitRevision, 5);
  assert.equal(state.connection.synced, true);
});

test("提交作用域幂等累积，定向读取后清除", () => {
  let state = applyControlEvent(createControlState(), syncEvent(1));
  state = applyControlEvent(state, { type: "state_committed", goalId: "goal-1", commitRevision: 2, changed: ["activity", "trajectory"] });
  state = applyControlEvent(state, { type: "state_committed", goalId: "goal-1", commitRevision: 2, changed: ["activity", "trajectory"] });
  assert.deepEqual(state.connection.staleScopes, ["activity", "trajectory"]);

  state = markControlScopesFresh(state, ["activity"]);
  assert.deepEqual(state.connection.staleScopes, ["trajectory"]);
});

test("迟到交互结算不解除新建立的等待", () => {
  let state = applyControlEvent(createControlState(), syncEvent(1));
  state = applyControlEvent(state, {
    type: "interaction_opened",
    goalId: "goal-1",
    runId: "run-1",
    interactionId: "question:new",
    kind: "question",
  });
  assert.equal(state.snapshot?.session.interaction?.interactionId, "question:new");
  assert.equal(state.snapshot?.session.waitingFor, "ask_user");

  state = applyControlEvent(state, {
    type: "interaction_settled",
    goalId: "goal-1",
    runId: "run-1",
    interactionId: "question:old",
    kind: "question",
  });
  assert.equal(state.snapshot?.session.interaction?.interactionId, "question:new");

  state = applyControlEvent(state, {
    type: "interaction_settled",
    goalId: "goal-1",
    runId: "run-1",
    interactionId: "question:new",
    kind: "question",
  });
  assert.equal(state.snapshot?.session.interaction, undefined);
  assert.equal(state.snapshot?.session.waitingFor, undefined);
});

test("stream_fault 累积重新同步范围，closed 只断开连接", () => {
  let state = applyControlEvent(createControlState(), syncEvent(1));
  state = applyControlEvent(state, { type: "stream_fault", goalId: "goal-1", code: "gap", resync: ["session", "activity"] });
  assert.deepEqual(state.connection.staleScopes, ["session", "activity"]);
  state = applyControlEvent(state, { type: "closed", goalId: "goal-1", reason: "closed" });
  assert.equal(state.connection.connected, false);
  assert.equal(state.connection.synced, false);
  assert.deepEqual(state.connection.staleScopes, ["session", "activity"]);
});

test("旧 Run 的状态与终态事件不覆盖当前 Run", () => {
  let state = applyControlEvent(createControlState(), syncEvent(1));
  state = applyControlEvent(state, { type: "run_status_changed", goalId: "goal-1", runId: "run-old", status: "failed" });
  assert.equal(state.snapshot?.session.runStatus, "running");
  state = applyControlEvent(state, { type: "run_status_changed", goalId: "goal-1", runId: "run-1", status: "waiting" });
  assert.equal(state.snapshot?.session.runStatus, "waiting");
  state = applyControlEvent(state, { type: "run_result", goalId: "goal-1", runId: "run-1", result: "completed" });
  assert.equal(state.snapshot?.session.runStatus, "completed");
});
