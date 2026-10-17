import assert from "node:assert/strict";
import { test } from "node:test";

import {
    CheckpointGateFrozenError,
    CheckpointGateGoalStore,
    createGoal,
    ManagedResourceRegistry,
    ManagedResourceRegistryClosedError,
    transition,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols } from "./current-fixtures";
import type {
    AgentProfile,
    Goal,
    GoalStore,
    ManagedResource,
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
        completionCriteria: [{ text: "pendingAction 仍可恢复" }],
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
