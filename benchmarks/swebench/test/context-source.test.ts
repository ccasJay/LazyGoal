import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSwebenchContextSource } from "../src/context-source.js";
import type { ProcessRunner } from "../../src/process.js";
const row = { instance_id: "astropy__astropy-12907", repo: "astropy/astropy", base_commit: "a".repeat(40), problem_statement: "Original issue", patch: "GoldPatchSentinel", test_patch: "HiddenTestSentinel" };
test("import isolates private grading rows and fails closed when source or private bytes change", async t => {
    const root = await mkdtemp(join(tmpdir(), "swe-source-test-")); t.after(() => rm(root, { recursive: true, force: true }));
    const manifest = join(root, "manifest.json");
    await writeFile(manifest, JSON.stringify({ dataset: "princeton-nlp/SWE-bench_Verified", revision: "b".repeat(40), instanceIds: [row.instance_id], maxSteps: 50, taskTimeoutSeconds: 1200, testTimeoutSeconds: 1800 }));
    const calls: readonly string[][] = [];
    let wrongImage = false;
    let gradingResponse = '{"exitCode":0,"results":[{"instanceId":"astropy__astropy-12907","status":"unresolved"}]}';
    const run: ProcessRunner = async (_cmd, args) => {
        (calls as string[][]).push([...args]);
        if (args[1] === "prepare") {
            await writeFile(join(args[3]!, "dataset.json"), JSON.stringify([row]));
            return { code: 0, stderr: "", stdout: JSON.stringify({ harnessVersion: "4.1.0", tasks: [{ instance_id: row.instance_id, repo: row.repo, base_commit: row.base_commit, problem_statement: row.problem_statement, image: "swebench/sweb.eval.x86_64.astropy_1776_astropy-12907:latest" }] }) };
        }
        if (args[1] === "grade") return { code: 0, stderr: "", stdout: gradingResponse };
        return { code: 0, stderr: "", stdout: args[0] === "image" ? `sha256:${(wrongImage ? "d" : "c").repeat(64)}${args.at(-1) === "{{.Id}}" ? "" : " linux/amd64"}` : '{"harnessVersion":"4.1.0"}' };
    };
    const source = createSwebenchContextSource({ privateDirectory: join(root, "private"), python: "test-python", run });
    const [path] = await source.importTasks(manifest, join(root, "public"));
    const bytes = await readFile(path!, "utf8");
    assert.doesNotMatch(bytes, /GoldPatchSentinel|HiddenTestSentinel|test_patch/);
    const task = await source.readTask(path!);
    assert.equal(task.instanceId, row.instance_id);
    assert.equal(calls.some(args => args[0] === "pull"), false);
    const grade = await source.grade(task, "incorrect patch", join(root, "grade-unresolved"));
    assert.equal(grade.status, "unresolved"); assert.equal(grade.resolved, false);
    const before = calls.filter(args => args[1] === "grade").length;
    wrongImage = true;
    await assert.rejects(() => source.grade(task, "patch", join(root, "grade-image-mismatch")), /image identity mismatch/);
    assert.equal(calls.filter(args => args[1] === "grade").length, before);
    wrongImage = false; gradingResponse = "not JSON";
    await assert.rejects(() => source.grade(task, "patch", join(root, "grade-malformed")));
    assert.equal(JSON.parse(await readFile(join(root, "grade-malformed", "bridge-response.json"), "utf8")).stdout, "not JSON");
    await writeFile(join(root, "private", "dataset.json"), JSON.stringify([{ ...row, patch: "changed" }]));
    await assert.rejects(() => source.readTask(path!), /identity mismatch/);
    await assert.rejects(() => source.grade(task, "patch", join(root, "grade")), /identity mismatch/);
});
