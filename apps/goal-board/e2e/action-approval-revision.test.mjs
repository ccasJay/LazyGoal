import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const serviceEntry = resolve(import.meta.dirname, "test-service.ts");

test("审批区域可以编辑同一工具参数、预检范围并按修订后的参数批准", async () => {
  const fixture = await startHarness("action-approval-revision");
  try {
    const { socket, service } = fixture;
    const { origin, token, launchUrl } = await service.ready;
    await navigate(socket, launchUrl);
    await waitForExpression(socket, "document.querySelector('button.primary') !== null", 20_000);

    const goal = await createGoal(socket, origin, token, "Approval revision flow");
    await waitForExpression(socket, "document.querySelector('.interaction-region.action-approval') !== null", 40_000);
    await waitForExpression(socket, "document.querySelector('.action-input-preview') !== null", 20_000);

    // 退出编辑不修改原操作：先打开编辑器再取消，原参数保持不变。
    await clickButton(socket, "Edit parameters");
    await waitForExpression(socket, "document.querySelector('textarea.edited-tool-input') !== null", 10_000);
    await setText(socket, "textarea.edited-tool-input", "{\"value\":\"revised write\"}");
    await clickButton(socket, "Cancel editing");
    await waitForExpression(socket, "document.querySelector('textarea.edited-tool-input') === null", 10_000);
    assert.match(await value(socket, "document.querySelector('.action-input-full').textContent"), /controlled write/);

    // 编辑并预检：展示原参数、最终参数与实际范围。
    await clickButton(socket, "Edit parameters");
    await waitForExpression(socket, "document.querySelector('textarea.edited-tool-input') !== null", 10_000);
    await setText(socket, "textarea.edited-tool-input", "{\"value\":\"revised write\"}");
    await clickButton(socket, "Preview changes");
    await waitForExpression(socket, "document.querySelector('.action-review') !== null", 20_000);
    const reviewText = await value(socket, "document.querySelector('.action-review').textContent");
    assert.match(reviewText, /controlled write/);
    assert.match(reviewText, /revised write/);
    assert.match(reviewText, /Original parameters/);
    assert.match(reviewText, /Final parameters/);

    // 明确确认后按修订参数执行。
    await clickButton(socket, "Approve revision once");
    const actions = await waitFor(async () => {
      const content = await readFile(join(fixture.workspace, "controlled-tool-actions.jsonl"), "utf8").catch(() => "");
      const lines = content.split("\n").filter((line) => line.trim().length > 0);
      return lines.length > 0 ? lines.map((line) => JSON.parse(line)) : undefined;
    }, "the controlled tool to run with the revised parameters", 40_000);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].value, "revised write");

    await waitFor(async () => {
      const detail = await sessionDetail(origin, token, goal.goalId);
      return detail.runStatus === "completed" ? detail : undefined;
    }, "the revised Run to complete", 40_000);
  } finally {
    await fixture.stop();
  }
});

async function startHarness(label) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), `lazygoal-${label}-`));
  const workspace = join(temporaryRoot, "workspace");
  const data = join(temporaryRoot, "data");
  const home = join(temporaryRoot, "home");
  const profile = join(temporaryRoot, "chrome-profile");
  const statusPath = join(temporaryRoot, "status.json");
  await Promise.all([mkdir(workspace), mkdir(home)]);
  const service = startService({ workspace, data, home, statusPath, runOffset: 0, modelOffset: 0 });
  await service.ready;
  const chrome = spawn(findChrome(), [
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
  const socket = await connectCdp(target.webSocketDebuggerUrl);
  await cdp(socket, "Page.enable");
  await cdp(socket, "Runtime.enable");
  // 显式桌面布局视口：headless 默认宽度会触发移动布局。
  await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  return {
    socket,
    service,
    statusPath,
    workspace,
    async stop() {
      socket.close();
      await stopProcess(chrome, "SIGKILL", 5_000);
      await stopService(service);
      await rm(temporaryRoot, { recursive: true, force: true });
    },
  };
}

async function createGoal(socket, origin, token, intent) {
  await cdp(socket, "Runtime.evaluate", {
    expression: "[...document.querySelectorAll('button.primary')].find(button => button.textContent.includes('New goal')).click()",
    returnByValue: true,
  });
  await waitForExpression(socket, "document.querySelector('textarea[aria-label=\"Message the Goal\"]') !== null", 20_000);
  await setText(socket, "textarea[aria-label=\"Message the Goal\"]", intent);
  await waitForExpression(socket, "document.querySelector('button[aria-label=\"Send message\"]')?.disabled === false", 20_000);
  await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('button[aria-label=\"Send message\"]').click()", returnByValue: true });
  const waiting = await waitForSession(origin, token, (candidate) => candidate.intent === intent && candidate.runStatus === "waiting");
  return { goalId: waiting.goalId, runId: waiting.currentRunId };
}

async function clickButton(socket, text) {
  await cdp(socket, "Runtime.evaluate", {
    expression: `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(text)}).click()`,
    returnByValue: true,
  });
}

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
      LAZYGOAL_E2E_DELAY_MODEL: "0",
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
  }, "saved Goal state", 40_000);
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
    if (message.id === undefined) return;
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
