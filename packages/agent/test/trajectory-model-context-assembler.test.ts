import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createModelContextBudgetPolicy,
    ModelContextHardOverflowError,
    ModelContextSourceError,
    ModelInferenceProjector,
    TrajectoryModelContextAssembler,
} from "../src/index";
import type {
    ModelInferenceView,
} from "../src/index";
import type {
    AgentProfile,
    Goal,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../../runtime/src/index";
import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    createGoal,
    createEmptyWorkingMemory,
} from "../../runtime/src/index";
import {
    computeTrajectorySourceDigest,
    JsonFileWarmContextSidecarStore,
} from "../../storage/src/index";
import { currentProtocols } from "./current-fixtures";

const profile: AgentProfile = {
    id: "assembler-profile",
    systemPrompt: "system",
    instructions: [],
    toolIds: [],
};

class MemoryTrajectoryStore implements TrajectoryStore {
    readonly reads: TrajectoryReadQuery[] = [];

    constructor(readonly events: readonly TrajectoryEvent[]) {}

    async append(): Promise<Readonly<TrajectoryEvent>> {
        throw new Error("append is not used by Context Assembler");
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        this.reads.push(query);
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
        return classifyTrajectoryTail(
            await this.read(query),
            committedThroughSequence,
        );
    }
}

const fixedSizeEstimator = {
    unit: "character" as const,
    estimate(value: unknown): number {
        if (
            typeof value === "object"
            && value !== null
            && "executionUnitId" in value
        ) {
            return 3;
        }
        if (
            typeof value === "object"
            && value !== null
            && "id" in value
            && "summary" in value
        ) {
            return 2;
        }
        return 10;
    },
};

const policy = createModelContextBudgetPolicy({
    modelInputBudget: 100,
    responseReserve: 10,
    warmShare: 0.5,
}, fixedSizeEstimator);

test("Assembler 从 committed Trajectory 选择完整 Hot，并恢复有效 Sidecar Warm", async () => {
    const events = [
        completeEvent(1, "unit-1", "first"),
        terminalEvent(2, "unit-1", "first"),
        completeEvent(3, "unit-2", "second"),
        terminalEvent(4, "unit-2", "second"),
        completeEvent(5, "tail", "uncommitted"),
    ];
    const trajectoryStore = new MemoryTrajectoryStore(events);
    const sidecarEntry = {
        id: "finding-1",
        kind: "finding" as const,
        summary: "first was checked",
        status: "active" as const,
        lossy: true as const,
        evidenceSequences: [2],
        firstSequence: 2,
        lastSequence: 2,
        lastAccessedSequence: 2,
        reinforcementCount: 1,
        sourceHash: "sha256:finding-1",
    };
    const committed = events.slice(0, 4);
    const sidecar = {
        schemaVersion: 1 as const,
        goalId: "goal-layered",
        runId: "run-layered",
        derivedThroughSequence: 2,
        sourceDigest: computeTrajectorySourceDigest(committed, 2),
        compactorVersion: "deterministic-warm-v1",
        entries: [sidecarEntry],
    };
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore,
        sidecarStore: {
            async restore() {
                return sidecar;
            },
            async save() {},
            async remove() {},
        },
        policy,
    });
    const goal = layeredExecutingGoal(4);
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );

    const assembled = await assembler.assemble({ goal, view });

    assert.deepEqual(
        assembled.trajectoryContext?.hot.map((unit) => unit.executionUnitId),
        ["unit-1", "unit-2"],
    );
    assert.deepEqual(
        assembled.trajectoryContext?.hot.flatMap((unit) =>
            unit.events.map((event) => event.sequence),
        ),
        [1, 2, 3, 4],
    );
    assert.deepEqual(assembled.trajectoryContext?.warm.map((entry) => entry.id), ["finding-1"]);
    assert.equal(assembled.trajectoryContext?.budget.measuredAs, "character");
    assert.equal(trajectoryStore.reads.length, 1);
    assert.equal(Object.isFrozen(assembled.trajectoryContext), true);
    assert.equal(Object.isFrozen(assembled.trajectoryContext?.hot), true);
    assert.equal(Object.isFrozen(assembled.trajectoryContext?.warm), true);
    assert.equal(events[4]?.sequence, 5);
});

test("Assembler 在 Sidecar 摘要失配时回退为空 Warm，不改写来源", async () => {
    const events = [completeEvent(1, "unit-1", "first"), terminalEvent(2, "unit-1", "first")];
    const trajectoryStore = new MemoryTrajectoryStore(events);
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore,
        sidecarStore: {
            async restore() {
                return {
                    schemaVersion: 1,
                    goalId: "goal-layered",
                    runId: "run-layered",
                    derivedThroughSequence: 2,
                    sourceDigest: "sha256:wrong",
                    compactorVersion: "deterministic-warm-v1",
                    entries: [validWarmEntry()],
                };
            },
            async save() {},
            async remove() {},
        },
        policy,
    });
    const goal = layeredExecutingGoal(2);
    const view = new ModelInferenceProjector().project(goal, [], createEmptyWorkingMemory());
    const before = structuredClone(events);

    const assembled = await assembler.assemble({ goal, view });

    assert.deepEqual(assembled.trajectoryContext?.warm, []);
    assert.deepEqual(events, before);
});

test("Sidecar 删除后从 committed Trajectory 重新派生 Warm", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-assembler-sidecar-"));
    t.after(async () => rm(directory, { recursive: true, force: true }));
    const events = [
        completeEvent(1, "unit-1", "first"),
        terminalEvent(2, "unit-1", "first"),
        completeEvent(3, "unit-2", "second"),
        terminalEvent(4, "unit-2", "second"),
        completeEvent(5, "unit-3", "third"),
        terminalEvent(6, "unit-3", "third"),
    ];
    const trajectoryStore = new MemoryTrajectoryStore(events);
    const sidecarStore = new JsonFileWarmContextSidecarStore(directory);
    await sidecarStore.save({
        schemaVersion: 1,
        goalId: "goal-layered",
        runId: "run-layered",
        derivedThroughSequence: 2,
        sourceDigest: computeTrajectorySourceDigest(events, 2),
        compactorVersion: "deterministic-warm-v1",
        entries: [{
            ...validWarmEntry(),
            evidenceSequences: [1, 2],
            firstSequence: 1,
            lastSequence: 2,
            lastAccessedSequence: 2,
        }],
    });
    const estimator = {
        unit: "character" as const,
        estimate(value: unknown): number {
            if (
                typeof value === "object"
                && value !== null
                && "executionUnitId" in value
            ) {
                return 40;
            }
            if (
                typeof value === "object"
                && value !== null
                && "id" in value
                && "summary" in value
            ) {
                return 2;
            }
            return 1;
        },
    };
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore,
        sidecarStore,
        policy: createModelContextBudgetPolicy({
            modelInputBudget: 100,
            responseReserve: 10,
            warmShare: 0.5,
        }, estimator),
        warmEntryExtractor: () => [{
            ...validWarmEntry(),
            id: "rebuilt-finding",
            summary: "rebuilt from committed history",
            evidenceSequences: [1, 2],
            firstSequence: 1,
            lastSequence: 2,
            lastAccessedSequence: 2,
        }],
    });
    const goal = layeredExecutingGoal(6);
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );

    const cached = await assembler.assemble({ goal, view });
    assert.deepEqual(cached.trajectoryContext?.warm.map((entry) => entry.id), ["finding-1"]);

    await sidecarStore.remove("goal-layered", "run-layered");
    const rebuilt = await assembler.assemble({ goal, view });
    assert.deepEqual(rebuilt.trajectoryContext?.warm.map((entry) => entry.id), ["rebuilt-finding"]);
    assert.deepEqual(events, trajectoryStore.events);
});

test("固定 View 超过硬预算时拒绝组装", async () => {
    const trajectoryStore = new MemoryTrajectoryStore([
        completeEvent(1, "unit-1", "first"),
        terminalEvent(2, "unit-1", "first"),
    ]);
    const overflowPolicy = createModelContextBudgetPolicy({
        modelInputBudget: 100,
        responseReserve: 10,
        warmShare: 0.5,
    }, {
        unit: "character",
        estimate: () => 95,
    });
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore,
        policy: overflowPolicy,
    });
    const goal = layeredExecutingGoal(2);
    const view = new ModelInferenceProjector().project(goal, [], createEmptyWorkingMemory());

    await assert.rejects(
        assembler.assembleContext({ goal, view }),
        (error: unknown) => error instanceof ModelContextHardOverflowError,
    );
});

test("当前 trajectory-layered@1 缺少 TrajectoryStore 时快速失败", async () => {
    const goal = layeredExecutingGoal(0);
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );
    const assembler = new TrajectoryModelContextAssembler({ policy });

    await assert.rejects(
        assembler.assemble({ goal, view }),
        (error: unknown) => error instanceof ModelContextSourceError
            && /requires a TrajectoryStore/.test(error.message),
    );
});

test("中止在 Trajectory 读取后传播，Assembler 不保存任何状态", async () => {
    let resolveRead: (() => void) | undefined;
    const trajectoryStore: TrajectoryStore = {
        async append() {
            throw new Error("append is not used");
        },
        async read() {
            await new Promise<void>((resolve) => {
                resolveRead = resolve;
            });
            return [];
        },
        async readWithBoundary(query, boundary) {
            return classifyTrajectoryTail(await this.read(query), boundary);
        },
    };
    const assembler = new TrajectoryModelContextAssembler({ trajectoryStore, policy });
    const goal = layeredExecutingGoal(0);
    const view = new ModelInferenceProjector().project(goal, [], createEmptyWorkingMemory());
    const controller = new AbortController();
    const pending = assembler.assemble({
        goal,
        view,
        control: { signal: controller.signal },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort();
    resolveRead?.();

    await assert.rejects(
        pending,
        (error: unknown) => error instanceof Error && error.name === "ExecutionAbortedError",
    );
});

function layeredExecutingGoal(committedThroughSequence: number): Goal {
    const goal = createGoal({
        ...currentProtocols,
        id: "goal-layered",
        runId: "run-layered",
        promptBundleVersion: 1,
        intent: "layered",
        profile,
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: { objective: "layered", completionCriteria: [] },
            },
            run: {
                ...goal.state.run,
                status: "running",
                committedThroughSequence,
            },
        },
    };
}

function completeEvent(
    sequence: number,
    executionUnitId: string,
    summary: string,
): TrajectoryEvent {
    return event(sequence, executionUnitId, {
        type: "decision_received",
        decision: {
            kind: "complete",
            summary,
            completionEvidence: [],
        },
    });
}

function terminalEvent(
    sequence: number,
    executionUnitId: string,
    summary: string,
): TrajectoryEvent {
    return event(sequence, executionUnitId, {
        type: "run_completed",
        summary,
    });
}

function event(
    sequence: number,
    executionUnitId: string,
    payload: TrajectoryEventDraft["payload"],
): TrajectoryEvent {
    return allocateImmutableEvent({
        goalId: "goal-layered",
        runId: "run-layered",
        phase: "executing",
        executionUnitId,
        eventType: payload.type,
        payload,
    } as TrajectoryEventDraft, sequence, `event-${sequence}`) as TrajectoryEvent;
}

function validWarmEntry() {
    return {
        id: "finding-1",
        kind: "finding" as const,
        summary: "finding",
        status: "active" as const,
        lossy: true as const,
        evidenceSequences: [1],
        firstSequence: 1,
        lastSequence: 1,
        lastAccessedSequence: 1,
        reinforcementCount: 1,
        sourceHash: "sha256:finding",
    };
}
