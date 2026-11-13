import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { launchEnvironment } from "../src/view-registry";

test("harness writes nothing into the configured LazyGoal Home", { timeout: 25_000 }, async () => {
  const base = await mkdtemp(join(tmpdir(), "lazygoal-ui-harness-isolation-"));
  const home = join(base, "home");
  await mkdir(home, { recursive: true });
  const previousHome = process.env.LAZYGOAL_HOME;
  process.env.LAZYGOAL_HOME = home;

  try {
    const env = await launchEnvironment({ view: "board" });
    try {
      const entries = await readdir(home);
      assert.deepEqual(entries, [], "The harness must not create files in LazyGoal Home");
    } finally {
      await env.cleanup();
    }

    const afterCleanup = await readdir(home);
    assert.deepEqual(afterCleanup, [], "The harness must not write LazyGoal Home during cleanup");
  } finally {
    if (previousHome === undefined) delete process.env.LAZYGOAL_HOME;
    else process.env.LAZYGOAL_HOME = previousHome;
    await rm(base, { recursive: true, force: true });
  }
});
