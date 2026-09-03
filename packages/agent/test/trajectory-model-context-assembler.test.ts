import assert from "node:assert/strict";
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

test("Assembler 从 committed Trajectory 选择完整 Hot，并按确定性规则生成 Warm 条目，排除未提交 tail", async () => {
    const events = [
        completeEvent(1, "unit-1", "first"),
        terminalEvent(2, "unit-1", "first"),
        completeEvent(3, "unit-2", "second"),
        terminalEvent(4, "unit-2", "second"),
        completeEvent(5, "tail", "uncommitted"),
    ];
    const trajectoryStore = new MemoryTrajectoryStore(events);
    // 构造限制 hot 预算的 estimator，让 unit-1 成为 omitted，unit-2 成为 hot
    const selectiveEstimator = {
        unit: "character" as const,
        estimate(value: unknown): number {
            if (
                typeof value === "object"
                && value !== null
                && "executionUnitId" in value
            ) {
                return 50;
            }
            return 2;
        },
    };
    const tightPolicy = createModelContextBudgetPolicy({
        modelInputBudget: 100,
        responseReserve: 10,
        warmShare: 0.5,
    }, selectiveEstimator);

    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore,
        policy: tightPolicy,
    });
    const goal = layeredExecutingGoal(4);
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );

    const assembled = await assembler.assemble({ goal, view });

    // unit-2 进入 Hot
    assert.deepEqual(
        assembled.trajectoryContext?.hot.map((unit) => unit.executionUnitId),
        ["unit-2"],
    );
    assert.deepEqual(
        assembled.trajectoryContext?.hot.flatMap((unit) =>
            unit.events.map((event) => event.sequence),
        ),
        [3, 4],
    );
    // unit-1 转化为确定性 Warm 条目，不包含 tail sequence 5
    assert.ok(assembled.trajectoryContext?.warm.length! > 0);
    for (const warmEntry of assembled.trajectoryContext!.warm) {
        assert.ok(warmEntry.lastSequence <= 4);
        assert.ok(!warmEntry.evidenceSequences.includes(5));
    }
    assert.equal(assembled.trajectoryContext?.budget.measuredAs, "character");
    assert.equal(trajectoryStore.reads.length, 1);
    assert.equal(Object.isFrozen(assembled.trajectoryContext), true);
    assert.equal(Object.isFrozen(assembled.trajectoryContext?.hot), true);
    assert.equal(Object.isFrozen(assembled.trajectoryContext?.warm), true);
});

test("Assembler 相同输入下多次调用产生确定性 Warm 结果且不依赖持久化缓存", async () => {
    const events = [
        completeEvent(1, "unit-1", "first"),
        terminalEvent(2, "unit-1", "first"),
        completeEvent(3, "unit-2", "second"),
        terminalEvent(4, "unit-2", "second"),
    ];
    const trajectoryStore = new MemoryTrajectoryStore(events);
    const selectiveEstimator = {
        unit: "character" as const,
        estimate(value: unknown): number {
            if (
                typeof value === "object"
                && value !== null
                && "executionUnitId" in value
            ) {
                return 50;
            }
            return 2;
        },
    };
    const tightPolicy = createModelContextBudgetPolicy({
        modelInputBudget: 100,
        responseReserve: 10,
        warmShare: 0.5,
    }, selectiveEstimator);

    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore,
        policy: tightPolicy,
    });
    const goal = layeredExecutingGoal(4);
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );

    const firstRun = await assembler.assemble({ goal, view });
    const secondRun = await assembler.assemble({ goal, view });

    assert.deepEqual(firstRun.trajectoryContext?.warm, secondRun.trajectoryContext?.warm);
    assert.deepEqual(firstRun.trajectoryContext?.hot, secondRun.trajectoryContext?.hot);
});

test("未提交 Trajectory tail 绝不进入 Hot 或 Warm 模型上下文", async () => {
    const events = [
        completeEvent(1, "unit-1", "first"),
        terminalEvent(2, "unit-1", "first"),
        completeEvent(3, "tail-unit", "uncommitted tail"),
        terminalEvent(4, "tail-unit", "uncommitted tail"),
    ];
    // committedThroughSequence 只有 2
    const trajectoryStore = new MemoryTrajectoryStore(events);
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore,
        policy,
    });
    const goal = layeredExecutingGoal(2);
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );

    const assembled = await assembler.assemble({ goal, view });

    // Hot 只包含 sequence 1, 2
    assert.deepEqual(
        assembled.trajectoryContext?.hot.map((unit) => unit.executionUnitId),
        ["unit-1"],
    );
    // Warm 绝不能引用未提交的 sequence 3 或 4
    for (const warm of assembled.trajectoryContext?.warm ?? []) {
        assert.ok(warm.lastSequence <= 2);
        assert.ok(!warm.evidenceSequences.some((seq) => seq > 2));
    }
});

test("Assembler 保持 Goal 及其原始消息历史不可变", async () => {
    const events = [
        completeEvent(1, "unit-1", "first"),
        terminalEvent(2, "unit-1", "first"),
    ];
    const trajectoryStore = new MemoryTrajectoryStore(events);
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore,
        policy,
    });
    const goal = layeredExecutingGoal(2);
    const messagesBefore = structuredClone(goal.state.messages);
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );

    await assembler.assemble({ goal, view });

    assert.deepEqual(goal.state.messages, messagesBefore);
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

test("Assembler 默认 fixed input 按原始 Conversation 索引保留当前 Epoch", async () => {
    const fixedInputs: unknown[] = [];
    const estimator = {
        unit: "character" as const,
        estimate(value: unknown): number {
            fixedInputs.push(value);
            return 1;
        },
    };
    const assembler = new TrajectoryModelContextAssembler({
        trajectoryStore: new MemoryTrajectoryStore([]),
        policy: createModelContextBudgetPolicy({
            modelInputBudget: 100,
            responseReserve: 10,
            warmShare: 0.5,
        }, estimator),
    });
    const base = createGoal({
        ...currentProtocols,
        id: "goal-epoch",
        runId: "run-epoch",
        promptBundleVersion: 1,
        intent: "旧阶段输入",
        profile,
        messages: [
            {
                role: "assistant",
                assistant: { profileId: profile.id },
                content: "旧阶段响应",
            },
            { role: "user", content: "当前阶段输入" },
        ],
    });
    const goal: Goal = {
        ...base,
        state: {
            ...base.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: { objective: "执行", completionCriteria: [] },
            },
            run: {
                ...base.state.run,
                status: "running",
                contextEpoch: {
                    ...base.state.run.contextEpoch,
                    number: 1,
                    conversationStartIndex: 2,
                    openedAtSequence: 0,
                },
            },
        },
    };
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );

    await assembler.assembleContext({ goal, view });

    const fixedInput = fixedInputs.find((value): value is {
        readonly conversation: ModelInferenceView["conversation"];
    } => typeof value === "object" && value !== null && "conversation" in value);
    assert.deepEqual(
        fixedInput?.conversation.map((message) => message.sourceMessageIndex),
        [2],
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
