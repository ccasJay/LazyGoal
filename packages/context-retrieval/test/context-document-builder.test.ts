import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ContextDocumentBuilder,
    ContextDocumentSourceError,
    buildCommittedContextDocuments,
    type ContextDocumentBuildInput,
    type ContextRetrievalTrajectoryEvent,
} from "../src/index";

const goalId = "goal-document-builder";
const runId = "run-document-builder";

function event(
    sequence: number,
    draft: {
        readonly goalId?: string;
        readonly runId?: string;
        readonly phase?: string;
        readonly executionUnitId?: string;
        readonly actionId?: string;
        readonly eventType: string;
        readonly payload: Record<string, unknown>;
    },
): ContextRetrievalTrajectoryEvent {
    return {
        eventSchemaVersion: 1,
        eventId: `document-event-${sequence}`,
        sequence,
        occurredAt: "2026-04-14T00:00:00.000Z",
        goalId: draft.goalId ?? goalId,
        runId: draft.runId ?? runId,
        phase: draft.phase ?? "executing",
        eventType: draft.eventType,
        payload: draft.payload,
        ...(draft.executionUnitId === undefined ? {} : { executionUnitId: draft.executionUnitId }),
        ...(draft.actionId === undefined ? {} : { actionId: draft.actionId }),
    };
}

function committedSource(): readonly ContextRetrievalTrajectoryEvent[] {
    return [
        event(1, {
            phase: "executing",
            executionUnitId: "unit-tool",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "tool_call",
                    action: {
                        actionId: "action-read",
                        toolId: "read_file",
                        input: { filePath: "src/index.ts", objectId: "obj-7" },
                    },
                },
            },
        }),
        event(2, {
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
        event(3, {
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
        event(4, {
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
        event(5, {
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
        event(6, {
            phase: "executing",
            eventType: "state_committed",
            payload: { type: "state_committed", committedThroughSequence: 5 },
        }),
        event(7, {
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
        event(8, {
            phase: "executing",
            eventType: "state_committed",
            payload: { type: "state_committed", committedThroughSequence: 7 },
        }),
        event(9, {
            phase: "executing",
            executionUnitId: "tail-unit",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: { kind: "complete", summary: "tail", completionEvidence: [] },
            },
        }),
    ];
}

function input(events: readonly ContextRetrievalTrajectoryEvent[], boundary = 7): ContextDocumentBuildInput {
    return {
        goalId,
        runId,
        committedThroughSequence: boundary,
        events,
    };
}

class MemoryTrajectoryStore {
    constructor(private readonly events: readonly ContextRetrievalTrajectoryEvent[]) {}

    async readWithBoundary(
        query: { readonly goalId: string; readonly runId: string },
        committedThroughSequence: number,
    ): Promise<Readonly<{ readonly committed: readonly ContextRetrievalTrajectoryEvent[] }>> {
        return {
            committed: this.events.filter((event) =>
                event.goalId === query.goalId
                && event.runId === query.runId
                && event.sequence <= committedThroughSequence,
            ),
        };
    }
}

test("Builder 只从 committed 来源构建完整 execution 文档", () => {
    const source = committedSource();
    const result = new ContextDocumentBuilder().buildResult(input(source));

    assert.equal(result.documents.length, 1);
    assert.deepEqual(
        result.documents.map((document) => [document.kind, document.firstSequence, document.lastSequence]),
        [
            ["execution", 1, 5],
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
        "document-event-1",
        "document-event-2",
        "document-event-3",
        "document-event-4",
        "document-event-5",
    ]);
    assert.equal(execution.body, execution.fields.body);
    assert.equal(execution.body.includes("context_lookup_requested"), false);
    assert.equal(execution.body.includes("document-event-9"), false);
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
        committedThroughSequence: 7,
    });
    const third = await builder.buildFromStore({
        trajectoryStore: new MemoryTrajectoryStore(source),
        goalId,
        runId,
        committedThroughSequence: 7,
    });

    assert.deepEqual(second, first);
    assert.deepEqual(third.documents, first);
    assert.deepEqual(buildCommittedContextDocuments(input(source)), first);
});

test("Builder 不把未闭合 execution 片段拆成文档", () => {
    const incomplete = [
        event(1, {
            phase: "executing",
            executionUnitId: "unit-incomplete",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "tool_call",
                    action: { actionId: "action-1", toolId: "read_file", input: {} },
                },
            },
        }),
    ];

    assert.deepEqual(new ContextDocumentBuilder().build(input(incomplete, 1)), []);
});

test("Builder 对 committed 身份、顺序和结构矛盾 fail-closed", () => {
    const source = committedSource();
    const foreign = event(2, {
        goalId: "foreign-goal",
        phase: "executing",
        executionUnitId: "unit-tool",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: "action-read",
            observation: { kind: "success", output: {}, summary: "ok" },
        },
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
                decision: { kind: "complete", summary: "a", completionEvidence: [] },
            },
        }),
        event(2, {
            phase: "executing",
            executionUnitId: "unit-duplicate",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: { kind: "complete", summary: "b", completionEvidence: [] },
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
