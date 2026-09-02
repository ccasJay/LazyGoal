import assert from "node:assert/strict";
import { test } from "node:test";

import {
    HotWindowSelector,
    ModelContextSourceError,
    TrajectoryExecutionUnitAdapter,
} from "../src/index";
import type {
    AgentDecision,
    TrajectoryEvent,
    TrajectoryEventDraft,
} from "../../runtime/src/index";
import {
    allocateImmutableEvent,
} from "../../runtime/src/index";

test("Adapter 只投影 committed boundary 内的完整 Tool execution unit", () => {
    const source = [
        event(1, {
            eventType: "run_started",
            payload: { type: "run_started" },
        }),
        event(2, {
            unitId: "unit-tool",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: toolDecision(),
            },
        }),
        event(3, {
            unitId: "unit-tool",
            eventType: "action_staged",
            payload: {
                type: "action_staged",
                action: toolDecision().action,
                approvalStatus: "approved",
            },
        }),
        event(4, {
            unitId: "unit-tool",
            eventType: "tool_started",
            payload: {
                type: "tool_started",
                actionId: "action-tool",
                toolId: "echo",
                input: {},
            },
        }),
        event(5, {
            unitId: "unit-tool",
            eventType: "tool_finished",
            payload: {
                type: "tool_finished",
                actionId: "action-tool",
                toolId: "echo",
                observation: { kind: "success", output: "ok", summary: "done" },
            },
        }),
        event(6, {
            unitId: "unit-tool",
            eventType: "observation_recorded",
            payload: {
                type: "observation_recorded",
                actionId: "action-tool",
                observation: { kind: "success", output: "ok", summary: "done" },
            },
        }),
        event(7, {
            eventType: "state_committed",
            payload: { type: "state_committed", committedThroughSequence: 6 },
        }),
        event(8, {
            unitId: "tail-unit",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "complete",
                    summary: "not committed",
                    completionEvidence: [],
                },
            },
        }),
    ];

    const units = new TrajectoryExecutionUnitAdapter().adapt(source, {
        committedThroughSequence: 6,
        goalId: "goal-1",
        runId: "run-1",
    });

    assert.equal(units.length, 1);
    assert.equal(units[0]?.executionUnitId, "unit-tool");
    assert.deepEqual(
        units[0]?.events.map((item) => item.eventType),
        ["decision_received", "action_staged", "tool_started", "tool_finished", "observation_recorded"],
    );
    assert.equal(units[0]?.firstSequence, 2);
    assert.equal(units[0]?.lastSequence, 6);
    assert.equal(units[0]?.events, units[0]?.items);
    assert.equal(Object.isFrozen(units), true);
    assert.equal(Object.isFrozen(units[0]?.events), true);
});

test("Adapter 保留完整的非 Tool Decision，排除生命周期、marker 和不完整单元", () => {
    const source = [
        event(1, {
            unitId: "unit-complete",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "complete",
                    summary: "finished",
                    completionEvidence: [],
                },
            },
        }),
        event(2, {
            unitId: "unit-complete",
            eventType: "run_completed",
            payload: { type: "run_completed", summary: "finished" },
        }),
        event(3, {
            unitId: "unit-waiting",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "wait",
                    reason: "need input",
                },
            },
        }),
        event(4, {
            unitId: "unit-waiting",
            eventType: "run_waiting",
            payload: { type: "run_waiting", reason: "need input" },
        }),
        event(5, {
            unitId: "unit-incomplete",
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "complete",
                    summary: "incomplete",
                    completionEvidence: [],
                },
            },
        }),
        event(6, {
            eventType: "state_committed",
            payload: { type: "state_committed", committedThroughSequence: 6 },
        }),
    ];

    const units = new TrajectoryExecutionUnitAdapter().adapt(source, 6);

    assert.deepEqual(
        units.map((unit) => unit.executionUnitId),
        ["unit-complete", "unit-waiting"],
    );
});

test("Adapter 拒绝跨身份、乱序和非连续 execution unit", () => {
    const complete = (sequence: number, unitId: string, goalId = "goal-1") =>
        event(sequence, {
            goalId,
            unitId,
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "complete",
                    summary: "done",
                    completionEvidence: [],
                },
            },
        });

    assert.throws(
        () => new TrajectoryExecutionUnitAdapter().adapt([
            complete(1, "unit-a"),
            complete(2, "unit-b", "goal-2"),
        ], 2),
        (error: unknown) => error instanceof ModelContextSourceError
            && /cross-Goal/.test(error.message),
    );

    assert.throws(
        () => new TrajectoryExecutionUnitAdapter().adapt([
            complete(2, "unit-a"),
            complete(1, "unit-b"),
        ], 2),
        /strictly ordered/,
    );

    assert.throws(
        () => new TrajectoryExecutionUnitAdapter().adapt([
            complete(1, "unit-a"),
            complete(2, "unit-b"),
            complete(3, "unit-a"),
        ], 3),
        /not contiguous/,
    );
});

test("HotWindowSelector 在首个超限单元停止且不强制保留超大的最新单元", () => {
    const selector = new HotWindowSelector({
        unit: "character",
        estimate: (value: unknown) => (value as { size: number }).size,
    });
    const units = [{ size: 2 }, { size: 3 }, { size: 8 }, { size: 1 }];

    const result = selector.select(units, { budget: 10, project: (unit) => unit });
    assert.deepEqual(result.selected, [units[2], units[3]]);
    assert.deepEqual(result.omitted, [units[0], units[1]]);
    assert.equal(result.used, 9);
    assert.equal(result.stoppedAtIndex, 1);

    const oversized = selector.select([{ size: 10 }], { budget: 6 });
    assert.deepEqual(oversized.selected, []);
    assert.deepEqual(oversized.omitted, [{ size: 10 }]);
    assert.equal(oversized.stoppedAtIndex, 0);
});

test("HotWindowSelector 不跳过无法容纳的较新单元并保持输入不变", () => {
    const selector = new HotWindowSelector({
        unit: "character",
        estimate: (value: unknown) => (value as { size: number }).size,
    });
    const units = [{ size: 1 }, { size: 10 }, { size: 1 }];
    const before = structuredClone(units);

    const result = selector.select(units, 3, (unit) => unit);

    assert.deepEqual(result.selected, [units[2]]);
    assert.deepEqual(result.omitted, [units[0], units[1]]);
    assert.deepEqual(units, before);
});

function toolDecision(): Extract<AgentDecision, { readonly kind: "tool_call" }> {
    return {
        kind: "tool_call",
        action: {
            actionId: "action-tool",
            toolId: "echo",
            input: {},
        },
    };
}

function event(
    sequence: number,
    input: {
        readonly eventType: TrajectoryEventDraft["eventType"];
        readonly payload: TrajectoryEventDraft["payload"];
        readonly unitId?: string;
        readonly goalId?: string;
        readonly runId?: string;
    },
): TrajectoryEvent {
    const draft = {
        goalId: input.goalId ?? "goal-1",
        runId: input.runId ?? "run-1",
        phase: "executing" as const,
        ...(input.unitId === undefined ? {} : { executionUnitId: input.unitId }),
        eventType: input.eventType,
        payload: input.payload,
    } as TrajectoryEventDraft;

    return allocateImmutableEvent(draft, sequence, `event-${sequence}`) as TrajectoryEvent;
}
