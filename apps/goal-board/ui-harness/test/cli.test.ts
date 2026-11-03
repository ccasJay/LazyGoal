import assert from "node:assert/strict";
import { test } from "node:test";
import { runCli, resolveUserPath } from "../src/cli";
import { createFixtureServer } from "../src/fixture-server";
import { boardPopulatedScenario } from "../src/scenarios/board-scenarios";

test("cli shot command succeeds on Board view and returns code 0", { timeout: 25_000 }, async () => {
  const code = await runCli(["shot", "--view", "board", "--json"]);
  assert.equal(code, 0);
});

test("cli inspect command succeeds on Settings view and returns code 0", { timeout: 25_000 }, async () => {
  const code = await runCli(["inspect", "--view", "settings", "--json"]);
  assert.equal(code, 0);
});

test("cli rejects invalid view name with code 1", async () => {
  const code = await runCli(["shot", "--view", "invalid-non-existent-view"]);
  assert.equal(code, 1);
});

test("resolveUserPath resolves relative to the invoking npm directory", () => {
  const previous = process.env.INIT_CWD;
  process.env.INIT_CWD = "/tmp/lazygoal-invocation";
  try {
    assert.equal(resolveUserPath("shots/a.png"), "/tmp/lazygoal-invocation/shots/a.png");
  } finally {
    if (previous === undefined) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = previous;
  }
});

test("cli attach mode connects to already-running service without starting second fixture", { timeout: 25_000 }, async () => {
  const server = await createFixtureServer({
    scenario: boardPopulatedScenario,
  });

  try {
    const code = await runCli([
      "inspect",
      "--view",
      "board",
      "--attach",
      server.launchUrl,
      "--json",
    ]);
    assert.equal(code, 0);
  } finally {
    await server.close();
  }
});
