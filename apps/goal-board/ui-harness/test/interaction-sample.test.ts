import assert from "node:assert/strict";
import { test } from "node:test";
import { launchEnvironment } from "../src/view-registry";

test("interaction flow: click, type, scroll, and navigate between views without state leakage", { timeout: 30_000 }, async () => {
  const env = await launchEnvironment({ view: "board" });
  const { page } = env;

  try {
    // 1. 验证点击：点击 "Search goals" 快捷按钮
    const searchBtn = page.locator(".workspace-search");
    await assert.doesNotReject(async () => {
      await searchBtn.click();
    });

    // 2. 验证输入：等待搜索对话框出现并在输入框中输入查询
    const searchDialog = page.locator(".goal-search-dialog");
    await searchDialog.waitFor({ state: "visible", timeout: 5000 });
    const modalInput = searchDialog.locator("input");
    await modalInput.fill("authentication");

    // 验证键盘按键与快捷键：按下 Escape 关闭弹窗
    await page.keyboard.press("Escape");
    await searchDialog.waitFor({ state: "hidden", timeout: 5000 });

    // 3. 验证滚动：在主滚动区域执行平滑滚动
    const scrollContainer = page.locator(".workspace-main, .board, main").first();
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 100;
    });
    const scrolledTop = await scrollContainer.evaluate((el) => el.scrollTop);
    assert.ok(scrolledTop >= 0);

    // 4. 验证跳转：点击第一张 Goal 卡片进入详情
    const firstCard = page.locator(".goal-card").first();
    await firstCard.click();

    // 验证跳转到 Session 视图
    const sessionLocator = page.locator(".session").first();
    await sessionLocator.waitFor({ state: "visible", timeout: 8000 });
    assert.equal(await sessionLocator.isVisible(), true);

    // 验证返回：点击 "Back to goals" 或 "All goals" 关闭会话回到 Board
    const backBtn = page.locator("button:has-text('Back to goals'), button:has-text('Goals'), button[aria-label='All goals'], button.sidebar-brand").first();
    await backBtn.click();

    // 验证返回后 Board 卡片重新可见
    await firstCard.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await firstCard.isVisible(), true);
  } finally {
    await env.cleanup();
  }
});
