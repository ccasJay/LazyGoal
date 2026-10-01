import assert from "node:assert/strict";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    createGoal,
    createStepExecutor,
    Runner,
    type AgentDecision,
    type AgentProfile,
    type ContextLookupPort,
    type Goal,
    type StepExecutionInput,
    type StepExecutor,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { BaseTestStepExecutor } from "./current-fixtures";

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

function runningGoal(committedThroughSequence = 0): Goal {
    const created = createGoal({
        id: `goal-bm25-lite-${committedThroughSequence}`,
        runId: `run-bm25-lite-${committedThroughSequence}`,
        intent: "检索历史上下文",
        promptBundleVersion: 1,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile,
    });
    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...created.state.run,
                status: "running",
                committedThroughSequence,

                mode: "plan", approvedTask: { objective: "检索历史上下文", completionCriteria: [] },
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

class RecordingStepExecutor extends BaseTestStepExecutor {
    readonly inputs: StepExecutionInput[] = [];
    private index = 0;

    constructor(private readonly decisions: readonly AgentDecision[]) {
        super();
    }

    async execute(input: StepExecutionInput): Promise<AgentDecision> {
        this.inputs.push(input);
        const decision = this.decisions[this.index];
        this.index += 1;
        if (decision === undefined) throw new Error("unexpected StepExecutor call");
        return structuredClone(decision);
    }
}

test("Runner executes Context Lookup as one step and exposes only its committed result next", async () => {
    const goal = runningGoal(1);
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
    assert.deepEqual(portCalls, [2]);
    assert.deepEqual(
        trajectory.events.map((event) => event.eventType),
        [
            "observation_recorded",
            "model_repair_attempt_started",
            "state_committed",
            "decision_received",
            "context_lookup_requested",
            "context_lookup_completed",
            "state_committed",
            "model_repair_attempt_started",
            "state_committed",
            "decision_received",
            "run_completed",
            "context_epoch_closed",
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

test("Runner resumes a committed lookup result after interruption without querying again", async () => {
    const goal = runningGoal(1);
    const trajectory = new MemoryTrajectoryStore([seedObservation(goal)]);
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const controller = new AbortController();
    let firstExecutorCalls = 0;
    const firstExecutor: StepExecutor = createStepExecutor(async () => {
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
    });
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
        executor: createStepExecutor(async (input) => {
            resumedInputs.push(input);
            return { kind: "complete", summary: "已恢复", completionEvidence: [] };
        }),
    }).run({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(resumed.ok, true);
    assert.equal(resumedInputs[0]?.contextLookupResult?.status, "not_found");
    assert.equal(portCalls, 1);
});
