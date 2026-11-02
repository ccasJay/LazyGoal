import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeWorkspacePreferences,
  encodeWorkspacePreferences,
  restoreNotice,
  selectWorkspaceRestoreState,
  workspacePreferenceCookieName,
  workspacePreferenceKey,
  type WorkspaceLayout,
} from "../src/workspace-preferences";

const layout: WorkspaceLayout = {
  sidebarCollapsed: false,
  activityWidth: "wide",
  selectedGoalId: "goal-1",
  view: "Activity",
};

test("同一工作区得到稳定键，不同工作区互不覆盖", () => {
  assert.equal(workspacePreferenceKey("/repo/one"), workspacePreferenceKey("/repo/one"));
  assert.notEqual(workspacePreferenceKey("/repo/one"), workspacePreferenceKey("/repo/two"));
});

test("cookie 名称不包含本机绝对路径", () => {
  const name = workspacePreferenceCookieName("/Users/example/private/repo");
  assert.doesNotMatch(name, /Users|private|repo/);
  assert.match(name, /^lazygoal_workspace_[a-z0-9]+$/);
});

test("编码后可以完整解码", () => {
  const decoded = decodeWorkspacePreferences(encodeWorkspacePreferences(layout));
  assert.deepEqual(decoded, { kind: "valid", value: layout });
});

test("缺失、不可解析与字段不合法分别报告", () => {
  assert.deepEqual(decodeWorkspacePreferences(undefined), { kind: "absent" });
  assert.equal(decodeWorkspacePreferences("").kind, "absent");
  assert.deepEqual(decodeWorkspacePreferences("%7Bbroken"), { kind: "invalid", reason: "unreadable" });
  const missing = encodeURIComponent(JSON.stringify({ sidebarCollapsed: false }));
  assert.equal(decodeWorkspacePreferences(missing).kind, "invalid");
  const wrongView = encodeURIComponent(JSON.stringify({ ...layout, view: "Settings" }));
  assert.deepEqual(decodeWorkspacePreferences(wrongView), { kind: "invalid", reason: "view" });
  const wrongWidth = encodeURIComponent(JSON.stringify({ ...layout, activityWidth: "full" }));
  assert.deepEqual(decodeWorkspacePreferences(wrongWidth), { kind: "invalid", reason: "activity-width" });
});

test("身份未就绪时不应用已保存位置", () => {
  assert.deepEqual(
    selectWorkspaceRestoreState({ identity: "pending", decode: { kind: "valid", value: layout }, goalAvailable: true }),
    { kind: "awaiting-identity" },
  );
  assert.deepEqual(
    selectWorkspaceRestoreState({ identity: "unavailable", decode: { kind: "absent" }, goalAvailable: true }),
    { kind: "defaulted", reason: "identity-unavailable" },
  );
});

test("缺失或损坏的偏好退回默认并保留原因", () => {
  assert.deepEqual(
    selectWorkspaceRestoreState({ identity: "ready", decode: { kind: "absent" }, goalAvailable: true }),
    { kind: "defaulted", reason: "no-preference" },
  );
  assert.deepEqual(
    selectWorkspaceRestoreState({ identity: "ready", decode: { kind: "invalid", reason: "view" }, goalAvailable: true }),
    { kind: "defaulted", reason: "unreadable" },
  );
});

test("所选 Goal 不存在时退回默认而不是套用旧位置", () => {
  assert.deepEqual(
    selectWorkspaceRestoreState({ identity: "ready", decode: { kind: "valid", value: layout }, goalAvailable: false }),
    { kind: "defaulted", reason: "goal-unavailable" },
  );
  assert.deepEqual(
    selectWorkspaceRestoreState({ identity: "ready", decode: { kind: "valid", value: layout }, goalAvailable: true }),
    { kind: "restored", value: layout },
  );
});

test("未保存过位置时不打扰用户", () => {
  assert.equal(restoreNotice({ kind: "defaulted", reason: "no-preference" }), undefined);
  assert.match(restoreNotice({ kind: "defaulted", reason: "unreadable" }) ?? "", /default layout/);
  assert.match(restoreNotice({ kind: "defaulted", reason: "goal-unavailable" }) ?? "", /no longer available/);
  assert.match(restoreNotice({ kind: "defaulted", reason: "identity-unavailable" }) ?? "", /could not be identified/);
  assert.equal(restoreNotice({ kind: "restored", value: layout }), undefined);
});
