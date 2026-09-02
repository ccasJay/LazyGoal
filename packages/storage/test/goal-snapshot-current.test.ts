import assert from "node:assert/strict";
import {
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createGoal,
    type AgentProfile,
    type Goal,
} from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import {
    GoalSnapshotProtocolError,
    goalSnapshotCodec,
    JsonFileGoalStore,
} from "../src/index";

const profile: AgentProfile = {
    id: "profile-current",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["检查输入"],
    toolIds: [],
};

function createCurrentGoal(): Goal {
    return createGoal({
        ...currentProtocols,
        id: "goal-current-version",
        intent: "验证当前快照协议",
        promptBundleVersion: 1,
        profile,
        runId: "run-current-version",
    });
}

function assertProtocolError(error: unknown): boolean {
    assert.ok(error instanceof GoalSnapshotProtocolError);
    return true;
}

function snapshotPath(directory: string, goalId: string): string {
    return join(directory, `${Buffer.from(goalId, "utf8").toString("base64url")}.json`);
}

test("historical Goal Snapshot versions are rejected without mutation", () => {
    const encoded = goalSnapshotCodec.encode(createCurrentGoal());

    for (const schemaVersion of [5, 6, 7, 8, 9, 10, 11]) {
        const historical = structuredClone({
            ...encoded,
            metadata: { schemaVersion },
        });
        const beforeDecode = structuredClone(historical);

        assert.throws(
            () => goalSnapshotCodec.decode(historical),
            assertProtocolError,
        );
        assert.deepEqual(historical, beforeDecode);
    }
});

test("JsonFileGoalStore rejects a historical Snapshot without migration or write-back", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-current-snapshot-"));

    try {
        const goal = createCurrentGoal();
        const store = new JsonFileGoalStore(directory);
        await store.save(goal);

        const path = snapshotPath(directory, goal.id);
        const current = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        const historical = {
            ...current,
            metadata: { schemaVersion: 8 },
        };
        await writeFile(path, `${JSON.stringify(historical)}\n`, "utf8");
        const beforeRestore = await readFile(path, "utf8");

        await assert.rejects(store.restore(goal.id), assertProtocolError);
        assert.equal(await readFile(path, "utf8"), beforeRestore);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
