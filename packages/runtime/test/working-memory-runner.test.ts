import assert from "node:assert/strict";
import { test } from "node:test";

import {
    Runner,
    allocateImmutableEvent,
    classifyTrajectoryTail,
    createGoal,
    createToolRegistration,
    rebuildWorkingMemory,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { contract } from "../../contracts/src/index";
import { currentProtocols } from "./current-fixtures";
import type {
    AgentDecision,
    AgentProfile,
    DiagnosticTraceSink,
    Goal,
    StepExecutionInput,
    StepExecutor,
    Tool,
    ToolMemoryProjector,
    ToolRegistry,
    TraceRecord,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../src/index";

const profile: AgentProfile = {
    id: "memory-runner-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: ["read_file"],
};

const TEST_INPUT_CONTRACT = contract.record(contract.string());

class MemoryTrajectoryStore implements TrajectoryStore {
    readonly events: TrajectoryEvent[] = [];

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        const event = allocateImmutableEvent(
            draft,
            (this.events.at(-1)?.sequence ?? 0) + 1,
            `memory-runner-event-${this.events.length + 1}`,
        );
        this.events.push(event);
        return event;
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence));
    }

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        return classifyTrajectoryTail(await this.read(query), committedThroughSequence);
    }
}

class RecordingStepExecutor implements StepExecutor {
    readonly inputs: StepExecutionInput[] = [];
    private index = 0;

    constructor(private readonly decisions: readonly AgentDecision[]) {}

    async execute(input: StepExecutionInput): Promise<AgentDecision> {
        this.inputs.push(structuredClone(input));
        const decision = this.decisions[this.index++];
        if (decision === undefined) throw new Error("unexpected executor call");
        return structuredClone(decision);
    }
}

function executingGoal(id: string): Goal {
    const goal = createGoal({
        ...currentProtocols,
        id,
        runId: `${id}-run`,
        intent: "Project Tool observation",
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
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: "Read a file",
                    completionCriteria: ["A Tool observation confirms the read"],
                },
            },
            run: {
                ...goal.state.run,
                status: "running",
                committedThroughSequence: 0,
            },
        },
    };
}

function tool(): Tool<typeof TEST_INPUT_CONTRACT> {
    return {
        definition: {
            id: "read_file",
            description: "read",
            inputContract: TEST_INPUT_CONTRACT,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute: async () => ({
            kind: "success",
            output: { path: "README.md", content: "ok" },
            summary: "read complete",
        }),
    };
}

function action(): Extract<AgentDecision, { kind: "tool_call" }> {
    return {
        kind: "tool_call",
        action: {
            actionId: "read-1",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    };
}

function complete(): Extract<AgentDecision, { kind: "complete" }> {
    return {
        kind: "complete",
        summary: "read complete",
        completionEvidence: [{ criterionIndex: 0, evidenceSequences: [5] }],
    };
}

function registry(): ToolRegistry {
    const implementation = tool();
    const registration = createToolRegistration(implementation);
    return { get: (id) => id === "read_file" ? registration : undefined };
}

test("Fake Projector commits Observation and Runtime Patch in one Snapshot boundary", async () => {
    const goal = executingGoal("projector-success");
    const store = new InMemoryGoalStore();
    const trajectory = new MemoryTrajectoryStore();
    await store.save(goal);
    const projector: ToolMemoryProjector = {
        project: ({ observationSequence }) => ({
            status: "changed",
            facts: [{
                subject: "workspace:README.md",
                predicate: "read_success",
                value: true,
                stability: "last_observed",
                evidenceSequences: [observationSequence],
            }],
        }),
    };
    const executor = new RecordingStepExecutor([action(), complete()]);
    const runner = new Runner({
        store,
        executor,
        toolRegistry: registry(),
        trajectoryStore: trajectory,
        toolMemoryProjectors: { get: (id) => id === "read_file" ? projector : undefined },
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(executor.inputs[1]?.workingMemory?.facts[0]?.predicate, "read_success");

    const observation = trajectory.events.find((event) => event.eventType === "observation_recorded");
    const patchEvent = trajectory.events.find((event) =>
        event.eventType === "memory_patch_accepted"
        && event.payload.producers.includes("tool_projector"));
    assert.equal(observation?.sequence, 6);
    assert.equal(patchEvent?.sequence, 7);

    const saved = await store.restore(goal.id);
    assert.ok(saved);
    const rebuilt = await rebuildWorkingMemory(saved, { trajectoryStore: trajectory });
    assert.equal(rebuilt.memory.facts[0]?.lastEvidenceSequence, 5);
});

test("Projector exception records Diagnostic while Observation still commits", async () => {
    const goal = executingGoal("projector-failure");
    const store = new InMemoryGoalStore();
    const trajectory = new MemoryTrajectoryStore();
    const traces: TraceRecord[] = [];
    const traceSink: DiagnosticTraceSink = {
        append: async (record) => {
            traces.push(structuredClone(record));
        },
    };
    await store.save(goal);
    const projector: ToolMemoryProjector = {
        project: () => {
            throw new Error("projection failed");
        },
    };
    const executor = new RecordingStepExecutor([action(), complete()]);
    const runner = new Runner({
        store,
        executor,
        toolRegistry: registry(),
        trajectoryStore: trajectory,
        traceSink,
        toolMemoryProjectors: { get: () => projector },
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(executor.inputs[1]?.workingMemory?.facts.length, 0);
    assert.equal(trajectory.events.some((event) => event.eventType === "observation_recorded"), true);
    assert.equal(traces.some((record) => record.kind === "tool_memory_projector_failed"), true);
});

test("Projector no_op does not create an accepted Memory Patch", async () => {
    const goal = executingGoal("projector-no-op");
    const store = new InMemoryGoalStore();
    const trajectory = new MemoryTrajectoryStore();
    await store.save(goal);
    const executor = new RecordingStepExecutor([action(), complete()]);
    const runner = new Runner({
        store,
        executor,
        toolRegistry: registry(),
        trajectoryStore: trajectory,
        toolMemoryProjectors: {
            get: () => ({ project: () => ({ status: "no_op" }) }),
        },
    });
    await runner.run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(
        trajectory.events.some((event) =>
            event.eventType === "memory_patch_accepted"
            && event.payload.producers.includes("tool_projector")),
        false,
    );
});

test("Runtime failure commits terminal phase cleanup with the failure boundary", async () => {
    const goal = executingGoal("runtime-failure-cleanup");
    const store = new InMemoryGoalStore();
    const trajectory = new MemoryTrajectoryStore();
    await store.save(goal);
    const actionWithPlan: AgentDecision = {
        ...action(),
        memoryPatch: {
            protocolVersion: 1,
            operations: [{
                type: "create_plan_item",
                planItem: {
                    description: "Keep reading files",
                    status: "active",
                },
            }],
        },
    };
    const invalidAction: AgentDecision = {
        kind: "tool_call",
        action: {
            actionId: "missing-1",
            toolId: "missing_tool",
            input: {},
        },
    };
    const runner = new Runner({
        store,
        executor: new RecordingStepExecutor([actionWithPlan, invalidAction]),
        toolRegistry: registry(),
        trajectoryStore: trajectory,
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");

    const saved = await store.restore(goal.id);
    assert.ok(saved);
    const rebuilt = await rebuildWorkingMemory(saved, { trajectoryStore: trajectory });
    assert.deepEqual(rebuilt.memory.plan, []);
    assert.equal(
        trajectory.events.some((event) =>
            event.eventType === "memory_patch_accepted"
            && event.payload.producers.includes("runtime_lifecycle")
            && event.payload.operations.some((operation) =>
                operation.type === "supersede_scope"
                && operation.phase === "executing")),
        true,
    );
});
