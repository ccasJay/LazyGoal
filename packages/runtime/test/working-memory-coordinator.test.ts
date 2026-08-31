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
        id,
        runId,
        intent: "推进结构化准备流程",
        promptBundleVersion: 7,
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

test("Coordinator restores Memory once per preparation call and commits an optional Patch atomically", async () => {
    const goal = structuredGoal("goal-memory-preparation", "run-memory-preparation", 1);
    const trajectory = new MemoryTrajectoryStore([observation(goal.id, goal.state.run.id, 1)]);
    const store = new InMemoryGoalStore();
    await store.save(goal);

    const findingPatch = {
        protocolVersion: 1 as const,
        operations: [{
            type: "upsert_fact" as const,
            fact: {
                subject: "workspace",
                predicate: "config_observed",
                value: true,
                stability: "stable" as const,
                evidenceSequences: [1],
            },
        }],
    };
    const executor = new RecordingPreparationExecutor([
        { kind: "context_ready", memoryPatch: findingPatch },
        (input) => {
            assert.equal(input.goal.state.workflow.phase, "planning");
            assert.equal(input.workingMemory?.facts[0]?.predicate, "config_observed");
            return {
                kind: "task_proposal",
                task: { objective: "执行任务", completionCriteria: ["完成"] },
                approvalRequest: "批准吗？",
            };
        },
    ]);
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore: trajectory,
        preparationExecutor: executor,
        scheduler: scheduler(),
    });

    const result = await coordinator.advance(ref(goal));
    assert.equal(result.ok, true);
    assert.equal(result.kind, "waiting");
    assert.equal(executor.inputs.length, 2);
    assert.equal(trajectory.events.filter((event) => event.eventType === "memory_patch_accepted").length, 1);
    const persisted = await store.restore(goal.id);
    assert.deepEqual(persisted?.state.run.memoryRevision, {
        eventId: trajectory.events.find((event) => event.eventType === "memory_patch_accepted")?.eventId,
        sequence: 3,
    });
});

test("Coordinator does not create a placeholder Patch when model returns no Memory change", async () => {
    const goal = structuredGoal("goal-memory-noop", "run-memory-noop");
    const trajectory = new MemoryTrajectoryStore();
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const executor = new RecordingPreparationExecutor([{
        kind: "question",
        question: "需要更多信息",
    }]);
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore: trajectory,
        preparationExecutor: executor,
        scheduler: scheduler(),
    });

    const result = await coordinator.advance(ref(goal));
    assert.equal(result.ok, true);
    assert.equal(trajectory.events.some((event) => event.eventType === "memory_patch_accepted"), false);
    assert.equal((await store.restore(goal.id))?.state.run.memoryRevision, undefined);
});

test("planning feedback commits lifecycle invalidation without promoting the proposal to Memory", async () => {
    const goalId = "goal-memory-lifecycle";
    const runId = "run-memory-lifecycle";
    const patchEvent = allocateImmutableEvent({
        goalId,
        runId,
        phase: "planning",
        eventType: "memory_patch_accepted",
        payload: {
            type: "memory_patch_accepted",
            protocolVersion: 1,
            producers: ["model"],
            operations: [{
                type: "upsert_plan_item",
                planItem: {
                    kind: "plan",
                    id: "plan-old",
                    originPhase: "planning",
                    originSequence: 1,
                    updatedAtSequence: 1,
                    scope: "phase",
                    status: "active",
                    description: "旧方案",
                    dependsOnFactIds: [],
                    dependsOnPlanItemIds: [],
                    completionEvidenceSequences: [],
                },
            }],
        },
    }, 1, "plan-patch");
    const trajectory = new MemoryTrajectoryStore([patchEvent]);
    const base = structuredGoal(goalId, runId, 1);
    const waiting: Goal = {
        ...base,
        state: {
            ...base.state,
            workflow: {
                phase: "planning",
                preparation: {
                    status: "waiting_approval",
                    proposal: { objective: "旧任务", completionCriteria: [] },
                },
            },
            run: {
                ...base.state.run,
                memoryRevision: { eventId: patchEvent.eventId, sequence: 1 },
            },
        },
    };
    const store = new InMemoryGoalStore();
    await store.save(waiting);
    const executor = new RecordingPreparationExecutor([{
        kind: "task_proposal",
        task: { objective: "新任务", completionCriteria: [] },
        approvalRequest: "批准新任务",
    }]);
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore: trajectory,
        preparationExecutor: executor,
        scheduler: scheduler(),
    });

    const result = await coordinator.resume({
        ref: ref(waiting),
        action: { kind: "message", content: "请换一个方案" },
    });
    assert.equal(result.ok, true);
    assert.equal(result.kind, "waiting");
    const lifecycleEvents = trajectory.events.filter((event) => event.eventType === "memory_patch_accepted");
    assert.equal(lifecycleEvents.length, 2);
    const persisted = await store.restore(goalId);
    assert.ok(persisted);
    const restored = await rebuildWorkingMemory(persisted, {
        trajectoryStore: trajectory,
    });
    assert.deepEqual(restored.memory.plan, []);

    const proposal = (await store.restore(goalId))?.state.workflow;
    assert.ok(proposal);
    assert.equal(proposal.phase, "planning");
});

test("planning approval commits lifecycle invalidation before handing the approved task to Scheduler", async () => {
    const goalId = "goal-memory-approval";
    const runId = "run-memory-approval";
    const patchEvent = allocateImmutableEvent({
        goalId,
        runId,
        phase: "planning",
        eventType: "memory_patch_accepted",
        payload: {
            type: "memory_patch_accepted",
            protocolVersion: 1,
            producers: ["model"],
            operations: [{
                type: "upsert_plan_item",
                planItem: {
                    kind: "plan",
                    id: "plan-to-drop",
                    originPhase: "planning",
                    originSequence: 1,
                    updatedAtSequence: 1,
                    scope: "phase",
                    status: "active",
                    description: "未批准计划",
                    dependsOnFactIds: [],
                    dependsOnPlanItemIds: [],
                    completionEvidenceSequences: [],
                },
            }],
        },
    }, 1, "approval-plan-patch");
    const trajectory = new MemoryTrajectoryStore([patchEvent]);
    const base = structuredGoal(goalId, runId, 1);
    const waiting: Goal = {
        ...base,
        state: {
            ...base.state,
            workflow: {
                phase: "planning",
                preparation: {
                    status: "waiting_approval",
                    proposal: { objective: "获批任务", completionCriteria: [] },
                },
            },
            run: {
                ...base.state.run,
                memoryRevision: { eventId: patchEvent.eventId, sequence: 1 },
            },
        },
    };
    const store = new InMemoryGoalStore();
    await store.save(waiting);
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore: trajectory,
        preparationExecutor: new RecordingPreparationExecutor([]),
        scheduler: scheduler({
            ok: false,
            error: { code: "ACTION_NOT_AUTHORIZED", message: "test stop" },
        }),
    });

    const result = await coordinator.resume({
        ref: ref(waiting),
        action: { kind: "approve" },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "ACTION_NOT_AUTHORIZED");
    const persisted = await store.restore(goalId);
    assert.equal(persisted?.state.workflow.phase, "executing");
    const restored = await rebuildWorkingMemory(persisted!, { trajectoryStore: trajectory });
    assert.deepEqual(restored.memory.plan, []);
    assert.equal(
        trajectory.events.filter((event) => event.eventType === "memory_patch_accepted").length,
        2,
    );
});

test("structured Preparation fails closed before model call when Trajectory is unavailable", async () => {
    const goal = structuredGoal("goal-memory-required", "run-memory-required");
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const persistedBefore = await store.restore(goal.id);
    const executor = new RecordingPreparationExecutor([{ kind: "question", question: "不会调用" }]);
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: executor,
        scheduler: scheduler(),
    });

    await assert.rejects(
        coordinator.advance(ref(goal)),
        (error: unknown) =>
            error instanceof Error
            && "code" in error
            && error.code === "WORKING_MEMORY_TRAJECTORY_REQUIRED",
    );
    assert.equal(executor.inputs.length, 0);
    assert.deepEqual(await store.restore(goal.id), persistedBefore);
});

test("Snapshot failure leaves accepted Patch in the tail and does not expose it to the next rebuild", async () => {
    const goal = structuredGoal("goal-memory-save-failure", "run-memory-save-failure", 1);
    const trajectory = new MemoryTrajectoryStore([observation(goal.id, goal.state.run.id, 1)]);
    const store = new FailingSnapshotStore(new Error("snapshot failed"));
    await store.save(goal);
    const executor = new RecordingPreparationExecutor([{
        kind: "question",
        question: "继续",
        memoryPatch: {
            protocolVersion: 1,
            operations: [{
                type: "upsert_fact",
                fact: {
                    subject: "workspace",
                    predicate: "orphan_fact",
                    value: true,
                    stability: "stable",
                    evidenceSequences: [1],
                },
            }],
        },
    }]);
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore: trajectory,
        preparationExecutor: executor,
        scheduler: scheduler(),
    });

    await assert.rejects(
        coordinator.advance(ref(goal)),
        /snapshot failed/,
    );
    assert.equal(trajectory.events.some((event) => event.eventType === "memory_patch_accepted"), true);
    const persisted = await store.restore(goal.id);
    assert.ok(persisted);
    const rebuilt = await rebuildWorkingMemory(persisted, { trajectoryStore: trajectory });
    assert.deepEqual(rebuilt.memory.facts, []);
    assert.equal(persisted.state.run.memoryRevision, undefined);
});
