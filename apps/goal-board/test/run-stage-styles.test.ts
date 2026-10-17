import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

async function readStyleCss(): Promise<string> {
  return readFile(join(import.meta.dirname, "..", "src", "style.css"), "utf8");
}

test("run plan stage groups receive committed terminal styles", async () => {
  const style = await readStyleCss();
  for (const selector of [
    ".run-stages-container",
    ".run-stage-group",
    ".run-stage-heading",
    ".stage-target",
    ".stage-status",
    ".stage-revision",
    ".stage-content",
    ".stage-steps",
    ".stage-rejection-feedback",
    ".run-level-steps",
  ]) {
    assert.match(
      style,
      new RegExp(`${selector.replace(/\./g, "\\.")}\\s*\\{`),
      `${selector} must be styled in style.css`,
    );
  }
});

test("stage status badge distinguishes in-progress, review and accepted states", async () => {
  const style = await readStyleCss();
  assert.match(style, /\.stage-status\.in_progress/);
  assert.match(style, /\.stage-status\.review_pending/);
  assert.match(style, /\.stage-status\.accepted/);
});

test("review rejection feedback uses the warning surface", async () => {
  const style = await readStyleCss();
  const match = style.match(/\.stage-rejection-feedback\s*\{([^}]*)\}/);
  assert.ok(match, ".stage-rejection-feedback rule required");
  assert.match(match![1]!, /var\(--warning-border\)/);
  assert.match(match![1]!, /var\(--warning-soft\)/);
});
