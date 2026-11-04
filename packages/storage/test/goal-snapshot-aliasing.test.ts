import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createGoal,
    type AgentProfile,
    type Goal,
} from "../../runtime/src/index";
import { testUserMessage } from "../../runtime/test/current-fixtures";
import {
    goalSnapshotCodec,
    InMemoryGoalStore,
    JsonFileGoalStore,
} from "../src/index";
import { encodePathSegment } from "../src/path-segment";

const profile: AgentProfile = {
    id: "profile-aliasing",
    systemPrompt: "You are a plan agent.",
    instructions: ["keep"],
    toolIds: [],
};

function aliasingGoal(): Goal {
    const goal = createGoal({
        id: "goal-aliasing",
        intent: "alias",
        promptBundleVersion: 1,
        profile,
        runId: "run-aliasing",
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            messages: [testUserMessage("hello", {
                runId: goal.state.run.id,
                position: { afterSequence: 0, order: 0 },
            })],
            run: { ...goal.state.run, mode: "plan" },
            goalPlan: {
                revision: 1,
                items: [
                    { id: "todo-1", content: "original", position: 0, status: "pending" },
                ],
            },
            completedRuns: [{
                runId: "run-previous",
                status: "completed",
                stepCount: 1,
                committedThroughSequence: 2,
                messageRange: { start: 0, end: 1 },
            }],
        },
    };
}

interface MutableGoalShape {
    state: {
        goalPlan: { items: Array<{ content: string }> };
        messages: Array<{ position: { order: number } }>;
        run: { contextEpoch: { number: number } };
        completedRuns: Array<{ messageRange: { start: number } }>;
    };
    definition: { profile: { instructions: string[] } };
}

function mutable(goal: Goal): MutableGoalShape {
    return goal as unknown as MutableGoalShape;
}

test("encode 不共享输入 Goal 的可变嵌套引用", () => {
    const goal = aliasingGoal();
    const snapshot = goalSnapshotCodec.encode(goal);

    mutable(goal).state.goalPlan.items[0]!.content = "mutated";
    mutable(goal).state.messages[0]!.position.order = 99;
    mutable(goal).state.run.contextEpoch.number = 99;
    mutable(goal).state.completedRuns[0]!.messageRange.start = 99;
    mutable(goal).definition.profile.instructions[0] = "mutated";

    assert.equal(snapshot.state.goalPlan?.items[0]?.content, "original");
    assert.equal(snapshot.state.messages[0]?.position.order, 0);
    assert.equal(snapshot.state.run.contextEpoch.number, 0);
    assert.equal(snapshot.state.completedRuns[0]?.messageRange.start, 0);
    assert.deepEqual(snapshot.definition.profile.instructions, ["keep"]);
});

test("decode 不共享输入 Snapshot 的可变嵌套引用", () => {
    const snapshot = goalSnapshotCodec.encode(aliasingGoal());
    const decoded = goalSnapshotCodec.decode(snapshot);

    mutable(decoded).state.goalPlan.items[0]!.content = "mutated";
    mutable(decoded).state.messages[0]!.position.order = 99;
    mutable(decoded).state.run.contextEpoch.number = 99;
    mutable(decoded).state.completedRuns[0]!.messageRange.start = 99;
    mutable(decoded).definition.profile.instructions[0] = "mutated";

    assert.equal(snapshot.state.goalPlan?.items[0]?.content, "original");
    assert.equal(snapshot.state.messages[0]?.position.order, 0);
    assert.equal(snapshot.state.run.contextEpoch.number, 0);
    assert.equal(snapshot.state.completedRuns[0]?.messageRange.start, 0);
    assert.deepEqual(snapshot.definition.profile.instructions, ["keep"]);
});

test("InMemoryGoalStore 的 save/restore 与输入和已存快照隔离", async () => {
    const goal = aliasingGoal();
    const store = new InMemoryGoalStore();
    await store.save(goal);

    mutable(goal).state.goalPlan.items[0]!.content = "input-mutated";
    const first = await store.restore(goal.id);
    assert.equal(first?.state.goalPlan?.items[0]?.content, "original");

    mutable(first!).state.goalPlan.items[0]!.content = "restore-mutated";
    const second = await store.restore(goal.id);
    assert.equal(second?.state.goalPlan?.items[0]?.content, "original");
});

test("JsonFileGoalStore 以 compact JSON 写入并保持往返一致", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-compact-snapshot-"));
    const goal = aliasingGoal();

    try {
        const store = new JsonFileGoalStore(directory);
        await store.save(goal);

        const filePath = join(directory, `${encodePathSegment(goal.id)}.json`);
        const content = await readFile(filePath, "utf8");
        assert.equal(content, `${JSON.stringify(JSON.parse(content))}\n`);
        assert.equal(content.includes("\n  \""), false);

        const restored = await new JsonFileGoalStore(directory).restore(goal.id);
        assert.deepEqual(restored, goal);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
