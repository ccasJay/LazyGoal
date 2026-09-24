import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { inspectTuaGepaDataset } from "../src/gepa-inspector.js";

const imageId = `sha256:${"a".repeat(64)}`;

describe("TUA GEPA dataset inspector", () => {
    it("records three explicit partitions, task-family coverage, resource and image identities", async () => {
        const root = await makeRepo();
        try {
            const inspection = await inspectTuaGepaDataset({
                repoRoot: root,
                trainTaskIds: ["train-doc"],
                validationTaskIds: ["validation-doc"],
                holdoutTaskIds: ["holdout-doc"],
            }, dependencies());

            assert.equal(inspection.sourceRevision, "b".repeat(40));
            assert.match(inspection.datasetDigest, /^[a-f0-9]{64}$/u);
            assert.equal(inspection.workingTreeDirty, true);
            assert.deepEqual(inspection.changedPaths, ["tasks/train-doc/instruction.md"]);
            assert.deepEqual(inspection.partitions.train.taskFamilies, ["document"]);
            assert.deepEqual(inspection.partitions.validation.taskIds, ["validation-doc"]);
            assert.deepEqual(inspection.partitions.holdout.networkTasks, ["holdout-doc"]);
            assert.equal(inspection.tasks["train-doc"]?.imageDigest, imageId);
            assert.equal(inspection.tasks["train-doc"]?.taskFamily, "document");
            assert.equal("instruction" in (inspection.tasks["train-doc"] ?? {}), false);
            assert.equal("task" in (inspection.tasks["train-doc"] ?? {}), false);
            assert.match(inspection.tasks["train-doc"]?.resourceDigest ?? "", /^[a-f0-9]{64}$/u);
            assert.equal(JSON.stringify(inspection).includes("SECRET_VERIFIER_TEXT"), false);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("rejects duplicate, overlapping, missing tasks and uncovered families before any runtime work", async () => {
        const root = await makeRepo();
        const injected = dependencies();
        try {
            await assert.rejects(() => inspectTuaGepaDataset({
                repoRoot: root,
                trainTaskIds: ["train-doc", "train-doc"],
                validationTaskIds: ["validation-doc"],
                holdoutTaskIds: ["holdout-doc"],
            }, injected), /duplicate task ID/iu);

            await assert.rejects(() => inspectTuaGepaDataset({
                repoRoot: root,
                trainTaskIds: ["train-doc"],
                validationTaskIds: ["train-doc"],
                holdoutTaskIds: ["holdout-doc"],
            }, injected), /both train and validation/iu);

            await assert.rejects(() => inspectTuaGepaDataset({
                repoRoot: root,
                trainTaskIds: ["missing"],
                validationTaskIds: ["validation-doc"],
                holdoutTaskIds: ["holdout-doc"],
            }, injected), /does not exist or is invalid/iu);

            await assert.rejects(() => inspectTuaGepaDataset({
                repoRoot: root,
                trainTaskIds: ["train-doc", "train-web"],
                validationTaskIds: ["validation-doc"],
                holdoutTaskIds: ["holdout-doc"],
            }, injected), /validation partition does not cover training task families: live-web/iu);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("rejects a missing local image or private verifier source", async () => {
        const root = await makeRepo();
        try {
            await assert.rejects(() => inspectTuaGepaDataset({
                repoRoot: root,
                trainTaskIds: ["train-doc"],
                validationTaskIds: ["validation-doc"],
                holdoutTaskIds: ["holdout-doc"],
            }, {
                inspectImage: async () => null,
                inspectGit: async () => ({ revision: "b".repeat(40), changedPaths: [] }),
            }), /locally prepared Docker image/iu);

            await rm(path.join(root, "tasks", "train-doc", "tests", "test.sh"));
            await assert.rejects(() => inspectTuaGepaDataset({
                repoRoot: root,
                trainTaskIds: ["train-doc"],
                validationTaskIds: ["validation-doc"],
                holdoutTaskIds: ["holdout-doc"],
            }, dependencies()), /missing required resource tests\/test.sh/iu);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});

function dependencies() {
    return {
        inspectImage: async () => imageId,
        inspectGit: async () => ({
            revision: "b".repeat(40),
            changedPaths: ["tasks/train-doc/instruction.md"],
        }),
    };
}

async function makeRepo(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "tua-gepa-inspector-"));
    const tasks = [
        { taskId: "train-doc", family: "document", network: "none" },
        { taskId: "validation-doc", family: "document", network: "none" },
        { taskId: "holdout-doc", family: "document", network: "public" },
        { taskId: "train-web", family: "live-web", network: "public" },
    ];
    for (const task of tasks) {
        const directory = path.join(root, "tasks", task.taskId);
        await mkdir(path.join(directory, "tests"), { recursive: true });
        await writeFile(path.join(directory, "instruction.md"), `Instruction for ${task.taskId}`);
        await writeFile(path.join(directory, "task.toml"), [
            `task_id = "${task.taskId}"`,
            `[metadata]`,
            `category = "${task.family}"`,
            `[environment]`,
            `docker_image = "example/${task.taskId}:latest"`,
            `network_mode = "${task.network}"`,
            `[verifier]`,
            `script = "tests/test.sh"`,
        ].join("\n"));
        await writeFile(path.join(directory, "tests", "test.sh"), "SECRET_VERIFIER_TEXT");
    }
    return root;
}
