import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createGoal } from "../../runtime/src/index";
import { JsonFileGoalStore } from "../src/index";
import { encodePathSegment } from "../src/path-segment";

const profile = {
    id: "revision-profile",
    systemPrompt: "system",
    instructions: [],
    toolIds: [],
};

test("JsonFileGoalStore.readRevision 使用 hint 并在外部写入后回退恢复", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-goal-revision-"));

    try {
        const store = new JsonFileGoalStore(directory);
        const goal = createGoal({
            id: "goal-revision",
            runId: "run-revision",
            intent: "revision",
            promptBundleVersion: 1,
            profile,
            memoryProtocol: { kind: "structured", version: 1 },
            modelContextProtocol: { kind: "trajectory-layered", version: 1 },
            contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        });
        await store.save(goal);

        assert.equal(await store.readRevision(goal.id), 0);
        assert.equal(await store.readRevision(goal.id), 0);

        const filePath = join(directory, `${encodePathSegment(goal.id)}.json`);
        const snapshot = JSON.parse(await readFile(filePath, "utf8")) as {
            state: { commitRevision?: number };
        };
        snapshot.state.commitRevision = 7;
        await writeFile(filePath, `${JSON.stringify(snapshot)}\n`, "utf8");
        const future = new Date(Date.now() + 1_000);
        await utimes(filePath, future, future);

        assert.equal(await store.readRevision(goal.id), 7);
        assert.equal(await store.readRevision(goal.id), 7);
        assert.equal(await store.readRevision("missing-goal"), undefined);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
