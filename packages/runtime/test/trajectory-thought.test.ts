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
            phase: "executing",
            executionUnitId: "exec-unit-0",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "ask_user",
                    questions: [{
                        header: "范围",
                        question: "需要向用户澄清测试范围与边界条件。",
                        options: [{ label: "完整范围" }, { label: "最小范围" }],
                        multiSelect: false,
                    }],
                },
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

        const firstEvent = readResult.committed[0]!;
        assert.equal(firstEvent.eventType, "decision_received");
        if (firstEvent.payload.type === "decision_received") {
            assert.equal(firstEvent.payload.thought, "需要向用户澄清测试范围与边界条件。");
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
