import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { applyGrades, runSwebenchEvaluation, preflightSwebench, type SwebenchEvaluationOptions } from "../src/evaluation.js";
import { SWEBENCH_VERSION, type SwebenchManifest } from "../src/manifest.js";
import type { ProcessRunner } from "../src/process.js";
import type { WorkerArtifact, WorkerManifest } from "../src/worker-builder.js";
import { SWE_ACP_PROFILE } from "../src/worker-runtime.js";

const ids = ["astropy__astropy-12907", "astropy__astropy-13033"];
const manifest: SwebenchManifest = {
    dataset: "princeton-nlp/SWE-bench_Verified", revision: "a".repeat(40), instanceIds: ids,
    maxSteps: 1, taskTimeoutSeconds: 30, testTimeoutSeconds: 30,
};
const patch = "diff --git a/f.py b/f.py\n--- a/f.py\n+++ b/f.py\n@@ -1 +1 @@\n-bad\n+good\n";
const ok = { code: 0, stdout: "", stderr: "" };
const workerManifest: WorkerManifest = {
    manifestVersion: 1, entryPoint: "benchmarks/swebench/src/worker.ts", workerFile: "worker.mjs", nodeFile: "node",
    workerSha256: "b".repeat(64), sourceDigest: "c".repeat(64), lockDigest: "d".repeat(64), promptDigest: "e".repeat(64), buildDigest: "f".repeat(64),
    nodeVersion: "22.22.2", nodeImage: "node:22.22.2-bookworm-slim", nodeImageId: "sha256:" + "1".repeat(64), nodeSha256: "2".repeat(64),
    platform: "linux/amd64", acpProtocolVersion: 1, acpSdkVersion: "1.4.0", promptAssets: [],
};
const workerArtifact: WorkerArtifact = {
    digest: "3".repeat(64), directory: "/tmp/worker", workerPath: "/tmp/worker/worker.mjs", nodePath: "/tmp/worker/node",
    manifestPath: "/tmp/worker/manifest.json", manifest: workerManifest, cacheHit: false,
};

async function fixture(t: TestContext, changes: {
    readonly gradingFails?: boolean;
    readonly exportFails?: boolean;
    readonly setupFails?: boolean;
    readonly emptyPatch?: boolean;
    readonly complete?: boolean;
    readonly onGenerate?: () => void;
} = {}) {
    const directory = await mkdtemp(join(tmpdir(), "swe-eval-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const outputDirectory = join(directory, "run");
    const calls: { command: string; args: readonly string[] }[] = [];
    const run: ProcessRunner = async (command, args) => {
        calls.push({ command, args });
        if (command === "python") {
            if (args[1] === "preflight") return { ...ok, stdout: JSON.stringify({ harnessVersion: SWEBENCH_VERSION }) };
            if (args[1] === "prepare") return { ...ok, stdout: JSON.stringify({ harnessVersion: SWEBENCH_VERSION,
                tasks: ids.map((id) => ({ instance_id: id, repo: "astropy/astropy", base_commit: "b".repeat(40),
                    problem_statement: `Fix ${id}`, image: `swebench/sweb.eval.x86_64.${id.replaceAll("__", "_1776_")}:latest` })) }) };
            if (args[1] === "grade") {
                if (changes.gradingFails) throw new Error("grading unavailable");
                const predictions = (await readFile(join(outputDirectory, "predictions.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
                return { ...ok, stdout: JSON.stringify({ exitCode: 0, results: predictions.map((p, i) => ({ instanceId: p.instance_id,
                    status: p.model_patch === "" ? "empty_patch" : i === 0 ? "resolved" : "unresolved", logDirectory: `/logs/${p.instance_id}` })) }) };
            }
        }
        if (command === "docker") {
            if (args[0] === "pull" && changes.setupFails) return { ...ok, code: 1, stderr: "image unavailable" };
            if (args[0] === "image") return { ...ok, stdout: "sha256:abc\n" };
            if (args.at(-1)?.includes("git add -A")) {
                if (changes.exportFails) return { ...ok, code: 1, stderr: "git export failed" };
                return { ...ok, stdout: changes.emptyPatch ? "" : patch };
            }
            return ok;
        }
        throw new Error(`Unexpected process ${command}: ${args}`);
    };
    let modelCalls = 0;
    const llmAdapter: LLMAdapter = {
        structuredOutputMode: "strict",
        generate: async () => {
            modelCalls++;
            changes.onGenerate?.();
            return { content: "{}", ...(modelCalls === 1 ? { providerMetadata: { usage: { inputTokens: 12, outputTokens: 3 } } } : {}) };
        },
    };
    const runSupervisor: NonNullable<SwebenchEvaluationOptions["runSupervisor"]> = async (supervisorOptions) => {
        const instanceDirectory = join(supervisorOptions.outputDirectory, "runtime", supervisorOptions.task.instance_id);
        if (changes.setupFails) {
            return { stopReason: null, patch: null, patchPath: null, persistence: null,
                errors: [{ stage: "container_start" as const, message: "image unavailable" }] };
        }
        const callsBefore = modelCalls;
        const callCount = changes.complete ? 2 : 1;
        for (let index = 0; index < callCount; index += 1) await supervisorOptions.llmAdapter.generate({ messages: [] });
        const inputTokens = callsBefore === 0 ? 12 : 0;
        const missingCalls = callCount - (callsBefore === 0 ? 1 : 0);
        await mkdir(join(instanceDirectory, "goals"), { recursive: true });
        await mkdir(join(instanceDirectory, "trajectories"), { recursive: true });
        await mkdir(join(instanceDirectory, "traces"), { recursive: true });
        const persistence = {
            goalSnapshot: `runtime/${supervisorOptions.task.instance_id}/goals`,
            trajectory: `runtime/${supervisorOptions.task.instance_id}/trajectories`,
            diagnosticTrace: `runtime/${supervisorOptions.task.instance_id}/traces`,
        };
        if (changes.exportFails) {
            return { stopReason: null, patch: null, patchPath: null, persistence,
                errors: [{ stage: "patch_export" as const, message: "git export failed" }] };
        }
        const modelPatch = changes.emptyPatch ? "" : patch;
        const patchPath = join(supervisorOptions.outputDirectory, `${supervisorOptions.task.instance_id}.patch`);
        await writeFile(patchPath, modelPatch);
        return {
            stopReason: changes.complete ? "end_turn" as const : "max_turn_requests" as const,
            patch: modelPatch, patchPath, persistence,
            meta: { runStatus: changes.complete ? "completed" : "failed", stopReason: changes.complete ? null : { kind: "max_steps_exceeded" }, completed: changes.complete,
                usage: { inputTokens, outputTokens: inputTokens === 0 ? 0 : 3, missingCalls } }, errors: [],
        };
    };
    return { outputDirectory, calls, modelCalls: () => modelCalls, options: {
        manifest: changes.complete ? { ...manifest, maxSteps: 3 } : manifest, outputDirectory,
        python: "python", modelId: "test-model", llmAdapter, workerArtifact, runProcess: run, runSupervisor,
    } satisfies SwebenchEvaluationOptions };
}

async function latestObservation(output: string, instanceId: string): Promise<number | undefined> {
    const directory = join(output, "runtime", Buffer.from("swebench").toString("base64url"), Buffer.from(instanceId).toString("base64url"), "trajectories");
    const files = await readdir(directory, { recursive: true });
    for (const file of files.filter((file) => file.endsWith(".jsonl"))) {
        const events = (await readFile(join(directory, file), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
        const observation = events.filter((event) => event.eventType === "observation_recorded").at(-1);
        if (observation) return observation.sequence;
    }
    return undefined;
}

test("one attempt per task persists Runtime facts and patches; max-step failure can still resolve officially", async (t) => {
    const f = await fixture(t);
    const report = await runSwebenchEvaluation(f.options);
    assert.equal(report.configId, "swebench-acp-container-v1");
    assert.equal(report.profile.id, "swebench-acp-profile");
    assert.equal(report.worker.workerSha256, workerManifest.workerSha256);
    assert.equal(report.worker.nodeVersion, "22.22.2");
    assert.equal(report.worker.acpProtocolVersion, 1);
    assert.equal(report.worker.acpSdkVersion, "1.4.0");
    assert.equal(f.modelCalls(), 2);
    assert.equal(report.status, "completed");
    assert.equal(report.summary.resolved, 1);
    assert.equal(report.summary.resolvedRate, 0.5);
    assert.equal(report.summary.inputTokens, 12);
    assert.equal(report.summary.missingUsageCalls, 1);
    assert.deepEqual(report.attempts.map((a) => a.runStatus), ["failed", "failed"]);
    for (const attempt of report.attempts) assert.equal((attempt.stopReason as { kind: string }).kind, "max_steps_exceeded");
    assert.deepEqual(report.attempts.map((a) => a.gradingStatus), ["resolved", "unresolved"]);
    for (const attempt of report.attempts) {
        assert.equal(attempt.attempt, 1);
        assert.equal(await readFile(attempt.patchPath!, "utf8"), patch);
        assert.ok((await readdir(join(f.outputDirectory, attempt.persistence!.goalSnapshot))).length >= 0);
        assert.ok((await readdir(join(f.outputDirectory, attempt.persistence!.trajectory))).length >= 0);
        assert.ok((await readdir(join(f.outputDirectory, attempt.persistence!.diagnosticTrace!))).length >= 0);
    }
    const predictions = (await readFile(join(f.outputDirectory, "predictions.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(predictions.map((p) => p.instance_id), ids);
    assert.equal(predictions[0].model_patch, patch);
    const saved = JSON.parse(await readFile(join(f.outputDirectory, "report.json"), "utf8"));
    assert.deepEqual(saved, report);
    await assert.rejects(runSwebenchEvaluation(f.options), /EEXIST/);
    assert.equal(f.modelCalls(), 2);
});

test("grading failure preserves predictions without rerunning the agent", async (t) => {
    const f = await fixture(t, { gradingFails: true });
    const report = await runSwebenchEvaluation(f.options);
    assert.equal(report.status, "failed");
    assert.equal(report.summary.gradingErrors, 2);
    assert.equal(report.summary.resolved, 0);
    assert.equal(f.modelCalls(), 2);
    assert.match(await readFile(join(f.outputDirectory, "predictions.jsonl"), "utf8"), /model_patch/);
});

test("model completion cannot override the official unresolved outcome", async (t) => {
    const f = await fixture(t, { complete: true });
    const report = await runSwebenchEvaluation(f.options);
    assert.equal(f.modelCalls(), 4, JSON.stringify(report.attempts));
    assert.deepEqual(report.attempts.map((a) => a.runStatus), ["completed", "completed"]);
    assert.deepEqual(report.attempts.map((a) => a.gradingStatus), ["resolved", "unresolved"]);
    assert.equal(report.summary.resolvedRate, 0.5);
});

test("setup failures are counted against the fixed denominator and never call the model", async (t) => {
    const f = await fixture(t, { setupFails: true });
    const report = await runSwebenchEvaluation(f.options);
    assert.equal(report.status, "failed");
    assert.equal(report.summary.total, 2);
    assert.equal(report.summary.notSubmitted, 2);
    assert.equal(f.modelCalls(), 0);
    assert.equal(report.attempts[0]?.errors[0]?.stage, "container_start");
});

test("patch export failure still closes containers and records the missing artifact", async (t) => {
    const f = await fixture(t, { exportFails: true });
    const report = await runSwebenchEvaluation(f.options);
    assert.equal(report.status, "failed");
    assert.equal(report.summary.notSubmitted, 2);
    assert.equal(report.attempts[0]?.errors[0]?.stage, "patch_export");
});

test("empty patches remain submitted failures, not missing infrastructure", async (t) => {
    const f = await fixture(t, { emptyPatch: true });
    const report = await runSwebenchEvaluation(f.options);
    assert.equal(report.status, "completed");
    assert.equal(report.summary.emptyPatches, 2);
    assert.equal(report.summary.resolved, 0);
});

test("interruption preserves current patch and usage and does not start the next task or grader", async (t) => {
    const controller = new AbortController();
    const f = await fixture(t, { onGenerate: () => controller.abort() });
    const report = await runSwebenchEvaluation({ ...f.options, signal: controller.signal });
    assert.equal(report.status, "aborted");
    assert.equal(report.summary.attempted, 1);
    assert.equal(report.summary.notRun, 1);
    assert.equal(report.summary.inputTokens, 12);
    assert.equal(report.attempts[0]?.gradingStatus, "pending");
    assert.equal(await readFile(report.attempts[0]!.patchPath!, "utf8"), patch);
    assert.equal(f.calls.filter((c) => c.args[1] === "grade").length, 0);
});

test("preflight rejects unsupported harness versions before model construction", async () => {
    await assert.rejects(preflightSwebench("python", async () => ({ ...ok, stdout: '{"harnessVersion":"future"}' })), /version mismatch/);
});

test("SWE-bench ACP profile exposes only the five execution tools", () => {
    assert.deepEqual(SWE_ACP_PROFILE.toolIds, ["read_file", "write_file", "edit_file", "grep", "bash"]);
});

test("malformed grading batches cannot leave partially accepted successes", async (t) => {
    const f = await fixture(t);
    const report = await runSwebenchEvaluation(f.options);
    const row = { instanceId: ids[0], status: "resolved", logDirectory: "/logs" };
    for (const results of [[row], [row, row], [row, { ...row, instanceId: "unknown" }],
        [row, { ...row, instanceId: ids[1], status: true }]]) {
        const attempts = report.attempts.map((attempt) => ({ ...attempt, gradingStatus: "pending" as const }));
        assert.throws(() => applyGrades(attempts, { exitCode: 0, results }));
        assert.deepEqual(attempts.map((a) => a.gradingStatus), ["pending", "pending"]);
    }
});
