import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BenchmarkAttemptRecord } from "../../src/attempt-recorder.js";
import type { TuaBenchDomainResult, TuaBenchManifest } from "./types.js";
import { loadTuaBenchManifest } from "./manifest-loader.js";

/**
 * 解析 reward 文件文本内容。
 *
 * @param content - 文件原始内容。
 * @returns 包含解析出的 reward 浮点数或错误信息。
 *
 * @example
 * ```ts
 * const { reward } = parseRewardFile("1.0\n");
 * ```
 */
export function parseRewardFile(content: string): { readonly reward: number | null; readonly error?: string } {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
        return { reward: null, error: "Reward 文件内容为空" };
    }
    const parsed = parseFloat(trimmed);
    if (Number.isNaN(parsed)) {
        return { reward: null, error: `非有效数值内容：${trimmed}` };
    }
    return { reward: parsed };
}

/**
 * 将 reward 数值映射为 TuaBenchDomainResult。
 *
 * @param reward - 原始 reward 数值（或 null）。
 * @param verifierOutput - 验证脚本标准输出。
 * @param verifierError - 验证脚本错误信息。
 * @param taskFamily - 所属任务族，默认 "unknown"。
 * @returns 结构化领域判定结果。
 *
 * @example
 * ```ts
 * const result = evaluateTuaBenchReward(1.0, "All tests passed", null, "document");
 * ```
 */
export function evaluateTuaBenchReward(
    reward: number | null,
    verifierOutput: string | null = null,
    verifierError: string | null = null,
    taskFamily: string = "unknown",
): TuaBenchDomainResult {
    let passed: boolean | null = null;
    let finalError: string | null = verifierError;

    if (reward !== null) {
        passed = reward >= 1.0;
    } else if (finalError === null) {
        finalError = "Reward 未能成功获取";
    }

    return {
        taskFamily,
        passed,
        reward,
        verifierOutput,
        verifierError: finalError,
    };
}

/** 独立评分输入选项。 */
export interface TuaBenchGradeOptions {
    /** 评测输出根目录（包含各任务的 Attempt 目录与 attempt.json）。 */
    readonly outputDirectory: string;
    /** 可选的本地 TUA-Bench 仓库路径或已加载 Manifest。 */
    readonly manifest?: TuaBenchManifest | string;
    /** 是否将重新评分后的结果回写至 attempt.json，默认 true。 */
    readonly updateAttemptFiles?: boolean;
}

/** 单任务族评分统计结果。 */
export interface TuaBenchFamilyGradeStats {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly errors: number;
    readonly passRate: number;
}

/** TUA-Bench 评分汇总统计报告。 */
export interface TuaBenchGradeSummary {
    /** 总评测任务数。 */
    readonly totalTasks: number;
    /** 通过任务数（passed === true）。 */
    readonly passedTasks: number;
    /** 失败任务数（passed === false）。 */
    readonly failedTasks: number;
    /** 错误任务数（passed === null）。 */
    readonly errorTasks: number;
    /** 总体通过率（0.0 ~ 1.0）。 */
    readonly overallPassRate: number;
    /** 各任务族通过率统计。 */
    readonly byFamily: Readonly<Record<string, TuaBenchFamilyGradeStats>>;
}

/**
 * 递归扫描目录内全部符合谓词的文件。
 */
async function scanFiles(dir: string, fileName: string): Promise<string[]> {
    const results: string[] = [];
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...await scanFiles(full, fileName));
        } else if (entry.isFile() && entry.name === fileName) {
            results.push(full);
        }
    }
    return results;
}

/**
 * 读取已有 Attempt 记录并重跑评分验证，不消耗模型调用。
 *
 * @param options - 评分配置。
 * @returns 包含各任务族与总体通过率的统计报告。
 *
 * @example
 * ```ts
 * const summary = await gradeTuaBenchAttempts({ outputDirectory: "/tmp/eval-out" });
 * console.log(`Overall Pass Rate: ${(summary.overallPassRate * 100).toFixed(1)}%`);
 * ```
 */
export async function gradeTuaBenchAttempts(
    options: TuaBenchGradeOptions,
): Promise<TuaBenchGradeSummary> {
    const outputDir = resolve(options.outputDirectory);

    let manifest: TuaBenchManifest | undefined;
    if (typeof options.manifest === "string") {
        manifest = await loadTuaBenchManifest(resolve(options.manifest));
    } else if (options.manifest) {
        manifest = options.manifest;
    }

    const taskFamilyMap = new Map<string, string>();
    if (manifest) {
        for (const task of manifest.tasks) {
            taskFamilyMap.set(task.taskId, task.taskFamily);
        }
    }

    const attemptFiles = await scanFiles(outputDir, "attempt.json");

    let totalTasks = 0;
    let passedTasks = 0;
    let failedTasks = 0;
    let errorTasks = 0;

    const familyCounts: Record<string, { total: number; passed: number; failed: number; errors: number }> = {};

    for (const attemptPath of attemptFiles) {
        let content: string;
        try {
            content = await readFile(attemptPath, "utf8");
        } catch {
            continue;
        }

        let record: BenchmarkAttemptRecord<TuaBenchDomainResult>;
        try {
            record = JSON.parse(content);
        } catch {
            continue;
        }

        totalTasks += 1;
        const taskId = record.taskId;
        const taskFamily = taskFamilyMap.get(taskId) ?? record.domainResult?.taskFamily ?? "unknown";

        // 查找产物目录中的 reward.txt
        const attemptDir = resolve(attemptPath, "..");
        let reward: number | null = record.domainResult?.reward ?? null;
        let verifierError: string | null = record.domainResult?.verifierError ?? null;
        const verifierOutput: string | null = record.domainResult?.verifierOutput ?? null;

        const rewardFileCandidates = [
            join(attemptDir, "reward.txt"),
            join(attemptDir, "logs", "verifier", "reward.txt"),
        ];

        for (const candidate of rewardFileCandidates) {
            try {
                const raw = await readFile(candidate, "utf8");
                const parsed = parseRewardFile(raw);
                if (parsed.reward !== null) {
                    reward = parsed.reward;
                    verifierError = null;
                    break;
                }
            } catch {
                // 不存在则继续尝试
            }
        }

        const domainResult = evaluateTuaBenchReward(reward, verifierOutput, verifierError, taskFamily);

        if (domainResult.passed === true) {
            passedTasks += 1;
        } else if (domainResult.passed === false) {
            failedTasks += 1;
        } else {
            errorTasks += 1;
        }

        const familyStat = familyCounts[taskFamily] ?? { total: 0, passed: 0, failed: 0, errors: 0 };
        familyStat.total += 1;
        if (domainResult.passed === true) {
            familyStat.passed += 1;
        } else if (domainResult.passed === false) {
            familyStat.failed += 1;
        } else {
            familyStat.errors += 1;
        }
        familyCounts[taskFamily] = familyStat;

        if (options.updateAttemptFiles !== false) {
            const updatedRecord = {
                ...record,
                domainResult,
            };
            try {
                await writeFile(attemptPath, JSON.stringify(updatedRecord, null, 2), "utf8");
            } catch {
                // 忽略写回失败
            }
        }
    }

    const byFamily: Record<string, TuaBenchFamilyGradeStats> = {};
    for (const [family, stat] of Object.entries(familyCounts)) {
        byFamily[family] = {
            total: stat.total,
            passed: stat.passed,
            failed: stat.failed,
            errors: stat.errors,
            passRate: stat.total > 0 ? stat.passed / stat.total : 0,
        };
    }

    const overallPassRate = totalTasks > 0 ? passedTasks / totalTasks : 0;

    return {
        totalTasks,
        passedTasks,
        failedTasks,
        errorTasks,
        overallPassRate,
        byFamily,
    };
}

