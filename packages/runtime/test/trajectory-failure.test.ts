import assert from "node:assert/strict";
import { test } from "node:test";

import {
    Runner,
    TrajectoryAppendError,
    TrajectoryCommitMarkerError,
    allocateDiagnosticTraceRecord,
    allocateImmutableEvent,
    createGoal,
} from "../src/index";
import type {
    AgentProfile,
    Goal,
    GoalStore,
    Tool,
    TraceRecord,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../src/index";
import { currentProtocols } from "./current-fixtures";

const profile: AgentProfile = {
    id: "trajectory-failure-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: ["echo"],
};

class MemoryGoalStore implements GoalStore {
    private goal?: Goal;

    async save(goal: Goal): Promise<void> {
        this.goal = structuredClone(goal);
    }

    async restore(_goalId: string): Promise<Goal | undefined> {
        return this.goal === undefined ? undefined : structuredClone(this.goal);
    }
}

class FailingTrajectorySink implements TrajectoryStore {
    readonly events: TrajectoryEvent[] = [];
    private sequence = 0;

    constructor(private readonly failType?: TrajectoryEvent["eventType"]) {}

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        if (draft.eventType === this.failType) {
            throw new Error(`failed to append ${draft.eventType}`);
        }
        this.sequence += 1;
        const event = allocateImmutableEvent(draft, this.sequence, `event-${this.sequence}`);
        this.events.push(event);
        return event;
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence),
        );
    }

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        const events = await this.read(query);
        return {
            committed: events.filter((event) => event.sequence <= committedThroughSequence),
            uncommittedTail: events.filter((event) => event.sequence > committedThroughSequence),
        };
    }
}

class RecordingTraceSink {
    readonly records: TraceRecord[] = [];

    async append(record: TraceRecord): Promise<void> {
        this.records.push(structuredClone(record));
    }
}

function executingGoal(id: string): Goal {
    const goal = createGoal({
        ...currentProtocols,
        id,
        intent: "execute",
        promptBundleVersion: 1,
        profile,
        runId: `${id}-run`,
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: { objective: "execute", completionCriteria: ["done"] },
            },
        },
    };
}

function toolThatFails(): Tool {
    return {
        definition: {
            id: "echo",
            description: "echo",
            inputSchema: { type: "object" },
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute() {
            throw new Error("tool side effect failed");
        },
    };
}

function toolWithoutResult(): Tool {
    return {
        definition: {
            id: "echo",
            description: "echo",
            inputSchema: { type: "object" },
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute() {
            return undefined as never;
        },
    };
}

function toolThatSucceeds(onExecute?: () => void): Tool {
    return {
        definition: {
            id: "echo",
            description: "echo",
            inputSchema: { type: "object" },
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            onExecute?.();
            return { kind: "success", output: "ok", summary: "done" };
        },
    };
}

function toolDecision(): { kind: "tool_call"; action: {
    actionId: string;
    toolId: string;
    input: Record<string, never>;
} } {
    return {
        kind: "tool_call",
        action: { actionId: "action-1", toolId: "echo", input: {} },
    };
}

test("a pre-effect event append failure stops before Tool execution and new Snapshot commit", async () => {
    const goal = executingGoal("goal-append-failure");
    const store = new MemoryGoalStore();
    await store.save(goal);
    const sink = new FailingTrajectorySink("tool_started");
    let toolCalled = false;
    const tool = toolThatSucceeds(() => {
        toolCalled = true;
    });
    const runner = new Runner({
        trajectoryStore: sink,
        store,
        toolRegistry: { get: () => tool },
        executor: { execute: async () => toolDecision() },
    });
    await assert.rejects(
        runner.run({ goalId: goal.id, runId: goal.state.run.id }),
        (error: unknown) => error instanceof TrajectoryAppendError
            && error.code === "TRAJECTORY_APPEND_FAILED",
    );
    assert.equal(toolCalled, false);
    const persisted = await store.restore(goal.id);
    assert.equal(persisted?.state.run.pendingAction?.status, "approved");
    assert.equal(persisted?.state.run.committedThroughSequence, 4);
    assert.equal(sink.events.some((event) => event.eventType === "tool_started"), false);
});

test("a failed Tool keeps tool_started but never fabricates tool_finished or success Observation", async () => {
    const goal = executingGoal("goal-tool-failure");
    const store = new MemoryGoalStore();
    await store.save(goal);
    const sink = new FailingTrajectorySink();
    const tool = toolThatFails();
    const runner = new Runner({
        trajectoryStore: sink,
        store,
        toolRegistry: { get: () => tool },
        executor: { execute: async () => toolDecision() },
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.deepEqual(
        sink.events.map((event) => event.eventType),
        [
            "run_started",
            "state_committed",
            "decision_received",
            "action_staged",
            "state_committed",
            "tool_started",
            "execution_error",
            "context_epoch_closed",
            "memory_patch_accepted",
            "state_committed",
        ],
    );
    const persisted = await store.restore(goal.id);
    assert.equal(persisted?.state.run.pendingAction?.status, "outcome_unknown");
});

test("an Observation append failure keeps the durable pending Action and prior facts", async () => {
    const goal = executingGoal("goal-observation-append-failure");
    const store = new MemoryGoalStore();
    await store.save(goal);
    const sink = new FailingTrajectorySink("observation_recorded");
    const tool = toolThatSucceeds();
    const runner = new Runner({
        trajectoryStore: sink,
        store,
        toolRegistry: { get: () => tool },
        executor: { execute: async () => toolDecision() },
    });

    await assert.rejects(
        runner.run({ goalId: goal.id, runId: goal.state.run.id }),
        (error: unknown) => error instanceof TrajectoryAppendError,
    );
    assert.deepEqual(sink.events.map((event) => event.eventType), [
        "run_started",
        "state_committed",
        "decision_received",
        "action_staged",
        "state_committed",
        "tool_started",
        "tool_finished",
    ]);
    const persisted = await store.restore(goal.id);
    assert.equal(persisted?.state.run.pendingAction?.status, "approved");
    assert.equal(persisted?.state.run.committedThroughSequence, 4);
});

test("a Tool without a result records an execution error without a fabricated finish", async () => {
    const goal = executingGoal("goal-tool-no-result");
    const store = new MemoryGoalStore();
    await store.save(goal);
    const sink = new FailingTrajectorySink();
    const runner = new Runner({
        trajectoryStore: sink,
        store,
        toolRegistry: { get: () => toolWithoutResult() },
        executor: { execute: async () => toolDecision() },
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(sink.events.some((event) => event.eventType === "tool_finished"), false);
    assert.equal(sink.events.some((event) => event.eventType === "observation_recorded"), false);
    assert.equal(sink.events.some((event) => event.eventType === "execution_error"), true);
});

test("a marker append failure preserves the saved Snapshot and reports a diagnostic gap", async () => {
    const goal = executingGoal("goal-marker-failure");
    const store = new MemoryGoalStore();
    await store.save(goal);
    const sink = new FailingTrajectorySink("state_committed");
    const traceSink = new RecordingTraceSink();
    const runner = new Runner({
        trajectoryStore: sink,
        store,
        traceSink,
        executor: { execute: async () => ({ kind: "complete", completionEvidence: [], summary: "done" }) },
    });

    await assert.rejects(
        runner.run({ goalId: goal.id, runId: goal.state.run.id }),
        (error: unknown) => error instanceof TrajectoryCommitMarkerError
            && error.code === "TRAJECTORY_COMMIT_MARKER_FAILED",
    );
    const persisted = await store.restore(goal.id);
    assert.equal(persisted?.state.run.status, "running");
    assert.equal(persisted?.state.run.committedThroughSequence, 1);
    assert.deepEqual(traceSink.records.map((record) => record.kind), [
        "trajectory_commit_marker_failed",
    ]);
    assert.deepEqual(sink.events.map((event) => event.eventType), ["run_started"]);
});

test("diagnostic trace construction is independent from Domain Event payloads", () => {
    const record = allocateDiagnosticTraceRecord({
        goalId: "goal-1",
        runId: "run-1",
        kind: "runtime_error",
        payload: { stack: "redacted" },
    });
    assert.equal(record.traceSchemaVersion, 1);
    assert.equal(record.kind, "runtime_error");
    assert.equal(
        record.payload !== null
        && typeof record.payload === "object"
        && "eventType" in record.payload,
        false,
    );
});
