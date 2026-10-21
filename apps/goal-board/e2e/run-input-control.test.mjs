import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const serviceEntry = join(import.meta.dirname, "test-service.ts");

test("Run input controls persist Steer and deduplicate continuation retries", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lazygoal-run-input-"));
  const workspace = join(temporaryRoot, "workspace");
  const data = join(temporaryRoot, "data");
  const home = join(temporaryRoot, "home");
  const statusPath = join(temporaryRoot, "status.json");
  await Promise.all([mkdir(workspace), mkdir(data), mkdir(home)]);
  const launchService = (runCounter = 0) => spawn(process.execPath, ["--import", "tsx/esm", serviceEntry], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      LAZYGOAL_E2E_WORKSPACE: workspace,
      LAZYGOAL_E2E_DATA: data,
      LAZYGOAL_E2E_HOME: home,
      LAZYGOAL_E2E_STATUS: statusPath,
      LAZYGOAL_E2E_RUN_COUNTER: String(runCounter),
      LAZYGOAL_E2E_MODEL_OFFSET: "20",
      LAZYGOAL_E2E_DELAY_MODEL: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let child = launchService();
  let output = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const ready = await waitReady(child, () => output, () => stderr);
    const created = await request(ready, "/api/goals", {
      method: "POST",
      body: { goalId: "goal-input-e2e", inputId: "input-e2e-first", intent: "Composer status flow: exercise persisted controls" },
    });
    assert.equal(created.response.status, 202);
    const goalId = created.body.goalId;
    const runId = created.body.runId;
    await waitForSession(ready, goalId, (session) => session.runStatus === "running");

    const steer = await request(ready, `/api/goals/${goalId}/inputs`, {
      method: "POST",
      body: { kind: "steer", inputId: "steer-e2e-1", runId, content: "Keep the same Run" },
    });
    assert.equal(steer.response.status, 202);
    assert.equal(steer.body.receipt.kind, "steer");
    assert.equal(steer.body.receipt.targetRunId, runId);
    assert.equal(steer.body.receipt.inputId, "steer-e2e-1");

    const interrupted = await request(ready, `/api/goals/${goalId}/inputs`, {
      method: "POST",
      body: { kind: "interrupt", inputId: "interrupt-e2e-1", runId },
    });
    assert.equal(interrupted.response.status, 202);
    const cancelled = await waitForSession(ready, goalId, (session) => session.runStatus === "cancelled");
    assert.equal(cancelled.currentRunId, runId);
    const pausedSession = await sessionBody(ready, goalId);
    assert.equal(pausedSession.queue.paused, true);
    assert.equal(pausedSession.queue.pauseReason, "user_interrupt");

    const followUp = { kind: "message", inputId: "queue-e2e-1", content: "Start the queued follow-up" };
    const first = await request(ready, `/api/goals/${goalId}/inputs`, { method: "POST", body: followUp });
    assert.equal(first.response.status, 202);
    assert.equal(first.body.receipt.status, "pending");
    const queued = await waitForSessionBody(ready, goalId, (session) => session.pendingMessages?.length === 1);
    assert.equal(queued.queue.paused, true);
    // 暂停期间新消息只追加到队尾：显式继续才解除暂停。
    const retry = await request(ready, `/api/goals/${goalId}/inputs`, { method: "POST", body: followUp });
    assert.equal(retry.response.status, 200);
    assert.equal(retry.body.existing, true);
    assert.equal(retry.body.receipt.inputId, "queue-e2e-1");
    child.kill("SIGTERM");
    await once(child, "close");
    output = "";
    stderr = "";
    child = launchService(1);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const restarted = await waitReady(child, () => output, () => stderr);
    const restartedRetry = await request(restarted, `/api/goals/${goalId}/inputs`, { method: "POST", body: followUp });
    assert.equal(restartedRetry.response.status, 200);
    assert.equal(restartedRetry.body.receipt.inputId, "queue-e2e-1");
    // 重启后只恢复和展示状态：队列顺序与暂停仍来自持久化真源。
    const restored = await waitForSessionBody(restarted, goalId, (session) => session.pendingMessages?.length === 1);
    assert.equal(restored.queue.paused, true);
    assert.equal(restored.pendingMessages[0].content, "Start the queued follow-up");
    const conflict = await request(restarted, `/api/goals/${goalId}/inputs`, {
      method: "POST",
      body: { ...followUp, content: "Changed after acceptance" },
    });
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.body.error, "INPUT_CONFLICT");
    // 显式继续队列：从原队首启动后继 Run 并解除暂停。
    const continued = await request(restarted, `/api/goals/${goalId}/inputs`, {
      method: "POST",
      body: { kind: "queue_control", inputId: "queue-continue-e2e", action: "continue", queueRevision: restored.queue.revision },
    });
    assert.equal(continued.response.status, 202);
    const resumedRun = await waitForSessionBody(restarted, goalId, (session) => session.currentRunId !== runId && session.queue.paused === false);
    assert.equal((resumedRun.pendingMessages ?? []).length, 0);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([once(child, "close"), delay(3000).then(() => child.kill("SIGKILL"))]);
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function sessionBody(ready, goalId) {
  const session = await request(ready, `/api/goals/${goalId}`);
  assert.equal(session.response.status, 200);
  return session.body.goal;
}

async function waitForSessionBody(ready, goalId, predicate) {
  const end = Date.now() + 20_000;
  let session = await sessionBody(ready, goalId);
  while (Date.now() < end && !predicate(session)) {
    await delay(25);
    session = await sessionBody(ready, goalId);
  }
  assert.equal(predicate(session), true, JSON.stringify(session));
  return session;
}

async function waitReady(child, readOutput, readError) {
  const end = Date.now() + 15_000;
  while (Date.now() < end) {
    const match = readOutput().match(/LG_TEST_READY:(\{[^\n]+\})/);
    if (match) return { ...JSON.parse(match[1]), token: new URL(JSON.parse(match[1]).launchUrl).hash.slice(1) };
    if (child.exitCode !== null) throw new Error(`test service exited: ${readError()}${readOutput()}`);
    await delay(30);
  }
  throw new Error(`test service did not start: ${readError()}${readOutput()}`);
}

async function request(ready, path, { method = "GET", body } = {}) {
  const response = await fetch(`${ready.origin}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${ready.token}`,
      ...(body === undefined ? {} : { origin: ready.origin }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await response.json() };
}

async function waitForSession(ready, goalId, predicate) {
  const end = Date.now() + 15_000;
  while (Date.now() < end) {
    const result = await request(ready, `/api/goals/${goalId}`);
    if (result.response.ok && predicate(result.body.goal)) return result.body.goal;
    await delay(30);
  }
  throw new Error("Goal did not reach the expected Run state");
}
