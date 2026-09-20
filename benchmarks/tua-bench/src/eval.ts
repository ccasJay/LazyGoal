import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { AttemptRecorder, type BenchmarkAttemptRecord } from "../../src/attempt-recorder.js";
import { IsolatedEnvironment } from "../../src/isolated-environment.js";
import type { WorkerArtifact } from "../../src/worker-builder.js";
import { TuaBenchEnvironmentSpec } from "./environment-spec.js";
import { loadTuaBenchManifest } from "./manifest-loader.js";
import type { TuaBenchDomainResult, TuaBenchManifest, TuaBenchTaskDefinition } from "./types.js";

/** 任务过滤选项。 */
export interface TuaBenchFilterOptions {
    /** 精确匹配的任务 ID。 */
    readonly taskId?: string;
    /** 精确匹配的任务所属族（category）。 */
    readonly taskFamily?: string;
}

/**
 * 依据过滤参数从 Manifest 中筛选目标任务列表。
 *
 * @param manifest - 已加载的 TUA-Bench 任务清单。
 * @param filters - 过滤条件（taskId 或 taskFamily）。
 * @returns 匹配的任务定义列表。
 *
 * @example
 * ```ts
 * const filtered = filterTuaBenchManifest(manifest, { taskFamily: "document" });
 * ```
 */
export function filterTuaBenchManifest(
    manifest: TuaBenchManifest,
    filters: TuaBenchFilterOptions,
): readonly TuaBenchTaskDefinition[] {
    return manifest.tasks.filter((task) => {
        if (filters.taskId !== undefined && filters.taskId.trim().length > 0) {
            if (task.taskId !== filters.taskId.trim()) return false;
        }
        if (filters.taskFamily !== undefined && filters.taskFamily.trim().length > 0) {
            if (task.taskFamily !== filters.taskFamily.trim()) return false;
        }
        return true;
    });
}

/** TUA-Bench 评测运行选项。 */
export interface TuaBenchEvaluationOptions {
    /** 本地 TUA-Bench 仓库根目录。 */
    readonly repoRoot: string;
    /** 评测结果与 Attempt 产物落盘目录。 */
    readonly outputDirectory: string;
    /** 可选的任务 ID 过滤器。 */
    readonly taskId?: string;
    /** 可选的任务族过滤器。 */
    readonly taskFamily?: string;
    /** 最大执行步数。 */
    readonly maxSteps?: number;
    /** 外部中止信号。 */
    readonly signal?: AbortSignal;
    /** 已构建的 Worker 产物（可选）。 */
    readonly workerArtifact?: WorkerArtifact;
    /** 宿主 LLM 适配器。 */
    readonly llmAdapter?: LLMAdapter;
    /** 自定义隔离执行环境驱动。 */
    readonly isolatedEnvironment?: IsolatedEnvironment;
    /**
     * 单任务执行委托（供测试或无头沙箱模拟注入）。
     */
    readonly runSingleTask?: (
        task: TuaBenchTaskDefinition,
        taskOutputDir: string,
        signal?: AbortSignal,
    ) => Promise<BenchmarkAttemptRecord<TuaBenchDomainResult>>;
}

/** 单任务族汇总指标。 */
export interface TuaBenchFamilySummary {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly errors: number;
    readonly passRate: number;
}

/** TUA-Bench 批量评测汇总报告。 */
export interface TuaBenchEvalReport {
    /** 筛选出的总任务数。 */
    readonly totalTasks: number;
    /** 实际完成运行的任务数。 */
    readonly completedTasks: number;
    /** 通过任务数。 */
    readonly passedTasks: number;
    /** 失败任务数。 */
    readonly failedTasks: number;
    /** 错误任务数。 */
    readonly errorTasks: number;
    /** 总体通过率（0.0 ~ 1.0）。 */
    readonly overallPassRate: number;
    /** 各任务族通过率统计。 */
    readonly byFamily: Readonly<Record<string, TuaBenchFamilySummary>>;
    /** 全部已产出的 Attempt 记录列表。 */
    readonly attempts: readonly BenchmarkAttemptRecord<TuaBenchDomainResult>[];
}

/**
 * 运行 TUA-Bench 无头批量评测入口。
 *
 * @remarks
 * 从本地仓库加载 Manifest，按过滤条件筛选任务，为每个任务创建独立 Goal 和沙箱容器，
 * 记录 Attempt 并在中途中断时保持已完成结果完整，最后生成汇总统计报告。
 *
 * @param options - 评测运行参数。
 * @returns 评测汇总报告对象。
 *
 * @example
 * ```ts
 * const report = await runTuaBenchEvaluation({
 *   repoRoot: "/data/tua-bench",
 *   outputDirectory: "/tmp/eval-out",
 *   taskFamily: "document",
 * });
 * console.log(`Pass Rate: ${(report.overallPassRate * 100).toFixed(1)}%`);
 * ```
 */
export async function runTuaBenchEvaluation(
    options: TuaBenchEvaluationOptions,
): Promise<TuaBenchEvalReport> {
    const resolvedRoot = resolve(options.repoRoot);
    const outputDir = resolve(options.outputDirectory);
    await mkdir(outputDir, { recursive: true });

    const manifest = await loadTuaBenchManifest(resolvedRoot);
    const targetTasks = filterTuaBenchManifest(manifest, {
        ...(options.taskId !== undefined ? { taskId: options.taskId } : {}),
        ...(options.taskFamily !== undefined ? { taskFamily: options.taskFamily } : {}),
    });

    const attempts: BenchmarkAttemptRecord<TuaBenchDomainResult>[] = [];
    const environment = options.isolatedEnvironment ?? new IsolatedEnvironment();

    for (const task of targetTasks) {
        if (options.signal?.aborted) {
            break;
        }

        const taskOutputDir = join(outputDir, task.taskId);
        await mkdir(taskOutputDir, { recursive: true });

        let record: BenchmarkAttemptRecord<TuaBenchDomainResult>;

        if (options.runSingleTask !== undefined) {
            record = await options.runSingleTask(task, taskOutputDir, options.signal);
        } else {
            const goalId = randomUUID();
            const runId = randomUUID();
            const recorder = new AttemptRecorder<TuaBenchDomainResult>({
                outputDirectory: taskOutputDir,
                benchmarkId: "tua-bench",
                taskId: task.taskId,
                goalId,
                runId,
            });

            const spec = new TuaBenchEnvironmentSpec({
                task,
                ...(options.workerArtifact !== undefined ? { workerArtifact: options.workerArtifact } : {}),
            });

            const startMs = Date.now();
            try {
                const envResult = await environment.run({
                    task,
                    spec,
                    outputDirectory: taskOutputDir,
                    ...(options.workerArtifact !== undefined ? { workerArtifact: options.workerArtifact } : {}),
                    ...(options.signal !== undefined ? { signal: options.signal } : {}),
                });

                const durationMs = Date.now() - startMs;
                const domainResult: TuaBenchDomainResult = envResult.artifact?.domainResult ?? {
                    taskFamily: task.taskFamily,
                    passed: null,
                    reward: null,
                    verifierOutput: null,
                    verifierError: envResult.errors.map((e) => e.message).join("; ") || "Execution error",
                };

                record = await recorder.commit({
                    status: envResult.status,
                    durationMs,
                    usage: null,
                    errors: envResult.errors.map((e) => ({
                        stage: e.stage,
                        ...(e.code !== undefined ? { code: e.code } : {}),
                        message: e.message,
                    })),
                    artifactLocator: null,
                    domainResult,
                });
            } catch (error) {
                const durationMs = Date.now() - startMs;
                record = await recorder.commit({
                    status: "failed",
                    durationMs,
                    usage: null,
                    errors: [{
                        stage: "agent",
                        message: error instanceof Error ? error.message : String(error),
                    }],
                    artifactLocator: null,
                    domainResult: {
                        taskFamily: task.taskFamily,
                        passed: null,
                        reward: null,
                        verifierOutput: null,
                        verifierError: error instanceof Error ? error.message : String(error),
                    },
                });
            }
        }

        attempts.push(record);
    }

    let passedTasks = 0;
    let failedTasks = 0;
    let errorTasks = 0;

    const familyMap: Record<string, { total: number; passed: number; failed: number; errors: number }> = {};

    for (const record of attempts) {
        const domain = record.domainResult;
        const family = domain?.taskFamily ?? "unknown";

        if (domain?.passed === true) {
            passedTasks += 1;
        } else if (domain?.passed === false) {
            failedTasks += 1;
        } else {
            errorTasks += 1;
        }

        const stat = familyMap[family] ?? { total: 0, passed: 0, failed: 0, errors: 0 };
        stat.total += 1;
        if (domain?.passed === true) {
            stat.passed += 1;
        } else if (domain?.passed === false) {
            stat.failed += 1;
        } else {
            stat.errors += 1;
        }
        familyMap[family] = stat;
    }

    const byFamily: Record<string, TuaBenchFamilySummary> = {};
    for (const [family, stat] of Object.entries(familyMap)) {
        byFamily[family] = {
            total: stat.total,
            passed: stat.passed,
            failed: stat.failed,
            errors: stat.errors,
            passRate: stat.total > 0 ? stat.passed / stat.total : 0,
        };
    }

    const overallPassRate = attempts.length > 0 ? passedTasks / attempts.length : 0;

    const report: TuaBenchEvalReport = {
        totalTasks: targetTasks.length,
        completedTasks: attempts.length,
        passedTasks,
        failedTasks,
        errorTasks,
        overallPassRate,
        byFamily,
        attempts,
    };

    try {
        await writeFile(join(outputDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
    } catch {
        // 忽略写入失败
    }

    return report;
}
