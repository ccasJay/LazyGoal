import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { applyGrades, runSwebenchEvaluation, preflightSwebench, SWE_PROFILE, type SwebenchEvaluationOptions } from "../src/evaluation.js";
import { SWEBENCH_VERSION, type SwebenchManifest } from "../src/manifest.js";
import type { ProcessRunner } from "../src/process.js";

const ids = ["astropy__astropy-12907", "astropy__astropy-13033"];
const manifest: SwebenchManifest = {
    dataset: "princeton-nlp/SWE-bench_Verified", revision: "a".repeat(40), instanceIds: ids,
    maxSteps: 1, taskTimeoutSeconds: 30, testTimeoutSeconds: 30,
};
const patch = "diff --git a/f.py b/f.py\n--- a/f.py\n+++ b/f.py\n@@ -1 +1 @@\n-bad\n+good\n";
const ok = { code: 0, stdout: "", stderr: "" };

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
                assert.equal(calls.filter((call) => call.args[0] === "rm").length, predictions.length);
                return { ...ok, stdout: JSON.stringify({ exitCode: 0, results: predictions.map((p, i) => ({ instanceId: p.instance_id,
                    status: p.model_patch === "" ? "empty_patch" : i === 0 ? "resolved" : "unresolved", logDirectory: `/logs/${p.instance_id}` })) }) };
            }
        }
        if (command === "docker") {
            if (args[0] === "pull" && changes.setupFails) return { ...ok, code: 1, stderr: "image unavailable" };
            if (args[0] === "image") return { ...ok, stdout: "sha256:abc\n" };
            if (args.at(-1)?.startsWith("git add -A")) {
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
            const observation = changes.complete ? await latestObservation(outputDirectory, ids[Math.floor((modelCalls - 1) / 2)]!) : undefined;
            return { content: JSON.stringify({ result: observation === undefined ? {
                kind: "tool_call", action: { actionId: `a-${modelCalls}`, toolId: "swebench_shell", input: { command: "python -m pytest", timeoutSeconds: 30 } }, memoryPatch: null,
            } : { kind: "complete", summary: "Done", completionEvidence: [{ criterionIndex: 0, evidenceSequences: [observation] }], memoryPatch: null } }),
                ...(modelCalls === 1 ? { providerMetadata: { usage: { inputTokens: 12, outputTokens: 3 } } } : {}),
            };
        },
    };
    return { outputDirectory, calls, modelCalls: () => modelCalls, options: {
        manifest: changes.complete ? { ...manifest, maxSteps: 3 } : manifest, outputDirectory, workspaceRoot: directory,
        python: "python", modelId: "test-model", llmAdapter, renderer: { render: () => "system" },
        contextCompactor: { compact: async (units) => [...units] }, runProcess: run,
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
    assert.equal(f.modelCalls(), 2);
    assert.equal(report.status, "completed");
    assert.equal(report.summary.resolved, 1);
    assert.equal(report.summary.resolvedRate, 0.5);
    assert.equal(report.summary.inputTokens, 12);
    assert.equal(report.summary.missingUsageCalls, 1);
    assert.deepEqual(report.attempts.map((a) => a.runStatus), ["failed", "failed"]);
    for (const attempt of report.attempts) assert.equal((attempt.stopReason as { kind: string }).kind, "max_steps_exceeded");
    assert.deepEqual(report.attempts.map((a) => a.gradingStatus), ["resolved", "unresolved"]);
    assert.equal(f.calls.filter((c) => c.args[0] === "create").length, 2);
    for (const attempt of report.attempts) {
        assert.equal(attempt.attempt, 1);
        assert.equal(await readFile(attempt.patchPath, "utf8"), patch);
        assert.ok((await readdir(attempt.persistence!.goalSnapshot)).length > 0);
        assert.ok((await readdir(attempt.persistence!.trajectory)).length > 0);
        assert.ok((await readdir(attempt.persistence!.diagnosticTrace!)).length > 0);
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
    assert.equal(report.attempts[0]?.errors[0]?.stage, "environment");
});

test("patch export failure still closes containers and records the missing artifact", async (t) => {
    const f = await fixture(t, { exportFails: true });
    const report = await runSwebenchEvaluation(f.options);
    assert.equal(report.status, "failed");
    assert.equal(report.summary.notSubmitted, 2);
    assert.equal(f.calls.filter((c) => c.args[0] === "rm").length, 2);
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
    assert.equal(await readFile(report.attempts[0]!.patchPath, "utf8"), patch);
    assert.equal(f.calls.filter((c) => c.args[1] === "grade").length, 0);
    assert.equal(f.calls.filter((c) => c.args[0] === "rm").length, 1);
});

test("preflight rejects unsupported harness versions before model construction", async () => {
    await assert.rejects(preflightSwebench("python", async () => ({ ...ok, stdout: '{"harnessVersion":"future"}' })), /version mismatch/);
});

test("SWE-bench profile forbids execution-phase plan creation", () => {
    assert.match(SWE_PROFILE.instructions.join("\n"), /memoryPatch as null/);
    assert.match(SWE_PROFILE.instructions.join("\n"), /PlanItems cannot be created/);
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
