import assert from "node:assert/strict";
import { test } from "node:test";

import {
    EvidenceGateError,
    WorkingMemoryRecoveryError,
    WorkingMemorySession,
    WorkingMemorySessionClosedError,
    allocateImmutableEvent,
    createCanonicalFactId,
    createGoal,
    computeContentHash,
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

function preparationEvents(options: {
    readonly messageIndex?: number;
    readonly content?: string;
    readonly acceptedEvidenceSequence?: number;
    readonly acceptedPhase?: "gathering_context" | "executing";
} = {}): TrajectoryEvent[] {
    const messageIndex = options.messageIndex ?? 0;
    const content = options.content ?? "Restore structured Memory";
    const preparationInput = allocateImmutableEvent({
        goalId: "goal-session",
        runId: "run-session",
        phase: "gathering_context",
        eventType: "preparation_input_recorded",
        payload: {
            type: "preparation_input_recorded",
            messageIndex,
            contentHash: computeContentHash(content),
        },
    }, 1, "preparation-input-1");
    const factId = createCanonicalFactId("user", "requested_format");
    const accepted = allocateImmutableEvent({
        goalId: "goal-session",
        runId: "run-session",
        phase: options.acceptedPhase ?? "gathering_context",
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
                    subject: "user",
                    predicate: "requested_format",
                    value: "json",
                    stability: "stable",
                    evidenceSequences: [options.acceptedEvidenceSequence ?? 1],
                    reinforcementCount: 1,
                    lastEvidenceSequence: options.acceptedEvidenceSequence ?? 1,
                    source: "model",
                    originPhase: options.acceptedPhase ?? "gathering_context",
                    originSequence: 2,
                    updatedAtSequence: 2,
                    scope: "goal",
                },
            }],
        },
    }, 2, "preparation-patch-2");
    return [preparationInput, accepted];
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

test("rebuild follows the accepted Patch revision parent chain", async () => {
    const parent = events();
    const child = allocateImmutableEvent({
        goalId: "goal-session",
        runId: "run-session",
        phase: "executing",
        eventType: "memory_patch_accepted",
        parentEventId: "patch-2",
        payload: {
            type: "memory_patch_accepted",
            protocolVersion: 1,
            producers: ["model"],
            parentRevisionEventId: "patch-2",
            operations: [{
                type: "upsert_hypothesis",
                hypothesis: {
                    kind: "hypothesis",
                    id: "hypothesis:3:0",
                    statement: "Needs another check",
                    status: "active",
                    originPhase: "executing",
                    originSequence: 3,
                    updatedAtSequence: 3,
                    scope: "phase",
                },
            }],
        },
    }, 3, "patch-3");
    const restored = await rebuildWorkingMemory(
        structuredGoal(3, { eventId: "patch-3", sequence: 3 }),
        { trajectoryStore: new MemoryTrajectoryStore([...parent, child]) },
    );
    assert.equal(restored.revision?.eventId, "patch-3");
    assert.equal(restored.memory.facts.length, 1);
    assert.equal(restored.memory.hypotheses.length, 1);
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
    assert.throws(() => session.preparationInputEvidence, WorkingMemorySessionClosedError);
});

test("Session restores committed Preparation provenance and isolates its getter", async () => {
    const session = await WorkingMemorySession.restore(
        structuredGoal(2, { eventId: "preparation-patch-2", sequence: 2 }),
        { trajectoryStore: new MemoryTrajectoryStore(preparationEvents()) },
    );
    assert.deepEqual(session.preparationInputEvidence, [{
        sequence: 1,
        messageIndex: 0,
        contentHash: computeContentHash("Restore structured Memory"),
    }]);
    const exposed = session.preparationInputEvidence as Array<{
        sequence: number;
        messageIndex: number;
        contentHash: string;
    }>;
    exposed[0]!.messageIndex = 99;
    assert.equal(session.preparationInputEvidence[0]?.messageIndex, 0);
});

test("Session excludes Preparation provenance from the uncommitted tail", async () => {
    const committed = preparationEvents();
    const tail = allocateImmutableEvent({
        goalId: "goal-session",
        runId: "run-session",
        phase: "planning",
        eventType: "preparation_input_recorded",
        payload: {
            type: "preparation_input_recorded",
            messageIndex: 0,
            contentHash: computeContentHash("Restore structured Memory"),
        },
    }, 3, "preparation-input-tail");
    const session = await WorkingMemorySession.restore(
        structuredGoal(2, { eventId: "preparation-patch-2", sequence: 2 }),
        { trajectoryStore: new MemoryTrajectoryStore([...committed, tail]) },
    );
    assert.deepEqual(session.preparationInputEvidence.map((item) => item.sequence), [1]);
});

test("Session applies execution scope to accepted Patches in the executing phase", async () => {
    await assert.rejects(
        rebuildWorkingMemory(
            structuredGoal(2, { eventId: "preparation-patch-2", sequence: 2 }),
            {
                trajectoryStore: new MemoryTrajectoryStore(
                    preparationEvents({ acceptedPhase: "executing" }),
                ),
            },
        ),
        (error: unknown) => error instanceof WorkingMemoryRecoveryError
            && error.cause instanceof EvidenceGateError
            && /preparation input provenance is not allowed in execution scope/.test(error.cause.message),
    );
});

test("Session fails closed for invalid committed Preparation provenance", async () => {
    const cases: readonly { readonly name: string; readonly goal: Goal; readonly events: TrajectoryEvent[]; readonly message: RegExp }[] = [
        {
            name: "missing message",
            goal: structuredGoal(1),
            events: [preparationEvents({ messageIndex: 9 })[0]!],
            message: /messageIndex 9 is missing/,
        },
        {
            name: "assistant message",
            goal: {
                ...structuredGoal(1),
                state: {
                    ...structuredGoal(1).state,
                    messages: [{
                        role: "assistant",
                        assistant: { profileId: "session-profile" },
                        content: "Restore structured Memory",
                    }],
                },
            },
            events: [preparationEvents()[0]!],
            message: /is not a user message/,
        },
        {
            name: "hash mismatch",
            goal: structuredGoal(1),
            events: [preparationEvents({ content: "other content" })[0]!],
            message: /hash does not match/,
        },
    ];
    for (const candidate of cases) {
        await assert.rejects(
            rebuildWorkingMemory(candidate.goal, {
                trajectoryStore: new MemoryTrajectoryStore(candidate.events),
            }),
            (error: unknown) => error instanceof WorkingMemoryRecoveryError
                && candidate.message.test(error.message),
            candidate.name,
        );
    }
});
