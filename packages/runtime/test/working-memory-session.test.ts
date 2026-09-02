import assert from "node:assert/strict";
import { test } from "node:test";

import {
    WorkingMemoryRecoveryError,
    WorkingMemorySession,
    WorkingMemorySessionClosedError,
    allocateImmutableEvent,
    createCanonicalFactId,
    createGoal,
    rebuildWorkingMemory,
} from "../src/index";
import type {
    AgentProfile,
    Goal,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryStore,
} from "../src/index";
import { currentProtocols } from "./current-fixtures";

const profile: AgentProfile = {
    id: "session-profile",
    systemPrompt: "You are a recovery test agent.",
    instructions: [],
    toolIds: [],
};

function structuredGoal(
    boundary: number,
    revision?: { readonly eventId: string; readonly sequence: number },
    promptBundleVersion: 1 = 1,
): Goal {
    const goal = createGoal({
        ...currentProtocols,
        id: "goal-session",
        intent: "Restore structured Memory",
        promptBundleVersion,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile,
        runId: "run-session",
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                committedThroughSequence: boundary,
                ...(revision === undefined ? {} : { memoryRevision: revision }),
            },
        },
    };
}

class MemoryTrajectoryStore implements TrajectoryStore {
    constructor(readonly events: TrajectoryEvent[]) {}

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        const event = allocateImmutableEvent(draft, this.events.length + 1);
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

    async readWithBoundary(query: TrajectoryReadQuery, boundary: number) {
        const events = await this.read(query);
        return {
            committed: events.filter((event) => event.sequence <= boundary),
            uncommittedTail: events.filter((event) => event.sequence > boundary),
        };
    }
}

function events(): TrajectoryEvent[] {
    const observation = allocateImmutableEvent({
        goalId: "goal-session",
        runId: "run-session",
        phase: "executing",
        actionId: "action-1",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: "action-1",
            observation: { kind: "success", output: { location: "dresser-2" }, summary: "found" },
        },
    }, 1, "observation-1");
    const factId = createCanonicalFactId("object:watch-1", "location");
    const accepted = allocateImmutableEvent({
        goalId: "goal-session",
        runId: "run-session",
        phase: "executing",
        eventType: "memory_patch_accepted",
        payload: {
            type: "memory_patch_accepted",
            protocolVersion: 1,
            producers: ["model"],
            operations: [{
                type: "upsert_fact",
                fact: {
                    kind: "fact",
                    id: factId,
                    subject: "object:watch-1",
                    predicate: "location",
                    value: "dresser-2",
                    stability: "last_observed",
                    evidenceSequences: [1],
                    reinforcementCount: 1,
                    lastEvidenceSequence: 1,
                    source: "model",
                    originPhase: "executing",
                    originSequence: 2,
                    updatedAtSequence: 2,
                    scope: "goal",
                },
            }],
        },
    }, 2, "patch-2");
    return [observation, accepted];
}

test("rebuild follows the selected revision and reproduces canonical Fact", async () => {
    const restored = await rebuildWorkingMemory(
        structuredGoal(2, { eventId: "patch-2", sequence: 2 }),
        { trajectoryStore: new MemoryTrajectoryStore(events()) },
    );
    assert.equal(restored.memory.facts.length, 1);
    assert.equal(restored.memory.facts[0]?.value, "dresser-2");
    assert.equal(restored.memory.derivedThroughSequence, 2);
    assert.equal(restored.revision?.eventId, "patch-2");
});

test("orphan revision fails closed", async () => {
    await assert.rejects(
        rebuildWorkingMemory(
            structuredGoal(2, { eventId: "missing", sequence: 2 }),
            { trajectoryStore: new MemoryTrajectoryStore(events()) },
        ),
        WorkingMemoryRecoveryError,
    );
});

test("WorkingMemorySession discards its in-process projection on close", async () => {
    const session = await WorkingMemorySession.restore(
        structuredGoal(2, { eventId: "patch-2", sequence: 2 }),
        { trajectoryStore: new MemoryTrajectoryStore(events()) },
    );
    assert.equal(session.workingMemory.facts.length, 1);
    session.close();
    assert.throws(() => session.workingMemory, WorkingMemorySessionClosedError);
});
