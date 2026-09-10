import { randomUUID } from "node:crypto";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import type { AcpClientResult, AcpSessionUpdate } from "../../../packages/acp/src/index.js";
import {
    IsolatedEnvironment,
    type IsolatedEnvironmentError,
} from "../../src/isolated-environment.js";
import type { WorkerArtifact } from "../../src/worker-builder.js";
import type { AlfworldContainerEnvironmentConfig } from "./environment-config.js";
import type { AlfworldManifestTask } from "./manifest.js";
import { AlfworldEnvironmentSpec, type AlfworldCollectedArtifacts } from "./environment-spec.js";
import { ALFWORLD_CONTAINER_DATA_ROOT, ALFWORLD_CONTAINER_SIDECAR_PATH } from "./worker-config.js";
import type { EpisodeEnvironmentFacts, EpisodeModelFacts } from "./report.js";

/**
 * 一次 ALFWorld 容器作答的共享隔离结果。
 *
 * @example
 * ```ts
 * const result = await runAlfworldSupervisor(options);
 * console.log(result.environment.won, result.imageId);
 * ```
 */
export interface AlfworldSupervisorResult {
    readonly status: "completed" | "failed" | "cancelled" | "infrastructure_error";
    readonly taskId: string;
    readonly goalId: string;
    readonly runId: string;
    /** 实际启动镜像的内容 ID；容器尚未创建时为 `null`。 */
    readonly imageId: string | null;
    readonly environment: EpisodeEnvironmentFacts;
    readonly model: EpisodeModelFacts;
    readonly persistence: AlfworldCollectedArtifacts["persistence"];
    readonly acp: AcpClientResult | null;
    readonly errors: readonly AlfworldSupervisorError[];
}

/**
 * ALFWorld Supervisor 的有界失败事实。
 *
 * @example
 * ```ts
 * const error: AlfworldSupervisorError = {
 *   stage: "preflight", message: "sidecar unavailable",
 * };
 * ```
 */
export interface AlfworldSupervisorError {
    readonly stage: string;
    readonly code?: string;
    readonly message: string;
}

/**
 * 在共享 IsolatedEnvironment 中运行一个 ALFWorld 任务。
 *
 * @remarks
 * Worker、Python sidecar 和游戏数据全部进入当前独立容器；宿主只提供 LLM Adapter。
 * 评分不在此处执行，环境 `won` 与步数由 `collectArtifacts` 回收。
 *
 * @param options - 任务、容器数据配置、Worker、模型和输出目录。
 * @returns ACP 终态、领域结果、持久化定位和分阶段错误。
 * @example
 * ```ts
 * const result = await runAlfworldSupervisor({ task, environment, workerArtifact,
 *   llmAdapter, outputDirectory: "/tmp/run" });
 * ```
 */
export async function runAlfworldSupervisor(
    options: AlfworldSupervisorOptions,
): Promise<AlfworldSupervisorResult> {
    const goalId = `goal-${randomUUID()}`;
    const runId = `run-${randomUUID()}`;
    const problemStatement = `Complete ALFWorld task ${options.task.taskId} using only the ALFWorld environment tools.`;
    const spec = new AlfworldEnvironmentSpec({
        task: options.task,
        environment: options.environment,
        workerArtifact: options.workerArtifact,
        ...(options.sidecarScriptPath === undefined ? {} : { sidecarScriptPath: options.sidecarScriptPath }),
        ...(options.baseImage === undefined ? {} : { baseImage: options.baseImage }),
        ...(options.installCommands === undefined ? {} : { installCommands: options.installCommands }),
        workerPython: options.environment.pythonExecutable,
        runId,
    });
    const result = await new IsolatedEnvironment().run({
        task: options.task,
        spec,
        outputDirectory: options.outputDirectory,
        workerArtifact: options.workerArtifact,
        ...(options.taskTimeoutMs === undefined ? {} : { taskTimeoutMs: options.taskTimeoutMs }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.artifactGraceMs === undefined ? {} : { artifactGraceMs: options.artifactGraceMs }),
        acp: {
            llmAdapter: options.llmAdapter,
            cwd: "/workspace",
            prompt: [{ type: "text", text: problemStatement }],
            sessionMeta: {
                order: options.task.order,
                taskId: options.task.taskId,
                split: options.task.split,
                gameFile: options.task.gameFile,
                seed: options.task.seed,
                maxSteps: options.task.maxSteps,
                problemStatement,
                goalId,
                runId,
                structuredOutputMode: options.llmAdapter.structuredOutputMode,
                dataRoot: ALFWORLD_CONTAINER_DATA_ROOT,
                pythonExecutable: options.environment.pythonExecutable,
                sidecarPath: ALFWORLD_CONTAINER_SIDECAR_PATH,
            },
            ...(options.onUpdate === undefined ? {} : { onUpdate: options.onUpdate }),
        },
    });
    const artifact = result.artifact;
    const errors = result.errors.map(mapError);
    if (artifact !== null) {
        errors.push(...artifact.errors.map((error) => ({ stage: error.stage, message: error.message })));
    }
    return {
        status: result.status,
        taskId: options.task.taskId,
        goalId,
        runId,
        imageId: result.imageId,
        environment: artifact?.environment ?? emptyEnvironment(),
        model: artifact?.model ?? { runStatus: null, completed: false },
        persistence: artifact?.persistence ?? null,
        acp: result.acp,
        errors,
    };
}

/**
 * ALFWorld Supervisor 的构造输入。
 *
 * @example
 * ```ts
 * const options: AlfworldSupervisorOptions = {
 *   task, environment, workerArtifact, llmAdapter,
 *   outputDirectory: "/tmp/alfworld-run",
 * };
 * ```
 */
export interface AlfworldSupervisorOptions {
    readonly task: AlfworldManifestTask;
    readonly environment: AlfworldContainerEnvironmentConfig;
    readonly workerArtifact: WorkerArtifact;
    readonly llmAdapter: LLMAdapter;
    readonly outputDirectory: string;
    readonly taskTimeoutMs?: number;
    readonly artifactGraceMs?: number;
    readonly signal?: AbortSignal;
    readonly sidecarScriptPath?: string;
    readonly baseImage?: string;
    readonly installCommands?: readonly string[];
    readonly onUpdate?: (update: AcpSessionUpdate) => void | Promise<void>;
}

function mapError(error: IsolatedEnvironmentError): AlfworldSupervisorError {
    return { stage: error.stage, ...(error.code === undefined ? {} : { code: error.code }), message: error.message };
}

function emptyEnvironment(): EpisodeEnvironmentFacts {
    return { done: false, won: false, steps: 0, goalConditionSuccessRate: 0 };
}
