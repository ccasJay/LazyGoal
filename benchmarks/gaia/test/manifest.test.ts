import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
    GaiaDatasetLoader,
    GaiaManifestValidationError,
    loadGaiaManifest,
    saveGaiaManifest,
    validateGaiaManifest,
    type GaiaRawMetadataRecord,
} from "../src/index";

const FIXTURE_JSONL = `
{"task_id": "gaia-001", "Question": "What is the capital of France?", "Level": 1, "Final answer": "Paris", "file_name": "france.png"}
{"task_id": "gaia-002", "Question": "Calculate 40 + 2", "Level": 2, "Final answer": "42", "file_name": null}
{"task_id": "gaia-003", "Question": "Summarize the attached document", "Level": 3, "Final answer": "Summary report", "file_name": "doc.pdf"}
`;

test("GaiaDatasetLoader 正确解析 JSONL 并为 validation split 构建完整 Manifest", () => {
    const loader = new GaiaDatasetLoader();
    const records = loader.parseJsonl(FIXTURE_JSONL);
    assert.equal(records.length, 3);

    const manifest = loader.buildManifestFromRecords(records, "validation", "/tmp/gaia-test");
    assert.equal(manifest.source, "huggingface");
    assert.equal(manifest.tasks.length, 3);

    const task1 = manifest.tasks[0]!;
    assert.equal(task1.taskId, "gaia-001");
    assert.equal(task1.question, "What is the capital of France?");
    assert.equal(task1.expectedAnswer, "Paris");
    assert.equal(task1.level, 1);
    assert.equal(task1.split, "validation");
    assert.deepEqual(task1.attachments, ["attachments/gaia-001/france.png"]);

    const task2 = manifest.tasks[1]!;
    assert.equal(task2.taskId, "gaia-002");
    assert.equal(task2.expectedAnswer, "42");
    assert.equal(task2.level, 2);
    assert.deepEqual(task2.attachments, []);

    const task3 = manifest.tasks[2]!;
    assert.equal(task3.level, 3);
    assert.deepEqual(task3.attachments, ["attachments/gaia-003/doc.pdf"]);
});

test("GaiaDatasetLoader 构建 test split 时 expectedAnswer 强制为 null", () => {
    const loader = new GaiaDatasetLoader();
    const records = loader.parseJsonl(FIXTURE_JSONL);
    const manifest = loader.buildManifestFromRecords(records, "test", "/tmp/gaia-test");

    for (const task of manifest.tasks) {
        assert.equal(task.split, "test");
        assert.equal(task.expectedAnswer, null);
    }
});

test("Manifest 序列化与反序列化回环一致性", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "gaia-manifest-test-"));
    try {
        const loader = new GaiaDatasetLoader();
        const records = loader.parseJsonl(FIXTURE_JSONL);
        const manifest = loader.buildManifestFromRecords(records, "validation", tmpDir);

        const manifestFile = join(tmpDir, "manifest.json");
        await saveGaiaManifest(manifestFile, manifest);

        const loaded = await loadGaiaManifest(manifestFile);
        assert.deepEqual(loaded, manifest);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("validateGaiaManifest 拒绝重复 task_id、非法 level 或非法 source", () => {
    const baseValid = {
        source: "huggingface",
        loadedAt: new Date().toISOString(),
        dataRoot: "/tmp/gaia",
        tasks: [
            {
                taskId: "t-1",
                question: "q1",
                expectedAnswer: "a1",
                level: 1,
                split: "validation",
                attachments: [],
            },
        ],
    };

    // 正常通过
    assert.doesNotThrow(() => validateGaiaManifest(baseValid));

    // 非法 source
    assert.throws(
        () => validateGaiaManifest({ ...baseValid, source: "custom" }),
        (err: Error) => err instanceof GaiaManifestValidationError && err.code === "INVALID_SOURCE",
    );

    // 重复 taskId
    assert.throws(
        () =>
            validateGaiaManifest({
                ...baseValid,
                tasks: [baseValid.tasks[0], baseValid.tasks[0]],
            }),
        (err: Error) => err instanceof GaiaManifestValidationError && err.code === "DUPLICATE_TASK_ID",
    );

    // 非法 level
    assert.throws(
        () =>
            validateGaiaManifest({
                ...baseValid,
                tasks: [{ ...baseValid.tasks[0], level: 4 }],
            }),
        (err: Error) => err instanceof GaiaManifestValidationError && err.code === "INVALID_LEVEL",
    );
});

test("GaiaDatasetLoader downloadSplit 在 mock fetch 下正确保存并返回 Manifest", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "gaia-download-test-"));
    try {
        const mockFetch: typeof fetch = async (input, init) => {
            return new Response(FIXTURE_JSONL, {
                status: 200,
                headers: { "content-type": "text/plain" },
            });
        };

        const loader = new GaiaDatasetLoader({ hfToken: "fake-token", fetchFn: mockFetch });
        const manifest = await loader.downloadSplit("validation", tmpDir);

        assert.equal(manifest.tasks.length, 3);
        assert.equal(manifest.dataRoot, tmpDir);

        const loaded = await loadGaiaManifest(join(tmpDir, "manifest-validation.json"));
        assert.equal(loaded.tasks.length, 3);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

