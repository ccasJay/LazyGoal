import type { AgentProfile } from "../../../packages/runtime/src/agent-profile.js";
import type { PromptEvaluationAttemptMetadata } from "../../src/attempt-recorder.js";
import type {
    PromptEvaluationBenchmarkAdapter,
    PromptEvaluationTaskInput,
} from "../../src/prompt-evaluation/runner.js";
import type { PromptEvaluationTaskResult } from "../../src/prompt-evaluation/protocol.js";
import type { WorkerArtifact } from "../../src/worker-builder.js";
import { loadGaiaManifest } from "./manifest.js";
import {
    runGaiaSupervisor,
    type GaiaSupervisorOptions,
    type GaiaSupervisorResult,
} from "./supervisor.js";
import type { GaiaDomainResult, GaiaManifestTask } from "./types.js";
import {
    GAIA_WORKER_PROFILE,
    validateGaiaPromptEvaluationProfile,
} from "./worker-entry.js";

/** GAIA Prompt Evaluation adapter 的构造依赖。 */
export interface GaiaPromptEvaluationAdapterOptions {
    readonly workerArtifact?: WorkerArtifact;
    readonly baseImage?: string;
    readonly installCommands?: readonly string[];
    readonly taskTimeoutMs?: number;
    readonly artifactGraceMs?: number;
    /** 测试可注入的 Manifest 加载器。 */
    readonly loadManifestFile?: typeof loadGaiaManifest;
    /** 测试可注入的 Supervisor。 */
    readonly runSupervisor?: (options: GaiaSupervisorOptions) => Promise<GaiaSupervisorResult>;
}

/**
 * 将 GAIA Manifest、固定 Profile、隔离 Supervisor 和官方领域评分接到公共 runner。
 *
 * @remarks
 * adapter 在加载 Manifest 时保存同一份 `dataRoot`，之后逐任务交给既有 Supervisor。
 * `correct` 是 passed/failed 的唯一依据；取消和基础设施错误不携带领域结果。
 *
 * @example
 * ```ts
 * const adapter = new GaiaPromptEvaluationAdapter();
 * const tasks = await adapter.loadManifest("/data/gaia/manifest.json");
 * ```
 */
export class GaiaPromptEvaluationAdapter implements PromptEvaluationBenchmarkAdapter<
    GaiaManifestTask,
    GaiaDomainResult
> {
    readonly benchmarkId = "gaia" as const;
    private readonly options: GaiaPromptEvaluationAdapterOptions;
    private readonly loadManifestFile: typeof loadGaiaManifest;
    private readonly runSupervisor: NonNullable<GaiaPromptEvaluationAdapterOptions["runSupervisor"]>;
    private dataRoot: string | undefined;

    constructor(options: GaiaPromptEvaluationAdapterOptions = {}) {
        this.options = options;
        this.loadManifestFile = options.loadManifestFile ?? loadGaiaManifest;
        this.runSupervisor = options.runSupervisor ?? runGaiaSupervisor;
    }

    async loadManifest(path: string): Promise<readonly GaiaManifestTask[]> {
        const manifest = await this.loadManifestFile(path);
        this.dataRoot = manifest.dataRoot;
        return manifest.tasks;
    }

    async loadBaseProfile(profileId: string): Promise<AgentProfile> {
        if (profileId !== GAIA_WORKER_PROFILE.id) {
            throw new TypeError(
                `GAIA Prompt Evaluation requested Profile ${profileId}, expected ${GAIA_WORKER_PROFILE.id}`,
            );
        }
        return GAIA_WORKER_PROFILE;
    }

    validateCandidateProfile(profile: AgentProfile): AgentProfile {
        return validateGaiaPromptEvaluationProfile(profile);
    }

    taskId(task: GaiaManifestTask): string {
        return task.taskId;
    }

    async runTask(
        input: PromptEvaluationTaskInput<GaiaManifestTask>,
    ): Promise<PromptEvaluationTaskResult<GaiaDomainResult>> {
        if (this.dataRoot === undefined) {
            throw new Error("GAIA Prompt Evaluation Manifest must be loaded before running tasks");
        }
        const promptEvaluation: PromptEvaluationAttemptMetadata = {
            evaluationId: input.evaluationId,
            candidateId: input.candidateId,
            baseProfileId: input.baseProfile.id,
            promptSha256: input.fingerprint.promptSha256,
            promptSummary: input.fingerprint.promptSummary,
            modelConfigId: input.modelConfigId,
            modelId: input.modelId,
        };
        const result = await this.runSupervisor({
            task: input.task,
            dataRoot: this.dataRoot,
            outputDirectory: input.outputDirectory,
            llmAdapter: input.llmAdapter,
            baseProfile: input.baseProfile,
            profile: input.profile,
            promptEvaluation,
            ...(this.options.workerArtifact === undefined
                ? {}
                : { workerArtifact: this.options.workerArtifact }),
            ...(this.options.baseImage === undefined ? {} : { baseImage: this.options.baseImage }),
            ...(this.options.installCommands === undefined
                ? {}
                : { installCommands: this.options.installCommands }),
            ...(this.options.taskTimeoutMs === undefined
                ? {}
                : { taskTimeoutMs: this.options.taskTimeoutMs }),
            ...(this.options.artifactGraceMs === undefined
                ? {}
                : { artifactGraceMs: this.options.artifactGraceMs }),
            ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
        const status = taskStatus(result);
        return {
            taskId: input.task.taskId,
            status,
            domainResult: status === "passed" || status === "failed" ? result.domainResult : null,
            attemptPath: result.attemptPath,
            artifactLocator: result.persistence,
            errors: result.errors,
        };
    }
}

function taskStatus(result: GaiaSupervisorResult): PromptEvaluationTaskResult["status"] {
    if (result.status === "cancelled") return "cancelled";
    if (result.status === "infrastructure_error") return "infrastructure_error";
    return result.domainResult.correct === true ? "passed" : "failed";
}
