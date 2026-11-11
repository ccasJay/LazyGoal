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

test("existing Goal status and stop controls do not expose a follow-up composer", { timeout: 120_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lazygoal-worker-session-ui-"));
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
    const ready = await service.ready;
    const created = await api(ready.origin, "/api/goals", {
      token: ready.token,
      method: "POST",
      headers: { "content-type": "application/json", origin: ready.origin },
      body: JSON.stringify({
        goalId: "goal-worker-session-ui",
        inputId: "input-worker-session-ui",
        intent: "Streaming session flow: hold while the Worker stop control is checked",
      }),
    });
    assert.equal(created.response.status, 202, JSON.stringify(created.body));
    const running = await waitForSession(ready.origin, ready.token, (candidate) => candidate.goalId === "goal-worker-session-ui" && candidate.runStatus === "running");

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
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await navigate(socket, ready.launchUrl);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null", 20_000);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.composer-recover-actions button')?.textContent.includes('Stop Run')", 20_000);
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.queued-input-status') === null"), true);
    assert.equal(await value(socket, "[...document.querySelectorAll('.composer-area button')].some(button => /steer|queue|continue/i.test(button.textContent + ' ' + button.getAttribute('aria-label')))"), false);

    await cdp(socket, "Runtime.evaluate", { expression: "localStorage.setItem('lazygoal.queue.goal-worker-session-ui', JSON.stringify({ items: [{ messageId: 'legacy-item', content: 'legacy queue entry' }], paused: false }))", returnByValue: true });
    await cdp(socket, "Page.reload");
    await waitForExpression(socket, "document.readyState === 'complete' && document.querySelector('.goal-card') !== null", 20_000);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.composer-recover-actions button')?.textContent.includes('Stop Run')", 20_000);
    assert.equal(await value(socket, "document.querySelector('.queued-input-status') === null"), true, "legacy browser queue state is ignored");
    assert.equal(await value(socket, "document.body.innerText.includes('legacy queue entry')"), false);

    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('.composer-recover-actions button')].find(button => button.textContent.includes('Stop Run')).click()",
      returnByValue: true,
    });
    const stopped = await waitForSession(ready.origin, ready.token, (candidate) => candidate.goalId === running.goalId && candidate.runStatus === "cancelled");
    assert.equal(stopped.currentRunId, running.currentRunId, "stop settles the existing Run");
    assert.equal(stopped.messages.some((message) => message.role === "user" && message.content.includes("follow-up")), false);
  } finally {
    socket?.close();
    if (chrome !== undefined) await stopProcess(chrome, "SIGKILL", 5_000);
    if (service !== undefined) await stopService(service);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("recoverable Worker progress requires explicit unknown-effect confirmation", { timeout: 120_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lazygoal-recoverable-worker-"));
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
    const created = await api(first.origin, "/api/goals", {
      token: first.token,
      method: "POST",
      headers: { "content-type": "application/json", origin: first.origin },
      body: JSON.stringify({
        goalId: "goal-recoverable-worker",
        inputId: "input-recoverable-worker",
        intent: "Streaming session flow: hold this Run for explicit recovery verification",
      }),
    });
    assert.equal(created.response.status, 202, JSON.stringify(created.body));
    const running = await waitForSession(first.origin, first.token, (candidate) => candidate.runStatus === "running");
    await waitFor(async () => (await readStatus(statusPath)).modelCalls > 0, "the active model call", 15_000);

    await stopService(service);
    service = await startService({ workspace, data, home, statusPath, runOffset: 20, modelOffset: 20, delayModel: true });
    const restarted = await service.ready;
    const beforeResumeCalls = (await readStatus(statusPath)).modelCalls;

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
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await navigate(socket, restarted.launchUrl);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null", 20_000);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.composer-recover-actions button')?.textContent.includes('Resume Run')", 20_000);

    const recoverable = await sessionDetail(restarted.origin, restarted.token, running.goalId);
    assert.equal(recoverable.currentRunId, running.currentRunId);
    assert.equal(recoverable.runStatus, "running");
    assert.equal(recoverable.execution.state, "recoverable");
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') === null"), true);
    assert.equal(await value(socket, "document.querySelector('.composer-recover-actions button').disabled"), false);
    assert.equal((await readStatus(statusPath)).modelCalls, beforeResumeCalls, "loading a recoverable Goal does not resume it");

    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.composer-recover-actions button').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('[role=alertdialog]')?.innerText.includes('Resume and accept the risk')", 10_000);
    assert.match(await value(socket, "document.querySelector('[role=alertdialog]').innerText"), /may not show whether its last action took effect/);
    assert.equal((await readStatus(statusPath)).modelCalls, beforeResumeCalls, "opening the confirmation has no execution side effect");
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('[role=alertdialog] button')].find(button => button.textContent.includes('Resume and accept the risk')).click()",
      returnByValue: true,
    });

    await waitForExpression(socket, "document.querySelector('.composer-recover-actions button')?.textContent.includes('Stop Run')", 20_000);
    const resumed = await waitForSession(restarted.origin, restarted.token, (candidate) => candidate.goalId === running.goalId && candidate.runStatus === "running" && candidate.execution?.state === "active");
    assert.equal(resumed.currentRunId, running.currentRunId, "recovery continues the existing Run");
    await waitFor(
      async () => (await readStatus(statusPath)).modelCalls > beforeResumeCalls,
      "explicit recovery resumes model execution",
      20_000,
    );
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') === null"), true);
    await cdp(socket, "Runtime.evaluate", {
      expression: "[...document.querySelectorAll('.composer-recover-actions button')].find(button => button.textContent.includes('Stop Run')).click()",
      returnByValue: true,
    });
    const stopped = await waitForSession(restarted.origin, restarted.token, (candidate) => candidate.goalId === running.goalId && candidate.runStatus === "cancelled");
    assert.equal(stopped.currentRunId, running.currentRunId, "stop cancels the recovered Run in place");
  } finally {
    socket?.close();
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
