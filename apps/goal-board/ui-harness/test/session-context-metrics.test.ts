import assert from "node:assert/strict";
import { test } from "node:test";
import { launchEnvironment } from "../src/view-registry";
import { sessionContextMetricsScenario, sessionContextUnavailableScenario } from "../src/scenarios/session-scenarios";

test("session metrics bar shows used context percent with an accessible estimate detail", { timeout: 30_000 }, async () => {
  const env = await launchEnvironment({ view: "session", scenario: sessionContextMetricsScenario });
  const { page } = env;
  try {
    const metric = page.locator(".session-metric[data-context-state]");
    await metric.waitFor({ state: "visible" });

    assert.equal(await metric.getAttribute("data-context-state"), "estimated");
    const text = (await metric.textContent()) ?? "";
    assert.match(text, /Context 62%/);
    assert.match(text, /\*/);

    const detail = (await metric.getAttribute("aria-label")) ?? "";
    assert.match(detail, /Context used 62%/);
    assert.match(detail, /200K tokens/);
    assert.match(detail, /configured limit/);
    assert.match(detail, /estimated from the request/);

    await metric.focus();
    const tooltip = page.getByRole("tooltip");
    await tooltip.waitFor({ state: "visible" });
    assert.match((await tooltip.textContent()) ?? "", /configured limit/);
  } finally {
    await env.cleanup();
  }
});

test("session metrics bar reports unavailable context without a fabricated percentage", { timeout: 30_000 }, async () => {
  const env = await launchEnvironment({ view: "session", scenario: sessionContextUnavailableScenario });
  const { page } = env;
  try {
    const metric = page.locator(".session-metric[data-context-state]");
    await metric.waitFor({ state: "visible" });

    assert.equal(await metric.getAttribute("data-context-state"), "unavailable");
    assert.match((await metric.textContent()) ?? "", /unavailable/);
    assert.doesNotMatch((await metric.textContent()) ?? "", /%/);
    const detail = (await metric.getAttribute("aria-label")) ?? "";
    assert.match(detail, /Context usage unavailable/);
    assert.doesNotMatch(detail, /%/);
  } finally {
    await env.cleanup();
  }
});
