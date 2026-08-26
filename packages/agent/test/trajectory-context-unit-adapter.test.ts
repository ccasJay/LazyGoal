import assert from "node:assert/strict";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
} from "../../runtime/src/index";
import { TrajectoryContextUnitAdapter } from "../src/index";

function event(
    eventType: "run_started" | "action_staged" | "tool_started" | "state_committed",
    executionUnitId?: string,
): TrajectoryEvent {
    const metadata = {
        goalId: "goal-1",
        runId: "run-1",
        phase: "executing" as const,
        eventType,
        ...(executionUnitId === undefined ? {} : { executionUnitId }),
    };

    const payload = eventType === "run_started"
        ? { type: "run_started" as const }
        : eventType === "action_staged"
            ? {
                type: "action_staged" as const,
                action: {
                    actionId: "action-1",
                    toolId: "read_file",
                    input: { path: "README.md" },
                },
                approvalStatus: "approved" as const,
            }
            : eventType === "tool_started"
                ? {
                    type: "tool_started" as const,
                    actionId: "action-1",
                    toolId: "read_file",
                    input: { path: "README.md" },
                }
                : {
                    type: "state_committed" as const,
                    committedThroughSequence: 3,
                };

    return allocateImmutableEvent(
        { ...metadata, payload } as TrajectoryEventDraft,
        1,
    ) as TrajectoryEvent;
}

test("TrajectoryContextUnitAdapter groups contiguous execution events and preserves metadata", () => {
    const source = [
        event("run_started"),
        event("action_staged", "unit-1"),
        event("tool_started", "unit-1"),
        event("state_committed"),
    ];
    const adapter = new TrajectoryContextUnitAdapter();
    const units = adapter.adapt(source);

    assert.equal(units.length, 3);
    assert.deepEqual(
        units.map((unit) => unit.items.map((item) => item.eventType)),
        [["run_started"], ["action_staged", "tool_started"], ["state_committed"]],
    );
    assert.notEqual(units[1]?.items[0], source[1]);
    assert.equal(
        units[1]?.items[0]?.executionUnitId,
        "unit-1",
    );
    assert.equal(
        units[1]?.characterCount,
        JSON.stringify(units[1]?.items).length,
    );
    assert.equal(Object.isFrozen(units), true);
    assert.equal(Object.isFrozen(units[1]?.items), true);
    assert.equal(Object.isFrozen(units[1]?.items[0]), true);
});

test("TrajectoryContextUnitAdapter does not mutate or reuse the input event list", () => {
    const source = [event("run_started")];
    const units = new TrajectoryContextUnitAdapter().adapt(source);

    assert.deepEqual(source[0]?.payload, { type: "run_started" });
    assert.notEqual(units[0]?.items, source);
    assert.notEqual(units[0]?.items[0], source[0]);
});
