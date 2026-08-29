import assert from "node:assert/strict";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    createGoal,
    WorkingMemoryRecoveryError,
    WorkingMemorySession,
    WorkingMemorySessionClosedError,
    WorkingMemoryTrajectoryRequiredError,
    rebuildWorkingMemory,
} from "../src/index";
import type {
    AgentProfile,
    Goal,
    TrajectoryEvent,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../src/index";

const profile: AgentProfile = {
    id: "session-profile",
    systemPrompt: "You are a recovery test agent.",
    instructions: [],
    toolIds: [],
};

function structuredGoal(
    runId = "run-session",
    committedThroughSequence = 0,
    memoryRevision?: { readonly eventId: string; readonly sequence: number },
): Goal {
    const goal = createGoal({
        id: "goal-session",
        intent: "恢复结构化 Memory",
        promptBundleVersion: 4,
        memoryProtocol: { kind: "structured", version: 1 },
        profile,
        runId,
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                committedThroughSequence,
                ...(memoryRevision === undefined ? {} : { memoryRevision }),
            },
        },
    };
}

class MemoryTrajectoryStore implements TrajectoryStore {
    constructor(readonly events: readonly TrajectoryEvent[]) {}

    async append(): Promise<Readonly<TrajectoryEvent>> {
        throw new Error("append is not used by the recovery tests");
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence)
        );
    }

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        return classifyTrajectoryTail(
            await this.read(query),
            committedThroughSequence,
        );
    }
}

function observation(
    goalId: string,
    runId: string,
    sequence: number,
    eventId: string,
): Readonly<TrajectoryEvent> {
    return allocateImmutableEvent({
        goalId,
        runId,
        phase: "executing",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: `action-${sequence}`,
            observation: {
                kind: "success",
                output: { sequence },
                summary: `observation-${sequence}`,
            },
        },
    }, sequence, eventId);
}

function patchEvent(input: {
    readonly goalId: string;
    readonly runId: string;
    readonly sequence: number;
    readonly eventId: string;
    readonly parentRevisionEventId?: string;
    readonly operation: {
        readonly type: "add_finding" | "update_finding";
        readonly finding: {
            readonly kind: "finding";
            readonly id: string;
            readonly originPhase: "executing";
            readonly originSequence: number;
            readonly scope: "goal";
            readonly status: "active";
            readonly statement: string;
            readonly evidenceSequences: readonly number[];
        };
    };
}): Readonly<TrajectoryEvent> {
    return allocateImmutableEvent({
        goalId: input.goalId,
        runId: input.runId,
        phase: "executing",
        ...(input.parentRevisionEventId === undefined
            ? {}
            : { parentEventId: input.parentRevisionEventId }),
        eventType: "memory_patch_accepted",
        payload: {
            type: "memory_patch_accepted",
            protocolVersion: 1,
            producers: ["model"],
            ...(input.parentRevisionEventId === undefined
                ? {}
                : { parentRevisionEventId: input.parentRevisionEventId }),
            operations: [input.operation],
        },
    }, input.sequence, input.eventId);
}

function assertRecovery(error: unknown): boolean {
    assert.ok(error instanceof WorkingMemoryRecoveryError);
    assert.equal(error.code, "WORKING_MEMORY_RECOVERY_ERROR");
    return true;
}

test("WorkingMemorySession rebuilds only the selected committed revision chain", async () => {
    const goalId = "goal-session";
    const runId = "run-session";
    const first = patchEvent({
        goalId,
        runId,
        sequence: 2,
        eventId: "patch-2",
        operation: {
            type: "add_finding",
            finding: {
                kind: "finding",
                id: "finding-1",
                originPhase: "executing",
                originSequence: 2,
                scope: "goal",
                status: "active",
                statement: "初始事实",
                evidenceSequences: [1],
            },
        },
    });
    const second = patchEvent({
        goalId,
        runId,
        sequence: 4,
        eventId: "patch-4",
        parentRevisionEventId: first.eventId,
        operation: {
            type: "update_finding",
            finding: {
                kind: "finding",
                id: "finding-1",
                originPhase: "executing",
                originSequence: 4,
                scope: "goal",
                status: "active",
                statement: "更新事实",
                evidenceSequences: [3],
            },
        },
    });
    const tail = patchEvent({
        goalId,
        runId,
        sequence: 5,
        eventId: "patch-tail",
        parentRevisionEventId: second.eventId,
        operation: {
            type: "update_finding",
            finding: {
                kind: "finding",
                id: "finding-1",
                originPhase: "executing",
                originSequence: 5,
                scope: "goal",
                status: "active",
                statement: "未提交更新",
                evidenceSequences: [3],
            },
        },
    });
    const events = [
        observation(goalId, runId, 1, "observation-1"),
        first,
        observation(goalId, runId, 3, "observation-3"),
        second,
        tail,
    ];
    const goal = structuredGoal(runId, 4, { eventId: second.eventId, sequence: 4 });
    const store = new MemoryTrajectoryStore(events);

    const firstRestore = await rebuildWorkingMemory(goal, { trajectoryStore: store });
    const secondRestore = await rebuildWorkingMemory(goal, { trajectoryStore: store });

    assert.deepEqual(firstRestore, secondRestore);
    assert.equal(firstRestore.memory.derivedThroughSequence, 4);
    assert.deepEqual(firstRestore.memory.revision, {
        eventId: "patch-4",
        sequence: 4,
    });
    assert.equal(firstRestore.memory.findings[0]?.statement, "更新事实");
    assert.equal(firstRestore.memory.findings[0]?.evidenceSequences[0], 3);
    assert.equal(firstRestore.memory.findings.some((finding) => finding.statement === "未提交更新"), false);
});

test("WorkingMemorySession supports genesis, no-patch boundary, and process-local disposal", async () => {
    const genesisGoal = structuredGoal("run-genesis", 0);
    const empty = await WorkingMemorySession.restore(
        genesisGoal,
        { trajectoryStore: new MemoryTrajectoryStore([]) },
    );
    assert.equal(empty.workingMemory.derivedThroughSequence, 0);
    assert.equal(empty.workingMemory.revision, undefined);

    const boundaryGoal = structuredGoal("run-boundary", 2);
    const boundaryEvents = [
        observation("goal-session", "run-boundary", 1, "boundary-observation"),
        allocateImmutableEvent({
            goalId: "goal-session",
            runId: "run-boundary",
            phase: "executing",
            eventType: "state_committed",
            payload: { type: "state_committed", committedThroughSequence: 2 },
        }, 2, "boundary-marker"),
    ];
    const boundary = await rebuildWorkingMemory(boundaryGoal, {
        trajectoryStore: new MemoryTrajectoryStore(boundaryEvents),
    });
    assert.equal(boundary.memory.derivedThroughSequence, 2);

    empty.close();
    assert.throws(() => empty.workingMemory, WorkingMemorySessionClosedError);
});

test("structured recovery fails closed for missing dependencies and corrupt revision chains", async () => {
    await assert.rejects(
        rebuildWorkingMemory(structuredGoal("run-missing-store", 0), {}),
        (error: unknown) => error instanceof WorkingMemoryTrajectoryRequiredError,
    );
    await assert.rejects(
        rebuildWorkingMemory(
            (() => {
                const goal = structuredGoal("run-missing-boundary");
                const { committedThroughSequence: _boundary, ...run } = goal.state.run;
                return {
                    ...goal,
                    state: { ...goal.state, run },
                };
            })(),
            {
            trajectoryStore: new MemoryTrajectoryStore([]),
            },
        ),
        (error: unknown) => error instanceof WorkingMemoryTrajectoryRequiredError,
    );

    const head = patchEvent({
        goalId: "goal-session",
        runId: "run-corrupt",
        sequence: 2,
        eventId: "corrupt-head",
        parentRevisionEventId: "missing-parent",
        operation: {
            type: "add_finding",
            finding: {
                kind: "finding",
                id: "finding-corrupt",
                originPhase: "executing",
                originSequence: 2,
                scope: "goal",
                status: "active",
                statement: "损坏链",
                evidenceSequences: [1],
            },
        },
    });
    await assert.rejects(
        rebuildWorkingMemory(
            structuredGoal("run-corrupt", 2, { eventId: head.eventId, sequence: 2 }),
            {
                trajectoryStore: new MemoryTrajectoryStore([
                    observation("goal-session", "run-corrupt", 1, "corrupt-observation"),
                    head,
                ]),
            },
        ),
        assertRecovery,
    );

    const cycleA = patchEvent({
        goalId: "goal-session",
        runId: "run-cycle",
        sequence: 2,
        eventId: "cycle-a",
        parentRevisionEventId: "cycle-b",
        operation: {
            type: "add_finding",
            finding: {
                kind: "finding",
                id: "finding-cycle-a",
                originPhase: "executing",
                originSequence: 2,
                scope: "goal",
                status: "active",
                statement: "循环 A",
                evidenceSequences: [1],
            },
        },
    });
    const cycleB = patchEvent({
        goalId: "goal-session",
        runId: "run-cycle",
        sequence: 3,
        eventId: "cycle-b",
        parentRevisionEventId: cycleA.eventId,
        operation: {
            type: "add_finding",
            finding: {
                kind: "finding",
                id: "finding-cycle-b",
                originPhase: "executing",
                originSequence: 3,
                scope: "goal",
                status: "active",
                statement: "循环 B",
                evidenceSequences: [1],
            },
        },
    });
    await assert.rejects(
        rebuildWorkingMemory(
            structuredGoal("run-cycle", 3, { eventId: cycleB.eventId, sequence: 3 }),
            {
                trajectoryStore: new MemoryTrajectoryStore([
                    observation("goal-session", "run-cycle", 1, "cycle-observation"),
                    cycleA,
                    cycleB,
                ]),
            },
        ),
        assertRecovery,
    );
});

test("recovery rejects a committed Patch without a revision and cross-Run events", async () => {
    const patch = patchEvent({
        goalId: "goal-session",
        runId: "run-no-revision",
        sequence: 2,
        eventId: "patch-without-revision",
        operation: {
            type: "add_finding",
            finding: {
                kind: "finding",
                id: "finding-no-revision",
                originPhase: "executing",
                originSequence: 2,
                scope: "goal",
                status: "active",
                statement: "没有 revision",
                evidenceSequences: [1],
            },
        },
    });
    await assert.rejects(
        rebuildWorkingMemory(structuredGoal("run-no-revision", 2), {
            trajectoryStore: new MemoryTrajectoryStore([
                observation("goal-session", "run-no-revision", 1, "no-revision-observation"),
                patch,
            ]),
        }),
        assertRecovery,
    );

    const crossRun = observation("goal-session", "other-run", 1, "other-run-event");
    await assert.rejects(
        rebuildWorkingMemory(structuredGoal("run-cross", 1), {
            trajectoryStore: new MemoryTrajectoryStore([crossRun]),
        }),
        assertRecovery,
    );
});
