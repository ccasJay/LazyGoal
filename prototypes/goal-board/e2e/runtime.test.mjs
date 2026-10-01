import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const serviceEntry = join(repositoryRoot, "prototypes/goal-board/e2e/test-service.ts");

test("real local service restores and completes one authorized Goal conversation", { timeout: 120_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lazygoal-browser-runtime-e2e-"));
  const workspace = join(temporaryRoot, "workspace");
  const data = join(temporaryRoot, "data");
  const home = join(temporaryRoot, "home");
  const profile = join(temporaryRoot, "chrome-profile");
  const statusPath = join(temporaryRoot, "status.json");
  await Promise.all([mkdir(workspace), mkdir(home)]);

  let service;
  let chrome;
  let socket;

  try {
    service = await startService({ workspace, data, home, statusPath, runOffset: 0, modelOffset: 0 });
    const first = await service.ready;

    const noTokenList = await api(first.origin, "/api/goals");
    assert.equal(noTokenList.response.status, 401);
    assert.deepEqual(noTokenList.body, { error: "unauthorized" });
    const noTokenCreate = await api(first.origin, "/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json", origin: first.origin },
      body: JSON.stringify({ goalId: "unauthorized-goal", intent: "Must not start" }),
    });
    assert.equal(noTokenCreate.response.status, 401);
    assert.deepEqual(await readStatus(statusPath), { modelCalls: 0, toolCalls: 0 });

    chrome = spawn(findChrome(), [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
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

    await navigate(socket, `${first.origin}/`);
    await waitForExpression(socket, "document.body.innerText.includes('lazygoal web')");
    assert.equal(await value(socket, "document.querySelector('.primary')?.disabled"), true);
    await navigate(socket, "about:blank");
    await navigate(socket, first.launchUrl);
    await waitForExpression(socket, "document.body.innerText.includes('No saved Goals yet')");
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('button.primary')].find(button => button.textContent.includes('New goal')).click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]') !== null");
    assert.equal(await value(socket, "document.querySelector('button[aria-label=\"Send message\"]')?.disabled"), true);
    let emptyList = await api(first.origin, "/api/goals", { token: first.token });
    assert.deepEqual(emptyList.body.goals, []);
    assert.deepEqual(await readStatus(statusPath), { modelCalls: 0, toolCalls: 0 });
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "Collect approved notes and store one source record");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('button[aria-label=\"Send message\"]').click()",
      returnByValue: true,
    });

    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Which notes should I include?')", 15_000);
    await waitForStatus(statusPath, (status) => status.modelCalls === 1 && status.toolCalls === 0);
    let session = await waitForSession(first.origin, first.token, (candidate) => candidate.pendingInteraction?.kind === "ask_user");
    const goalId = session.goalId;
    const firstRunId = session.currentRunId;
    const firstRequestId = session.pendingInteraction.requestId;
    assert.equal(session.intent, "Collect approved notes and store one source record");
    assert.equal(session.runStatus, "waiting");
    assert.equal(session.currentRunMode, "normal");

    const crossOrigin = await api(first.origin, "/api/goals", {
      token: first.token,
      headers: { origin: "https://attacker.invalid" },
    });
    assert.equal(crossOrigin.response.status, 403);
    assert.deepEqual(crossOrigin.body, { error: "cross_origin_denied" });
    const plainTextAtAskUser = await api(first.origin, `/api/goals/${goalId}/messages`, {
      token: first.token,
      method: "POST",
      headers: { "content-type": "application/json", origin: first.origin },
      body: JSON.stringify({ runId: firstRunId, content: "Use approved notes" }),
    });
    assert.equal(plainTextAtAskUser.response.status, 409);
    assert.equal(plainTextAtAskUser.body.error, "structured_interaction_required");
    assert.deepEqual(await readStatus(statusPath), { modelCalls: 1, toolCalls: 0 });

    await stopService(service);
    await waitForExpression(socket, "!document.querySelector('.stream-state')?.classList.contains('connected')", 10_000);
    assert.ok(await value(socket, "document.querySelector('.structured-form') !== null"), "disconnect preserves the saved answer form");

    service = await startService({ workspace, data, home, statusPath, runOffset: 1, modelOffset: 1 });
    const restarted = await service.ready;
    const expiredToken = await api(restarted.origin, "/api/goals", { token: first.token });
    assert.equal(expiredToken.response.status, 401);
    const restartedCrossOrigin = await api(restarted.origin, "/api/goals", {
      token: restarted.token,
      headers: { origin: "https://attacker.invalid" },
    });
    assert.equal(restartedCrossOrigin.response.status, 403);

    await navigate(socket, "about:blank");
    await navigate(socket, restarted.launchUrl);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null", 10_000);
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.structured-form')?.innerText.includes('Which notes should I include?')", 10_000);
    session = await waitForSession(restarted.origin, restarted.token, (candidate) => candidate.pendingInteraction?.kind === "ask_user");
    assert.equal(session.goalId, goalId);
    assert.equal(session.currentRunId, firstRunId);
    assert.equal(session.pendingInteraction.requestId, firstRequestId);

    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('label.answer-option')].find(label => label.innerText.includes('Approved notes')).querySelector('input').click()",
      returnByValue: true,
    });
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('.structured-form button')].find(button => button.textContent.includes('Submit answer')).click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.structured-form')?.innerText.includes('Your approval is needed')", 15_000);
    await waitForStatus(statusPath, (status) => status.modelCalls === 2 && status.toolCalls === 0);
    session = await waitForSession(restarted.origin, restarted.token, (candidate) => candidate.pendingAction?.status === "awaiting_approval");
    const pendingActionId = session.pendingAction.actionId;

    const staleApproval = await api(restarted.origin, `/api/goals/${goalId}/interactions`, {
      token: restarted.token,
      method: "POST",
      headers: { "content-type": "application/json", origin: restarted.origin },
      body: JSON.stringify({ kind: "approve_action", runId: session.currentRunId, actionId: "stale-action" }),
    });
    assert.equal(staleApproval.response.status, 409);
    assert.equal(staleApproval.body.error, "action_not_waiting");
    assert.deepEqual(await readStatus(statusPath), { modelCalls: 2, toolCalls: 0 });

    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('.structured-form button')].find(button => button.textContent.includes('Approve action')).click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Run completed')", 15_000);
    await waitForStatus(statusPath, (status) => status.modelCalls === 3 && status.toolCalls === 1);
    session = await waitForSession(restarted.origin, restarted.token, (candidate) => candidate.runStatus === "completed");
    assert.equal(session.pendingAction, undefined);
    assert.ok(session.runs.find((run) => run.current)?.steps.some((step) => step.toolId === "browser_fixture_write" && step.status === "completed"));
    assert.equal(JSON.stringify(session).includes("PRIVATE_CONTROLLED_TOOL_OUTPUT"), false);
    assert.equal(await value(socket, "document.body.innerText.includes('PRIVATE_CONTROLLED_TOOL_OUTPUT')"), false);
    assert.equal(await value(socket, "[...document.querySelectorAll('.session-tab-buttons button')].some(button => button.textContent === 'Plan')"), false);
    const actionLines = (await readFile(join(workspace, "controlled-tool-actions.jsonl"), "utf8")).trim().split("\n");
    assert.equal(actionLines.length, 1);
    assert.deepEqual(JSON.parse(actionLines[0]), { actionId: pendingActionId, value: "controlled write" });

    const toolStep = session.runs.find(run => run.current).steps.find(step => step.toolId === "browser_fixture_write");
    const trajectory = await api(restarted.origin, `/api/goals/${goalId}/trajectory?runId=${firstRunId}&executionUnitId=${toolStep.executionUnitId}`, { token: restarted.token });
    assert.equal(trajectory.response.status, 200);
    assert.ok(trajectory.body.locatedSequence > 0);
    assert.ok(trajectory.body.entries.every(event => event.sequence <= trajectory.body.run.committedThroughSequence));
    const toolEvent = trajectory.body.entries.find(event => event.eventType === "tool_started");
    const fullDetail = await api(restarted.origin, `/api/goals/${goalId}/trajectory/events/${toolEvent.sequence}?runId=${firstRunId}`, { token: restarted.token });
    assert.equal(fullDetail.response.status, 200);
    assert.equal(fullDetail.body.observationConfirmed, true);
    assert.ok(JSON.stringify(fullDetail.body.result).includes("PRIVATE_CONTROLLED_TOOL_OUTPUT"));
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.tool-event')].find(step => step.querySelector('summary').textContent.includes('browser_fixture_write')).querySelector('summary').click()", returnByValue: true });
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.tool-event')].find(step => step.querySelector('summary').textContent.includes('browser_fixture_write')).querySelector('.trajectory-link button').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.trajectory-view .ct-record-body[aria-pressed=\"true\"]') !== null");
    await waitForExpression(socket, "document.querySelector('.tr-detail-body pre') !== null");
    assert.equal(await value(socket, "document.activeElement?.id"), `trajectory-event-${trajectory.body.locatedSequence}`);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('#trajectory-event-" + toolEvent.sequence + "').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-detail-title')?.innerText.includes('tool_started')");
    await waitForExpression(socket, "[...document.querySelectorAll('.tr-detail-tabs button')].some(button => button.textContent === 'Result') && !document.querySelector('.tr-detail-body')?.innerText.includes('Loading recorded details')");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.tr-detail-tabs button')].find(button => button.textContent === 'Result').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.tr-detail-body')?.innerText.includes('PRIVATE_CONTROLLED_TOOL_OUTPUT')");
    const inputs = await api(restarted.origin, `/api/goals/${goalId}/model-inputs?runId=${firstRunId}`, { token: restarted.token });
    assert.equal(inputs.response.status, 200);
    assert.ok(inputs.body.calls.length > 0);
    const inputCall = inputs.body.calls.find(call => call.executionUnitId === toolStep.executionUnitId);
    assert.ok(inputCall);
    const completeInput = await api(restarted.origin, `/api/goals/${goalId}/model-inputs?runId=${firstRunId}&callId=${inputCall.callId}`, { token: restarted.token });
    assert.equal(completeInput.response.status, 200);
    assert.ok(completeInput.body.call.messages.some(message => message.role === "system" && message.content.length > 0));
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close trajectory details\"]').click()", returnByValue: true });
    await waitForExpression(socket, `document.querySelector('button[aria-label="Inspect model request ${inputCall.callId}"]') !== null`);
    await cdp(socket, "Runtime.evaluate", { expression: `document.querySelector('button[aria-label="Inspect model request ${inputCall.callId}"]').click()`, returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.mi-inspector')?.innerText.includes('System Prompt')");
    await waitForExpression(socket, "!document.querySelector('.mi-inspector')?.innerText.includes('Loading recorded input')");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.mi-inspector .tr-detail-tabs button')].find(button => button.textContent === 'System Prompt').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.mi-inspector .tr-detail-body pre')?.innerText.length > 0");
    assert.equal(await value(socket, "document.querySelector('.mi-inspector .tr-detail-body pre').innerText"), completeInput.body.call.messages.filter(message => message.role === "system").map(message => message.content).join("\n"));
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.session-tab-buttons button')].find(button => button.textContent === 'Activity').click()", returnByValue: true });

    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "Record one follow-up note");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('button[aria-label=\"Send message\"]').click()",
      returnByValue: true,
    });
    await waitForStatus(statusPath, (status) => status.modelCalls === 4 && status.toolCalls === 1);
    session = await waitForSession(restarted.origin, restarted.token, (candidate) => candidate.runStatus === "completed" && candidate.currentRunId !== firstRunId);
    assert.equal(session.runs.length, 2);
    assert.ok(session.messages.some((message) => message.role === "user" && message.content === "Record one follow-up note"));
    assert.equal((await readFile(join(workspace, "controlled-tool-actions.jsonl"), "utf8")).trim().split("\n").length, 1);

    const stalePlanMode = await api(restarted.origin, `/api/goals/${goalId}/plan-mode`, {
      token: restarted.token,
      method: "POST",
      headers: { "content-type": "application/json", origin: restarted.origin },
      body: JSON.stringify({ runId: firstRunId }),
    });
    assert.equal(stalePlanMode.response.status, 409);
    assert.equal(stalePlanMode.body.error, "stale_run");

    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('button.primary')].find(button => button.textContent.includes('New goal')).click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.draft-timeline') !== null && document.querySelector('textarea[aria-label=\"Message the Goal\"]') !== null", 10_000);
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/plan");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('button[aria-label=\"Send message\"]').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session-intro')?.innerText.includes('Plan Mode')", 10_000);
    emptyList = await api(restarted.origin, "/api/goals", { token: restarted.token });
    assert.equal(emptyList.body.goals.length, 1, "draft /plan does not persist a Goal");
    assert.deepEqual(await readStatus(statusPath), { modelCalls: 4, toolCalls: 1 });
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "Plan flow: inspect and complete the acceptance path");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('button[aria-label=\"Send message\"]').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Approve the deterministic plan-flow task?')", 15_000);
    await waitForStatus(statusPath, (status) => status.modelCalls === 5 && status.toolCalls === 1);
    const approvedList = await api(restarted.origin, "/api/goals", { token: restarted.token });
    assert.equal(approvedList.response.status, 200, JSON.stringify(approvedList.body));
    const planWaiting = approvedList.body.goals.some((goal) => goal.intent.includes("Plan flow") && goal.runStatus === "waiting");
    if (!planWaiting) {
      let stopReason;
      try { stopReason = await readFile(`${statusPath}.run-stop`, "utf8"); } catch { stopReason = "not recorded"; }
      assert.ok(planWaiting, `Plan Run did not reach approval: ${JSON.stringify(approvedList.body.goals)}; stop=${stopReason}`);
    }
    const planSession = await waitForSession(
      restarted.origin,
      restarted.token,
      (candidate) => candidate.pendingInteraction?.kind === "task_approval",
    );
    assert.equal(planSession.currentRunMode, "plan");
    assert.ok(planSession.messages.some((message) => message.role === "user" && message.content === "Plan flow: inspect and complete the acceptance path"));
    assert.equal(planSession.messages.some((message) => message.content === "/plan"), false);
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('.structured-form button')].find(button => button.textContent.includes('Approve task')).click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.structured-form')?.innerText.includes('Approve action')", 15_000);
    await waitForStatus(statusPath, (status) => status.modelCalls === 6 && status.toolCalls === 1);
    const planActionSession = await waitForSession(
      restarted.origin,
      restarted.token,
      (candidate) => candidate.pendingAction?.status === "awaiting_approval",
    );
    assert.equal(planActionSession.pendingAction.toolId, "browser_fixture_write");
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('.structured-form button')].find(button => button.textContent.includes('Approve action')).click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Run completed')", 15_000);
    await waitForStatus(statusPath, (status) => status.modelCalls === 7 && status.toolCalls === 2);
    const completedPlanSession = await waitForSession(
      restarted.origin,
      restarted.token,
      (candidate) => candidate.runStatus === "completed" && candidate.currentRunMode === "plan",
    );
    const completedList = await api(restarted.origin, "/api/goals", { token: restarted.token });
    assert.equal(completedList.response.status, 200, JSON.stringify(completedList.body));
    const planCompleted = completedList.body.goals.some((goal) => goal.intent.includes("Plan flow") && goal.runStatus === "completed");
    if (!planCompleted) {
      let stopReason;
      try { stopReason = await readFile(`${statusPath}.run-stop`, "utf8"); } catch { stopReason = "not recorded"; }
      assert.ok(planCompleted, `Plan Run did not complete: ${JSON.stringify(completedList.body.goals)}; stop=${stopReason}`);
    }

    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/plan");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('button[aria-label=\"Send message\"]').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session-intro')?.innerText.includes('Next Run · Plan Mode')", 10_000);
    const nextPlan = await api(restarted.origin, `/api/goals/${completedPlanSession.goalId}`, { token: restarted.token });
    assert.equal(nextPlan.body.goal.nextRunMode, "plan");
    assert.equal(nextPlan.body.goal.messages.some((message) => message.content === "/plan"), false);
    assert.deepEqual(await readStatus(statusPath), { modelCalls: 7, toolCalls: 2 });

    await cdp(socket, "Page.reload");
    await waitForExpression(socket, "document.readyState === 'complete' && document.querySelector('.goal-card') !== null", 10_000);
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Run completed')", 10_000);
    assert.equal(await value(socket, "document.body.innerText.includes('PRIVATE_CONTROLLED_TOOL_OUTPUT')"), false);
  } finally {
    socket?.close();
    if (chrome !== undefined) await stopProcess(chrome, "SIGTERM", 5_000);
    if (service !== undefined) await stopService(service);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

function startService({ workspace, data, home, statusPath, runOffset, modelOffset }) {
  const child = spawn(process.execPath, ["--import", "tsx/esm", serviceEntry], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      LAZYGOAL_E2E_WORKSPACE: workspace,
      LAZYGOAL_E2E_DATA: data,
      LAZYGOAL_E2E_HOME: home,
      LAZYGOAL_E2E_STATUS: statusPath,
      LAZYGOAL_E2E_RUN_COUNTER: String(runOffset),
      LAZYGOAL_E2E_MODEL_OFFSET: String(modelOffset),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolveReadyPromise, rejectReadyPromise) => {
    resolveReady = resolveReadyPromise;
    rejectReady = rejectReadyPromise;
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    const match = stdout.match(/LG_TEST_READY:(\{[^\n]+\})/);
    if (match) {
      const result = JSON.parse(match[1]);
      resolveReady({ ...result, token: new URL(result.launchUrl).hash.slice(1) });
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("error", rejectReady);
  child.once("exit", (code, signal) => {
    if (code !== 0) rejectReady(new Error(`Test service exited (${code ?? signal}): ${stderr || stdout}`));
  });
  return { child, ready, get logs() { return `${stdout}${stderr}`; } };
}

async function stopService(service) {
  await stopProcess(service.child, "SIGTERM", 1_500, service.logs);
}

async function stopProcess(child, signal, timeoutMs, logs = "") {
  if (child.exitCode !== null) return;
  const closed = once(child, "close");
  child.kill(signal);
  try {
    await Promise.race([
      closed,
      delay(timeoutMs).then(() => { throw new Error(`Timed out stopping child process: ${logs}`); }),
    ]);
  } catch (error) {
    child.kill("SIGKILL");
    await closed;
    throw error;
  }
}

async function api(origin, path, { token, method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
    ...(body === undefined ? {} : { body }),
  });
  let parsed;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }
  return { response, body: parsed };
}

async function waitForSession(origin, token, predicate) {
  return waitFor(async () => {
    const listing = await api(origin, "/api/goals", { token });
    assert.equal(listing.response.status, 200, JSON.stringify(listing.body));
    for (const item of listing.body.goals) {
      const detail = await api(origin, `/api/goals/${item.goalId}`, { token });
      assert.equal(detail.response.status, 200, JSON.stringify(detail.body));
      if (predicate(detail.body.goal)) return detail.body.goal;
    }
    return undefined;
  }, "saved Goal state");
}

async function waitForStatus(path, predicate) {
  return waitFor(() => readStatus(path).then((status) => predicate(status) ? status : undefined), "deterministic Runtime progress");
}

async function readStatus(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function waitFor(callback, description, timeoutMs = 15_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await callback();
      if (result !== undefined && result !== false) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${description}${lastError === undefined ? "" : `: ${lastError}`}`);
}

async function waitForDevtools(profile, chrome) {
  const marker = join(profile, "DevToolsActivePort");
  return waitFor(async () => {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with status ${chrome.exitCode}`);
    try {
      const [port] = (await readFile(marker, "utf8")).trim().split("\n");
      return port ? { port } : undefined;
    } catch {
      return undefined;
    }
  }, "Chrome DevTools endpoint");
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

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
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
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.pending.delete(id);
      reject(new Error(`Chrome DevTools command timed out: ${method}`));
    }, 10_000);
    socket.pending.set(id, {
      resolve(result) { clearTimeout(timeout); resolve(result); },
      reject(error) { clearTimeout(timeout); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function navigate(socket, url) {
  await cdp(socket, "Page.navigate", { url });
  await waitForExpression(socket, "document.readyState === 'complete'", 10_000);
}

async function value(socket, expression) {
  const result = await cdp(socket, "Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function setText(socket, selector, text) {
  const expression = `(() => { const field = document.querySelector(${JSON.stringify(selector)}); if (!field) return false; const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set; setter.call(field, ${JSON.stringify(text)}); field.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
  assert.equal(await value(socket, expression), true, `field exists: ${selector}`);
}

async function waitForExpression(socket, expression, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await value(socket, expression)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for browser expression: ${expression}; page text: ${await value(socket, "document.body.innerText")}`);
}
