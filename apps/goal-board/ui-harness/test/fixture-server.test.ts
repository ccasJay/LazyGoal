import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureServer } from "../src/fixture-server";
import type { FixtureScenario } from "../src/fixture-types";

test("fixture server serves validated contract responses and catches invalid contracts", async () => {
  const scenario: FixtureScenario = {
    id: "test-scenario",
    workspace: {
      data: {
        workspaceRoot: "/test/workspace",
        worktreeRoot: null,
        branch: "main",
      },
    },
    goals: {
      data: {
        goals: [
          {
            goalId: "goal-1",
            runId: "run-1",
            intent: "Do something",
            workflowPhase: "executing",
            runStatus: "waiting",
            updatedAt: "2026-01-01T00:00:00.000Z",
            archived: false,
          },
        ],
        unreadableCount: 0,
      },
    },
  };

  const server = await createFixtureServer({ scenario });

  try {
    // 1. 正常契约校验响应
    const wsRes = await fetch(`${server.origin}/api/project/workspace`);
    assert.equal(wsRes.status, 200);
    const wsData = (await wsRes.json()) as { workspaceRoot: string; branch: string };
    assert.equal(wsData.workspaceRoot, "/test/workspace");
    assert.equal(wsData.branch, "main");

    const goalsRes = await fetch(`${server.origin}/api/goals`);
    assert.equal(goalsRes.status, 200);
    const goalsData = (await goalsRes.json()) as { goals: Array<{ goalId: string }> };
    assert.equal(goalsData.goals.length, 1);
    assert.equal(goalsData.goals[0]?.goalId, "goal-1");

    // 2. 模拟契约破坏：当服务端数据不符合 web-contracts 时，必须拦截并返回 500
    server.updateScenario({
      ...scenario,
      workspace: {
        // @ts-expect-error 故意传入非法类型
        data: { workspaceRoot: 12345, invalidField: true },
      },
    });

    const brokenRes = await fetch(`${server.origin}/api/project/workspace`);
    assert.equal(brokenRes.status, 500);
    const brokenData = (await brokenRes.json()) as { code: string };
    assert.equal(brokenData.code, "fixture_contract_validation_failed");

    // 3. 模拟端点覆盖模式：error 模式返回 500
    server.updateScenario({
      ...scenario,
      goals: {
        mode: "error",
        errorStatus: 503,
        errorCode: "service_unavailable",
      },
    });

    const errorRes = await fetch(`${server.origin}/api/goals`);
    assert.equal(errorRes.status, 503);
    const errorData = (await errorRes.json()) as { code: string };
    assert.equal(errorData.code, "service_unavailable");

    // 4. 未处理端点返回 501
    const unhandledRes = await fetch(`${server.origin}/api/unknown/endpoint`);
    assert.equal(unhandledRes.status, 501);
    const unhandledData = (await unhandledRes.json()) as { error: string };
    assert.equal(unhandledData.error, "unhandled_fixture_route");

    // 5. SSE 事件流传输与契约校验
    server.updateScenario({
      ...scenario,
      events: {
        "goal-1": {
          initialEvents: [
            {
              type: "state_sync",
              goalId: "goal-1",
              state: {
                goalId: "goal-1",
                runId: "run-1",
                runStatus: "waiting",
                mode: "plan",
                commitRevision: 1,
                queueRevision: 1,
                queuePaused: false,
                pendingMessageCount: 0,
                pendingSteerCount: 0,
                messages: { count: 0, recent: [] },
                needsRecovery: false,
                executionOwner: true,
              },
            },
          ],
        },
      },
    });

    const eventsRes = await fetch(`${server.origin}/api/goals/goal-1/events`, {
      headers: { accept: "text/event-stream" },
    });
    assert.equal(eventsRes.status, 200);
    assert.match(eventsRes.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = eventsRes.body?.getReader();
    assert.ok(reader);
    let text = "";
    while (!text.includes("state_sync")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    assert.match(text, /data: .*"state_sync"/);
    await reader.cancel();

    // 6. 静态资源与 SPA fallback 服务
    const rootRes = await fetch(`${server.origin}/`, {
      headers: { accept: "text/html" },
    });
    assert.equal(rootRes.status, 200);
    assert.match(rootRes.headers.get("content-type") ?? "", /text\/html/);
    const htmlText = await rootRes.text();
    assert.ok(htmlText.length > 0);
  } finally {
    await server.close();
  }
});
