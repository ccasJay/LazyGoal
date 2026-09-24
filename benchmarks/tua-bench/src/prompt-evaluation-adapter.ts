import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { AgentProfile } from "../../../packages/runtime/src/agent-profile.js";
import {
    AttemptRecorder,
    type BenchmarkAttemptRecord,
    type PromptEvaluationAttemptMetadata,
} from "../../src/attempt-recorder.js";
import type { IsolatedEnvironmentError } from "../../src/isolated-environment.js";
import { IsolatedEnvironment } from "../../src/isolated-environment.js";
import type {
    PromptEvaluationBenchmarkAdapter,
    PromptEvaluationTaskInput,
} from "../../src/prompt-evaluation/runner.js";
import type { PromptEvaluationTaskResult } from "../../src/prompt-evaluation/protocol.js";
import type { WorkerArtifact } from "../../src/worker-builder.js";
import { TuaBenchEnvironmentSpec } from "./environment-spec.js";
import { loadTuaBenchManifest } from "./manifest-loader.js";
import {
    TUA_BENCH_WORKER_PROFILE,
    validateTuaBenchPromptEvaluationProfile,
} from "./worker-entry.js";
import type { TuaBenchCollectedArtifacts, TuaBenchDomainResult, TuaBenchTaskDefinition } from "./types.js";

/**
 * TUA Prompt Evaluation Adapter 的初始化依赖。
 *
 * @example
 * ```ts
 * const options: TuaBenchPromptEvaluationAdapterOptions = { workerArtifact };
 * ```
 */
export interface TuaBenchPromptEvaluationAdapterOptions {
    /** 共享 Worker 编译产物。 */
    readonly workerArtifact?: WorkerArtifact;
    /** 测试可替换的任务 Manifest 加载器。 */
    readonly loadManifestFile?: typeof loadTuaBenchManifest;
    /** 测试可替换的统一隔离环境。 */
    readonly isolatedEnvironment?: IsolatedEnvironment;
    /** 单任务容器及 Agent 总时限（毫秒）。 */
    readonly taskTimeoutMs?: number;
    /** Worker 退出与可信评分共享的清理时限（毫秒）。 */
    readonly artifactGraceMs?: number;
}

/**
 * 将单任务 TUA Manifest、候选 Profile、隔离 Agent 与官方连续 reward 接入 Prompt Evaluation。
 *
 * @remarks
 * 每个 Prompt Evaluation Manifest 必须包含 `benchmark: "tua-bench"`、`repoRoot` 和仅含
 * 一个 `taskId` 的 `tasks` 数组；任务正文、镜像和评分资源始终由仓库 Manifest 加载。
 * 基础设施、隔离和评分错误不返回 `metricScore`；成功评分返回官方 reward 原值。
 *
 * @example
 * ```ts
 * const adapter = new TuaBenchPromptEvaluationAdapter();
 * const task = await adapter.loadManifest("/tmp/tua-task.json");
 * ```
 */
export class TuaBenchPromptEvaluationAdapter implements PromptEvaluationBenchmarkAdapter<
    TuaBenchTaskDefinition,
    TuaBenchPromptEvaluationDomainResult
> {
    readonly benchmarkId = "tua-bench" as const;
    private readonly options: TuaBenchPromptEvaluationAdapterOptions;
    private readonly loadManifestFile: typeof loadTuaBenchManifest;
    private readonly isolatedEnvironment: IsolatedEnvironment;

    /**
     * 创建 TUA Prompt Evaluation adapter。
     *
     * @param options - Worker 编译产物、任务加载器、隔离环境及单任务时限覆盖。
     * @remarks
     * 生产运行使用仓库任务加载器和共享隔离环境；测试可注入确定性边界。
     */
    constructor(options: TuaBenchPromptEvaluationAdapterOptions = {}) {
        this.options = options;
        this.loadManifestFile = options.loadManifestFile ?? loadTuaBenchManifest;
        this.isolatedEnvironment = options.isolatedEnvironment ?? new IsolatedEnvironment();
    }

    /**
     * 读取单任务清单，再通过本地 TUA 仓库 Manifest 解析权威任务与评分资源。
     *
     * @param manifestPath - 包含 `repoRoot` 与单个 `taskId` 的 JSON 文件路径。
     * @returns 唯一匹配的 TUA 任务；缺失或重复 ID 会拒绝评测。
     * @throws 清单结构、仓库或任务身份无效时抛出异常。
     */
    async loadManifest(manifestPath: string): Promise<readonly TuaBenchTaskDefinition[]> {
        const raw: unknown = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
        if (!isTuaSingleTaskManifest(raw)) {
            throw new TypeError("TUA Prompt Evaluation Manifest must identify one task and its repoRoot");
        }
        const manifest = await this.loadManifestFile(raw.repoRoot);
        const matches = manifest.tasks.filter((task) => task.taskId === raw.tasks[0]!.taskId);
        if (matches.length !== 1) {
            throw new TypeError(`TUA Prompt Evaluation task is missing or ambiguous: ${raw.tasks[0]!.taskId}`);
        }
        return matches;
    }

    /**
     * 返回 TUA Worker 固定基准 Profile。
     *
     * @param profileId - 请求指定的基准 Profile 身份。
     * @returns TUA Worker 内置 Profile。
     * @throws 身份与 Worker 基准 Profile 不匹配时抛出异常。
     */
    async loadBaseProfile(profileId: string): Promise<AgentProfile> {
        if (profileId !== TUA_BENCH_WORKER_PROFILE.id) {
            throw new TypeError(
                `TUA Prompt Evaluation requested Profile ${profileId}, expected ${TUA_BENCH_WORKER_PROFILE.id}`,
            );
        }
        return TUA_BENCH_WORKER_PROFILE;
    }

    /**
     * 校验候选只能更改 TUA 基准 Profile 的 Prompt 文本字段。
     *
     * @param profile - GEPA 提供的完整候选 Profile。
     * @returns 已验证的候选 Profile；身份、工具、权限及契约字段须与基准一致。
     * @throws Profile 冻结字段不匹配或 Prompt 候选结构无效时抛出异常。
     */
    validateCandidateProfile(profile: AgentProfile): AgentProfile {
        return validateTuaBenchPromptEvaluationProfile(profile);
    }

    /**
     * 返回任务在当前 TUA Manifest 中的稳定 ID。
     *
     * @param task - 已从仓库 Manifest 解析的 TUA 任务。
     * @returns 该任务的 `taskId`，用于 Prompt Evaluation 结果关联。
     */
    taskId(task: TuaBenchTaskDefinition): string {
        return task.taskId;
    }

    /**
     * 运行一个隔离 TUA Attempt，并将有效官方 reward 作为连续评分返回。
     *
     * @param input - 公共 Runner 提供的任务、已校验 Profile、模型与结果目录。
     * @returns passed/failed 领域结果与原值 `metricScore`；取消或故障不携带领域分数。
     * @throws Runner、存储或隔离边界本身无法完成时抛出异常。
     */
    async runTask(
        input: PromptEvaluationTaskInput<TuaBenchTaskDefinition>,
    ): Promise<PromptEvaluationTaskResult<TuaBenchPromptEvaluationDomainResult>> {
        const goalId = `goal-${randomUUID()}`;
        const runId = `run-${randomUUID()}`;
        const startedAt = Date.now();
        const taskOutput = resolve(input.outputDirectory);
        const spec = new TuaBenchEnvironmentSpec({
            task: input.task,
            ...(this.options.workerArtifact === undefined ? {} : { workerArtifact: this.options.workerArtifact }),
        });
        const environmentResult = await this.isolatedEnvironment.run({
            task: input.task,
            spec,
            outputDirectory: taskOutput,
            taskTimeoutMs: this.options.taskTimeoutMs ?? input.task.agentTimeoutSec * 1_000,
            ...(this.options.artifactGraceMs === undefined ? {} : { artifactGraceMs: this.options.artifactGraceMs }),
            ...(input.signal === undefined ? {} : { signal: input.signal }),
            ...(this.options.workerArtifact === undefined ? {} : { workerArtifact: this.options.workerArtifact }),
            acp: {
                llmAdapter: input.llmAdapter,
                cwd: "/home/agent",
                prompt: [{ type: "text", text: input.task.instruction }],
                sessionMeta: {
                    ...input.task,
                    goalId,
                    runId,
                    structuredOutputMode: input.llmAdapter.structuredOutputMode,
                    baseProfile: input.baseProfile,
                    profile: input.profile,
                },
            },
        });

        const artifacts = environmentResult.artifact;
        const validScore = isValidTuaScore(artifacts);
        const status = environmentResult.status === "cancelled"
            ? "cancelled"
            : environmentResult.status !== "completed" || !validScore
                ? "infrastructure_error"
                : artifacts.reward >= 1.0 ? "passed" : "failed";
        const hasDomainScore = validScore && (status === "passed" || status === "failed");
        const domainResult = hasDomainScore
            ? {
                taskFamily: input.task.taskFamily,
                passed: artifacts.domainResult.passed,
                reward: artifacts.reward,
            }
            : null;
        const metricScore = hasDomainScore
            ? artifacts.reward
            : undefined;
        const errors = environmentResult.errors.map(mapError);
        const attemptPath = join(taskOutput, "attempt.json");
        const promptEvaluation: PromptEvaluationAttemptMetadata = {
            evaluationId: input.evaluationId,
            candidateId: input.candidateId,
            baseProfileId: input.baseProfile.id,
            promptSha256: input.fingerprint.promptSha256,
            promptSummary: input.fingerprint.promptSummary,
            modelConfigId: input.modelConfigId,
            modelId: input.modelId,
        };
        const attempt: BenchmarkAttemptRecord<TuaBenchPromptEvaluationDomainResult | null> = {
            benchmarkId: this.benchmarkId,
            taskId: input.task.taskId,
            goalId,
            runId,
            attempt: 1,
            status: status === "passed" ? "completed" : status,
            durationMs: Math.max(0, Date.now() - startedAt),
            usage: null,
            errors,
            artifactLocator: null,
            domainResult,
            promptEvaluation,
            lastStage: "grading",
        };
        const recorder = new AttemptRecorder<TuaBenchPromptEvaluationDomainResult | null>(attemptPath);
        await recorder.commit(attempt);

        return {
            taskId: input.task.taskId,
            status,
            domainResult,
            ...(metricScore === undefined ? {} : { metricScore }),
            attemptPath: recorder.path,
            artifactLocator: null,
            errors,
        };
    }
}

/**
 * Prompt Evaluation 中向 GEPA 暴露的无敏感领域评分投影。
 *
 * @example
 * ```ts
 * const result: TuaBenchPromptEvaluationDomainResult = {
 *   taskFamily: "document", passed: false, reward: 0.5,
 * };
 * ```
 */
export interface TuaBenchPromptEvaluationDomainResult {
    readonly taskFamily: string;
    readonly passed: boolean;
    readonly reward: number;
}

function isTuaSingleTaskManifest(value: unknown): value is {
    readonly benchmark: "tua-bench";
    readonly repoRoot: string;
    readonly tasks: readonly [{ readonly taskId: string }];
} {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (record.benchmark !== "tua-bench"
        || typeof record.repoRoot !== "string"
        || record.repoRoot.trim() === ""
        || !Array.isArray(record.tasks)
        || record.tasks.length !== 1) return false;
    const task = record.tasks[0];
    return task !== null
        && typeof task === "object"
        && !Array.isArray(task)
        && typeof (task as Record<string, unknown>).taskId === "string"
        && ((task as Record<string, unknown>).taskId as string).trim() !== "";
}

function mapError(error: IsolatedEnvironmentError) {
    return {
        stage: error.stage,
        ...(error.code === undefined ? {} : { code: error.code }),
        message: error.message,
    };
}

function isValidTuaScore(
    artifacts: TuaBenchCollectedArtifacts | null,
): artifacts is TuaBenchCollectedArtifacts & {
    readonly reward: number;
    readonly domainResult: TuaBenchDomainResult & { readonly passed: boolean; readonly reward: number };
} {
    return artifacts !== null
        && typeof artifacts.reward === "number"
        && Number.isFinite(artifacts.reward)
        && artifacts.domainResult.reward === artifacts.reward
        && artifacts.domainResult.passed === (artifacts.reward >= 1.0);
}
