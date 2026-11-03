import assert from "node:assert/strict";
import { test } from "node:test";
import { runCli } from "../src/cli";
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
