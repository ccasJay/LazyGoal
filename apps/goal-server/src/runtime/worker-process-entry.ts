import { randomUUID } from "node:crypto";
import { createRuntimeComposition } from "./composition";
import type { GoalStore } from "../../../../packages/runtime/src/goal-store";
import type { Goal } from "../../../../packages/runtime/src/domain";
import { goalSnapshotCodec, type GoalSnapshotV1 } from "../../../../packages/storage/src/index";
import type { WorkerProgress } from "./worker-process";

type ParentMessage =
    | { readonly kind: "probe"; readonly requestId: string }
    | { readonly kind: "advance"; readonly requestId: string; readonly goalId: string }
    | { readonly kind: "store-reply"; readonly requestId: string; readonly ok: true; readonly snapshot?: GoalSnapshotV1 }
    | { readonly kind: "store-reply"; readonly requestId: string; readonly ok: false }
    | { readonly kind: "close" };

type ChildMessage =
    | { readonly kind: "ready"; readonly workerId: string; readonly generation: string; readonly pid: number }
    | { readonly kind: "probe-result"; readonly requestId: string; readonly pid: number; readonly workerId: string; readonly generation: string }
    | { readonly kind: "store-read"; readonly requestId: string; readonly workerId: string; readonly generation: string; readonly goalId: string }
    | { readonly kind: "store-save"; readonly requestId: string; readonly workerId: string; readonly generation: string; readonly goalId: string; readonly snapshot: unknown }
    | { readonly kind: "advance-result"; readonly requestId: string; readonly result: WorkerProgress }
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
let assignedGoalId: string | undefined;
let operationActive = false;

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
        operationActive = true;
        try {
            runtime ??= await createRuntimeComposition({ cwd: process.cwd(), workspaceIdentityRoot, dataDirectory, goalStore });
            const goal = await runtime.store.restore(message.goalId);
            if (goal === undefined) throw new Error("Assigned Goal is unavailable");
            const result = await runtime.commands.advance({ goalId: message.goalId, runId: goal.state.run.id });
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
                }
            }
            send({ kind: "advance-result", requestId: message.requestId, result: progress });
        } catch {
            send({ kind: "advance-result", requestId: message.requestId, result: { kind: "rejected", code: "WORKER_EXECUTION_FAILED", message: "Worker execution failed" } });
        } finally {
            operationActive = false;
        }
        return;
    }
    if (message.kind === "close") {
        if (operationActive || assignedGoalId !== undefined) return;
        await runtime?.lifecycle.close();
        send({ kind: "closed" });
        if (process.connected) process.disconnect?.();
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
        && "goalId" in value && typeof value.goalId === "string") return value as ParentMessage;
    if (value.kind === "store-reply" && "requestId" in value && typeof value.requestId === "string"
        && "ok" in value && typeof value.ok === "boolean"
        && (value.ok === false || "snapshot" in value)) return value as ParentMessage;
    if (value.kind === "close") return value as ParentMessage;
    return undefined;
}
