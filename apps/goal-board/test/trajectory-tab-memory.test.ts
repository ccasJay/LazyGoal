import assert from "node:assert/strict";
import test from "node:test";
import { resolveActiveDetailTab } from "../src/trajectory-tab-memory";

test("resolveActiveDetailTab 偏好 Tab 在可用列表中时保持偏好", () => {
  const tabs = ["Summary", "Input", "Result", "Timing", "Raw"];
  assert.equal(resolveActiveDetailTab(tabs, "Input"), "Input");
  assert.equal(resolveActiveDetailTab(tabs, "Result"), "Result");
  assert.equal(resolveActiveDetailTab(tabs, "Raw"), "Raw");
  assert.equal(resolveActiveDetailTab(tabs, "Timing"), "Timing");
  assert.equal(resolveActiveDetailTab(tabs, "Summary"), "Summary");
});

test("resolveActiveDetailTab 偏好 Tab 不在可用列表中时优雅回退 Summary", () => {
  const tabsWithoutInput = ["Summary", "Timing", "Raw"];
  assert.equal(resolveActiveDetailTab(tabsWithoutInput, "Input"), "Summary");
  assert.equal(resolveActiveDetailTab(tabsWithoutInput, "Result"), "Summary");
  assert.equal(resolveActiveDetailTab(tabsWithoutInput, "UnknownTab"), "Summary");
});

test("resolveActiveDetailTab 偏好 Tab 为空或未设置时默认返回 Summary", () => {
  const tabs = ["Summary", "Input", "Raw"];
  assert.equal(resolveActiveDetailTab(tabs, null), "Summary");
  assert.equal(resolveActiveDetailTab(tabs, undefined), "Summary");
  assert.equal(resolveActiveDetailTab(tabs, ""), "Summary");
});

test("模拟连续相邻事件导航过程中的 Tab 偏好保持与恢复", () => {
  // 事件 1：包含 Input 载荷，用户显式选中 Input 选项卡
  const event1Tabs = ["Summary", "Input", "Timing", "Raw"];
  let preferredTab: string | null = "Input";
  let activeTab = resolveActiveDetailTab(event1Tabs, preferredTab);
  assert.equal(activeTab, "Input");

  // 用户点击下一事件导航箭头，事件 2 不包含 Input 载荷
  // 保持 preferredTab 不变，activeTab 临时回退 Summary
  const event2Tabs = ["Summary", "Timing", "Raw"];
  activeTab = resolveActiveDetailTab(event2Tabs, preferredTab);
  assert.equal(activeTab, "Summary", "目标事件无对应载荷时应临时回退至 Summary");
  assert.equal(preferredTab, "Input", "偏好状态应被持久保留");

  // 用户继续导航至事件 3，该事件再次包含 Input 载荷
  const event3Tabs = ["Summary", "Input", "Result", "Timing", "Raw"];
  activeTab = resolveActiveDetailTab(event3Tabs, preferredTab);
  assert.equal(activeTab, "Input", "后续具备载荷的事件中应自动恢复所选偏好");

  // 用户直接在左侧列表点击事件 4，重置偏好为 Summary
  preferredTab = "Summary";
  activeTab = resolveActiveDetailTab(event3Tabs, preferredTab);
  assert.equal(activeTab, "Summary", "列表直接点击应重置为 Summary");
});
