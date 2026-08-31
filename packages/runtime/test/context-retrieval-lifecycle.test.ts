import assert from "node:assert/strict";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    createGoal,
    GoalCoordinator,
    Runner,
    type AgentDecision,
    type AgentProfile,
    type ContextLookupPort,
    type Goal,
    type PreparationExecutionInput,
    type PreparationExecutor,
    type PreparationResult,
    type StepExecutionInput,
    type StepExecutor,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";

const profile: AgentProfile = {
    id: "context-retrieval-profile",
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
            `context-event-${this.events.length + 1}`,
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

function runningGoal(
    retrieval: "none" | "bm25-lite" = "bm25-lite",
    committedThroughSequence = 0,
): Goal {
    const created = createGoal({
        id: `goal-${retrieval}-${committedThroughSequence}`,
        runId: `run-${retrieval}-${committedThroughSequence}`,
        intent: "检索历史上下文",
        promptBundleVersion: 7,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: retrieval, version: 1 },
        profile,
    });
    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: { objective: "检索历史上下文", completionCriteria: [] },
            },
            run: {
                ...created.state.run,
                status: "running",
                committedThroughSequence,
            },
        },
    };
}

function seedObservation(goal: Goal): Readonly<TrajectoryEvent> {
    return allocateImmutableEvent({
        goalId: goal.id,
        runId: goal.state.run.id,
        phase: "executing",
        actionId: "seed-action",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: "seed-action",
            observation: {
                kind: "success",
                output: { source: "seed" },
                summary: "seed",
            },
        },
    }, 1, "seed-observation");
}

class RecordingStepExecutor implements StepExecutor {
    readonly inputs: StepExecutionInput[] = [];
    private index = 0;

    constructor(private readonly decisions: readonly AgentDecision[]) {}

    async execute(input: StepExecutionInput): Promise<AgentDecision> {
        this.inputs.push(input);
        const decision = this.decisions[this.index];
        this.index += 1;
        if (decision === undefined) throw new Error("unexpected StepExecutor call");
        return structuredClone(decision);
    }
}

test("Runner executes Context Lookup as one step and exposes only its committed result next", async () => {
    const goal = runningGoal("bm25-lite", 1);
    const trajectory = new MemoryTrajectoryStore([seedObservation(goal)]);
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const executor = new RecordingStepExecutor([
        {
            kind: "context_lookup",
            need: "historical_execution",
            question: "之前读取过哪个对象？",
        },
        { kind: "complete", summary: "完成", completionEvidence: [] },
    ]);
    const portCalls: number[] = [];
    const port: ContextLookupPort = {
        async lookup(input) {
            portCalls.push(input.committedThroughSequence);
            return {
                status: "found",
                lookupId: input.lookupId,
                committedThroughSequence: input.committedThroughSequence,
                matches: [{
                    documentId: "doc-seed",
                    goalId: input.goal.id,
                    runId: input.goal.state.run.id,
                    firstSequence: 1,
                    lastSequence: 1,
                    matchedFields: ["body"],
                    score: 2.5,
                    preview: "seed",
                    truncated: false,
                    historical: true,
                    sourceEventIds: ["seed-observation"],
                }],
                truncated: false,
            };
        },
    };

    const result = await new Runner({
        store,
        executor,
        trajectoryStore: trajectory,
        contextLookupPort: port,
    }).run({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed");
    assert.equal(result.state.stepCount, 2);
    assert.equal(executor.inputs.length, 2);
    assert.equal(executor.inputs[0]?.contextLookupResult, undefined);
    assert.equal(executor.inputs[1]?.contextLookupResult?.status, "found");
    assert.deepEqual(portCalls, [1]);
    assert.deepEqual(
        trajectory.events.map((event) => event.eventType),
        [
            "observation_recorded",
            "decision_received",
            "context_lookup_requested",
            "context_lookup_completed",
            "state_committed",
            "decision_received",
            "run_completed",
            "memory_patch_accepted",
            "state_committed",
        ],
    );
    const persisted = await store.restore(goal.id);
    assert.equal(persisted?.state.run.lastStep?.kind, "decision");
    assert.equal(
        persisted?.state.run.lastStep?.kind === "decision"
            ? persisted.state.run.lastStep.result.kind
            : undefined,
        "complete",
    );
});

test("Runner rejects lookup on a Goal without retrieval protocol before facts or query", async () => {
    const goal = runningGoal("none");
    const trajectory = new MemoryTrajectoryStore();
    const store = new InMemoryGoalStore();
    await store.save(goal);
    let calls = 0;
    const executor = new RecordingStepExecutor([{
        kind: "context_lookup",
        need: "decision_rationale",
        question: "为什么？",
    }]);
    const result = await new Runner({
        store,
        executor,
        trajectoryStore: trajectory,
        contextLookupPort: {
            async lookup() {
                calls += 1;
                return { status: "not_found", lookupId: "unused" };
            },
        },
    }).run({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "INVALID_CONTEXT_LOOKUP");
    assert.equal(calls, 0);
    assert.deepEqual(trajectory.events, []);
    assert.equal((await store.restore(goal.id))?.state.run.stepCount, 0);
});

test("Runner resumes a committed lookup result after interruption without querying again", async () => {
    const goal = runningGoal("bm25-lite", 1);
    const trajectory = new MemoryTrajectoryStore([seedObservation(goal)]);
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const controller = new AbortController();
    let firstExecutorCalls = 0;
    const firstExecutor: StepExecutor = {
        async execute() {
            firstExecutorCalls += 1;
            if (firstExecutorCalls === 1) {
                return {
                    kind: "context_lookup",
                    need: "historical_execution",
                    question: "之前做过什么？",
                };
            }
            controller.abort();
            return { kind: "complete", summary: "不会提交", completionEvidence: [] };
        },
    };
    let portCalls = 0;
    const port: ContextLookupPort = {
        async lookup(input) {
            portCalls += 1;
            return { status: "not_found", lookupId: input.lookupId };
        },
    };

    await assert.rejects(
        new Runner({
            store,
            executor: firstExecutor,
            trajectoryStore: trajectory,
            contextLookupPort: port,
        }).run(
            { goalId: goal.id, runId: goal.state.run.id },
            {},
            { signal: controller.signal },
        ),
    );
    assert.equal(portCalls, 1);
    assert.equal((await store.restore(goal.id))?.state.run.stepCount, 1);

    const resumedInputs: StepExecutionInput[] = [];
    const resumed = await new Runner({
        store,
        trajectoryStore: trajectory,
        contextLookupPort: {
            async lookup() {
                throw new Error("committed lookup should be reused");
            },
        },
        executor: {
            async execute(input) {
                resumedInputs.push(input);
                return { kind: "complete", summary: "已恢复", completionEvidence: [] };
            },
        },
    }).run({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(resumed.ok, true);
    assert.equal(resumedInputs[0]?.contextLookupResult?.status, "not_found");
    assert.equal(portCalls, 1);
});

class ChainPreparationExecutor implements PreparationExecutor {
    readonly inputs: PreparationExecutionInput[] = [];
    private count = 0;

    async execute(input: PreparationExecutionInput): Promise<PreparationResult> {
        this.inputs.push(input);
        this.count += 1;
        if (this.count <= 4) {
            return {
                kind: "context_lookup",
                need: "historical_execution",
                question: `第 ${this.count} 次历史查询`,
            };
        }
        return { kind: "context_ready" };
    }
}

test("Coordinator restores a committed Preparation lookup result after interruption", async () => {
    const created = createGoal({
        id: "goal-preparation-recovery",
        runId: "run-preparation-recovery",
        intent: "恢复准备查询",
        promptBundleVersion: 7,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile,
    });
    const goal: Goal = {
        ...created,
        state: {
            ...created.state,
            run: { ...created.state.run, committedThroughSequence: 0 },
        },
    };
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const trajectory = new MemoryTrajectoryStore();
    const controller = new AbortController();
    let firstCalls = 0;
    const firstPreparation: PreparationExecutor = {
        async execute() {
            firstCalls += 1;
            if (firstCalls === 1) {
                return {
                    kind: "context_lookup",
                    need: "decision_rationale",
                    question: "之前为什么这么做？",
                };
            }
            controller.abort();
            return { kind: "context_ready" };
        },
    };
    let portCalls = 0;
    const port: ContextLookupPort = {
        async lookup(input) {
            portCalls += 1;
            return { status: "not_found", lookupId: input.lookupId };
        },
    };
    const dependencies = {
        store,
        trajectoryStore: trajectory,
        preparationExecutor: firstPreparation,
        contextLookupPort: port,
        scheduler: {
            async schedule() {
                throw new Error("should not schedule");
            },
        },
    };

    await assert.rejects(
        new GoalCoordinator(dependencies).advance(
            { goalId: goal.id, runId: goal.state.run.id },
            { signal: controller.signal },
        ),
    );
    assert.equal(portCalls, 1);

    const resumedInputs: PreparationExecutionInput[] = [];
    const resumed = await new GoalCoordinator({
        store,
        trajectoryStore: trajectory,
        contextLookupPort: {
            async lookup() {
                throw new Error("committed lookup should be reused");
            },
        },
        preparationExecutor: {
            async execute(input) {
                resumedInputs.push(input);
                return input.goal.state.workflow.phase === "gathering_context"
                    ? { kind: "context_ready" }
                    : {
                        kind: "task_proposal",
                        task: { objective: "已恢复", completionCriteria: [] },
                        approvalRequest: "批准？",
                    };
            },
        },
        scheduler: {
            async schedule() {
                throw new Error("should not schedule");
            },
        },
    }).advance({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(resumed.ok, true);
    assert.equal(resumed.kind, "waiting");
    assert.equal(resumedInputs[0]?.contextLookupResult?.status, "not_found");
    assert.equal(resumedInputs[1]?.contextLookupResult, undefined);
    assert.equal(portCalls, 1);
});

test("Coordinator limits Preparation Context Lookup chains to three committed queries", async () => {
    const created = createGoal({
        id: "goal-preparation-chain",
        runId: "run-preparation-chain",
        intent: "准备检索任务",
        promptBundleVersion: 7,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile,
    });
    const goal: Goal = {
        ...created,
        state: {
            ...created.state,
            run: { ...created.state.run, committedThroughSequence: 0 },
        },
    };
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const trajectory = new MemoryTrajectoryStore();
    const preparation = new ChainPreparationExecutor();
    let calls = 0;
    const result = await new GoalCoordinator({
        store,
        trajectoryStore: trajectory,
        preparationExecutor: preparation,
        contextLookupPort: {
            async lookup(input) {
                calls += 1;
                return {
                    status: "not_found",
                    lookupId: input.lookupId,
                    reason: "没有命中",
                };
            },
        },
        scheduler: {
            async schedule() {
                throw new Error("should not schedule");
            },
        },
    }).advance({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "CONTEXT_LOOKUP_CHAIN_LIMIT");
    assert.equal(calls, 3);
    assert.equal(preparation.inputs.length, 4);
    assert.equal(preparation.inputs[1]?.contextLookupResult?.status, "not_found");
    assert.equal(
        trajectory.events.filter((event) => event.eventType === "context_lookup_requested").length,
        3,
    );
    assert.equal((await store.restore(goal.id))?.state.run.committedThroughSequence, 11);
});
