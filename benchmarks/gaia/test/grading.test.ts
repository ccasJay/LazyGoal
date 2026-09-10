import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
    gradeGaiaEvaluation,
    normalizeGaiaAnswer,
    runGaiaGradeCli,
    scoreGaiaAnswer,
    type GaiaDomainResult,
} from "../src/index.js";
import type { BenchmarkAttemptRecord } from "../../src/attempt-recorder.js";

test("normalizeGaiaAnswer 覆盖大小写、冠词、标点与数字标准化规则", () => {
    // 1. 大小写
    assert.equal(normalizeGaiaAnswer("Paris"), "paris");
    assert.equal(normalizeGaiaAnswer("LoNdOn"), "london");

    // 2. 冠词 (a, an, the)
    assert.equal(normalizeGaiaAnswer("the answer"), "answer");
    assert.equal(normalizeGaiaAnswer("A book"), "book");
    assert.equal(normalizeGaiaAnswer("An elephant"), "elephant");

    // 3. 标点符号
    assert.equal(normalizeGaiaAnswer("answer."), "answer");
    assert.equal(normalizeGaiaAnswer("hello, world!"), "hello world");
    assert.equal(normalizeGaiaAnswer("[1998]"), "1998");
    assert.equal(normalizeGaiaAnswer('"quoted"'), "quoted");

    // 4. 数字千分位与浮点数
    assert.equal(normalizeGaiaAnswer("1,000"), "1000");
    assert.equal(normalizeGaiaAnswer("2,500,000"), "2500000");
    assert.equal(normalizeGaiaAnswer("1.0"), "1");
    assert.equal(normalizeGaiaAnswer("42.00"), "42");
    assert.equal(normalizeGaiaAnswer("3.14"), "3.14"); // 有效小数必须保留

    // 5. 组合复杂情况
    assert.equal(normalizeGaiaAnswer("The result is 1,000.0."), "result is 1000");
});

test("scoreGaiaAnswer 正确比对预期答案与处理 test split", () => {
    // 命中
    const hit1 = scoreGaiaAnswer("The Paris.", "paris", 1);
    assert.equal(hit1.correct, true);
    assert.equal(hit1.normalizedAnswer, "paris");
    assert.equal(hit1.normalizedExpected, "paris");

    const hit2 = scoreGaiaAnswer("1.0", "1", 2);
    assert.equal(hit2.correct, true);

    const hit3 = scoreGaiaAnswer("1,000", "1000", 3);
    assert.equal(hit3.correct, true);

    // 未命中
    const miss = scoreGaiaAnswer("wrong", "correct", 1);
    assert.equal(miss.correct, false);

    // 未提交
    const unsubmitted = scoreGaiaAnswer(null, "expected", 1);
    assert.equal(unsubmitted.correct, false);
    assert.equal(unsubmitted.submittedAnswer, null);

    // test split（expectedAnswer 为 null）
    const testSplit = scoreGaiaAnswer("paris", null, 1);
    assert.equal(testSplit.correct, null);
    assert.equal(testSplit.normalizedExpected, null);
});

test("gradeGaiaEvaluation 在无 LLM 环境变量下成功读取 Attempt 执行独立评分", async () => {
    // 清除可能存在的 LLM 环境变量，验证独立评分不依赖任何 LLM
    const originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

    const tmpDir = await mkdtemp(join(tmpdir(), "gaia-grade-test-"));
    try {
        const attempt1Dir = join(tmpDir, "task-1");
        const attempt2Dir = join(tmpDir, "task-2");
        await mkdir(attempt1Dir, { recursive: true });
        await mkdir(attempt2Dir, { recursive: true });

        const record1: BenchmarkAttemptRecord<GaiaDomainResult> = {
            benchmarkId: "gaia",
            taskId: "gaia-001",
            goalId: "goal-1",
            runId: "run-1",
            attempt: 1,
            status: "completed",
            durationMs: 1000,
            usage: null,
            errors: [],
            artifactLocator: null,
            domainResult: {
                submittedAnswer: "The Paris.",
                correct: null,
                normalizedAnswer: null,
                normalizedExpected: "paris",
                level: 1,
            },
        };

        const record2: BenchmarkAttemptRecord<GaiaDomainResult> = {
            benchmarkId: "gaia",
            taskId: "gaia-002",
            goalId: "goal-2",
            runId: "run-1",
            attempt: 1,
            status: "completed",
            durationMs: 1200,
            usage: null,
            errors: [],
            artifactLocator: null,
            domainResult: {
                submittedAnswer: "999",
                correct: null,
                normalizedAnswer: null,
                normalizedExpected: "1000",
                level: 2,
            },
        };

        await writeFile(join(attempt1Dir, "attempt.json"), JSON.stringify(record1, null, 2), "utf8");
        await writeFile(join(attempt2Dir, "attempt.json"), JSON.stringify(record2, null, 2), "utf8");

        const gradeResult = await gradeGaiaEvaluation({ outputDirectory: tmpDir });
        assert.equal(gradeResult.totalTasks, 2);
        assert.equal(gradeResult.answeredTasks, 2);
        assert.equal(gradeResult.correctTasks, 1);
        assert.equal(gradeResult.accuracy, 0.5);
        assert.equal(gradeResult.byLevel[1].correct, 1);
        assert.equal(gradeResult.byLevel[1].total, 1);
        assert.equal(gradeResult.byLevel[2].correct, 0);
        assert.equal(gradeResult.byLevel[2].total, 1);

        // 验证 attempt.json 文件被更新为评分后的结果
        const updated1 = JSON.parse(await readFile(join(attempt1Dir, "attempt.json"), "utf8"));
        assert.equal(updated1.domainResult.correct, true);
        assert.equal(updated1.domainResult.normalizedAnswer, "paris");

        // 验证 CLI 命令运行
        const cliExitCode = await runGaiaGradeCli(["grade", "gaia", "--output", tmpDir]);
        assert.equal(cliExitCode, 0);
    } finally {
        Object.assign(process.env, originalEnv);
        await rm(tmpDir, { recursive: true, force: true });
    }
});
