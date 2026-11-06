import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureServer } from "../src/fixture-server";
import { sessionCommandScenario } from "../src/scenarios";

interface ActivityResponse {
  readonly runs: readonly { readonly runId: string; readonly status: string }[];
}

async function readActivity(origin: string): Promise<ActivityResponse> {
  const response = await fetch(`${origin}/api/goals/goal-session-command/activity`);
  return (await response.json()) as ActivityResponse;
}

test("fixture accepts a message, advances the Run, and records the intent", { timeout: 20_000 }, async () => {
  const server = await createFixtureServer({ scenario: sessionCommandScenario });

  try {
    const response = await fetch(`${server.origin}/api/control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "session_input",
        intentId: "intent-fixture-1",
        goalId: "goal-session-command",
        input: { kind: "message", inputId: "intent-fixture-1", content: "Continue the deployment." },
      }),
    });

    assert.equal(response.status, 200);
    const receipt = (await response.json()) as { status: string; result?: { kind: string } };
    assert.equal(receipt.status, "accepted");
    assert.equal(receipt.result?.kind, "session_input");

    const accepted = await readActivity(server.origin);
    assert.deepEqual(accepted.runs.map((run) => run.status), ["completed", "running"]);

    const deadline = Date.now() + 8_000;
    let terminal = accepted;
    while (terminal.runs.at(-1)?.status !== "completed" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      terminal = await readActivity(server.origin);
    }
    assert.deepEqual(terminal.runs.map((run) => run.status), ["completed", "completed"]);

    const intents = server.getReceivedIntents();
    assert.equal(intents.length, 1);
    const intent = intents[0];
    assert.equal(intent.kind, "session_input");
    if (intent.kind === "session_input") {
      assert.equal(intent.input.kind, "message");
      assert.equal(intent.input.content, "Continue the deployment.");
    }
  } finally {
    await server.close();
  }
});
