import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

function permissionTestToolFrames(toolId: string, args: Record<string, unknown>, callId: string): string {
    const chunk = (delta: Record<string, unknown>, finishReason: string | null = null) => ({
        id: "worker-offline-test",
        object: "chat.completion.chunk",
        created: 0,
        model: "offline-test-model",
        choices: [{ index: 0, delta, finish_reason: finishReason }],
    });
    return [
        { tool_calls: [{ index: 0, id: callId, type: "function", function: { name: toolId, arguments: JSON.stringify(args) } }] },
        {},
    ].map((delta, index) => `data: ${JSON.stringify(chunk(delta, index === 1 ? "tool_calls" : null))}\n\n`).join("")
        + "data: [DONE]\n\n";
}

function createWaitingGoal(id: string, intent: string, workspaceRoot: string) {
    const goal = createGoal({ ...currentProtocols, id, intent, runId: `run-${id}`, promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: ["test"], toolIds: [] } });
    const started = transition(goal.state.run, { kind: "start" });
    assert.equal(started.ok, true);
    const waiting = transition(started.state, { kind: "decision", decision: { kind: "wait", reason: "Supervisor input" } });
    assert.equal(waiting.ok, true);
    return {
        goal: { ...goal, state: { ...goal.state, run: waiting.state } },
        authorization: { workspace: { mode: "shared" as const, projectRoot: workspaceRoot, executionRoot: workspaceRoot }, toolIds: [], sandbox: { extraFiles: [], network: "none" as const } },
    };
}

function acceptedGoalId(admission: Awaited<ReturnType<typeof admitTrigger>>): string {
    if (admission.kind !== "settled" || admission.receipt.status !== "settled" || admission.receipt.result.kind !== "accepted") {
        throw new Error("Expected an accepted Trigger delivery");
    }
    return admission.receipt.result.goalId;
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
    let cleanupGoalId: string | undefined;
    const scheduler = new WorkerScheduler({ owner, deliveries, goals, cwd: workspace, dataDirectory, env, permissionAdapter: never });
    try {
        for (const suffix of ["a", "b"]) {
            const result = await admitTrigger(owner, deliveries, goals, never, event(suffix), principal, factory);
            acceptedIds.push(acceptedGoalId(result));
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
        const thirdGoalId = acceptedGoalId(third);
        await scheduler.pump();
        await waitFor(() => deliveries.queueRecord(thirdGoalId)?.status === "waiting");
        assert.equal(deliveries.queueRecord(thirdGoalId)?.workerId, records[0]!.workerId);

        for (const [index, goalId] of [acceptedIds[1]!, thirdGoalId].entries()) {
            const suffix = `waiting-${index}`;
            const terminal = await scheduler.handleCancelTrigger({
                deliveryId: `cancel-${suffix}`,
                goalId,
                trigger: { id: `cancel-trigger-${suffix}`, purpose: "cancel", source: "user", payload: "{}" },
            }, { ...principal, goalIds: [goalId] });
            assert.deepEqual(terminal, { kind: "terminal", status: "cancelled" });
        }

        const fourth = await admitTrigger(owner, deliveries, goals, never, event("d"), principal, factory);
        const fourthGoalId = acceptedGoalId(fourth);
        cleanupGoalId = fourthGoalId;
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
        await waitFor(() => deliveries.workerRecovery(fourthGoalId)?.status === "pending");
        const exitEvidence = deliveries.listWorkerLifecycle(lostAssignment.workerId!, lostAssignment.generation!)
            .find((item) => item.delivery.trigger.purpose === "lifecycle"
                && JSON.parse(item.delivery.trigger.payload).type === "worker_exited");
        assert.ok(exitEvidence?.status === "settled" && exitEvidence.result.kind === "handled");
        const waitingCheckpoint = (await goals.restore(fourthGoalId))!;
        const runningBaseline = createGoal({ ...currentProtocols, id: fourthGoalId, intent: waitingCheckpoint.definition.intent,
            runId: waitingCheckpoint.state.run.id, promptBundleVersion: 1, profile: waitingCheckpoint.definition.profile });
        const runningTransition = transition(runningBaseline.state.run, { kind: "start" });
        assert.equal(runningTransition.ok, true);
        await goals.save({ ...waitingCheckpoint, state: { ...waitingCheckpoint.state, run: runningTransition.state } });
        await assert.rejects(scheduler.handleWorkerRecoveryTrigger({
            deliveryId: "resume-uncertain-fourth-delivery",
            goalId: fourthGoalId,
            trigger: { id: "resume-uncertain-fourth-trigger", purpose: "lifecycle", source: "user", payload: JSON.stringify({
                type: "worker_recovery_decision", decision: "resume_checkpoint", workerId: lostAssignment.workerId,
                generation: lostAssignment.generation, acknowledgeUnknownEffects: false,
            }) },
        }, { role: "user", mayCreateGoal: false, goalIds: [fourthGoalId] }));
        await goals.save(waitingCheckpoint);
        const resumed = await scheduler.handleWorkerRecoveryTrigger({
            deliveryId: "resume-fourth-delivery",
            goalId: fourthGoalId,
            trigger: { id: "resume-fourth-trigger", purpose: "lifecycle", source: "user", payload: JSON.stringify({
                type: "worker_recovery_decision", decision: "resume_checkpoint", workerId: lostAssignment.workerId,
                generation: lostAssignment.generation, acknowledgeUnknownEffects: false,
            }) },
        }, { role: "user", mayCreateGoal: false, goalIds: [fourthGoalId] });
        assert.deepEqual(resumed, { kind: "resumed", goalId: fourthGoalId });
        assert.equal(deliveries.workerRecovery(fourthGoalId)?.status, "resumed");
        await scheduler.pump();
        await waitFor(() => deliveries.queueRecord(fourthGoalId)?.status === "waiting");
        assert.notEqual(deliveries.queueRecord(fourthGoalId)?.workerId, lostAssignment.workerId);
        const recoveredCancellation = await scheduler.handleCancelTrigger({
            deliveryId: "cancel-recovered-fourth-delivery",
            goalId: fourthGoalId,
            trigger: { id: "cancel-recovered-fourth-trigger", purpose: "cancel", source: "user", payload: "{}" },
        }, { role: "user", mayCreateGoal: false, goalIds: [fourthGoalId] });
        assert.deepEqual(recoveredCancellation, { kind: "terminal", status: "cancelled" });

        const fifth = await admitTrigger(owner, deliveries, goals, never, event("e"), principal, factory);
        const fifthGoalId = acceptedGoalId(fifth);
        await scheduler.pump();
        await waitFor(() => deliveries.queueRecord(fifthGoalId)?.status === "waiting");
        assert.notEqual(deliveries.queueRecord(fifthGoalId)?.workerId, lostAssignment.workerId);
        const fifthCancellation = await scheduler.handleCancelTrigger({
            deliveryId: "cancel-fifth-delivery",
            goalId: fifthGoalId,
            trigger: { id: "cancel-fifth-trigger", purpose: "cancel", source: "user", payload: "{}" },
        }, { ...principal, goalIds: [fifthGoalId] });
        assert.deepEqual(fifthCancellation, { kind: "terminal", status: "cancelled" });
        await scheduler.closeIdle();
    } finally {
        if (cleanupGoalId !== undefined && deliveries.queueRecord(cleanupGoalId)?.status !== "terminal") {
            await scheduler.handleCancelTrigger({ deliveryId: "cleanup-recovery-cancel", goalId: cleanupGoalId,
                trigger: { id: "cleanup-recovery-cancel-trigger", purpose: "cancel", source: "user", payload: "{}" } },
            { role: "user", mayCreateGoal: false, goalIds: [cleanupGoalId] }).catch(() => undefined);
        }
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
    const scheduler = new WorkerScheduler({ owner, deliveries, goals, cwd: workspace, dataDirectory, env, permissionAdapter: never });
    const factory = async (intent: string, reserved: string | undefined) => {
        const goal = createGoal({ ...currentProtocols, id: reserved ?? "goal-active-cancel", runId: "run-active-cancel", intent,
            promptBundleVersion: 1, modelSelection: { provider: "openai-compatible", modelId: "test", contextWindowTokens: 16000,
                maxOutputTokens: 4096, inputEstimator: { kind: "character-v1" } },
            profile: { id: "default", systemPrompt: "Test", instructions: ["Test"], toolIds: [] } });
        return { goal, authorization: { workspace: { mode: "shared" as const, projectRoot: workspace, executionRoot: workspace }, toolIds: [], sandbox: { extraFiles: [], network: "none" as const } } };
    };
    const input = { deliveryId: "active-cancel-work", trigger: { id: "active-cancel-work-trigger", purpose: "work", source: "user", payload: '{"intent":"wait for cancellation"}' } };
    try {
        const accepted = await admitTrigger(owner, deliveries, goals, never, input, principal, factory);
        const goalId = acceptedGoalId(accepted);
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

test("Supervisor 强制退出后，新 Supervisor 通过认证通道重新接管仍存活 Worker", { timeout: 20000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-worker-supervisor-reconnect-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    await Promise.all([mkdir(workspace, { recursive: true }), mkdir(join(home, "agent-profiles"), { recursive: true }), mkdir(dataDirectory, { recursive: true })]);
    await writeFile(join(home, "agent-profiles", "default.json"), JSON.stringify({ schemaVersion: 1, id: "default", name: "Test", description: "Test", systemPrompt: "Test", instructions: ["Test"], toolIds: [] }));
    const originalOwner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
    const originalDeliveries = new TriggerDeliveryStore(join(dataDirectory, "deliveries.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    const factory = async (intent: string, reserved: string | undefined) => createWaitingGoal(reserved ?? `goal-${intent}`, intent, workspace);
    const admitted = await admitTrigger(originalOwner, originalDeliveries, goals, never, {
        deliveryId: "reconnect-delivery",
        trigger: { id: "reconnect-trigger", purpose: "work", source: "user", payload: JSON.stringify({ intent: "reconnect" }) },
    }, principal, factory);
    const goalId = acceptedGoalId(admitted);
    originalDeliveries.close();
    await originalOwner.close();

    const supervisor = fork(fileURLToPath(new URL("./worker-scheduler-supervisor-fixture.ts", import.meta.url)), [], {
        cwd: workspace,
        env: { ...process.env, LG_TEST_DATA_DIRECTORY: dataDirectory, LG_TEST_WORKSPACE: workspace, LG_TEST_HOME: home },
        execArgv: process.execArgv,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    let originalWorkerPid: number | undefined;
    let originalWorkerId: string | undefined;
    try {
        const ready = await withTimeout(new Promise<{ readonly workers: readonly { readonly workerId: string; readonly pid: number }[] }>((resolve, reject) => {
            supervisor.on("message", (message: unknown) => {
                if (typeof message === "object" && message !== null && "kind" in message && message.kind === "ready"
                    && "workers" in message && Array.isArray(message.workers)) resolve(message as { readonly workers: readonly { readonly workerId: string; readonly pid: number }[] });
            });
            supervisor.once("error", reject);
            supervisor.once("exit", (code) => reject(new Error(`Supervisor fixture exited before ready (${code})`)));
        }), 10000, "Supervisor fixture did not start");
        assert.equal(ready.workers.length, 1);
        originalWorkerId = ready.workers[0]?.workerId;
        originalWorkerPid = ready.workers[0]?.pid;
        assert.ok(originalWorkerId !== undefined && originalWorkerPid !== undefined);
        const beforeExitStore = new TriggerDeliveryStore(join(dataDirectory, "deliveries.db"));
        try { await waitFor(() => beforeExitStore.queueRecord(goalId)?.status === "waiting"); }
        finally { beforeExitStore.close(); }

        supervisor.kill("SIGKILL");
        await new Promise<void>((resolve) => supervisor.once("exit", () => resolve()));
        const owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
        const deliveries = new TriggerDeliveryStore(join(dataDirectory, "deliveries.db"));
        const scheduler = new WorkerScheduler({ owner, deliveries, goals, cwd: workspace, dataDirectory,
            env: { LAZYGOAL_HOME: home, LLM_PROVIDER: "openai", LLM_MODEL: "gpt-4o-mini", LLM_API_KEY: "test" }, permissionAdapter: never });
        try {
            await scheduler.pump();
            assert.deepEqual(scheduler.assignments(), [{ workerId: originalWorkerId, goalId }]);
            assert.deepEqual(await scheduler.processIds(), [{ workerId: originalWorkerId, pid: originalWorkerPid }]);
            assert.equal(deliveries.queueRecord(goalId)?.status, "waiting");
        } finally {
            await scheduler.closeIdle().catch(() => undefined);
            deliveries.close();
            await owner.close();
        }
    } finally {
        if (supervisor.exitCode === null) supervisor.kill("SIGKILL");
        if (originalWorkerPid !== undefined) {
            try { process.kill(originalWorkerPid, "SIGKILL"); } catch { /* Worker already exited. */ }
        }
        await rm(root, { recursive: true, force: true });
    }
});

test("Supervisor 断开后 Worker 用本地检查点完成已授权工具并在重连时回放", { timeout: 30000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-worker-offline-action-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    await Promise.all([
        mkdir(workspace, { recursive: true }),
        mkdir(join(home, "agent-profiles"), { recursive: true }),
        mkdir(dataDirectory, { recursive: true }),
    ]);
    await writeFile(join(home, "agent-profiles", "default.json"), JSON.stringify({
        schemaVersion: 1,
        id: "default",
        name: "Test",
        description: "Test",
        systemPrompt: "Test",
        instructions: ["Run the requested shell command once."],
        toolIds: ["bash"],
    }));

    let workStage = 0;
    let bashCallCount = 0;
    const modelRequests: { readonly tools: readonly string[]; readonly evidenceSequences: readonly number[] }[] = [];
    const server = createServer((request, response) => {
        void (async () => {
            let bodyText = "";
            request.setEncoding("utf8");
            for await (const chunk of request) bodyText += chunk;
            const body = JSON.parse(bodyText) as Record<string, unknown>;
            const toolNames = Array.isArray(body.tools)
                ? body.tools.flatMap((tool) => typeof tool === "object" && tool !== null && "function" in tool
                    && typeof tool.function === "object" && tool.function !== null && "name" in tool.function
                    && typeof tool.function.name === "string" ? [tool.function.name] : [])
                : [];
            const messages = Array.isArray(body.messages) ? body.messages : [];
            const requestText = JSON.stringify(messages);
            const evidenceMatches = [...requestText.matchAll(/Valid committed evidence sequences: ([0-9, ]+)/g)];
            const evidenceSequences = evidenceMatches.at(-1)?.[1]?.split(",").map((value) => Number(value.trim()))
                .filter(Number.isSafeInteger) ?? [];
            modelRequests.push({ tools: toolNames, evidenceSequences });
            if (toolNames.includes("system_review_completion")) {
                response.writeHead(200, { "content-type": "text/event-stream" });
                response.end(permissionTestToolFrames("system_review_completion", { result: { kind: "accept" } }, "offline-review"));
                return;
            }
            workStage += 1;
            const scripted = workStage === 1
                ? ["system_start_run_stage", { target: "完成离线工具执行", acceptanceCriteria: ["命令完成且只执行一次"] }]
                : workStage === 2
                    ? ["system_find_tools", { query: "bash" }]
                    : workStage === 3
                        ? ["bash", { command: "printf started > offline-started.txt; sleep 2; printf finished > offline-finished.txt" }]
                        : workStage === 4
                        ? ["system_complete_run_stage", { summary: "命令已完成", evidenceSequences }]
                        : workStage >= 5
                            ? ["system_complete_task", { summary: "命令已完成", evidenceSequences }]
                        : undefined;
            if (scripted === undefined) {
                response.writeHead(500);
                response.end("No further test model calls are expected");
                return;
            }
            if (scripted[0] === "bash") bashCallCount += 1;
            response.writeHead(200, { "content-type": "text/event-stream" });
            response.end(permissionTestToolFrames(scripted[0] as string, scripted[1] as Record<string, unknown>, `offline-call-${workStage}`));
        })().catch((error: unknown) => {
            response.writeHead(500);
            response.end(String(error));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address !== null && typeof address !== "string");
    const env = {
        LAZYGOAL_HOME: home,
        LLM_PROVIDER: "openai-compatible",
        LLM_MODEL: "offline-test-model",
        LLM_API_KEY: "test",
        LLM_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
        LLM_CONTEXT_WINDOW_TOKENS: "16000",
        LLM_MAX_OUTPUT_TOKENS: "4096",
        LLM_TOKENIZER_ENCODING: "cl100k_base",
    } as NodeJS.ProcessEnv;
    let owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
    let deliveries = new TriggerDeliveryStore(join(dataDirectory, "deliveries.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    let scheduler = new WorkerScheduler({ owner, deliveries, goals, cwd: workspace, dataDirectory, env,
        permissionAdapter: { structuredOutputMode: "strict", async generate() {
            return { blocks: [{ index: 0, type: "text", format: "json", text: JSON.stringify({ kind: "approve", reason: null }) }] };
        } } });
    let workerPid: number | undefined;
    let oldStoresClosed = false;
    let restartedStores: { readonly owner: SupervisorOwnership; readonly deliveries: TriggerDeliveryStore; readonly scheduler: WorkerScheduler } | undefined;
    try {
        const admitted = await admitTrigger(owner, deliveries, goals, never, {
            deliveryId: "offline-action-work",
            trigger: { id: "offline-action-trigger", purpose: "work", source: "user",
                payload: JSON.stringify({ intent: "Execute the delayed offline command" }) },
        }, principal, async (intent, reservedGoalId) => ({
            goal: createGoal({ ...currentProtocols, id: reservedGoalId ?? "goal-offline-action", runId: "run-offline-action", intent,
                promptBundleVersion: 1,
                modelSelection: { provider: "openai-compatible", modelId: "offline-test-model", contextWindowTokens: 16000,
                    maxOutputTokens: 4096, inputEstimator: { kind: "character-v1" } },
                profile: { id: "default", systemPrompt: "Test", instructions: ["Run the requested shell command once."], toolIds: ["bash"] } }),
            authorization: { workspace: { mode: "shared" as const, projectRoot: workspace, executionRoot: workspace },
                toolIds: ["bash"], sandbox: { extraFiles: [], network: "none" as const } },
        }));
        const goalId = acceptedGoalId(admitted);
        await scheduler.pump();
        await waitFor(() => existsSync(join(workspace, "offline-started.txt")));
        const worker = (await scheduler.processIds())[0];
        assert.ok(worker !== undefined);
        workerPid = worker.pid;

        await scheduler.detachAll();
        deliveries.close();
        await owner.close();
        oldStoresClosed = true;

        const workerDigest = createHash("sha256").update(worker.workerId).digest("hex");
        const journalPath = join(dataDirectory, "worker-processes", `${workerDigest}.journal.json`);
        await waitFor(() => existsSync(join(workspace, "offline-finished.txt")));
        try {
            await waitFor(() => {
            try {
                const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
                    readonly snapshot?: { readonly id?: string; readonly state?: { readonly run?: { readonly status?: string } } };
                    readonly outbox?: readonly { readonly kind?: string; readonly goalId?: string; readonly result?: { readonly kind?: string; readonly status?: string } }[];
                };
                return journal.snapshot?.id === goalId && journal.snapshot.state?.run?.status === "completed"
                    && journal.outbox?.some((item) => item.kind === "advance-result" && item.goalId === goalId
                        && item.result?.kind === "terminal" && item.result.status === "completed") === true;
            } catch {
                return false;
            }
            });
        } catch (error) {
            const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) as {
                readonly snapshot?: { readonly id?: string; readonly state?: { readonly run?: Record<string, unknown> } };
                readonly outbox?: readonly { readonly kind?: string; readonly goalId?: string; readonly result?: unknown }[];
            } : undefined;
            const outbox = journal?.outbox?.map(({ kind, goalId: itemGoalId, result }) => ({ kind, goalId: itemGoalId, result }));
            throw new Error(`${error instanceof Error ? error.message : String(error)}; workStage=${workStage}; modelRequests=${JSON.stringify(modelRequests)}; `
                + `snapshot=${JSON.stringify(journal?.snapshot?.state?.run).slice(0, 3500)}; outbox=${JSON.stringify(outbox)}`);
        }
        assert.equal(await readFile(join(workspace, "offline-finished.txt"), "utf8"), "finished");
        assert.equal(bashCallCount, 1);

        owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
        deliveries = new TriggerDeliveryStore(join(dataDirectory, "deliveries.db"));
        scheduler = new WorkerScheduler({ owner, deliveries, goals, cwd: workspace, dataDirectory, env,
            permissionAdapter: never });
        restartedStores = { owner, deliveries, scheduler };
        await scheduler.pump();
        await waitFor(() => deliveries.queueRecord(goalId)?.status === "terminal");
        assert.equal((await goals.restore(goalId))?.state.run.status, "completed");
        assert.ok(deliveries.listGoalDeliveries(goalId).some((item) => item.delivery.trigger.purpose === "progress"
            && item.status === "settled" && item.result.kind === "handled"
            && JSON.parse(item.delivery.trigger.payload).kind === "terminal"));
        await scheduler.closeIdle();
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        if (workerPid !== undefined) {
            try { process.kill(workerPid, "SIGKILL"); } catch { /* Worker already exited. */ }
        }
        if (restartedStores !== undefined) {
            await restartedStores.scheduler.detachAll().catch(() => undefined);
            restartedStores.deliveries.close();
            await restartedStores.owner.close().catch(() => undefined);
        } else if (!oldStoresClosed) {
            await scheduler.detachAll().catch(() => undefined);
            deliveries.close();
            await owner.close().catch(() => undefined);
        }
        await rm(root, { recursive: true, force: true });
    }
});
