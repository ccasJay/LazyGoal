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
const webUrl = "http://127.0.0.1:4173";
const token = "e2e-token";

test("Goal board uses saved state, structured waits, and full-width session tabs", async () => {
  const mock = createMockApi();
  const apiAddress = await listen(mock.server);
  const apiPort = Number(new URL(apiAddress).port);
  const webServer = spawn(
    process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
    {
      cwd: root,
      env: { ...process.env, LAZYGOAL_E2E_API_PORT: String(apiPort) },
      stdio: "ignore",
    },
  );
  const profile = await mkdtemp(join(tmpdir(), "lazygoal-browser-e2e-"));
  let chrome;
  let socket;

  try {
    await waitForHttp(`${webUrl}/`);
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

    await navigate(socket, `${webUrl}/`);
    await waitForExpression(socket, "document.body.innerText.includes('lazygoal web')");
    assert.equal(await value(socket, "document.querySelector('button.primary')?.disabled"), true);
    assert.equal(mock.authorizedRequests(), 0, "preview without a fragment token makes no API requests");

    await navigate(socket, `${webUrl}/?session=desktop#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    assert.equal(await value(socket, "document.querySelector('.sidebar, .view-switch, .filter') === null"), true);
    assert.match(await value(socket, "document.body.innerText"), /Collect approved notes from the current workspace/);
    assert.doesNotMatch(await value(socket, "document.body.innerText"), /Sample goal|Project selector|Workspace settings/);
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });

    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Checking saved notes…')");
    assert.match(await value(socket, "document.querySelector('.session').innerText"), /Live response/);
    assert.match(await value(socket, "document.querySelector('.session').innerText"), /Not saved yet/);
    assert.doesNotMatch(await value(socket, "document.querySelector('.session').innerText"), /Run completed/);
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Which source should I use?')");
    const conversationBounds = await value(socket, "(() => { const timeline = document.querySelector('.run-timeline').getBoundingClientRect(); const composer = document.querySelector('.composer-area .approval').getBoundingClientRect(); return { timelineWidth: timeline.width, composerWidth: composer.width, centerGap: Math.abs((timeline.left + timeline.right - composer.left - composer.right) / 2) }; })()");
    assert.ok(conversationBounds.timelineWidth <= 800 && conversationBounds.composerWidth <= 800);
    assert.ok(conversationBounds.centerGap < 16);
    assert.equal(await value(socket, "document.querySelector('.session-header') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.topbar .goal-info-toggle') !== null"), true);
    assert.deepEqual(await value(socket, "[...document.querySelectorAll('.session-tab-buttons button')].map(button => button.textContent)"), ["Board", "Activity", "Trajectory"]);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.session-tab-buttons button').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.session .board-area .goal-card') !== null");
    assert.equal(await value(socket, "document.querySelectorAll('.session .board .column').length"), 5);
    assert.equal(await value(socket, "document.querySelector('.session .board-footer') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.session .composer-area') === null"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.session .goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "[...document.querySelectorAll('.session-tab-buttons button')].find(button => button.textContent === 'Activity')?.getAttribute('aria-pressed') === 'true'");
    assert.equal(await value(socket, "[...document.querySelectorAll('.session-tab-buttons button')].some(button => button.textContent === 'Plan')"), false);
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.composer-area .current-model-control') !== null"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    assert.equal(await value(socket, "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Unavailable Model')).disabled"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close model picker\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-picker') === null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('label.answer-option')].find(label => label.innerText.includes('Approved notes')).querySelector('input').click()",
      returnByValue: true,
    });
    mock.rejectNextModelSelection();
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Selected Model')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-error')?.textContent.includes('could not save')");
    assert.equal(await value(socket, "[...document.querySelectorAll('label.answer-option')].find(label => label.innerText.includes('Approved notes')).querySelector('input').checked"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close model picker\"]').click()", returnByValue: true });
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('button')].find(button => button.textContent.includes('Submit answer')).click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Run completed')");
    await waitForExpression(socket, "document.querySelector('.composer-area .composer') !== null");
    const inputBounds = await value(socket, "(() => { const box = document.querySelector('.composer-area .composer').getBoundingClientRect(); return { width: box.width, centerGap: Math.abs((box.left + box.right) / 2 - window.innerWidth / 2) }; })()");
    assert.ok(inputBounds.width <= 800 && inputBounds.centerGap < 16);
    assert.deepEqual(mock.lastInteraction, {
      kind: "answer_ask_user",
      runId: "run-1",
      requestId: "request-1",
      answers: [{ questionId: "source", optionIds: ["approved"] }],
    });

    mock.resetToWaiting();
    await cdp(socket, "Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await navigate(socket, `${webUrl}/?session=mobile#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Which source should I use?')");
    assert.equal(await value(socket, "getComputedStyle(document.querySelector('.session')).position"), "relative");
    assert.equal(await value(socket, "document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.equal(await value(socket, "document.querySelector('.run-timeline').getBoundingClientRect().width <= window.innerWidth - 32"), true);
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('button[aria-label=\"Close session\"]').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session') === null");
    assert.notEqual(await value(socket, "document.querySelector('.goal-card') === null"), true);

    mock.resetToUnknownAction();
    await navigate(socket, `${webUrl}/?session=recovery#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Action result needs review')");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]') === null"), true);
    assert.equal(await value(socket, "[...document.querySelectorAll('.approval button')].some(button => button.textContent.includes('Approve action'))"), true);

    mock.resetToAction();
    await navigate(socket, `${webUrl}/?session=approval#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.approval')?.innerText.includes('Your approval is needed')");
    assert.equal(await value(socket, "[...document.querySelectorAll('.approval-scopes label')].find(label => label.innerText.includes('This Goal')).querySelector('input').disabled"), true);
    assert.equal(await value(socket, "document.querySelector('.path-permission-note')?.innerText.includes('src/file.ts')"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.action-details-toggle').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.action-input-full')?.innerText.includes('Complete private body')");
    assert.equal(await value(socket, "[...document.querySelectorAll('.approval-scopes label')].find(label => label.innerText.includes('This Goal')).querySelector('input').disabled"), false);
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('.approval-scopes label')].find(label => label.innerText.includes('This Goal')).querySelector('input').click()",
      returnByValue: true,
    });
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.approval-primary').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('I collected the approved notes.')");
    assert.equal(mock.lastInteraction.scope, "goal");

    mock.resetGrants();
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('button[aria-label=\"Goal information and permissions\"]').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.grant-panel')?.innerText.includes('src/file.ts')");
    assert.equal(await value(socket, "[...document.querySelectorAll('.grant-panel button')].some(button => button.textContent.includes('Revoke'))"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.grant-revoke').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.grant-panel')?.innerText.includes('No ongoing permissions.')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close Goal information\"]').click()", returnByValue: true });

    mock.resetToFailed();
    await navigate(socket, `${webUrl}/?session=failed#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.goal-card').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('This Run failed')");
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]') !== null");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/unknown");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Send message\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.command-error')?.innerText.includes('Unknown slash command')");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]').value"), "/unknown");
    assert.equal(mock.lastMessage, undefined);
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/plan extra");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Send message\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.command-error')?.innerText.includes('does not accept')");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]').value"), "/plan extra");
    assert.equal(mock.planModeRequests, 0);
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/p");
    await waitForExpression(socket, "document.querySelector('.command-candidate')?.textContent.includes('/plan')");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('textarea[aria-label=\"Message the Goal\"]').focus()",
      returnByValue: true,
    });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    assert.equal(await value(socket, "document.querySelector('.command-candidates') === null"), true);
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]').value"), "/p");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/pl");
    await waitForExpression(socket, "document.querySelector('.command-candidate') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.command-candidate').click()", returnByValue: true });
    await waitForLocal(() => mock.planModeRequests === 1);
    assert.deepEqual(mock.lastPlanMode, { runId: "run-1" });
    assert.equal(mock.lastMessage, undefined, "command selection does not submit a Goal message");
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]')?.disabled === false");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/p");
    await waitForExpression(socket, "document.querySelector('.command-candidate') !== null");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('textarea[aria-label=\"Message the Goal\"]').focus()",
      returnByValue: true,
    });
    await cdp(socket, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await waitForLocal(() => mock.planModeRequests === 2);
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]')?.disabled === false");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/mod");
    await waitForExpression(socket, "document.querySelector('.command-candidate')?.textContent.includes('/model')");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.command-candidate').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Selected Model')).click()", returnByValue: true });
    await waitForLocal(() => mock.lastModelSelection?.modelId === "model-selected");
    await waitForExpression(socket, "document.querySelector('.model-picker') === null");
    assert.equal(mock.lastMessage, undefined, "model command does not submit a Goal message");
    mock.delayNextModelCatalog();
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-picker') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close model picker\"]').click()", returnByValue: true });
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.composer-area .current-model-control').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    await delay(250);
    assert.equal(await value(socket, "document.querySelector('.model-picker')?.innerText.includes('Stale Model')"), false);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Close model picker\"]').click()", returnByValue: true });
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "Try again with the saved history");
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('button[aria-label=\"Send message\"]').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session')?.innerText.includes('Try again with the saved history')");
    assert.deepEqual(mock.lastMessage, { runId: "run-1", content: "Try again with the saved history" });
    mock.resetToFailed();
    await navigate(socket, `${webUrl}/?session=escaped#${token}`);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]') !== null");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "//plan");
    assert.equal(await value(socket, "document.querySelector('.command-candidates') === null"), true);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Send message\"]').click()", returnByValue: true });
    await waitForLocal(() => mock.lastMessage?.content === "/plan");
    assert.equal(mock.planModeRequests, 2, "escaped text does not execute a command");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.header-actions .primary').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.draft-timeline') !== null");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "/model");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Send message\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-option') !== null");
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.model-option')].find(button => button.textContent.includes('Selected Model')).click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.model-picker') === null");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "Inspect the current workspace");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Send message\"]').click()", returnByValue: true });
    await waitForLocal(() => mock.lastCreate?.modelId === "model-selected");
    assert.equal(mock.lastCreate.intent, "Inspect the current workspace");
    assert.ok(mock.authorizationHeaders.every((header) => header === `Bearer ${token}`));
  } finally {
    socket?.close();
    if (chrome !== undefined && chrome.exitCode === null) {
      const closed = once(chrome, "close");
      chrome.kill("SIGTERM");
      await closed;
    }
    webServer.kill("SIGTERM");
    mock.server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

function createMockApi() {
  let session = waitingSession();
  let currentListItem = listItem("waiting");
  let liveTransitionSent = false;
  let lastInteraction;
  let lastMessage;
  let lastPlanMode;
  let lastModelSelection;
  let lastCreate;
  let selectedModelId = "model-default";
  let rejectNextSelection = false;
  let delayNextCatalog = false;
  let planModeRequests = 0;
  const authorizationHeaders = [];
  let authorizedRequestCount = 0;
  const server = createServer(async (request, response) => {
    authorizationHeaders.push(request.headers.authorization ?? "");
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    authorizedRequestCount += 1;
    if (request.url === "/api/goals" && request.method === "GET") {
      json(response, { goals: [currentListItem] });
      return;
    }
    if (request.url === "/api/models" && request.method === "GET") {
      json(response, { provider: "openai", currentModelId: "model-default", models: [
        { id: "model-default", displayName: "Default Model", availabilitySource: "live", metadataSource: "catalog", selectable: true },
        { id: "model-selected", displayName: "Selected Model", availabilitySource: "catalog", metadataSource: "catalog", selectable: true },
      ] });
      return;
    }
    if (request.url === "/api/goals" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      lastCreate = JSON.parse(body);
      json(response, { goalId: lastCreate.goalId, runId: "new-run", existing: false });
      return;
    }
    if (request.url === "/api/goals/goal-1" && request.method === "GET") {
      json(response, { goal: session });
      return;
    }
    if (request.url === "/api/goals/goal-1/models?runId=run-1" && request.method === "GET") {
      if (delayNextCatalog) {
        delayNextCatalog = false;
        await delay(180);
        json(response, { provider: "openai", currentModelId: "stale", models: [
          { id: "stale", displayName: "Stale Model", availabilitySource: "catalog", metadataSource: "catalog", selectable: true },
        ] });
        return;
      }
      json(response, {
        provider: "openai",
        currentModelId: selectedModelId,
        models: [
          { id: "model-default", displayName: "Default Model", availabilitySource: "live", metadataSource: "catalog", selectable: true },
          { id: "model-selected", displayName: "Selected Model", availabilitySource: "catalog", metadataSource: "catalog", selectable: true },
          { id: "model-disabled", displayName: "Unavailable Model", availabilitySource: "catalog", metadataSource: "catalog", selectable: false, unavailableReason: "Unsupported output mode" },
        ],
      });
      return;
    }
    if (request.url === "/api/goals/goal-1/model-selection" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      lastModelSelection = JSON.parse(body);
      if (rejectNextSelection) {
        rejectNextSelection = false;
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "model_selection_failed" }));
        return;
      }
      selectedModelId = lastModelSelection.modelId;
      json(response, { ok: true, goalId: "goal-1", runId: "run-1", modelId: selectedModelId });
      return;
    }
    if (request.url === "/api/goals/goal-1/plan-mode" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      lastPlanMode = JSON.parse(body);
      planModeRequests += 1;
      session = { ...session, nextRunMode: "plan" };
      json(response, { goalId: "goal-1", runId: "run-1", existing: planModeRequests > 1 });
      return;
    }
    if (request.url === "/api/goals/goal-1/actions/action-1?runId=run-1" && request.method === "GET") {
      json(response, { ok: true, goalId: "goal-1", runId: "run-1", actionId: "action-1", toolId: "write_file", input: { path: "src/file.ts", content: "Complete private body" } });
      return;
    }
    if (request.url === "/api/goals/goal-1/grants?runId=run-1" && request.method === "GET") {
      json(response, { ok: true, goalId: "goal-1", runId: "run-1", grants: [{ grantId: "grant-1", scope: "workspace", toolId: "write_file", status: "active", targetPath: "src/file.ts" }] });
      return;
    }
    if (request.url === "/api/goals/goal-1/grants/grant-1" && request.method === "DELETE") {
      json(response, { ok: true, goalId: "goal-1", runId: "run-1", grants: [] });
      return;
    }
    if (request.url?.startsWith("/api/goals/goal-1/events?") && request.method === "GET") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      if (!liveTransitionSent) {
        liveTransitionSent = true;
        response.write(`data: ${JSON.stringify({
          goalId: "goal-1",
          runId: "run-1",
          type: "activity",
          activity: { kind: "assistant_text_delta", text: "Checking saved notes…", truncated: false },
        })}\n\n`);
        const timer = setTimeout(() => {
          session = interactionSession();
          currentListItem = listItem("waiting");
          response.write(`data: ${JSON.stringify({ goalId: "goal-1", runId: "run-1", type: "snapshot_changed" })}\n\n`);
        }, 120);
        request.on("close", () => clearTimeout(timer));
      }
      return;
    }
    if (request.url === "/api/goals/goal-1/interactions" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      lastInteraction = JSON.parse(body);
      session = completedSession(session);
      currentListItem = listItem("completed");
      json(response, { goalId: "goal-1", runId: "run-1", existing: false });
      return;
    }
    if (request.url === "/api/goals/goal-1/messages" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      lastMessage = JSON.parse(body);
      session = {
        ...session,
        currentRunId: "run-2",
        runStatus: "waiting",
        messages: [...session.messages, { role: "user", content: lastMessage.content }],
        runs: [
          ...session.runs.map((run) => ({ ...run, current: false })),
          { runId: "run-2", status: "waiting", stepCount: 0, steps: [], current: true },
        ],
      };
      currentListItem = { ...listItem("waiting"), runId: "run-2" };
      json(response, { goalId: "goal-1", runId: "run-2", existing: false });
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
  return {
    server,
    authorizationHeaders,
    get lastInteraction() { return lastInteraction; },
    get lastMessage() { return lastMessage; },
    get lastPlanMode() { return lastPlanMode; },
    get lastModelSelection() { return lastModelSelection; },
    get lastCreate() { return lastCreate; },
    get planModeRequests() { return planModeRequests; },
    authorizedRequests: () => authorizedRequestCount,
    rejectNextModelSelection() { rejectNextSelection = true; },
    delayNextModelCatalog() { delayNextCatalog = true; },
    resetToWaiting() {
      session = interactionSession();
      currentListItem = listItem("waiting");
      liveTransitionSent = true;
    },
    resetToUnknownAction() {
      session = {
        ...interactionSession(),
        pendingInteraction: undefined,
        pendingAction: {
          actionId: "action-unknown",
          toolId: "write_file",
          status: "outcome_unknown",
          inputPreview: "{\"path\":\"src/file.ts\"}",
          inputPreviewTruncated: false,
          targetPath: "src/file.ts",
        },
      };
      currentListItem = listItem("waiting");
      liveTransitionSent = true;
    },
    resetToAction() {
      session = {
        ...interactionSession(),
        pendingInteraction: undefined,
        pendingAction: {
          actionId: "action-1",
          toolId: "write_file",
          status: "awaiting_approval",
          inputPreview: `{"path":"src/file.ts","content":"${"x".repeat(340)}"}`,
          inputPreviewTruncated: true,
          targetPath: "src/file.ts",
        },
      };
      currentListItem = listItem("waiting");
      liveTransitionSent = true;
    },
    resetGrants() {
      session = interactionSession();
      currentListItem = listItem("waiting");
      liveTransitionSent = true;
    },
    resetToFailed() {
      session = {
        ...waitingSession(),
        runStatus: "failed",
        runs: waitingSession().runs.map((run) => ({ ...run, status: "failed" })),
      };
      currentListItem = listItem("failed");
      liveTransitionSent = true;
    },
  };
}

function waitingSession() {
  return {
    goalId: "goal-1",
    intent: "Collect approved notes from the current workspace",
    currentRunId: "run-1",
    runStatus: "running",
    currentRunMode: "normal",
    messages: [{ role: "user", content: "Collect approved notes from the current workspace" }],
    runs: [{
      runId: "run-1",
      status: "running",
      stepCount: 1,
      steps: [{
        runId: "run-1",
        executionUnitId: "unit-1",
        sequence: 2,
        stepIndex: 1,
        toolId: "workspace.search",
        status: "completed",
        summary: "Found three approved notes.",
      }],
      current: true,
    }],
    historyTruncated: false,
  };
}

function interactionSession() {
  const session = waitingSession();
  session.runStatus = "waiting";
  session.runs = session.runs.map((run) => ({ ...run, status: "waiting" }));
  session.messages = [...session.messages, { role: "assistant", content: "Which source should I use?" }];
  session.pendingInteraction = {
    kind: "ask_user",
    requestId: "request-1",
    mode: "execution",
    questions: [{
      id: "source",
      header: "Choose a source",
      question: "Which notes should be included?",
      multiSelect: false,
      options: [
        { id: "approved", label: "Approved notes" },
        { id: "all", label: "All notes" },
      ],
    }],
  };
  return session;
}

function completedSession(previous) {
  return {
    ...previous,
    runStatus: "completed",
    pendingInteraction: undefined,
    messages: [
      ...previous.messages,
      { role: "user", content: "Approved notes" },
      { role: "assistant", content: "I collected the approved notes." },
    ],
    runs: previous.runs.map((run) => ({ ...run, status: "completed" })),
  };
}

function listItem(runStatus) {
  return {
    goalId: "goal-1",
    runId: "run-1",
    intent: "Collect approved notes from the current workspace",
    workflowPhase: "executing",
    runStatus,
    updatedAt: "2026-09-26T08:00:00.000Z",
  };
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

async function setText(socket, selector, text) {
  const expression = `(() => { const field = document.querySelector(${JSON.stringify(selector)}); if (!field) return false; const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set; setter.call(field, ${JSON.stringify(text)}); field.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
  assert.equal(await value(socket, expression), true, `field exists: ${selector}`);
}

async function waitForExpression(socket, expression) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    if (await value(socket, expression)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for browser expression: ${expression}; page text: ${await value(socket, "document.body.innerText")}`);
}

async function waitForLocal(predicate) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    if (predicate()) return;
    await delay(50);
  }
  throw new Error("Timed out waiting for local browser request");
}
