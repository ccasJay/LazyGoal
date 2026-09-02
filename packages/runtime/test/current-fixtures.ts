import type {
    ContextRetrievalProtocol,
    MemoryProtocol,
    ModelContextProtocol,
} from "../src/domain";
import {
    allocateImmutableEvent,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryStore,
} from "../src/trajectory";

/** Tests use the same protocol tuple that production Goal creation accepts. */
export const currentProtocols: {
    readonly memoryProtocol: MemoryProtocol;
    readonly modelContextProtocol: ModelContextProtocol;
    readonly contextRetrievalProtocol: ContextRetrievalProtocol;
} = {
    memoryProtocol: { kind: "structured", version: 1 },
    modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
};

/** Minimal in-memory Trajectory port for Runtime tests without domain events. */
export class InMemoryTrajectoryStore implements TrajectoryStore {
    readonly events: TrajectoryEvent[] = [];

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        const event = allocateImmutableEvent(
            draft,
            this.events.length === 0 ? 1 : this.events[this.events.length - 1]!.sequence + 1,
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
    ): Promise<{
        readonly committed: readonly TrajectoryEvent[];
        readonly uncommittedTail: readonly TrajectoryEvent[];
    }> {
        const events = await this.read(query);
        return {
            committed: events.filter((event) => event.sequence <= committedThroughSequence),
            uncommittedTail: events.filter((event) => event.sequence > committedThroughSequence),
        };
    }
}

const trajectoryStoresByGoalStore = new WeakMap<object, InMemoryTrajectoryStore>();

/** Reuses one in-memory Trajectory for all Runner instances sharing a GoalStore. */
export function trajectoryStoreFor(goalStore: object): InMemoryTrajectoryStore {
    const existing = trajectoryStoresByGoalStore.get(goalStore);

    if (existing !== undefined) {
        return existing;
    }

    const created = new InMemoryTrajectoryStore();
    trajectoryStoresByGoalStore.set(goalStore, created);
    return created;
}
