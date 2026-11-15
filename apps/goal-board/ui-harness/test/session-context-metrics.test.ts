import assert from "node:assert/strict";
import { test } from "node:test";
import { launchEnvironment } from "../src/view-registry";
import { sessionContextMetricsScenario, sessionContextUnavailableScenario } from "../src/scenarios/session-scenarios";

test("the context ring beside the model reveals usage on hover and keyboard activation", { timeout: 30_000 }, async () => {
  const env = await launchEnvironment({ view: "session", scenario: sessionContextMetricsScenario });
  const { page } = env;
  try {
    const metric = page.getByRole("button", { name: "Context window" });
    await page.locator(".context-window-trigger[data-context-state=estimated]").waitFor({ state: "visible" });

    assert.equal(await metric.getAttribute("data-context-state"), "estimated");
    assert.equal(await metric.evaluate((button) => button.nextElementSibling?.classList.contains("current-model-control")), true);
    assert.match(await metric.locator(".context-ring").evaluate((ring) => getComputedStyle(ring).backgroundImage), /\b62%/);
    const tooltip = page.locator(".context-window-tooltip");
    await metric.hover();
    await tooltip.waitFor({ state: "visible" });
    const detail = (await tooltip.innerText()) ?? "";
    assert.match(detail, /62% full/);
    assert.match(detail, /124K \/ 200K tokens used/);
    assert.match(detail, /Estimated from the request, Configured limit/);
    await tooltip.hover();
    assert.equal(await tooltip.isVisible(), true);
    await page.keyboard.press("Escape");
    await tooltip.waitFor({ state: "hidden" });

    await metric.focus();
    await tooltip.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await tooltip.waitFor({ state: "hidden" });
    await metric.press("Enter");
    await tooltip.waitFor({ state: "visible" });
    assert.equal(await metric.getAttribute("aria-expanded"), "true");
  } finally {
    await env.cleanup();
  }
});

test("the context ring shows a visible arc for usage below one percent", { timeout: 30_000 }, async () => {
  const goalId = "goal-session-waiting";
  const metrics = sessionContextMetricsScenario.metrics?.[goalId]?.data;
  assert.ok(metrics);
  const env = await launchEnvironment({
    view: "session",
    scenario: {
      ...sessionContextMetricsScenario,
      metrics: {
        [goalId]: {
          data: {
            ...metrics,
            contextCapacity: { capacityTokens: 200000, source: "model" },
            contextUsage: { usedPercent: 0.0028, capacityTokens: 200000, source: "model", estimated: false },
          },
        },
      },
    },
  });
  try {
    const metric = env.page.locator(".context-window-trigger[data-context-state=reported]");
    await metric.waitFor({ state: "visible" });
    assert.match(await metric.locator(".context-ring").evaluate((ring) => getComputedStyle(ring).backgroundImage), /\b6%/);
    await metric.hover();
    const tooltip = env.page.getByRole("tooltip");
    await tooltip.waitFor({ state: "visible" });
    assert.match(await tooltip.innerText(), /0\.28% full/);
  } finally {
    await env.cleanup();
  }
});

test("the context indicator explains unavailable usage without a fabricated percentage", { timeout: 30_000 }, async () => {
  const env = await launchEnvironment({ view: "session", scenario: sessionContextUnavailableScenario });
  const { page } = env;
  try {
    const metric = page.getByRole("button", { name: "Context window" });
    await metric.waitFor({ state: "visible" });
    await page.getByText("1 run, 3 steps", { exact: true }).waitFor({ state: "visible" });

    assert.equal(await metric.getAttribute("data-context-state"), "capacity-only");
    assert.equal(await metric.locator(".context-ring").count(), 0);
    await metric.click();
    const tooltip = page.locator(".context-window-tooltip");
    await tooltip.waitFor({ state: "visible" });
    const detail = (await tooltip.innerText()) ?? "";
    assert.match(detail, /Usage unavailable/);
    assert.match(detail, /1M token window/);
    assert.match(detail, /No settled usage for this model/);
    assert.doesNotMatch(detail, /%/);
  } finally {
    await env.cleanup();
  }
});
