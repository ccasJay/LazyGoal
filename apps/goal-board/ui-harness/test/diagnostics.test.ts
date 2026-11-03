import assert from "node:assert/strict";
import { test } from "node:test";
import { createDiagnosticsCollector, type DiagnosticsReport } from "../src/diagnostics";
import { launchEnvironment } from "../src/view-registry";

test("diagnostics collector reports ok: true when page has no errors", { timeout: 20_000 }, async () => {
  const env = await launchEnvironment({ view: "board" });
  try {
    const report = env.diagnostics.getReport();
    assert.equal(report.ok, true);
    assert.equal(report.failureCount, 0);
    assert.equal(report.consoleErrors.length, 0);
    assert.equal(report.pageErrors.length, 0);
  } finally {
    await env.cleanup();
  }
});

test("diagnostics collector collects console errors, page errors, and http errors", { timeout: 20_000 }, async () => {
  const env = await launchEnvironment({ view: "board" });
  try {
    // 1. 注入 console.error 与 warning
    await env.page.evaluate(() => {
      console.error("Test deliberate console error");
      console.warn("Test deliberate console warning");
    });

    // 2. 注入 pageerror (未捕获异常)
    await env.page.evaluate(() => {
      setTimeout(() => {
        throw new Error("Deliberate unhandled exception in page");
      }, 10);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 3. 触发 HTTP 404
    await env.page.evaluate(async () => {
      try {
        await fetch("/api/non-existent-route-for-testing-404");
      } catch {}
    });

    const report = env.diagnostics.getReport();
    assert.equal(report.ok, false);
    assert.ok(report.failureCount >= 3, `Expected at least 3 failures, got ${report.failureCount}`);

    assert.ok(report.consoleErrors.some((c) => c.text.includes("Test deliberate console error")));
    assert.ok(report.consoleWarnings.some((c) => c.text.includes("Test deliberate console warning")));
    assert.ok(report.pageErrors.some((p) => p.message.includes("Deliberate unhandled exception")));
    assert.ok(report.httpErrors.some((h) => h.status === 404 || h.status === 501));

    // 校验 JSON 格式
    const jsonStr = env.diagnostics.formatJson();
    const parsed = JSON.parse(jsonStr) as DiagnosticsReport;
    assert.equal(parsed.ok, false);
    assert.equal(parsed.view, "board");
  } finally {
    await env.cleanup();
  }
});

test("diagnostics collector honors whitelist ignorePatterns", { timeout: 20_000 }, async () => {
  const env = await launchEnvironment({
    view: "board",
    ignorePatterns: [/whitelisted-404/, "expected-console-issue"],
  });
  try {
    await env.page.evaluate(async () => {
      console.error("This is an expected-console-issue that should be ignored");
      try {
        await fetch("/api/whitelisted-404-route");
      } catch {}
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const report = env.diagnostics.getReport();
    assert.equal(report.ok, true, "All injected errors were whitelisted so report must be ok: true");
    assert.equal(report.failureCount, 0);
    assert.ok(report.ignored.length >= 2, "Ignored list should track matched whitelist items");
  } finally {
    await env.cleanup();
  }
});
