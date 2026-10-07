import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GoalCoordinator,
    Runner,
    TrajectoryCheckpointCommitter,
    allocateImmutableEvent,
    createGoal as createUnexposedGoal,
    createStepExecutor,
    transition,
} from "../src/index";
import {
    createToolRegistration,
    type Tool,
    type ToolRegistration,
} from "../../tool-core/src/index";
import { contract } from "../../contracts/src/index";
import type {
    AgentDecision,
    AgentProfile,
    Goal,
    GoalStore,
    RunInput,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../src/index";
import { currentProtocols, withDiscoveredProfileTools } from "./current-fixtures";

function createGoal(input: Parameters<typeof createUnexposedGoal>[0]) {
    return withDiscoveredProfileTools(createUnexposedGoal(input));
}

const profile: AgentProfile = {
    id: "trajectory-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: ["echo"],
};

const TEST_INPUT_CONTRACT = contract.record(contract.string());

class RecordingTrajectorySink implements TrajectoryStore {
    readonly events: TrajectoryEvent[] = [];
    private sequence = 0;

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
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
        ...currentProtocols,
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
            },
            run: { ...goal.state.run, mode: "plan", approvedTask: { objective: "execute", completionCriteria: [] } },
        },
    };
}

function applyRunTransition(goal: Goal, input: RunInput): Goal {
    const result = transition(goal.state.run, input);
    if (!result.ok) {
        assert.fail(result.error.message);
    }
    return { ...goal, state: { ...goal.state, run: result.state } };
}

test("Runner appends ordered execution facts and commits Snapshot boundary after facts", async () => {
    const store = new MemoryGoalStore();
    const sink = new RecordingTrajectorySink();
    const toolEvents: string[] = [];
    let decisionCount = 0;

    const tool: Tool<typeof TEST_INPUT_CONTRACT> = {
        definition: {
            id: "echo",
            description: "echo",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: false,
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
            action: { actionId: "action-1", toolId: "echo", input: {} },
        },
        { kind: "complete", completionEvidence: [], summary: "done" },
    ];

    const goal = executingGoal();
    await store.save(goal);
    const runner = new Runner({
        trajectoryStore: sink,
        store,
        toolRegistry: {
            get: (id) => id === tool.definition.id ? createToolRegistration(tool) : undefined,
        },
        executor: createStepExecutor(async () => {
            decisionCount += 1;
            return decisions[decisionCount - 1]!;
        }, async () => ({ kind: "accept" })),
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(toolEvents.length, 1);

    const types = sink.events.map((event) => event.eventType);
    assert.deepEqual(types, [
        "run_started",
        "state_committed",
        "model_repair_attempt_started",
        "state_committed",
        "decision_received",
        "action_staged",
        "state_committed",
        "tool_attempt_started",
        "state_committed",
        "tool_started",
        "tool_finished",
        "observation_recorded",
        "state_committed",
        "model_repair_attempt_started",
        "state_committed",
        "decision_received",
        "run_completed",
        "context_epoch_closed",
        "memory_patch_accepted",
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
        sink.events.at(-2)?.sequence,
    );
    assert.equal(
        persisted?.state.run.committedThroughSequence
            && persisted.state.run.committedThroughSequence
                < (sink.events.at(-1)?.sequence ?? 0),
        true,
    );
});

test("Runner 恢复 safe Action 时保持 Tool Observation 与 Snapshot 的提交顺序", async () => {
    const store = new MemoryGoalStore();
    const sink = new RecordingTrajectorySink();
    const action = {
        actionId: "action-recovered-order",
        toolId: "echo",
        input: { value: "恢复输入" },
    } as const;
    const interrupted = applyRunTransition(
        applyRunTransition(executingGoal(), { kind: "start" }),
        { kind: "stage_action", action, status: "approved" },
    );
    await store.save(interrupted);
    let prepareCalls = 0;
    const tool: Tool<typeof TEST_INPUT_CONTRACT> = {
        definition: {
            id: "echo",
            description: "echo",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: false,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute({ actionId }) {
            assert.equal(actionId, action.actionId);
            return { kind: "success", output: "ok", summary: "done" };
        },
    };
    const baseRegistration = createToolRegistration(tool);
    const registration: ToolRegistration = {
        ...baseRegistration,
        prepare(input, control) {
            prepareCalls += 1;
            return baseRegistration.prepare(input, control);
        },
    };
    const runner = new Runner({
        store,
        trajectoryStore: sink,
        toolRegistry: {
            get: (toolId) => toolId === action.toolId ? registration : undefined,
        },
        executor: createStepExecutor(async () => {
            return { kind: "complete", completionEvidence: [], summary: "done" };
        }, async () => ({ kind: "accept" })),
    });

    const result = await runner.run({
        goalId: interrupted.id,
        runId: interrupted.state.run.id,
    });
    assert.equal(result.ok, true);
    assert.equal(result.state.status, "completed");
    assert.equal(result.state.stepCount, 2);
    assert.equal(prepareCalls, 1);

    assert.deepEqual(sink.events.map((event) => event.eventType), [
        "tool_attempt_started",
        "state_committed",
        "tool_started",
        "tool_finished",
        "observation_recorded",
        "state_committed",
        "model_repair_attempt_started",
        "state_committed",
        "decision_received",
        "run_completed",
        "context_epoch_closed",
        "memory_patch_accepted",
        "state_committed",
    ]);
    assert.deepEqual(
        sink.events
            .filter((event) => event.actionId !== undefined)
            .map((event) => event.actionId),
        [action.actionId, action.actionId, action.actionId, action.actionId],
    );
    assert.deepEqual(sink.events.find((event) => event.eventType === "tool_started")?.payload, {
        type: "tool_started",
        actionId: action.actionId,
        toolId: action.toolId,
        input: action.input,
    });
    assert.deepEqual(sink.events.find((event) => event.eventType === "observation_recorded")?.payload, {
        type: "observation_recorded",
        actionId: action.actionId,
        observation: { kind: "success", output: "ok", summary: "done" },
    });
    assert.equal(
        (await store.restore(interrupted.id))?.state.run.committedThroughSequence,
        sink.events.at(-2)?.sequence,
    );
});

test("Coordinator records waiting facts before the committed Snapshot when Run pauses for interaction", async () => {
    const store = new MemoryGoalStore();
    const sink = new RecordingTrajectorySink();
    const goal = createGoal({
        ...currentProtocols,
        id: "goal-waiting-trajectory",
        intent: "gather",
        promptBundleVersion: 1,
        profile,
        runId: "run-waiting-trajectory",
    });
    await store.save(goal);
    const coordinator = new GoalCoordinator({
        trajectoryStore: sink,
        store,
        scheduler: {
            async schedule(ref) {
                const current = await store.restore(ref.goalId);
                if (current) {
                    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: sink });
                    await committer.commit({
                        ...current,
                        state: {
                            ...current.state,
                            run: {
                                ...current.state.run,
                                status: "waiting",
                                pendingInteraction: {
                                    kind: "ask_user",
                                    requestId: "ask-1",
                                    mode: "plan",
                                    questions: [{
                                        id: "q1",
                                        header: "信息",
                                        question: "需要什么信息？",
                                        options: [{ id: "o1", label: "继续" }, { id: "o2", label: "停止" }],
                                        multiSelect: false,
                                    }],
                                },
                            },
                        },
                    }, {
                        facts: [
                            {
                                goalId: current.id,
                                runId: current.state.run.id,
                                phase: "executing",
                                eventType: "decision_received",
                                payload: {
                                    type: "decision_received",
                                    decision: {
                                        kind: "ask_user",
                                        questions: [{
                                            header: "信息",
                                            question: "需要什么信息？",
                                            options: [{ label: "继续" }, { label: "停止" }],
                                            multiSelect: false,
                                        }],
                                    },
                                },
                            },
                            {
                                goalId: current.id,
                                runId: current.state.run.id,
                                phase: "executing",
                                eventType: "run_waiting",
                                payload: {
                                    type: "run_waiting",
                                    reason: "ask_user",
                                },
                            },
                        ],
                    });
                }
                const saved = await store.restore(ref.goalId);
                if (saved === undefined) throw new Error("Goal disappeared during test scheduling");
                return { ok: true, state: saved.state.run };
            },
        },
    });

    const result = await coordinator.advance({
        goalId: goal.id,
        runId: goal.state.run.id,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(sink.events.map((event) => event.eventType), [
        "decision_received",
        "run_waiting",
        "state_committed",
    ]);
    assert.equal(
        (await store.restore(goal.id))?.state.run.committedThroughSequence,
        sink.events[1]?.sequence,
    );
});
