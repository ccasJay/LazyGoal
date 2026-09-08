import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContextCompactor, LLMAdapter, ModelConversationMessage, PromptBundleRenderer } from "../../../packages/agent/src/index.js";
import { createDefaultPromptBundleProtocolValidator, readNormalizedUsage } from "../../../packages/agent/src/index.js";
import { createToolRegistration, InMemoryToolRegistry, type AgentProfile } from "../../../packages/runtime/src/index.js";
import { HeadlessCompositionRoot, type BenchmarkPersistenceBindings, type HeadlessEpisodeResult, type HeadlessModelUsage } from "../../src/headless-composition-root.js";
import { JsonFileBenchmarkPersistenceAdapter } from "../../src/file-persistence-adapter.js";
import { createSwebenchShell, parseSwebenchTasks, SwebenchContainer, type SwebenchTask } from "./container.js";
import { isRecord, SWEBENCH_VERSION, type SwebenchManifest } from "./manifest.js";
import { requireSuccess, runProcess, type ProcessRunner } from "./process.js";

export const SWE_PROFILE: AgentProfile = {
    id: "swebench-profile",
    name: "SWE-bench shell baseline",
    systemPrompt: "You are a software engineer resolving the provided repository issue.",
    instructions: [
        "Use swebench_shell to inspect and modify /testbed. Run relevant tests or a reproduction before completing.",
        "Your final repository changes are exported automatically as a patch. A final text answer alone does not modify files.",
        "Do not modify .git or use reference solutions. The official grading tests are unavailable during this attempt.",
        "Always return memoryPatch as null. This benchmark starts directly in executing, where new PlanItems cannot be created.",
        "There is one attempt per issue. Complete when your fix is ready; report limitations honestly.",
    ],
    toolIds: ["swebench_shell"],
};

/**
 * 单题作答与评分的独立记录；usage 对缺失供应商数据显式计数。
 * @example
 * ```ts
 * console.log(report.attempts[0]?.gradingStatus, report.attempts[0]?.runStatus);
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
    readonly usage: HeadlessModelUsage;
    readonly imageId: string | null;
    readonly patchPath: string;
    readonly patchBytes: number;
    readonly patchSha256: string | null;
    readonly persistence: HeadlessEpisodeResult<null>["persistence"] | null;
    readonly errors: readonly { readonly stage: string; readonly message: string }[];
    gradingStatus: "pending" | "resolved" | "unresolved" | "empty_patch" | "grading_error" | "not_submitted";
    gradingLogDirectory?: string;
}

/**
 * 完整清单是成功率分母，模型声明完成不参与评分；中止保留已有题目及未运行数量。
 * @example
 * ```ts
 * console.log(report.summary.resolved, report.summary.total);
 * ```
 */
export interface SwebenchReport {
    readonly schemaVersion: 1;
    readonly runId: string;
    readonly configId: "swebench-shell-v1";
    readonly harnessVersion: string;
    readonly manifest: SwebenchManifest;
    readonly manifestSha256: string;
    readonly profile: AgentProfile;
    readonly profileSha256: string;
    readonly modelId: string;
    readonly structuredOutputMode: LLMAdapter["structuredOutputMode"];
    readonly attempts: SwebenchAttempt[];
    status: "running" | "completed" | "aborted" | "failed";
    gradingError?: string;
    summary: ReturnType<typeof summarize>;
}

/**
 * 评测接线；outputDirectory 必须是专属的新目录，外部进程可注入确定性替身。
 * @example
 * ```ts
 * const report = await runSwebenchEvaluation({ manifest, outputDirectory, workspaceRoot,
 *   python: "python3", modelId: "model", llmAdapter, renderer, contextCompactor });
 * ```
 */
export interface SwebenchEvaluationOptions {
    readonly manifest: SwebenchManifest;
    readonly outputDirectory: string;
    readonly workspaceRoot: string;
    readonly python: string;
    readonly modelId: string;
    readonly llmAdapter: LLMAdapter;
    readonly renderer: PromptBundleRenderer;
    readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    readonly signal?: AbortSignal;
    readonly runProcess?: ProcessRunner;
    readonly onProgress?: (message: string) => void;
}

export const BRIDGE_PATH = fileURLToPath(new URL("../python/bridge.py", import.meta.url));

/** 预检固定 harness 版本与 Docker daemon；不构造模型、不创建任务容器。 */
export async function preflightSwebench(python: string, run: ProcessRunner = runProcess, signal?: AbortSignal): Promise<void> {
    const response: unknown = JSON.parse(requireSuccess(await run(python, [BRIDGE_PATH, "preflight"],
        { timeoutMs: 30000, signal }), "SWE-bench preflight"));
    if (!isRecord(response) || response.harnessVersion !== SWEBENCH_VERSION) throw new Error("SWE-bench harness version mismatch");
}

/**
 * 顺序单次作答、逐题保存补丁与报告，再委托官方 harness 评分；不会依据评分重新作答。
 * @remarks
 * 每次调用分配唯一 runId，避免官方评分缓存复用旧补丁。SIGINT 中止后保存已有产物。
 * Python 数据集原始记录仅保存在宿主 outputDirectory，Agent 只能访问隔离容器。
 */
export async function runSwebenchEvaluation(options: SwebenchEvaluationOptions): Promise<SwebenchReport> {
    const run = options.runProcess ?? runProcess;
    const output = resolve(options.outputDirectory);
    await mkdir(output, { recursive: false });
    const runId = `lg-${randomUUID()}`;
    const manifestPath = join(output, "manifest.json");
    await writeFile(manifestPath, JSON.stringify(options.manifest, null, 2) + "\n");
    const report: SwebenchReport = {
        schemaVersion: 1, runId, configId: "swebench-shell-v1", harnessVersion: SWEBENCH_VERSION,
        manifest: options.manifest, manifestSha256: hash(JSON.stringify(options.manifest)),
        profile: SWE_PROFILE, profileSha256: hash(JSON.stringify(SWE_PROFILE)), modelId: options.modelId,
        structuredOutputMode: options.llmAdapter.structuredOutputMode,
        attempts: [], status: "running", summary: summarize([], options.manifest.instanceIds.length),
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
        // 官方 harness 被中止时可能没来得及执行其 finally；只回收本次唯一 runId 的评分容器。
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

async function solveTask(options: SwebenchEvaluationOptions, task: SwebenchTask, name: string, run: ProcessRunner) {
    const started = Date.now();
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(abort, options.manifest.taskTimeoutSeconds * 1000);
    const container = new SwebenchContainer(name, task, run);
    const goalId = randomUUID();
    const runId = randomUUID();
    let bindings: BenchmarkPersistenceBindings | undefined;
    let patch: string | null = null;
    const errors: { stage: string; message: string }[] = [];
    let stage = "environment";
    let result: HeadlessEpisodeResult<null> | undefined;
    const usage = { inputTokens: 0, outputTokens: 0, missingCalls: 0 };
    // Root 抛出时不会返回 model 事实，此计数器仍保留已经发生的调用用量。
    const measuredAdapter: LLMAdapter = {
        structuredOutputMode: options.llmAdapter.structuredOutputMode,
        generate: async (request, control) => {
            let recorded = false;
            try {
                const response = await options.llmAdapter.generate(request, control);
                const tokens = readNormalizedUsage(response.providerMetadata);
                if (tokens !== undefined) {
                    usage.inputTokens += tokens.inputTokens;
                    usage.outputTokens += tokens.outputTokens;
                    recorded = true;
                }
                return response;
            } finally { if (!recorded) usage.missingCalls++; }
        },
    };
    const persistence = new JsonFileBenchmarkPersistenceAdapter<SwebenchTask>({
        rootDirectory: join(options.outputDirectory, "runtime"), namespaceFor: (value) => value.instance_id, enableTrace: true,
    });
    try {
        const root = new HeadlessCompositionRoot<SwebenchTask, null>({
            benchmarkId: "swebench", workspaceRoot: options.workspaceRoot, profile: SWE_PROFILE,
            llmAdapter: measuredAdapter, renderer: options.renderer, contextCompactor: options.contextCompactor,
            protocolValidator: createDefaultPromptBundleProtocolValidator(), toolPolicy: { evaluate: () => "allow" },
            goalIdGenerator: () => goalId, runIdGenerator: () => runId,
            persistence: {
                namespaceFor: (value) => persistence.namespaceFor(value),
                open: async (context) => { bindings = await persistence.open(context); return bindings; },
            },
            adapter: {
                describeTask: () => ({ intent: task.problem_statement,
                    objective: `Resolve the issue in ${task.repo} at ${task.base_commit}:\n\n${task.problem_statement}`,
                    completionCriteria: ["Implement the issue fix in /testbed and run relevant verification."], maxSteps: options.manifest.maxSteps }),
                createEpisode: async () => {
                    await container.start(controller.signal);
                    stage = "agent";
                    return {
                        registry: new InMemoryToolRegistry([createToolRegistration(createSwebenchShell(container))]),
                        readOutcome: () => null,
                        close: async () => {
                            try { patch = await container.exportPatch(); }
                            catch (error) { errors.push({ stage: "patch_export", message: errorMessage(error) }); }
                            finally { await container.close(); }
                        },
                    };
                },
            },
        });
        result = await root.run(task, { signal: controller.signal });
        if (result.cleanupError !== undefined) errors.push({ stage: "cleanup", message: errorMessage(result.cleanupError) });
        if (!result.progress.ok) errors.push({ stage: "runtime", message: result.progress.error.code });
        if (result.runner !== null && !result.runner.ok) errors.push({ stage: "runtime", message: result.runner.error.code });
        if (result.goal.state.run.stopReason?.kind === "execution_error") {
            errors.push({ stage: "execution", message: result.goal.state.run.stopReason.code });
        }
    } catch (error) {
        errors.push({ stage: controller.signal.aborted ? (options.signal?.aborted ? "aborted" : "task_timeout") : stage,
            message: errorMessage(error) });
    } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        try { await container.close(); }
        catch (error) { errors.push({ stage: "cleanup", message: errorMessage(error) }); }
    }
    const patchPath = join(options.outputDirectory, `${task.instance_id}.patch`);
    if (patch !== null) await writeArtifact(patchPath, patch);
    let savedGoal = result?.goal;
    if (savedGoal === undefined) {
        try { savedGoal = await bindings?.goalStore.restore(goalId); }
        catch (error) { errors.push({ stage: "snapshot_read", message: errorMessage(error) }); }
    }
    const attempt: SwebenchAttempt = {
        instanceId: task.instance_id, goalId, runId, attempt: 1, durationMs: Date.now() - started,
        runStatus: savedGoal?.state.run.status ?? "not_started", stopReason: savedGoal?.state.run.stopReason ?? null,
        usage, imageId: container.imageId ?? null, patchPath, patchBytes: patch === null ? 0 : Buffer.byteLength(patch),
        patchSha256: patch === null ? null : hash(patch), persistence: bindings?.locator ?? null, errors,
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

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

async function writeArtifact(path: string, content: string): Promise<void> {
    const temporary = `${path}.tmp`;
    await writeFile(temporary, content);
    await rename(temporary, path);
}
