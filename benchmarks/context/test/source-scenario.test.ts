import assert from "node:assert/strict";
import { test } from "node:test";
import { identity } from "../../src/content-identity.js";
import { parseSourceTask } from "../../src/task-source.js";
import { generateSourceScenarios } from "../src/source-scenario.js";
import { parseScenario } from "../src/scenario.js";
import { driveScript } from "../src/script-driver.js";
import { judgeExplanation } from "../src/judge.js";
import { evaluate } from "../src/evaluator.js";
const body = { source: "swebench", dataset: "princeton-nlp/SWE-bench_Verified", revision: "a".repeat(40), instanceId: "astropy__astropy-12907", repo: "astropy/astropy", baseCommit: "b".repeat(40), problemStatement: "Full original issue. Preserve this exact text.", image: "swebench/sweb.eval.x86_64.astropy_1776_astropy-12907:latest", imageId: "sha256:" + "c".repeat(64) };
const task = parseSourceTask({ ...body, contentHash: identity(body) });
const profile = { id: "engineering", systemPrompt: "Engineer", instructions: [], toolIds: ["read_file", "write_file", "edit_file", "grep", "bash"] };
const scenarios = generateSourceScenarios(task, profile, { maxSteps: 50, maxCalls: 200, stageTimeoutMs: 1000, totalTimeoutMs: 10000 });
test("source templates preserve original issue, expose no future instructions to first operation, and use distinct lifecycles", () => {
    assert.equal(scenarios.length, 2);
    assert.notEqual(scenarios[0]!.id, scenarios[1]!.id);
    for (const scenario of scenarios) {
        assert.ok(scenario.stages[0]!.prompt.startsWith(task.problemStatement));
        assert.equal(scenario.stages[0]!.prompt.includes(scenario.stages[1]!.prompt), false);
        assert.deepEqual(scenario.initialFiles, {});
        assert.equal(scenario.source?.contentHash, task.contentHash);
    }
    assert.equal(scenarios[0]!.stages[1]!.operation, "continue");
    assert.equal(scenarios[1]!.stages[1]!.operation, "resume");
    assert.equal(scenarios[1]!.stages[1]!.answers?.[0]?.questionId, "q-1");
});
test("source projections reject secret fields, tampering, floating revision, wrong image and missing identity", () => {
    for (const bad of [{ ...task, patch: "gold" }, { ...task, problemStatement: "changed" }, { ...task, revision: "main" }, { ...task, imageId: "latest" }, { ...task, image: "other:latest" }]) assert.throws(() => parseSourceTask(bad));
    assert.throws(() => parseScenario({ ...scenarios[0], initialFiles: { "gold.patch": "hidden" } }));
    assert.throws(() => parseScenario({ ...scenarios[0], stages: scenarios[1]!.stages }));
});
test("waiting script rejects a different confirmation question before injecting its answer", async () => {
    let calls = 0;
    await assert.rejects(() => driveScript(scenarios[1]!, async () => {
        calls++; return { goalId: "g", runId: "r", status: "waiting", sequence: 1, waitingFor: "ask_user", questions: [{ id: "q-1", question: "Wrong question" }] };
    }, new AbortController().signal), /Waiting question/);
    assert.equal(calls, 1);
});
test("source engineering unresolved remains independent of valid Context; Judge cannot override deterministic failure", async () => {
    const judge = await judgeExplanation({ structuredOutputMode: "prompt_only", generate: async () => ({ content: JSON.stringify({ score: 1, rationale: "fixture", evidence: ["actual"] }) }) }, "rubric", { actual: "Real fact" }, new AbortController().signal);
    const engineering = { status: "unresolved", resolved: false };
    assert.equal(evaluate(true, judge, 0.8, []).combined, "passed");
    assert.equal(engineering.resolved, false);
    assert.equal(evaluate(false, judge, 0.8, []).combined, "failed");
    assert.equal(evaluate(true, null, 0.8, []).combined, "incomplete");
});

test("reviewed source references resolve committed originals; full uses its own facts without captured decisions", async t => {
    const { mkdtemp, readFile, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { candidate } = await import("./fixtures.js");
    const { validateAnnotations, continuityJudgeEvidence } = await import("../src/source-evidence.js");
    const root = await mkdtemp(join(tmpdir(), "source-annotations-")); t.after(() => rm(root, { recursive: true, force: true }));
    await candidate(root);
    const checkpoint = JSON.parse(await readFile(join(root, "checkpoint.json"), "utf8"));
    await writeFile(join(root, "task.json"), JSON.stringify(task));
    const annotations = [{ kind: "constraint", text: "Preserve original requirements", sources: ["user:0"] }, { kind: "decision", text: "Captured investigation choice", sources: ["user:0"] }];
    await writeFile(join(root, "annotations.json"), JSON.stringify(annotations));
    assert.equal((await validateAnnotations(root, scenarios[0]!)).length, 2);
    const restored = await continuityJudgeEvidence(root, root, scenarios[0]!, "restore", checkpoint.boundary);
    assert.ok(restored["capture:user:0"]);
    const full = await continuityJudgeEvidence(root, root, scenarios[0]!, "full", checkpoint.boundary);
    assert.doesNotMatch(full.rubric_annotations!, /Captured investigation choice|sources/);
    assert.ok(full["user:0"]);
    await writeFile(join(root, "annotations.json"), JSON.stringify([{ ...annotations[0], sources: ["trajectory:unknown:999"] }]));
    await assert.rejects(() => validateAnnotations(root, scenarios[0]!), /source unavailable/);
});
