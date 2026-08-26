import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GoalCoordinator,
    Runner,
    allocateImmutableEvent,
    createGoal,
} from "../src/index";
import type {
    AgentDecision,
    AgentProfile,
    Goal,
    GoalStore,
    Tool,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectorySink,
} from "../src/index";

const profile: AgentProfile = {
    id: "trajectory-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: ["echo"],
};

class RecordingTrajectorySink implements TrajectorySink {
    readonly events: TrajectoryEvent[] = [];
    private sequence = 0;

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        this.sequence += 1;
        const event = allocateImmutableEvent(draft, this.sequence, `event-${this.sequence}`);
        this.events.push(event);
        return event;
    }
}

class MemoryGoalStore implements GoalStore {
    private goal?: Goal;

    async save(goal: Goal): Promise<void> {
        this.goal = structuredClone(goal);
    }

    async restore(_goalId: string): Promise<Goal | undefined> {
        return this.goal === undefined ? undefined : structuredClone(this.goal);
    }
}

function executingGoal(): Goal {
    const goal = createGoal({
        id: "goal-trajectory",
        intent: "execute",
        promptBundleVersion: 1,
        profile,
        runId: "run-trajectory",
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

test("Runner appends ordered execution facts and commits Snapshot boundary after facts", async () => {
    const store = new MemoryGoalStore();
    const sink = new RecordingTrajectorySink();
    const toolEvents: string[] = [];
    let decisionCount = 0;

    const tool: Tool = {
        definition: {
            id: "echo",
            description: "echo",
            inputSchema: { type: "object" },
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            const types = sink.events.map((event) => event.eventType);
            assert.ok(types.includes("tool_started"));
            toolEvents.push(types.join(","));
            return { kind: "success", output: "ok", summary: "done" };
        },
    };
    const decisions: AgentDecision[] = [
        {
            kind: "tool_call",
            checkpoint: "call echo",
            action: { actionId: "action-1", toolId: "echo", input: {} },
        },
        { kind: "complete", checkpoint: "done", summary: "done" },
    ];

    const goal = executingGoal();
    await store.save(goal);
    const runner = new Runner({
        store,
        trajectorySink: sink,
        toolRegistry: { get: (id) => id === tool.definition.id ? tool : undefined },
        executor: {
            async execute() {
                decisionCount += 1;
                return decisions[decisionCount - 1]!;
            },
        },
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(toolEvents.length, 1);

    const types = sink.events.map((event) => event.eventType);
    assert.deepEqual(types, [
        "run_started",
        "state_committed",
        "decision_received",
        "action_staged",
        "state_committed",
        "tool_started",
        "tool_finished",
        "observation_recorded",
        "state_committed",
        "decision_received",
        "run_completed",
        "state_committed",
    ]);

    const executionUnitIds = sink.events
        .filter((event) => [
            "decision_received",
            "action_staged",
            "tool_started",
            "tool_finished",
            "observation_recorded",
        ].includes(event.eventType))
        .map((event) => event.executionUnitId);
    assert.equal(new Set(executionUnitIds.slice(0, 5)).size, 1);
    assert.equal(executionUnitIds[5] !== executionUnitIds[0], true);

    const persisted = await store.restore(goal.id);
    assert.equal(
        persisted?.state.run.committedThroughSequence,
        [...sink.events].reverse().find((event) => event.eventType === "run_completed")?.sequence,
    );
    assert.equal(
        persisted?.state.run.committedThroughSequence
            && persisted.state.run.committedThroughSequence
                < (sink.events.at(-1)?.sequence ?? 0),
        true,
    );
});

test("Coordinator records preparation and waiting facts before the committed Snapshot", async () => {
    const store = new MemoryGoalStore();
    const sink = new RecordingTrajectorySink();
    const goal = createGoal({
        id: "goal-preparation-trajectory",
        intent: "gather",
        promptBundleVersion: 1,
        profile,
        runId: "run-preparation-trajectory",
    });
    await store.save(goal);
    const coordinator = new GoalCoordinator({
        store,
        trajectorySink: sink,
        preparationExecutor: {
            async execute() {
                return { kind: "question", question: "需要什么信息？" };
            },
        },
        scheduler: {
            async schedule() {
                throw new Error("preparation should not schedule");
            },
        },
    });

    const result = await coordinator.advance({
        goalId: goal.id,
        runId: goal.state.run.id,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(sink.events.map((event) => event.eventType), [
        "preparation_result",
        "run_waiting",
        "state_committed",
    ]);
    assert.equal(
        (await store.restore(goal.id))?.state.run.committedThroughSequence,
        sink.events[1]?.sequence,
    );
});
