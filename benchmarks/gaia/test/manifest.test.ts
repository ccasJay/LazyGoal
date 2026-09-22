import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
    GaiaDatasetLoader,
    GaiaManifestValidationError,
    loadGaiaManifest,
    materializeGaiaSingleTask,
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

test("materializeGaiaSingleTask 只输出指定的 Level 1/2 validation 任务", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "gaia-single-task-test-"));
    try {
        const loader = new GaiaDatasetLoader();
        const writeSource = async (records: readonly GaiaRawMetadataRecord[], split: "validation" | "test") => {
            const manifest = loader.buildManifestFromRecords(records, split, tmpDir);
            const manifestPath = join(tmpDir, `${split}-${records[0]?.task_id ?? "empty"}.json`);
            await saveGaiaManifest(manifestPath, manifest);
            return manifestPath;
        };
        const source = loader.buildManifestFromRecords(
            [
                {
                    task_id: "gaia-001",
                    Question: "What is the capital of France?",
                    Level: 1,
                    "Final answer": "Paris",
                },
                {
                    task_id: "gaia-002",
                    Question: "Requires multi-step reasoning",
                    Level: 2,
                    "Final answer": "42",
                },
            ],
            "validation",
            tmpDir,
        );
        const sourcePath = join(tmpDir, "source.json");
        const outputPath = join(tmpDir, "single.json");
        await saveGaiaManifest(sourcePath, source);

        const materialized = await materializeGaiaSingleTask({
            sourceManifestPath: sourcePath,
            taskId: "gaia-001",
            outputPath,
        });

        assert.equal(materialized.tasks.length, 1);
        assert.equal(materialized.tasks[0]?.taskId, "gaia-001");
        const level2 = await materializeGaiaSingleTask({
            sourceManifestPath: sourcePath,
            taskId: "gaia-002",
            outputPath: join(tmpDir, "level2-single.json"),
        });
        assert.equal(level2.tasks[0]?.level, 2);

        await mkdir(join(tmpDir, "attachments", "gaia-attachment"), { recursive: true });
        await writeFile(join(tmpDir, "attachments", "gaia-attachment", "doc.pdf"), "fixture");
        const attachmentSource = await writeSource([
            {
                task_id: "gaia-attachment",
                Question: "Read the attached document",
                Level: 2,
                "Final answer": "Document",
                file_name: "doc.pdf",
            },
        ], "validation");
        const withAttachment = await materializeGaiaSingleTask({
            sourceManifestPath: attachmentSource,
            taskId: "gaia-attachment",
            outputPath: join(tmpDir, "attachment-single.json"),
        });
        assert.deepEqual(withAttachment.tasks[0]?.attachments, [
            "attachments/gaia-attachment/doc.pdf",
        ]);
        assert.deepEqual((await loadGaiaManifest(sourcePath)).tasks, source.tasks);
        assert.deepEqual((await loadGaiaManifest(outputPath)).tasks, materialized.tasks);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("materializeGaiaSingleTask 拒绝非 validation、Level 3 和缺失答案任务", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "gaia-single-task-invalid-"));
    try {
        const loader = new GaiaDatasetLoader();
        const writeSource = async (records: readonly GaiaRawMetadataRecord[], split: "validation" | "test") => {
            const source = loader.buildManifestFromRecords(records, split, tmpDir);
            const sourcePath = join(tmpDir, `${split}-${records[0]?.task_id ?? "empty"}.json`);
            await saveGaiaManifest(sourcePath, source);
            return sourcePath;
        };

        const testSource = await writeSource([
            { task_id: "test-task", Question: "q", Level: 1, "Final answer": "a" },
        ], "test");
        await assert.rejects(
            materializeGaiaSingleTask({
                sourceManifestPath: testSource,
                taskId: "test-task",
                outputPath: join(tmpDir, "test-out.json"),
            }),
            (error: Error) => error instanceof GaiaManifestValidationError && error.code === "UNSUPPORTED_SINGLE_TASK",
        );

        const levelSource = await writeSource([
            { task_id: "level-task", Question: "q", Level: 3, "Final answer": "a" },
        ], "validation");
        await assert.rejects(
            materializeGaiaSingleTask({
                sourceManifestPath: levelSource,
                taskId: "level-task",
                outputPath: join(tmpDir, "level-out.json"),
            }),
            (error: Error) => error instanceof GaiaManifestValidationError && error.code === "UNSUPPORTED_SINGLE_TASK",
        );

        const noAnswerSource = await writeSource([
            { task_id: "missing-answer", Question: "q", Level: 1 },
        ], "validation");
        await assert.rejects(
            materializeGaiaSingleTask({
                sourceManifestPath: noAnswerSource,
                taskId: "missing-answer",
                outputPath: join(tmpDir, "missing-answer-out.json"),
            }),
            (error: Error) => error instanceof GaiaManifestValidationError && error.code === "INVALID_TASK",
        );

        const missingAttachmentSource = await writeSource([
            {
                task_id: "missing-attachment",
                Question: "q",
                Level: 2,
                "Final answer": "a",
                file_name: "missing.pdf",
            },
        ], "validation");
        await assert.rejects(
            materializeGaiaSingleTask({
                sourceManifestPath: missingAttachmentSource,
                taskId: "missing-attachment",
                outputPath: join(tmpDir, "missing-attachment-out.json"),
            }),
            (error: Error) => error instanceof GaiaManifestValidationError && error.code === "ATTACHMENT_NOT_FOUND",
        );
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("validateGaiaManifest 拒绝相对 dataRoot 和空 tasks", () => {
    const baseValid = {
        source: "huggingface",
        loadedAt: new Date().toISOString(),
        dataRoot: "/tmp/gaia",
        tasks: [{
            taskId: "t-1",
            question: "q1",
            expectedAnswer: "a1",
            level: 1,
            split: "validation",
            attachments: [],
        }],
    } as const;

    assert.throws(
        () => validateGaiaManifest({ ...baseValid, dataRoot: "relative/gaia" }),
        (error: Error) => error instanceof GaiaManifestValidationError && error.code === "INVALID_DATA_ROOT",
    );
    assert.throws(
        () => validateGaiaManifest({ ...baseValid, tasks: [] }),
        (error: Error) => error instanceof GaiaManifestValidationError && error.code === "EMPTY_TASKS",
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
