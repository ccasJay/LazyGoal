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
import { cancelTrigger, resumeTrigger, workTrigger } from "../../../packages/runtime/test/trigger-fixtures";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { receiveAuthorizedTrigger } from "../../../packages/storage/src/trigger-ingress";
import { admitTrigger } from "../src/runtime/trigger-admission";
import { WorkerScheduler } from "../src/runtime/worker-scheduler";

const never = { structuredOutputMode: "prompt_only" as const, async generate() { throw new Error("Waiting Goals must not call a model"); } };
const principal = { role: "user", externalId: "test-actor", mayCreateGoal: true, goalIds: [] } as const;

function cancelEvent(triggerId: string, goalId: string) {
    return cancelTrigger(triggerId, goalId, `run-${goalId}`);
}

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
    if (admission.kind !== "accepted") throw new Error("Expected an accepted Goal admission");
    return admission.goalId;
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
    const triggers = new TriggerStore(join(dataDirectory, "triggers.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    const factory = async (intent: string, reserved: string | undefined) => createWaitingGoal(reserved ?? `goal-${intent}`, intent, workspace);
    const event = (suffix: string) => workTrigger(`trigger-${suffix}`, `goal-${suffix}`);
    const acceptedIds: string[] = [];
    let cleanupGoalId: string | undefined;
    const scheduler = new WorkerScheduler({ owner, triggers, goals, cwd: workspace, dataDirectory, env, permissionAdapter: never });
    try {
        for (const suffix of ["a", "b"]) {
            const result = await admitTrigger(owner, triggers, goals, never, event(suffix), principal, factory);
            acceptedIds.push(acceptedGoalId(result));
        }
        await scheduler.pump();
        await waitFor(() => acceptedIds.every((goalId) => triggers.queueRecord(goalId)?.status === "waiting"));
        const records = acceptedIds.map((goalId) => triggers.queueRecord(goalId)!);
        assert.ok(records[0]!.sequence < records[1]!.sequence);
        assert.deepEqual(records.map((item) => item.triggerId), ["trigger-a", "trigger-b"]);
        assert.deepEqual(records.map((item) => item.status), ["waiting", "waiting"]);
        assert.notEqual(records[0]!.workerId, records[1]!.workerId);
        const pids = await scheduler.processIds();
        assert.equal(new Set(pids.map((item) => item.pid)).size, 2);
        assert.deepEqual(scheduler.assignments().map((item) => item.goalId).sort(), [...acceptedIds].sort());

        const firstCancel = cancelEvent("cancel-trigger-a", acceptedIds[0]!);
        const firstTerminal = await scheduler.handleCancelTrigger(firstCancel, { ...principal, goalIds: [acceptedIds[0]!] });
        assert.deepEqual(firstTerminal, { kind: "terminal", status: "cancelled" });
        assert.equal(triggers.queueRecord(acceptedIds[0]!)?.status, "terminal");
        assert.equal(triggers.routeStatus(firstCancel.id), "routed");
        assert.equal((await goals.restore(acceptedIds[0]!))?.state.run.interruption?.status, "finished");
        const firstReports = triggers.listGoalTriggers(acceptedIds[0]!).filter((trigger) => trigger.type === "response"
            && trigger.payload.action === "progress");
        assert.ok(firstReports.some((trigger) => trigger.type === "response" && trigger.payload.action === "progress"
            && trigger.payload.status === "waiting" && triggers.routeStatus(trigger.id) === "routed"));
        assert.equal(scheduler.assignments().some((item) => item.goalId === acceptedIds[0]), false);

        const third = await admitTrigger(owner, triggers, goals, never, event("c"), principal, factory);
        const thirdGoalId = acceptedGoalId(third);
        await scheduler.pump();
        await waitFor(() => triggers.queueRecord(thirdGoalId)?.status === "waiting");
        assert.equal(triggers.queueRecord(thirdGoalId)?.workerId, records[0]!.workerId);

        for (const [index, goalId] of [acceptedIds[1]!, thirdGoalId].entries()) {
            const suffix = `waiting-${index}`;
            const terminal = await scheduler.handleCancelTrigger(cancelEvent(`cancel-trigger-${suffix}`, goalId),
                { ...principal, goalIds: [goalId] });
            assert.deepEqual(terminal, { kind: "terminal", status: "cancelled" });
        }

        const fourth = await admitTrigger(owner, triggers, goals, never, event("d"), principal, factory);
        const fourthGoalId = acceptedGoalId(fourth);
        cleanupGoalId = fourthGoalId;
        await scheduler.pump();
        await waitFor(() => triggers.queueRecord(fourthGoalId)?.status === "waiting");
        const lostAssignment = triggers.queueRecord(fourthGoalId)!;
        const lostWorkerPid = (await scheduler.processIds()).find((item) => item.workerId === lostAssignment.workerId)?.pid;
        assert.ok(lostWorkerPid !== undefined);
        const unconfirmedTrigger = cancelEvent("cancel-trigger-d", fourthGoalId);
                const unconfirmedCancel = scheduler.handleCancelTrigger(unconfirmedTrigger,
            { ...principal, goalIds: [fourthGoalId] });
        process.kill(lostWorkerPid, "SIGKILL");
        await assert.rejects(unconfirmedCancel);
        assert.equal(triggers.queueRecord(fourthGoalId)?.status, "waiting");
        assert.equal(triggers.routeStatus(unconfirmedTrigger.id), "unrouted");
        assert.equal(scheduler.assignments().find((item) => item.workerId === lostAssignment.workerId)?.goalId, fourthGoalId);
        await waitFor(() => triggers.workerRecovery(fourthGoalId)?.status === "pending");
        const recovery = triggers.workerRecovery(fourthGoalId);
        assert.ok(recovery !== undefined);
        const exitEvidence = triggers.read(recovery.lifecycleTriggerId);
        assert.ok(exitEvidence !== undefined && triggers.routeStatus(exitEvidence.id) === "routed");
        assert.deepEqual(exitEvidence.payload, { action: "exited", outcome: "unexpected" });
        assert.deepEqual(exitEvidence.source, { role: "supervisor" });
        const exitTriggerId = exitEvidence.id;
        const waitingCheckpoint = (await goals.restore(fourthGoalId))!;
        const runningBaseline = createGoal({ ...currentProtocols, id: fourthGoalId, intent: waitingCheckpoint.definition.intent,
            runId: waitingCheckpoint.state.run.id, promptBundleVersion: 1, profile: waitingCheckpoint.definition.profile });
        const runningTransition = transition(runningBaseline.state.run, { kind: "start" });
        assert.equal(runningTransition.ok, true);
        await goals.save({ ...waitingCheckpoint, state: { ...waitingCheckpoint.state, run: runningTransition.state } });
        await assert.rejects(scheduler.handleWorkerRecoveryTrigger(
            resumeTrigger("resume-uncertain-fourth-trigger", fourthGoalId, waitingCheckpoint.state.run.id, exitTriggerId, false),
            { role: "user", externalId: "test-actor", mayCreateGoal: false, goalIds: [fourthGoalId] }));
        await goals.save(waitingCheckpoint);
        const resumed = await scheduler.handleWorkerRecoveryTrigger(
            resumeTrigger("resume-fourth-trigger", fourthGoalId, waitingCheckpoint.state.run.id, exitTriggerId, false),
            { role: "user", externalId: "test-actor", mayCreateGoal: false, goalIds: [fourthGoalId] });
        assert.deepEqual(resumed, { kind: "resumed", goalId: fourthGoalId });
        assert.equal(triggers.workerRecovery(fourthGoalId)?.status, "resumed");
        await scheduler.pump();
        await waitFor(() => triggers.queueRecord(fourthGoalId)?.status === "terminal");
        assert.equal(triggers.routeStatus(unconfirmedTrigger.id), "routed");
        assert.notEqual(triggers.queueRecord(fourthGoalId)?.workerId, lostAssignment.workerId);
        assert.equal((await goals.restore(fourthGoalId))?.state.run.status, "cancelled");
        const recoveredCancellation = await scheduler.handleCancelTrigger(
            cancelEvent("cancel-recovered-fourth-trigger", fourthGoalId),
            { role: "user", externalId: "test-actor", mayCreateGoal: false, goalIds: [fourthGoalId] });
        assert.deepEqual(recoveredCancellation, { kind: "terminal", status: "cancelled" });

        const fifth = await admitTrigger(owner, triggers, goals, never, event("e"), principal, factory);
        const fifthGoalId = acceptedGoalId(fifth);
        await scheduler.pump();
        await waitFor(() => triggers.queueRecord(fifthGoalId)?.status === "waiting");
        assert.notEqual(triggers.queueRecord(fifthGoalId)?.workerId, lostAssignment.workerId);
        const fifthCancellation = await scheduler.handleCancelTrigger(cancelEvent("cancel-fifth-trigger", fifthGoalId),
            { ...principal, goalIds: [fifthGoalId] });
        assert.deepEqual(fifthCancellation, { kind: "terminal", status: "cancelled" });
        await scheduler.closeIdle();
    } finally {
        if (cleanupGoalId !== undefined && triggers.queueRecord(cleanupGoalId)?.status !== "terminal") {
            await scheduler.handleCancelTrigger(cancelEvent("cleanup-recovery-cancel-trigger", cleanupGoalId),
                { role: "user", externalId: "test-actor", mayCreateGoal: false, goalIds: [cleanupGoalId] }).catch(() => undefined);
        }
        await scheduler.closeIdle().catch(() => undefined);
        triggers.close();
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
    const triggers = new TriggerStore(join(dataDirectory, "triggers.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    const scheduler = new WorkerScheduler({ owner, triggers, goals, cwd: workspace, dataDirectory, env, permissionAdapter: never });
    const factory = async (intent: string, reserved: string | undefined) => {
        const goal = createGoal({ ...currentProtocols, id: reserved ?? "goal-active-cancel", runId: "run-active-cancel", intent,
            promptBundleVersion: 1, modelSelection: { provider: "openai-compatible", modelId: "test", contextWindowTokens: 16000,
                maxOutputTokens: 4096, inputEstimator: { kind: "character-v1" } },
            profile: { id: "default", systemPrompt: "Test", instructions: ["Test"], toolIds: [] } });
        return { goal, authorization: { workspace: { mode: "shared" as const, projectRoot: workspace, executionRoot: workspace }, toolIds: [], sandbox: { extraFiles: [], network: "none" as const } } };
    };
    const input = workTrigger("active-cancel-work-trigger", "wait for cancellation");
    try {
        const accepted = await admitTrigger(owner, triggers, goals, never, input, principal, factory);
        const goalId = acceptedGoalId(accepted);
        await scheduler.pump();
        await withTimeout(modelRequest, 5000, `Model request was not received; queue=${JSON.stringify(triggers.queueRecord(goalId))}`);
        assert.equal((await goals.restore(goalId))?.state.run.status, "running");

        const cancel = scheduler.handleCancelTrigger(cancelEvent("active-cancel-trigger", goalId),
            { ...principal, goalIds: [goalId] });
        const cancelResult = await withTimeout(cancel, 5000, "Cancellation did not settle");
        assert.deepEqual(cancelResult, { kind: "terminal", status: "cancelled" });
        await withTimeout(responseClosed, 5000, "Worker did not abort the active model request");
        assert.equal((await goals.restore(goalId))?.state.run.interruption?.status, "finished");
        assert.equal(triggers.queueRecord(goalId)?.status, "terminal");
        assert.equal(triggers.routeStatus("active-cancel-trigger"), "routed");
        assert.equal(triggers.listGoalTriggers(goalId).some((trigger) => trigger.type === "response"
            && trigger.payload.action === "cancelled"), false);
        await scheduler.closeIdle();
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        const pids = await scheduler.processIds().catch(() => []);
        for (const worker of pids) process.kill(worker.pid, "SIGKILL");
        await scheduler.closeIdle().catch(() => undefined);
        triggers.close();
        await owner.close();
        await rm(root, { recursive: true, force: true });
    }
});

test("新 Supervisor 恢复未路由 work 与 cancel Trigger，并接管 Worker", { timeout: 20000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-worker-supervisor-reconnect-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    await Promise.all([mkdir(workspace, { recursive: true }), mkdir(join(home, "agent-profiles"), { recursive: true }), mkdir(dataDirectory, { recursive: true })]);
    await writeFile(join(home, "agent-profiles", "default.json"), JSON.stringify({ schemaVersion: 1, id: "default", name: "Test", description: "Test", systemPrompt: "Test", instructions: ["Test"], toolIds: [] }));
    const originalOwner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
    const originalTriggers = new TriggerStore(join(dataDirectory, "triggers.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    const reconnectTrigger = workTrigger("reconnect-trigger", "reconnect");
    originalTriggers.receive(reconnectTrigger);
    const goalId = "goal-reconnect";
    assert.equal(originalTriggers.routeStatus(reconnectTrigger.id), "unrouted");
    originalTriggers.close();
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
        const beforeExitStore = new TriggerStore(join(dataDirectory, "triggers.db"));
        const cancelAfterRestart = cancelEvent("cancel-after-restart", goalId);
        try {
            assert.equal(beforeExitStore.routeStatus(reconnectTrigger.id), "routed");
            assert.equal(beforeExitStore.queueRecord(goalId)?.triggerId, reconnectTrigger.id);
            await waitFor(() => beforeExitStore.queueRecord(goalId)?.status === "waiting");
            receiveAuthorizedTrigger(beforeExitStore, cancelAfterRestart, { ...principal, mayCreateGoal: false, goalIds: [goalId] });
            assert.equal(beforeExitStore.routeStatus(cancelAfterRestart.id), "unrouted");
        } finally { beforeExitStore.close(); }

        supervisor.kill("SIGKILL");
        await new Promise<void>((resolve) => supervisor.once("exit", () => resolve()));
        const owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
        const triggers = new TriggerStore(join(dataDirectory, "triggers.db"));
        const scheduler = new WorkerScheduler({ owner, triggers, goals, cwd: workspace, dataDirectory,
            env: { LAZYGOAL_HOME: home, LLM_PROVIDER: "openai", LLM_MODEL: "gpt-4o-mini", LLM_API_KEY: "test" }, permissionAdapter: never });
        try {
            await scheduler.pump();
            assert.deepEqual(scheduler.assignments(), [{ workerId: originalWorkerId }]);
            assert.deepEqual(await scheduler.processIds(), [{ workerId: originalWorkerId, pid: originalWorkerPid }]);
            assert.equal(triggers.routeStatus(cancelAfterRestart.id), "routed");
            assert.equal(triggers.queueRecord(goalId)?.status, "terminal");
            assert.equal((await goals.restore(goalId))?.state.run.status, "cancelled");
        } finally {
            await scheduler.closeIdle().catch(() => undefined);
            triggers.close();
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
    let triggers = new TriggerStore(join(dataDirectory, "triggers.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    let scheduler = new WorkerScheduler({ owner, triggers, goals, cwd: workspace, dataDirectory, env,
        permissionAdapter: { structuredOutputMode: "strict", async generate() {
            return { blocks: [{ index: 0, type: "text", format: "json", text: JSON.stringify({ kind: "approve", reason: null }) }] };
        } } });
    let workerPid: number | undefined;
    let oldStoresClosed = false;
    let restartedStores: { readonly owner: SupervisorOwnership; readonly triggers: TriggerStore; readonly scheduler: WorkerScheduler } | undefined;
    try {
        const admitted = await admitTrigger(owner, triggers, goals, never,
            workTrigger("offline-action-trigger", "Execute the delayed offline command"), principal, async (intent, reservedGoalId) => ({
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
        triggers.close();
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
        triggers = new TriggerStore(join(dataDirectory, "triggers.db"));
        scheduler = new WorkerScheduler({ owner, triggers, goals, cwd: workspace, dataDirectory, env,
            permissionAdapter: never });
        restartedStores = { owner, triggers, scheduler };
        await scheduler.pump();
        await waitFor(() => triggers.queueRecord(goalId)?.status === "terminal");
        assert.equal((await goals.restore(goalId))?.state.run.status, "completed");
        assert.equal(triggers.listGoalTriggers(goalId).some((trigger) => trigger.type === "response"
            && trigger.payload.action === "completed"), false);
        await scheduler.closeIdle();
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        if (workerPid !== undefined) {
            try { process.kill(workerPid, "SIGKILL"); } catch { /* Worker already exited. */ }
        }
        if (restartedStores !== undefined) {
            await restartedStores.scheduler.detachAll().catch(() => undefined);
            restartedStores.triggers.close();
            await restartedStores.owner.close().catch(() => undefined);
        } else if (!oldStoresClosed) {
            await scheduler.detachAll().catch(() => undefined);
            triggers.close();
            await owner.close().catch(() => undefined);
        }
        await rm(root, { recursive: true, force: true });
    }
});
