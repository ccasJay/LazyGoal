import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { JsonFileTrajectoryStore } from "../../storage/src/index";
import { createGoal } from "../../runtime/src/domain";
import type { Goal } from "../../runtime/src/domain";
import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
} from "../../runtime/src/index";
import { createEmptyWorkingMemory } from "../../working-memory/src/index";
import { createModelContextBudgetPolicy } from "../../context-budget/src/index";
import {
    MODEL_CONTEXT_SOURCE_ERROR_CODE,
    ModelContextSourceError,
    ModelInferenceProjector,
    TrajectoryExecutionUnitAdapter,
    TrajectoryModelContextAssembler,
} from "../src/index";
import { currentProtocols } from "./current-fixtures";

const profile = {
    id: "public-entry-profile",
    systemPrompt: "public entry",
    instructions: [],
    toolIds: ["read_file"],
};

const selectiveEstimator = {
    unit: "character" as const,
    estimate(value: unknown): number {
        if (typeof value === "object" && value !== null && "executionUnitId" in value) {
            return 50;
        }
        return 2;
    },
};

const policy = createModelContextBudgetPolicy({
    modelInputBudget: 100,
    responseReserve: 10,
    warmShare: 0.5,
}, selectiveEstimator);

class MemoryTrajectoryStore implements TrajectoryStore {
    readonly reads: TrajectoryReadQuery[] = [];

    constructor(readonly events: readonly TrajectoryEvent[]) {}

    async append(): Promise<Readonly<TrajectoryEvent>> {
        throw new Error("public entry test store is read-only");
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
        return classifyTrajectoryTail(await this.read(query), committedThroughSequence);
    }
}

function layeredGoal(committedThroughSequence: number): Goal {
    const goal = createGoal({
        ...currentProtocols,
        id: "goal-layered",
        runId: "run-layered",
        promptBundleVersion: 1,
        intent: "layered public entry",
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
                mode: "plan",
                approvedTask: { objective: "layered", completionCriteria: [] },
            },
        },
    };
}

function eventDraft(
    sequence: number,
    executionUnitId: string,
    payload: TrajectoryEventDraft["payload"],
): TrajectoryEventDraft {
    return {
        goalId: "goal-layered",
        runId: "run-layered",
        phase: "executing",
        executionUnitId,
        eventType: payload.type,
        payload,
    } as TrajectoryEventDraft;
}

function event(
    sequence: number,
    executionUnitId: string,
    payload: TrajectoryEventDraft["payload"],
): TrajectoryEvent {
    return allocateImmutableEvent(
        eventDraft(sequence, executionUnitId, payload),
        sequence,
        `event-${sequence}`,
    ) as TrajectoryEvent;
}

function completeUnitEvents(
    firstSequence: number,
    executionUnitId: string,
    summary: string,
): readonly TrajectoryEvent[] {
    return [
        event(firstSequence, executionUnitId, {
            type: "decision_received",
            decision: { kind: "complete", summary, completionEvidence: [] },
        }),
        event(firstSequence + 1, executionUnitId, {
            type: "run_completed",
            summary,
        }),
    ];
}

async function assemble(store: TrajectoryStore, goal: Goal) {
    const assembler = new TrajectoryModelContextAssembler({ trajectoryStore: store, policy });
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
        undefined,
        undefined,
        "decide",
    );
    return assembler.assemble({ goal, view });
}

test("仅注入内存历史 Port、当前状态与预算即可组装 View、来源身份、Hot/Warm", async () => {
    const events = [
        ...completeUnitEvents(1, "unit-1", "first"),
        ...completeUnitEvents(3, "unit-2", "second"),
        ...completeUnitEvents(5, "uncommitted", "tail"),
    ];
    const store = new MemoryTrajectoryStore(events);
    const goal = layeredGoal(4);
    const before = JSON.stringify(events);

    const assembled = await assemble(store, goal);

    assert.equal(assembled.prompt.profile.id, profile.id);
    assert.equal(assembled.workingContext.phase, "executing");
    assert.deepEqual(
        assembled.trajectoryContext?.hot.map((unit) => unit.executionUnitId),
        ["unit-2"],
    );
    assert.deepEqual(
        assembled.trajectoryContext?.hot.flatMap((unit) => unit.events.map((item) => item.sequence)),
        [3, 4],
    );
    assert.ok((assembled.trajectoryContext?.warm.length ?? 0) > 0);
    for (const entry of assembled.trajectoryContext?.warm ?? []) {
        assert.ok(entry.lastSequence <= 4, "未提交 tail 不得进入 Warm");
        assert.equal(entry.evidenceSequences.includes(5), false);
        assert.match(entry.sourceHash, /^sha256:[0-9a-f]+$/);
    }
    assert.equal(assembled.trajectoryContext?.budget.measuredAs, "character");
    assert.equal(Object.isFrozen(assembled.trajectoryContext), true);
    assert.equal(JSON.stringify(events), before, "组装不得修改输入事件");
    assert.equal(store.reads.length, 1);
});

test("文件历史 Port 与内存 Port 给出相同的 Hot/Warm 来源身份", async () => {
    const directory = await mkdtemp(join(tmpdir(), "model-context-public-entry-"));
    try {
        const memoryStore = new MemoryTrajectoryStore([
            ...completeUnitEvents(1, "unit-1", "first"),
            ...completeUnitEvents(3, "unit-2", "second"),
        ]);
        const memoryView = await assemble(memoryStore, layeredGoal(4));

        const fileStore = new JsonFileTrajectoryStore(directory);
        await fileStore.append(eventDraft(1, "unit-1", {
            type: "decision_received",
            decision: { kind: "complete", summary: "first", completionEvidence: [] },
        }));
        await fileStore.append(eventDraft(2, "unit-1", { type: "run_completed", summary: "first" }));
        await fileStore.append(eventDraft(3, "unit-2", {
            type: "decision_received",
            decision: { kind: "complete", summary: "second", completionEvidence: [] },
        }));
        await fileStore.append(eventDraft(4, "unit-2", { type: "run_completed", summary: "second" }));
        const fileView = await assemble(fileStore, layeredGoal(4));

        const essentials = (view: Awaited<ReturnType<typeof assemble>>) => ({
            hot: view.trajectoryContext?.hot.map((unit) => ({
                id: unit.executionUnitId,
                events: unit.events.map((item) => [item.eventType, item.sequence]),
            })),
            warm: view.trajectoryContext?.warm.map((entry) => ({
                id: entry.id,
                kind: entry.kind,
                evidence: entry.evidenceSequences,
            })),
            budget: view.trajectoryContext?.budget,
        });

        assert.deepEqual(essentials(fileView), essentials(memoryView));
        // 事件身份由各自 Store 生成；来源身份按证据序号与其稳定哈希分别校验。
        for (const entry of fileView.trajectoryContext?.warm ?? []) {
            assert.match(entry.sourceHash, /^sha256:[0-9a-f]{64}$/);
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("执行单元来源身份非法时在组装前失败，且错误码稳定", () => {
    const adapter = new TrajectoryExecutionUnitAdapter();
    const crossGoal = event(1, "unit-1", {
        type: "decision_received",
        decision: { kind: "complete", summary: "first", completionEvidence: [] },
    });

    assert.throws(
        () => adapter.adapt(
            [crossGoal],
            { committedThroughSequence: 1, goalId: "other-goal" },
        ),
        (error: unknown) => error instanceof ModelContextSourceError
            && error.code === MODEL_CONTEXT_SOURCE_ERROR_CODE,
    );
});

test("未完整单元与提交边界外的 tail 不进入模型上下文", async () => {
    const incomplete = event(1, "incomplete", {
        type: "decision_received",
        decision: { kind: "complete", summary: "only decision", completionEvidence: [] },
    });
    const uncommitted = completeUnitEvents(2, "uncommitted", "tail");
    const store = new MemoryTrajectoryStore([incomplete, ...uncommitted]);
    const goal = layeredGoal(1);

    const assembled = await assemble(store, goal);

    assert.deepEqual(assembled.trajectoryContext?.hot, []);
    assert.deepEqual(assembled.trajectoryContext?.warm, []);
});
