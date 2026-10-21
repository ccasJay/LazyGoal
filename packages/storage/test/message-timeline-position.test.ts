import assert from "node:assert/strict";
import { test } from "node:test";

import { createGoal, type AgentProfile, type Goal } from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import { GoalSnapshotProtocolError, goalSnapshotCodec } from "../src/index";

const profile: AgentProfile = {
    id: "timeline-position-storage-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: [],
};

function createTimelineGoal(): Goal {
    return createGoal({
        ...currentProtocols,
        id: "goal-timeline-position-storage",
        intent: "存储消息位置",
        promptBundleVersion: 1,
        profile,
        runId: "run-timeline-position-storage",
    });
}

test("Snapshot 编解码保留消息位置且拒绝超出 Run 保存边界的位置", () => {
    const goal = createTimelineGoal();
    const encoded = goalSnapshotCodec.encode(goal);
    assert.deepEqual(encoded.state.messages[0]?.position, { afterSequence: 0, order: 0 });
    assert.deepEqual(goalSnapshotCodec.decode(encoded).state.messages[0]?.position, { afterSequence: 0, order: 0 });

    const corrupted = structuredClone(encoded) as unknown as {
        state: { run: { committedThroughSequence: number }; messages: { position: { afterSequence: number; order: number } }[] };
    };
    corrupted.state.run.committedThroughSequence = 0;
    corrupted.state.messages[0]!.position.afterSequence = 1;
    assert.throws(() => goalSnapshotCodec.decode(corrupted), GoalSnapshotProtocolError);

    const wrongRun = structuredClone(encoded) as unknown as {
        state: { messages: { runId: string }[] };
    };
    wrongRun.state.messages[0]!.runId = "unrelated-run";
    assert.throws(() => goalSnapshotCodec.decode(wrongRun), GoalSnapshotProtocolError);
});
