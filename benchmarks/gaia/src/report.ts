import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BenchmarkAttemptRecord } from "../../src/attempt-recorder.js";
import type { GaiaDomainResult, GaiaLevel, GaiaSplit } from "./types.js";

/** GAIA 评测按级别聚合统计指标。 */
export interface GaiaLevelStatistics {
    readonly total: number;
    readonly answered: number;
    readonly correct: number;
    readonly accuracy: number;
}

/** GAIA 评测按划分聚合统计指标。 */
export interface GaiaSplitStatistics {
    readonly total: number;
    readonly answered: number;
    readonly correct: number;
    readonly accuracy: number;
}

/** GAIA 评测结果摘要契约。 */
export interface GaiaEvaluationSummary {
    /** 参与评测的总题目数。 */
    readonly totalTasks: number;
    /** 成功执行结束（无基础设施崩溃）的题目数。 */
    readonly completedTasks: number;
    /** 提交了有效非空答案的题目数。 */
    readonly answeredTasks: number;
    /** 答案命中正确（correct === true）的题目数。 */
    readonly correctTasks: number;
    /** 整体准确率（正确题数 / 总题数）。 */
    readonly accuracy: number;
    /** 按难度 Level 划分的分组统计。 */
    readonly byLevel: Readonly<Record<GaiaLevel, GaiaLevelStatistics>>;
    /** 按数据集 Split 划分的分组统计。 */
    readonly bySplit: Readonly<Record<GaiaSplit, GaiaSplitStatistics>>;
}

/**
 * GAIA 完整评测报告结构。
 *
 * @example
 * ```ts
 * const report: GaiaEvaluationReport = aggregateGaiaReport(attempts);
 * console.log(`Accuracy: ${report.summary.accuracy}`);
 * ```
 */
export interface GaiaEvaluationReport {
    readonly benchmarkId: "gaia";
    readonly generatedAt: string;
    readonly summary: GaiaEvaluationSummary;
    readonly attempts: readonly BenchmarkAttemptRecord<GaiaDomainResult>[];
}

/**
 * 从一组已完成的 Attempt 记录中聚合生成 GAIA 评测报告。
 *
 * @param attempts - Attempt 记录数组。
 * @param defaultSplit - 当任务未指明 split 时使用的默认划分（默认 "validation"）。
 * @returns 包含分级、分划分统计与明细记录的完整报告。
 *
 * @example
 * ```ts
 * const report = aggregateGaiaReport(attemptRecords);
 * ```
 */
export function aggregateGaiaReport(
    attempts: readonly BenchmarkAttemptRecord<GaiaDomainResult>[],
    defaultSplit: GaiaSplit = "validation",
): GaiaEvaluationReport {
    let totalTasks = attempts.length;
    let completedTasks = 0;
    let answeredTasks = 0;
    let correctTasks = 0;

    const byLevel: Record<GaiaLevel, { total: number; answered: number; correct: number }> = {
        1: { total: 0, answered: 0, correct: 0 },
        2: { total: 0, answered: 0, correct: 0 },
        3: { total: 0, answered: 0, correct: 0 },
    };

    const bySplit: Record<GaiaSplit, { total: number; answered: number; correct: number }> = {
        validation: { total: 0, answered: 0, correct: 0 },
        test: { total: 0, answered: 0, correct: 0 },
    };

    for (const attempt of attempts) {
        if (attempt.status === "completed") {
            completedTasks++;
        }

        const domain = attempt.domainResult;
        const level: GaiaLevel = domain?.level ?? 1;
        const split: GaiaSplit = (attempt as { split?: GaiaSplit }).split ?? defaultSplit;

        byLevel[level].total++;
        bySplit[split].total++;

        if (domain && domain.submittedAnswer !== null && domain.submittedAnswer.trim().length > 0) {
            answeredTasks++;
            byLevel[level].answered++;
            bySplit[split].answered++;
        }

        if (domain && domain.correct === true) {
            correctTasks++;
            byLevel[level].correct++;
            bySplit[split].correct++;
        }
    }

    const accuracy = totalTasks > 0 ? correctTasks / totalTasks : 0;

    const levelStats: Record<GaiaLevel, GaiaLevelStatistics> = {
        1: {
            ...byLevel[1],
            accuracy: byLevel[1].total > 0 ? byLevel[1].correct / byLevel[1].total : 0,
        },
        2: {
            ...byLevel[2],
            accuracy: byLevel[2].total > 0 ? byLevel[2].correct / byLevel[2].total : 0,
        },
        3: {
            ...byLevel[3],
            accuracy: byLevel[3].total > 0 ? byLevel[3].correct / byLevel[3].total : 0,
        },
    };

    const splitStats: Record<GaiaSplit, GaiaSplitStatistics> = {
        validation: {
            ...bySplit.validation,
            accuracy: bySplit.validation.total > 0 ? bySplit.validation.correct / bySplit.validation.total : 0,
        },
        test: {
            ...bySplit.test,
            accuracy: bySplit.test.total > 0 ? bySplit.test.correct / bySplit.test.total : 0,
        },
    };

    const summary: GaiaEvaluationSummary = {
        totalTasks,
        completedTasks,
        answeredTasks,
        correctTasks,
        accuracy,
        byLevel: Object.freeze(levelStats),
        bySplit: Object.freeze(splitStats),
    };

    return {
        benchmarkId: "gaia",
        generatedAt: new Date().toISOString(),
        summary,
        attempts,
    };
}

/**
 * 递归扫描指定目录，读取所有 `attempt.json` 记录。
 *
 * @remarks
 * 支持中途退出场景：损坏或未写完的 Attempt 文件被安全跳过，已落盘完成的记录可正常读取。
 *
 * @param outputDirectory - 评测产物根目录。
 * @returns 读取到的有效 Attempt 记录列表。
 *
 * @example
 * ```ts
 * const attempts = await readGaiaAttempts("/tmp/gaia-run");
 * ```
 */
export async function readGaiaAttempts(
    outputDirectory: string,
): Promise<readonly BenchmarkAttemptRecord<GaiaDomainResult>[]> {
    const root = resolve(outputDirectory);
    const results: BenchmarkAttemptRecord<GaiaDomainResult>[] = [];

    async function scan(dir: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await scan(fullPath);
            } else if (entry.isFile() && entry.name === "attempt.json") {
                try {
                    const text = await readFile(fullPath, "utf8");
                    const parsed = JSON.parse(text);
                    if (
                        typeof parsed === "object" &&
                        parsed !== null &&
                        parsed.benchmarkId === "gaia" &&
                        typeof parsed.taskId === "string"
                    ) {
                        results.push(parsed as BenchmarkAttemptRecord<GaiaDomainResult>);
                    }
                } catch {
                    // 跳过未写完或非法的 attempt.json
                }
            }
        }
    }

    await scan(root);
    results.sort((a, b) => a.taskId.localeCompare(b.taskId));
    return results;
}

/**
 * 将 GAIA 汇总报告格式化保存到指定路径。
 *
 * @param reportPath - 报告文件绝对路径。
 * @param report - 评测报告对象。
 *
 * @example
 * ```ts
 * await writeGaiaReport("/tmp/report.json", report);
 * ```
 */
export async function writeGaiaReport(
    reportPath: string,
    report: GaiaEvaluationReport,
): Promise<void> {
    const json = JSON.stringify(report, null, 2) + "\n";
    await writeFile(reportPath, json, "utf8");
}
