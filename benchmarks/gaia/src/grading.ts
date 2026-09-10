import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { GaiaDomainResult, GaiaLevel, GaiaManifest } from "./types.js";
import { loadGaiaManifest } from "./manifest.js";
import type { BenchmarkAttemptRecord } from "../../src/attempt-recorder.js";

/**
 * GAIA 官方答案归一化函数。
 *
 * @remarks
 * 归一化步骤：
 * 1. 转为小写
 * 2. 去除冠词（a, an, the）
 * 3. 数字标准化（处理千分位逗号 1,000 -> 1000，以及 1.0 -> 1）
 * 4. 去除标点符号（保留数字间的小数点）
 * 5. 压缩连续空格
 * 6. trim
 *
 * @param raw - 原始答案字符串。
 * @returns 归一化后的标准答案字符串。
 *
 * @example
 * ```ts
 * normalizeGaiaAnswer("The Paris."); // "paris"
 * normalizeGaiaAnswer("1,000.0");    // "1000"
 * ```
 */
export function normalizeGaiaAnswer(raw: string): string {
    if (!raw) return "";

    // 1. 转为小写
    let text = raw.toLowerCase();

    // 2. 去除冠词 (a, an, the)
    text = text.replace(/\b(a|an|the)\b/gi, " ");

    // 3. 数字标准化：千分位逗号去除 (如 1,000 -> 1000, 1,000,000 -> 1000000)
    text = text.replace(/(\d),(\d)/g, "$1$2");
    text = text.replace(/(\d),(\d)/g, "$1$2");

    // 替换数字末尾的 .0 或 .00 (如 1.0 -> 1, 42.00 -> 42，但保留 3.14)
    text = text.replace(/\b(\d+)\.0+\b/g, "$1");

    // 4. 去除标点符号（保留数字间的小数点）
    text = text.replace(/[!"#$%&'()*+,/:;<=>?@[\\\]^_`{|}~]/g, " ");
    text = text.replace(/(?<!\d)\.|\.(?!\d)/g, " ");
    text = text.replace(/(?<!\d)-|-(?!\d)/g, " ");

    // 5. 压缩连续空格 & 6. trim
    text = text.replace(/\s+/g, " ").trim();

    // 整数数字前导零规范化 (如 "01" -> "1", "-05" -> "-5")
    if (/^-?\d+$/.test(text)) {
        try {
            const num = BigInt(text);
            text = num.toString();
        } catch {
            // ignore
        }
    }

    return text;
}

/**
 * 依据 GAIA 归一化精确匹配算法评定短答案。
 *
 * @param submittedAnswer - Agent 提交的答案（或 null）。
 * @param expectedAnswer - 标准预期答案（或 null，如 test split）。
 * @param level - 任务难度级别。
 * @returns 包含归一化结果与正确性判定（correct）的 GaiaDomainResult。
 *
 * @example
 * ```ts
 * const result = scoreGaiaAnswer("Paris", "paris.", 1);
 * // result.correct === true
 * ```
 */
export function scoreGaiaAnswer(
    submittedAnswer: string | null,
    expectedAnswer: string | null,
    level: GaiaLevel = 1,
): GaiaDomainResult {
    if (submittedAnswer === null || submittedAnswer.trim().length === 0) {
        return {
            submittedAnswer: null,
            correct: expectedAnswer !== null ? false : null,
            normalizedAnswer: null,
            normalizedExpected: expectedAnswer !== null ? normalizeGaiaAnswer(expectedAnswer) : null,
            level,
        };
    }

    const normSubmitted = normalizeGaiaAnswer(submittedAnswer);

    if (expectedAnswer === null) {
        return {
            submittedAnswer,
            correct: null,
            normalizedAnswer: normSubmitted,
            normalizedExpected: null,
            level,
        };
    }

    const normExpected = normalizeGaiaAnswer(expectedAnswer);
    const correct = normSubmitted === normExpected;

    return {
        submittedAnswer,
        correct,
        normalizedAnswer: normSubmitted,
        normalizedExpected: normExpected,
        level,
    };
}

/** GAIA 独立评分配置参数。 */
export interface GaiaGradeOptions {
    /** 包含评测结果与 Attempt 记录的输出目录。 */
    readonly outputDirectory: string;
    /** 可选的 Manifest 文件路径或已加载 Manifest。 */
    readonly manifest?: GaiaManifest | string;
}

/** GAIA 独立评分汇总结果。 */
export interface GaiaGradeResult {
    readonly totalTasks: number;
    readonly answeredTasks: number;
    readonly correctTasks: number;
    readonly accuracy: number;
    readonly byLevel: Readonly<Record<GaiaLevel, { total: number; correct: number; accuracy: number }>>;
}

/**
 * 读取评测输出目录中的 Attempt 记录与答案文件，执行独立评分并回写 Attempt 文件。
 *
 * @remarks
 * 该函数完全在本地执行，不读取任何模型环境变量，不产生任何 LLM API 调用。
 *
 * @param options - 评分选项。
 * @returns 评分统计结果。
 *
 * @example
 * ```ts
 * const report = await gradeGaiaEvaluation({ outputDirectory: "/tmp/gaia-run" });
 * console.log(`Accuracy: ${report.accuracy * 100}%`);
 * ```
 */
export async function gradeGaiaEvaluation(options: GaiaGradeOptions): Promise<GaiaGradeResult> {
    const outputDir = resolve(options.outputDirectory);

    let manifest: GaiaManifest | undefined;
    if (typeof options.manifest === "string") {
        manifest = await loadGaiaManifest(resolve(options.manifest));
    } else if (options.manifest) {
        manifest = options.manifest;
    } else {
        // 尝试在 outputDir 下寻找 manifest.json
        try {
            manifest = await loadGaiaManifest(join(outputDir, "manifest.json"));
        } catch {
            // 没有 manifest 则直接依赖 attempt 记录已有字段
        }
    }

    const manifestMap = new Map<string, { expectedAnswer: string | null; level: GaiaLevel }>();
    if (manifest) {
        for (const t of manifest.tasks) {
            manifestMap.set(t.taskId, { expectedAnswer: t.expectedAnswer, level: t.level });
        }
    }

    // 查找 attempt.json 文件列表
    const attemptFiles: string[] = [];
    async function scanDir(dir: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                await scanDir(full);
            } else if (entry.isFile() && entry.name === "attempt.json") {
                attemptFiles.push(full);
            }
        }
    }

    await scanDir(outputDir);

    let totalTasks = 0;
    let answeredTasks = 0;
    let correctTasks = 0;
    const byLevel: Record<GaiaLevel, { total: number; correct: number; accuracy: number }> = {
        1: { total: 0, correct: 0, accuracy: 0 },
        2: { total: 0, correct: 0, accuracy: 0 },
        3: { total: 0, correct: 0, accuracy: 0 },
    };

    for (const attemptPath of attemptFiles) {
        const content = await readFile(attemptPath, "utf8");
        let record: BenchmarkAttemptRecord<GaiaDomainResult>;
        try {
            record = JSON.parse(content);
        } catch {
            continue;
        }

        const taskId = record.taskId;
        const fromManifest = manifestMap.get(taskId);
        const level = fromManifest?.level ?? record.domainResult?.level ?? 1;
        const expectedAnswer = fromManifest ? fromManifest.expectedAnswer : (record.domainResult?.normalizedExpected ?? null);

        // 如果存在 answer.json 产物，优先读取其中的 answer
        let submittedAnswer = record.domainResult?.submittedAnswer ?? null;
        if (submittedAnswer === null) {
            const answerPath = join(outputDir, "runtime", "gaia", encodeURIComponent(taskId), "answer.json");
            try {
                const answerContent = JSON.parse(await readFile(answerPath, "utf8"));
                if (typeof answerContent.answer === "string") {
                    submittedAnswer = answerContent.answer;
                }
            } catch {
                // ignore
            }
        }

        const scored = scoreGaiaAnswer(submittedAnswer, expectedAnswer, level);
        const updatedRecord: BenchmarkAttemptRecord<GaiaDomainResult> = {
            ...record,
            domainResult: scored,
        };

        await writeFile(attemptPath, JSON.stringify(updatedRecord, null, 2) + "\n", "utf8");

        totalTasks++;
        if (scored.submittedAnswer !== null) answeredTasks++;
        if (scored.correct === true) {
            correctTasks++;
            byLevel[level].correct++;
        }
        byLevel[level].total++;
    }

    for (const l of [1, 2, 3] as const) {
        const item = byLevel[l];
        item.accuracy = item.total > 0 ? item.correct / item.total : 0;
    }

    const accuracy = totalTasks > 0 ? correctTasks / totalTasks : 0;

    return {
        totalTasks,
        answeredTasks,
        correctTasks,
        accuracy,
        byLevel,
    };
}

/**
 * 运行 GAIA 独立评分 CLI 命令。
 *
 * @param argv - CLI 命令行参数列表，形如 `["grade", "gaia", "--output", "<dir>"]`。
 * @returns 退出状态码（0 为成功）。
 */
export async function runGaiaGradeCli(argv: readonly string[]): Promise<number> {
    const { values } = parseArgs({
        args: argv.slice(2),
        options: {
            output: { type: "string", short: "o" },
            manifest: { type: "string", short: "m" },
        },
        strict: false,
    });

    const output = values.output as string | undefined;
    if (!output) {
        process.stderr.write("错误: 必须指定 --output <目录路径>\n");
        process.stderr.write("用法: lazygoal grade gaia --output <评测输出目录> [--manifest <manifest.json>]\n");
        return 1;
    }

    const manifest = values.manifest as string | undefined;
    const result = await gradeGaiaEvaluation({ outputDirectory: output, manifest });

    process.stdout.write(`\n=== GAIA 评分报告 ===\n`);
    process.stdout.write(`总任务数: ${result.totalTasks}\n`);
    process.stdout.write(`已提交数: ${result.answeredTasks}\n`);
    process.stdout.write(`命中正确数: ${result.correctTasks}\n`);
    process.stdout.write(`整体准确率: ${(result.accuracy * 100).toFixed(2)}%\n`);
    process.stdout.write(`分级统计:\n`);
    for (const l of [1, 2, 3] as const) {
        const lvl = result.byLevel[l];
        process.stdout.write(
            `  Level ${l}: ${lvl.correct}/${lvl.total} (${(lvl.accuracy * 100).toFixed(2)}%)\n`,
        );
    }

    return 0;
}
