import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

async function readStyleCss(): Promise<string> {
  return readFile(join(import.meta.dirname, "..", "src", "style.css"), "utf8");
}

test("approved plan route and timeline stages keep their committed terminal styles", async () => {
  const style = await readStyleCss();
  for (const selector of [
    ".plan-route-stage",
    ".plan-route-stage-heading",
    ".plan-route-index",
    ".plan-route-status",
    ".timeline-stage-target",
    ".timeline-run-summary",
    ".timeline-activity",
    ".timeline-activity-heading",
    ".timeline-activity-members",
    ".timeline-activity-member-label",
    ".timeline-activity-member-status",
    ".timeline-terminal",
  ]) {
    assert.match(
      style,
      new RegExp(`${selector.replace(/\./g, "\\.")}\\s*\\{`),
      `${selector} must be styled in style.css`,
    );
  }
});

test("stage and run terminal statuses distinguish their states", async () => {
  const style = await readStyleCss();
  assert.match(style, /\.plan-route-status\.executing/);
  assert.match(style, /\.plan-route-status\.accepted/);
  assert.match(style, /\.timeline-terminal\.completed/);
  assert.match(style, /\.timeline-terminal\.failed/);
  assert.match(style, /\.timeline-terminal\.cancelled/);
});

test("rejected activity uses the warning surface", async () => {
  const style = await readStyleCss();
  const match = style.match(/\.timeline-activity-status\.rejected\s*\{([^}]*)\}/);
  assert.ok(match, ".timeline-activity-status.rejected rule required");
  assert.match(match![1]!, /var\(--warning\)/);
});
