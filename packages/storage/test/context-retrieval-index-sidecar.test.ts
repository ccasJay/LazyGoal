import assert from "node:assert/strict";
import {
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    CONTEXT_RETRIEVAL_INDEX_VERSION,
    buildContextRetrievalIndexSidecar,
} from "../../runtime/src/index";
import {
    ContextRetrievalIndexSidecarProtocolError,
    JsonFileContextRetrievalIndexStore,
    contextRetrievalIndexSidecarCodec,
} from "../src/index";

const goalId = "goal-sidecar";
const runId = "run-sidecar";

test("Retrieval Index Sidecar Codec 拒绝多余字段并隔离冻结输入", () => {
    const input = sidecar();
    const encoded = contextRetrievalIndexSidecarCodec.encode(input);

    assert.deepEqual(encoded, input);
    assert.notEqual(encoded, input);
    assert.equal(Object.isFrozen(encoded), true);
    assert.equal(Object.isFrozen(encoded.index), true);
    assert.equal(Object.isFrozen(encoded.queryCache), true);
    assert.throws(
        () => contextRetrievalIndexSidecarCodec.decode({ ...input, extra: true }),
        (error: unknown) => error instanceof ContextRetrievalIndexSidecarProtocolError,
    );
    assert.throws(
        () => contextRetrievalIndexSidecarCodec.encode({
            ...input,
            rankingVersion: "unknown-ranking",
        } as unknown as typeof input),
        /version/,
    );
});

test("JsonFileContextRetrievalIndexStore 原子保存、权限和 restore 边界校验", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-retrieval-sidecar-"));
    t.after(async () => rm(directory, { recursive: true, force: true }));
    const store = new JsonFileContextRetrievalIndexStore(directory);
    const input = sidecar();

    await store.save(input);
    const restored = await store.restore(goalId, runId, {
        committedThroughSequence: 0,
        indexVersion: CONTEXT_RETRIEVAL_INDEX_VERSION,
        expectedSourceDigest: input.sourceDigest,
    });
    assert.deepEqual(restored, input);

    assert.equal(await store.restore(goalId, runId, {
        committedThroughSequence: 0,
        expectedSourceDigest: "sha256:" + "0".repeat(64),
    }), undefined);
    assert.notEqual(await store.restore(goalId, runId, {
        committedThroughSequence: 1,
        expectedSourceDigest: "sha256:" + "0".repeat(64),
    }), undefined);
    assert.notEqual(await store.restore(goalId, runId, {
        committedThroughSequence: 1,
    }), undefined);
    await store.save(sidecar(2));
    assert.equal(await store.restore(goalId, runId, {
        committedThroughSequence: 1,
    }), undefined);

    const goalDirectory = join(directory, Buffer.from(goalId).toString("base64url"));
    const runDirectory = join(goalDirectory, Buffer.from(runId).toString("base64url"));
    const filePath = join(runDirectory, "retrieval-v1.json");
    assert.equal((await stat(goalDirectory)).mode & 0o777, 0o700);
    assert.equal((await stat(runDirectory)).mode & 0o777, 0o700);
    assert.equal((await stat(filePath)).mode & 0o777, 0o600);
    assert.deepEqual((await readdir(runDirectory)).filter((name) => name.endsWith(".tmp")), []);
    assert.match(await readFile(filePath, "utf8"), /"schemaVersion": 1/);
});

test("缺失、损坏和删除重建路径不修改领域状态", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-retrieval-invalid-"));
    t.after(async () => rm(directory, { recursive: true, force: true }));
    const store = new JsonFileContextRetrievalIndexStore(directory);

    assert.equal(await store.restore(goalId, runId), undefined);
    await store.save(sidecar());
    const filePath = join(
        directory,
        Buffer.from(goalId).toString("base64url"),
        Buffer.from(runId).toString("base64url"),
        "retrieval-v1.json",
    );
    await writeFile(filePath, "{broken", "utf8");
    assert.equal(await store.restore(goalId, runId), undefined);
    await store.remove(goalId, runId);
    await store.remove(goalId, runId);
    assert.equal(await store.restore(goalId, runId), undefined);
});

test("同目录下遗留的旧 warm-v1.json 文件不被处理，Retrieval Index 仍正常读写且旧文件完好", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-retrieval-legacy-warm-"));
    t.after(async () => rm(directory, { recursive: true, force: true }));
    const store = new JsonFileContextRetrievalIndexStore(directory);

    const goalDir = join(directory, Buffer.from(goalId).toString("base64url"));
    const runDir = join(goalDir, Buffer.from(runId).toString("base64url"));
    await mkdir(runDir, { recursive: true });
    const legacyWarmFile = join(runDir, "warm-v1.json");
    const legacyContent = JSON.stringify({ schemaVersion: 1, legacy: "historical-warm-data" });
    await writeFile(legacyWarmFile, legacyContent, "utf8");

    const input = sidecar(1);
    await store.save(input);

    const restored = await store.restore(goalId, runId, {
        committedThroughSequence: 1,
        indexVersion: CONTEXT_RETRIEVAL_INDEX_VERSION,
        expectedSourceDigest: input.sourceDigest,
    });

    assert.ok(restored !== undefined);
    assert.equal(restored.sourceDigest, input.sourceDigest);

    // 验证旧 warm-v1.json 完全没有被读取、修改或删除
    const currentWarmContent = await readFile(legacyWarmFile, "utf8");
    assert.equal(currentWarmContent, legacyContent);
});

function sidecar(boundary = 0) {
    return buildContextRetrievalIndexSidecar({
        goalId,
        runId,
        committedThroughSequence: boundary,
        events: [],
        messages: [],
        conversationStartIndex: 0,
    });
}
