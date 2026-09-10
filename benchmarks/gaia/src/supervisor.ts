import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import {
    AttemptRecorder,
    type BenchmarkAttemptRecord,
} from "../../src/attempt-recorder.js";
import {
    IsolatedEnvironment,
    type IsolatedEnvironmentError,
    type IsolatedEnvironmentResult,
} from "../../src/isolated-environment.js";
import type { WorkerArtifact } from "../../src/worker-builder.js";
import type { GaiaDomainResult, GaiaManifestTask } from "./types.js";
import {
    GaiaEnvironmentSpec,
    type GaiaCollectedArtifacts,
} from "./environment-spec.js";
import { scoreGaiaAnswer } from "./grading.js";
import type { WebFetchHandler, WebSearchBackend } from "../../../packages/tools/src/index.js";

/** GAIA Supervisor 单次评测执行结果。 */
export interface GaiaSupervisorResult {
    readonly status: "completed" | "failed" | "cancelled" | "infrastructure_error";
    readonly taskId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly durationMs: number;
    readonly domainResult: GaiaDomainResult;
    readonly persistence: GaiaCollectedArtifacts["persistence"];
    readonly errors: readonly IsolatedEnvironmentError[];
}

/** GAIA Supervisor 配置选项。 */
export interface GaiaSupervisorOptions {
    readonly task: GaiaManifestTask;
    readonly dataRoot: string;
    readonly outputDirectory: string;
    readonly llmAdapter: LLMAdapter;
    readonly workerArtifact?: WorkerArtifact;
    readonly isolatedEnvironment?: IsolatedEnvironment;
    readonly baseImage?: string;
    readonly installCommands?: readonly string[];
    readonly taskTimeoutMs?: number;
    readonly artifactGraceMs?: number;
    readonly signal?: AbortSignal;
    readonly runId?: string;
    readonly searchBackend?: WebSearchBackend;
    readonly fetchHandler?: WebFetchHandler;
}

/**
 * 驱动单个 GAIA 任务在 IsolatedEnvironment 中的受控执行。
 *
 * @remarks
 * 负责构造 `GaiaEnvironmentSpec`、编排容器生命周期、回收答案产物、
 * 执行评分并在 `AttemptRecorder` 中持久化 Attempt 记录。
 *
 * @example
 * ```ts
 * const result = await runGaiaSupervisor({
 *   task, dataRoot: "/data/gaia", outputDirectory: "/tmp/output", llmAdapter,
 * });
 * ```
 */
export async function runGaiaSupervisor(
    options: GaiaSupervisorOptions,
): Promise<GaiaSupervisorResult> {
    const goalId = `goal-${randomUUID()}`;
    const runId = options.runId ?? `run-${randomUUID()}`;

    const spec = new GaiaEnvironmentSpec({
        task: options.task,
        dataRoot: options.dataRoot,
        workerArtifact: options.workerArtifact,
        baseImage: options.baseImage,
        installCommands: options.installCommands,
        runId,
    });

    const env = options.isolatedEnvironment ?? new IsolatedEnvironment();
    const problemStatement = `Please answer the following GAIA question. Read the question carefully, consult any attachments or web sources needed, and submit your final answer via submit_answer.\n\n${options.task.question}`;

    const envResult = await env.run({
        task: options.task,
        spec,
        outputDirectory: options.outputDirectory,
        workerArtifact: options.workerArtifact,
        ...(options.taskTimeoutMs !== undefined ? { taskTimeoutMs: options.taskTimeoutMs } : {}),
        ...(options.artifactGraceMs !== undefined ? { artifactGraceMs: options.artifactGraceMs } : {}),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
        acp: {
            llmAdapter: options.llmAdapter,
            cwd: "/workspace",
            prompt: [{ type: "text", text: problemStatement }],
            sessionMeta: {
                taskId: options.task.taskId,
                question: options.task.question,
                expectedAnswer: options.task.expectedAnswer,
                level: options.task.level,
                split: options.task.split,
                attachments: options.task.attachments,
                goalId,
                runId,
                structuredOutputMode: options.llmAdapter.structuredOutputMode,
            },
        },
    });

    const submittedAnswer = envResult.artifacts?.submittedAnswer ?? null;
    const domainResult = scoreGaiaAnswer(
        submittedAnswer,
        options.task.expectedAnswer,
        options.task.level,
    );

    const attemptsDir = join(
        options.outputDirectory,
        "attempts",
        encodeURIComponent(options.task.taskId),
    );
    const recorder = new AttemptRecorder({ rootDirectory: attemptsDir });

    const attemptRecord: BenchmarkAttemptRecord<GaiaDomainResult> = {
        benchmarkId: "gaia",
        taskId: options.task.taskId,
        goalId,
        runId,
        attempt: 1,
        status: envResult.status,
        durationMs: envResult.durationMs,
        usage: envResult.usage,
        errors: envResult.errors,
        artifactLocator: envResult.artifacts?.persistence ?? null,
        domainResult,
    };

    await recorder.commit(attemptRecord);

    return {
        status: envResult.status,
        taskId: options.task.taskId,
        goalId,
        runId,
        durationMs: envResult.durationMs,
        domainResult,
        persistence: envResult.artifacts?.persistence ?? null,
        errors: envResult.errors,
    };
}
