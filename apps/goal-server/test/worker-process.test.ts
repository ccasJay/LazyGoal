import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { SupervisorWorkerProcess, type SupervisorWorkerProcessOptions } from "../src/runtime/worker-process";
import { createWorkerProcessRegistration } from "../src/runtime/worker-process-registry";
import type { Goal } from "../../../packages/runtime/src/domain";

interface FakeParentCommand {
    readonly kind: string;
    readonly requestId?: string;
}

class FakeWorkerChild extends EventEmitter {
    readonly pid = 42;
    connected = true;
    readonly commands: FakeParentCommand[] = [];

    send(message: unknown, callback?: (error: Error | null) => void): boolean {
        const command = message as FakeParentCommand;
        this.commands.push(command);
        this.emit("command", command);
        callback?.(null);
        if (command.kind === "close") {
            queueMicrotask(() => {
                this.connected = false;
                this.emit("exit", 0, null);
            });
        }
        return true;
    }

    waitForCommand(kind: string, occurrence = 1): Promise<FakeParentCommand> {
        const existing = this.commands.filter((command) => command.kind === kind)[occurrence - 1];
        if (existing !== undefined) return Promise.resolve(existing);
        return new Promise((resolve) => {
            const onCommand = (command: FakeParentCommand): void => {
                if (command.kind !== kind) return;
                const matching = this.commands.filter((sent) => sent.kind === kind);
                if (matching.length < occurrence) return;
                this.off("command", onCommand);
                resolve(matching[occurrence - 1]!);
            };
            this.on("command", onCommand);
        });
    }
}

test("Supervisor 启动独立 Worker 并在同一进程中重复确认身份", async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-worker-process-"));
    const owner = new SupervisorOwnership(join(root, "owner.db"));
    const triggers = new TriggerStore(join(root, "triggers.db"));
    const goals = new JsonFileGoalStore(join(root, "goals"));
    const dataDirectory = join(root, "worker-data");
    const registration = await createWorkerProcessRegistration(dataDirectory, "worker-1", "generation-1", { projectRoot: root, executionRoot: root });
    const worker = await SupervisorWorkerProcess.start({
        workerId: "worker-1",
        generation: "generation-1",
        cwd: root,
        workspaceIdentityRoot: root,
        dataDirectory,
        registration,
        owner,
        triggers,
        goals,
    });
    try {
        const first = await worker.probe();
        const second = await worker.probe();
        assert.notEqual(first, process.pid);
        assert.equal(second, first);
        assert.equal(worker.assignedGoalId, undefined);
    } finally {
        await worker.close();
        triggers.close();
        await owner.close();
        await rm(root, { recursive: true, force: true });
    }
});

test("Worker parent operation slot orders cancellation and deduplicates active requests", { timeout: 5000 }, async () => {
    const goalId = "goal-operation-slot";
    const runId = "run-operation-slot";
    const goal = { id: goalId, state: { run: { id: runId } } } as unknown as Goal;
    const child = new FakeWorkerChild();
    const options = {
        workerId: "worker-operation-slot",
        generation: "generation-operation-slot",
        cwd: "/tmp",
        workspaceIdentityRoot: "/tmp",
        dataDirectory: "/tmp",
        registration: {},
        owner: {},
        triggers: { workerClaim: () => goalId },
        goals: { restore: async () => goal },
    } as unknown as SupervisorWorkerProcessOptions;
    const worker = Reflect.construct(SupervisorWorkerProcess, [options, child as unknown as ChildProcess, false]) as SupervisorWorkerProcess;
    child.emit("message", {
        kind: "ready",
        workerId: options.workerId,
        generation: options.generation,
        pid: child.pid,
    });

    const advance = worker.advance(goalId);
    const advanceCommand = await child.waitForCommand("advance");
    const cancellation = worker.cancel(goalId, runId, "cancel-operation-slot");
    const duplicateCancellation = worker.cancel(goalId, runId, "cancel-operation-slot");
    assert.strictEqual(duplicateCancellation, cancellation);
    await assert.rejects(worker.cancel(goalId, runId, "other-cancel-operation-slot"), /already has a cancellation request/);

    const firstCancelCommand = await child.waitForCommand("cancel");
    assert.ok(advanceCommand.requestId !== undefined);
    assert.ok(firstCancelCommand.requestId !== undefined);
    assert.deepEqual(child.commands.map((command) => command.kind), ["advance", "cancel"]);

    child.emit("message", {
        kind: "advance-result",
        requestId: advanceCommand.requestId,
        goalId,
        result: { kind: "waiting", waitingFor: "blocked" },
    });
    assert.deepEqual(await advance, { kind: "waiting", waitingFor: "blocked" });
    await assert.rejects(worker.advance(goalId), /Worker is unavailable/);
    await assert.rejects(worker.close(), /Worker still owns an unsettled Goal/);

    const rejected = { kind: "rejected", code: "CANCEL_NOT_SETTLED", message: "Cancellation was not settled" } as const;
    child.emit("message", { kind: "cancel-result", requestId: firstCancelCommand.requestId, goalId, result: rejected });
    assert.deepEqual(await cancellation, rejected);
    await new Promise<void>((resolve) => setImmediate(resolve));

    const retry = worker.cancel(goalId, runId, "cancel-operation-slot");
    assert.notStrictEqual(retry, cancellation);
    const retryCommand = await child.waitForCommand("cancel", 2);
    assert.ok(retryCommand.requestId !== undefined);
    child.emit("message", {
        kind: "cancel-result",
        requestId: retryCommand.requestId,
        goalId,
        result: { kind: "terminal", status: "cancelled" },
    });
    assert.deepEqual(await retry, { kind: "terminal", status: "cancelled" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    worker.confirmTerminal(goalId);
    await worker.close();
});
