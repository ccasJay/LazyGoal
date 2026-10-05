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
    Goal,
    StepExecutionInput,
    StepExecutor,
    Tool,
    ToolRegistry,
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
    async reviewCompletion() { return { kind: "accept" as const }; }
    readonly inputs: StepExecutionInput[] = [];
    private index = 0;

    constructor(private readonly decisions: readonly AgentDecision[]) {}

    async decide(input: StepExecutionInput): Promise<{ kind: "decision"; decision: AgentDecision }> {
        this.inputs.push(structuredClone(input));
        const decision = this.decisions[this.index++];
        if (decision === undefined) throw new Error("unexpected executor call");
        return { kind: "decision", decision: structuredClone(decision) };
    }

    async think(): Promise<never> {
        throw new Error("think not supported in test");
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
            },
            run: {
                ...goal.state.run,
                status: "running",
                committedThroughSequence: 0,

                mode: "plan", approvedTask: {
                    objective: "Read a file",
                    completionCriteria: [{ text: "A Tool observation confirms the read" }],
                },
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
            isReadOnly: true,
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
                type: "upsert_fact",
                fact: {
                    subject: "workspace",
                    predicate: "read_started",
                    value: true,
                    stability: "last_observed",
                    evidenceSequences: [5],
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
