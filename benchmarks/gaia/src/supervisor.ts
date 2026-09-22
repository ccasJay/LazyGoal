import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import {
    AttemptRecorder,
    type BenchmarkAttemptRecord,
    type PromptEvaluationAttemptMetadata,
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
import type { AgentProfile } from "../../../packages/runtime/src/agent-profile.js";

const MAX_DIAGNOSTIC_CHARS = 4_096;

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
    readonly attemptPath: string;
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
    /** Prompt Evaluation 候选所基于的固定 GAIA Profile。 */
    readonly baseProfile?: AgentProfile;
    /** Prompt Evaluation 实际执行的候选 Profile。 */
    readonly profile?: AgentProfile;
    /** Prompt Evaluation 写入 Attempt 的候选与模型身份。 */
    readonly promptEvaluation?: PromptEvaluationAttemptMetadata;
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
        ...(options.workerArtifact !== undefined ? { workerArtifact: options.workerArtifact } : {}),
        ...(options.baseImage !== undefined ? { baseImage: options.baseImage } : {}),
        ...(options.installCommands !== undefined ? { installCommands: options.installCommands } : {}),
        runId,
    });

    const env = options.isolatedEnvironment ?? new IsolatedEnvironment();
    const problemStatement = `Please answer the following GAIA question. Read the question carefully, consult any attachments or web sources needed, and submit your final answer via submit_answer.\n\n${options.task.question}`;

    const startTime = Date.now();
    const envResult = await env.run({
        task: options.task,
        spec,
        outputDirectory: options.outputDirectory,
        ...(options.workerArtifact !== undefined ? { workerArtifact: options.workerArtifact } : {}),
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
                ...(options.baseProfile === undefined ? {} : { baseProfile: options.baseProfile }),
                ...(options.profile === undefined ? {} : { profile: options.profile }),
            },
        },
    });
    const durationMs = Date.now() - startTime;

    const collectedArtifacts = envResult.artifact;
    const submittedAnswer = collectedArtifacts?.submittedAnswer ?? null;
    const artifactErrors: IsolatedEnvironmentError[] = (collectedArtifacts?.errors ?? []).map((error) => ({
        stage: "artifact_collect",
        code: error.stage,
        message: error.message,
    }));
    if (collectedArtifacts !== null
        && submittedAnswer !== null
        && collectedArtifacts.answerTaskId !== options.task.taskId) {
        artifactErrors.push({
            stage: "artifact_collect",
            code: "ANSWER_TASK_MISMATCH",
            message: "GAIA answer artifact task identity does not match the evaluated task",
        });
    }
    if (submittedAnswer === null && envResult.acp !== null) {
        const meta = envResult.acp.meta;
        const modelCompleted = meta?.modelCompleted;
        const runStatus = meta?.runStatus;
        const stepCount = meta?.stepCount;
        const stateDetails = [
            typeof modelCompleted === "boolean" ? `modelCompleted=${modelCompleted}` : null,
            typeof runStatus === "string" ? `runStatus=${runStatus}` : null,
            typeof stepCount === "number" ? `stepCount=${stepCount}` : null,
        ].filter((value): value is string => value !== null);
        artifactErrors.push({
            stage: "artifact_collect",
            code: "ACP_STOP_REASON",
            message: [
                `ACP prompt ended with stopReason=${envResult.acp.stopReason}`,
                ...stateDetails,
            ].join(", "),
        });
    }
    const errors: IsolatedEnvironmentError[] = [...envResult.errors, ...artifactErrors].map((error) => ({
        ...error,
        message: sanitizeDiagnostic(error.message),
    }));
    const isModelDecisionFailure = envResult.acp?.meta?.executionError === "INVALID_AGENT_DECISION";
    const isTaskTimeout = envResult.errors.some((error) => error.code === "TASK_TIMEOUT");
    const isModelIncomplete = envResult.acp !== null
        && submittedAnswer === null
        && envResult.acp.meta?.modelCompleted === false;
    const isDomainFailure = isModelDecisionFailure || isTaskTimeout || isModelIncomplete;
    let status: BenchmarkAttemptStatus;
    if (envResult.status === "cancelled") {
        status = "cancelled";
    } else if (isDomainFailure) {
        status = "completed";
    } else if (envResult.status === "completed" && artifactErrors.length > 0) {
        status = "infrastructure_error";
    } else {
        status = envResult.status;
    }
    const domainResult: GaiaDomainResult = status === "completed"
        ? scoreGaiaAnswer(submittedAnswer, options.task.expectedAnswer, options.task.level)
        : {
            submittedAnswer: null,
            correct: null,
            normalizedAnswer: null,
            normalizedExpected: null,
            level: options.task.level,
        };

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
        status,
        durationMs,
        usage: null,
        errors,
        artifactLocator: envResult.artifact?.persistence ?? null,
        domainResult,
        ...(options.promptEvaluation === undefined
            ? {}
            : { promptEvaluation: options.promptEvaluation }),
    };

    await recorder.commit(attemptRecord);

    return {
        status,
        taskId: options.task.taskId,
        goalId,
        runId,
        durationMs,
        domainResult,
        persistence: envResult.artifact?.persistence ?? null,
        errors,
        attemptPath: recorder.path,
    };
}

function sanitizeDiagnostic(message: string): string {
    let safe = message;
    for (const [name, value] of Object.entries(process.env)) {
        if (value !== undefined && value.length >= 4 && /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/iu.test(name)) {
            safe = safe.split(value).join("[REDACTED]");
        }
    }
    safe = safe
        .replace(/sk-[A-Za-z0-9][A-Za-z0-9._-]*/gu, "[REDACTED]")
        .replace(/Bearer\s+[^\s,;]+/giu, "Bearer [REDACTED]")
        .replace(/((?:api[-_ ]?key|access[-_ ]?token|secret|password)\s*[:=]\s*)[^\s,;]+/giu, "$1[REDACTED]");
    return safe.length <= MAX_DIAGNOSTIC_CHARS
        ? safe
        : `${safe.slice(0, MAX_DIAGNOSTIC_CHARS - 1)}…`;
}
