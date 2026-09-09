import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import type { HeadlessModelUsage, BenchmarkPersistenceLocator } from "../../src/headless-composition-root.js";
import { SwebenchContainer, parseSwebenchTasks, type SwebenchTask } from "./container.js";
import { isRecord, SWEBENCH_VERSION, type SwebenchManifest } from "./manifest.js";
import { requireSuccess, runProcess, type ProcessRunner } from "./process.js";
import {
    runSwebenchSupervisor,
    type SwebenchSupervisorOptions,
    type SwebenchSupervisorResult,
} from "./supervisor.js";
import { SWE_ACP_PROFILE } from "./worker-runtime.js";
import type { WorkerArtifact, WorkerManifest } from "./worker-builder.js";

/** 当前 SWE-bench ACP 容器评测身份。 */
export const SWE_ACP_CONFIG_ID = "swebench-acp-container-v1" as const;

/** 单题作答与评分的独立记录；usage 对缺失供应商数据显式计数。 */
export interface SwebenchAttempt {
    readonly instanceId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly attempt: 1;
    readonly durationMs: number;
    readonly runStatus: string;
    readonly stopReason: unknown;
    readonly usage: HeadlessModelUsage;
    readonly imageId: string | null;
    readonly patchPath: string | null;
    readonly patchBytes: number;
    readonly patchSha256: string | null;
    readonly persistence: BenchmarkPersistenceLocator | null;
    readonly errors: readonly { readonly stage: string; readonly message: string }[];
    gradingStatus: "pending" | "resolved" | "unresolved" | "empty_patch" | "grading_error" | "not_submitted";
    gradingLogDirectory?: string;
}

/** 报告中固定 Worker、Node 和 ACP 协议身份；不包含容器内路径或模型凭据。 */
export interface SwebenchWorkerReportIdentity {
    readonly workerSha256: string;
    readonly nodeSha256: string;
    readonly nodeVersion: WorkerManifest["nodeVersion"];
    readonly nodeImage: string;
    readonly nodeImageId: string;
    readonly platform: WorkerManifest["platform"];
    readonly acpProtocolVersion: 1;
    readonly acpSdkVersion: WorkerManifest["acpSdkVersion"];
}

/**
 * 完整清单是成功率分母，模型声明完成不参与评分；中止保留已有题目及未运行数量。
 *
 * @example
 * ```ts
 * console.log(report.summary.resolved, report.summary.total);
 * ```
 */
export interface SwebenchReport {
    readonly schemaVersion: 1;
    readonly runId: string;
    readonly configId: typeof SWE_ACP_CONFIG_ID;
    readonly harnessVersion: string;
    readonly profile: typeof SWE_ACP_PROFILE;
    readonly profileSha256: string;
    readonly worker: SwebenchWorkerReportIdentity;
    readonly manifest: SwebenchManifest;
    readonly manifestSha256: string;
    readonly modelId: string;
    readonly structuredOutputMode: LLMAdapter["structuredOutputMode"];
    readonly attempts: SwebenchAttempt[];
    status: "running" | "completed" | "aborted" | "failed";
    gradingError?: string;
    summary: ReturnType<typeof summarize>;
}

/**
 * 评测接线；Worker 产物由 CLI 构建并在所有题目间复用，Supervisor 可替换为确定性测试替身。
 *
 * @example
 * ```ts
 * const report = await runSwebenchEvaluation({
 *   manifest, outputDirectory, python: "python3", modelId: "model",
 *   llmAdapter, workerArtifact,
 * });
 * ```
 */
export interface SwebenchEvaluationOptions {
    readonly manifest: SwebenchManifest;
    readonly outputDirectory: string;
    readonly python: string;
    readonly modelId: string;
    readonly llmAdapter: LLMAdapter;
    readonly workerArtifact: WorkerArtifact;
    readonly signal?: AbortSignal;
    readonly runProcess?: ProcessRunner;
    readonly onProgress?: (message: string) => void;
    /** 测试注入的单题 Supervisor；生产默认使用真实 ACP 容器实现。 */
    readonly runSupervisor?: (options: SwebenchSupervisorOptions) => Promise<SwebenchSupervisorResult>;
}

export const BRIDGE_PATH = fileURLToPath(new URL("../python/bridge.py", import.meta.url));

/** 预检固定 harness 版本与 Docker daemon；不构造模型、不创建任务容器。 */
export async function preflightSwebench(python: string, run: ProcessRunner = runProcess, signal?: AbortSignal): Promise<void> {
    const response: unknown = JSON.parse(requireSuccess(await run(python, [BRIDGE_PATH, "preflight"],
        { timeoutMs: 30000, signal }), "SWE-bench preflight"));
    if (!isRecord(response) || response.harnessVersion !== SWEBENCH_VERSION) throw new Error("SWE-bench harness version mismatch");
}

/** 顺序单次作答、逐题保存补丁与报告，再委托官方 harness 评分。 */
export async function runSwebenchEvaluation(options: SwebenchEvaluationOptions): Promise<SwebenchReport> {
    const run = options.runProcess ?? runProcess;
    validateWorkerArtifact(options.workerArtifact);
    const output = resolve(options.outputDirectory);
    await mkdir(output, { recursive: false });
    const runId = `lg-${randomUUID()}`;
    const manifestPath = join(output, "manifest.json");
    await writeFile(manifestPath, JSON.stringify(options.manifest, null, 2) + "\n");
    const report: SwebenchReport = {
        schemaVersion: 1,
        runId,
        configId: SWE_ACP_CONFIG_ID,
        harnessVersion: SWEBENCH_VERSION,
        profile: SWE_ACP_PROFILE,
        profileSha256: hash(JSON.stringify(SWE_ACP_PROFILE)),
        worker: workerIdentity(options.workerArtifact.manifest),
        manifest: options.manifest,
        manifestSha256: hash(JSON.stringify(options.manifest)),
        modelId: options.modelId,
        structuredOutputMode: options.llmAdapter.structuredOutputMode,
        attempts: [],
        status: "running",
        summary: summarize([], options.manifest.instanceIds.length),
    };
    const predictions: { instance_id: string; model_name_or_path: string; model_patch: string }[] = [];
    const save = async () => {
        report.summary = summarize(report.attempts, options.manifest.instanceIds.length);
        await writeArtifact(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
    };
    await writeFile(join(output, "predictions.jsonl"), "");
    await save();
    try {
        options.onProgress?.("Loading pinned SWE-bench tasks");
        const response: unknown = JSON.parse(requireSuccess(await run(options.python, [BRIDGE_PATH, "prepare", manifestPath, output],
            { timeoutMs: 300000, signal: options.signal, maxBytes: 16 * 1024 * 1024 }), "Load SWE-bench dataset"));
        if (!isRecord(response) || response.harnessVersion !== SWEBENCH_VERSION) throw new Error("SWE-bench harness version mismatch");
        const tasks = parseSwebenchTasks(response);
        if (JSON.stringify(tasks.map((task) => task.instance_id)) !== JSON.stringify(options.manifest.instanceIds)) {
            throw new Error("Prepared task order does not match fixed manifest");
        }
        for (const [index, task] of tasks.entries()) {
            if (options.signal?.aborted) break;
            options.onProgress?.(`Solving ${index + 1}/${tasks.length}: ${task.instance_id}`);
            const { attempt, patch } = await solveTask({ ...options, outputDirectory: output }, task, `${runId}-${index}`, run);
            report.attempts.push(attempt);
            if (patch !== null) predictions.push({ instance_id: task.instance_id, model_name_or_path: "lazygoal", model_patch: patch });
            await writeArtifact(join(output, "predictions.jsonl"), predictions.map((p) => JSON.stringify(p) + "\n").join(""));
            await save();
        }
        if (options.signal?.aborted) {
            report.status = "aborted";
        } else if (predictions.length === 0) {
            report.status = "failed";
            report.gradingError = "No patches could be exported";
        } else {
            options.onProgress?.("Grading saved predictions with the official harness");
            const grading: unknown = JSON.parse(requireSuccess(await run(options.python,
                [BRIDGE_PATH, "grade", output, runId, String(options.manifest.testTimeoutSeconds)],
                { timeoutMs: (options.manifest.testTimeoutSeconds + 300) * 1000 * predictions.length,
                    signal: options.signal, maxBytes: 4 * 1024 * 1024 }), "SWE-bench grading"));
            applyGrades(report.attempts, grading);
            if (!isRecord(grading) || grading.exitCode !== 0) throw new Error("Official harness exited unsuccessfully; inspect harness.log");
            report.status = report.attempts.some((a) => a.gradingStatus === "grading_error" || a.errors.length > 0 || a.gradingStatus === "not_submitted")
                ? "failed" : "completed";
        }
    } catch (error) {
        report.status = options.signal?.aborted ? "aborted" : "failed";
        report.gradingError = errorMessage(error);
    } finally {
        if (report.status === "failed") {
            for (const attempt of report.attempts) {
                if (attempt.gradingStatus === "pending") attempt.gradingStatus = "grading_error";
            }
        }
        try {
            const ids = requireSuccess(await run("docker", ["ps", "-aq", "--filter", `name=sweb.eval.*.${runId}`],
                { timeoutMs: 10000 }), "Find grading containers").trim().split(/\s+/).filter(Boolean);
            if (ids.some((id) => !/^[a-f0-9]{12,64}$/.test(id))) throw new Error("Invalid Docker container IDs");
            if (ids.length) requireSuccess(await run("docker", ["rm", "--force", ...ids], { timeoutMs: 30000 }), "Remove grading containers");
        } catch (error) {
            report.gradingError = [report.gradingError, `Cleanup: ${errorMessage(error)}`].filter(Boolean).join("; ");
            if (report.status !== "aborted") report.status = "failed";
        }
        await save();
    }
    return report;
}

async function solveTask(options: SwebenchEvaluationOptions, task: SwebenchTask, name: string, run: ProcessRunner): Promise<{ readonly attempt: SwebenchAttempt; readonly patch: string | null }> {
    const started = Date.now();
    const goalId = randomUUID();
    const taskRunId = randomUUID();
    const container = new SwebenchContainer(`lg-swe-${name}`, task, run);
    const metadata = {
        instanceId: task.instance_id,
        repo: task.repo,
        baseCommit: task.base_commit,
        problemStatement: task.problem_statement,
        goalId,
        runId: taskRunId,
        maxSteps: options.manifest.maxSteps,
        structuredOutputMode: options.llmAdapter.structuredOutputMode,
    } as const;
    let result: SwebenchSupervisorResult = { stopReason: null, patch: null, patchPath: null, persistence: null, errors: [] };
    try {
        const supervisor = options.runSupervisor ?? runSwebenchSupervisor;
        const supervisorInput = {
            task,
            container,
            artifact: options.workerArtifact,
            manifest: options.workerArtifact.manifest,
            metadata,
            llmAdapter: options.llmAdapter,
            outputDirectory: options.outputDirectory,
            taskTimeoutMs: options.manifest.taskTimeoutSeconds * 1000,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        };
        result = await supervisor(supervisorInput);
    } catch (error) {
        result = { ...result, errors: [{ stage: options.signal?.aborted ? "cancel" : "runtime", message: errorMessage(error) }] };
    } finally {
        try { await container.close(); }
        catch (error) { result = { ...result, errors: [...result.errors, { stage: "cleanup", message: errorMessage(error) }] }; }
    }
    const patch = result.patch;
    const patchPath = patch === null ? null : result.patchPath ?? join(options.outputDirectory, `${task.instance_id}.patch`);
    if (patch !== null && result.patchPath === null) await writeArtifact(patchPath!, patch);
    const meta = result.meta;
    const attempt: SwebenchAttempt = {
        instanceId: task.instance_id,
        goalId,
        runId: taskRunId,
        attempt: 1,
        durationMs: Date.now() - started,
        runStatus: typeof meta?.runStatus === "string" ? meta.runStatus : "not_started",
        stopReason: meta?.stopReason ?? result.stopReason,
        usage: readUsage(meta?.usage),
        imageId: container.imageId ?? null,
        patchPath,
        patchBytes: patch === null ? 0 : Buffer.byteLength(patch),
        patchSha256: patch === null ? null : hash(patch),
        persistence: result.persistence ?? readPersistence(meta?.persistence),
        errors: result.errors,
        gradingStatus: patch === null ? "not_submitted" : "pending",
    };
    return { attempt, patch };
}

/** 校验官方评分桥接结果；缺失、重复或陌生题目不得被当成已解决。 */
export function applyGrades(attempts: SwebenchAttempt[], value: unknown): void {
    if (!isRecord(value) || !Number.isInteger(value.exitCode) || !Array.isArray(value.results)) throw new Error("Invalid grading response");
    const submitted = attempts.filter((a) => a.gradingStatus === "pending");
    const seen = new Set<string>();
    const updates: { attempt: SwebenchAttempt; status: SwebenchAttempt["gradingStatus"]; logDirectory: string }[] = [];
    for (const row of value.results) {
        if (!isRecord(row) || typeof row.instanceId !== "string" || seen.has(row.instanceId)
            || !["resolved", "unresolved", "empty_patch", "grading_error"].includes(String(row.status))
            || typeof row.logDirectory !== "string") throw new Error("Invalid grading result");
        const attempt = submitted.find((a) => a.instanceId === row.instanceId);
        if (attempt === undefined) throw new Error("Grading result does not match submitted instances");
        if ((attempt.patchBytes === 0) !== (row.status === "empty_patch")) throw new Error("Grading result contradicts exported patch");
        seen.add(row.instanceId);
        updates.push({ attempt, status: row.status as SwebenchAttempt["gradingStatus"], logDirectory: row.logDirectory });
    }
    if (seen.size !== submitted.length) throw new Error("Grading response is missing submitted instances");
    for (const update of updates) {
        update.attempt.gradingStatus = update.status;
        update.attempt.gradingLogDirectory = update.logDirectory;
    }
}

function summarize(attempts: readonly SwebenchAttempt[], total: number) {
    const resolved = attempts.filter((a) => a.gradingStatus === "resolved").length;
    return { total, attempted: attempts.length, notRun: total - attempts.length, resolved, resolvedRate: resolved / total,
        unresolved: attempts.filter((a) => a.gradingStatus === "unresolved").length,
        gradingErrors: attempts.filter((a) => a.gradingStatus === "grading_error").length,
        emptyPatches: attempts.filter((a) => a.gradingStatus === "empty_patch").length,
        notSubmitted: attempts.filter((a) => a.gradingStatus === "not_submitted").length,
        pending: attempts.filter((a) => a.gradingStatus === "pending").length,
        inputTokens: attempts.reduce((sum, a) => sum + a.usage.inputTokens, 0),
        outputTokens: attempts.reduce((sum, a) => sum + a.usage.outputTokens, 0),
        missingUsageCalls: attempts.reduce((sum, a) => sum + a.usage.missingCalls, 0),
        durationMs: attempts.reduce((sum, a) => sum + a.durationMs, 0) };
}

function workerIdentity(manifest: WorkerManifest): SwebenchWorkerReportIdentity {
    return { workerSha256: manifest.workerSha256, nodeSha256: manifest.nodeSha256, nodeVersion: manifest.nodeVersion,
        nodeImage: manifest.nodeImage, nodeImageId: manifest.nodeImageId, platform: manifest.platform,
        acpProtocolVersion: manifest.acpProtocolVersion, acpSdkVersion: manifest.acpSdkVersion };
}

function validateWorkerArtifact(artifact: WorkerArtifact): void {
    if (artifact.manifest.platform !== "linux/amd64" || artifact.manifest.nodeVersion !== "22.22.2"
        || artifact.manifest.acpProtocolVersion !== 1 || artifact.manifest.acpSdkVersion !== "1.4.0") {
        throw new TypeError("Worker artifact identity is not supported by SWE-bench ACP evaluation");
    }
}

function readUsage(value: unknown): HeadlessModelUsage {
    if (!isRecord(value)
        || typeof value.inputTokens !== "number" || !Number.isSafeInteger(value.inputTokens) || value.inputTokens < 0
        || typeof value.outputTokens !== "number" || !Number.isSafeInteger(value.outputTokens) || value.outputTokens < 0
        || typeof value.missingCalls !== "number" || !Number.isSafeInteger(value.missingCalls) || value.missingCalls < 0) {
        return { inputTokens: 0, outputTokens: 0, missingCalls: 0 };
    }
    return { inputTokens: value.inputTokens, outputTokens: value.outputTokens, missingCalls: value.missingCalls };
}

function readPersistence(value: unknown): BenchmarkPersistenceLocator | null {
    if (!isRecord(value) || typeof value.goalSnapshot !== "string" || typeof value.trajectory !== "string") return null;
    return { goalSnapshot: value.goalSnapshot, trajectory: value.trajectory,
        ...(typeof value.diagnosticTrace === "string" ? { diagnosticTrace: value.diagnosticTrace } : {}) };
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

async function writeArtifact(path: string, content: string): Promise<void> {
    const temporary = `${path}.tmp`;
    await writeFile(temporary, content);
    await rename(temporary, path);
}
