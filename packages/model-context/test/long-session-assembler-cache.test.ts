import assert from "node:assert/strict";
import { test } from "node:test";

import {
    TrajectoryModelContextAssembler,
    ModelInferenceProjector,
} from "../src/index";
import { createModelContextBudgetPolicy } from "../../context-budget/src/index";
import type {
    AgentProfile,
    Goal,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryIncrementalReadPort,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../../runtime/src/index";
import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    createGoal,
} from "../../runtime/src/index";
import { createEmptyWorkingMemory } from "../../working-memory/src/index";
import { currentProtocols } from "./current-fixtures";
import type { ModelInferenceView } from "../../model-view/src/index";
import type { NativeConversationIdentity } from "../../model-contracts/src/index";

const profile: AgentProfile = {
    id: "cache-profile",
    systemPrompt: "system",
    instructions: [],
    toolIds: [],
};

class CountingTrajectoryStore implements TrajectoryStore, TrajectoryIncrementalReadPort {
    readonly events: TrajectoryEvent[];
    readWithBoundaryCalls = 0;
    readonly readAfterCalls: Array<{
        readonly goalId: string;
        readonly runId: string;
        readonly afterSequence: number;
    }> = [];

    constructor(events: readonly TrajectoryEvent[]) {
        this.events = [...events];
    }

    async append(): Promise<Readonly<TrajectoryEvent>> {
        throw new Error("append is not used by Context Assembler");
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
        this.readWithBoundaryCalls += 1;
        return classifyTrajectoryTail(await this.read(query), committedThroughSequence);
    }

    async readAfter(
        query: { readonly goalId: string; readonly runId: string; readonly afterSequence: number },
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        this.readAfterCalls.push({ ...query });
        const events = this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && event.sequence > query.afterSequence);
        return classifyTrajectoryTail(events, committedThroughSequence);
    }
}

class FullTrajectoryStore implements TrajectoryStore {
    readonly events: TrajectoryEvent[];
    readWithBoundaryCalls = 0;

    constructor(events: readonly TrajectoryEvent[]) {
        this.events = [...events];
    }

    async append(): Promise<Readonly<TrajectoryEvent>> {
        throw new Error("append is not used by Context Assembler");
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
        this.readWithBoundaryCalls += 1;
        return classifyTrajectoryTail(await this.read(query), committedThroughSequence);
    }
}

const fixedPolicy = createModelContextBudgetPolicy({
    modelInputBudget: 1_000_000,
    responseReserve: 1,
    warmShare: 0.5,
}, {
    unit: "character" as const,
    estimate(value: unknown): number {
        if (typeof value === "object" && value !== null && "executionUnitId" in value) {
            return 10;
        }
        if (typeof value === "object" && value !== null && "id" in value && "summary" in value) {
            return 5;
        }
        return 1;
    },
});

function goalAt(
    committedThroughSequence: number,
    goalId = "goal-cache",
    runId = "run-cache",
): Goal {
    const goal = createGoal({
        ...currentProtocols,
        id: goalId,
        runId,
        promptBundleVersion: 1,
        intent: "cache",
        profile,
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: { phase: "executing" },
            run: {
                ...goal.state.run,
                status: "running",
                committedThroughSequence,
            },
        },
    };
}

function viewFor(goal: Goal): ModelInferenceView {
    return new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );
}

function unitEvents(goal: Goal, unitId: string, firstSequence: number): TrajectoryEvent[] {
    const event = (sequence: number, payload: TrajectoryEventDraft["payload"]): TrajectoryEvent =>
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: unitId,
            eventType: payload.type,
            payload,
        } as TrajectoryEventDraft, sequence, `event-${goal.id}-${sequence}`);
    return [
        event(firstSequence, {
            type: "decision_received",
            decision: {
                kind: "complete",
                summary: unitId,
                completionEvidence: [],
            },
        }),
        event(firstSequence + 1, {
            type: "run_completed",
            summary: unitId,
        }),
    ];
}

test("assembler 在同一 boundary 复用 committed 前缀，不再次读取 trajectory", async () => {
    const goal = goalAt(2);
    const store = new CountingTrajectoryStore(unitEvents(goal, "unit-1", 1));
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore: store,
        policy: fixedPolicy,
    });
    const view = viewFor(goal);

    const first = await assembler.assemble({ goal, view });
    assert.equal(store.readWithBoundaryCalls, 1);

    const second = await assembler.assemble({ goal, view });
    assert.equal(store.readWithBoundaryCalls, 1);
    assert.equal(store.readAfterCalls.length, 0);
    assert.deepEqual(second.trajectoryContext, first.trajectoryContext);
});

test("assembler 在 boundary 前进时只读取并适配后缀，输出与全量冷启动一致", async () => {
    const goalBefore = goalAt(2);
    const store = new CountingTrajectoryStore(unitEvents(goalBefore, "unit-1", 1));
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore: store,
        policy: fixedPolicy,
    });
    await assembler.assemble({ goal: goalBefore, view: viewFor(goalBefore) });
    const fullReads = store.readWithBoundaryCalls;

    store.events.push(...unitEvents(goalBefore, "unit-2", 3));
    const goalAfter = goalAt(4);
    const viewAfter = viewFor(goalAfter);
    const incremental = await assembler.assemble({ goal: goalAfter, view: viewAfter });

    assert.equal(store.readWithBoundaryCalls, fullReads);
    assert.deepEqual(store.readAfterCalls.map((call) => call.afterSequence), [2]);

    const fresh = new TrajectoryModelContextAssembler({
        trajectoryStore: store,
        policy: fixedPolicy,
    });
    const expected = await fresh.assemble({ goal: goalAfter, view: viewAfter });
    assert.deepEqual(incremental.trajectoryContext, expected.trajectoryContext);
});

test("assembler 在 Epoch 变化时回退全量读取", async () => {
    const goal = goalAt(2);
    const store = new CountingTrajectoryStore(unitEvents(goal, "unit-1", 1));
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore: store,
        policy: fixedPolicy,
    });
    await assembler.assemble({ goal, view: viewFor(goal) });
    const fullReads = store.readWithBoundaryCalls;

    const nextGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                contextEpoch: {
                    ...goal.state.run.contextEpoch,
                    number: 1,
                },
            },
        },
    };
    await assembler.assemble({ goal: nextGoal, view: viewFor(nextGoal) });

    assert.equal(store.readWithBoundaryCalls, fullReads + 1);
    assert.equal(store.readAfterCalls.length, 0);
});

test("assembler 在 native identity 变化时回退全量读取", async () => {
    const goal = goalAt(2);
    const store = new CountingTrajectoryStore(unitEvents(goal, "unit-1", 1));
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore: store,
        policy: fixedPolicy,
    });
    const view = viewFor(goal);
    const firstIdentity: NativeConversationIdentity = {
        provider: "openai",
        endpoint: "https://example.test/v1",
        model: "model-a",
        protocol: "openai-chat",
    };
    const secondIdentity: NativeConversationIdentity = {
        ...firstIdentity,
        model: "model-b",
    };

    await assembler.assemble({ goal, view, nativeConversationIdentity: firstIdentity });
    const fullReads = store.readWithBoundaryCalls;
    await assembler.assemble({ goal, view, nativeConversationIdentity: secondIdentity });

    assert.equal(store.readWithBoundaryCalls, fullReads + 1);
});

test("assembler 复用单元与 Warm 计量，不重复调用 estimator", async () => {
    let unitMeasurements = 0;
    const countingPolicy = createModelContextBudgetPolicy({
        modelInputBudget: 1_000_000,
        responseReserve: 1,
        warmShare: 0.5,
    }, {
        unit: "character" as const,
        estimate(value: unknown): number {
            if (typeof value === "object" && value !== null && "executionUnitId" in value) {
                unitMeasurements += 1;
                return 10;
            }
            if (typeof value === "object" && value !== null && "id" in value && "summary" in value) {
                unitMeasurements += 1;
                return 5;
            }
            return 1;
        },
    });
    const goal = goalAt(2);
    const store = new CountingTrajectoryStore(unitEvents(goal, "unit-1", 1));
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore: store,
        policy: countingPolicy,
    });
    const view = viewFor(goal);

    await assembler.assemble({ goal, view });
    assert.ok(unitMeasurements > 0);
    unitMeasurements = 0;

    await assembler.assemble({ goal, view });
    assert.equal(unitMeasurements, 0);
});

test("assembler 在 boundary 回退时回退全量读取", async () => {
    const goalAtFour = goalAt(4);
    const store = new CountingTrajectoryStore([
        ...unitEvents(goalAtFour, "unit-1", 1),
        ...unitEvents(goalAtFour, "unit-2", 3),
    ]);
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore: store,
        policy: fixedPolicy,
    });
    await assembler.assemble({ goal: goalAtFour, view: viewFor(goalAtFour) });
    const fullReads = store.readWithBoundaryCalls;

    const goalAtTwo = goalAt(2);
    const result = await assembler.assemble({
        goal: goalAtTwo,
        view: viewFor(goalAtTwo),
    });

    assert.equal(store.readWithBoundaryCalls, fullReads + 1);
    assert.deepEqual(
        result.trajectoryContext?.hot.map((unit) => unit.executionUnitId),
        ["unit-1"],
    );
});

test("assembler 缓存最多保留两个 Run，第三个会淘汰最早条目", async () => {
    const goals = [0, 1, 2].map((index) =>
        goalAt(2, `goal-lru-${index}`, `run-lru-${index}`));
    const store = new CountingTrajectoryStore(
        goals.flatMap((goal) => unitEvents(goal, `unit-${goal.id}`, 1)),
    );
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore: store,
        policy: fixedPolicy,
    });

    for (const goal of goals) {
        await assembler.assemble({ goal, view: viewFor(goal) });
    }
    assert.equal(store.readWithBoundaryCalls, 3);

    await assembler.assemble({ goal: goals[0]!, view: viewFor(goals[0]!) });
    assert.equal(store.readWithBoundaryCalls, 4);
});

test("assembler 在 Store 不支持 readAfter 时回退全量读取并保持输出一致", async () => {
    const goalBefore = goalAt(2);
    const store = new FullTrajectoryStore(unitEvents(goalBefore, "unit-1", 1));
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore: store,
        policy: fixedPolicy,
    });
    await assembler.assemble({ goal: goalBefore, view: viewFor(goalBefore) });

    store.events.push(...unitEvents(goalBefore, "unit-2", 3));
    const goalAfter = goalAt(4);
    const viewAfter = viewFor(goalAfter);
    const incremental = await assembler.assemble({ goal: goalAfter, view: viewAfter });

    assert.equal(store.readWithBoundaryCalls, 2);
    const fresh = new TrajectoryModelContextAssembler({
        trajectoryStore: store,
        policy: fixedPolicy,
    });
    const expected = await fresh.assemble({ goal: goalAfter, view: viewAfter });
    assert.deepEqual(incremental.trajectoryContext, expected.trajectoryContext);
});
