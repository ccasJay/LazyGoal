import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureServer } from "../src/fixture-server";
import type { FixtureScenario } from "../src/fixture-types";
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

test("settings scenario serves valid provider profiles, models, and permission profile", async () => {
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

    // 3. 权限档位三轴
    const profileRes = await fetch(`${server.origin}/api/project/permission-profile`);
    assert.equal(profileRes.status, 200);
    const profileData = (await profileRes.json()) as {
      ok: boolean;
      profile: { sandbox: string; approvals: string; reviewer: string; writableRoots: string[] };
      revision: number;
    };
    assert.equal(profileData.ok, true);
    assert.equal(profileData.profile.sandbox, "workspace-write");
    assert.equal(profileData.profile.approvals, "on-request");
    assert.equal(profileData.profile.reviewer, "user");
    assert.deepEqual(profileData.profile.writableRoots, []);
    assert.equal(profileData.revision, 1);
  } finally {
    await server.close();
  }
});

test("exemption endpoints return the boundary scope and drop revoked exemptions", async () => {
  const scenario: FixtureScenario = {
    id: "exemptions",
    permissionExemptions: {
      "goal-1": {
        data: [
          {
            id: "exemption-1",
            scope: "workspace",
            network: "all_outbound",
            extraFiles: [{ canonicalPath: "/tmp/shared", access: "write", kind: "directory_tree" }],
            status: "active",
          },
        ],
      },
    },
  };
  const server = await createFixtureServer({ scenario });
  try {
    const listRes = await fetch(`${server.origin}/api/goals/goal-1/exemptions?runId=run-1`);
    assert.equal(listRes.status, 200);
    const listData = (await listRes.json()) as {
      ok: boolean;
      goalId: string;
      runId: string;
      exemptions: Array<{ id: string; network: string; extraFiles: Array<{ canonicalPath: string }> }>;
    };
    assert.equal(listData.ok, true);
    assert.equal(listData.runId, "run-1");
    assert.equal(listData.exemptions.length, 1);
    assert.equal(listData.exemptions[0]?.network, "all_outbound");
    assert.equal(listData.exemptions[0]?.extraFiles[0]?.canonicalPath, "/tmp/shared");

    const revokeRes = await fetch(`${server.origin}/api/goals/goal-1/exemptions/exemption-1`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: "run-1" }),
    });
    assert.equal(revokeRes.status, 200);
    const revokeData = (await revokeRes.json()) as { runId: string; exemptions: Array<{ id: string }> };
    assert.equal(revokeData.runId, "run-1");
    assert.deepEqual(revokeData.exemptions, []);

    const afterRes = await fetch(`${server.origin}/api/goals/goal-1/exemptions?runId=run-1`);
    const afterData = (await afterRes.json()) as { exemptions: Array<{ id: string }> };
    assert.deepEqual(afterData.exemptions, []);
  } finally {
    await server.close();
  }
});
