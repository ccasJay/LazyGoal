import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureServer } from "../src/fixture-server";
import { sessionWaitingScenario } from "../src/scenarios/session-scenarios";
import { trajectoryScenario } from "../src/scenarios/trajectory-scenarios";
import { settingsScenario } from "../src/scenarios/settings-scenarios";

test("session waiting scenario serves valid envelopes, activity, and interaction details", async () => {
  const server = await createFixtureServer({ scenario: sessionWaitingScenario });
  try {
    const goalId = "goal-session-waiting";

    // 1. 窄状态信封
    const stateRes = await fetch(`${server.origin}/api/goals/${goalId}?view=state`);
    assert.equal(stateRes.status, 200);
    const stateData = (await stateRes.json()) as { goal: { goalId: string; runStatus: string }; session: { waitingFor: string } };
    assert.equal(stateData.goal.goalId, goalId);
    assert.equal(stateData.goal.runStatus, "waiting");
    assert.equal(stateData.session.waitingFor, "ask_user");

    // 2. 交互详情
    const detailRes = await fetch(
      `${server.origin}/api/goals/${goalId}/interaction-details?runId=run-payment-1&interactionId=interaction-ask-1`,
    );
    assert.equal(detailRes.status, 200);
    const detailData = (await detailRes.json()) as { ok: boolean; detail: { kind: string; questions: Array<{ id: string }> } };
    assert.equal(detailData.ok, true);
    assert.equal(detailData.detail.kind, "question");
    assert.equal(detailData.detail.questions[0]?.id, "q-gateway");

    // 3. 活动时间线
    const activityRes = await fetch(`${server.origin}/api/goals/${goalId}/activity`);
    assert.equal(activityRes.status, 200);
    const activityData = (await activityRes.json()) as { items: Array<{ type: string }> };
    assert.equal(activityData.items.length, 2);
    assert.equal(activityData.items[0]?.type, "message");
    assert.equal(activityData.items[1]?.type, "fact");
  } finally {
    await server.close();
  }
});

test("trajectory scenario serves valid runs, page, timeline, and detail", async () => {
  const server = await createFixtureServer({ scenario: trajectoryScenario });
  try {
    const goalId = "goal-trajectory-audit";

    // 1. Runs 列表
    const runsRes = await fetch(`${server.origin}/api/goals/${goalId}/trajectory/runs`);
    assert.equal(runsRes.status, 200);
    const runsData = (await runsRes.json()) as { runs: Array<{ runId: string; committedThroughSequence: number }> };
    assert.equal(runsData.runs.length, 1);
    assert.equal(runsData.runs[0]?.runId, "run-audit-1");
    assert.equal(runsData.runs[0]?.committedThroughSequence, 4);

    // 2. 轨迹分页
    const pageRes = await fetch(`${server.origin}/api/goals/${goalId}/trajectory`);
    assert.equal(pageRes.status, 200);
    const pageData = (await pageRes.json()) as { total: number; entries: Array<{ sequence: number; eventType: string }> };
    assert.equal(pageData.total, 4);
    assert.equal(pageData.entries.length, 4);
    assert.equal(pageData.entries[1]?.eventType, "model_request");

    // 3. 时间线桶
    const timelineRes = await fetch(`${server.origin}/api/goals/${goalId}/trajectory/timeline`);
    assert.equal(timelineRes.status, 200);
    const timelineData = (await timelineRes.json()) as { eventCount: number; buckets: Array<{ eventCount: number }> };
    assert.equal(timelineData.eventCount, 4);
    assert.equal(timelineData.buckets[0]?.eventCount, 4);

    // 4. 事件详情
    const detailRes = await fetch(`${server.origin}/api/goals/${goalId}/trajectory/events/2`);
    assert.equal(detailRes.status, 200);
    const detailData = (await detailRes.json()) as { event: { sequence: number; eventType: string } };
    assert.equal(detailData.event.sequence, 2);
    assert.equal(detailData.event.eventType, "model_request");
  } finally {
    await server.close();
  }
});

test("settings scenario serves valid provider profiles, models, and permission mode", async () => {
  const server = await createFixtureServer({ scenario: settingsScenario });
  try {
    // 1. Providers 设置
    const providersRes = await fetch(`${server.origin}/api/providers`);
    assert.equal(providersRes.status, 200);
    const providersData = (await providersRes.json()) as { activeProfileId: string; profiles: Array<{ id: string; label: string }> };
    assert.equal(providersData.activeProfileId, "prof-openai");
    assert.equal(providersData.profiles.length, 2);
    assert.equal(providersData.profiles[0]?.id, "prof-openai");

    // 2. Models 目录
    const modelsRes = await fetch(`${server.origin}/api/models`);
    assert.equal(modelsRes.status, 200);
    const modelsData = (await modelsRes.json()) as { currentModelId: string; models: Array<{ id: string }> };
    assert.equal(modelsData.currentModelId, "gpt-4o");
    assert.equal(modelsData.models.length, 3);

    // 3. Permission 模式
    const permRes = await fetch(`${server.origin}/api/project/permission-mode`);
    assert.equal(permRes.status, 200);
    const permData = (await permRes.json()) as { ok: boolean; mode: string };
    assert.equal(permData.ok, true);
    assert.equal(permData.mode, "default");
  } finally {
    await server.close();
  }
});
