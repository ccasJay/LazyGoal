import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
    CheckpointGateFrozenError,
    CheckpointGateGoalStore,
    createGoal,
    ManagedResourceRegistry,
    RUNTIME_LIFECYCLE_INCOMPLETE_CODE,
    RuntimeLifecycle,
    RuntimeLifecycleIncompleteError,
    RuntimeLifecycleUnavailableError,
    transition,
    type AgentProfile,
    type Goal,
    type GoalStore,
    type LifecycleClock,
    type ManagedResource,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols } from "./current-fixtures";

const profile: AgentProfile = {
    id: "lifecycle-profile",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Preserve the latest checkpoint."],
    toolIds: ["read_file"],
};

function createPendingActionGoal(): Goal {
    const task = {
        objective: "保留关闭前检查点",
        completionCriteria: [{ text: "pendingAction 仍可恢复" }],
    };
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-lifecycle",
        intent: task.objective,
        profile,
        runId: "run-lifecycle",
    });
    const executing: Goal = {
        ...initial,
        state: {
            ...initial.state,
            workflow: {
                phase: "executing",
            },
            run: { ...initial.state.run, mode: "plan", approvedTask: task },
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
            actionId: "action-lifecycle",
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

/** 正常阶段未完成、强制阶段可立即结算的资源。 */
class BlockingGracefulResource implements ManagedResource {
    closeCalls = 0;
    forceCloseCalls = 0;
    private readonly closePromise: Promise<void>;
    private resolveClose!: () => void;
    private resolveStarted!: () => void;
    readonly closeStarted = new Promise<void>((resolve) => {
        this.resolveStarted = resolve;
    });

    constructor() {
        this.closePromise = new Promise((resolve) => {
            this.resolveClose = resolve;
        });
    }

    close(): Promise<void> {
        this.closeCalls += 1;
        this.resolveStarted();
        return this.closePromise;
    }

    forceClose(): void {
        this.forceCloseCalls += 1;
    }

    release(): void {
        this.resolveClose();
    }
}

/** 两个阶段都拒绝关闭的资源。 */
class RejectingResource implements ManagedResource {
    closeCalls = 0;
    forceCloseCalls = 0;

    close(): Promise<void> {
        this.closeCalls += 1;
        return Promise.reject(new Error("graceful close failed"));
    }

    forceClose(): Promise<void> {
        this.forceCloseCalls += 1;
        return Promise.reject(new Error("force close failed"));
    }
}

/** 两个阶段都不响应的资源，可以制造迟到的拒绝或结算。 */
class UnresponsiveResource implements ManagedResource {
    closeCalls = 0;
    forceCloseCalls = 0;
    private rejectClose!: (error: Error) => void;
    private resolveClose!: () => void;
    private rejectForce!: (error: Error) => void;
    private resolveForce!: () => void;
    private resolveStarted!: () => void;
    readonly closeStarted = new Promise<void>((resolve) => {
        this.resolveStarted = resolve;
    });
    private readonly closePromise: Promise<void>;
    private readonly forcePromise: Promise<void>;

    constructor() {
        this.closePromise = new Promise<void>((resolve, reject) => {
            this.resolveClose = resolve;
            this.rejectClose = reject;
        });
        this.forcePromise = new Promise<void>((resolve, reject) => {
            this.resolveForce = resolve;
            this.rejectForce = reject;
        });
    }

    close(): Promise<void> {
        this.closeCalls += 1;
        this.resolveStarted();
        return this.closePromise;
    }

    forceClose(): Promise<void> {
        this.forceCloseCalls += 1;
        return this.forcePromise;
    }

    rejectLate(error: Error): void {
        this.rejectClose(error);
    }

    rejectForceLate(error: Error): void {
        this.rejectForce(error);
    }

    resolveLate(): void {
        this.resolveClose();
        this.resolveForce();
    }
}

class FakeClock implements LifecycleClock {
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
        const callbacks = [...this.callbacks.entries()];
        this.callbacks.clear();
        for (const [, callback] of callbacks) {
            callback();
        }
    }
}

function createLifecycle(options: {
    readonly checkpointStore: CheckpointGateGoalStore;
    readonly resources: ManagedResourceRegistry;
    readonly abortController?: AbortController;
    readonly clock: FakeClock;
    readonly gracePeriodMs?: number;
}): RuntimeLifecycle {
    return new RuntimeLifecycle({
        checkpointStore: options.checkpointStore,
        resources: options.resources,
        abortController: options.abortController ?? new AbortController(),
        clock: options.clock,
        gracePeriodMs: options.gracePeriodMs ?? 2_000,
    });
}

test("close 同步进入 closing、冻结写入并保留已进入边界的保存", async () => {
    const delegate = new BlockingGoalStore();
    const gate = new CheckpointGateGoalStore(delegate);
    const checkpoint = createPendingActionGoal();
    await delegate.seed(checkpoint);

    const registry = new ManagedResourceRegistry();
    const resource = new RecordingResource();
    registry.register(resource);
    const abortController = new AbortController();
    const clock = new FakeClock();
    const lifecycle = createLifecycle({
        checkpointStore: gate,
        resources: registry,
        abortController,
        clock,
    });

    const releaseOperation = lifecycle.beginOperation("advance");
    const next: Goal = {
        ...checkpoint,
        state: { ...checkpoint.state, run: { ...checkpoint.state.run } },
    };
    const saving = gate.save(next);
    await delegate.entered;

    const closing = lifecycle.close();

    assert.equal(lifecycle.state, "closing");
    assert.equal(lifecycle.isOpen, false);
    assert.equal(abortController.signal.aborted, true);
    assert.equal(gate.isFrozen, true);
    assert.throws(
        () => lifecycle.beginOperation("launch"),
        (error: unknown) =>
            error instanceof RuntimeLifecycleUnavailableError
            && error.code === "RUNTIME_LIFECYCLE_UNAVAILABLE"
            && error.state === "closing",
    );
    await assert.rejects(gate.save(next), CheckpointGateFrozenError);

    // 已进入保存边界的写入允许结算，关闭不创建取消终态，也不回滚检查点。
    const beforeRelease = await gate.restore(checkpoint.id);
    assert.deepEqual(beforeRelease, checkpoint);
    assert.equal(beforeRelease?.state.run.status, "running");

    delegate.release();
    releaseOperation();
    await saving;
    await closing;

    assert.equal(lifecycle.state, "closed");
    assert.equal(lifecycle.activeOperationCount, 0);
    assert.equal(resource.closeCalls, 1);
    assert.equal(resource.forceCloseCalls, 0);
    assert.deepEqual(await gate.restore(checkpoint.id), next);
});

test("重复 close 返回同一 Promise，并等待已受理操作结算后才成功", async () => {
    const gate = new CheckpointGateGoalStore(new InMemoryGoalStore());
    const registry = new ManagedResourceRegistry();
    const clock = new FakeClock();
    const lifecycle = createLifecycle({ checkpointStore: gate, resources: registry, clock });

    const releaseOperation = lifecycle.beginOperation("advance");
    const first = lifecycle.close();
    const second = lifecycle.close();
    assert.strictEqual(first, second);
    assert.equal(lifecycle.activeOperationCount, 1);

    let firstSettled = false;
    void first.then(() => {
        firstSettled = true;
    }, () => {
        firstSettled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(firstSettled, false);
    assert.equal(lifecycle.state, "closing");

    releaseOperation();
    await first;
    assert.equal(lifecycle.state, "closed");
    assert.strictEqual(lifecycle.close(), first);
});

test("借用资源与宿主共享控制器不因实例关闭被关闭或中止", async () => {
    const gate = new CheckpointGateGoalStore(new InMemoryGoalStore());
    const registry = new ManagedResourceRegistry();
    const ownedResource = new RecordingResource();
    registry.register(ownedResource);
    const borrowedResource = new RecordingResource();
    const borrowedStore = new InMemoryGoalStore();
    const hostAbortController = new AbortController();
    const instanceAbortController = new AbortController();
    const clock = new FakeClock();
    const lifecycle = createLifecycle({
        checkpointStore: gate,
        resources: registry,
        abortController: instanceAbortController,
        clock,
    });

    await lifecycle.close();

    assert.equal(instanceAbortController.signal.aborted, true);
    assert.equal(hostAbortController.signal.aborted, false);
    assert.equal(ownedResource.closeCalls, 1);
    assert.equal(borrowedResource.closeCalls, 0);

    // 借出的 Store 仍归宿主所有：关闭实例后宿主仍可直接使用。
    const goal = createPendingActionGoal();
    await borrowedStore.save(goal);
    assert.deepEqual(await borrowedStore.restore(goal.id), goal);
});

test("正常阶段超时的资源在强制阶段结算后 close 成功且不保留失败", async () => {
    const gate = new CheckpointGateGoalStore(new InMemoryGoalStore());
    const registry = new ManagedResourceRegistry();
    const resource = new BlockingGracefulResource();
    registry.register(resource);
    const clock = new FakeClock();
    const lifecycle = createLifecycle({ checkpointStore: gate, resources: registry, clock });

    const closing = lifecycle.close();
    await resource.closeStarted;
    assert.equal(resource.forceCloseCalls, 0);
    assert.equal(lifecycle.state, "closing");

    clock.fire();
    await closing;

    assert.equal(resource.closeCalls, 1);
    assert.equal(resource.forceCloseCalls, 1);
    assert.equal(registry.size, 0);
    assert.equal(registry.failures.length, 0);
    assert.equal(lifecycle.state, "closed");
    assert.deepEqual(clock.delays, [2_000, 2_000]);
});

test("资源拒绝关闭时报告类型化错误并保留失败身份，实例不可重新受理", async () => {
    const gate = new CheckpointGateGoalStore(new InMemoryGoalStore());
    const registry = new ManagedResourceRegistry();
    const resource = new RejectingResource();
    registry.register(resource);
    const clock = new FakeClock();
    const lifecycle = createLifecycle({ checkpointStore: gate, resources: registry, clock });

    const closing = lifecycle.close();
    await assert.rejects(closing, (error: unknown) => {
        assert.ok(error instanceof RuntimeLifecycleIncompleteError);
        assert.equal(error.code, RUNTIME_LIFECYCLE_INCOMPLETE_CODE);
        const messages = error.reasons.map((reason) => reason.message);
        assert.ok(error.reasons.every((reason) => reason.category === "resources"));
        assert.ok(messages.some((message) => message.includes("graceful close failed")));
        assert.ok(messages.some((message) => message.includes("force close failed")));
        return true;
    });

    assert.equal(resource.closeCalls, 1);
    assert.equal(resource.forceCloseCalls, 1);
    assert.equal(lifecycle.state, "closing");
    assert.equal(registry.pendingResources.length, 1);
    assert.deepEqual(
        registry.failures.map((failure) => failure.phase),
        ["graceful", "force"],
    );
    assert.strictEqual(registry.failures[0]?.resource, resource);

    assert.strictEqual(lifecycle.close(), closing);
    await assert.rejects(lifecycle.close(), RuntimeLifecycleIncompleteError);
    assert.throws(
        () => lifecycle.beginOperation("resume"),
        (error: unknown) =>
            error instanceof RuntimeLifecycleUnavailableError && error.state === "closing",
    );
});

test("不响应资源在两个期限内保持有界，迟到拒绝被记录而不产生未处理拒绝", async () => {
    const gate = new CheckpointGateGoalStore(new InMemoryGoalStore());
    const registry = new ManagedResourceRegistry();
    const resource = new UnresponsiveResource();
    registry.register(resource);
    const clock = new FakeClock();
    const lifecycle = createLifecycle({ checkpointStore: gate, resources: registry, clock });

    const closing = lifecycle.close();
    await resource.closeStarted;
    assert.equal(resource.forceCloseCalls, 0);

    clock.fire();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(resource.forceCloseCalls, 1);

    let settled = false;
    void closing.then(
        () => {
            settled = true;
        },
        () => {
            settled = true;
        },
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);

    clock.fire();
    await assert.rejects(closing, (error: unknown) => {
        assert.ok(error instanceof RuntimeLifecycleIncompleteError);
        assert.deepEqual(
            error.reasons.map((reason) => reason.category),
            ["resources"],
        );
        assert.ok(error.reasons[0]?.message.includes("did not confirm release"));
        return true;
    });

    assert.equal(lifecycle.state, "closing");
    assert.equal(registry.pendingResources.length, 1);
    assert.equal(registry.failures.length, 0);

    // 迟到拒绝在超时之后到达：生命周期已不再等待，但必须被消费并保留原因。
    resource.rejectLate(new Error("late rejection"));
    resource.rejectForceLate(new Error("late force rejection"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(
        registry.failures.map((failure) => failure.phase),
        ["graceful", "force"],
    );
    assert.equal(lifecycle.state, "closing");
    assert.strictEqual(lifecycle.close(), closing);
});

test("写入未在期限内结算时报告 writes 原因且不回滚快照", async () => {
    const delegate = new BlockingGoalStore();
    const gate = new CheckpointGateGoalStore(delegate);
    const checkpoint = createPendingActionGoal();
    await delegate.seed(checkpoint);

    const next: Goal = {
        ...checkpoint,
        state: { ...checkpoint.state, run: { ...checkpoint.state.run } },
    };
    const saving = gate.save(next);
    await delegate.entered;

    const registry = new ManagedResourceRegistry();
    const clock = new FakeClock();
    const lifecycle = createLifecycle({ checkpointStore: gate, resources: registry, clock });

    const closing = lifecycle.close();
    clock.fire();
    await new Promise((resolve) => setImmediate(resolve));
    clock.fire();
    await assert.rejects(closing, (error: unknown) => {
        assert.ok(error instanceof RuntimeLifecycleIncompleteError);
        assert.deepEqual(
            error.reasons.map((reason) => reason.category),
            ["writes"],
        );
        return true;
    });

    assert.equal(lifecycle.state, "closing");
    assert.deepEqual(await gate.restore(checkpoint.id), checkpoint);
    assert.equal((await gate.restore(checkpoint.id))?.state.run.status, "running");

    delegate.release();
    await saving;
});

test("受控子进程在 close 后继续运行并正常结束", async () => {
    const tsxCliPath = fileURLToPath(
        new URL("../../../node_modules/tsx/dist/cli.mjs", import.meta.url),
    );
    const fixturePath = fileURLToPath(
        new URL("./fixtures/runtime-lifecycle-process.ts", import.meta.url),
    );

    const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, [tsxCliPath, fixturePath], {
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("close", (code) => {
            if (code === 0) {
                resolve(stdout);
                return;
            }

            reject(new Error(`lifecycle fixture exited with ${code}: ${stderr}`));
        });
    });

    assert.match(output, /pre-close:open:0/);
    assert.match(output, /post-close:closed:1/);
    assert.match(output, /host-alive/);
});
