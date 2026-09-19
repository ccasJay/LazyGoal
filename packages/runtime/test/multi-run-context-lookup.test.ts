import assert from "node:assert/strict";
import { test } from "node:test";

import {
    IndexedContextLookupService,
    allocateImmutableEvent,
    assertContextLookupResultOwnership,
    buildCommittedEvidenceIndex,
    createGoal,
    getCommittedRunBoundaries,
    readTrajectoryAtSnapshot,
    validateContextLookupResult,
    validateContextLookupSourceReferences,
    validateFactEvidence,
    type Goal,
    type GoalStore,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
} from "../src/index";
import { classifyTrajectoryTail } from "../src/index";

const goalId = "goal-multi-run-context";
const oldRunId = "run-old";
const currentRunId = "run-current";

const profile = {
    id: "multi-run-context-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: [],
} as const;

class MemoryTrajectoryStore implements TrajectoryStore {
    constructor(private readonly byRun: ReadonlyMap<string, readonly TrajectoryEvent[]>) {}

    async append(_draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        throw new Error("append is not used by this test");
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.byRun.get(query.runId)?.filter((event) =>
            event.goalId === query.goalId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence)
        ) ?? [];
    }

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        return classifyTrajectoryTail(await this.read(query), committedThroughSequence);
    }
}

class MemoryGoalStore implements GoalStore {
    constructor(private readonly goal: Goal) {}

    async save(_goal: Goal): Promise<void> {}

    async restore(_goalId: string): Promise<Goal> {
        return this.goal;
    }
}

function createMultiRunGoal(): Goal {
    const goal = createGoal({
        id: goalId,
        runId: currentRunId,
        intent: "执行多 Run 历史查询",
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
            messages: [
                { role: "user", content: "执行旧 Run" },
                {
                    role: "assistant",
                    assistant: { profileId: profile.id },
                    content: "归档结果已保存",
                },
                { role: "user", content: "继续当前 Run" },
            ],
            completedRuns: [{
                runId: oldRunId,
                stepCount: 1,
                committedThroughSequence: 2,
                messageRange: { start: 0, end: 2 },
            }],
            run: {
                ...goal.state.run,
                id: currentRunId,
                status: "running",
                committedThroughSequence: 1,
            },
        },
    };
}

function oldRunEvents(): readonly TrajectoryEvent[] {
    return [
        allocateImmutableEvent({
            goalId,
            runId: oldRunId,
            phase: "executing",
            executionUnitId: "old-unit",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "complete",
                    summary: "archive completed",
                    completionEvidence: [],
                },
            },
        }, 1, "old-decision"),
        allocateImmutableEvent({
            goalId,
            runId: oldRunId,
            phase: "executing",
            executionUnitId: "old-unit",
            eventType: "run_completed",
            payload: { type: "run_completed", summary: "archive completed" },
        }, 2, "old-completed"),
    ];
}

function currentRunEvents(): readonly TrajectoryEvent[] {
    return [allocateImmutableEvent({
        goalId,
        runId: currentRunId,
        phase: "executing",
        executionUnitId: "current-unit",
        actionId: "current-action",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: "current-action",
            observation: {
                kind: "success",
                output: "current",
                summary: "current observation",
            },
        },
    }, 1, "current-observation")];
}

function storeFor(goal: Goal): MemoryTrajectoryStore {
    return new MemoryTrajectoryStore(new Map([
        [oldRunId, oldRunEvents()],
        [currentRunId, currentRunEvents()],
    ]));
}

test("Trajectory reader uses archived Run boundary and rejects unknown Run", async () => {
    const goal = createMultiRunGoal();
    const trajectory = storeFor(goal);
    const old = await readTrajectoryAtSnapshot(
        new MemoryGoalStore(goal),
        trajectory,
        { goalId, runId: oldRunId },
    );
    assert.deepEqual(old.committed.map((event) => event.sequence), [1, 2]);
    assert.deepEqual(old.uncommittedTail, []);

    const unknown = await readTrajectoryAtSnapshot(
        new MemoryGoalStore(goal),
        trajectory,
        { goalId, runId: "run-unknown" },
    );
    assert.deepEqual(unknown.committed, []);
    assert.deepEqual(unknown.uncommittedTail, []);
});

test("Indexed Lookup keeps equal local sequences separated by Run identity", async () => {
    const goal = createMultiRunGoal();
    const result = await new IndexedContextLookupService({
        trajectoryStore: storeFor(goal),
        minimumScore: 0,
    }).lookup({
        goal,
        request: {
            kind: "context_lookup",
            need: "historical_execution",
            question: "archive",
        },
        lookupId: "lookup-multi-run",
        committedThroughSequence: 2,
    });

    assert.equal(result.status, "found");
    if (result.status !== "found") return;
    assert.equal(result.matches[0]?.runId, oldRunId);
    assert.equal(result.matches[0]?.firstSequence, 1);
    assert.equal(result.sourceRunBoundaries?.find((source) => source.runId === oldRunId)?.committedThroughSequence, 2);
    assert.doesNotThrow(() => assertContextLookupResultOwnership(
        result,
        goalId,
        currentRunId,
        getCommittedRunBoundaries(goal),
    ));
});

test("旧 Run Lookup 来源可验证但不能作为当前 Run Evidence", async () => {
    const goal = createMultiRunGoal();
    const trajectory = storeFor(goal);
    const result = await new IndexedContextLookupService({
        trajectoryStore: trajectory,
        minimumScore: 0,
    }).lookup({
        goal,
        request: {
            kind: "context_lookup",
            need: "historical_execution",
            question: "archive",
        },
        lookupId: "lookup-evidence-boundary",
        committedThroughSequence: 2,
    });
    assert.equal(result.status, "found");
    if (result.status !== "found") return;

    const currentIndex = buildCommittedEvidenceIndex({
        goalId,
        runId: currentRunId,
        committedThroughSequence: 1,
        events: currentRunEvents(),
    });
    const oldIndex = buildCommittedEvidenceIndex({
        goalId,
        runId: oldRunId,
        committedThroughSequence: 2,
        events: oldRunEvents(),
    });
    assert.throws(
        () => validateContextLookupSourceReferences(result, currentIndex),
        /unknown or uncommitted/,
    );
    assert.doesNotThrow(() => validateContextLookupSourceReferences(result, currentIndex, [oldIndex]));
    assert.throws(
        () => validateFactEvidence([1], oldIndex, "execution"),
        /evidence event type is not allowed/,
    );
});

test("Lookup Result 拒绝越过来源 Run boundary 或未知来源 Run", () => {
    const match = {
        documentId: "old-document",
        goalId,
        runId: oldRunId,
        firstSequence: 1,
        lastSequence: 3,
        matchedFields: ["body"] as const,
        score: 1,
        preview: "old",
        truncated: false,
        historical: true as const,
        sourceEventIds: ["old-completed"],
    };
    assert.throws(
        () => validateContextLookupResult({
            status: "found",
            lookupId: "lookup-invalid-boundary",
            committedThroughSequence: 3,
            sourceRunBoundaries: [{ runId: oldRunId, committedThroughSequence: 2 }],
            matches: [match],
            truncated: false,
        }, "lookup-invalid-boundary", 3),
        /sequence range is invalid/,
    );

    const unknown = {
        ...match,
        runId: "run-unknown",
        lastSequence: 1,
    };
    const result = validateContextLookupResult({
        status: "found",
        lookupId: "lookup-unknown-run",
        committedThroughSequence: 1,
        matches: [unknown],
        truncated: false,
    }, "lookup-unknown-run", 1);
    assert.equal(result.status, "found");
    assert.throws(
        () => assertContextLookupResultOwnership(result, goalId, currentRunId, getCommittedRunBoundaries(createMultiRunGoal())),
        /unknown or uncommitted/,
    );

    const crossGoal = validateContextLookupResult({
        ...result,
        matches: [{ ...unknown, goalId: "goal-other" }],
    }, "lookup-unknown-run", 1);
    assert.equal(crossGoal.status, "found");
    if (crossGoal.status !== "found") return;
    assert.throws(
        () => assertContextLookupResultOwnership(crossGoal, goalId, currentRunId, getCommittedRunBoundaries(createMultiRunGoal())),
        /unknown or uncommitted/,
    );
});
