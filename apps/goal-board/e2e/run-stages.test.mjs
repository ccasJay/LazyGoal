import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const webUrl = "http://127.0.0.1:4174";
const token = "e2e-token-stages";

test("Web goal session presents run stages, revisions, Activity summaries, and Trajectory details", async () => {
  const mock = createStageMockApi();
  const apiAddress = await listen(mock.server);
  const apiPort = Number(new URL(apiAddress).port);
  const webServer = spawn(
    process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4174", "--strictPort"],
    {
      cwd: root,
      env: { ...process.env, LAZYGOAL_E2E_API_PORT: String(apiPort) },
      stdio: "ignore",
    },
  );
  const profile = await mkdtemp(join(tmpdir(), "lazygoal-stages-e2e-"));
  let chrome;
  let socket;

  try {
    await waitForHttp(`${webUrl}/`);
    chrome = spawn(findChrome(), [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ], { stdio: "ignore" });
    const devtools = await waitForDevtools(profile, chrome);
    const targets = await (await fetch(`http://127.0.0.1:${devtools.port}/json/list`)).json();
    const target = targets.find((item) => item.type === "page");
    assert.ok(target?.webSocketDebuggerUrl, "Chrome exposes a page target");
    socket = await connectCdp(target.webSocketDebuggerUrl);
    await cdp(socket, "Page.enable");
    await cdp(socket, "Runtime.enable");

    await navigate(socket, `${webUrl}/?session=desktop#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });

    await waitForExpression(socket, "document.querySelector('.session .timeline-run-summary') !== null");

    // 1. 验证 Run 分界与当前 Run 标识
    assert.match(await value(socket, "document.querySelector('.session .timeline-run-summary').innerText"), /Run 1/);
    assert.match(await value(socket, "document.querySelector('.session .timeline-run-summary').innerText"), /Current/);

    // 2. 验证获批 Plan 路线阶段数量
    const stageGroupsCount = await value(socket, "document.querySelectorAll('.plan-route-stage').length");
    assert.equal(stageGroupsCount, 2);

    // 3. 验证 Stage 1: Accepted 状态，不展示阶段结果摘要或 Run completed
    const stage1Target = await value(socket, "document.querySelectorAll('.plan-route-stage')[0].querySelector('.plan-route-stage-heading strong').textContent");
    assert.equal(stage1Target, "Alpha Setup");
    const stage1Status = await value(socket, "document.querySelectorAll('.plan-route-stage')[0].querySelector('.plan-route-status').textContent");
    assert.equal(stage1Status, "Accepted");
    assert.doesNotMatch(await value(socket, "document.querySelectorAll('.plan-route-stage')[0].innerText"), /Alpha completed successfully/);
    assert.doesNotMatch(await value(socket, "document.querySelector('.session').innerText"), /Run completed/);

    // 4. 验证 Stage 2: 路线修订、In progress 状态与审查拒绝反馈
    const stage2Target = await value(socket, "document.querySelectorAll('.plan-route-stage')[1].querySelector('.plan-route-stage-heading strong').textContent");
    assert.equal(stage2Target, "Beta Implementation");
    const stage2Status = await value(socket, "document.querySelectorAll('.plan-route-stage')[1].querySelector('.plan-route-status').textContent");
    assert.equal(stage2Status, "In progress");
    assert.match(await value(socket, "document.querySelector('.plan-route-heading').innerText"), /Revision 2/);
    assert.match(await value(socket, "document.querySelector('.plan-route-reason').innerText"), /Missing error handling/);

    // 5. 阶段标题在时间线上按真实事实位置保留
    const stageTitles = await value(socket, "[...document.querySelectorAll('.timeline-stage-heading [data-slot=trace-title]')].map(node => node.textContent)");
    assert.deepEqual(stageTitles, ["Alpha Setup", "Beta Implementation"]);
    assert.match(await value(socket, "document.querySelector('.timeline-fact.run_stage_rejected').innerText"), /Stage revised/);
    await value(socket, "document.querySelector('[data-stage-id=\"stage-beta\"] > .timeline-stage-heading').click()");
    assert.equal(await value(socket, "document.querySelector('[data-stage-id=\"stage-beta\"] > .timeline-stage-heading').getAttribute('aria-expanded')"), "false");
    assert.match(await value(socket, "document.querySelector('[data-stage-id=\"stage-beta\"]').innerText"), /In progress[\s\S]*Stage revised/);
    await value(socket, "document.querySelector('[data-stage-id=\"stage-beta\"] > .timeline-stage-heading').click()");

    assert.equal(await value(socket, "document.querySelector('[data-stage-id=\"stage-alpha\"] > .timeline-stage-heading').getAttribute('aria-expanded')"), "false");
    assert.equal(await value(socket, "document.querySelector('[data-stage-id=\"stage-beta\"] > .timeline-stage-heading').getAttribute('aria-expanded')"), "true");
    await value(socket, "document.querySelector('[data-stage-id=\"stage-alpha\"] > .timeline-stage-heading').click()");

    // Activity shows tool groups and Think placeholders; full Think content stays in Trajectory.
    const stage1StepsCount = await value(socket, "document.querySelectorAll('.timeline-activity').length");
    assert.equal(stage1StepsCount, 4);
    assert.equal(await value(socket, "document.querySelectorAll('.timeline-thinking').length"), 2);
    const editGroupSummary = await value(socket, "[...document.querySelectorAll('.timeline-activity-heading [data-slot=trace-title]')].map(node => node.textContent).find(text => text.includes('Edited'))");
    assert.equal(editGroupSummary, "Edited src/index.ts");
    assert.equal(await value(socket, "document.querySelectorAll('.timeline-activity-heading[aria-expanded=\"false\"]').length"), 4);
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('.timeline-activity-heading')].filter(button => /Edited src\\/index.ts|Wrote src\\/index.test.ts/.test(button.textContent)).forEach(button => button.click())",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelectorAll('.timeline-stage-activities .timeline-activity-members > li').length === 2");
    const memberTools = await value(socket, "[...document.querySelectorAll('.timeline-stage-activities .timeline-activity-members > li .timeline-activity-member-tool')].map(node => node.textContent)");
    assert.deepEqual(memberTools, ["edit_file", "write_file"]);

    await waitForExpression(socket, "document.querySelectorAll('.timeline-thinking').length === 2");
    assert.deepEqual(await value(socket, "[...document.querySelectorAll('.timeline-thinking')].map(node => node.textContent.trim())"), ["Thinking", "Thinking"]);
    assert.doesNotMatch(await value(socket, "document.querySelector('.timeline').innerText"), /Compare recovery paths|Use the committed checkpoint|Check remaining uncertainty/);

    await navigate(socket, "about:blank");
    await navigate(socket, `${webUrl}/?session=desktop#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await value(socket, "document.querySelector('.goal-card').click()");
    await waitForExpression(socket, "document.querySelector('[aria-label=\"Trajectory\"]') !== null");
    await value(socket, "document.querySelector('[aria-label=\"Trajectory\"]').click()");
    await waitForExpression(socket, "document.querySelector('#trajectory-event-6') !== null");
    await value(socket, "document.querySelector('#trajectory-event-6').click()");
    await waitForExpression(socket, "document.querySelector('.tr-detail-body [aria-label=\"Think analysis\"]') !== null");
    assert.match(await value(socket, "document.querySelector('.tr-detail-body').innerText"), /Compare recovery paths/);
    assert.match(await value(socket, "document.querySelector('.tr-detail-body strong').textContent"), /Use the committed checkpoint/);
  } finally {
    if (socket) socket.close();
    if (chrome) {
      chrome.kill("SIGTERM");
      await Promise.race([once(chrome, "close"), delay(3000).then(() => chrome.kill("SIGKILL"))]);
    }
    webServer.kill("SIGTERM");
    await Promise.race([once(webServer, "close"), delay(3000).then(() => webServer.kill("SIGKILL"))]);
    mock.server.close();
    mock.server.closeAllConnections();
    await rm(profile, { recursive: true, force: true });
  }
});

function createStageMockApi() {

  const session = {
    goalId: "goal-stage-1",
    intent: "Exercise run stage presentation and review feedback",
    currentRunId: "run-1",
    runStatus: "running",
    currentRunMode: "normal",
    messages: [{ role: "user", content: "Exercise run stage presentation", messageId: "msg-intent", runId: "run-1", position: { afterSequence: 0, order: 0 } }],
    runs: [{
      runId: "run-1",
      status: "running",
      stepCount: 4,
      current: true,
      stages: [
        {
          stageId: "stage-alpha",
          revision: 1,
          target: "Alpha Setup",
          acceptanceCriteria: ["Files created"],
          status: "accepted",
          resultSummary: "Alpha completed successfully",
          steps: [],
        },
        {
          stageId: "stage-beta",
          revision: 2,
          target: "Beta Implementation",
          acceptanceCriteria: ["Tests pass"],
          status: "in_progress",
          latestReviewRejection: {
            code: "stage_rejected",
            issues: ["Missing error handling"],
          },
          revisions: [
            { revision: 1, target: "Beta Draft" },
            { revision: 2, target: "Beta Implementation", reason: "Found new constraints" },
          ],
          steps: [],
        },
      ],
      steps: [
        {
          runId: "run-1", executionUnitId: "think-unit", sourceEventId: "think-request",
          sequence: 5, stepIndex: 4, decisionKind: "request_think", status: "completed",
          think: { goal: "Compare recovery paths", output: "**Use the committed checkpoint**\n\nThe saved observation supports this choice." },
        },
        {
          runId: "run-1", executionUnitId: "pending-think-unit", sourceEventId: "pending-think-request",
          sequence: 7, stepIndex: 4, decisionKind: "request_think", status: "recorded",
          think: { goal: "Check remaining uncertainty" },
        },
        {
          runId: "run-1",
          executionUnitId: "unit-0",
          sequence: 1,
          stepIndex: 1,
          toolId: "read_file",
          inputSummary: "config.json",
          status: "completed",
          summary: "Read initial config",
        },
        {
          runId: "run-1",
          executionUnitId: "unit-1",
          sourceEventId: "trajectory-edit-1",
          actionId: "action-edit-1",
          sequence: 2,
          stepIndex: 2,
          stageId: "stage-alpha",
          toolId: "edit_file",
          inputSummary: "src/index.ts",
          status: "completed",
          summary: "Edited source file",
        },
        {
          runId: "run-1",
          executionUnitId: "unit-2",
          sourceEventId: "trajectory-edit-2",
          actionId: "action-edit-2",
          sequence: 3,
          stepIndex: 3,
          stageId: "stage-alpha",
          toolId: "write_file",
          inputSummary: "src/index.test.ts",
          status: "completed",
          summary: "Wrote test file",
        },
        {
          runId: "run-1",
          executionUnitId: "unit-3",
          sourceEventId: "trajectory-bash-1",
          actionId: "action-bash-1",
          sequence: 4,
          stepIndex: 4,
          stageId: "stage-beta",
          toolId: "bash",
          inputSummary: "npm test",
          status: "completed",
          summary: "Ran tests",
        },
      ],
    }],
    historyTruncated: false,
  };

  // 窄状态：只提供当前阶段路线与等待状态，历史正文与步骤显式外置。
  const stateEnvelope = () => ({
    goalId: session.goalId,
    intent: session.intent,
    currentRunId: session.currentRunId,
    runStatus: session.runStatus,
    currentRunMode: "plan",
    currentRunStepCount: 4,
    currentPlanRoute: {
      revision: 2,
      revisionReason: "Missing error handling",
      nextStageIndex: 1,
      stages: [
        { stageId: "stage-alpha", revision: 1, status: "accepted", target: "Alpha Setup", acceptanceCriteria: ["Files created"], acceptedSequence: 5 },
        { stageId: "stage-beta", revision: 2, status: "executing", target: "Beta Implementation", acceptanceCriteria: ["Tests pass"] },
      ],
    },
    history: {
      messages: { included: false, source: "activity" },
      steps: { included: false, source: "activity" },
      stages: { included: false, source: "activity" },
    },
  });

  const activityPosition = (sequence, itemKind = "fact") => ({ runId: "run-1", runOrder: 0, sequence, itemKind, order: 0 });
  const stageFact = (eventId, sequence, eventType, extra) => ({
    type: "fact", itemId: `event:${eventId}`, eventId, runId: "run-1",
    position: activityPosition(sequence), eventType, title: extra.title, ...extra,
  });
  const toolFact = (eventId, sequence, actionId, toolId, inputSummary, summary, stageId) => ({
    type: "fact", itemId: `event:${eventId}`, eventId, runId: "run-1",
    position: activityPosition(sequence), eventType: "tool_started", title: "Tool started",
    actionId, executionUnitId: `unit-${actionId}`,
    ...(stageId === undefined ? {} : { stageId }),
    tool: { toolId, status: "completed", actionStatus: "approved", inputSummary, summary },
  });
  const thinkFact = (eventId, sequence, goal, output, executionUnitId) => ({
    type: "think", itemId: `think:${eventId}`, runId: "run-1",
    position: activityPosition(sequence), executionUnitId,
    think: { goal, ...(output === undefined ? {} : { output }) },
  });

  // 固定水位的 Activity 页：阶段事实、工具动作与显式 Think 按真实来源交错。
  const activityEnvelope = () => ({
    goalId: session.goalId,
    limit: 50,
    items: [
      {
        type: "message", itemId: "message:msg-intent", messageId: "msg-intent", role: "user", runId: "run-1",
        position: activityPosition(0, "message"),
        content: "Exercise run stage presentation", contentLength: 35, truncated: false,
      },
      toolFact("event-read-1", 1, "action-read-1", "read_file", "config.json", "Read initial config", undefined),
      stageFact("event-stage-alpha", 2, "run_stage_declared", {
        title: "Stage started", stageId: "stage-alpha", stageRevision: 1, stageTarget: "Alpha Setup",
      }),
      toolFact("event-edit-1", 3, "action-edit-1", "edit_file", "src/index.ts", "Edited source file", "stage-alpha"),
      toolFact("event-edit-2", 4, "action-edit-2", "write_file", "src/index.test.ts", "Wrote test file", "stage-alpha"),
      stageFact("event-stage-alpha-accepted", 5, "run_stage_accepted", {
        title: "Stage accepted", stageId: "stage-alpha", stageRevision: 1,
      }),
      stageFact("event-stage-beta", 6, "run_stage_declared", {
        title: "Stage started", stageId: "stage-beta", stageRevision: 2, stageTarget: "Beta Implementation",
      }),
      toolFact("event-bash-1", 7, "action-bash-1", "bash", "npm test", "Ran tests", "stage-beta"),
      stageFact("event-stage-beta-rejected", 8, "run_stage_rejected", {
        title: "Stage revised", stageId: "stage-beta", stageRevision: 2,
      }),
      thinkFact("event-think-1", 9, "Compare recovery paths", "**Use the committed checkpoint**\n\nThe saved observation supports this choice.", "think-unit"),
      thinkFact("event-think-2", 10, "Check remaining uncertainty", session.runs[0].steps[1].think.output, "pending-think-unit"),
    ],
    runs: [{ runId: "run-1", status: "running", current: true, runOrder: 0, committedThroughSequence: 10 }],
    window: [{ runId: "run-1", messageCount: 1, throughMessageId: "msg-intent", committedThroughSequence: 10 }],
    gaps: [],
    range: { olderAvailable: false, newerAvailable: false },
    stages: [
      { runId: "run-1", stageId: "stage-alpha", revision: 1, status: "accepted", firstSequence: 2, lastSequence: 5, completeWithinPage: true },
      { runId: "run-1", stageId: "stage-beta", revision: 2, status: "rejected", firstSequence: 6, lastSequence: 8, completeWithinPage: true },
    ],
    actionGroups: [
      { runId: "run-1", actionId: "action-read-1", firstSequence: 1, lastSequence: 1, completeWithinPage: true },
      { runId: "run-1", actionId: "action-edit-1", firstSequence: 3, lastSequence: 3, completeWithinPage: true },
      { runId: "run-1", actionId: "action-edit-2", firstSequence: 4, lastSequence: 4, completeWithinPage: true },
      { runId: "run-1", actionId: "action-bash-1", firstSequence: 7, lastSequence: 7, completeWithinPage: true },
    ],
  });

  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const trajectoryRun = { runId: "run-1", status: "running", current: true, committedThroughSequence: 7 };
    const thinkEntry = { eventId: "think-output", sequence: 6, occurredAt: "2026-10-13T09:00:01.000Z", eventType: "think_completed", category: "decision", executionUnitId: "think-unit", stepIndex: 4, title: "think_completed", preview: "Use the committed checkpoint", previewTruncated: false };
    if (request.url?.startsWith("/api/goals/goal-stage-1/trajectory/runs?")) {
      json(response, { runs: [trajectoryRun], nextOffset: null });
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-stage-1/trajectory/events/6?")) {
      json(response, { goalId: session.goalId, runId: "run-1", event: { ...thinkEntry, eventSchemaVersion: 1, goalId: session.goalId, runId: "run-1", phase: "executing", payload: { type: "think_completed", requestId: "think-1", stepOrdinal: 4, ...session.runs[0].steps[0].think } }, toolDurationMs: null, observationConfirmed: false, committedThroughSequence: 7, correlation: {}, related: {}, payloadBytes: 0 });
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-stage-1/trajectory?")) {
      json(response, { goalId: session.goalId, run: trajectoryRun, entries: [thinkEntry], total: 1, committedCount: 1, committedThroughSequence: 7, previousCursor: null, nextCursor: null, locatedSequence: null });
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-stage-1/model-inputs?")) {
      json(response, { calls: [], total: 0, nextOffset: null });
      return;
    }
    if (request.url === "/api/project/permission-mode" && request.method === "GET") {
      json(response, { ok: true, mode: "default", revision: 0, workspaceId: "workspace-1" });
      return;
    }
    if (request.url === "/goals/goal-stage-1/metrics" && request.method === "GET") {
      json(response, { goalId: "goal-stage-1", roundCount: 1, stepCount: 3, reportedCalls: 1, missingCalls: 0, inputTokens: 500, outputTokens: 50, coverage: "complete", cacheHitRate: null, tokensPerSecond: null, contextRemainingPercent: null, runs: [] });
      return;
    }
    if (request.url === "/api/goals" && request.method === "GET") {
      json(response, {
        goals: [{
          goalId: "goal-stage-1",
          runId: "run-1",
          intent: "Exercise run stage presentation and review feedback",
          workflowPhase: "executing",
          runStatus: "running",
          updatedAt: "2026-10-13T09:00:00.000Z",
          archived: false,
        }],
        unreadableCount: 0,
      });
      return;
    }
    if (request.url === "/api/goals/goal-stage-1?view=state" && request.method === "GET") {
      json(response, { goal: stateEnvelope() });
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-stage-1/activity") && request.method === "GET") {
      json(response, activityEnvelope());
      return;
    }
    if (request.url === "/api/goals/goal-stage-1" && request.method === "GET") {
      json(response, { goal: session });
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-stage-1/events?")) {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      response.write("event: ping\ndata: {}\n\n");
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  return { server };
}

function json(response, value) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

async function waitForHttp(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out starting Vite at ${url}`);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  const binary = candidates.find((candidate) => existsSync(candidate));
  assert.ok(binary, "Set CHROME_BIN or install Google Chrome/Chromium to run browser acceptance tests");
  return binary;
}

async function waitForDevtools(profile, chrome) {
  const marker = join(profile, "DevToolsActivePort");
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with status ${chrome.exitCode}`);
    try {
      const [port] = (await readFile(marker, "utf8")).trim().split("\n");
      if (port) return { port };
    } catch {}
    await delay(100);
  }
  throw new Error("Timed out waiting for Chrome DevTools endpoint");
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.pending = new Map();
  socket.nextId = 0;
  socket.addEventListener("message", async (event) => {
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    const message = JSON.parse(raw);
    if (message.id === undefined) return;
    const pending = socket.pending.get(message.id);
    if (pending === undefined) return;
    socket.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  });
  return socket;
}

function cdp(socket, method, params = {}) {
  const id = ++socket.nextId;
  return new Promise((resolveResult, reject) => {
    socket.pending.set(id, { resolve: resolveResult, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function navigate(socket, url) {
  await cdp(socket, "Page.navigate", { url });
  await waitForExpression(socket, "document.readyState === 'complete'");
}

async function value(socket, expression) {
  const result = await cdp(socket, "Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForExpression(socket, expression) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    if (await value(socket, `Boolean(${expression})`)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}
