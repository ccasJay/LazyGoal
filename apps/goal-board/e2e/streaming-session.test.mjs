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

test("streaming session keeps one runtime queue across Steer, Interrupt, tabs and restart", { timeout: 180_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lazygoal-streaming-session-"));
  const workspace = join(temporaryRoot, "workspace");
  const data = join(temporaryRoot, "data");
  const home = join(temporaryRoot, "home");
  const profile = join(temporaryRoot, "chrome-profile");
  const statusPath = join(temporaryRoot, "status.json");
  await Promise.all([mkdir(workspace), mkdir(home)]);

  let service;
  let chrome;
  let socket;
  let secondSocket;

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

    await navigate(socket, first.launchUrl);
    await waitForExpression(socket, "document.querySelector('button.primary') !== null", 15_000);
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('button.primary')].find(button => button.textContent.includes('New goal')).click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]') !== null", 15_000);
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "Streaming session flow: stream one long running goal");
    await waitForExpression(socket, "document.querySelector('button[aria-label=\"Send message\"]')?.disabled === false", 15_000);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Send message\"]').click()", returnByValue: true });
    let session = await waitForSession(first.origin, first.token, (candidate) => candidate.runStatus === "running" || candidate.runStatus === "waiting");
    const goalId = session.goalId;
    const firstRunId = session.currentRunId;
    await waitForExpression(socket, "document.querySelector('.composer-area') !== null", 15_000);

    // 运行中默认 Queue：默认发送只持久化受理，不取消在途调用。
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "Queued while running");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('textarea[aria-label=\\\"Message the Goal\\\"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.run-send-options') !== null", 10_000);
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.run-send-options button')].find(button => button.textContent === 'Queue').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.queued-inputs')?.innerText.includes('Queued while running')", 15_000);
        session = await waitForSession(first.origin, first.token, (candidate) => (candidate.pendingMessages?.length ?? 0) === 1);
    assert.equal(session.currentRunId, firstRunId);
    assert.equal(session.queue.paused, false);
    const queueRevision = session.queue.revision;

    // 显式 Steer 面向当前 Run，出现在待应用列表。
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "Steer this active Run");
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('textarea[aria-label=\\\"Message the Goal\\\"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.run-send-options') !== null", 10_000);
    await cdp(socket, "Runtime.evaluate", { expression: "[...document.querySelectorAll('.run-send-options button')].find(button => button.textContent === 'Steer').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.pending-steers')?.innerText.includes('Steer this active Run')", 15_000);
    session = await waitForSession(first.origin, first.token, (candidate) => (candidate.pendingSteers?.length ?? 0) === 1);
    assert.equal(session.currentRunId, firstRunId);
    assert.equal(session.pendingSteers[0].content, "Steer this active Run");

    // 显式 Interrupt：停止阶段可观察，最终以 cancelled 结算并暂停队列。
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Interrupt Run\"]').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('button[aria-label=\"Stopping Run\"]') !== null || document.querySelector('.queue-paused') !== null", 10_000);
    const paused = await waitForSession(first.origin, first.token, (candidate) => candidate.queue?.paused === true);
    assert.equal(paused.queue.pauseReason, "user_interrupt");
    assert.equal((paused.pendingMessages ?? []).length, 1, "queued message stays pending while paused");
    const cancelled = await waitForSession(first.origin, first.token, (candidate) => candidate.runStatus === "cancelled");
    assert.equal(cancelled.currentRunId, firstRunId);
    // 已受理但未应用的 Steer 保留可核验身份，且不能出现在对话中。
    assert.deepEqual((cancelled.pendingSteers ?? []).map((item) => item.content), ["Steer this active Run"]);
    assert.equal(cancelled.messages.some((message) => message.role === "user" && message.content === "Steer this active Run"), false, "a cancelled Run never applies its pending Steer");
    // 取消结算后不再产生新的模型调用。
    const cancelledCalls = (await readStatus(statusPath)).modelCalls;
    await delay(1_500);
    assert.equal((await readStatus(statusPath)).modelCalls, cancelledCalls, "a cancelled Run makes no further model call");

    // 刷新与第二个标签页：队列、暂停与修订都来自服务端，旧本地队列不再被导入。
    await cdp(socket, "Runtime.evaluate", {
      expression: `localStorage.setItem(${JSON.stringify(`lazygoal.queue.${goalId}`)}, JSON.stringify({ items: [{ messageId: "legacy-local-task", content: "Legacy local task" }], paused: false }))`,
      returnByValue: true,
    });
    await cdp(socket, "Page.reload");
    await waitForExpression(socket, "document.readyState === 'complete' && document.querySelector('.goal-card') !== null", 15_000);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelectorAll('.goal-card')[0].click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.queued-inputs')?.innerText.includes('Queued while running')", 15_000);
    assert.equal(await value(socket, "document.querySelector('.queued-inputs').innerText.includes('Legacy local task')"), false, "the legacy local queue is never imported");
    await waitForExpression(socket, "document.querySelector('.queue-paused') !== null", 15_000);
    session = await sessionDetail(first.origin, first.token, goalId);
    assert.deepEqual((session.pendingMessages ?? []).map((item) => item.content), ["Queued while running"], "refresh only restores Runtime-accepted items");
    assert.equal(session.queue.paused, true, "the legacy paused flag is not imported");
    const secondTarget = await (await fetch(`http://127.0.0.1:${devtools.port}/json/new?${encodeURIComponent(first.launchUrl)}`, { method: "PUT" })).json();
    secondSocket = await connectCdp(secondTarget.webSocketDebuggerUrl);
    await cdp(secondSocket, "Page.enable");
    await cdp(secondSocket, "Runtime.enable");
    await cdp(secondSocket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await waitForExpression(secondSocket, "document.querySelector('.goal-card') !== null", 20_000);
    await cdp(secondSocket, "Runtime.evaluate", { expression: "document.querySelectorAll('.goal-card')[0].click()", returnByValue: true });
    await waitForExpression(secondSocket, "document.querySelector('.queued-inputs')?.innerText.includes('Queued while running')", 20_000);
    session = await sessionDetail(first.origin, first.token, goalId);
    assert.equal((session.pendingMessages ?? []).length, 1, "both tabs read the same single accepted item");

    // 拒绝保留草稿：过期修订的队列控制被拒绝且不清空输入框。
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "Draft that must survive rejection");
    const staleControl = await api(first.origin, `/api/goals/${goalId}/inputs`, {
      token: first.token,
      method: "POST",
      headers: { "content-type": "application/json", origin: first.origin },
      body: JSON.stringify({ kind: "queue_control", inputId: "stale-revision", action: "clear", queueRevision: queueRevision + 99 }),
    });
    assert.equal(staleControl.response.status, 409);
    assert.equal(staleControl.body.error, "QUEUE_REVISION_MISMATCH");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\\\"Message the Goal\\\"]')?.value"), "Draft that must survive rejection");
    await setText(socket, "textarea[aria-label=\"Message the Goal\"]", "");

    // 丢响应重试复用身份：同一 inputId 重试返回既有收据，不重复入队。
    const firstAttempt = await api(first.origin, `/api/goals/${goalId}/inputs`, {
      token: first.token,
      method: "POST",
      headers: { "content-type": "application/json", origin: first.origin },
      body: JSON.stringify({ kind: "message", inputId: "retry-identity", content: "Retry once" }),
    });
    assert.equal(firstAttempt.response.status, 202);
    const retried = await api(first.origin, `/api/goals/${goalId}/inputs`, {
      token: first.token,
      method: "POST",
      headers: { "content-type": "application/json", origin: first.origin },
      body: JSON.stringify({ kind: "message", inputId: "retry-identity", content: "Retry once" }),
    });
    assert.equal(retried.response.status, 200);
    assert.equal(retried.body.existing, true);
    assert.equal(retried.body.receipt.sequence, firstAttempt.body.receipt.sequence);
    session = await waitForSession(first.origin, first.token, (candidate) => (candidate.pendingMessages?.length ?? 0) === 2);
    assert.equal(session.pendingMessages.filter((item) => item.content === "Retry once").length, 1, "identity retry does not duplicate the queued item");

    // 显式继续队列：从原队首启动后继 Run，页面刷新后只看到服务端顺序。
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.queue-paused button').click()", returnByValue: true });
    session = await waitForSession(first.origin, first.token, (candidate) => candidate.currentRunId !== firstRunId && candidate.queue?.paused === false);
    assert.notEqual(session.currentRunId, firstRunId);
    assert.deepEqual((session.pendingMessages ?? []).map((item) => item.content), ["Retry once"], "the original queue head is applied before the newer item");

    // 清空队列只影响尚未应用的普通消息，并保留收据。
    const clearable = await waitForSession(first.origin, first.token, (candidate) => (candidate.pendingMessages?.length ?? 0) === 1);
    const cleared = await api(first.origin, `/api/goals/${goalId}/inputs`, {
      token: first.token,
      method: "POST",
      headers: { "content-type": "application/json", origin: first.origin },
      body: JSON.stringify({ kind: "queue_control", inputId: "clear-queue", action: "clear", queueRevision: clearable.queue.revision }),
    });
    assert.equal(cleared.response.status, 202);
    const afterClear = await waitForSession(first.origin, first.token, (candidate) => (candidate.pendingMessages ?? []).length === 0);
    assert.equal(afterClear.queue.paused, false);
    const receipt = await api(first.origin, `/api/goals/${goalId}/inputs/retry-identity`, { token: first.token });
    assert.equal(receipt.body.found, true);
    assert.equal(receipt.body.receipt.status, "cleared");

    // 重启：页面只显示待恢复状态，不发起模型调用，已受理身份与当前 Run 保持不变。
    const beforeRestart = await sessionDetail(first.origin, first.token, goalId);
    await stopService(service);
    service = await startService({ workspace, data, home, statusPath, runOffset: 20, modelOffset: 60, delayModel: true });
    const restarted = await service.ready;
    await cdp(socket, "Page.navigate", { url: restarted.launchUrl });
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null", 20_000);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelectorAll('.goal-card')[0].click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.composer-recover-actions button')?.textContent.includes('Resume Run')", 20_000);
    assert.equal((await readStatus(statusPath)).modelCalls, 60, "restart performs no automatic model call");
    const recovered = await sessionDetail(restarted.origin, restarted.token, goalId);
    assert.equal(recovered.currentRunId, beforeRestart.currentRunId, "restart keeps the accepted Run identity");
    assert.notEqual(recovered.execution.state, "active");
    const restoredReceipt = await api(restarted.origin, `/api/goals/${goalId}/inputs/retry-identity`, { token: restarted.token });
    assert.equal(restoredReceipt.response.status, 200);
    assert.equal(restoredReceipt.body.found, true);
    assert.equal(restoredReceipt.body.receipt.status, "cleared", "accepted input identities survive the restart");
  } finally {
    socket?.close();
    secondSocket?.close();
    if (chrome !== undefined) await stopProcess(chrome, "SIGKILL", 5_000);
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
