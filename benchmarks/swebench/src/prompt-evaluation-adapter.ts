import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import type { AgentProfile } from "../../../packages/runtime/src/agent-profile.js";
import {
    AttemptRecorder,
    type BenchmarkAttemptRecord,
    type PromptEvaluationAttemptMetadata,
} from "../../src/attempt-recorder.js";
import type {
    PromptEvaluationBenchmarkAdapter,
    PromptEvaluationTaskInput,
} from "../../src/prompt-evaluation/runner.js";
import type {
    PromptEvaluationArtifactLocator,
    PromptEvaluationTaskResult,
} from "../../src/prompt-evaluation/protocol.js";
import {
    requireSuccess,
    runProcess,
    type ProcessRunner,
} from "../../src/process.js";
import type { WorkerArtifact } from "../../src/worker-builder.js";
import {
    SwebenchContainer,
    parseSwebenchTasks,
    type SwebenchTask,
} from "./container.js";
import { BRIDGE_PATH } from "./evaluation.js";
import {
    SWEBENCH_VERSION,
    isRecord,
    parseSwebenchManifest,
    type SwebenchManifest,
} from "./manifest.js";
import {
    scoreRuntimeTrajectoryEvents,
    scoreSwebenchPersistedTrajectory,
    type PersistedTrajectoryScoreOptions,
    type SwebenchRuntimeHealthReport,
} from "./runtime-error-scorer.js";
import {
    runSwebenchSupervisor,
    type SwebenchSupervisorOptions,
    type SwebenchSupervisorResult,
} from "./supervisor.js";
import {
    SWE_ACP_PROFILE,
    validateSwebenchPromptEvaluationProfile,
} from "./worker-runtime.js";

/**
 * SWE-bench Prompt Evaluation 任务携带的完整领域配置与实例信息。
 *
 * @example
 * ```ts
 * const item: SwebenchPromptEvaluationTask = {
 *   task,
 *   maxSteps: 30,
 *   taskTimeoutSeconds: 900,
 *   testTimeoutSeconds: 600,
 * };
 * ```
 */
export interface SwebenchPromptEvaluationTask {
    /** 官方 SWE-bench 题目实例定义。 */
    readonly task: SwebenchTask;
    /** Manifest 冻结的每题最大步数。 */
    readonly maxSteps: number;
    /** Manifest 冻结的单题执行超时秒数。 */
    readonly taskTimeoutSeconds: number;
    /** Manifest 冻结的官方测试评分超时秒数。 */
    readonly testTimeoutSeconds: number;
}

/**
 * SWE-bench Prompt Evaluation 的领域评估结果（含补丁摘要与 Runtime 健康度报告）。
 *
 * @example
 * ```ts
 * const domain: SwebenchPromptEvaluationDomainResult = {
 *   instanceId: "astropy__astropy-12907",
 *   patchPath: "/tmp/out/astropy__astropy-12907.patch",
 *   patchBytes: 120,
 *   patchSha256: "a".repeat(64),
 *   runtimeHealth: report,
 * };
 * ```
 */
export interface SwebenchPromptEvaluationDomainResult {
    /** 题目实例 ID。 */
    readonly instanceId: string;
    /** 导出的补丁文件路径；未导出时为 `null`。 */
    readonly patchPath: string | null;
    /** 导出补丁的 UTF-8 字节数。 */
    readonly patchBytes: number;
    /** 导出补丁的 SHA-256 哈希；未导出时为 `null`。 */
    readonly patchSha256: string | null;
    /** 基于已提交 Trajectory 计算的 Runtime 错误率与健康度报告。 */
    readonly runtimeHealth: SwebenchRuntimeHealthReport;
}

/**
 * `SwebenchPromptEvaluationAdapter` 的构造依赖。
 *
 * @example
 * ```ts
 * const options: SwebenchPromptEvaluationAdapterOptions = {
 *   workerArtifact,
 *   python: "python3",
 * };
 * ```
 */
export interface SwebenchPromptEvaluationAdapterOptions {
    /** 已构建或缓存复用的 SWE-bench Worker 产物。 */
    readonly workerArtifact: WorkerArtifact;
    /** 调用 `bridge.py` 的 Python 可执行文件；默认 `python3`。 */
    readonly python?: string;
    /** 测试可注入的进程执行器。 */
    readonly runProcess?: ProcessRunner;
    /** 测试可注入的 Manifest 任务加载器。 */
    readonly loadTasksFromManifest?: (
        manifest: SwebenchManifest,
        manifestPath: string,
    ) => Promise<readonly SwebenchTask[]>;
    /** 测试可注入的单题 Supervisor。 */
    readonly runSupervisor?: (options: SwebenchSupervisorOptions) => Promise<SwebenchSupervisorResult>;
    /** 测试可注入的持久化 Trajectory 评分器。 */
    readonly scoreTrajectory?: (
        options: PersistedTrajectoryScoreOptions,
    ) => Promise<SwebenchRuntimeHealthReport>;
}

/**
 * 将 SWE-bench Manifest、候选 Profile + 模板覆盖、容器 Supervisor 与 Runtime 错误率评分器接入公共 Prompt Evaluation runner。
 *
 * @remarks
 * - `status` 由 `runtimeHealth.zeroFaultPass` 决定（零 Runtime 修复/拒斥/工具错误/中断且导出非空补丁时为 `"passed"`，否则为 `"failed"`）；
 * - `metricScore` 固定为 `runtimeHealth.runtimeScore`（$[0, 1]$ 连续得分）；
 * - 完整 Goal Snapshot、JSONL Trajectory、Diagnostic Trace 与导出的 `.patch` 均保留在任务输出目录，供 Harness² 读取全量轨迹并可选执行 `grade swebench` 官方判题。
 *
 * @example
 * ```ts
 * const adapter = new SwebenchPromptEvaluationAdapter({ workerArtifact });
 * const tasks = await adapter.loadManifest("/path/to/manifest.json");
 * ```
 */
export class SwebenchPromptEvaluationAdapter
    implements PromptEvaluationBenchmarkAdapter<
        SwebenchPromptEvaluationTask,
        SwebenchPromptEvaluationDomainResult
    > {
    readonly benchmarkId = "swebench" as const;
    private readonly options: SwebenchPromptEvaluationAdapterOptions;
    private readonly python: string;
    private readonly run: ProcessRunner;
    private readonly runSupervisor: (options: SwebenchSupervisorOptions) => Promise<SwebenchSupervisorResult>;
    private readonly scoreTrajectory: (options: PersistedTrajectoryScoreOptions) => Promise<SwebenchRuntimeHealthReport>;

    constructor(options: SwebenchPromptEvaluationAdapterOptions) {
        this.options = options;
        this.python = options.python ?? process.env["LAZYGOAL_SWEBENCH_PYTHON"] ?? "python3";
        this.run = options.runProcess ?? runProcess;
        this.runSupervisor = options.runSupervisor ?? runSwebenchSupervisor;
        this.scoreTrajectory = options.scoreTrajectory ?? scoreSwebenchPersistedTrajectory;
    }

    async loadManifest(path: string): Promise<readonly SwebenchPromptEvaluationTask[]> {
        const raw: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
        const manifest = parseSwebenchManifest(raw);
        const tasks = this.options.loadTasksFromManifest !== undefined
            ? await this.options.loadTasksFromManifest(manifest, path)
            : await this.prepareTasksViaBridge(manifest, path);
        if (JSON.stringify(tasks.map((t) => t.instance_id)) !== JSON.stringify(manifest.instanceIds)) {
            throw new Error("Prepared SWE-bench task order does not match manifest instanceIds");
        }
        return tasks.map((task) => Object.freeze({
            task,
            maxSteps: manifest.maxSteps,
            taskTimeoutSeconds: manifest.taskTimeoutSeconds,
            testTimeoutSeconds: manifest.testTimeoutSeconds,
        }));
    }

    async loadBaseProfile(profileId: string): Promise<AgentProfile> {
        if (profileId !== SWE_ACP_PROFILE.id) {
            throw new TypeError(
                `SWE-bench Prompt Evaluation requested Profile ${profileId}, expected ${SWE_ACP_PROFILE.id}`,
            );
        }
        return SWE_ACP_PROFILE;
    }

    validateCandidateProfile(profile: AgentProfile): AgentProfile {
        return validateSwebenchPromptEvaluationProfile(profile);
    }

    taskId(item: SwebenchPromptEvaluationTask): string {
        return item.task.instance_id;
    }

    async runTask(
        input: PromptEvaluationTaskInput<SwebenchPromptEvaluationTask>,
    ): Promise<PromptEvaluationTaskResult<SwebenchPromptEvaluationDomainResult>> {
        const { task, maxSteps, taskTimeoutSeconds } = input.task;
        const outputDirectory = resolve(input.outputDirectory);
        await mkdir(outputDirectory, { recursive: true });

        const goalId = `goal-${randomUUID()}`;
        const runId = `run-${randomUUID()}`;
        const container = new SwebenchContainer(
            `lg-swe-pe-${randomUUID().slice(0, 8)}`,
            task,
            this.run,
        );

        const metadata = {
            instanceId: task.instance_id,
            repo: task.repo,
            baseCommit: task.base_commit,
            problemStatement: task.problem_statement,
            goalId,
            runId,
            maxSteps,
            baseProfile: input.baseProfile,
            profile: input.profile,
            ...(input.templateOverrides === undefined
                ? {}
                : { templateOverrides: input.templateOverrides }),
        } as const;

        const started = Date.now();
        let supervisorResult: SwebenchSupervisorResult;
        try {
            supervisorResult = await this.runSupervisor({
                task,
                container,
                artifact: this.options.workerArtifact,
                manifest: this.options.workerArtifact.manifest,
                metadata,
                llmAdapter: input.llmAdapter,
                outputDirectory,
                taskTimeoutMs: taskTimeoutSeconds * 1000,
                ...(input.signal === undefined ? {} : { signal: input.signal }),
            });
        } finally {
            await container.close().catch(() => undefined);
        }
        const durationMs = Date.now() - started;

        if (input.signal?.aborted === true || supervisorResult.stopReason === "cancelled") {
            return {
                taskId: task.instance_id,
                status: "cancelled",
                domainResult: null,
                attemptPath: null,
                artifactLocator: null,
                errors: supervisorResult.errors,
            };
        }

        const isInfraStageFailure = supervisorResult.errors.some((error) =>
            error.stage === "container_start"
            || error.stage === "worker_inject"
            || error.stage === "worker_preflight"
            || error.stage === "transport"
            || error.stage === "model"
            || error.stage === "artifact_copy",
        );
        if (isInfraStageFailure && supervisorResult.persistence === null) {
            return {
                taskId: task.instance_id,
                status: "infrastructure_error",
                domainResult: null,
                attemptPath: null,
                artifactLocator: null,
                errors: supervisorResult.errors,
            };
        }

        const patch = supervisorResult.patch;
        const patchPath = patch === null
            ? null
            : supervisorResult.patchPath ?? join(outputDirectory, `${task.instance_id}.patch`);
        if (patch !== null && supervisorResult.patchPath === null && patchPath !== null) {
            await writeFile(patchPath, patch, "utf8");
        }

        const artifactLocator: PromptEvaluationArtifactLocator | null =
            supervisorResult.persistence === null
                ? null
                : {
                    goalSnapshot: toAbsolutePath(outputDirectory, supervisorResult.persistence.goalSnapshot),
                    trajectory: toAbsolutePath(outputDirectory, supervisorResult.persistence.trajectory),
                    ...(supervisorResult.persistence.diagnosticTrace === undefined
                        ? {}
                        : {
                            diagnosticTrace: toAbsolutePath(
                                outputDirectory,
                                supervisorResult.persistence.diagnosticTrace,
                            ),
                        }),
                };

        const runStatus = typeof supervisorResult.meta?.runStatus === "string"
            ? supervisorResult.meta.runStatus
            : "unknown";

        let runtimeHealth: SwebenchRuntimeHealthReport;
        if (artifactLocator !== null) {
            try {
                runtimeHealth = await this.scoreTrajectory({
                    goalSnapshotDir: artifactLocator.goalSnapshot,
                    trajectoryDir: artifactLocator.trajectory,
                    goalId,
                    runId,
                    stopReason: supervisorResult.stopReason,
                    patch,
                });
            } catch {
                runtimeHealth = scoreRuntimeTrajectoryEvents({
                    events: [],
                    runStatus,
                    stopReason: supervisorResult.stopReason,
                    patch,
                });
            }
        } else {
            runtimeHealth = scoreRuntimeTrajectoryEvents({
                events: [],
                runStatus,
                stopReason: supervisorResult.stopReason,
                patch,
            });
        }

        const domainResult: SwebenchPromptEvaluationDomainResult = Object.freeze({
            instanceId: task.instance_id,
            patchPath,
            patchBytes: patch === null ? 0 : Buffer.byteLength(patch, "utf8"),
            patchSha256: patch === null ? null : sha256(patch),
            runtimeHealth,
        });

        const promptEvaluation: PromptEvaluationAttemptMetadata = {
            evaluationId: input.evaluationId,
            candidateId: input.candidateId,
            baseProfileId: input.baseProfile.id,
            promptSha256: input.fingerprint.promptSha256,
            promptSummary: input.fingerprint.promptSummary,
            modelConfigId: input.modelConfigId,
            modelId: input.modelId,
        };

        const attemptsDir = join(
            outputDirectory,
            "attempts",
            encodeURIComponent(task.instance_id),
        );
        const recorder = new AttemptRecorder({ rootDirectory: attemptsDir });
        const attemptRecord: BenchmarkAttemptRecord<SwebenchPromptEvaluationDomainResult> = {
            benchmarkId: "swebench",
            taskId: task.instance_id,
            goalId,
            runId,
            attempt: 1,
            status: runtimeHealth.zeroFaultPass ? "completed" : "failed",
            durationMs,
            usage: null,
            errors: supervisorResult.errors,
            artifactLocator,
            domainResult,
            promptEvaluation,
        };
        await recorder.commit(attemptRecord);

        return {
            taskId: task.instance_id,
            status: runtimeHealth.zeroFaultPass ? "passed" : "failed",
            domainResult,
            metricScore: runtimeHealth.runtimeScore,
            attemptPath: recorder.path,
            artifactLocator,
            errors: supervisorResult.errors,
        };
    }

    private async prepareTasksViaBridge(
        manifest: SwebenchManifest,
        manifestPath: string,
    ): Promise<readonly SwebenchTask[]> {
        const tempDir = await mkdtemp(join(tmpdir(), "lg-swe-pe-manifest-"));
        try {
            const response: unknown = JSON.parse(
                requireSuccess(
                    await this.run(
                        this.python,
                        [BRIDGE_PATH, "prepare", resolve(manifestPath), tempDir],
                        { timeoutMs: 300_000, maxBytes: 16 * 1024 * 1024 },
                    ),
                    "Load SWE-bench dataset for Prompt Evaluation",
                ),
            );
            if (!isRecord(response) || response.harnessVersion !== SWEBENCH_VERSION) {
                throw new Error("SWE-bench harness version mismatch");
            }
            return parseSwebenchTasks(response);
        } finally {
            await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
        }
    }
}

function toAbsolutePath(baseDir: string, maybeRelative: string): string {
    return isAbsolute(maybeRelative) ? resolve(maybeRelative) : resolve(baseDir, maybeRelative);
}

function sha256(text: string): string {
    return createHash("sha256").update(text, "utf8").digest("hex");
}
