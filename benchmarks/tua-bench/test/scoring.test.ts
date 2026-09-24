import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { BenchmarkAttemptRecord } from "../../src/attempt-recorder.js";
import {
    evaluateTuaBenchReward,
    gradeTuaBenchAttempts,
    parseRewardFile,
} from "../src/scoring.js";
import type { TuaBenchDomainResult } from "../src/types.js";

describe("TuaBench Scoring & Grade", () => {
    describe("parseRewardFile", () => {
        it("正确解析浮点 reward 数值", () => {
            assert.equal(parseRewardFile("1.0\n").reward, 1.0);
            assert.equal(parseRewardFile("  0.75  ").reward, 0.75);
            assert.equal(parseRewardFile("0").reward, 0.0);
        });

        it("处理空文件或非法数值", () => {
            const emptyRes = parseRewardFile("   ");
            assert.equal(emptyRes.reward, null);
            assert.match(emptyRes.error ?? "", /内容为空/);

            const invalidRes = parseRewardFile("invalid_num");
            assert.equal(invalidRes.reward, null);
            assert.match(invalidRes.error ?? "", /非有效数值/);

            assert.equal(parseRewardFile("0.25\n").reward, 0.25);
            assert.equal(parseRewardFile("0.5 trailing").reward, null);
            assert.equal(parseRewardFile("Infinity").reward, null);
            assert.equal(parseRewardFile("1e999").reward, null);
        });
    });

    describe("evaluateTuaBenchReward", () => {
        it("reward >= 1.0 映射为 passed: true", () => {
            const res1 = evaluateTuaBenchReward(1.0, "ok", null, "document");
            assert.equal(res1.passed, true);
            assert.equal(res1.reward, 1.0);
            assert.equal(res1.taskFamily, "document");
            assert.equal(res1.verifierError, null);

            const res2 = evaluateTuaBenchReward(1.2, "ok", null, "document");
            assert.equal(res2.passed, true);
        });

        it("reward < 1.0 映射为 passed: false", () => {
            const res = evaluateTuaBenchReward(0.99, "partial", null, "document");
            assert.equal(res.passed, false);
            assert.equal(res.reward, 0.99);
        });

        it("reward 为 null 时 passed 为 null 且包含 verifierError", () => {
            const res = evaluateTuaBenchReward(null, "", "exit code 1: syntax error", "live-web");
            assert.equal(res.passed, null);
            assert.equal(res.reward, null);
            assert.equal(res.verifierError, "exit code 1: syntax error");
        });

        it("不把非有限数值转换成领域结果或零分", () => {
            const result = evaluateTuaBenchReward(Number.POSITIVE_INFINITY);
            assert.equal(result.passed, null);
            assert.equal(result.reward, null);
            assert.match(result.verifierError ?? "", /有限数值/);
        });
    });

    describe("gradeTuaBenchAttempts", () => {
        it("独立 grade 入口扫描 attempt 并重新评分统计（无 LLM 调用）", async () => {
            const tmpDir = await mkdtemp(path.join(os.tmpdir(), "tua-grade-"));
            try {
                // 构造 task-1 (document: 1.0 passed)
                const task1Dir = path.join(tmpDir, "task-1");
                await mkdir(task1Dir);
                const record1: BenchmarkAttemptRecord<TuaBenchDomainResult> = {
                    benchmarkId: "tua-bench",
                    taskId: "task-1",
                    goalId: "goal-1",
                    runId: "run-1",
                    attempt: 1,
                    status: "completed",
                    durationMs: 5000,
                    usage: null,
                    errors: [],
                    artifactLocator: null,
                    domainResult: {
                        taskFamily: "document",
                        passed: null,
                        reward: null,
                        verifierOutput: null,
                        verifierError: null,
                    },
                };
                await writeFile(path.join(task1Dir, "attempt.json"), JSON.stringify(record1), "utf8");
                await writeFile(path.join(task1Dir, "reward.txt"), "1.0\n", "utf8");

                // 构造 task-2 (document: 0.5 failed)
                const task2Dir = path.join(tmpDir, "task-2");
                await mkdir(task2Dir);
                const record2: BenchmarkAttemptRecord<TuaBenchDomainResult> = {
                    ...record1,
                    taskId: "task-2",
                    goalId: "goal-2",
                    runId: "run-2",
                    domainResult: {
                        taskFamily: "document",
                        passed: null,
                        reward: null,
                        verifierOutput: null,
                        verifierError: null,
                    },
                };
                await writeFile(path.join(task2Dir, "attempt.json"), JSON.stringify(record2), "utf8");
                await writeFile(path.join(task2Dir, "reward.txt"), "0.5\n", "utf8");

                // 构造 task-3 (live-web: 1.0 passed)
                const task3Dir = path.join(tmpDir, "task-3");
                await mkdir(task3Dir);
                const record3: BenchmarkAttemptRecord<TuaBenchDomainResult> = {
                    ...record1,
                    taskId: "task-3",
                    goalId: "goal-3",
                    runId: "run-3",
                    domainResult: {
                        taskFamily: "live-web",
                        passed: null,
                        reward: null,
                        verifierOutput: null,
                        verifierError: null,
                    },
                };
                await writeFile(path.join(task3Dir, "attempt.json"), JSON.stringify(record3), "utf8");
                await writeFile(path.join(task3Dir, "reward.txt"), "1.0\n", "utf8");

                // 构造 task-4 (live-web: 无 reward.txt，error)
                const task4Dir = path.join(tmpDir, "task-4");
                await mkdir(task4Dir);
                const record4: BenchmarkAttemptRecord<TuaBenchDomainResult> = {
                    ...record1,
                    taskId: "task-4",
                    goalId: "goal-4",
                    runId: "run-4",
                    domainResult: {
                        taskFamily: "live-web",
                        passed: null,
                        reward: null,
                        verifierOutput: null,
                        verifierError: "Verification crashed",
                    },
                };
                await writeFile(path.join(task4Dir, "attempt.json"), JSON.stringify(record4), "utf8");

                const summary = await gradeTuaBenchAttempts({ outputDirectory: tmpDir });

                assert.equal(summary.totalTasks, 4);
                assert.equal(summary.passedTasks, 2);
                assert.equal(summary.failedTasks, 1);
                assert.equal(summary.errorTasks, 1);
                assert.equal(summary.overallPassRate, 0.5);

                assert.equal(summary.byFamily["document"]?.total, 2);
                assert.equal(summary.byFamily["document"]?.passed, 1);
                assert.equal(summary.byFamily["document"]?.failed, 1);
                assert.equal(summary.byFamily["document"]?.passRate, 0.5);

                assert.equal(summary.byFamily["live-web"]?.total, 2);
                assert.equal(summary.byFamily["live-web"]?.passed, 1);
                assert.equal(summary.byFamily["live-web"]?.errors, 1);
                assert.equal(summary.byFamily["live-web"]?.passRate, 0.5);

                // 验证 attempt.json 回写更新
                const updatedContent = await readFile(path.join(task1Dir, "attempt.json"), "utf8");
                const updatedRecord = JSON.parse(updatedContent);
                assert.equal(updatedRecord.domainResult.passed, true);
                assert.equal(updatedRecord.domainResult.reward, 1.0);
            } finally {
                await rm(tmpDir, { recursive: true, force: true });
            }
        });
    });
});
