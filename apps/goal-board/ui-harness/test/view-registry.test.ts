import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VIEW_REGISTRY,
  launchEnvironment,
  type ViewName,
} from "../src/view-registry";

test("view registry contains all 4 required view definitions", () => {
  const views: ViewName[] = ["board", "session", "trajectory", "settings"];
  for (const v of views) {
    const def = VIEW_REGISTRY[v];
    assert.ok(def, `VIEW_REGISTRY must contain ${v}`);
    assert.equal(def.name, v);
    assert.ok(def.readySelector.length > 0);
  }
});

test("launchEnvironment fails fast with dist_not_built when index.html is missing", async () => {
  await assert.rejects(
    async () => {
      await launchEnvironment({
        view: "board",
        distDir: "/tmp/non-existent-dist-dir-12345",
      });
    },
    /dist_not_built/,
  );
});

test("launchEnvironment rejects nonexistent goal without silent fallback", async () => {
  await assert.rejects(
    async () => {
      await launchEnvironment({
        view: "session",
        goalId: "non-existent-goal-9999",
      });
    },
    /goal_not_found/,
  );
});

test("launchEnvironment successfully opens Board view", { timeout: 20_000 }, async () => {
  const env = await launchEnvironment({ view: "board" });
  try {
    const heading = await env.page.locator("main h1").innerText();
    assert.match(heading, /Goals/);
    const count = await env.page.locator(".goal-card").count();
    assert.equal(count, 3);
  } finally {
    await env.cleanup();
  }
});

test("launchEnvironment successfully opens Settings view", { timeout: 20_000 }, async () => {
  const env = await launchEnvironment({ view: "settings" });
  try {
    const dialogVisible = await env.page.locator(".settings-dialog").isVisible();
    assert.equal(dialogVisible, true);
    const title = await env.page.locator(".settings-dialog-title").innerText();
    assert.equal(title, "Settings");
    const settingsVisible = await env.page.locator(".settings-page").isVisible();
    assert.equal(settingsVisible, true);
  } finally {
    await env.cleanup();
  }
});

test("launchEnvironment successfully opens Session view without fallback", { timeout: 20_000 }, async () => {
  const env = await launchEnvironment({ view: "session" });
  try {
    const sessionVisible = await env.page.locator(".session").isVisible();
    assert.equal(sessionVisible, true);
    const content = await env.page.locator(".session").innerText();
    assert.match(content, /payment/i);
  } finally {
    await env.cleanup();
  }
});

test("launchEnvironment successfully opens Trajectory view without fallback", { timeout: 20_000 }, async () => {
  const env = await launchEnvironment({ view: "trajectory" });
  try {
    const sessionVisible = await env.page.locator(".session").isVisible();
    assert.equal(sessionVisible, true);
    const tabActive = await env.page.locator(".session-tab-buttons button[aria-selected='true']").first().getAttribute("aria-label").catch(() => null);
    assert.ok(tabActive === "Trajectory" || (await env.page.locator(".trajectory, .trajectory-layout").count()) > 0);
  } finally {
    await env.cleanup();
  }
});
