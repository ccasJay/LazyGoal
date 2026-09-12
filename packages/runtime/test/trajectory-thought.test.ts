import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    assertValidTrajectoryEventDraft,
    freezeTrajectoryEvent,
    TrajectoryProtocolError,
    type TrajectoryEventDraft,
} from "../src/trajectory";
import { JsonFileTrajectoryStore } from "../../storage/src/json-file-trajectory-store";
import { projectTrajectoryEvents } from "../../tui/src/trajectory-projector";

test("Trajectory draft 允许合法字符串思考链并拒绝非法类型", () => {
    const validDraft: TrajectoryEventDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        eventType: "decision_received",
        payload: {
            type: "decision_received",
            decision: { kind: "complete", summary: "done", completionEvidence: [] },
            thought: "推理得出目标已经全部达成。",
        },
    };
    assert.doesNotThrow(() => assertValidTrajectoryEventDraft(validDraft));

    const invalidDraft = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing",
        eventType: "decision_received",
        payload: {
            type: "decision_received",
            decision: { kind: "complete", summary: "done", completionEvidence: [] },
            thought: 12345 as any,
        },
    };
    assert.throws(
        () => assertValidTrajectoryEventDraft(invalidDraft as any),
        (err: unknown) => err instanceof TrajectoryProtocolError && /thought must be a string/.test(err.message),
    );
});

test("JsonFileTrajectoryStore 持久化并准确回读携带思考链的 Trajectory 事件", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-trajectory-thought-"));
    const store = new JsonFileTrajectoryStore(tempDir);

    try {
        const query = { goalId: "goal-cot-1", runId: "run-cot-1" };

        await store.append({
            goalId: "goal-cot-1",
            runId: "run-cot-1",
            phase: "gathering_context",
            eventType: "preparation_result",
            payload: {
                type: "preparation_result",
                result: "question",
                thought: "需要向用户澄清测试范围与边界条件。",
            },
        });

        await store.append({
            goalId: "goal-cot-1",
            runId: "run-cot-1",
            phase: "executing",
            executionUnitId: "exec-unit-1",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "tool_call",
                    action: { toolId: "read_file", actionId: "act-1", input: { path: "a.txt" } },
                },
                thought: "首先阅读 a.txt 了解现有实现结构。",
            },
        });

        const readResult = await store.readWithBoundary(query, 2);
        assert.equal(readResult.committed.length, 2);

        const prepEvent = readResult.committed[0]!;
        assert.equal(prepEvent.eventType, "preparation_result");
        if (prepEvent.payload.type === "preparation_result") {
            assert.equal(prepEvent.payload.thought, "需要向用户澄清测试范围与边界条件。");
        }

        const execEvent = readResult.committed[1]!;
        assert.equal(execEvent.eventType, "decision_received");
        if (execEvent.payload.type === "decision_received") {
            assert.equal(execEvent.payload.thought, "首先阅读 a.txt 了解现有实现结构。");
        }
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("projectTrajectoryEvents 准确将思考链投影至 UiInspectorStep.reasoning 且对缺失项优雅缺省", () => {
    const goalId = "goal-cot-projector";
    const runId = "run-1";

    const committedEvents = [
        freezeTrajectoryEvent({
            eventSchemaVersion: 1,
            sequence: 1,
            eventId: "evt-1",
            goalId,
            runId,
            phase: "gathering_context",
            eventType: "preparation_result",
            occurredAt: "2026-09-12T00:00:00.000Z",
            payload: {
                type: "preparation_result",
                result: "context_ready",
                thought: "已收集足够上下文，准备制定计划。",
            },
        }),
        freezeTrajectoryEvent({
            eventSchemaVersion: 1,
            sequence: 2,
            eventId: "evt-2",
            goalId,
            runId,
            phase: "executing",
            executionUnitId: "unit-with-thought",
            eventType: "decision_received",
            occurredAt: "2026-09-12T00:00:01.000Z",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "tool_call",
                    action: { toolId: "read_file", actionId: "act-1", input: {} },
                },
                thought: "执行阶段思考：需要验证文件内容。",
            },
        }),
        freezeTrajectoryEvent({
            eventSchemaVersion: 1,
            sequence: 3,
            eventId: "evt-3",
            goalId,
            runId,
            phase: "executing",
            executionUnitId: "unit-without-thought",
            eventType: "decision_received",
            occurredAt: "2026-09-12T00:00:02.000Z",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "complete",
                    summary: "无思考链的传统决策",
                    completionEvidence: [],
                },
            },
        }),
    ];

    const steps = projectTrajectoryEvents({
        goalId,
        committedEvents,
    });

    assert.equal(steps.length, 3);

    // Step 1: Preparation
    assert.equal(steps[0]!.title, "Step 1: Preparation & Planning");
    assert.equal(steps[0]!.reasoning, "已收集足够上下文，准备制定计划。");

    // Step 2: unit-with-thought
    assert.equal(steps[1]!.title, "Step 2: Execution (unit-with-thought)");
    assert.equal(steps[1]!.reasoning, "执行阶段思考：需要验证文件内容。");

    // Step 3: unit-without-thought (历史兼容 / 无思考链)
    assert.equal(steps[2]!.title, "Step 3: Execution (unit-without-thought)");
    assert.equal(steps[2]!.reasoning, undefined);
});
