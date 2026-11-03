import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureServer } from "../src/fixture-server";
import {
  boardEmptyScenario,
  boardErrorScenario,
  boardLoadingScenario,
  boardPopulatedScenario,
} from "../src/scenarios/board-scenarios";

test("board populated scenario returns validated goals and metrics", async () => {
  const server = await createFixtureServer({ scenario: boardPopulatedScenario });
  try {
    const res = await fetch(`${server.origin}/api/goals`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { goals: Array<{ goalId: string; intent: string; runStatus: string }> };
    assert.equal(data.goals.length, 3);
    assert.equal(data.goals[0]?.goalId, "goal-auth-jwt");
    assert.equal(data.goals[0]?.runStatus, "running");
    assert.equal(data.goals[1]?.runStatus, "waiting");
    assert.equal(data.goals[2]?.runStatus, "completed");

    const metricsRes = await fetch(`${server.origin}/goals/goal-auth-jwt/metrics`);
    assert.equal(metricsRes.status, 200);
    const metricsData = (await metricsRes.json()) as { goalId: string; stepCount: number; tokensPerSecond: number };
    assert.equal(metricsData.goalId, "goal-auth-jwt");
    assert.equal(metricsData.stepCount, 8);
    assert.equal(metricsData.tokensPerSecond, 42.1);
  } finally {
    await server.close();
  }
});

test("board empty scenario returns empty goals list", async () => {
  const server = await createFixtureServer({ scenario: boardEmptyScenario });
  try {
    const res = await fetch(`${server.origin}/api/goals`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { goals: unknown[]; unreadableCount: number };
    assert.equal(data.goals.length, 0);
    assert.equal(data.unreadableCount, 0);
  } finally {
    await server.close();
  }
});

test("board error scenario returns 500 with custom code", async () => {
  const server = await createFixtureServer({ scenario: boardErrorScenario });
  try {
    const res = await fetch(`${server.origin}/api/goals`);
    assert.equal(res.status, 500);
    const data = (await res.json()) as { code: string };
    assert.equal(data.code, "failed_to_load_goals");
  } finally {
    await server.close();
  }
});

test("board loading scenario delays response until aborted or timeout", async () => {
  const server = await createFixtureServer({ scenario: boardLoadingScenario });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 100);
    await assert.rejects(
      async () => {
        await fetch(`${server.origin}/api/goals`, { signal: controller.signal });
      },
      { name: "AbortError" },
    );
    clearTimeout(timeout);
  } finally {
    await server.close();
  }
});
