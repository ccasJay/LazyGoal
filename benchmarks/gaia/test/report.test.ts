import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { BenchmarkAttemptRecord } from "../../src/attempt-recorder.js";
import {
    aggregateGaiaReport,
    readGaiaAttempts,
    writeGaiaReport,
    type GaiaDomainResult,
} from "../src/index.js";

const fixtureAttempts: readonly BenchmarkAttemptRecord<GaiaDomainResult>[] = [
    {
        benchmarkId: "gaia",
        taskId: "gaia-lvl1-1",
        goalId: "goal-1",
        runId: "run-1",
        attempt: 1,
        status: "completed",
        durationMs: 1500,
        usage: null,
        errors: [],
        artifactLocator: null,
        domainResult: {
            submittedAnswer: "paris",
            correct: true,
            normalizedAnswer: "paris",
            normalizedExpected: "paris",
            level: 1,
        },
    },
    {
        benchmarkId: "gaia",
        taskId: "gaia-lvl1-2",
        goalId: "goal-2",
        runId: "run-1",
        attempt: 1,
        status: "completed",
        durationMs: 1200,
        usage: null,
        errors: [],
        artifactLocator: null,
        domainResult: {
            submittedAnswer: "london",
            correct: false,
            normalizedAnswer: "london",
            normalizedExpected: "rome",
            level: 1,
        },
    },
    {
        benchmarkId: "gaia",
        taskId: "gaia-lvl2-1",
        goalId: "goal-3",
        runId: "run-1",
        attempt: 1,
        status: "completed",
        durationMs: 2500,
        usage: null,
        errors: [],
        artifactLocator: null,
        domainResult: {
            submittedAnswer: "42",
            correct: true,
            normalizedAnswer: "42",
            normalizedExpected: "42",
            level: 2,
        },
    },
    {
        benchmarkId: "gaia",
        taskId: "gaia-lvl3-1",
        goalId: "goal-4",
        runId: "run-1",
        attempt: 1,
        status: "completed",
        durationMs: 4000,
        usage: null,
        errors: [],
        artifactLocator: null,
        domainResult: {
            submittedAnswer: null,
            correct: false,
            normalizedAnswer: null,
            normalizedExpected: "100",
            level: 3,
        },
    },
];

test("aggregateGaiaReport 按 Level 正确统计准确率和完成数", () => {
    const report = aggregateGaiaReport(fixtureAttempts);

    assert.equal(report.benchmarkId, "gaia");
    assert.equal(report.summary.totalTasks, 4);
    assert.equal(report.summary.completedTasks, 4);
    assert.equal(report.summary.answeredTasks, 3);
    assert.equal(report.summary.correctTasks, 2);
    assert.equal(report.summary.accuracy, 0.5);

    // Level 1: 2 题，1 对 1 错
    assert.equal(report.summary.byLevel[1].total, 2);
    assert.equal(report.summary.byLevel[1].answered, 2);
    assert.equal(report.summary.byLevel[1].correct, 1);
    assert.equal(report.summary.byLevel[1].accuracy, 0.5);

    // Level 2: 1 题，1 对
    assert.equal(report.summary.byLevel[2].total, 1);
    assert.equal(report.summary.byLevel[2].answered, 1);
    assert.equal(report.summary.byLevel[2].correct, 1);
    assert.equal(report.summary.byLevel[2].accuracy, 1.0);

    // Level 3: 1 题，未提交答案
    assert.equal(report.summary.byLevel[3].total, 1);
    assert.equal(report.summary.byLevel[3].answered, 0);
    assert.equal(report.summary.byLevel[3].correct, 0);
    assert.equal(report.summary.byLevel[3].accuracy, 0.0);
});

test("readGaiaAttempts 能够在存在异常中断和未写完文件时安全读取已完成 Attempt", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "gaia-report-read-"));
    try {
        const task1Dir = join(tmpDir, "task-1");
        const task2Dir = join(tmpDir, "task-2");
        const corruptedDir = join(tmpDir, "task-corrupted");

        await mkdir(task1Dir, { recursive: true });
        await mkdir(task2Dir, { recursive: true });
        await mkdir(corruptedDir, { recursive: true });

        await writeFile(join(task1Dir, "attempt.json"), JSON.stringify(fixtureAttempts[0], null, 2), "utf8");
        await writeFile(join(task2Dir, "attempt.json"), JSON.stringify(fixtureAttempts[1], null, 2), "utf8");
        // 模拟未写完的半截 JSON
        await writeFile(join(corruptedDir, "attempt.json"), '{"benchmarkId": "gaia", "task', "utf8");

        const recovered = await readGaiaAttempts(tmpDir);
        assert.equal(recovered.length, 2);
        assert.equal(recovered[0].taskId, "gaia-lvl1-1");
        assert.equal(recovered[1].taskId, "gaia-lvl1-2");
        assert.equal(recovered[0].domainResult.submittedAnswer, "paris");
        assert.equal(recovered[0].domainResult.correct, true);
        assert.equal(recovered[0].domainResult.level, 1);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("writeGaiaReport 成功落盘格式化报告", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "gaia-report-write-"));
    try {
        const report = aggregateGaiaReport(fixtureAttempts);
        const reportPath = join(tmpDir, "report.json");
        await writeGaiaReport(reportPath, report);

        const content = await readFile(reportPath, "utf8");
        const parsed = JSON.parse(content);
        assert.equal(parsed.benchmarkId, "gaia");
        assert.equal(parsed.summary.totalTasks, 4);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
