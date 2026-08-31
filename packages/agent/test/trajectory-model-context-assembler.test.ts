import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    buildPreparationRequest,
    buildStepRequest,
    ContextCompactAdapter,
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
import {
    computeTrajectorySourceDigest,
    JsonFileWarmContextSidecarStore,
} from "../../storage/src/index";
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

test("固定 View 软超限时保留完整基础输入但清空 Hot/Warm", async () => {
    const traces: Array<{ readonly kind: string }> = [];
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
        traceSink: {
            async append(record) {
                traces.push(record);
            },
        },
    });
    const goal = layeredExecutingGoal(2);
    const view = new ModelInferenceProjector().project(goal, [], createEmptyWorkingMemory());

    const context = await assembler.assembleContext({ goal, view });

    assert.equal(context.softOverflow, true);
    assert.deepEqual(context.hot, []);
    assert.deepEqual(context.warm, []);
    assert.equal(context.budget.fixedInput.count, 95);
    assert.deepEqual(traces.map((record) => record.kind), [
        "model_context_soft_overflow",
    ]);
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

test("确定性 Warm 溢出达到阈值时只调用一次 Compact，并合并合法结果", async () => {
    let compactCalls = 0;
    const estimator = {
        unit: "character" as const,
        estimate(value: unknown): number {
            if (
                typeof value === "object"
                && value !== null
                && "executionUnitId" in value
            ) {
                return 100;
            }
            if (
                typeof value === "object"
                && value !== null
                && "id" in value
                && "summary" in value
            ) {
                return String((value as { readonly id: unknown }).id)
                    .startsWith("compact-") ? 2 : 5;
            }
            return 1;
        },
    };
    const compactAdapter = new ContextCompactAdapter({
        adapter: {
            async generate() {
                compactCalls += 1;
                return {
                    content: JSON.stringify({
                        schemaVersion: 1,
                        entries: [{
                            id: "compact-finding",
                            kind: "finding",
                            summary: "compact source",
                            status: "active",
                            lossy: true,
                            evidenceSequences: [1],
                            firstSequence: 1,
                            lastSequence: 1,
                            lastAccessedSequence: 1,
                            reinforcementCount: 1,
                            sourceHash: "sha256:compact",
                        }],
                    }),
                };
            },
        },
        estimator,
    });
    const events = [
        completeEvent(1, "unit-1", "one"),
        terminalEvent(2, "unit-1", "one"),
        completeEvent(3, "unit-2", "two"),
        terminalEvent(4, "unit-2", "two"),
        completeEvent(5, "unit-3", "three"),
        terminalEvent(6, "unit-3", "three"),
    ];
    const trajectoryStore = new MemoryTrajectoryStore(events);
    const goal = layeredExecutingGoal(6);
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore,
        compactAdapter,
        policy: createModelContextBudgetPolicy({
            modelInputBudget: 100,
            responseReserve: 10,
            warmShare: 0.5,
        }, estimator),
        warmEntryExtractor: () => Array.from({ length: 10 }, (_, index) => ({
            id: `finding-${index + 1}`,
            kind: "finding" as const,
            summary: `source-${index + 1}`,
            status: "active" as const,
            lossy: true as const,
            evidenceSequences: [1],
            firstSequence: 1,
            lastSequence: 1,
            lastAccessedSequence: 1,
            reinforcementCount: 1,
            sourceHash: `sha256:finding-${index + 1}`,
        })),
    });

    const assembled = await assembler.assemble({ goal, view });

    assert.equal(compactCalls, 1);
    assert.ok(assembled.trajectoryContext?.warm.some((entry) =>
        entry.id === "compact-finding",
    ));
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
