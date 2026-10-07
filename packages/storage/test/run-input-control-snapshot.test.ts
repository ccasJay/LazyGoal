import assert from "node:assert/strict";
import { test } from "node:test";

import { createGoal, type AgentProfile } from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import { goalSnapshotCodec, GoalSnapshotProtocolError } from "../src/index";

const profile: AgentProfile = {
    id: "snapshot-profile",
    systemPrompt: "Test",
    instructions: [],
    toolIds: [],
};

function createGoalWithSteer() {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-snapshot-steer",
        intent: "Snapshot Steer",
        profile,
        runId: "run-snapshot-steer",
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                steerInputs: [
                    { messageId: "message-1", status: "pending" as const, content: "保留接口" },
                    { messageId: "message-2", status: "applied" as const, messageIndex: 0 },
                ],
            },
        },
    };
}

test("Snapshot round-trips pending Steer bodies and applied message positions", () => {
    const goal = createGoalWithSteer();
    const restored = goalSnapshotCodec.decode(goalSnapshotCodec.encode(goal));
    assert.deepEqual(restored.state.run.steerInputs, goal.state.run.steerInputs);
});

test("Snapshot rejects duplicate Steer identities and applied positions that do not point to user messages", () => {
    const goal = createGoalWithSteer();
    const duplicate = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                steerInputs: [
                    { messageId: "same", status: "pending" as const, content: "one" },
                    { messageId: "same", status: "pending" as const, content: "two" },
                ],
            },
        },
    };
    assert.throws(() => goalSnapshotCodec.encode(duplicate), GoalSnapshotProtocolError);

    const invalidPosition = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                steerInputs: [{ messageId: "message-2", status: "applied" as const, messageIndex: 5 }],
            },
        },
    };
    assert.throws(() => goalSnapshotCodec.encode(invalidPosition), GoalSnapshotProtocolError);
});
