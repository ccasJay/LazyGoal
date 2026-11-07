import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServer, type Server, type Socket } from "node:net";
import { createRuntimeComposition, decodeWorkerInteractionPayload, type WorkerProgress } from "./runtime/index";
import { projectInteractionView } from "../../../packages/runtime/src/interaction-view";
import type { GoalStore } from "../../../packages/runtime/src/goal-store";
import type { Goal } from "../../../packages/runtime/src/domain";
import {
    decodeTriggerActionPermissionReply,
    goalSnapshotCodec,
    type GoalSnapshotV1,
    type TriggerDeliveryFile,
} from "../../../packages/storage/src/index";
import { triggerDeliveryFileBinding } from "../../../packages/storage/src/generated/trigger-delivery-binding";

type ParentMessage =
    | { readonly kind: "probe"; readonly requestId: string }
    | { readonly kind: "advance"; readonly requestId: string; readonly goalId: string; readonly runId: string }
    | { readonly kind: "cancel"; readonly requestId: string; readonly interruptId: string; readonly goalId: string; readonly runId: string }
    | { readonly kind: "permission-response"; readonly requestId: string; readonly delivery: TriggerDeliveryFile }
    | { readonly kind: "interaction-response"; readonly requestId: string; readonly delivery: TriggerDeliveryFile }
    | { readonly kind: "store-reply"; readonly requestId: string; readonly ok: true; readonly snapshot?: GoalSnapshotV1 }
    | { readonly kind: "store-reply"; readonly requestId: string; readonly ok: false }
    | { readonly kind: "replay-offline"; readonly requestId: string }
    | { readonly kind: "worker-ack"; readonly requestId: string }
    | { readonly kind: "detach"; readonly requestId: string }
    | { readonly kind: "close" };

type DurableChildMessage =
    | { readonly kind: "store-read"; readonly requestId: string; readonly workerId: string; readonly generation: string; readonly goalId: string }
    | { readonly kind: "store-save"; readonly requestId: string; readonly workerId: string; readonly generation: string; readonly goalId: string; readonly snapshot: unknown }
    | { readonly kind: "advance-result"; readonly requestId: string; readonly goalId: string; readonly result: WorkerProgress }
    | { readonly kind: "cancel-result"; readonly requestId: string; readonly goalId: string; readonly result: WorkerProgress }
    | { readonly kind: "permission-result"; readonly requestId: string; readonly goalId: string; readonly result: WorkerProgress }
    | { readonly kind: "interaction-result"; readonly requestId: string; readonly goalId: string; readonly result: WorkerProgress };

type ChildMessage =
    | { readonly kind: "ready"; readonly workerId: string; readonly generation: string; readonly pid: number; readonly proof?: string; readonly assignedGoalId?: string; readonly operationActive?: boolean }
    | { readonly kind: "probe-result"; readonly requestId: string; readonly pid: number; readonly workerId: string; readonly generation: string }
    | DurableChildMessage
    | { readonly kind: "replay-complete"; readonly requestId: string }
    | { readonly kind: "closed" }
    | { readonly kind: "detached"; readonly requestId: string };

interface WorkerJournal {
    readonly schemaVersion: 1;
    readonly outbox: DurableChildMessage[];
    snapshot?: GoalSnapshotV1;
}

function requiredEnvironment(name: string): string {
    const value = process.env[name];
    if (value === undefined || value.trim() === "") throw new Error("Worker process configuration is incomplete");
    return value;
}

const workerId = requiredEnvironment("LAZYGOAL_WORKER_ID");
const generation = requiredEnvironment("LAZYGOAL_WORKER_GENERATION");
const dataDirectory = requiredEnvironment("LAZYGOAL_WORKER_DATA_DIRECTORY");
const workspaceIdentityRoot = requiredEnvironment("LAZYGOAL_WORKSPACE_IDENTITY_ROOT");
const socketPath = requiredEnvironment("LAZYGOAL_WORKER_SOCKET_PATH");
const journalPath = requiredEnvironment("LAZYGOAL_WORKER_JOURNAL_PATH");
const secret = requiredEnvironment("LAZYGOAL_WORKER_SECRET");
if (process.send === undefined) throw new Error("Worker process IPC is unavailable");

const pending = new Map<string, { readonly receive: (message: ParentMessage) => void; readonly disconnected: () => void }>();
const replayWaiters = new Map<string, () => void>();
let runtime: Awaited<ReturnType<typeof createRuntimeComposition>> | undefined;
let runtimePromise: Promise<Awaited<ReturnType<typeof createRuntimeComposition>>> | undefined;
let assignedGoalId: string | undefined;
let assignedRunId: string | undefined;
let operationActive = false;
let activeAdvance: Promise<void> | undefined;
let latestProgress: { readonly goalId: string; readonly result: WorkerProgress } | undefined;
let supervisorSocket: Socket | undefined;
let server: Server | undefined;
let journal = loadJournal();

function ensureRuntime(): Promise<Awaited<ReturnType<typeof createRuntimeComposition>>> {
    if (runtime !== undefined) return Promise.resolve(runtime);
    if (runtimePromise === undefined) {
        const pendingRuntime = createRuntimeComposition({ cwd: process.cwd(), workspaceIdentityRoot, dataDirectory, goalStore });
        runtimePromise = pendingRuntime;
        void pendingRuntime.then((created) => { runtime = created; }, () => {
            if (runtimePromise === pendingRuntime) runtimePromise = undefined;
        });
    }
    return runtimePromise;
}

const goalStore: GoalStore = {
    async restore(goalId) {
        const local = journal.snapshot;
        if (local?.id === goalId) return goalSnapshotCodec.decode(local);
        const response = await requestStore({ kind: "store-read", requestId: randomUUID(), goalId });
        return response === undefined ? undefined : goalSnapshotCodec.decode(response);
    },
    async save(goal: Goal) {
        const snapshot = goalSnapshotCodec.encode(goal);
        journal.snapshot = snapshot;
        saveJournal();
        await requestStore({ kind: "store-save", requestId: randomUUID(), goalId: goal.id, snapshot });
    },
};

function send(message: ChildMessage): void {
    if (process.connected) {
        process.send?.(message);
        return;
    }
    if (supervisorSocket !== undefined && !supervisorSocket.destroyed) {
        supervisorSocket.write(`${JSON.stringify(message)}\n`);
    }
}

function requestStore(message: { readonly kind: "store-read"; readonly requestId: string; readonly goalId: string }
    | { readonly kind: "store-save"; readonly requestId: string; readonly goalId: string; readonly snapshot: GoalSnapshotV1 }): Promise<GoalSnapshotV1 | undefined> {
    return new Promise((resolve, reject) => {
        const settle = (response: ParentMessage): void => {
            if (response.kind !== "store-reply" || !response.ok) {
                reject(new Error("Supervisor rejected Worker Goal state access"));
                return;
            }
            if (message.kind === "store-read" && response.snapshot !== undefined) {
                journal.snapshot = response.snapshot;
                saveJournal();
            }
            resolve(response.snapshot);
        };
        const settleDisconnected = (): void => {
            pending.delete(message.requestId);
            if (message.kind === "store-save") {
                resolve(message.snapshot);
                return;
            }
            const local = journal.snapshot;
            if (local?.id === message.goalId) {
                resolve(local);
                return;
            }
            resolve(undefined);
        };
        pending.set(message.requestId, { receive: settle, disconnected: settleDisconnected });
        void persistAndSend({ ...message, workerId, generation }).then(() => {
            if (!isSupervisorConnected()) pending.get(message.requestId)?.disconnected();
        }, (error: Error) => {
            pending.delete(message.requestId);
            reject(error);
        });
    });
}

function isSupervisorConnected(): boolean {
    return process.connected || (supervisorSocket !== undefined && !supervisorSocket.destroyed);
}

function settlePendingStoreRequestsAfterDisconnect(): void {
    for (const request of pending.values()) request.disconnected();
}

async function persistAndSend(message: DurableChildMessage): Promise<void> {
    if (!journal.outbox.some((item) => item.requestId === message.requestId)) journal.outbox.push(message);
    saveJournal();
    send(message);
}

function removeOutbox(requestId: string): void {
    const index = journal.outbox.findIndex((item) => item.requestId === requestId);
    if (index < 0) return;
    const [removed] = journal.outbox.splice(index, 1);
    saveJournal();
    if (removed !== undefined && isTerminalProgressMessage(removed)
        && assignedGoalId === removed.goalId) {
        assignedGoalId = undefined;
        assignedRunId = undefined;
    }
}

async function handle(message: ParentMessage): Promise<void> {
    if (message.kind === "store-reply") {
        if (message.ok) removeOutbox(message.requestId);
        pending.get(message.requestId)?.receive(message);
        pending.delete(message.requestId);
        replayWaiters.get(message.requestId)?.();
        replayWaiters.delete(message.requestId);
        return;
    }
    if (message.kind === "worker-ack") {
        removeOutbox(message.requestId);
        replayWaiters.get(message.requestId)?.();
        replayWaiters.delete(message.requestId);
        return;
    }
    if (message.kind === "replay-offline") {
        const outbox = [...journal.outbox];
        for (const item of outbox) {
            if (!journal.outbox.some((queued) => queued.requestId === item.requestId)) continue;
            await new Promise<void>((resolve) => {
                const timer = setTimeout(() => {
                    replayWaiters.delete(item.requestId);
                    resolve();
                }, 5000);
                replayWaiters.set(item.requestId, () => {
                    clearTimeout(timer);
                    resolve();
                });
                send(item);
            });
        }
        send({ kind: "replay-complete", requestId: message.requestId });
        return;
    }
    if (message.kind === "detach") {
        const current = supervisorSocket;
        if (process.connected) {
            if (process.send !== undefined) {
                process.send({ kind: "detached", requestId: message.requestId }, () => process.disconnect?.());
            }
        } else if (current !== undefined) {
            current.write(`${JSON.stringify({ kind: "detached", requestId: message.requestId })}\n`, () => {
                if (supervisorSocket === current) supervisorSocket = undefined;
                current.end();
            });
        }
        return;
    }
    if (message.kind === "probe") {
        send({ kind: "probe-result", requestId: message.requestId, pid: process.pid, workerId, generation });
        return;
    }
    if (message.kind === "advance") {
        if (operationActive || (assignedGoalId !== undefined && assignedGoalId !== message.goalId)) {
            await persistAndSend({ kind: "advance-result", requestId: message.requestId, goalId: message.goalId,
                result: { kind: "rejected", code: "WORKER_BUSY", message: "Worker has an unsettled Goal" } });
            return;
        }
        assignedGoalId = message.goalId;
        assignedRunId = message.runId;
        operationActive = true;
        const operation = executeAdvance(message);
        activeAdvance = operation;
        await operation;
        if (activeAdvance === operation) activeAdvance = undefined;
        return;
    }
    if (message.kind === "cancel") {
        const progress = await cancelAssignedGoal(message);
        await persistAndSend({ kind: "cancel-result", requestId: message.requestId, goalId: message.goalId, result: progress });
        return;
    }
    if (message.kind === "permission-response") {
        const goalId = message.delivery.goalId;
        if (operationActive || assignedGoalId === undefined || assignedRunId === undefined || goalId === undefined || assignedGoalId !== goalId) {
            await persistAndSend({ kind: "permission-result", requestId: message.requestId, goalId: goalId ?? "",
                result: { kind: "rejected", code: "WORKER_GOAL_MISMATCH", message: "Worker does not own the permission target" } });
            return;
        }
        operationActive = true;
        const operation = executePermissionResponse(message);
        activeAdvance = operation;
        await operation;
        if (activeAdvance === operation) activeAdvance = undefined;
        operationActive = false;
        return;
    }
    if (message.kind === "interaction-response") {
        const goalId = message.delivery.goalId;
        if (operationActive || assignedGoalId === undefined || assignedRunId === undefined
            || goalId === undefined || assignedGoalId !== goalId) {
            await persistAndSend({ kind: "interaction-result", requestId: message.requestId, goalId: goalId ?? "",
                result: { kind: "rejected", code: "WORKER_GOAL_MISMATCH", message: "Worker does not own the interaction target" } });
            return;
        }
        operationActive = true;
        const operation = executeInteractionResponse(message);
        activeAdvance = operation;
        await operation;
        if (activeAdvance === operation) activeAdvance = undefined;
        operationActive = false;
        return;
    }
    if (message.kind === "close") {
        if (operationActive || assignedGoalId !== undefined) return;
        await shutdownWorker();
    }
}

async function executeAdvance(message: Extract<ParentMessage, { readonly kind: "advance" }>): Promise<void> {
    let progress: WorkerProgress;
    try {
        const currentRuntime = await ensureRuntime();
        const goal = await currentRuntime.store.restore(message.goalId);
        if (goal === undefined || goal.state.run.id !== message.runId) {
            progress = { kind: "rejected", code: "RUN_ID_MISMATCH", message: "Assigned Run identity changed" };
        } else {
            const result = await currentRuntime.commands.advance({ goalId: message.goalId, runId: message.runId });
            if (!result.ok) {
                progress = { kind: "rejected", code: result.error.code, message: "Goal could not advance" };
            } else if (result.kind === "waiting") {
                progress = { kind: "waiting", waitingFor: result.waitingFor };
            } else {
                const status = result.goal.state.run.status;
                progress = status === "completed" || status === "failed" || status === "cancelled"
                    ? { kind: "terminal", status }
                    : { kind: "rejected", code: "NONTERMINAL_RESULT", message: "Runtime returned an unsettled Goal" };
            }
        }
    } catch {
        progress = { kind: "rejected", code: "WORKER_EXECUTION_FAILED", message: "Worker execution failed" };
    }
    latestProgress = { goalId: message.goalId, result: progress };
    try {
        await persistAndSend({ kind: "advance-result", requestId: message.requestId, goalId: message.goalId, result: progress });
    } finally {
        operationActive = false;
    }
}

async function executePermissionResponse(message: Extract<ParentMessage, { readonly kind: "permission-response" }>): Promise<void> {
    const goalId = message.delivery.goalId ?? "";
    let progress: WorkerProgress;
    try {
        const parsed = triggerDeliveryFileBinding.read(message.delivery, "reject");
        if (!parsed.ok) throw new Error("Invalid permission delivery");
        const delivery = parsed.data;
        if (delivery.trigger.purpose !== "permission" || delivery.goalId !== assignedGoalId
            || (delivery.trigger.source !== "user" && delivery.trigger.source !== "supervisor")) {
            throw new Error("Permission delivery target is invalid");
        }
        const reply = decodeTriggerActionPermissionReply(delivery.trigger.payload);
        if (reply.workerId !== workerId || reply.generation !== generation || reply.runId !== assignedRunId
            || reply.interactionId !== `action_approval:${reply.actionId}`) {
            throw new Error("Permission reply identity does not match this Worker generation");
        }
        const currentRuntime = await ensureRuntime();
        const goal = await currentRuntime.store.restore(delivery.goalId!);
        if (goal === undefined || goal.state.run.id !== reply.runId || goal.state.run.status !== "waiting"
            || (goal.state.commitRevision ?? 0) !== reply.commitRevision
            || goal.state.run.pendingAction?.status !== "awaiting_approval"
            || goal.state.run.pendingAction.action.actionId !== reply.actionId) {
            throw new Error("Permission reply no longer matches the current Action wait");
        }
        const result = await currentRuntime.commands.resume({
            ref: { goalId: goal.id, runId: reply.runId },
            action: reply.decision === "approve"
                ? { kind: "approve_action", actionId: reply.actionId, scope: "action", approvalInputId: delivery.trigger.id }
                : { kind: "reject_action", actionId: reply.actionId, reason: reply.reason! },
        });
        progress = !result.ok
            ? { kind: "rejected", code: result.error.code, message: "Action permission reply was not accepted" }
            : result.kind === "waiting"
                ? { kind: "waiting", waitingFor: result.waitingFor }
                : result.goal.state.run.status === "completed" || result.goal.state.run.status === "failed" || result.goal.state.run.status === "cancelled"
                    ? { kind: "terminal", status: result.goal.state.run.status }
                    : { kind: "rejected", code: "NONTERMINAL_RESULT", message: "Runtime returned an unsettled Goal" };
    } catch {
        progress = { kind: "rejected", code: "PERMISSION_REPLY_REJECTED", message: "Permission reply was rejected" };
    }
    latestProgress = { goalId, result: progress };
    await persistAndSend({ kind: "permission-result", requestId: message.requestId, goalId, result: progress });
}

async function executeInteractionResponse(message: Extract<ParentMessage, { readonly kind: "interaction-response" }>): Promise<void> {
    const delivery = message.delivery;
    const goalId = delivery.goalId ?? "";
    let progress: WorkerProgress;
    try {
        const payload = decodeWorkerInteractionPayload(delivery);
        if (assignedGoalId !== goalId || assignedRunId !== payload.runId
            || payload.workerId !== workerId || payload.generation !== generation) {
            throw new Error("Interaction Trigger belongs to another Worker generation");
        }
        const currentRuntime = await ensureRuntime();
        const goal = await currentRuntime.store.restore(goalId);
        const interaction = goal === undefined ? undefined : projectInteractionView(goal);
        const localId = goal?.state.run.pendingAction?.action.actionId
            ?? goal?.state.run.pendingInteraction?.requestId;
        if (goal === undefined || goal.state.run.id !== payload.runId || goal.state.run.status !== "waiting"
            || (goal.state.commitRevision ?? 0) !== payload.commitRevision
            || interaction === undefined || interaction.interactionId !== payload.interactionId
            || interaction.runId !== payload.runId || localId !== payload.requestId) {
            throw new Error("Interaction Trigger is stale for the current Goal wait");
        }
        const result = await currentRuntime.commands.resume({
            ref: { goalId, runId: payload.runId },
            action: payload.action,
        });
        progress = !result.ok
            ? { kind: "rejected", code: result.error.code, message: "Goal interaction was not accepted" }
            : result.kind === "waiting"
                ? { kind: "waiting", waitingFor: result.waitingFor }
                : result.goal.state.run.status === "completed" || result.goal.state.run.status === "failed" || result.goal.state.run.status === "cancelled"
                    ? { kind: "terminal", status: result.goal.state.run.status }
                    : { kind: "rejected", code: "NONTERMINAL_RESULT", message: "Runtime returned an unsettled Goal" };
    } catch {
        progress = { kind: "rejected", code: "INTERACTION_REJECTED", message: "Goal interaction was rejected" };
    }
    latestProgress = { goalId, result: progress };
    await persistAndSend({ kind: "interaction-result", requestId: message.requestId, goalId, result: progress });
}

async function cancelAssignedGoal(message: Extract<ParentMessage, { readonly kind: "cancel" }>): Promise<WorkerProgress> {
    if (assignedGoalId !== message.goalId || assignedRunId !== message.runId) {
        return { kind: "rejected", code: "WORKER_GOAL_MISMATCH", message: "Worker does not own the cancellation target" };
    }
    try {
        const currentRuntime = await ensureRuntime();
        let goal = await currentRuntime.store.restore(message.goalId);
        if (goal === undefined || goal.state.run.id !== message.runId) {
            return { kind: "rejected", code: "RUN_ID_MISMATCH", message: "Cancellation target Run changed" };
        }
        while (goal.state.run.status === "created" && activeAdvance !== undefined) {
            await new Promise((resolve) => setTimeout(resolve, 5));
            goal = await currentRuntime.store.restore(message.goalId);
            if (goal === undefined || goal.state.run.id !== message.runId) {
                return { kind: "rejected", code: "RUN_ID_MISMATCH", message: "Cancellation target Run changed" };
            }
        }
        if (goal.state.run.status === "completed" || goal.state.run.status === "failed" || goal.state.run.status === "cancelled") {
            return { kind: "terminal", status: goal.state.run.status };
        }
        const interrupted = await currentRuntime.commands.interrupt({ goalId: message.goalId, runId: message.runId }, message.interruptId);
        if (!interrupted.ok) {
            goal = await currentRuntime.store.restore(message.goalId);
            if (goal?.state.run.id === message.runId && (goal.state.run.status === "completed" || goal.state.run.status === "failed" || goal.state.run.status === "cancelled")) {
                return { kind: "terminal", status: goal.state.run.status };
            }
            return { kind: "rejected", code: interrupted.error, message: "Goal interruption was not accepted" };
        }
        const advance = activeAdvance;
        if (advance !== undefined) await advance;
        if (latestProgress?.goalId === message.goalId && latestProgress.result.kind === "terminal") return latestProgress.result;
        goal = await currentRuntime.store.restore(message.goalId);
        if (goal?.state.run.id === message.runId && goal.state.run.status === "cancelled"
            && goal.state.run.interruption?.status === "finished") return { kind: "terminal", status: "cancelled" };
        if (goal?.state.run.id === message.runId && (goal.state.run.status === "completed" || goal.state.run.status === "failed")) {
            return { kind: "terminal", status: goal.state.run.status };
        }
        return { kind: "rejected", code: "CANCEL_NOT_SETTLED", message: "Worker has not confirmed a safe stop" };
    } catch {
        return { kind: "rejected", code: "CANCEL_FAILED", message: "Worker could not confirm a safe stop" };
    }
}

function startControlServer(): Promise<void> {
    mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 });
    try { rmSync(socketPath, { force: true }); } catch { /* A stale socket path may not be removable. */ }
    server = createServer((client) => acceptSupervisor(client));
    return new Promise((resolve, reject) => {
        server!.once("error", reject);
        server!.listen(socketPath, () => {
            server!.off("error", reject);
            chmodSync(socketPath, 0o600);
            resolve();
        });
    });
}

function acceptSupervisor(client: Socket): void {
    if (process.connected || supervisorSocket !== undefined) { client.destroy(); return; }
    let buffer = "";
    let authenticated = false;
    client.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        for (;;) {
            const newline = buffer.indexOf("\n");
            if (newline < 0) return;
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            let value: unknown;
            try { value = JSON.parse(line) as unknown; } catch { client.destroy(); return; }
            if (!authenticated) {
                const attach = parseAttachRequest(value);
                if (attach === undefined || attach.workerId !== workerId || attach.generation !== generation
                    || !isProof(attach.proof, hmac(secret, `supervisor:${attach.nonce}`))) {
                    client.destroy();
                    return;
                }
                authenticated = true;
                supervisorSocket = client;
                client.on("close", () => {
                    if (supervisorSocket === client) supervisorSocket = undefined;
                    settlePendingStoreRequestsAfterDisconnect();
                });
                client.write(`${JSON.stringify({ kind: "ready", workerId, generation, pid: process.pid,
                    proof: hmac(secret, `worker:${attach.nonce}`), ...(assignedGoalId === undefined ? {} : { assignedGoalId }), operationActive })}\n`);
                continue;
            }
            const message = parseParentMessage(value);
            if (message !== undefined) void handle(message);
        }
    });
}

function parseAttachRequest(value: unknown): { readonly workerId: string; readonly generation: string; readonly nonce: string; readonly proof: string } | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const item = value as Record<string, unknown>;
    if (item.kind !== "attach" || typeof item.workerId !== "string" || typeof item.generation !== "string"
        || typeof item.nonce !== "string" || typeof item.proof !== "string") return undefined;
    return { workerId: item.workerId, generation: item.generation, nonce: item.nonce, proof: item.proof };
}

function parseParentMessage(value: unknown): ParentMessage | undefined {
    if (typeof value !== "object" || value === null || !("kind" in value) || typeof value.kind !== "string") return undefined;
    if (value.kind === "probe" && "requestId" in value && typeof value.requestId === "string") return value as ParentMessage;
    if (value.kind === "advance" && "requestId" in value && typeof value.requestId === "string"
        && "goalId" in value && typeof value.goalId === "string" && "runId" in value && typeof value.runId === "string") return value as ParentMessage;
    if (value.kind === "cancel" && "requestId" in value && typeof value.requestId === "string"
        && "interruptId" in value && typeof value.interruptId === "string" && "goalId" in value && typeof value.goalId === "string"
        && "runId" in value && typeof value.runId === "string") return value as ParentMessage;
    if (value.kind === "permission-response" && "requestId" in value && typeof value.requestId === "string"
        && "delivery" in value) {
        const delivery = triggerDeliveryFileBinding.read(value.delivery, "reject");
        return delivery.ok ? { kind: "permission-response", requestId: value.requestId, delivery: delivery.data } : undefined;
    }
    if (value.kind === "interaction-response" && "requestId" in value && typeof value.requestId === "string"
        && "delivery" in value) {
        const delivery = triggerDeliveryFileBinding.read(value.delivery, "reject");
        return delivery.ok ? { kind: "interaction-response", requestId: value.requestId, delivery: delivery.data } : undefined;
    }
    if (value.kind === "store-reply" && "requestId" in value && typeof value.requestId === "string"
        && "ok" in value && typeof value.ok === "boolean"
        && (value.ok === false || "snapshot" in value)) return value as ParentMessage;
    if (value.kind === "replay-offline" && "requestId" in value && typeof value.requestId === "string") return value as ParentMessage;
    if (value.kind === "worker-ack" && "requestId" in value && typeof value.requestId === "string") return value as ParentMessage;
    if (value.kind === "detach" && "requestId" in value && typeof value.requestId === "string") return value as ParentMessage;
    if (value.kind === "close") return value as ParentMessage;
    return undefined;
}

function loadJournal(): WorkerJournal {
    try {
        const parsed: unknown = JSON.parse(readFileSync(journalPath, "utf8"));
        if (!isJournal(parsed)) throw new Error("Invalid Worker offline journal");
        return parsed;
    } catch (error) {
        if (isMissing(error)) return { schemaVersion: 1, outbox: [] };
        throw new Error("Worker offline journal could not be restored", { cause: error });
    }
}

function saveJournal(): void {
    mkdirSync(dirname(journalPath), { recursive: true, mode: 0o700 });
    const temporary = `${journalPath}.${randomUUID()}.tmp`;
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
        writeFileSync(descriptor, JSON.stringify(journal));
        fsyncSync(descriptor);
    } finally {
        closeSync(descriptor);
    }
    renameSync(temporary, journalPath);
}

function isJournal(value: unknown): value is WorkerJournal {
    if (typeof value !== "object" || value === null) return false;
    const item = value as Record<string, unknown>;
    if (item.schemaVersion !== 1 || !Array.isArray(item.outbox) || !item.outbox.every(isDurableChildMessage)) return false;
    if (item.snapshot !== undefined) {
        try {
            const goal = goalSnapshotCodec.decode(item.snapshot);
            if (goal.id !== (item.snapshot as Record<string, unknown>).id) return false;
        } catch {
            return false;
        }
    }
    return true;
}

function isDurableChildMessage(value: unknown): value is DurableChildMessage {
    if (typeof value !== "object" || value === null) return false;
    const item = value as Record<string, unknown>;
    if (typeof item.requestId !== "string" || typeof item.kind !== "string") return false;
    if (item.kind === "store-read") return typeof item.workerId === "string" && typeof item.generation === "string" && typeof item.goalId === "string";
    if (item.kind === "store-save") return typeof item.workerId === "string" && typeof item.generation === "string" && typeof item.goalId === "string" && "snapshot" in item;
    if (item.kind === "advance-result" || item.kind === "cancel-result" || item.kind === "permission-result" || item.kind === "interaction-result") {
        return typeof item.goalId === "string" && isWorkerProgress(item.result);
    }
    return false;
}

function isWorkerProgress(value: unknown): value is WorkerProgress {
    if (typeof value !== "object" || value === null || !("kind" in value) || typeof value.kind !== "string") return false;
    if (value.kind === "waiting") return "waitingFor" in value && ["ask_user", "task_approval", "action_approval", "action_recovery", "blocked"].includes(String(value.waitingFor));
    if (value.kind === "terminal") return "status" in value && ["completed", "failed", "cancelled"].includes(String(value.status));
    return value.kind === "rejected" && "code" in value && typeof value.code === "string" && "message" in value && typeof value.message === "string";
}

function isTerminalProgressMessage(message: DurableChildMessage): message is Extract<DurableChildMessage, { readonly result: WorkerProgress }> {
    return message.kind !== "store-read" && message.kind !== "store-save" && message.result.kind === "terminal";
}

async function shutdownWorker(): Promise<void> {
    await runtime?.lifecycle.close();
    send({ kind: "closed" });
    const currentServer = server;
    const currentSocket = supervisorSocket;
    supervisorSocket = undefined;
    currentSocket?.end();
    if (currentServer !== undefined) await new Promise<void>((resolve) => currentServer.close(() => resolve()));
    try { rmSync(socketPath, { force: true }); } catch { /* The socket is already gone. */ }
    process.exit(0);
}

function hmac(key: string, value: string): string {
    return createHmac("sha256", key).update(value).digest("hex");
}

function isProof(actual: string, expected: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(actual)) return false;
    return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function isMissing(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

process.on("disconnect", settlePendingStoreRequestsAfterDisconnect);
process.on("message", (value: unknown) => {
    const message = parseParentMessage(value);
    if (message !== undefined) void handle(message);
});

void startControlServer().then(() => {
    send({ kind: "ready", workerId, generation, pid: process.pid });
}).catch(() => process.exit(1));
