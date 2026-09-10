import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runSwebenchAcpTask } from "../src/worker-runtime.js";
import { recoverSwebenchResult } from "../src/result-recovery.js";

test("recovers failed Snapshot and invalid-response usage without terminal ACP metadata", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "swe-recovery-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const metadata = { instanceId: "astropy__astropy-12907", repo: "astropy/astropy", baseCommit: "a".repeat(40),
        problemStatement: "Fix issue", goalId: "goal-recovery", runId: "run-recovery", maxSteps: 3, structuredOutputMode: "strict" as const };
    const result = await runSwebenchAcpTask({ metadata, workspaceRoot: root, stateRoot: join(root, "state"),
        llmAdapter: { structuredOutputMode: "strict", generate: async () => ({ content: "{}", providerMetadata: { usage: { inputTokens: 15, outputTokens: 7 } } }) },
        renderer: { render: () => "system" }, contextCompactor: { compact: async units => units },
    });
    assert.equal(result.goal.state.run.status, "failed");
    const directory = join(root, "state", Buffer.from("swebench-acp").toString("base64url"), Buffer.from(metadata.instanceId).toString("base64url"));
    const copied = { goals: join(directory, "goals"), traces: join(directory, "traces") };
    const diagnostics: string[] = [];
    const recovered = await recoverSwebenchResult(copied, metadata, message => diagnostics.push(message), new AbortController().signal);
    assert.equal(diagnostics.length, 0);
    assert.equal(recovered?.runStatus, "failed");
    assert.deepEqual(recovered?.stopReason, result.goal.state.run.stopReason);
    assert.deepEqual(recovered?.usage, { inputTokens: 15, outputTokens: 7, missingCalls: 0 });
    const traceOnly = await recoverSwebenchResult({ traces: copied.traces }, metadata, message => diagnostics.push(message), new AbortController().signal);
    assert.equal(traceOnly?.runStatus, undefined);
    assert.deepEqual(traceOnly?.usage, recovered?.usage);
    const tracePath = join(copied.traces, Buffer.from(metadata.goalId).toString("base64url"), `${Buffer.from(metadata.runId).toString("base64url")}.jsonl`);
    const content = await readFile(tracePath, "utf8");
    await writeFile(tracePath, content.replaceAll(metadata.runId, "foreign-run"));
    const corrupted = await recoverSwebenchResult(copied, metadata, message => diagnostics.push(message), new AbortController().signal);
    assert.equal(corrupted?.runStatus, "failed");
    assert.equal(corrupted?.usage, undefined);
    assert.equal(diagnostics.length, 1);
});

test("missing or corrupted artifacts never imply zero usage or not_started", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "swe-recovery-missing-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const diagnostics: string[] = [];
    const result = await recoverSwebenchResult({ goals: root, traces: root }, { goalId: "goal", runId: "run" },
        message => diagnostics.push(message), new AbortController().signal);
    assert.equal(result, undefined);
    assert.equal(diagnostics.length, 2);
});
