import assert from "node:assert/strict";
import { test } from "node:test";

import {
    CheckpointGateFrozenError,
    CheckpointGateGoalStore,
    createGoal,
    ManagedResourceRegistry,
    ManagedResourceRegistryClosedError,
    ShutdownCoordinator,
    SHUTDOWN_EXIT_CODE,
    transition,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols } from "./current-fixtures";
import type {
    AgentProfile,
    ExitPort,
    Goal,
    GoalStore,
    ManagedResource,
    ShutdownClock,
} from "../src/index";

const profile: AgentProfile = {
    id: "shutdown-profile",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Preserve the latest checkpoint."],
    toolIds: ["read_file"],
};

function createPendingActionGoal(): Goal {
    const task = {
        objective: "保留关闭前检查点",
        completionCriteria: ["pendingAction 仍可恢复"],
    };
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-shutdown",
        intent: task.objective,
        profile,
        runId: "run-shutdown",
    });
    const executing: Goal = {
        ...initial,
        state: {
            ...initial.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task,
            },
            messages: [],
        },
    };
    const started = transition(executing.state.run, { kind: "start" });

    if (!started.ok) {
        throw new Error(started.error.message);
    }

    const staged = transition(started.state, {
        kind: "stage_action",
        action: {
            actionId: "action-shutdown",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        status: "approved",
    });

    if (!staged.ok) {
        throw new Error(staged.error.message);
    }

    return {
        ...executing,
        state: {
            ...executing.state,
            run: staged.state,
        },
    };
}

class BlockingGoalStore implements GoalStore {
    private readonly delegate = new InMemoryGoalStore();
    private readonly releasePromise: Promise<void>;
    private releaseSave!: () => void;
    private resolveEntered!: () => void;
    readonly entered = new Promise<void>((resolve) => {
        this.resolveEntered = resolve;
    });

    constructor() {
        this.releasePromise = new Promise((resolve) => {
            this.releaseSave = resolve;
        });
    }

    async seed(goal: Goal): Promise<void> {
        await this.delegate.save(goal);
    }

    async save(goal: Goal): Promise<void> {
        this.resolveEntered();
        await this.releasePromise;
        await this.delegate.save(goal);
    }

    restore(goalId: string): Promise<Goal | undefined> {
        return this.delegate.restore(goalId);
    }

    release(): void {
        this.releaseSave();
    }
}

class RecordingResource implements ManagedResource {
    closeCalls = 0;
    forceCloseCalls = 0;

    close(): void {
        this.closeCalls += 1;
    }

    forceClose(): void {
        this.forceCloseCalls += 1;
    }
}

class BlockingResource implements ManagedResource {
    closeCalls = 0;
    forceCloseCalls = 0;
    private readonly releasePromise: Promise<void>;
    private releaseClose!: () => void;
    private resolveStarted!: () => void;
    readonly closeStarted = new Promise<void>((resolve) => {
        this.resolveStarted = resolve;
    });

    constructor() {
        this.releasePromise = new Promise((resolve) => {
            this.releaseClose = resolve;
        });
    }

    async close(): Promise<void> {
        this.closeCalls += 1;
        this.resolveStarted();
        await this.releasePromise;
    }

    forceClose(): void {
        this.forceCloseCalls += 1;
    }

    release(): void {
        this.releaseClose();
    }
}

class RecordingExitPort implements ExitPort {
    readonly codes: number[] = [];

    exit(code: number): void {
        this.codes.push(code);
    }
}

class FakeClock implements ShutdownClock {
    readonly delays: number[] = [];
    private nextHandle = 0;
    private readonly callbacks = new Map<number, () => void>();

    setTimeout(callback: () => void, delayMs: number): number {
        const handle = ++this.nextHandle;
        this.delays.push(delayMs);
        this.callbacks.set(handle, callback);
        return handle;
    }

    clearTimeout(handle: unknown): void {
        if (typeof handle === "number") {
            this.callbacks.delete(handle);
        }
    }

    fire(): void {
        const callbacks = [...this.callbacks.values()];
        this.callbacks.clear();
        for (const callback of callbacks) {
            callback();
        }
    }
}

test("CheckpointGate lets an entered save finish after freeze", async () => {
    const delegate = new BlockingGoalStore();
    const gate = new CheckpointGateGoalStore(delegate);
    const goal = createPendingActionGoal();

    const saving = gate.save(goal);
    await delegate.entered;

    gate.freeze();
    assert.equal(gate.isFrozen, true);
    await assert.rejects(
        gate.save(goal),
        (error: unknown) => error instanceof CheckpointGateFrozenError,
    );

    delegate.release();
    await saving;
    await gate.waitForIdle();
    assert.deepEqual(await gate.restore(goal.id), goal);
});

test("ManagedResourceRegistry closes resources once and rejects late registration", async () => {
    const registry = new ManagedResourceRegistry();
    const resource = new RecordingResource();
    const unregister = registry.register(resource);

    unregister();
    unregister();
    assert.equal(registry.size, 0);

    const activeResource = new RecordingResource();
    registry.register(activeResource);
    await registry.closeAll();

    assert.equal(activeResource.closeCalls, 1);
    assert.equal(activeResource.forceCloseCalls, 0);
    assert.equal(registry.size, 0);
    await assert.rejects(
        async () => registry.register(new RecordingResource()),
        (error: unknown) => error instanceof ManagedResourceRegistryClosedError,
    );
});

test("ShutdownCoordinator preserves pendingAction and exits once after graceful cleanup", async () => {
    const gate = new CheckpointGateGoalStore(new InMemoryGoalStore());
    const goal = createPendingActionGoal();
    await gate.save(goal);

    const registry = new ManagedResourceRegistry();
    const resource = new RecordingResource();
    registry.register(resource);
    const abortController = new AbortController();
    const exitPort = new RecordingExitPort();
    const clock = new FakeClock();
    const coordinator = new ShutdownCoordinator({
        checkpointStore: gate,
        resources: registry,
        abortController,
        exitPort,
        clock,
    });

    const first = coordinator.shutdown();
    const second = coordinator.shutdown();
    assert.strictEqual(first, second);
    await first;

    assert.equal(coordinator.isShuttingDown, true);
    assert.equal(abortController.signal.aborted, true);
    assert.equal(gate.isFrozen, true);
    assert.equal(resource.closeCalls, 1);
    assert.equal(resource.forceCloseCalls, 0);
    assert.deepEqual(exitPort.codes, [SHUTDOWN_EXIT_CODE]);
    assert.deepEqual(await gate.restore(goal.id), goal);
    assert.equal((await gate.restore(goal.id))?.state.run.status, "running");
    assert.equal(clock.delays[0], 2_000);
    await assert.rejects(gate.save(goal), CheckpointGateFrozenError);
});

test("ShutdownCoordinator force-cleans after grace timeout without rolling back a checkpoint", async () => {
    const delegate = new BlockingGoalStore();
    const gate = new CheckpointGateGoalStore(delegate);
    const checkpoint = createPendingActionGoal();
    await delegate.seed(checkpoint);

    const next = {
        ...checkpoint,
        state: {
            ...checkpoint.state,
            run: {
                ...checkpoint.state.run,
            },
        },
    };
    const saving = gate.save(next);
    await delegate.entered;

    const registry = new ManagedResourceRegistry();
    const resource = new BlockingResource();
    registry.register(resource);
    const abortController = new AbortController();
    const exitPort = new RecordingExitPort();
    const clock = new FakeClock();
    const coordinator = new ShutdownCoordinator({
        checkpointStore: gate,
        resources: registry,
        abortController,
        exitPort,
        clock,
    });

    const shutdown = coordinator.shutdown();
    await resource.closeStarted;
    assert.deepEqual(exitPort.codes, []);

    clock.fire();
    await shutdown;

    assert.equal(resource.closeCalls, 1);
    assert.equal(resource.forceCloseCalls, 1);
    assert.equal(registry.size, 0);
    assert.deepEqual(exitPort.codes, [SHUTDOWN_EXIT_CODE]);
    assert.deepEqual(await gate.restore(checkpoint.id), checkpoint);
    assert.equal((await gate.restore(checkpoint.id))?.state.run.status, "running");

    delegate.release();
    await saving;
    assert.deepEqual(await gate.restore(checkpoint.id), next);
    resource.release();
    assert.strictEqual(coordinator.shutdown(), shutdown);
    assert.deepEqual(exitPort.codes, [SHUTDOWN_EXIT_CODE]);
});
