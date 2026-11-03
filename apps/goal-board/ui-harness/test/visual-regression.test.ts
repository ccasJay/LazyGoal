import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("four desktop visual baselines exist and have valid file sizes", () => {
  const baselines = ["board.png", "session.png", "trajectory.png", "settings.png"];
  for (const name of baselines) {
    const fullPath = resolve(`apps/goal-board/ui-harness/visual/baselines/${name}`);
    assert.ok(existsSync(fullPath), `Baseline ${name} must exist in repository`);
    const stats = statSync(fullPath);
    assert.ok(stats.size > 20_000, `Baseline ${name} size (${stats.size} bytes) should be > 20KB`);
  }
});
