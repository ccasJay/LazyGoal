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

test("状态过期时仍允许通过唯一主按钮安全暂停当前 Run", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MessageComposer } = await import("../src/components/MessageComposer");

  const stale = renderToStaticMarkup(React.createElement(MessageComposer, {
    busy: false,
    running: true,
    placeholder: "Queue a message for the next Run…",
    onSubmit: async () => true,
    onInterrupt: async () => undefined,
    footerControls: null,
  } as any));
  assert.match(stale, /aria-label="Pause Run"/);
  assert.equal((stale.match(/<button\b/g) ?? []).length, 1);
  assert.doesNotMatch(stale, /aria-label="Stop run"|aria-label="Steer the current Run with this message"/);
});
