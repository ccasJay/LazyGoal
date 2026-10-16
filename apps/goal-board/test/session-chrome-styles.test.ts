import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

async function readStyleCss(): Promise<string> {
  return readFile(join(import.meta.dirname, "..", "src", "style.css"), "utf8");
}

test("session mode intro renders as a centered notice bar", async () => {
  const style = await readStyleCss();
  const match = style.match(/\.session-intro\s*\{([^}]*)\}/);
  assert.ok(match, ".session-intro rule required");
  assert.match(match![1]!, /var\(--accent-ink\)/);
  assert.match(match![1]!, /text-align:\s*center/);
});

test("recoverable resume actions lay out horizontally and right-aligned", async () => {
  const style = await readStyleCss();
  const row = style.match(/\.composer-recover-row\s*\{([^}]*)\}/);
  assert.ok(row, ".composer-recover-row rule required");
  assert.match(row![1]!, /display:\s*grid/);
  const actions = style.match(/\.composer-recover-actions\s*\{([^}]*)\}/);
  assert.ok(actions, ".composer-recover-actions rule required");
  assert.match(actions![1]!, /display:\s*flex/);
  assert.match(actions![1]!, /justify-content:\s*flex-end/);
});
