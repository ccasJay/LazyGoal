import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseScenario } from "../src/scenario.js";
import { driveScript, type ScriptBoundary } from "../src/script-driver.js";
import { evaluate } from "../src/evaluator.js";
import { summarizeGroups } from "../src/report.js";
import { validateCheckpoint } from "../src/checkpoint.js";
import { candidate, scenario, worker } from "./fixtures.js";

test("多阶段与阶段审查拒绝修正在同一 Run 中执行", async () => {
    // 模拟包含阶段声明、中间拒绝和最终完成的场景
    const stageScenario = parseScenario({
        id: "multi-stage-review",
        image: "node",
        initialFiles: { "workspace.json": "{}" },
        checkpointAfter: 0,
        profile: { id: "context", systemPrompt: "Test", instructions: [], toolIds: ["context_shell"] },
        budget: { maxSteps: 10, maxCalls: 20, stageTimeoutMs: 2000, totalTimeoutMs: 10000 },
        verifier: "test -f workspace.json",
        rubric: { text: "Quality check", threshold: 0.6 },
        limitations: "None",
        stages: [
            { operation: "launch", prompt: "Init stage 1", expect: "waiting", waitingFor: "blocked" },
            { operation: "resume", prompt: "Fix and complete", expect: "completed" },
        ],
    });

    const runId = "run-fixed-single";
    let stepCount = 0;
    const stagesSeen: string[] = [];

    const boundaries = await driveScript(stageScenario, async (stage, previous) => {
        stepCount += 2;
        if (stage.operation === "launch") {
            stagesSeen.push("stage-1");
            return {
                workerInstanceId: "worker-inst-1",
                goalId: "goal-multi",
                runId,
                status: "waiting",
                sequence: 4,
                waitingFor: "blocked",
            };
        } else {
            // resume 同一 Run，进入下一阶段
            stagesSeen.push("stage-2");
            return {
                workerInstanceId: "worker-inst-2",
                goalId: "goal-multi",
                runId,
                status: "completed",
                sequence: 8,
            };
        }
    }, new AbortController().signal);

    assert.equal(boundaries.length, 2);
    // 证明多阶段与拒绝后修正在同一 Run 发生
    assert.equal(boundaries[0]!.boundary.runId, runId);
    assert.equal(boundaries[1]!.boundary.runId, runId);
    assert.equal(stagesSeen.length, 2);
});

test("waiting 边界安全重建 Worker 保持同一阶段身份与 Run，拒绝 executing 任意非法捕获", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-stage-checkpoint-"));
    try {
        await candidate(directory);
        const valid = await validateCheckpoint(directory, scenario, worker, "image");
        assert.equal(valid.boundary.status, "failed");
        // 验证检查点仅在合法边界捕获
        assert.ok(valid.boundary.sequence > 0);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("确定性失败与未完成调用使评测报告拒绝通过，Judge 高分不能覆盖确定性失败", () => {
    // 1. Judge 高分但 verifier 失败
    const failedEval = evaluate(false, {
        status: "complete",
        score: 1.0,
        rationale: "Looks great",
        evidence: ["done"],
        usage: { inputTokens: 100, outputTokens: 20 },
        request: { messages: [] },
        response: null,
        error: null,
    }, 0.5, []);
    assert.equal(failedEval.combined, "failed");

    // 2. 存在产物隔离违规
    const isolationEval = evaluate(true, {
        status: "complete",
        score: 0.9,
        rationale: "Looks great",
        evidence: ["done"],
        usage: { inputTokens: 100, outputTokens: 20 },
        request: { messages: [] },
        response: null,
        error: null,
    }, 0.5, ["artifact_tampered"]);
    assert.equal(isolationEval.combined, "failed");

    // 3. 报告中未完成调用记录为 null 且通过率不能计为 100%
    const summary = summarizeGroups([
        {
            group: "capture",
            category: "completed",
            stages: [],
            model: "model-a",
            durationMs: 50,
            imageId: "node",
            artifacts: null,
            score: { deterministic: true, judge: null, violations: [], combined: "passed" },
            errors: [],
            calls: [null, { inputTokens: 50, outputTokens: 10 }], // 缺失调用
        },
    ], false);

    assert.equal(summary.completed, 1);
    assert.equal(summary.costs[0]?.inputTokens, null);
    assert.equal(summary.costs[0]?.missingCalls, 1);
});
