import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import type { HeadlessModelUsage, BenchmarkPersistenceLocator } from "../../src/headless-composition-root.js";
import { AttemptRecorder, type BenchmarkAttemptRecord } from "../../src/attempt-recorder.js";
import { SwebenchContainer, parseSwebenchTasks, type SwebenchTask } from "./container.js";
import { isRecord, parseSwebenchManifest, SWEBENCH_VERSION, type SwebenchManifest } from "./manifest.js";
import { requireSuccess, runProcess, type ProcessRunner } from "../../src/process.js";
import {
    runSwebenchSupervisor,
    type SwebenchSupervisorOptions,
    type SwebenchSupervisorResult,
} from "./supervisor.js";
import { SWE_ACP_PROFILE } from "./worker-runtime.js";
import type { WorkerArtifact, WorkerManifest } from "../../src/worker-builder.js";

/** 当前 SWE-bench ACP 容器评测身份。 */
export const SWE_ACP_CONFIG_ID = "swebench-acp-container-v1" as const;

/**
 * 单题作答与评分的独立记录；未知状态与用量不会被表示为未启动或零消耗。
 * @example
 * ```ts
 * const attempt: SwebenchAttempt = report.attempts[0]!;
 * console.log(attempt.runStatus, attempt.errors, attempt.gradingStatus);
 * ```
 */
export interface SwebenchAttempt {
    readonly instanceId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly attempt: 1;
    readonly durationMs: number;
    readonly runStatus: string;
    readonly stopReason: unknown;
    /** null 表示未能取得用量事实；计数为零只表示已知零用量。 */
    readonly usage: HeadlessModelUsage | null;
    readonly imageId: string | null;
    readonly patchPath: string | null;
    readonly patchBytes: number;
    readonly patchSha256: string | null;
    readonly persistence: BenchmarkPersistenceLocator | null;
    readonly errors: readonly { readonly stage: string; readonly code?: string; readonly message: string }[];
    gradingStatus: "pending" | "resolved" | "unresolved" | "empty_patch" | "grading_error" | "not_submitted";
    gradingLogDirectory?: string;
}

/**
 * SWE-bench 写入共享 AttemptRecorder 的领域字段。
 *
 * @example
 * ```ts
 * const result: SwebenchAttemptDomainResult = {
 *   patch: "diff --git ...", patchSha256: "abc", gradingStatus: "resolved", resolved: true,
 * };
 * ```
 */
export interface SwebenchAttemptDomainResult {
    readonly patch: string | null;
    readonly patchSha256: string | null;
    readonly gradingStatus: SwebenchAttempt["gradingStatus"];
    readonly resolved: boolean | null;
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
    let gradingStarted = false;
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
            await persistSwebenchAttempt(output, attempt, options.workerArtifact.manifest);
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
            gradingStarted = true;
            const grading: unknown = JSON.parse(requireSuccess(await run(options.python,
                [BRIDGE_PATH, "grade", output, runId, String(options.manifest.testTimeoutSeconds)],
                { timeoutMs: (options.manifest.testTimeoutSeconds + 300) * 1000 * predictions.length,
                    signal: options.signal, maxBytes: 4 * 1024 * 1024 }), "SWE-bench grading"));
            applyGrades(report.attempts, grading);
            await persistSwebenchGrades(output, report.attempts);
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
        if (gradingStarted) {
            try {
                await persistSwebenchGrades(output, report.attempts);
            } catch (error) {
                report.gradingError = [report.gradingError, `Attempt persistence: ${errorMessage(error)}`].filter(Boolean).join("; ");
                if (report.status !== "aborted") report.status = "failed";
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

/**
 * 独立评分命令的依赖边界；不包含 LLM 或 Worker 构建输入。
 *
 * @example
 * ```ts
 * const options: SwebenchGradeOptions = { outputDirectory: "/tmp/swebench-run" };
 * ```
 */
export interface SwebenchGradeOptions {
    readonly outputDirectory: string;
    readonly python?: string;
    readonly runProcess?: ProcessRunner;
}

/**
 * 读取已有 predictions/dataset 和报告，调用官方 harness 并更新 Attempt 评分字段。
 *
 * @param options - 已有输出目录与 Python 进程边界。
 * @returns 更新后的 SWE-bench 报告。
 * @throws 产物缺失、JSON 损坏或官方评分响应非法时抛出异常；不会构造模型。
 * @example
 * ```ts
 * const report = await gradeSwebenchEvaluation({ outputDirectory: ".lazygoal/run" });
 * console.log(report.summary.resolved);
 * ```
 */
export async function gradeSwebenchEvaluation(options: SwebenchGradeOptions): Promise<SwebenchReport> {
    const output = resolve(options.outputDirectory);
    const run = options.runProcess ?? runProcess;
    const report = JSON.parse(await readFile(join(output, "report.json"), "utf8")) as SwebenchReport;
    validateSwebenchReportForGrade(report, output);
    const savedAttempts = await readSwebenchAttemptRecords(output, report);
    const predictionsText = await readFile(join(output, "predictions.jsonl"), "utf8");
    const predictions = parsePredictions(predictionsText, report.manifest.instanceIds);
    for (const prediction of predictions) {
        const saved = savedAttempts.get(prediction.instance_id);
        if (saved === undefined) continue;
        const patch = saved.domainResult.patch;
        if (patch !== prediction.model_patch) {
            throw new TypeError(`Prediction patch does not match saved Attempt: ${prediction.instance_id}`);
        }
    }
    if (predictions.length === 0) {
        report.status = "failed";
        report.gradingError = "No saved predictions are available for grading";
        for (const attempt of report.attempts) {
            if (attempt.gradingStatus === "pending") attempt.gradingStatus = "grading_error";
        }
        await persistSwebenchGrades(output, report.attempts);
        report.summary = summarize(report.attempts, report.manifest.instanceIds.length);
        await writeArtifact(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
        return report;
    }
    const predictionIds = new Set(predictions.map((prediction) => prediction.instance_id));
    for (const attempt of report.attempts) {
        if (predictionIds.has(attempt.instanceId)) attempt.gradingStatus = "pending";
    }
    const gradingRunId = `lg-grade-${randomUUID()}`;
    let grading: unknown;
    try {
        grading = JSON.parse(requireSuccess(await run(options.python ?? "python3", [
            BRIDGE_PATH,
            "grade",
            output,
            gradingRunId,
            String(report.manifest.testTimeoutSeconds),
        ], {
            timeoutMs: (report.manifest.testTimeoutSeconds + 300) * 1000 * Math.max(1, predictions.length),
            maxBytes: 4 * 1024 * 1024,
        }), "SWE-bench grading"));
        applyGrades(report.attempts, grading);
    } catch (error) {
        markPendingGradesAsErrors(report.attempts);
        report.status = "failed";
        report.gradingError = errorMessage(error);
        await persistSwebenchGrades(output, report.attempts);
        report.summary = summarize(report.attempts, report.manifest.instanceIds.length);
        await writeArtifact(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
        return report;
    }
    await persistSwebenchGrades(output, report.attempts);
    const harnessExitCode = isRecord(grading) && typeof grading.exitCode === "number" ? grading.exitCode : 0;
    report.status = harnessExitCode !== 0 || report.attempts.some((attempt) => attempt.gradingStatus === "grading_error" || attempt.gradingStatus === "pending" || attempt.gradingStatus === "not_submitted")
        ? "failed" : "completed";
    if (harnessExitCode !== 0) report.gradingError = `Official harness exited with code ${harnessExitCode}`;
    report.summary = summarize(report.attempts, report.manifest.instanceIds.length);
    await writeArtifact(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
}

function markPendingGradesAsErrors(attempts: readonly SwebenchAttempt[]): void {
    for (const attempt of attempts) {
        if (attempt.gradingStatus === "pending") attempt.gradingStatus = "grading_error";
    }
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
        runStatus: typeof meta?.runStatus === "string" ? meta.runStatus : "unknown",
        stopReason: meta?.stopReason ?? result.stopReason,
        usage: readUsage(meta?.usage),
        imageId: result.imageId ?? container.imageId ?? null,
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
        unknownUsageAttempts: attempts.filter((a) => a.usage === null).length,
        inputTokens: attempts.reduce((sum, a) => sum + (a.usage?.inputTokens ?? 0), 0),
        outputTokens: attempts.reduce((sum, a) => sum + (a.usage?.outputTokens ?? 0), 0),
        missingUsageCalls: attempts.reduce((sum, a) => sum + (a.usage?.missingCalls ?? 0), 0),
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

function readUsage(value: unknown): HeadlessModelUsage | null {
    if (!isRecord(value)
        || typeof value.inputTokens !== "number" || !Number.isSafeInteger(value.inputTokens) || value.inputTokens < 0
        || typeof value.outputTokens !== "number" || !Number.isSafeInteger(value.outputTokens) || value.outputTokens < 0
        || typeof value.missingCalls !== "number" || !Number.isSafeInteger(value.missingCalls) || value.missingCalls < 0) {
        return null;
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

async function persistSwebenchAttempt(
    outputDirectory: string,
    attempt: SwebenchAttempt,
    worker: WorkerManifest,
): Promise<void> {
    const recorder = new AttemptRecorder<SwebenchAttemptDomainResult>(attemptPath(outputDirectory, attempt.instanceId, attempt.attempt));
    const record: BenchmarkAttemptRecord<SwebenchAttemptDomainResult> = {
        benchmarkId: "swebench",
        taskId: attempt.instanceId,
        goalId: attempt.goalId,
        runId: attempt.runId,
        attempt: attempt.attempt,
        status: attemptStatus(attempt),
        durationMs: attempt.durationMs,
        usage: attempt.usage,
        errors: attempt.errors,
        artifactLocator: attempt.persistence,
        domainResult: {
            patch: attempt.patchPath === null ? null : await readPatch(resolveArtifactPath(outputDirectory, attempt.patchPath)),
            patchSha256: attempt.patchSha256,
            gradingStatus: attempt.gradingStatus,
            resolved: attempt.gradingStatus === "resolved" ? true : attempt.gradingStatus === "unresolved" ? false : null,
        },
        environment: { imageId: attempt.imageId },
        worker: {
            workerSha256: worker.workerSha256,
            nodeSha256: worker.nodeSha256,
            nodeVersion: worker.nodeVersion,
            platform: worker.platform,
        },
        lastStage: "execution",
    };
    await recorder.commit(record);
}

async function persistSwebenchGrades(outputDirectory: string, attempts: readonly SwebenchAttempt[]): Promise<void> {
    for (const attempt of attempts) {
        const recorder = new AttemptRecorder<SwebenchAttemptDomainResult>(attemptPath(outputDirectory, attempt.instanceId, attempt.attempt));
        const current = await recorder.read();
        if (current === undefined) {
            const patch = attempt.patchPath === null ? null : await readPatch(resolveArtifactPath(outputDirectory, attempt.patchPath));
            await recorder.commit({
                benchmarkId: "swebench",
                taskId: attempt.instanceId,
                goalId: attempt.goalId,
                runId: attempt.runId,
                attempt: attempt.attempt,
                status: attemptStatus(attempt),
                durationMs: attempt.durationMs,
                usage: attempt.usage,
                errors: attempt.errors,
                artifactLocator: attempt.persistence,
                domainResult: {
                    patch,
                    patchSha256: attempt.patchSha256,
                    gradingStatus: attempt.gradingStatus,
                    resolved: attempt.gradingStatus === "resolved" ? true : attempt.gradingStatus === "unresolved" ? false : null,
                },
                environment: { imageId: attempt.imageId },
                lastStage: "grading",
            });
            continue;
        }
        await recorder.update({
            status: attemptStatus(attempt),
            lastStage: "grading",
            domainResult: {
                ...current.domainResult,
                patchSha256: attempt.patchSha256,
                gradingStatus: attempt.gradingStatus,
                resolved: attempt.gradingStatus === "resolved" ? true : attempt.gradingStatus === "unresolved" ? false : null,
            },
        });
    }
}

function attemptPath(outputDirectory: string, taskId: string, attempt: number): string {
    return join(outputDirectory, "attempts", taskId, `attempt-${attempt}.json`);
}

function attemptStatus(attempt: SwebenchAttempt): BenchmarkAttemptRecord["status"] {
    if (attempt.errors.length > 0) {
        return attempt.errors.some((error) => error.stage !== "model") ? "infrastructure_error" : "failed";
    }
    if (attempt.gradingStatus === "not_submitted") return "failed";
    if (attempt.gradingStatus === "grading_error") return "infrastructure_error";
    return "completed";
}

function parsePredictions(
    text: string,
    manifestIds: readonly string[],
): { instance_id: string; model_name_or_path: string; model_patch: string }[] {
    const manifest = new Set(manifestIds);
    const seen = new Set<string>();
    const predictions: { instance_id: string; model_name_or_path: string; model_patch: string }[] = [];
    for (const line of text.split(/\r?\n/u)) {
        if (line.trim() === "") continue;
        let value: unknown;
        try { value = JSON.parse(line); }
        catch { throw new TypeError("Invalid SWE-bench prediction JSON"); }
        if (!isRecord(value)
            || typeof value.instance_id !== "string"
            || !manifest.has(value.instance_id)
            || seen.has(value.instance_id)
            || typeof value.model_name_or_path !== "string"
            || value.model_name_or_path.trim() === ""
            || typeof value.model_patch !== "string") {
            throw new TypeError("Invalid SWE-bench prediction record");
        }
        seen.add(value.instance_id);
        predictions.push({
            instance_id: value.instance_id,
            model_name_or_path: value.model_name_or_path,
            model_patch: value.model_patch,
        });
    }
    return predictions;
}

async function readPatch(path: string): Promise<string | null> {
    try { return await readFile(path, "utf8"); }
    catch { return null; }
}

function validateSwebenchReportForGrade(report: SwebenchReport, outputDirectory: string): void {
    if (!isRecord(report) || report.schemaVersion !== 1
        || report.configId !== SWE_ACP_CONFIG_ID
        || report.harnessVersion !== SWEBENCH_VERSION
        || typeof report.runId !== "string" || !/^[A-Za-z0-9_.-]+$/u.test(report.runId)
        || !isRecord(report.manifest) || !Array.isArray(report.attempts)) {
        throw new TypeError("Invalid SWE-bench report for grading");
    }
    const manifest = parseSwebenchManifest(report.manifest);
    const seen = new Set<string>();
    for (const value of report.attempts) {
        if (!isRecord(value)
            || typeof value.instanceId !== "string"
            || !manifest.instanceIds.includes(value.instanceId)
            || seen.has(value.instanceId)
            || typeof value.goalId !== "string" || typeof value.runId !== "string"
            || value.attempt !== 1
            || typeof value.patchPath !== "string" && value.patchPath !== null
            || (typeof value.patchPath === "string" && !isPathInside(outputDirectory, value.patchPath))
            || typeof value.patchBytes !== "number" || !Number.isSafeInteger(value.patchBytes) || value.patchBytes < 0
            || (value.patchSha256 !== null && (typeof value.patchSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.patchSha256)))
            || !["pending", "resolved", "unresolved", "empty_patch", "grading_error", "not_submitted"].includes(String(value.gradingStatus))) {
            throw new TypeError("Invalid SWE-bench attempt for grading");
        }
        seen.add(value.instanceId);
    }
}

async function readSwebenchAttemptRecords(
    outputDirectory: string,
    report: SwebenchReport,
): Promise<Map<string, BenchmarkAttemptRecord<SwebenchAttemptDomainResult>>> {
    const records = new Map<string, BenchmarkAttemptRecord<SwebenchAttemptDomainResult>>();
    for (const attempt of report.attempts) {
        const recorder = new AttemptRecorder<SwebenchAttemptDomainResult>(attemptPath(outputDirectory, attempt.instanceId, attempt.attempt));
        const record = await recorder.read();
        if (record === undefined) continue;
        if (record.benchmarkId !== "swebench"
            || record.taskId !== attempt.instanceId
            || record.goalId !== attempt.goalId
            || record.runId !== attempt.runId
            || record.attempt !== attempt.attempt
            || !isSwebenchAttemptDomainResult(record.domainResult)
            || record.domainResult.patchSha256 !== attempt.patchSha256
            || (record.domainResult.patch === null ? 0 : Buffer.byteLength(record.domainResult.patch)) !== attempt.patchBytes
            || (record.domainResult.patch === null ? null : hash(record.domainResult.patch)) !== attempt.patchSha256) {
            throw new TypeError(`SWE-bench Attempt record does not match report: ${attempt.instanceId}`);
        }
        records.set(attempt.instanceId, record);
    }
    return records;
}

function isSwebenchAttemptDomainResult(value: unknown): value is SwebenchAttemptDomainResult {
    return isRecord(value)
        && (typeof value.patch === "string" || value.patch === null)
        && (value.patchSha256 === null || (typeof value.patchSha256 === "string" && /^[a-f0-9]{64}$/u.test(value.patchSha256)))
        && ["pending", "resolved", "unresolved", "empty_patch", "grading_error", "not_submitted"].includes(String(value.gradingStatus))
        && (value.resolved === null || typeof value.resolved === "boolean");
}

function isPathInside(rootDirectory: string, candidate: string): boolean {
    const root = resolve(rootDirectory);
    const resolved = resolveArtifactPath(root, candidate);
    const remainder = relative(root, resolved);
    return remainder === "" || (!remainder.startsWith("..") && !isAbsolute(remainder));
}

function resolveArtifactPath(rootDirectory: string, candidate: string): string {
    return isAbsolute(candidate) ? resolve(candidate) : resolve(rootDirectory, candidate);
}
