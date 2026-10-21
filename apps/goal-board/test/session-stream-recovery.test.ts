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

test("连接先消费权威同步，断线与读取失败只标记可能过期", async () => {
  const {
    INITIAL_STREAM_RECOVERY_STATE,
    reduceStreamRecovery,
    allowsLatestStateDecision,
  } = await import("../src/session-stream-recovery");

  assert.deepEqual(INITIAL_STREAM_RECOVERY_STATE, { synced: false, stale: false });

  const connected = reduceStreamRecovery(INITIAL_STREAM_RECOVERY_STATE, { kind: "connected" });
  assert.equal(connected.synced, false);
  assert.equal(connected.stale, false);

  const synced = reduceStreamRecovery(connected, { kind: "state_sync" });
  assert.deepEqual(synced, { synced: true, stale: false });
  assert.equal(allowsLatestStateDecision(synced), true);

  const disconnected = reduceStreamRecovery(synced, { kind: "disconnected" });
  assert.equal(disconnected.synced, true, "断开不伪造新的权威同步");
  assert.equal(disconnected.stale, true);
  assert.equal(allowsLatestStateDecision(disconnected), false);

  const failed = reduceStreamRecovery(synced, { kind: "failed" });
  assert.equal(failed.stale, true);

  const resynced = reduceStreamRecovery(failed, { kind: "state_sync" });
  assert.deepEqual(resynced, { synced: true, stale: false });
});

test("释放观察只回收浏览器本地资源，不中断宿主执行", async () => {
  const { releaseObservation } = await import("../src/session-stream-recovery");

  const release = releaseObservation();
  assert.equal(release.abortLocalReads, true);
  assert.equal(release.cancelPendingFrames, true);
  assert.equal(release.detachSubscription, true);
  assert.equal(release.sendInterrupt, false);
  assert.equal(release.revokeAcceptedInputs, false);
  assert.equal(release.closeHostRuntime, false);
});

test("切换 Goal 后旧目标的迟到回调不能写入新视图", async () => {
  const { ownsViewEvent } = await import("../src/session-stream-recovery");

  assert.equal(ownsViewEvent("goal-1", "goal-1"), true);
  assert.equal(ownsViewEvent("goal-1", "goal-2"), false);
  assert.equal(ownsViewEvent("goal-1", null), false);
});

test("过期标记在页面上明确显示，并限制依赖最新状态的新决定", async () => {
  const { steerActionState } = await import("../src/session-controls");

  assert.deepEqual(steerActionState({ busy: false, stale: false, hasDraft: true }), { enabled: true });
  assert.deepEqual(steerActionState({ busy: false, stale: true, hasDraft: true }), { enabled: false, reason: "stale" });
  assert.deepEqual(steerActionState({ busy: true, stale: false, hasDraft: true }), { enabled: false, reason: "busy" });
  assert.deepEqual(steerActionState({ busy: false, stale: false, hasDraft: false }), { enabled: false, reason: "empty-draft" });

  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MessageComposer } = await import("../src/components/MessageComposer");

  const stale = renderToStaticMarkup(React.createElement(MessageComposer, {
    busy: false,
    running: true,
    steerDisabled: true,
    placeholder: "Add direction while this Run is working…",
    onSubmit: async () => true,
    onSteer: async () => true,
    onInterrupt: async () => undefined,
    footerControls: null,
  } as any));
  const staleSteerButton = /<button[^>]*aria-label="Steer the current Run with this message"[^>]*>/.exec(stale)?.[0] ?? "";
  assert.equal(staleSteerButton.includes("disabled"), true, "状态过期时禁止新的 Steer 决定");
  // 停止既有 Run 是安全操作，不受过期限制。
  assert.match(stale, /aria-label="Stop run"/);
});
