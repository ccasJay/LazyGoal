import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const serviceEntry = join(repositoryRoot, "apps/goal-board/e2e/test-service.ts");

const goalId = "goal-session-output-e2e";

test("real service and browser share one session output protocol", { timeout: 180_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lazygoal-session-output-e2e-"));
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
    service = await startService({ workspace, data, home, statusPath, runOffset: 0, modelOffset: 0, delayModel: true });
    const first = await service.ready;

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
    // 显式桌面布局视口：headless 默认宽度会触发移动布局。
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    // 受理首条输入：真实服务路径执行同一会话输出协议。
    const created = await api(first.origin, "/api/goals", {
      token: first.token,
      method: "POST",
      headers: { "content-type": "application/json", origin: first.origin },
      body: JSON.stringify({
        goalId,
        inputId: "input-session-output-e2e",
        intent: "Session output flow: verify one formal answer",
      }),
    });
    assert.equal(created.response.status, 202, JSON.stringify(created.body));

    // 页面就绪：Board 使用同一条 Goal SSE，不保留第二条输出通道。
    await navigate(socket, first.launchUrl);
    await waitForExpression(socket, "document.querySelector('button.primary') !== null", 20_000);

    // 有界消息查询按稳定身份返回已提交消息与原文。
    const messages = await api(first.origin, `/api/goals/${goalId}/messages?limit=50`, { token: first.token });
    assert.equal(messages.response.status, 200);
    assert.equal(messages.body.ok, true);
    assert.equal(messages.body.messages.length >= 1, true);
    const intent = messages.body.messages.find((entry) => entry.content === "Session output flow: verify one formal answer");
    assert.ok(intent, JSON.stringify(messages.body.messages));
    assert.equal(intent.role, "user");
    assert.equal(intent.sourceKind, "user_input");

    const detail = await api(first.origin, `/api/goals/${goalId}/messages/${intent.messageId}`, { token: first.token });
    assert.equal(detail.response.status, 200);
    assert.equal(detail.body.message.content, "Session output flow: verify one formal answer");
    assert.equal(detail.body.message.truncated, false);

    // 未知身份明确不存在。
    const missing = await api(first.origin, `/api/goals/${goalId}/messages/msg-unknown`, { token: first.token });
    assert.equal(missing.response.status, 404);

    // 非法分页参数明确拒绝。
    const invalid = await api(first.origin, `/api/goals/${goalId}/messages?limit=1000`, { token: first.token });
    assert.equal(invalid.response.status, 400);

    // 候选预览先进入可见 DOM；正式 Activity 到达后必须复用同一节点身份。
    await navigate(socket, first.launchUrl);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null", 20_000);
    await cdp(socket, "Runtime.evaluate", {
      expression: "(() => { const card = [...document.querySelectorAll('.goal-card')].find(node => node.innerText.includes(" + JSON.stringify("Session output flow: verify one formal answer") + ")); if (card === undefined) return { clicked: false, reason: 'created goal card missing', cards: [...document.querySelectorAll('.goal-card')].map(node => node.innerText) }; card.click(); return { clicked: true, pressed: card.getAttribute('aria-pressed'), text: card.innerText }; })()",
      returnByValue: true,
    });
    try {
      await waitForExpression(socket, "document.querySelector('.session-tab-buttons button') !== null", 20_000);
    } catch (error) {
      const browserState = await value(socket, "({ url: location.href, body: document.body.innerText, cards: [...document.querySelectorAll('.goal-card')].map(node => ({ text: node.innerText, pressed: node.getAttribute('aria-pressed') })), breadcrumb: document.querySelector('.breadcrumb-current')?.innerText ?? null, errors: [...document.querySelectorAll('[role=alert]')].map(node => node.innerText) })");
      const apiState = await api(first.origin, "/api/goals/" + goalId, { token: first.token });
      throw new Error(error.message + "; browser=" + JSON.stringify(browserState) + "; sessionApi=" + JSON.stringify({ status: apiState.response.status, body: apiState.body }));
    }
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('.session-tab-buttons button')].find(button => button.getAttribute('aria-label') === 'Activity')?.click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.session-timeline-feed') !== null", 20_000);
    await waitForExpression(socket, "document.querySelector('.action-region')?.innerText.includes('browser_fixture_write')", 30_000);
    await waitForExpression(socket, "[...document.querySelectorAll('.action-region button')].some(button => button.textContent.trim() === 'Approve once')", 30_000);
    const approvedAction = await value(socket, "(() => { const button = [...document.querySelectorAll('.action-region button')].find(candidate => candidate.textContent.trim() === 'Approve once'); if (button === undefined) return false; button.click(); return true; })()");
    assert.equal(approvedAction, true, "the real action approval form accepts the fixture action");
    await waitForExpression(socket, "document.querySelector('.candidate-message') !== null", 90_000);
    const previewNode = await value(socket, `(() => {
      const node = document.querySelector('.candidate-message');
      const feed = node?.closest('.session-timeline-feed');
      if (node === null || feed === null) return undefined;
      const items = [...node.parentElement.children];
      window.__candidateNode = node;
      window.__candidateKey = node.dataset.presentationKey;
      window.__candidatePrefix = items.slice(0, items.indexOf(node));
      return { key: node.dataset.presentationKey, text: node.innerText };
    })()`);
    assert.ok(previewNode?.key, JSON.stringify(previewNode));
    assert.match(previewNode.text, /The controlled action completed\./);
    assert.match(previewNode.text, /Draft answer/);

    await waitForExpression(socket, `(() => {
      const key = window.__candidateKey;
      return key !== undefined && [...document.querySelectorAll('[data-presentation-key]')].some(node =>
        node.dataset.presentationKey === key
        && !node.classList.contains('candidate-message')
        && node.innerText.includes('The controlled action completed.'));
    })()`, 90_000);

    let lastActivityResponse;
    const committedActivity = await waitFor(async () => {
      const result = await api(first.origin, `/api/goals/${goalId}/activity?limit=100`, { token: first.token });
      lastActivityResponse = { status: result.response.status, body: result.body };
      if (result.response.status !== 200) return undefined;
      return result.body.items.find(item => item.type === 'message' && item.purpose === 'answer')
        ? result.body
        : undefined;
    }, "saved completion candidate in Activity", 30_000).catch(async error => {
      const [state, messages] = await Promise.all([
        api(first.origin, "/api/goals/" + goalId + "?view=state", { token: first.token }),
        api(first.origin, "/api/goals/" + goalId + "/messages?limit=50", { token: first.token }),
      ]);
      throw new Error(error.message + "; lastActivity=" + JSON.stringify(lastActivityResponse)
        + "; state=" + JSON.stringify({ status: state.response.status, body: state.body })
        + "; messages=" + JSON.stringify({ status: messages.response.status, body: messages.body }));
    });
    const answer = committedActivity.items.find(item => item.type === 'message' && item.purpose === 'answer');
    assert.ok(answer);
    assert.equal(answer.previewId, previewNode.key.split(":").at(-1));
    // 同一 Action 的事实在页面上归入一个活动组条目；其余条目与服务端逐项对应。
    const actionFactItems = committedActivity.items.filter(item => item.type === "fact" && item.tool !== undefined);
    const actionGroupKeys = [...new Set(actionFactItems.map(item => item.actionId ?? item.eventId))];
    assert.equal(actionGroupKeys.length, 1, "the controlled action contributes exactly one activity group");
    const expectedItemIds = committedActivity.items
      .filter(item => !(item.type === "fact" && item.tool !== undefined))
      .filter(item => item.type !== "fact" || !["run_created", "run_started", "run_completed", "run_failed", "run_cancelled", "decision_received", "run_stage_accepted"].includes(item.eventType))
      .map(item => item.itemId);
    await cdp(socket, "Runtime.evaluate", {
      expression: `window.__expectedActivityIds = ${JSON.stringify(expectedItemIds)}`,
      returnByValue: true,
    });

    const promotedNode = await value(socket, `(() => {
      const matches = [...document.querySelectorAll('[data-presentation-key]')]
        .filter(node => node.dataset.presentationKey === window.__candidateKey);
      const node = matches[0];
      const feed = node?.closest('.session-timeline-feed');
      const items = node === undefined ? [] : [...node.parentElement.children];
      const nodeIndex = feed === null ? -1 : items.indexOf(node);
      const prefixStable = window.__candidatePrefix.every((prefixNode, index) => items[index] === prefixNode);
      const runStatus = feed?.querySelector('.timeline-run-summary.completed .timeline-run-status');
      const completedRunVisible = runStatus?.textContent === 'Completed';
      return {
        count: matches.length,
        sameNode: node === window.__candidateNode,
        candidateClassRemoved: node !== undefined && !node.classList.contains('candidate-message'),
        text: node?.innerText,
        itemId: node?.dataset.itemId,
        prefixStable,
        completedRunVisible,
      };
    })()`);
    assert.equal(promotedNode.count, 1);
    assert.equal(promotedNode.sameNode, true, "React promoted the existing article DOM node");
    assert.equal(promotedNode.candidateClassRemoved, true);
    assert.match(promotedNode.text, /The controlled action completed\./);
    assert.doesNotMatch(promotedNode.text, /Draft answer/);
    assert.equal(promotedNode.itemId, `message:${answer.messageId}`);
    assert.equal(promotedNode.prefixStable, true);
    assert.equal(promotedNode.completedRunVisible, true);
    await value(socket, "document.querySelectorAll('.timeline-stage-heading[aria-expanded=false]').forEach(button => button.click())");
    const expandedActivity = await value(socket, `(() => {
      const ids = [...new Set([...document.querySelectorAll('.session-timeline-feed [data-item-id]')].map(node => node.dataset.itemId))];
      return {
        items: ids.filter(id => window.__expectedActivityIds.includes(id)),
        groups: ids.filter(id => id.startsWith('activity:')),
      };
    })()`);
    assert.deepEqual(expandedActivity.items, expectedItemIds, "the expanded DOM keeps the server Activity order for messages and facts");
    assert.equal(expandedActivity.groups.length, 1, "the same Action collapses into one activity group entry");

    const persistedMessages = await api(first.origin, `/api/goals/${goalId}/messages?limit=50`, { token: first.token });
    assert.equal(persistedMessages.response.status, 200);
    const savedAnswers = persistedMessages.body.messages.filter(message => message.role === 'assistant' && message.purpose === 'answer');
    assert.equal(savedAnswers.length, 1);
    assert.equal(savedAnswers[0].messageId, answer.messageId);
    assert.equal(savedAnswers[0].sourceKind, 'completion_candidate');
    const actionLines = (await readFile(join(workspace, "controlled-tool-actions.jsonl"), "utf8")).trim().split("\n");
    assert.equal(actionLines.length, 1, "the visible action approval executed the deterministic tool exactly once");
    assert.equal(JSON.parse(actionLines[0]).value, "controlled write");

  } finally {
    if (socket !== undefined) socket.close();
    if (chrome !== undefined) chrome.kill("SIGKILL");
    if (service !== undefined) await stopService(service);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

function startService({ workspace, data, home, statusPath, runOffset, modelOffset, delayModel = false }) {
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
      LAZYGOAL_E2E_DELAY_MODEL: delayModel ? "1" : "0",
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
  await stopProcess(service.child, "SIGTERM", 30_000, service.logs);
}

async function stopProcess(child, signal, timeoutMs, logs = "") {
  if (child.exitCode !== null) return;
  const { once } = await import("node:events");
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
  const text = await response.text();
  return { response, body: text.startsWith("{") ? JSON.parse(text) : text };
}

async function sessionDetail(origin, token, goalId) {
  const detail = await api(origin, `/api/goals/${goalId}`, { token });
  assert.equal(detail.response.status, 200, JSON.stringify(detail.body));
  return detail.body.goal;
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
  }, "saved Goal state", 30_000);
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
  }, "Chrome DevTools endpoint", 20_000);
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
  const pending = new Map();
  let nextId = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (entry === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
    raw: socket,
    close() { socket.close(); },
    send(method, params) {
      const id = ++nextId;
      const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return promise;
    },
  };
}

function cdp(socket, method, params = {}) {
  return socket.send(method, params);
}

async function value(socket, expression) {
  const result = await cdp(socket, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return result.result?.value;
}

async function waitForExpression(socket, expression, timeout = 15_000) {
  await waitFor(async () => (await value(socket, `Boolean(${expression})`)) === true, `expression ${expression}`, timeout);
}

async function setText(socket, selector, text) {
  await cdp(socket, "Runtime.evaluate", {
    expression: `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (element === null) return false;
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(text)});
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`,
    returnByValue: true,
  });
}

async function navigate(socket, url) {
  await cdp(socket, "Page.navigate", { url });
}
