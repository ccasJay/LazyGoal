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

test("Web goal session presents run stages, revisions, rejection feedback, and collapsed steps", async () => {
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

    await waitForExpression(socket, "document.querySelector('.session .run-stages-container') !== null");

    // 1. 验证 Run 级控制活动
    const hasRunLevelSteps = await value(socket, "document.querySelector('.run-level-steps') !== null");
    assert.equal(hasRunLevelSteps, true);
    assert.match(await value(socket, "document.querySelector('.run-level-steps').innerText"), /Run-level activity/);

    // 2. 验证阶段分组数量
    const stageGroupsCount = await value(socket, "document.querySelectorAll('.run-stage-group').length");
    assert.equal(stageGroupsCount, 2);

    // 3. 验证 Stage 1: Accepted 状态与结果摘要，中间接受不显示 Run completed
    const stage1Target = await value(socket, "document.querySelectorAll('.run-stage-group')[0].querySelector('.stage-target').textContent");
    assert.equal(stage1Target, "Alpha Setup");
    const stage1Status = await value(socket, "document.querySelectorAll('.run-stage-group')[0].querySelector('.stage-status').textContent");
    assert.equal(stage1Status, "Accepted");
    assert.match(await value(socket, "document.querySelectorAll('.run-stage-group')[0].innerText"), /Alpha completed successfully/);
    assert.doesNotMatch(await value(socket, "document.querySelector('.session').innerText"), /Run completed/);

    // 4. 验证 Stage 2: 修订版本、In progress 状态与审查拒绝反馈
    const stage2Target = await value(socket, "document.querySelectorAll('.run-stage-group')[1].querySelector('.stage-target').textContent");
    assert.equal(stage2Target, "Beta Implementation");
    const stage2Status = await value(socket, "document.querySelectorAll('.run-stage-group')[1].querySelector('.stage-status').textContent");
    assert.equal(stage2Status, "In progress");
    const stage2Rev = await value(socket, "document.querySelectorAll('.run-stage-group')[1].querySelector('.stage-revision').textContent");
    assert.equal(stage2Rev, "Rev 2");
    assert.match(await value(socket, "document.querySelectorAll('.run-stage-group')[1].innerText"), /Review feedback:/);
    assert.match(await value(socket, "document.querySelectorAll('.run-stage-group')[1].innerText"), /Missing error handling/);

    // 5. 验证所属 Steps 存在且可展开
    const stage1StepsCount = await value(socket, "document.querySelectorAll('.run-stage-group')[0].querySelectorAll('.tool-event').length");
    assert.equal(stage1StepsCount, 1);
    const stage2StepsCount = await value(socket, "document.querySelectorAll('.run-stage-group')[1].querySelectorAll('.tool-event').length");
    assert.equal(stage2StepsCount, 1);
  } finally {
    if (socket) socket.close();
    if (chrome) {
      chrome.kill("SIGTERM");
      await Promise.race([once(chrome, "close"), delay(3000).then(() => chrome.kill("SIGKILL"))]);
    }
    webServer.kill("SIGTERM");
    await Promise.race([once(webServer, "close"), delay(3000).then(() => webServer.kill("SIGKILL"))]);
    mock.server.close();
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
    messages: [{ role: "user", content: "Exercise run stage presentation" }],
    runs: [{
      runId: "run-1",
      status: "running",
      stepCount: 3,
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
          sequence: 3,
          stepIndex: 3,
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

  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
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
      });
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
