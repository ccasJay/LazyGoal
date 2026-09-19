import { join } from "node:path";

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
import type { PromptEvaluationTaskResult } from "../../src/prompt-evaluation/protocol.js";
import type { WorkerArtifact } from "../../src/worker-builder.js";
import type { AlfworldContainerEnvironmentConfig } from "./environment-config.js";
import {
    loadManifest,
    type AlfworldManifestTask,
} from "./manifest.js";
import {
    loadAlfworldProfile,
    validateAlfworldPromptEvaluationProfile,
    type LoadedAlfworldProfile,
} from "./profile.js";
import type {
    AlfworldAttemptDomainResult,
} from "./evaluation-runner.js";
import {
    runAlfworldSupervisor,
    type AlfworldSupervisorOptions,
    type AlfworldSupervisorResult,
} from "./supervisor.js";

/** ALFWorld Prompt Evaluation adapter 的构造依赖。 */
export interface AlfworldPromptEvaluationAdapterOptions {
    readonly workspaceRoot: string;
    readonly environment: AlfworldContainerEnvironmentConfig;
    readonly workerArtifact: WorkerArtifact;
    readonly sidecarScriptPath?: string;
    readonly baseImage?: string;
    readonly installCommands?: readonly string[];
    readonly taskTimeoutMs?: number;
    /** 测试可注入的 Manifest 加载器。 */
    readonly loadManifestFile?: typeof loadManifest;
    /** 测试可注入的 Profile 加载器。 */
    readonly loadProfile?: (workspaceRoot: string) => Promise<LoadedAlfworldProfile>;
    /** 测试可注入的 Supervisor。 */
    readonly runSupervisor?: (options: AlfworldSupervisorOptions) => Promise<AlfworldSupervisorResult>;
    /** 测试可注入的单调时钟。 */
    readonly now?: () => number;
}

/**
 * 将 ALFWorld 既有 Manifest、Profile、隔离 Supervisor 和领域评分接到公共 runner。
 *
 * @remarks
 * `won` 是 passed/failed 的唯一来源。候选 Profile 与基准 Profile 一同通过 ACP
 * metadata 进入 Worker，Worker 会在创建 Headless Root 前重新校验冻结字段。
 *
 * @example
 * ```ts
 * const adapter = new AlfworldPromptEvaluationAdapter({
 *   workspaceRoot: process.cwd(), environment, workerArtifact,
 * });
 * ```
 */
export class AlfworldPromptEvaluationAdapter implements PromptEvaluationBenchmarkAdapter<
    AlfworldManifestTask,
    AlfworldAttemptDomainResult
> {
    readonly benchmarkId = "alfworld" as const;
    private readonly options: AlfworldPromptEvaluationAdapterOptions;
    private readonly loadManifestFile: typeof loadManifest;
    private readonly loadProfile: NonNullable<AlfworldPromptEvaluationAdapterOptions["loadProfile"]>;
    private readonly runSupervisor: NonNullable<AlfworldPromptEvaluationAdapterOptions["runSupervisor"]>;
    private readonly now: () => number;

    constructor(options: AlfworldPromptEvaluationAdapterOptions) {
        this.options = options;
        this.loadManifestFile = options.loadManifestFile ?? loadManifest;
        this.loadProfile = options.loadProfile ?? loadAlfworldProfile;
        this.runSupervisor = options.runSupervisor ?? runAlfworldSupervisor;
        this.now = options.now ?? Date.now;
    }

    async loadManifest(path: string): Promise<readonly AlfworldManifestTask[]> {
        return (await this.loadManifestFile(path, this.options.environment.dataRoot)).tasks;
    }

    async loadBaseProfile(profileId: string): Promise<AgentProfile> {
        const loaded = await this.loadProfile(this.options.workspaceRoot);
        if (loaded.profile.id !== profileId) {
            throw new TypeError(
                `ALFWorld Prompt Evaluation requested Profile ${profileId}, loaded ${loaded.profile.id}`,
            );
        }
        return loaded.profile;
    }

    validateCandidateProfile(profile: AgentProfile): AgentProfile {
        return validateAlfworldPromptEvaluationProfile(profile);
    }

    taskId(task: AlfworldManifestTask): string {
        return task.taskId;
    }

    async runTask(
        input: PromptEvaluationTaskInput<AlfworldManifestTask>,
    ): Promise<PromptEvaluationTaskResult<AlfworldAttemptDomainResult>> {
        const startedAt = this.now();
        const result = await this.runSupervisor({
            task: input.task,
            environment: this.options.environment,
            workerArtifact: this.options.workerArtifact,
            llmAdapter: input.llmAdapter,
            outputDirectory: input.outputDirectory,
            baseProfile: input.baseProfile,
            profile: input.profile,
            ...(this.options.sidecarScriptPath === undefined
                ? {}
                : { sidecarScriptPath: this.options.sidecarScriptPath }),
            ...(this.options.baseImage === undefined ? {} : { baseImage: this.options.baseImage }),
            ...(this.options.installCommands === undefined
                ? {}
                : { installCommands: this.options.installCommands }),
            ...(this.options.taskTimeoutMs === undefined
                ? { taskTimeoutMs: input.task.maxSteps * 60_000 }
                : { taskTimeoutMs: this.options.taskTimeoutMs }),
            ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
        const status = taskStatus(result);
        const domainResult = toDomainResult(result, status);
        const attemptPath = join(input.outputDirectory, "attempt.json");
        const recorder = new AttemptRecorder<AlfworldAttemptDomainResult>(attemptPath);
        const attemptMetadata: PromptEvaluationAttemptMetadata = {
            evaluationId: input.evaluationId,
            candidateId: input.candidateId,
            baseProfileId: input.baseProfile.id,
            promptSha256: input.fingerprint.promptSha256,
            promptSummary: input.fingerprint.promptSummary,
            modelConfigId: input.modelConfigId,
            modelId: input.modelId,
        };
        const record: BenchmarkAttemptRecord<AlfworldAttemptDomainResult> = {
            benchmarkId: this.benchmarkId,
            taskId: input.task.taskId,
            goalId: result.goalId,
            runId: result.runId,
            attempt: 1,
            status: attemptStatus(status),
            durationMs: Math.max(0, this.now() - startedAt),
            usage: result.model.usage ?? null,
            errors: result.errors,
            artifactLocator: result.persistence,
            domainResult: toAttemptDomainResult(result, status),
            promptEvaluation: attemptMetadata,
            lastStage: "grading",
        };
        await recorder.commit(record);
        return {
            taskId: input.task.taskId,
            status,
            domainResult,
            attemptPath: recorder.path,
            artifactLocator: result.persistence,
            errors: result.errors,
        };
    }
}

function taskStatus(result: AlfworldSupervisorResult): PromptEvaluationTaskResult["status"] {
    if (result.status === "cancelled") return "cancelled";
    if (result.status === "infrastructure_error") return "infrastructure_error";
    return result.environment.won ? "passed" : "failed";
}

function attemptStatus(
    status: PromptEvaluationTaskResult["status"],
): BenchmarkAttemptRecord["status"] {
    if (status === "passed") return "completed";
    if (status === "failed") return "failed";
    return status;
}

function toDomainResult(
    result: AlfworldSupervisorResult,
    status: PromptEvaluationTaskResult["status"],
): AlfworldAttemptDomainResult | null {
    return status === "passed" || status === "failed"
        ? toAttemptDomainResult(result, status)
        : null;
}

function toAttemptDomainResult(
    result: AlfworldSupervisorResult,
    status: PromptEvaluationTaskResult["status"],
): AlfworldAttemptDomainResult {
    return {
        won: result.environment.won,
        steps: result.environment.steps,
        goalConditionSuccessRate: result.environment.goalConditionSuccessRate,
        failureCategory: status === "passed"
            ? null
            : status === "cancelled"
                ? "aborted"
                : status === "infrastructure_error"
                    ? "infrastructure"
                    : "task_not_won",
        errorCode: result.errors[0]?.code ?? result.errors[0]?.stage ?? null,
    };
}
