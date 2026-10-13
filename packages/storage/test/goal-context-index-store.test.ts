import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    JsonFileGoalContextIndexStore,
    type GoalContextIndexStore,
} from "../src/goal-context-index-store";
import type { GoalContextIndexSnapshot } from "../../context-retrieval/src/goal-context-index";

function createDummySnapshot(goalId: string, digest = "digest-abc-123"): GoalContextIndexSnapshot {
    return {
        schemaVersion: 1,
        goalId,
        buildId: "build-test-uuid",
        sourceBoundaries: [{ runId: "run-1", committedThroughSequence: 10 }],
        sourceDigest: digest,
        stages: [
            {
                goalId,
                runId: "run-1",
                stageId: "stage-1",
                revision: 1,
                target: "实现模块",
                status: "accepted",
                acceptanceCriteria: ["测试通过"],
                summary: "已完成实现",
                source: { firstSequence: 2, lastSequence: 5, eventIds: ["evt-2", "evt-5"] },
            },
        ],
        notes: [
            {
                goalId,
                runId: "run-1",
                noteId: "note-1",
                revision: 1,
                category: "decision",
                content: "核心选型",
                source: { kind: "agent_decision", summary: "选型结论" },
            },
        ],
        createdAt: 1776000000000,
    };
}

test("TODO 3.7: JsonFileGoalContextIndexStore 原子保存与成功读取", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "goal-index-store-"));
    try {
        const store: GoalContextIndexStore = new JsonFileGoalContextIndexStore(tempDir);
        const goalId = "goal-store-test-1";
        const snapshot = createDummySnapshot(goalId);

        await store.save(snapshot);

        // 验证文件路径格式：<tempDir>/<base64url(goalId)>/goal-index.json
        const encodedGoalId = Buffer.from(goalId).toString("base64url");
        const filePath = join(tempDir, encodedGoalId, "goal-index.json");
        const fileContent = await readFile(filePath, "utf8");
        const rawJson = JSON.parse(fileContent);
        assert.equal(rawJson.goalId, goalId);
        assert.equal(rawJson.schemaVersion, 1);

        // 读取恢复
        const restored = await store.restore(goalId);
        assert.ok(restored !== undefined);
        assert.equal(restored.goalId, goalId);
        assert.equal(restored.sourceDigest, snapshot.sourceDigest);
        assert.equal(restored.stages.length, 1);
        assert.equal(restored.notes.length, 1);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("TODO 3.8: 损坏文件或无效 JSON 自动降级返回 undefined，不抛出崩溃异常", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "goal-index-store-"));
    try {
        const store = new JsonFileGoalContextIndexStore(tempDir);
        const goalId = "goal-corrupted-1";
        const snapshot = createDummySnapshot(goalId);
        await store.save(snapshot);

        // 人为破坏文件内容为非法 JSON
        const encodedGoalId = Buffer.from(goalId).toString("base64url");
        const filePath = join(tempDir, encodedGoalId, "goal-index.json");
        await writeFile(filePath, "{ invalid json content ...", "utf8");

        const restored = await store.restore(goalId);
        assert.equal(restored, undefined, "损坏的缓存应当安全返回 undefined 以便重新构建");
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("TODO 3.9: expectedSourceDigest 或 expectedBoundaries 失配返回 undefined", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "goal-index-store-"));
    try {
        const store = new JsonFileGoalContextIndexStore(tempDir);
        const goalId = "goal-mismatch-1";
        const snapshot = createDummySnapshot(goalId, "digest-version-1");
        await store.save(snapshot);

        // 1. 期望摘要不一致
        const restoredWrongDigest = await store.restore(goalId, {
            expectedSourceDigest: "digest-version-2",
        });
        assert.equal(restoredWrongDigest, undefined, "摘要失配应返回 undefined");

        // 2. 期望边界落后于缓存（缓存超前）
        const restoredLaggingBoundaries = await store.restore(goalId, {
            expectedBoundaries: [{ runId: "run-1", committedThroughSequence: 8 }], // 缓存是 10
        });
        assert.equal(restoredLaggingBoundaries, undefined, "缓存超前当前边界应返回 undefined");

        // 3. 期望边界领先于缓存（缓存过旧）
        const restoredLeadingBoundaries = await store.restore(goalId, {
            expectedBoundaries: [{ runId: "run-1", committedThroughSequence: 12 }], // 缓存是 10
        });
        assert.equal(restoredLeadingBoundaries, undefined, "缓存落后当前边界应返回 undefined");

        // 4. 正确匹配
        const restoredMatch = await store.restore(goalId, {
            expectedSourceDigest: "digest-version-1",
            expectedBoundaries: [{ runId: "run-1", committedThroughSequence: 10 }],
        });
        assert.ok(restoredMatch !== undefined);
        assert.equal(restoredMatch.goalId, goalId);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("TODO 3.10: 删除缓存与幂等性，删除后 restore 返回 undefined", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "goal-index-store-"));
    try {
        const store = new JsonFileGoalContextIndexStore(tempDir);
        const goalId = "goal-delete-test-1";
        const snapshot = createDummySnapshot(goalId);
        await store.save(snapshot);

        assert.ok((await store.restore(goalId)) !== undefined);

        await store.delete(goalId);
        assert.equal(await store.restore(goalId), undefined, "删除后应返回 undefined");

        // 幂等重复删除不报错
        await store.delete(goalId);
        assert.equal(await store.restore(goalId), undefined);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});
