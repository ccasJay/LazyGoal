import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GoalCoordinator,
    allocateImmutableEvent,
    classifyTrajectoryTail,
    createGoal,
    rebuildWorkingMemory,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols } from "./current-fixtures";
import type {
    AgentProfile,
    Goal,
    GoalStore,
    PreparationExecutionInput,
    PreparationExecutor,
    PreparationResult,
    RunnerResult,
    RunRef,
    RunScheduler,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../src/index";

const profile: AgentProfile = {
    id: "memory-coordinator-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: [],
};

class MemoryTrajectoryStore implements TrajectoryStore {
    readonly events: TrajectoryEvent[];

    constructor(initial: readonly TrajectoryEvent[] = []) {
        this.events = [...initial];
    }

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        const event = allocateImmutableEvent(
            draft,
            (this.events.at(-1)?.sequence ?? 0) + 1,
            `memory-coordinator-event-${this.events.length + 1}`,
        );
        this.events.push(event);
        return event;
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence)
        );
    }

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        return classifyTrajectoryTail(
            await this.read(query),
            committedThroughSequence,
        );
    }
}

class FailingSnapshotStore implements GoalStore {
    private readonly delegate = new InMemoryGoalStore();
    private saveCount = 0;

    constructor(private readonly failure: Error) {}

    async save(goal: Goal): Promise<void> {
        this.saveCount += 1;
        if (this.saveCount > 1) throw this.failure;
        await this.delegate.save(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.delegate.restore(goalId);
    }
}

class RecordingPreparationExecutor implements PreparationExecutor {
    readonly inputs: PreparationExecutionInput[] = [];

    constructor(
        private readonly actions: readonly (PreparationResult | ((input: PreparationExecutionInput) => PreparationResult))[],
    ) {}

    async execute(input: PreparationExecutionInput): Promise<PreparationResult> {
        this.inputs.push({
            ...input,
            authorizedTools: structuredClone([...input.authorizedTools]),
            ...(input.workingMemory === undefined
                ? {}
                : { workingMemory: structuredClone(input.workingMemory) }),
        });
        const action = this.actions[this.inputs.length - 1];
        if (action === undefined) throw new Error("unexpected preparation call");
        return typeof action === "function" ? action(input) : action;
    }
}

function structuredGoal(
    id: string,
    runId: string,
    committedThroughSequence = 0,
): Goal {
    const goal = createGoal({
        ...currentProtocols,
        id,
        runId,
        intent: "推进结构化准备流程",
        promptBundleVersion: 1,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile,
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                committedThroughSequence,
            },
        },
    };
}

function observation(
    goalId: string,
    runId: string,
    sequence: number,
): Readonly<TrajectoryEvent> {
    return allocateImmutableEvent({
        goalId,
        runId,
        phase: "executing",
        eventType: "observation_recorded",
        actionId: `action-${sequence}`,
        payload: {
            type: "observation_recorded",
            actionId: `action-${sequence}`,
            observation: {
                kind: "success",
                output: { sequence },
                summary: `observation-${sequence}`,
            },
        },
    }, sequence, `observation-${sequence}`);
}

function scheduler(result?: RunnerResult): RunScheduler {
    return {
        async schedule(): Promise<RunnerResult> {
            if (result !== undefined) return result;
            throw new Error("execution should not be scheduled in this test");
        },
    };
}

function ref(goal: Goal): RunRef {
    return { goalId: goal.id, runId: goal.state.run.id };
}

test("task proposal feedback clears pending interaction and resumes execution", async () => {
    const goalId = "goal-memory-lifecycle";
    const runId = "run-memory-lifecycle";
    const base = structuredGoal(goalId, runId, 1);
    const waiting: Goal = {
        ...base,
        state: {
            ...base.state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...base.state.run,
                status: "waiting",
                pendingInteraction: {
                    kind: "task_approval",
                    proposal: { objective: "旧任务", completionCriteria: [] },
                    approvalRequest: "请批准",
                },
            },
        },
    };
    const store = new InMemoryGoalStore();
    await store.save(waiting);
    const trajectory = new MemoryTrajectoryStore();
    let scheduled = false;
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore: trajectory,
        scheduler: {
            async schedule(runRef): Promise<RunnerResult> {
                scheduled = true;
                const current = await store.restore(runRef.goalId);
                if (current) {
                    await store.save({
                        ...current,
                        state: {
                            ...current.state,
                            run: {
                                ...current.state.run,
                                status: "waiting",
                                pendingInteraction: {
                                    kind: "task_approval",
                                    proposal: { objective: "新任务方案", completionCriteria: [] },
                                    approvalRequest: "新方案批准吗？",
                                },
                            },
                        },
                    });
                }
                return { ok: true, status: "waiting", reason: "task_approval" };
            },
        },
    });

    const result = await coordinator.resume({
        ref: ref(waiting),
        action: { kind: "message", content: "请换一个方案" },
    });
    assert.equal(result.ok, true);
    assert.equal(scheduled, true);
    const persisted = await store.restore(goalId);
    assert.ok(persisted);
    assert.equal(persisted.state.workflow.phase, "executing");
    assert.equal(persisted.state.workflow.task, undefined);
    assert.equal(persisted.state.run.pendingInteraction?.kind, "task_approval");
    assert.equal(persisted.state.messages.at(-1)?.content, "请换一个方案");
});

test("task proposal approval promotes proposal to task and hands to Scheduler", async () => {
    const goalId = "goal-memory-approval";
    const runId = "run-memory-approval";
    const base = structuredGoal(goalId, runId, 1);
    const waiting: Goal = {
        ...base,
        state: {
            ...base.state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...base.state.run,
                status: "waiting",
                pendingInteraction: {
                    kind: "task_approval",
                    proposal: { objective: "获批任务", completionCriteria: [] },
                    approvalRequest: "批准吗",
                },
            },
        },
    };
    const store = new InMemoryGoalStore();
    await store.save(waiting);
    const trajectory = new MemoryTrajectoryStore();
    let scheduledWithGoal: Goal | undefined;
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore: trajectory,
        scheduler: {
            async schedule(runRef): Promise<RunnerResult> {
                scheduledWithGoal = await store.restore(runRef.goalId);
                if (scheduledWithGoal) {
                    await store.save({
                        ...scheduledWithGoal,
                        state: {
                            ...scheduledWithGoal.state,
                            run: {
                                ...scheduledWithGoal.state.run,
                                status: "completed",
                                stepCount: 1,
                                lastStep: {
                                    kind: "decision",
                                    result: {
                                        kind: "complete",
                                        summary: "done",
                                        completionEvidence: [],
                                    },
                                },
                            },
                        },
                    });
                }
                return { ok: true, status: "completed" };
            },
        },
    });

    const result = await coordinator.resume({
        ref: ref(waiting),
        action: { kind: "approve_task" },
    });
    assert.equal(result.ok, true);
    assert.ok(scheduledWithGoal);
    assert.equal(scheduledWithGoal.state.workflow.phase, "executing");
    assert.deepEqual(scheduledWithGoal.state.workflow.task, {
        objective: "获批任务",
        completionCriteria: [],
    });
    assert.equal(scheduledWithGoal.state.run.pendingInteraction, undefined);
});

