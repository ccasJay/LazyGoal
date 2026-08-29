import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildPreparationRequest,
    buildStepRequest,
    createModelContextBudgetPolicy,
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
import { computeTrajectorySourceDigest } from "../../storage/src/index";
import type { ContextCompactor } from "../src/context-compactor";
import type { PromptBundleRenderer } from "../src/prompting/types";

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

test("固定 View 软超限时保留完整基础输入但清空 Hot/Warm", async () => {
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

    const context = await assembler.assembleContext({ goal, view });

    assert.equal(context.softOverflow, true);
    assert.deepEqual(context.hot, []);
    assert.deepEqual(context.warm, []);
    assert.equal(context.budget.fixedInput.count, 95);
});

test("Conversation 协议不访问 Trajectory，Step/Preparation 都能复用调用级组装器", async () => {
    const legacyStore = new MemoryTrajectoryStore([]);
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore: legacyStore,
        policy,
    });
    const legacyGoal = createGoal({
        id: "legacy-goal",
        runId: "legacy-run",
        promptBundleVersion: 1,
        intent: "legacy",
        profile,
    });
    const legacyView = new ModelInferenceProjector().project(legacyGoal);
    assert.strictEqual(
        await assembler.assemble({ goal: legacyGoal, view: legacyView }),
        legacyView,
    );
    assert.equal(legacyStore.reads.length, 0);

    const layeredGoal = layeredExecutingGoal(0);
    const renderer: PromptBundleRenderer = { render: () => "system" };
    const compactor: ContextCompactor<any> = {
        async compact(units) {
            return units;
        },
    };
    const request = await buildStepRequest(
        layeredGoal,
        [],
        renderer,
        compactor,
        undefined,
        createEmptyWorkingMemory(),
        assembler,
    );
    const control = JSON.parse(request.messages.at(-1)?.content ?? "{}");
    assert.equal(control.trajectoryContext.softOverflow, false);
    assert.deepEqual(control.trajectoryContext.hot, []);

    const preparationGoal = createGoal({
        id: "preparation-layered",
        runId: "preparation-run",
        promptBundleVersion: 1,
        intent: "prepare",
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    });
    const preparationRequest = await buildPreparationRequest(
        preparationGoal,
        [],
        renderer,
        compactor,
        undefined,
        createEmptyWorkingMemory(),
        new TrajectoryModelContextAssembler({
            trajectoryStore: new MemoryTrajectoryStore([]),
            policy,
        }),
    );
    assert.equal(
        JSON.parse(preparationRequest.messages.at(-1)?.content ?? "{}").trajectoryContext.softOverflow,
        false,
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
        id: "goal-layered",
        runId: "run-layered",
        promptBundleVersion: 1,
        intent: "layered",
        profile,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
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
        decision: { kind: "complete", checkpoint: summary, summary },
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
