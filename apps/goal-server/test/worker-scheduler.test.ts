import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGoal } from "../../../packages/runtime/src/domain";
import { transition } from "../../../packages/runtime/src/transition";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerDeliveryStore } from "../../../packages/storage/src/trigger-delivery-store";
import { admitTrigger } from "../src/runtime/trigger-admission";
import { WorkerScheduler } from "../src/runtime/worker-scheduler";

const never = { structuredOutputMode: "prompt_only" as const, async generate() { throw new Error("Waiting Goals must not call a model"); } };
const principal = { role: "user", mayCreateGoal: true, goalIds: [] } as const;

function createWaitingGoal(id: string, intent: string, workspaceRoot: string) {
    const goal = createGoal({ ...currentProtocols, id, intent, runId: `run-${id}`, promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: ["test"], toolIds: [] } });
    const started = transition(goal.state.run, { kind: "start" });
    assert.equal(started.ok, true);
    const waiting = transition(started.state, { kind: "decision", decision: { kind: "wait", reason: "Supervisor input" } });
    assert.equal(waiting.ok, true);
    return {
        goal: { ...goal, state: { ...goal.state, run: waiting.state } },
        authorization: { workspace: { mode: "shared", projectRoot: workspaceRoot, executionRoot: workspaceRoot }, toolIds: [], sandbox: { extraFiles: [], network: "none" as const } },
    };
}

function createFailedRun(goal: Awaited<ReturnType<typeof createWaitingGoal>>["goal"]) {
    const baseline = createGoal({ ...currentProtocols, id: goal.id, intent: goal.definition.intent, runId: goal.state.run.id,
        promptBundleVersion: 1, profile: goal.definition.profile });
    const started = transition(baseline.state.run, { kind: "start" });
    assert.equal(started.ok, true);
    const failed = transition(started.state, { kind: "decision", decision: { kind: "fail", error: "test terminal" } });
    assert.equal(failed.ok, true);
    return { ...goal, state: { ...goal.state, run: failed.state } };
}

async function waitFor(predicate: () => boolean, timeoutMs = 10000): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() >= end) throw new Error("Timed out waiting for Worker scheduler state");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([promise, new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        })]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

test("FIFO 派发让不同 Goal 并行，等待绑定保留，终态后复用匹配 Worker", async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-worker-scheduler-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    await Promise.all([mkdir(workspace, { recursive: true }), mkdir(join(home, "agent-profiles"), { recursive: true }), mkdir(dataDirectory, { recursive: true })]);
    await writeFile(join(home, "agent-profiles", "default.json"), JSON.stringify({ schemaVersion: 1, id: "default", name: "Test", description: "Test", systemPrompt: "Test", instructions: ["Test"], toolIds: [] }));
    const env = { LAZYGOAL_HOME: home, LLM_PROVIDER: "openai", LLM_MODEL: "gpt-4o-mini", LLM_API_KEY: "test" } as NodeJS.ProcessEnv;
    const owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
    const deliveries = new TriggerDeliveryStore(join(dataDirectory, "deliveries.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    const factory = async (intent: string, reserved: string | undefined) => createWaitingGoal(reserved ?? `goal-${intent}`, intent, workspace);
    const event = (suffix: string) => ({ deliveryId: `delivery-${suffix}`, trigger: { id: `trigger-${suffix}`, purpose: "work", source: "user", payload: JSON.stringify({ intent: `goal-${suffix}` }) } });
    const acceptedIds: string[] = [];
    const scheduler = new WorkerScheduler({ owner, deliveries, goals, cwd: workspace, dataDirectory, env });
    try {
        for (const suffix of ["a", "b"]) {
            const result = await admitTrigger(owner, deliveries, goals, never, event(suffix), principal, factory);
            assert.equal(result.kind, "settled");
            if (result.kind === "settled" && result.receipt.result.kind === "accepted") acceptedIds.push(result.receipt.result.goalId);
        }
        await scheduler.pump();
        await waitFor(() => acceptedIds.every((goalId) => deliveries.queueRecord(goalId)?.status === "waiting"));
        const records = acceptedIds.map((goalId) => deliveries.queueRecord(goalId)!);
        assert.ok(records[0]!.sequence < records[1]!.sequence);
        assert.deepEqual(records.map((item) => item.status), ["waiting", "waiting"]);
        assert.notEqual(records[0]!.workerId, records[1]!.workerId);
        const pids = await scheduler.processIds();
        assert.equal(new Set(pids.map((item) => item.pid)).size, 2);
        assert.deepEqual(scheduler.assignments().map((item) => item.goalId).sort(), [...acceptedIds].sort());

        const cancelDelivery = {
            deliveryId: "cancel-delivery-a",
            goalId: acceptedIds[0]!,
            trigger: { id: "cancel-trigger-a", purpose: "cancel", source: "user", payload: "{}" },
        };
        const firstTerminal = await scheduler.handleCancelTrigger(cancelDelivery, { ...principal, goalIds: [acceptedIds[0]!] });
        assert.deepEqual(firstTerminal, { kind: "terminal", status: "cancelled" });
        assert.equal(deliveries.queueRecord(acceptedIds[0]!)?.status, "terminal");
        assert.equal(deliveries.read(cancelDelivery.deliveryId)?.status, "settled");
        assert.equal((await goals.restore(acceptedIds[0]!))?.state.run.interruption?.status, "finished");
        const firstReports = deliveries.listGoalDeliveries(acceptedIds[0]!).filter((item) => item.delivery.trigger.purpose === "progress");
        assert.ok(firstReports.some((item) => item.status === "settled" && item.result.kind === "handled"
            && JSON.parse(item.delivery.trigger.payload).kind === "terminal"));
        assert.equal(scheduler.assignments().some((item) => item.goalId === acceptedIds[0]), false);

        const third = await admitTrigger(owner, deliveries, goals, never, event("c"), principal, factory);
        assert.equal(third.kind, "settled");
        assert.ok(third.kind === "settled" && third.receipt.result.kind === "accepted");
        const thirdGoalId = third.kind === "settled" && third.receipt.result.kind === "accepted" ? third.receipt.result.goalId : "";
        await scheduler.pump();
        await waitFor(() => deliveries.queueRecord(thirdGoalId)?.status === "waiting");
        assert.equal(deliveries.queueRecord(thirdGoalId)?.workerId, records[0]!.workerId);

        for (const goalId of [acceptedIds[1]!, thirdGoalId]) {
            await goals.save(createFailedRun((await goals.restore(goalId))!));
            assert.equal((await scheduler.advanceGoal(goalId)).kind, "terminal");
        }

        const fourth = await admitTrigger(owner, deliveries, goals, never, event("d"), principal, factory);
        assert.equal(fourth.kind, "settled");
        const fourthGoalId = fourth.kind === "settled" && fourth.receipt.result.kind === "accepted" ? fourth.receipt.result.goalId : "";
        await scheduler.pump();
        await waitFor(() => deliveries.queueRecord(fourthGoalId)?.status === "waiting");
        const lostAssignment = deliveries.queueRecord(fourthGoalId)!;
        const lostWorkerPid = (await scheduler.processIds()).find((item) => item.workerId === lostAssignment.workerId)?.pid;
        assert.ok(lostWorkerPid !== undefined);
        const unconfirmedCancel = scheduler.handleCancelTrigger({
            deliveryId: "cancel-delivery-d",
            goalId: fourthGoalId,
            trigger: { id: "cancel-trigger-d", purpose: "cancel", source: "user", payload: "{}" },
        }, { ...principal, goalIds: [fourthGoalId] });
        process.kill(lostWorkerPid, "SIGKILL");
        await assert.rejects(unconfirmedCancel);
        assert.equal(deliveries.queueRecord(fourthGoalId)?.status, "waiting");
        assert.equal(deliveries.read("cancel-delivery-d")?.status, "pending");
        assert.equal(scheduler.assignments().find((item) => item.workerId === lostAssignment.workerId)?.goalId, fourthGoalId);

        const fifth = await admitTrigger(owner, deliveries, goals, never, event("e"), principal, factory);
        assert.equal(fifth.kind, "settled");
        const fifthGoalId = fifth.kind === "settled" && fifth.receipt.result.kind === "accepted" ? fifth.receipt.result.goalId : "";
        await scheduler.pump();
        await waitFor(() => deliveries.queueRecord(fifthGoalId)?.status === "waiting");
        assert.notEqual(deliveries.queueRecord(fifthGoalId)?.workerId, lostAssignment.workerId);
        await goals.save(createFailedRun((await goals.restore(fifthGoalId))!));
        assert.equal((await scheduler.advanceGoal(fifthGoalId)).kind, "terminal");
        await scheduler.closeIdle();
    } finally {
        await scheduler.closeIdle().catch(() => undefined);
        deliveries.close();
        await owner.close();
        await rm(root, { recursive: true, force: true });
    }
});

test("活动模型调用收到取消后等待 Runtime 结算，再持久化终态报告", { timeout: 15000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-worker-cancel-active-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    await Promise.all([mkdir(workspace, { recursive: true }), mkdir(join(home, "agent-profiles"), { recursive: true }), mkdir(dataDirectory, { recursive: true })]);
    await writeFile(join(home, "agent-profiles", "default.json"), JSON.stringify({ schemaVersion: 1, id: "default", name: "Test", description: "Test", systemPrompt: "Test", instructions: ["Test"], toolIds: [] }));
    let resolveRequest!: () => void;
    let resolveResponseClosed!: () => void;
    const modelRequest = new Promise<void>((resolve) => { resolveRequest = resolve; });
    const responseClosed = new Promise<void>((resolve) => { resolveResponseClosed = resolve; });
    const server = createServer((request, response) => {
        request.on("data", () => undefined);
        request.on("end", () => {
            response.writeHead(200, { "content-type": "application/json" });
            resolveRequest();
        });
        response.on("close", resolveResponseClosed);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address !== null && typeof address !== "string");
    const env = {
        LAZYGOAL_HOME: home,
        LLM_PROVIDER: "openai-compatible",
        LLM_MODEL: "test",
        LLM_API_KEY: "test",
        LLM_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
        LLM_CONTEXT_WINDOW_TOKENS: "16000",
        LLM_MAX_OUTPUT_TOKENS: "4096",
        LLM_TOKENIZER_ENCODING: "cl100k_base",
    } as NodeJS.ProcessEnv;
    const owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
    const deliveries = new TriggerDeliveryStore(join(dataDirectory, "deliveries.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    const scheduler = new WorkerScheduler({ owner, deliveries, goals, cwd: workspace, dataDirectory, env });
    const factory = async (intent: string, reserved: string | undefined) => {
        const goal = createGoal({ ...currentProtocols, id: reserved ?? "goal-active-cancel", runId: "run-active-cancel", intent,
            promptBundleVersion: 1, modelSelection: { provider: "openai-compatible", modelId: "test", contextWindowTokens: 16000,
                maxOutputTokens: 4096, inputEstimator: { kind: "character-v1" } },
            profile: { id: "default", systemPrompt: "Test", instructions: ["Test"], toolIds: [] } });
        return { goal, authorization: { workspace: { mode: "shared", projectRoot: workspace, executionRoot: workspace }, toolIds: [], sandbox: { extraFiles: [], network: "none" as const } } };
    };
    const input = { deliveryId: "active-cancel-work", trigger: { id: "active-cancel-work-trigger", purpose: "work", source: "user", payload: '{"intent":"wait for cancellation"}' } };
    try {
        const accepted = await admitTrigger(owner, deliveries, goals, never, input, principal, factory);
        assert.ok(accepted.kind === "settled" && accepted.receipt.result.kind === "accepted");
        const goalId = accepted.kind === "settled" && accepted.receipt.result.kind === "accepted" ? accepted.receipt.result.goalId : "";
        await scheduler.pump();
        await withTimeout(modelRequest, 5000, `Model request was not received; queue=${JSON.stringify(deliveries.queueRecord(goalId))}`);
        assert.equal((await goals.restore(goalId))?.state.run.status, "running");

        const cancel = scheduler.handleCancelTrigger({ deliveryId: "active-cancel", goalId,
            trigger: { id: "active-cancel-trigger", purpose: "cancel", source: "user", payload: "{}" } }, { ...principal, goalIds: [goalId] });
        const cancelResult = await withTimeout(cancel, 5000, "Cancellation did not settle");
        assert.deepEqual(cancelResult, { kind: "terminal", status: "cancelled" });
        await withTimeout(responseClosed, 5000, "Worker did not abort the active model request");
        assert.equal((await goals.restore(goalId))?.state.run.interruption?.status, "finished");
        assert.equal(deliveries.queueRecord(goalId)?.status, "terminal");
        assert.equal(deliveries.read("active-cancel")?.status, "settled");
        assert.ok(deliveries.listGoalDeliveries(goalId).some((item) => item.status === "settled"
            && item.delivery.trigger.purpose === "progress" && JSON.parse(item.delivery.trigger.payload).status === "cancelled"));
        await scheduler.closeIdle();
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        const pids = await scheduler.processIds().catch(() => []);
        for (const worker of pids) process.kill(worker.pid, "SIGKILL");
        await scheduler.closeIdle().catch(() => undefined);
        deliveries.close();
        await owner.close();
        await rm(root, { recursive: true, force: true });
    }
});
