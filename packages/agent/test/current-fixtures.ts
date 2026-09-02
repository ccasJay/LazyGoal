import type { Goal, WorkingMemory } from "../../runtime/src/domain";
import { allocateImmutableEvent } from "../../runtime/src/trajectory";
import type {
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryStore,
} from "../../runtime/src/trajectory";
import {
    createDefaultModelContextBudgetPolicy,
    TrajectoryModelContextAssembler,
} from "../src/index";

export const currentProtocols = {
    memoryProtocol: { kind: "structured" as const, version: 1 as const },
    modelContextProtocol: { kind: "trajectory-layered" as const, version: 1 as const },
    contextRetrievalProtocol: { kind: "bm25-lite" as const, version: 1 as const },
};

export const currentWorkingMemory: WorkingMemory = {
    protocolVersion: 1,
    derivedThroughSequence: 0,
    facts: [],
    hypotheses: [],
    plan: [],
    blockers: [],
};

export const currentContextEpoch = {
    protocolVersion: 1 as const,
    epochNumber: 0,
    conversationStartIndex: 0,
    openedAtSequence: 0,
    control: {
        status: "active" as const,
        inputTokens: 0,
        hardInputLimit: 0,
        remainingTokens: 0,
    },
};

export function createEmptyTrajectoryStore(): TrajectoryStore {
    return {
        async append() {
            throw new Error("test trajectory store does not append");
        },
        async read() {
            return [];
        },
        async readWithBoundary() {
            return { committed: [], uncommittedTail: [] };
        },
    } as TrajectoryStore;
}

export function createInMemoryTrajectoryStore(): TrajectoryStore {
    const events: TrajectoryEvent[] = [];

    return {
        async append(draft: TrajectoryEventDraft) {
            const event = allocateImmutableEvent(
                draft,
                events.length === 0
                    ? 1
                    : events[events.length - 1]!.sequence + 1,
            );
            events.push(event);
            return event;
        },
        async read(query) {
            return events.filter((event) =>
                event.goalId === query.goalId
                && event.runId === query.runId
                && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
                && (query.toSequence === undefined || event.sequence <= query.toSequence),
            );
        },
        async readWithBoundary(query, boundary) {
            const selected = await this.read(query);
            return {
                committed: selected.filter((event) => event.sequence <= boundary),
                uncommittedTail: selected.filter((event) => event.sequence > boundary),
            };
        },
    };
}

export function createCurrentContextAssembler(): TrajectoryModelContextAssembler {
    return new TrajectoryModelContextAssembler({
        trajectoryStore: createEmptyTrajectoryStore(),
        policy: createDefaultModelContextBudgetPolicy(),
    });
}

export function currentGoalDefinition(
    goal: Goal,
): Goal["definition"] {
    return goal.definition;
}
