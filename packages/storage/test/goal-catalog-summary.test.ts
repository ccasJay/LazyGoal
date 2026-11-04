import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createGoal, type Goal } from "../../runtime/src/index";
import { encodePathSegment } from "../src/path-segment";
import { goalSnapshotCodec, JsonFileGoalStore } from "../src/index";

function goalWithId(id: string): Goal {
    const goal = createGoal({
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        id,
        runId: `run-${id}`,
        intent: `intent-${id}`,
        promptBundleVersion: 1,
        profile: { id: "profile", systemPrompt: "system", instructions: [], toolIds: [] },
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: { phase: "executing" },
            run: {
                ...goal.state.run,
                status: "running",
                committedThroughSequence: 3,
            },
        },
    };
}

function summaryPath(directory: string, id: string): string {
    return join(directory, "catalog", `${encodePathSegment(id)}.json`);
}

function snapshotPath(directory: string, id: string): string {
    return join(directory, `${encodePathSegment(id)}.json`);
}

test("saving a snapshot writes a derived catalog summary with the snapshot fingerprint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-catalog-summary-"));
    try {
        const store = new JsonFileGoalStore(directory);
        const goal = goalWithId("goal-1");
        await store.save(goal);

        const summary = JSON.parse(await readFile(summaryPath(directory, goal.id), "utf8")) as Record<string, unknown>;
        const stats = await stat(snapshotPath(directory, goal.id));

        assert.equal(summary.schemaVersion, 1);
        assert.equal(summary.goalId, goal.id);
        assert.equal(summary.runId, goal.state.run.id);
        assert.equal(summary.intent, goal.definition.intent);
        assert.equal(summary.workflowPhase, "executing");
        assert.equal(summary.runStatus, "running");
        assert.equal(summary.committedThroughSequence, 3);
        assert.equal(summary.commitRevision, goal.state.commitRevision ?? 0);
        assert.equal(summary.snapshotMtimeMs, stats.mtimeMs);
        assert.equal(summary.snapshotSize, stats.size);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});


test("listHistory reads catalog summaries without opening snapshots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-catalog-summary-"));
    try {
        const reads: string[] = [];
        const store = new JsonFileGoalStore(directory, {
            readFile: (async (path: Parameters<typeof readFile>[0], options?: Parameters<typeof readFile>[1]) => {
                reads.push(String(path));
                return readFile(path, options);
            }) as typeof readFile,
        });
        await store.save(goalWithId("goal-1"));
        await store.save(goalWithId("goal-2"));

        reads.length = 0;
        const scan = await store.listHistory();

        assert.deepEqual(scan.entries.map((entry) => entry.goalId).sort(), ["goal-1", "goal-2"]);
        const catalogDirectory = join(directory, "catalog");
        assert.deepEqual(
            reads.filter((path) => !path.startsWith(catalogDirectory)),
            [],
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("listHistory rebuilds a missing, corrupt or fingerprint-mismatched summary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-catalog-summary-"));
    try {
        const store = new JsonFileGoalStore(directory);
        const first = goalWithId("goal-1");
        const second = goalWithId("goal-2");
        await store.save(first);
        await store.save(second);

        await rm(summaryPath(directory, first.id));
        await writeFile(summaryPath(directory, second.id), "{");

        const rebuilt = await store.listHistory();
        assert.equal(
            rebuilt.entries.find((entry) => entry.goalId === first.id)?.intent,
            first.definition.intent,
        );
        assert.equal(
            rebuilt.entries.find((entry) => entry.goalId === second.id)?.intent,
            second.definition.intent,
        );
        assert.equal(
            (JSON.parse(await readFile(summaryPath(directory, first.id), "utf8")) as { goalId: string }).goalId,
            first.id,
        );

        const tampered = JSON.parse(await readFile(summaryPath(directory, second.id), "utf8")) as Record<string, unknown>;
        tampered.snapshotSize = 0;
        await writeFile(summaryPath(directory, second.id), JSON.stringify(tampered));

        const corrected = await store.listHistory();
        assert.equal(
            corrected.entries.find((entry) => entry.goalId === second.id)?.intent,
            second.definition.intent,
        );
        assert.notEqual(
            (JSON.parse(await readFile(summaryPath(directory, second.id), "utf8")) as { snapshotSize: number }).snapshotSize,
            0,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("a catalog summary write failure does not fail the completed snapshot save", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-catalog-summary-"));
    try {
        const store = new JsonFileGoalStore(directory, {
            mkdir: (async (path: Parameters<typeof mkdir>[0], options?: Parameters<typeof mkdir>[1]) => {
                if (String(path).endsWith("catalog")) throw new Error("catalog denied");
                return mkdir(path, options);
            }) as typeof mkdir,
        });
        const goal = goalWithId("goal-1");

        await store.save(goal);

        assert.equal((await store.restore(goal.id))?.id, goal.id);
        await assert.rejects(readFile(summaryPath(directory, goal.id)), { code: "ENOENT" });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
