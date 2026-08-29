import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ContextDocumentBuilder,
    ContextDocumentSourceError,
    allocateImmutableEvent,
    buildCommittedContextDocuments,
    classifyTrajectoryTail,
    type ContextDocumentBuildInput,
    type Goal,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
} from "../src/index";

const goalId = "goal-document-builder";
const runId = "run-document-builder";

function event(
    sequence: number,
    draft: Omit<TrajectoryEventDraft, "goalId" | "runId"> & {
        readonly goalId?: string;
        readonly runId?: string;
    },
): Readonly<TrajectoryEvent> {
    return allocateImmutableEvent({
        goalId: draft.goalId ?? goalId,
        runId: draft.runId ?? runId,
        ...draft,
    } as TrajectoryEventDraft, sequence, `document-event-${sequence}`);
}

function committedSource(): readonly TrajectoryEvent[] {
    return [
        event(1, {
            phase: "gathering_context",
            eventType: "goal_created",
            payload: { type: "goal_created", intent: "检索历史" },
        }),
        event(2, {
            phase: "gathering_context",
            eventType: "preparation_result",
            payload: { type: "preparation_result", result: "question" },
        }),
        event(3, {
            phase: "gathering_context",
            eventType: "run_waiting",
            payload: { type: "run_waiting", reason: "question" },
        }),
        event(4, {
            phase: "gathering_context",
            eventType: "state_committed",
            payload: { type: "state_committed", committedThroughSequence: 3 },
        }),
        event(5, {
            phase: "executing",
            executionUnitId: "unit-tool",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "tool_call",
                    checkpoint: "读取文件",
                    action: {
                        actionId: "action-read",
                        toolId: "read_file",
                        input: { filePath: "src/index.ts", objectId: "obj-7" },
                    },
                },
            },
        }),
        event(6, {
            phase: "executing",
            executionUnitId: "unit-tool",
            actionId: "action-read",
            eventType: "action_staged",
            payload: {
                type: "action_staged",
                action: {
                    actionId: "action-read",
                    toolId: "read_file",
                    input: { filePath: "src/index.ts", objectId: "obj-7" },
                },
                approvalStatus: "approved",
            },
        }),
        event(7, {
            phase: "executing",
            eventType: "state_committed",
            payload: { type: "state_committed", committedThroughSequence: 6 },
        }),
        event(8, {
            phase: "executing",
            executionUnitId: "unit-tool",
            actionId: "action-read",
            eventType: "tool_started",
            payload: {
                type: "tool_started",
                actionId: "action-read",
                toolId: "read_file",
                input: { filePath: "src/index.ts", objectId: "obj-7" },
            },
        }),
        event(9, {
            phase: "executing",
            executionUnitId: "unit-tool",
            actionId: "action-read",
            eventType: "tool_finished",
            payload: {
                type: "tool_finished",
                actionId: "action-read",
                toolId: "read_file",
                observation: {
                    kind: "success",
                    output: { path: "src/index.ts", value: "ok" },
                    summary: "读取成功",
                },
            },
        }),
        event(10, {
            phase: "executing",
            executionUnitId: "unit-tool",
            actionId: "action-read",
            eventType: "observation_recorded",
            payload: {
                type: "observation_recorded",
                actionId: "action-read",
                observation: {
                    kind: "success",
                    output: { path: "src/index.ts", value: "ok" },
                    summary: "读取成功",
                },
            },
        }),
        event(11, {
            phase: "executing",
            eventType: "state_committed",
            payload: { type: "state_committed", committedThroughSequence: 10 },
        }),
        event(12, {
            phase: "planning",
            eventType: "preparation_result",
            payload: { type: "preparation_result", result: "task_proposal" },
        }),
        event(13, {
            phase: "planning",
            eventType: "run_waiting",
            payload: { type: "run_waiting", reason: "approval" },
        }),
        event(14, {
            phase: "planning",
            eventType: "memory_patch_accepted",
            payload: {
                type: "memory_patch_accepted",
                protocolVersion: 1,
                producers: ["model"],
                operations: [{
                    type: "upsert_hypothesis",
                    hypothesis: {
                        id: "hypothesis-1",
                        kind: "hypothesis",
                        originPhase: "planning",
                        originSequence: 14,
                        scope: "goal",
                        status: "active",
                        statement: "历史读取结果可复用",
                    },
                }],
            },
        }),
        event(15, {
            phase: "planning",
            eventType: "state_committed",
            payload: { type: "state_committed", committedThroughSequence: 14 },
        }),
        event(16, {
            phase: "executing",
            executionUnitId: "lookup-unit",
            eventType: "context_lookup_requested",
            payload: {
                type: "context_lookup_requested",
                lookupId: "lookup-1",
                request: {
                    kind: "context_lookup",
                    need: "historical_execution",
                    question: "之前读取了什么？",
                },
            },
        }),
        event(17, {
            phase: "executing",
            executionUnitId: "tail-unit",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: { kind: "complete", summary: "tail", checkpoint: "tail" },
            },
        }),
    ];
}

function input(events: readonly TrajectoryEvent[], boundary = 16): ContextDocumentBuildInput {
    return {
        goalId,
        runId,
        committedThroughSequence: boundary,
        events,
    };
}

class MemoryTrajectoryStore implements TrajectoryStore {
    constructor(private readonly events: readonly TrajectoryEvent[]) {}

    async append(): Promise<Readonly<TrajectoryEvent>> {
        throw new Error("append is not used by this test");
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
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

test("Builder 只从 committed 来源构建完整 execution/preparation 文档", () => {
    const source = committedSource();
    const result = new ContextDocumentBuilder().buildResult(input(source));

    assert.equal(result.documents.length, 3);
    assert.deepEqual(
        result.documents.map((document) => [document.kind, document.firstSequence, document.lastSequence]),
        [
            ["preparation", 2, 3],
            ["execution", 5, 10],
            ["preparation", 12, 14],
        ],
    );

    const execution = result.documents.find((document) => document.kind === "execution");
    assert.ok(execution);
    assert.equal(execution.executionUnitId, "unit-tool");
    assert.deepEqual(execution.fields.toolId, ["read_file"]);
    assert.deepEqual(execution.fields.actionId, ["action-read"]);
    assert.deepEqual(execution.fields.path, ["src/index.ts"]);
    assert.deepEqual(execution.fields.objectId, ["obj-7"]);
    assert.deepEqual(execution.sourceEventIds, [
        "document-event-5",
        "document-event-6",
        "document-event-8",
        "document-event-9",
        "document-event-10",
    ]);
    assert.equal(execution.body, execution.fields.body);
    assert.equal(execution.body.includes("context_lookup_requested"), false);
    assert.equal(execution.body.includes("document-event-17"), false);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.documents), true);
    assert.equal(Object.isFrozen(execution), true);
});

test("Builder 全量、位置参数和 Store 读取结果保持稳定等价", async () => {
    const source = committedSource();
    const builder = new ContextDocumentBuilder();
    const first = builder.build(input(source));
    const second = builder.build(source, {
        goalId,
        runId,
        committedThroughSequence: 16,
    });
    const third = await builder.buildFromStore({
        trajectoryStore: new MemoryTrajectoryStore(source),
        goalId,
        runId,
        committedThroughSequence: 16,
    });

    assert.deepEqual(second, first);
    assert.deepEqual(third.documents, first);
    assert.deepEqual(buildCommittedContextDocuments(input(source)), first);
    assert.deepEqual(buildCommittedContextDocuments(input(source)), first);
});

test("Builder 不把未闭合 execution/preparation 片段拆成文档", () => {
    const incomplete = [
        event(1, {
            phase: "executing",
            executionUnitId: "unit-incomplete",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "tool_call",
                    checkpoint: "incomplete",
                    action: { actionId: "action-1", toolId: "read_file", input: {} },
                },
            },
        }),
        event(2, {
            phase: "gathering_context",
            eventType: "preparation_result",
            payload: { type: "preparation_result", result: "question" },
        }),
    ];

    assert.deepEqual(new ContextDocumentBuilder().build(input(incomplete, 2)), []);
});

test("Builder 对 committed 身份、顺序和结构矛盾 fail-closed", () => {
    const source = committedSource();
    const foreign = event(2, {
        goalId: "foreign-goal",
        phase: "gathering_context",
        eventType: "preparation_result",
        payload: { type: "preparation_result", result: "question" },
    });
    assert.throws(
        () => new ContextDocumentBuilder().build(input([source[0]!, foreign])),
        (error: unknown) => error instanceof ContextDocumentSourceError
            && error.code === "CONTEXT_DOCUMENT_SOURCE_ERROR"
            && /cross-Goal/.test(error.message),
    );

    assert.throws(
        () => new ContextDocumentBuilder().build(input([source[2]!, source[1]!], 3)),
        (error: unknown) => error instanceof ContextDocumentSourceError
            && /strictly ordered/.test(error.message),
    );

    const duplicateDecision = [
        event(1, {
            phase: "executing",
            executionUnitId: "unit-duplicate",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: { kind: "complete", checkpoint: "a", summary: "a" },
            },
        }),
        event(2, {
            phase: "executing",
            executionUnitId: "unit-duplicate",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: { kind: "complete", checkpoint: "b", summary: "b" },
            },
        }),
    ];
    assert.throws(
        () => new ContextDocumentBuilder().build(input(duplicateDecision, 2)),
        (error: unknown) => error instanceof ContextDocumentSourceError
            && /multiple decisions/.test(error.message),
    );
});

test("Builder 不修改调用方事件或数组", () => {
    const source = committedSource();
    const snapshot = structuredClone(source);
    const sourceCopy = [...source];
    new ContextDocumentBuilder().build(input(sourceCopy));
    assert.deepEqual(sourceCopy, snapshot);
    assert.deepEqual(source, snapshot);
});
