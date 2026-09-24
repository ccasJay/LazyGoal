import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { auditTuaGepaCandidate, inspectTuaGepaDataset } from "../src/gepa-inspector.js";

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
            assert.equal(JSON.stringify(inspection).includes("private_verifier_marker_7642"), false);
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

    it("blocks literal task, answer, verifier and private filename leakage without returning matched text", async () => {
        const root = await makeRepo();
        try {
            const systemPrompt = "Solve train-doc carefully.";
            const instructions = [
                "Use answer/expected.json and run_private_verifier_marker_7642_before_authoritative_score.",
                "The expected answer is private_expected_answer_91371.",
            ];
            const audit = await auditTuaGepaCandidate({
                repoRoot: root,
                taskIds: ["train-doc", "validation-doc"],
                candidateId: candidateId(systemPrompt, instructions),
                systemPrompt,
                instructions,
            });

            assert.deepEqual(audit.auditedTaskIds, ["train-doc", "validation-doc"]);
            assert.equal(audit.positiveConclusionBlocked, true);
            assert.deepEqual(new Set(audit.findings.map((finding) => finding.matchKind)), new Set([
                "task_id",
                "private_filename",
                "expected_answer",
                "verifier_content",
            ]));
            const serialized = JSON.stringify(audit);
            assert.equal(serialized.includes("private_expected_answer_91371"), false);
            assert.equal(serialized.includes("private_verifier_marker_7642"), false);
            assert.equal(serialized.includes("answer/expected.json"), false);
            assert.equal(serialized.includes("holdout-doc"), false);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("allows a clean candidate and rejects missing or duplicated audit task IDs", async () => {
        const root = await makeRepo();
        try {
            const systemPrompt = "Solve the task using authorized tools.";
            const instructions = ["Inspect the workspace and verify the final state."];
            const request = {
                repoRoot: root,
                taskIds: ["train-doc", "validation-doc"],
                candidateId: candidateId(systemPrompt, instructions),
                systemPrompt,
                instructions,
            };
            const audit = await auditTuaGepaCandidate(request);
            assert.deepEqual(audit.findings, []);
            assert.equal(audit.positiveConclusionBlocked, false);

            const requestPath = path.join(root, "audit-request.json");
            await writeFile(requestPath, JSON.stringify(request));
            const cliOutput = execFileSync(process.execPath, [
                fileURLToPath(new URL("../../../bin/lazygoal.cjs", import.meta.url)),
                "gepa",
                "audit-tua-candidate",
                "--request",
                requestPath,
            ], { cwd: root, encoding: "utf8" });
            const cliResult = JSON.parse(cliOutput) as typeof audit;
            assert.equal(cliResult.candidateId, request.candidateId);
            assert.deepEqual(cliResult.auditedTaskIds, ["train-doc", "validation-doc"]);
            assert.deepEqual(cliResult.findings, []);

            await assert.rejects(() => auditTuaGepaCandidate({
                ...request,
                taskIds: ["missing-task"],
            }), /does not exist or is ambiguous/iu);
            await assert.rejects(() => auditTuaGepaCandidate({
                ...request,
                taskIds: ["train-doc", "train-doc"],
            }), /duplicate task ID/iu);
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
        await writeFile(path.join(directory, "tests", "test.sh"), "run_private_verifier_marker_7642_before_authoritative_score");
        if (task.taskId === "train-doc") {
            await mkdir(path.join(directory, "answer"), { recursive: true });
            await writeFile(path.join(directory, "answer", "expected.json"), JSON.stringify({
                expected: "private_expected_answer_91371",
            }));
        }
    }
    return root;
}

function candidateId(systemPrompt: string, instructions: readonly string[]): string {
    return createHash("sha256")
        .update(JSON.stringify({ systemPrompt, instructions }), "utf8")
        .digest("hex");
}
