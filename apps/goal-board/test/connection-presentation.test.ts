import assert from "node:assert/strict";
import { test } from "node:test";

import { selectConnectionPresentation } from "../src/connection-presentation";

test("断线报告重连并保留最后已知内容", () => {
  const connection = selectConnectionPresentation({ connected: false, synced: true, stale: true });
  assert.equal(connection.state, "reconnecting");
  assert.equal(connection.label, "Reconnecting");
  assert.equal(connection.allowsNewDecisions, false);
  assert.equal(connection.retainsLastKnown, true);
});

test("连接已建立但尚未完成首次同步时不宣称已连接", () => {
  const connection = selectConnectionPresentation({ connected: true, synced: false, stale: false });
  assert.equal(connection.state, "reconnecting");
  assert.equal(connection.label, "Connecting");
  assert.equal(connection.allowsNewDecisions, false);
});

test("连接存在但状态可能过期时报告过期", () => {
  const connection = selectConnectionPresentation({ connected: true, synced: true, stale: true });
  assert.equal(connection.state, "stale");
  assert.equal(connection.label, "State out of date");
  assert.equal(connection.allowsNewDecisions, false);
});

test("已连接且已同步时允许依赖最新状态的新决定", () => {
  const connection = selectConnectionPresentation({ connected: true, synced: true, stale: false });
  assert.deepEqual(connection, {
    state: "linked",
    label: "Connected",
    allowsNewDecisions: true,
    retainsLastKnown: true,
  });
});

test("任何非 linked 状态都不把断线描述为失败或完成", () => {
  const states = [
    selectConnectionPresentation({ connected: false, synced: false, stale: false }),
    selectConnectionPresentation({ connected: true, synced: false, stale: false }),
    selectConnectionPresentation({ connected: true, synced: true, stale: true }),
  ];
  for (const connection of states) {
    assert.doesNotMatch(connection.label, /fail|complete|cancel/i);
    assert.equal(connection.allowsNewDecisions, false);
  }
});
