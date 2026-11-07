import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const serviceEntry = join(repositoryRoot, "apps/goal-board/e2e/test-service.ts");
const goalId = "goal-board-streaming-e2e";

test("正式服务与真实浏览器贯通交错时间线、活动组与窄屏阅读", { timeout: 240_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lazygoal-board-streaming-e2e-"));
  const workspace = join(temporaryRoot, "workspace");
  const data = join(temporaryRoot, "data");
  const home = join(temporaryRoot, "home");
  const profile = join(temporaryRoot, "chrome-profile");
  const statusPath = join(temporaryRoot, "status.json");
  await Promise.all([mkdir(workspace), mkdir(data), mkdir(home)]);

  let service;
  let chrome;
  let socket;
  try {
    service = await startService({ workspace, data, home, statusPath });
    const ready = await service.ready;

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
    await cdp(socket, "Network.enable");
    // 显式桌面布局视口：headless 默认宽度会触发移动布局。
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    // 真实受理：正式服务按确定性适配器执行一次受控工具并保存正式答复。
    const created = await api(ready.origin, "/api/goals", {
      token: ready.token,
      method: "POST",
      headers: { "content-type": "application/json", origin: ready.origin },
      body: {
        goalId,
        inputId: "input-board-streaming-e2e",
        intent: "Streaming board flow: run the controlled acceptance tool",
      },
    });
    assert.equal(created.response.status, 202, JSON.stringify(created.body));

    // 在最终回答落库前展开 Run：短会话的折叠操作不能把后续输出挡在未读提示后面。
    await navigate(socket, ready.launchUrl);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null", 20_000);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.timeline-run-summary.running') !== null", 20_000);
    await value(socket, "document.querySelector('.timeline-run-summary').click()");
    await waitForExpression(socket, "document.querySelector('.timeline-run-summary[aria-expanded=false]') !== null");
    await value(socket, "document.querySelector('.timeline-run-summary').click()");
    await waitForExpression(socket, "document.querySelector('.timeline-run-summary[aria-expanded=true]') !== null");
    assert.equal(await value(socket, "document.querySelector('.jump') === null"), true, "短会话开合后仍跟随最新内容");

    const status = await waitForStatus(statusPath, (value) => value.toolCalls === 1);
    assert.equal(status.toolCalls, 1, "受控工具只执行一次");
    await waitForRunTerminal(ready, goalId);
    await waitForExpression(socket, "document.querySelector('.timeline-run-summary.completed') !== null", 20_000);
    await waitForExpression(socket, "document.querySelector('.message.assistant') !== null", 20_000);
    assert.equal(await value(socket, "document.querySelector('.message.assistant') !== null && document.querySelector('.timeline-run-summary.completed') !== null"), true,
      "the final response and terminal state are available in the Activity view");
    await value(socket, "document.querySelectorAll('.timeline-stage-heading[aria-expanded=false]').forEach(button => button.click())");
    await waitForExpression(socket, "document.querySelectorAll('.timeline-activity').length >= 1", 20_000);

    // 交错顺序：用户消息 → 工具活动组 → 正式答复，按真实来源排列。
    const order = await value(socket, "[...document.querySelectorAll('[data-item-id]')].map(node => node.getAttribute('data-item-id'))");
    const intentIndex = order.findIndex((itemId) => itemId.startsWith("message:"));
    const activityIndex = order.findIndex((itemId) => itemId.startsWith("activity:"));
    const answerIndex = order.findIndex((itemId, index) => index > activityIndex && itemId.startsWith("message:"));
    assert.ok(intentIndex >= 0, JSON.stringify(order));
    assert.ok(activityIndex > intentIndex, JSON.stringify(order));
    assert.ok(answerIndex > activityIndex, JSON.stringify(order));

    // 活动组呈现真实工具状态，并可展开查看成员详情与 Trajectory 定位入口。
    const groupText = await value(socket, "document.querySelector('.timeline-activity')?.innerText ?? ''");
    assert.match(groupText, /browser_fixture_write/);
    assert.match(groupText, /Completed/);
    await cdp(socket, "Runtime.evaluate", {
      expression: "document.querySelector('.timeline-activity-heading').click()",
      returnByValue: true,
    });
    await waitForExpression(socket, "document.querySelector('.timeline-activity-members') !== null");
    const memberText = await value(socket, "document.querySelector('.timeline-activity-members')?.innerText ?? ''");
    assert.match(memberText, /browser_fixture_write/);
    assert.match(memberText, /Stored the controlled workspace value\./);
    assert.equal(await value(socket, "document.querySelectorAll('.timeline-activity-trajectory').length >= 1"), true);

    // 刷新重建后顺序与身份保持一致。
    const beforeReload = await value(socket, "[...document.querySelectorAll('[data-item-id]')].map(node => node.getAttribute('data-item-id'))");
    await navigate(socket, ready.launchUrl);
    await waitForExpression(socket, "document.querySelector('.goal-card') !== null", 20_000);
    await cdp(socket, "Runtime.evaluate", { expression: "document.querySelector('.goal-card').click()", returnByValue: true });
    await waitForExpression(socket, "document.querySelector('.timeline-stage-heading') !== null", 20_000);
    await value(socket, "document.querySelectorAll('.timeline-stage-heading[aria-expanded=false]').forEach(button => button.click())");
    await waitForExpression(socket, "document.querySelectorAll('.timeline-activity').length >= 1", 20_000);
    const afterReload = await value(socket, "[...document.querySelectorAll('[data-item-id]')].map(node => node.getAttribute('data-item-id'))");
    assert.deepEqual(afterReload, beforeReload, "刷新重建后来源身份与次序不变");

    // 窄屏、200% 文本放大与 reduced-motion：正文可达且不产生横向溢出。
    await cdp(socket, "Emulation.setDeviceMetricsOverride", { width: 320, height: 900, deviceScaleFactor: 1, mobile: true });
    await cdp(socket, "Page.setFontSizes", { fontSizes: { standard: 32, fixed: 32, minimum: 32 } });
    await cdp(socket, "Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await waitForExpression(socket, "document.querySelector('[data-testid=\"session-timeline\"]') !== null");
    const narrow = await value(socket, "({ overflow: document.documentElement.scrollWidth - window.innerWidth, timeline: document.querySelector('[data-testid=\"session-timeline\"]').getBoundingClientRect().width, viewport: window.innerWidth, controls: document.querySelectorAll('.composer button, .composer textarea').length })");
    assert.ok(narrow.overflow <= 1, JSON.stringify(narrow));
    assert.ok(narrow.timeline <= narrow.viewport + 1, JSON.stringify(narrow));
    assert.equal(narrow.controls, 0, JSON.stringify(narrow));
    assert.equal(await value(socket, "document.querySelector('textarea[aria-label=\"Goal intent\"]') === null"), true,
      "an existing Goal has no ordinary follow-up input on narrow screens");
    const activityHeading = await value(socket, "(() => { const heading = document.querySelector('.timeline-activity-heading'); const counts = heading.querySelector('.timeline-activity-counts').getBoundingClientRect(); return { heading: heading.getBoundingClientRect().toJSON(), counts: counts.toJSON() }; })()");
    assert.ok(activityHeading.counts.top >= activityHeading.heading.top && activityHeading.counts.bottom <= activityHeading.heading.bottom + 1, JSON.stringify(activityHeading));

    // 页面不得为模型内容发起图片或远程嵌入请求。
    const remoteRequests = [...socket.requests.values()].filter((request) => !request.path.startsWith("/api/"));
    assert.deepEqual(remoteRequests.map((request) => request.path), [], "页面不加载模型提供的图片或嵌入");
  } finally {
    if (socket !== undefined) socket.close();
    if (chrome !== undefined) {
      chrome.kill("SIGTERM");
      await Promise.race([once(chrome, "close"), delay(3000).then(() => chrome.kill("SIGKILL"))]);
    }
    if (service !== undefined) {
      service.child.kill("SIGTERM");
      await Promise.race([once(service.child, "close"), delay(3000).then(() => service.child.kill("SIGKILL"))]);
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function startService({ workspace, data, home, statusPath }) {
  const child = spawn(process.execPath, ["--import", "tsx/esm", serviceEntry], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      LAZYGOAL_E2E_WORKSPACE: workspace,
      LAZYGOAL_E2E_DATA: data,
      LAZYGOAL_E2E_HOME: home,
      LAZYGOAL_E2E_STATUS: statusPath,
      LAZYGOAL_E2E_RUN_COUNTER: "0",
      LAZYGOAL_E2E_MODEL_OFFSET: "0",
      LAZYGOAL_E2E_TOOL_POLICY: "allow",
      LAZYGOAL_E2E_DELAY_MODEL: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const match = output.match(/LG_TEST_READY:(\{[^\n]+\})/);
    if (match) {
      const parsed = JSON.parse(match[1]);
      return {
        child,
        ready: {
          origin: parsed.origin,
          launchUrl: parsed.launchUrl,
          token: new URL(parsed.launchUrl).hash.slice(1),
        },
      };
    }
    if (child.exitCode !== null) throw new Error(`test service exited: ${stderr}${output}`);
    await delay(50);
  }
  throw new Error(`test service did not start: ${stderr}${output}`);
}

async function waitForStatus(statusPath, predicate) {
  const deadline = Date.now() + 60_000;
  let value = {};
  while (Date.now() < deadline) {
    try {
      value = JSON.parse(await readFile(statusPath, "utf8"));
    } catch {
      value = {};
    }
    if (predicate(value)) return value;
    await delay(100);
  }
  throw new Error(`Timed out waiting for the acceptance status: ${JSON.stringify(value)}`);
}

async function waitForRunTerminal(ready, goalId) {
  const deadline = Date.now() + 60_000;
  let status = "running";
  while (Date.now() < deadline) {
    const session = await api(ready.origin, `/api/goals/${goalId}`, { token: ready.token });
    status = session.body?.goal?.runStatus ?? status;
    if (["completed", "failed", "cancelled"].includes(status)) return status;
    await delay(150);
  }
  throw new Error(`The Goal did not reach a terminal state: ${status}`);
}

async function api(origin, path, { token, method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...headers,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await response.json() };
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
  socket.requests = new Map();
  socket.pending = new Map();
  socket.nextId = 0;
  socket.addEventListener("message", async (event) => {
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    const message = JSON.parse(raw);
    if (message.method === "Network.requestWillBeSent") {
      const { requestId, request } = message.params;
      const pathname = new URL(request.url).pathname;
      if (pathname.startsWith("/api/") || !pathname.startsWith("/")) {
        socket.requests.set(requestId, { path: pathname, method: request.method });
        if (socket.requests.size > 40) socket.requests.delete(socket.requests.keys().next().value);
      }
    }
    if (message.id === undefined) return;
    const pending = socket.pending.get(message.id);
    if (pending === undefined) return;
    socket.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  });
  return socket;
}

async function cdp(socket, method, params = {}) {
  const id = ++socket.nextId;
  return new Promise((resolveResult, reject) => {
    socket.pending.set(id, { resolve: resolveResult, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function navigate(socket, url) {
  // 先离开当前文档，关闭上一个页面的 SSE 连接，避免同源连接配额累积。
  await cdp(socket, "Page.navigate", { url: "about:blank" });
  await cdp(socket, "Page.navigate", { url });
  await waitForExpression(socket, "document.readyState === 'complete'");
}

async function value(socket, expression) {
  const result = await cdp(socket, "Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForExpression(socket, expression, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await value(socket, expression)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for browser expression: ${expression}`);
}
