import { randomUUID } from "node:crypto";
import { createRuntimeComposition } from "./composition";
import type { GoalStore } from "../../../../packages/runtime/src/goal-store";
import type { Goal } from "../../../../packages/runtime/src/domain";
import { goalSnapshotCodec, type GoalSnapshotV1 } from "../../../../packages/storage/src/index";
import type { WorkerProgress } from "./worker-process";

type ParentMessage =
    | { readonly kind: "probe"; readonly requestId: string }
    | { readonly kind: "advance"; readonly requestId: string; readonly goalId: string; readonly runId: string }
    | { readonly kind: "cancel"; readonly requestId: string; readonly interruptId: string; readonly goalId: string; readonly runId: string }
    | { readonly kind: "store-reply"; readonly requestId: string; readonly ok: true; readonly snapshot?: GoalSnapshotV1 }
    | { readonly kind: "store-reply"; readonly requestId: string; readonly ok: false }
    | { readonly kind: "close" };

type ChildMessage =
    | { readonly kind: "ready"; readonly workerId: string; readonly generation: string; readonly pid: number }
    | { readonly kind: "probe-result"; readonly requestId: string; readonly pid: number; readonly workerId: string; readonly generation: string }
    | { readonly kind: "store-read"; readonly requestId: string; readonly workerId: string; readonly generation: string; readonly goalId: string }
    | { readonly kind: "store-save"; readonly requestId: string; readonly workerId: string; readonly generation: string; readonly goalId: string; readonly snapshot: unknown }
    | { readonly kind: "advance-result"; readonly requestId: string; readonly result: WorkerProgress }
    | { readonly kind: "cancel-result"; readonly requestId: string; readonly result: WorkerProgress }
    | { readonly kind: "closed" };

function requiredEnvironment(name: string): string {
    const value = process.env[name];
    if (value === undefined || value.trim() === "") throw new Error("Worker process configuration is incomplete");
    return value;
}

const workerId = requiredEnvironment("LAZYGOAL_WORKER_ID");
const generation = requiredEnvironment("LAZYGOAL_WORKER_GENERATION");
const dataDirectory = requiredEnvironment("LAZYGOAL_WORKER_DATA_DIRECTORY");
const workspaceIdentityRoot = requiredEnvironment("LAZYGOAL_WORKSPACE_IDENTITY_ROOT");
if (process.send === undefined) throw new Error("Worker process IPC is unavailable");

const pending = new Map<string, (message: ParentMessage) => void>();
let runtime: Awaited<ReturnType<typeof createRuntimeComposition>> | undefined;
let runtimePromise: Promise<Awaited<ReturnType<typeof createRuntimeComposition>>> | undefined;
let assignedGoalId: string | undefined;
let assignedRunId: string | undefined;
let operationActive = false;
let activeAdvance: Promise<void> | undefined;

function ensureRuntime(): Promise<Awaited<ReturnType<typeof createRuntimeComposition>>> {
    if (runtime !== undefined) return Promise.resolve(runtime);
    if (runtimePromise === undefined) {
        const pending = createRuntimeComposition({ cwd: process.cwd(), workspaceIdentityRoot, dataDirectory, goalStore });
        runtimePromise = pending;
        void pending.then((created) => { runtime = created; }, () => {
            if (runtimePromise === pending) runtimePromise = undefined;
        });
    }
    return runtimePromise;
}

const goalStore: GoalStore = {
    async restore(goalId) {
        const response = await requestStore({ kind: "store-read", requestId: randomUUID(), goalId });
        return response === undefined ? undefined : goalSnapshotCodec.decode(response);
    },
    async save(goal: Goal) {
        await requestStore({ kind: "store-save", requestId: randomUUID(), goalId: goal.id, snapshot: goalSnapshotCodec.encode(goal) });
    },
};

function send(message: ChildMessage): void {
    if (process.connected) process.send?.(message);
}

function requestStore(message: { readonly kind: "store-read"; readonly requestId: string; readonly goalId: string }
    | { readonly kind: "store-save"; readonly requestId: string; readonly goalId: string; readonly snapshot: GoalSnapshotV1 }): Promise<GoalSnapshotV1 | undefined> {
    return new Promise((resolve, reject) => {
        pending.set(message.requestId, (response) => {
            if (response.kind !== "store-reply" || !response.ok) {
                reject(new Error("Supervisor rejected Worker Goal state access"));
                return;
            }
            resolve(response.snapshot);
        });
        send({ ...message, workerId, generation });
    });
}

async function handle(message: ParentMessage): Promise<void> {
    if (message.kind === "store-reply") {
        pending.get(message.requestId)?.(message);
        pending.delete(message.requestId);
        return;
    }
    if (message.kind === "probe") {
        send({ kind: "probe-result", requestId: message.requestId, pid: process.pid, workerId, generation });
        return;
    }
    if (message.kind === "advance") {
        if (operationActive || (assignedGoalId !== undefined && assignedGoalId !== message.goalId)) {
            send({ kind: "advance-result", requestId: message.requestId, result: { kind: "rejected", code: "WORKER_BUSY", message: "Worker has an unsettled Goal" } });
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
        send({ kind: "cancel-result", requestId: message.requestId, result: progress });
        return;
    }
    if (message.kind === "close") {
        if (operationActive || assignedGoalId !== undefined) return;
        await runtime?.lifecycle.close();
        send({ kind: "closed" });
        if (process.connected) process.disconnect?.();
    }
}

async function executeAdvance(message: Extract<ParentMessage, { readonly kind: "advance" }>): Promise<void> {
    try {
        const currentRuntime = await ensureRuntime();
        const goal = await currentRuntime.store.restore(message.goalId);
        if (goal === undefined || goal.state.run.id !== message.runId) {
            send({ kind: "advance-result", requestId: message.requestId, result: { kind: "rejected", code: "RUN_ID_MISMATCH", message: "Assigned Run identity changed" } });
            return;
        }
        const result = await currentRuntime.commands.advance({ goalId: message.goalId, runId: message.runId });
        let progress: WorkerProgress;
        if (!result.ok) {
            progress = { kind: "rejected", code: result.error.code, message: "Goal could not advance" };
        } else if (result.kind === "waiting") {
            progress = { kind: "waiting", waitingFor: result.waitingFor };
        } else {
            const status = result.goal.state.run.status;
            if (status !== "completed" && status !== "failed" && status !== "cancelled") {
                progress = { kind: "rejected", code: "NONTERMINAL_RESULT", message: "Runtime returned an unsettled Goal" };
            } else {
                progress = { kind: "terminal", status };
                assignedGoalId = undefined;
                assignedRunId = undefined;
            }
        }
        send({ kind: "advance-result", requestId: message.requestId, result: progress });
    } catch {
        send({ kind: "advance-result", requestId: message.requestId, result: { kind: "rejected", code: "WORKER_EXECUTION_FAILED", message: "Worker execution failed" } });
    } finally {
        operationActive = false;
    }
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
            if (goal.state.run.status === "cancelled" && goal.state.run.interruption?.status === "finished") {
                assignedGoalId = undefined;
                assignedRunId = undefined;
            }
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
        goal = await currentRuntime.store.restore(message.goalId);
        if (goal?.state.run.id === message.runId && goal.state.run.status === "cancelled"
            && goal.state.run.interruption?.status === "finished") {
            assignedGoalId = undefined;
            assignedRunId = undefined;
            return { kind: "terminal", status: "cancelled" };
        }
        if (goal?.state.run.id === message.runId && (goal.state.run.status === "completed" || goal.state.run.status === "failed")) {
            return { kind: "terminal", status: goal.state.run.status };
        }
        return { kind: "rejected", code: "CANCEL_NOT_SETTLED", message: "Worker has not confirmed a safe stop" };
    } catch {
        return { kind: "rejected", code: "CANCEL_FAILED", message: "Worker could not confirm a safe stop" };
    }
}

process.on("message", (value: unknown) => {
    const message = parseParentMessage(value);
    if (message !== undefined) void handle(message);
});
send({ kind: "ready", workerId, generation, pid: process.pid });

function parseParentMessage(value: unknown): ParentMessage | undefined {
    if (typeof value !== "object" || value === null || !("kind" in value) || typeof value.kind !== "string") return undefined;
    if (value.kind === "probe" && "requestId" in value && typeof value.requestId === "string") return value as ParentMessage;
    if (value.kind === "advance" && "requestId" in value && typeof value.requestId === "string"
        && "goalId" in value && typeof value.goalId === "string" && "runId" in value && typeof value.runId === "string") return value as ParentMessage;
    if (value.kind === "cancel" && "requestId" in value && typeof value.requestId === "string"
        && "interruptId" in value && typeof value.interruptId === "string" && "goalId" in value && typeof value.goalId === "string"
        && "runId" in value && typeof value.runId === "string") return value as ParentMessage;
    if (value.kind === "store-reply" && "requestId" in value && typeof value.requestId === "string"
        && "ok" in value && typeof value.ok === "boolean"
        && (value.ok === false || "snapshot" in value)) return value as ParentMessage;
    if (value.kind === "close") return value as ParentMessage;
    return undefined;
}
