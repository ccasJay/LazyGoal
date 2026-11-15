import assert from "node:assert/strict";
import { test } from "node:test";
import { launchEnvironment } from "../src/view-registry";

test("a small upward wheel movement pauses following when activity grows", { timeout: 30_000 }, async () => {
  const env = await launchEnvironment({ view: "session" });
  const { page } = env;
  try {
    const timeline = page.locator(".timeline");
    await timeline.evaluate(element => {
      const spacer = document.createElement("div");
      spacer.id = "scroll-test-spacer";
      spacer.style.height = "1600px";
      element.querySelector(".session-timeline-feed")!.append(spacer);
    });
    await page.waitForFunction(() => {
      const element = document.querySelector<HTMLElement>(".timeline")!;
      return element.scrollHeight - element.clientHeight - element.scrollTop < 2;
    });
    await timeline.hover();
    await page.mouse.wheel(0, -30);
    await page.getByRole("button", { name: "Jump to latest" }).waitFor({ state: "visible" });
    const before = await timeline.evaluate(element => element.scrollTop);
    await page.locator("#scroll-test-spacer").evaluate(element => { element.style.height = "1800px"; });
    await page.waitForTimeout(200);
    const after = await timeline.evaluate(element => element.scrollTop);
    assert.ok(Math.abs(after - before) < 2, `reading position changed from ${before} to ${after}`);
    await page.getByRole("button", { name: "Jump to latest" }).click();
    await page.waitForFunction(() => {
      const element = document.querySelector<HTMLElement>(".timeline")!;
      return element.scrollHeight - element.clientHeight - element.scrollTop < 2;
    });
  } finally {
    await env.cleanup();
  }
});
