import { createHash } from "node:crypto";

import type { AgentProfile } from "../../../packages/runtime/src/index.js";
import type { HeadlessModelUsage } from "../../src/headless-composition-root.js";
import type { AlfworldManifest, AlfworldManifestTask } from "./manifest.js";

/** 评测尝试可以归入的稳定失败类别。 */
export type EpisodeFailureCategory =
    | "aborted"
    | "domain_command_rejected"
    | "infrastructure"
    | "model_complete_without_win"
    | "protocol"
    | "task_not_won"
    | "timeout"
    | "unknown";

/**
 * ALFWorld 环境在一次尝试结束时的最小可信事实。
 *
 * @example
 * ```ts
 * const facts: EpisodeEnvironmentFacts = {
 *   done: true, won: true, steps: 8, goalConditionSuccessRate: 1,
 * };
 * ```
 */
export interface EpisodeEnvironmentFacts {
    /** 环境是否已经进入终态。 */
    readonly done: boolean;
    /** 环境是否报告任务成功；这是评测成功的唯一来源。 */
    readonly won: boolean;
    /** 已向环境提交的步数。 */
    readonly steps: number;
    /** 环境报告的目标完成率。 */
    readonly goalConditionSuccessRate: number;
}

/**
 * Agent/Runner 状态的有限报告投影。
 *
 * @remarks
 * `usage` 是该次尝试的 run 级聚合用量(含缺失调用计数);执行路径未产生
 * 用量数据(如旧形态 facts 或环境启动失败)时缺省,不以 0 值代替。
 *
 * @example
 * ```ts
 * const model: EpisodeModelFacts = {
 *     runStatus: "completed",
 *     completed: true,
 *     usage: { inputTokens: 150, outputTokens: 25, missingCalls: 1 },
 * };
 * ```
 */
export interface EpisodeModelFacts {
    /** Runner 最终状态；Runner 尚未返回时为 `null`。 */
    readonly runStatus: string | null;
    /** 模型是否返回了 `complete` Decision。 */
    readonly completed: boolean;
    /** 该次尝试聚合的模型 token 用量；执行路径未记录用量时缺省。 */
    readonly usage?: HeadlessModelUsage;
}

/**
 * 一次固定任务尝试的机器可读记录。
 *
 * @example
 * ```ts
 * const attempt: Pick<EpisodeAttempt, "taskId" | "won"> = {
 *   taskId: "task-1", won: true,
 * };
 * ```
 */
export interface EpisodeAttempt {
    readonly taskId: string;
    readonly gameFile: string;
    readonly split: string;
    readonly seed: number;
    readonly maxSteps: number;
    readonly profileId: string;
    readonly profileHash: string;
    readonly promptBundleVersion: 1;
    readonly manifestId: string;
    readonly configId: string;
    readonly modelId: string | null;
    /** 同一任务的第一次尝试为 0，基础设施重试依次递增。 */
    readonly retrySequence: number;
    readonly done: boolean;
    readonly won: boolean;
    readonly steps: number;
    readonly goalConditionSuccessRate: number;
    readonly durationMs: number;
    readonly modelRunStatus: string | null;
    readonly modelCompleted: boolean;
    /** 该次尝试聚合的模型 token 用量；执行路径未记录用量时缺省。 */
    readonly usage?: HeadlessModelUsage;
    readonly failureCategory: EpisodeFailureCategory | null;
    readonly errorCode: string | null;
}

/**
 * 全部尝试(含重试)聚合的模型 token 用量汇总。
 *
 * @remarks
 * token 数只对携带用量的尝试求和,缺失调用不贡献任何值;`attemptsMissingUsage`
 * 记录整个尝试没有用量数据的次数(如旧形态 facts),与逐调用的
 * `missingCalls` 语义区分。
 *
 * @example
 * ```ts
 * const usage: EvaluationSummaryUsage = {
 *   inputTokens: 150, outputTokens: 25, missingCalls: 1, attemptsMissingUsage: 0,
 * };
 * ```
 */
export interface EvaluationSummaryUsage {
    /** 携带用量的尝试的输入 token 总和。 */
    readonly inputTokens: number;
    /** 携带用量的尝试的输出 token 总和。 */
    readonly outputTokens: number;
    /** 各尝试缺失用量的调用次数总和。 */
    readonly missingCalls: number;
    /** 完全没有用量数据的尝试次数。 */
    readonly attemptsMissingUsage: number;
}

/**
 * 评测尝试的汇总指标。
 *
 * @example
 * ```ts
 * const summary: Pick<EvaluationSummary, "totalTasks" | "successRate"> = {
 *   totalTasks: 1, successRate: 1,
 * };
 * ```
 */
export interface EvaluationSummary {
    readonly totalTasks: number;
    readonly successfulTasks: number;
    readonly successRate: number;
    /** 每个任务只取最后一次尝试，避免重试使步数加权。 */
    readonly averageSteps: number;
    readonly failureCounts: Readonly<Record<EpisodeFailureCategory, number>>;
    /** 全部尝试聚合的模型 token 用量与缺失计数。 */
    readonly usage: EvaluationSummaryUsage;
}

/**
 * ALFWorld 评测的独立、可 JSON 序列化报告。
 *
 * @example
 * ```ts
 * const schemaVersion: EvaluationReport["schemaVersion"] = 1;
 * ```
 */
export interface EvaluationReport {
    readonly schemaVersion: 1;
    readonly manifestId: string;
    readonly manifestName: string;
    readonly profileId: string;
    readonly profileHash: string;
    readonly promptBundleVersion: 1;
    readonly configId: string;
    readonly modelId: string | null;
    readonly attempts: readonly EpisodeAttempt[];
    readonly summary: EvaluationSummary;
}

/**
 * 评测器生成报告所需的非敏感配置标识。
 *
 * @example
 * ```ts
 * const metadata: EvaluationReportMetadata = {
 *   manifest, profile, profileHash: "hash", promptBundleVersion: 1,
 *   configId: "alfworld-v1",
 * };
 * ```
 */
export interface EvaluationReportMetadata {
    readonly manifest: AlfworldManifest;
    readonly profile: AgentProfile;
    readonly profileHash: string;
    readonly promptBundleVersion: 1;
    readonly configId: string;
    readonly modelId?: string;
}

/**
 * 计算固定 Manifest 的短内容标识。
 *
 * @param manifest - 已校验的固定任务清单。
 * @returns 可放入报告的 SHA-256 前缀；不包含任务绝对路径以外的运行时秘密。
 * @example
 * ```ts
 * const manifestId = computeManifestId(manifest);
 * ```
 */
export function computeManifestId(manifest: AlfworldManifest): string {
    return createHash("sha256")
        .update(JSON.stringify(manifest), "utf8")
        .digest("hex")
        .slice(0, 16);
}

/**
 * 从一次执行结果构造不可变 Attempt DTO。
 *
 * @param task - Manifest 中的固定任务。
 * @param metadata - 报告追踪所需的配置标识。
 * @param execution - 环境与模型的最小事实。
 * @param retrySequence - 当前任务的重试序号。
 * @param durationMs - 本次尝试耗时（非负有限数）。
 * @returns 不包含完整 Observation 或凭据的报告记录。
 * @example
 * ```ts
 * const attempt = createEpisodeAttempt(task, metadata, execution, 0, 12);
 * ```
 */
export function createEpisodeAttempt(
    task: AlfworldManifestTask,
    metadata: EvaluationReportMetadata,
    execution: EpisodeExecutionFacts,
    retrySequence: number,
    durationMs: number,
): EpisodeAttempt {
    const failureCategory = execution.environment.won
        ? null
        : execution.failure?.category
            ?? inferFailureCategory(execution.environment, execution.model);

    return {
        taskId: task.taskId,
        gameFile: task.gameFile,
        split: task.split,
        seed: task.seed,
        maxSteps: task.maxSteps,
        profileId: metadata.profile.id,
        profileHash: metadata.profileHash,
        promptBundleVersion: metadata.promptBundleVersion,
        manifestId: computeManifestId(metadata.manifest),
        configId: metadata.configId,
        modelId: metadata.modelId ?? null,
        retrySequence,
        done: execution.environment.done,
        won: execution.environment.won,
        steps: execution.environment.steps,
        goalConditionSuccessRate: execution.environment.goalConditionSuccessRate,
        durationMs: normalizeFiniteNonNegative(durationMs),
        modelRunStatus: execution.model.runStatus,
        modelCompleted: execution.model.completed,
        ...(execution.model.usage === undefined
            ? {}
            : { usage: execution.model.usage }),
        failureCategory,
        errorCode: execution.environment.won
            ? null
            : execution.failure?.code ?? null,
    };
}

/**
 * 由 EpisodeExecutor 返回给 EvaluationRunner 的最小执行事实。
 *
 * @example
 * ```ts
 * const execution: EpisodeExecutionFacts = {
 *   environment: { done: false, won: false, steps: 1, goalConditionSuccessRate: 0 },
 *   model: { runStatus: "completed", completed: true },
 * };
 * ```
 */
export interface EpisodeExecutionFacts {
    readonly environment: EpisodeEnvironmentFacts;
    readonly model: EpisodeModelFacts;
    readonly failure?: {
        readonly category: EpisodeFailureCategory;
        readonly code?: string;
    };
}

/**
 * 聚合所有尝试并按任务最后一次尝试计算汇总指标。
 *
 * @param metadata - 报告元数据。
 * @param attempts - 按执行顺序排列的全部尝试（包括重试）。
 * @returns 机器可读汇总；原始尝试引用不会被覆盖。
 * @example
 * ```ts
 * const report = aggregateEvaluationReport(metadata, attempts);
 * console.log(report.summary.successRate);
 * ```
 */
export function aggregateEvaluationReport(
    metadata: EvaluationReportMetadata,
    attempts: readonly EpisodeAttempt[],
): EvaluationReport {
    const latestByTask = new Map<string, EpisodeAttempt>();
    for (const attempt of attempts) {
        latestByTask.set(attempt.taskId, attempt);
    }

    const latestAttempts = [...latestByTask.values()];
    const successfulTasks = latestAttempts.filter((attempt) => attempt.won).length;
    const totalTasks = metadata.manifest.tasks.length;
    const failureCounts = createFailureCounts();

    for (const attempt of latestAttempts) {
        if (attempt.failureCategory !== null && !attempt.won) {
            failureCounts[attempt.failureCategory] += 1;
        }
    }

    const averageSteps = latestAttempts.length === 0
        ? 0
        : latestAttempts.reduce((sum, attempt) => sum + attempt.steps, 0)
            / latestAttempts.length;

    return {
        schemaVersion: 1,
        manifestId: computeManifestId(metadata.manifest),
        manifestName: metadata.manifest.name,
        profileId: metadata.profile.id,
        profileHash: metadata.profileHash,
        promptBundleVersion: metadata.promptBundleVersion,
        configId: metadata.configId,
        modelId: metadata.modelId ?? null,
        attempts: [...attempts],
        summary: {
            totalTasks,
            successfulTasks,
            successRate: totalTasks === 0 ? 0 : successfulTasks / totalTasks,
            averageSteps,
            failureCounts,
            usage: summarizeUsage(attempts),
        },
    };
}

/**
 * 汇总全部尝试的用量;只对携带用量的尝试求和,无用量数据的尝试只计入
 * `attemptsMissingUsage`,不向 token 总数贡献任何值。
 */
function summarizeUsage(attempts: readonly EpisodeAttempt[]): EvaluationSummaryUsage {
    let inputTokens = 0;
    let outputTokens = 0;
    let missingCalls = 0;
    let attemptsMissingUsage = 0;

    for (const attempt of attempts) {
        if (attempt.usage === undefined) {
            attemptsMissingUsage += 1;
            continue;
        }
        inputTokens += attempt.usage.inputTokens;
        outputTokens += attempt.usage.outputTokens;
        missingCalls += attempt.usage.missingCalls;
    }

    return {
        inputTokens,
        outputTokens,
        missingCalls,
        attemptsMissingUsage,
    };
}

/**
 * 序列化评测报告；报告 DTO 不包含观察轨迹和敏感环境变量。
 *
 * @param report - 已聚合的评测报告。
 * @returns 带末尾换行的 JSON 文本。
 * @example
 * ```ts
 * await writeFile("report.json", serializeEvaluationReport(report));
 * ```
 */
export function serializeEvaluationReport(report: EvaluationReport): string {
    return `${JSON.stringify(report, null, 2)}\n`;
}

function createFailureCounts(): Record<EpisodeFailureCategory, number> {
    return {
        aborted: 0,
        domain_command_rejected: 0,
        infrastructure: 0,
        model_complete_without_win: 0,
        protocol: 0,
        task_not_won: 0,
        timeout: 0,
        unknown: 0,
    };
}

function inferFailureCategory(
    environment: EpisodeEnvironmentFacts,
    model: EpisodeModelFacts,
): EpisodeFailureCategory | null {
    if (environment.won) return null;
    if (model.completed) return "model_complete_without_win";
    if (environment.done) return "task_not_won";
    return "unknown";
}

function normalizeFiniteNonNegative(value: number): number {
    return Number.isFinite(value) && value >= 0 ? value : 0;
}
