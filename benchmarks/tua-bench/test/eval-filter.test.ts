import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { BenchmarkAttemptRecord } from "../../src/attempt-recorder.js";
import {
    filterTuaBenchManifest,
    runTuaBenchEvaluation,
} from "../src/eval.js";
import type { TuaBenchDomainResult, TuaBenchManifest, TuaBenchTaskDefinition } from "../src/types.js";

function makeTask(id: string, family: string): TuaBenchTaskDefinition {
    return {
        taskId: id,
        name: id,
        instruction: `instruction for ${id}`,
        taskFamily: family,
        imageRef: `tua-bench/${id}:latest`,
        networkMode: family === "live-web" ? "public" : "none",
        agentTimeoutSec: 600,
        verifierTimeoutSec: 600,
        verifierUser: "root",
        taskDir: `/path/to/tasks/${id}`,
        setupScript: "environment/setup.sh",
        verifierPath: "tests/test.sh",
    };
}

describe("TuaBench Eval Filter & Headless Batch Execution", () => {
    const tasks: TuaBenchTaskDefinition[] = [
        makeTask("doc-1", "document"),
        makeTask("doc-2", "document"),
        makeTask("web-1", "live-web"),
        makeTask("sci-1", "science"),
    ];

    const mockManifest: TuaBenchManifest = {
        tasks,
        repoRoot: "/mock/repo",
        loadedAt: new Date().toISOString(),
        byFamily: {
            document: [tasks[0]!, tasks[1]!],
            "live-web": [tasks[2]!],
            science: [tasks[3]!],
        },
    };

    it("filterTuaBenchManifest 正确按 taskId 和 taskFamily 筛选", () => {
        // 无过滤
        assert.equal(filterTuaBenchManifest(mockManifest, {}).length, 4);

        // 按 taskFamily 筛选
        const docTasks = filterTuaBenchManifest(mockManifest, { taskFamily: "document" });
        assert.equal(docTasks.length, 2);
        assert.ok(docTasks.every((t) => t.taskFamily === "document"));

        // 按 taskId 筛选
        const singleTask = filterTuaBenchManifest(mockManifest, { taskId: "web-1" });
        assert.equal(singleTask.length, 1);
        assert.equal(singleTask[0]?.taskId, "web-1");

        // 不匹配的组合
        const empty = filterTuaBenchManifest(mockManifest, { taskId: "web-1", taskFamily: "document" });
        assert.equal(empty.length, 0);
    });

    it("runTuaBenchEvaluation 批量执行并生成汇总报告与 Attempt 记录", async () => {
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), "tua-eval-"));
        try {
            // 创建假的 repoRoot 与 tasks 目录
            const tasksDir = path.join(tmpDir, "repo", "tasks");
            await mkdir(path.join(tasksDir, "doc-1"), { recursive: true });
            await writeFile(path.join(tasksDir, "doc-1", "task.toml"), 'name = "doc-1"\n[metadata]\ncategory = "document"\n');
            await writeFile(path.join(tasksDir, "doc-1", "instruction.md"), "edit doc 1");

            await mkdir(path.join(tasksDir, "web-1"), { recursive: true });
            await writeFile(path.join(tasksDir, "web-1", "task.toml"), 'name = "web-1"\n[metadata]\ncategory = "live-web"\n');
            await writeFile(path.join(tasksDir, "web-1", "instruction.md"), "browse web 1");

            const outputDir = path.join(tmpDir, "eval-output");

            // 模拟单任务执行结果
            const runSingleTask = async (task: TuaBenchTaskDefinition, taskOutputDir: string) => {
                const passed = task.taskId === "doc-1"; // doc-1 通过，web-1 失败
                const record: BenchmarkAttemptRecord<TuaBenchDomainResult> = {
                    benchmarkId: "tua-bench",
                    taskId: task.taskId,
                    goalId: `goal-${task.taskId}`,
                    runId: `run-${task.taskId}`,
                    attempt: 1,
                    status: "completed",
                    durationMs: 1000,
                    usage: null,
                    errors: [],
                    artifactLocator: null,
                    domainResult: {
                        taskFamily: task.taskFamily,
                        passed,
                        reward: passed ? 1.0 : 0.0,
                        verifierOutput: passed ? "All passed" : "Failed",
                        verifierError: null,
                    },
                };
                await writeFile(path.join(taskOutputDir, "attempt.json"), JSON.stringify(record, null, 2), "utf8");
                return record;
            };

            const report = await runTuaBenchEvaluation({
                repoRoot: path.join(tmpDir, "repo"),
                outputDirectory: outputDir,
                runSingleTask,
            });

            assert.equal(report.totalTasks, 2);
            assert.equal(report.completedTasks, 2);
            assert.equal(report.passedTasks, 1);
            assert.equal(report.failedTasks, 1);
            assert.equal(report.errorTasks, 0);
            assert.equal(report.overallPassRate, 0.5);

            assert.equal(report.byFamily["document"]?.total, 1);
            assert.equal(report.byFamily["document"]?.passed, 1);
            assert.equal(report.byFamily["document"]?.passRate, 1.0);

            assert.equal(report.byFamily["live-web"]?.total, 1);
            assert.equal(report.byFamily["live-web"]?.passed, 0);
            assert.equal(report.byFamily["live-web"]?.passRate, 0.0);

            // 验证 report.json 文件落盘
            const savedReport = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8"));
            assert.equal(savedReport.overallPassRate, 0.5);
        } finally {
            await rm(tmpDir, { recursive: true, force: true });
        }
    });

    it("中途中断时已完成任务的 Attempt 保持完整落盘", async () => {
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), "tua-eval-abort-"));
        try {
            const tasksDir = path.join(tmpDir, "repo", "tasks");
            await mkdir(path.join(tasksDir, "task-1"), { recursive: true });
            await writeFile(path.join(tasksDir, "task-1", "task.toml"), 'name = "task-1"\n[metadata]\ncategory = "document"\n');
            await writeFile(path.join(tasksDir, "task-1", "instruction.md"), "instruction 1");

            await mkdir(path.join(tasksDir, "task-2"), { recursive: true });
            await writeFile(path.join(tasksDir, "task-2", "task.toml"), 'name = "task-2"\n[metadata]\ncategory = "document"\n');
            await writeFile(path.join(tasksDir, "task-2", "instruction.md"), "instruction 2");

            const outputDir = path.join(tmpDir, "eval-output");
            const controller = new AbortController();

            const runSingleTask = async (task: TuaBenchTaskDefinition, taskOutputDir: string) => {
                const record: BenchmarkAttemptRecord<TuaBenchDomainResult> = {
                    benchmarkId: "tua-bench",
                    taskId: task.taskId,
                    goalId: `goal-${task.taskId}`,
                    runId: `run-${task.taskId}`,
                    attempt: 1,
                    status: "completed",
                    durationMs: 1200,
                    usage: null,
                    errors: [],
                    artifactLocator: null,
                    domainResult: {
                        taskFamily: task.taskFamily,
                        passed: true,
                        reward: 1.0,
                        verifierOutput: "Passed",
                        verifierError: null,
                    },
                };
                await writeFile(path.join(taskOutputDir, "attempt.json"), JSON.stringify(record, null, 2), "utf8");

                // 执行完第一个任务后立即触发中止
                controller.abort();
                return record;
            };

            const report = await runTuaBenchEvaluation({
                repoRoot: path.join(tmpDir, "repo"),
                outputDirectory: outputDir,
                signal: controller.signal,
                runSingleTask,
            });

            // 总共 2 个任务，但由于中断只完成了 1 个
            assert.equal(report.totalTasks, 2);
            assert.equal(report.completedTasks, 1);
            assert.equal(report.passedTasks, 1);

            // 检查已完成任务的 Attempt 文件仍然完整存在并可读取
            const task1Attempt = JSON.parse(await readFile(path.join(outputDir, "task-1", "attempt.json"), "utf8"));
            assert.equal(task1Attempt.taskId, "task-1");
            assert.equal(task1Attempt.domainResult.passed, true);
        } finally {
            await rm(tmpDir, { recursive: true, force: true });
        }
    });
});

