import { swebenchWorkerArgs } from "./worker-config.js";
import { access, mkdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import {
    runLazyGoalAcpClient,
    type AcpSessionUpdate,
} from "../../../packages/acp/src/index.js";
import type { BenchmarkPersistenceLocator } from "../../src/headless-composition-root.js";
import {
    createAcpMuxStream,
    MultiplexedConnection,
} from "./multiplex.js";
import {
    createLlmRpcServer,
    type LlmRpcServer,
} from "./llm-rpc.js";
import {
    SwebenchContainer,
    type SwebenchTask,
} from "./container.js";
import {
    runInteractiveProcess,
    type InteractiveProcess,
    type InteractiveProcessRunner,
} from "./process.js";
import type { WorkerArtifact, WorkerManifest } from "./worker-builder.js";
import type { SwebenchAcpTaskMetadata } from "./worker-runtime.js";
import { recoverSwebenchResult } from "./result-recovery.js";
import { SwebenchAcpProjectionError, readSwebenchAcpFailure, parseSwebenchAcpMeta } from "./acp-result-projection.js";

/** Supervisor 记录的可区分失败阶段。 */
export type SwebenchSupervisorFailureStage =
    | "container_start"
    | "worker_inject"
    | "worker_preflight"
    | "transport"
    | "agent"
    | "model"
    | "runtime"
    | "cancel"
    | "artifact_copy"
    | "patch_export"
    | "cleanup";

/** 单题 Supervisor 的有界失败记录。 */
export interface SwebenchSupervisorError {
    readonly stage: SwebenchSupervisorFailureStage;
    /** 已知业务错误码；未知异常不猜测。 */
    readonly code?: string;
    readonly message: string;
}

/**
 * 单题 ACP Supervisor 的装配输入。
 *
 * @remarks
 * Supervisor 拥有当前题目容器和 Worker 进程；它不重试 Prompt。`artifactGraceMs`
 * 限制状态复制和 patch 导出的总时间，超时后仍会继续删除容器。
 *
 * @example
 * ```ts
 * const options: SwebenchSupervisorOptions = {
 *     task, container, artifact, manifest, metadata,
 *     outputDirectory: ".lazygoal/run-1", llmAdapter,
 *     taskTimeoutMs: 300_000,
 * };
 * ```
 */
export interface SwebenchSupervisorOptions {
    /** 已校验的 SWE-bench 作答字段。 */
    readonly task: SwebenchTask;
    /** 当前题目的唯一 Docker 容器。 */
    readonly container: SwebenchContainer;
    /** 已构建且通过清单校验的 Worker 产物。 */
    readonly artifact: WorkerArtifact;
    /** 与注入 Worker 一致的清单。 */
    readonly manifest: WorkerManifest;
    /** 宿主预检后发送给 Worker 的 metadata。 */
    readonly metadata: SwebenchAcpTaskMetadata;
    /** 宿主供应商 Adapter；只由 LLM RPC Server 消费。 */
    readonly llmAdapter: LLMAdapter;
    /** 本题输出根；复制后的 locator 必须位于其下。 */
    readonly outputDirectory: string;
    /** 本题总执行时间上限。 */
    readonly taskTimeoutMs: number;
    /** 终止 Worker 后复制状态和 patch 的总宽限时间；默认 30 秒。 */
    readonly artifactGraceMs?: number;
    /** 外部 SIGINT/SIGTERM 或上层取消信号。 */
    readonly signal?: AbortSignal;
    /** 测试可注入 Worker 进程启动器。 */
    readonly openWorkerProcess?: InteractiveProcessRunner;
    /** 接收 ACP Tool 更新的宿主回调；回调失败会使本题失败。 */
    readonly onUpdate?: (update: AcpSessionUpdate) => void | Promise<void>;
}

/**
 * 单题 ACP Supervisor 的可审计结果。
 *
 * @remarks
 * `patch` 只有完整导出成功时才非空；`persistence` 只包含已复制并通过
 * Goal/Run 身份校验的宿主相对 locator。错误列表按首次阶段顺序保留。
 *
 * @example
 * ```ts
 * const result = await runSwebenchSupervisor(options);
 * if (result.patch !== null) console.log(result.persistence?.goalSnapshot);
 * ```
 */
export interface SwebenchSupervisorResult {
    readonly stopReason: "end_turn" | "max_turn_requests" | "cancelled" | null;
    readonly meta?: Readonly<Record<string, unknown>>;
    readonly patch: string | null;
    readonly patchPath: string | null;
    readonly persistence: BenchmarkPersistenceLocator | null;
    readonly errors: readonly SwebenchSupervisorError[];
}

/**
 * 启动、驱动、收尾并删除单题 ACP Worker。
 *
 * @remarks
 * 先执行容器启动、Worker 注入和 preflight，再创建 Mux、LLM RPC Server 和一次性
 * ACP Client。Prompt 完成、失败或取消后，Supervisor 关闭通信、在有界宽限期内分别
 * 复制 Goal/Trajectory/Trace 并导出临时 index patch，最后无条件幂等删除本题容器。
 * 后续清理失败不会覆盖先前错误，也不会构成成功结果。
 *
 * @param options - 单题 Worker、容器、模型和产物配置。
 * @returns ACP 终态、patch、宿主 locator 和分阶段错误。
 * @example
 * ```ts
 * const result = await runSwebenchSupervisor(options);
 * console.log(result.stopReason, result.errors);
 * ```
 */
export async function runSwebenchSupervisor(
    options: SwebenchSupervisorOptions,
): Promise<SwebenchSupervisorResult> {
    validateOptions(options);
    const outputDirectory = resolve(options.outputDirectory);
    await mkdir(outputDirectory, { recursive: true });
    const errors: SwebenchSupervisorError[] = [];
    let stopReason: SwebenchSupervisorResult["stopReason"] = null;
    let meta: Readonly<Record<string, unknown>> | undefined;
    let patch: string | null = null;
    let patchPath: string | null = null;
    let persistence: BenchmarkPersistenceLocator | null = null;
    let worker: InteractiveProcess | undefined;
    let mux: MultiplexedConnection | undefined;
    let rpc: LlmRpcServer | undefined;
    let modelFailed = false;
    let providerStatus: number | undefined;
    let setupFailed = false;
    let workerAttempted = false;
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    options.signal?.addEventListener("abort", forwardAbort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timeout = setTimeout(() => controller.abort(), options.taskTimeoutMs);
    try {
        if (controller.signal.aborted) {
            record(errors, "cancel", new Error("SWE-bench task was cancelled before container startup"));
            setupFailed = true;
        } else {
            try {
                await options.container.start(controller.signal);
            } catch (error) {
                record(errors, controller.signal.aborted ? "cancel" : "container_start", error);
                setupFailed = true;
            }
        }
        if (!setupFailed) {
            try {
                await options.container.injectWorker(options.artifact, controller.signal);
            } catch (error) {
                record(errors, controller.signal.aborted ? "cancel" : "worker_inject", error);
                setupFailed = true;
            }
        }
        if (!setupFailed) {
            try {
                await options.container.preflightWorker(options.manifest, controller.signal);
            } catch (error) {
                record(errors, controller.signal.aborted ? "cancel" : "worker_preflight", error);
                setupFailed = true;
            }
        }
        if (!setupFailed && controller.signal.aborted) {
            record(errors, "cancel", new Error("SWE-bench task was cancelled before Worker startup"));
            setupFailed = true;
        }

        if (!setupFailed) try {
            const open = options.openWorkerProcess ?? runInteractiveProcess;
            workerAttempted = true;
            worker = await openWorker(open, options.container, options.taskTimeoutMs, controller.signal);
            void worker.closed.catch(() => undefined);
            void drain(worker.errorOutput);
            mux = new MultiplexedConnection({ input: worker.output, output: worker.input });
            const hostAdapter: LLMAdapter = {
                structuredOutputMode: options.llmAdapter.structuredOutputMode,
                generate: async (request, control) => {
                    try {
                        return await options.llmAdapter.generate(request, control);
                    } catch (error) {
                        modelFailed = true;
                        if (typeof error === "object" && error !== null && "status" in error
                            && typeof error.status === "number" && Number.isInteger(error.status) && error.status >= 100 && error.status <= 599) {
                            providerStatus = error.status;
                        }
                        throw error;
                    }
                },
            };
            rpc = createLlmRpcServer({ stream: mux.channel("llm"), adapter: hostAdapter });
            const clientInput = {
                stream: createAcpMuxStream(mux),
                cwd: "/testbed",
                prompt: [{ type: "text" as const, text: options.task.problem_statement }],
                sessionMeta: {
                    instanceId: options.metadata.instanceId,
                    repo: options.metadata.repo,
                    baseCommit: options.metadata.baseCommit,
                    problemStatement: options.metadata.problemStatement,
                    goalId: options.metadata.goalId,
                    runId: options.metadata.runId,
                    maxSteps: options.metadata.maxSteps,
                    structuredOutputMode: options.metadata.structuredOutputMode,
                },
                signal: controller.signal,
                ...(options.onUpdate === undefined ? {} : { onUpdate: options.onUpdate }),
            };
            const response = await runLazyGoalAcpClient(clientInput);
            try { meta = parseSwebenchAcpMeta(response.meta, options.metadata); }
            catch { throw new SwebenchAcpProjectionError("protocol", "INVALID_RESULT_META", "Invalid Worker result metadata"); }
            if (response.stopReason === "end_turn" || response.stopReason === "max_turn_requests" || response.stopReason === "cancelled") {
                stopReason = response.stopReason;
            } else {
                record(errors, "agent", new Error(`Unsupported ACP stop reason: ${response.stopReason}`));
            }
        } catch (error) {
            let failure: SwebenchAcpProjectionError | undefined;
            try { failure = readSwebenchAcpFailure(error, options.metadata); }
            catch { failure = new SwebenchAcpProjectionError("protocol", "INVALID_ERROR_DATA", "Invalid Worker error data"); }
            if (failure?.meta !== undefined) meta = failure.meta;
            if (controller.signal.aborted || options.signal?.aborted) {
                record(errors, "cancel", new Error("SWE-bench task was cancelled"));
            } else if (modelFailed) {
                errors.push({ stage: "model", code: "MODEL_PROVIDER_ERROR", message: `Model provider request failed${providerStatus === undefined ? "" : ` (HTTP ${providerStatus})`}` });
            } else if (failure !== undefined) {
                record(errors, projectionFailureStage(failure), failure);
            } else if (error instanceof SwebenchAcpProjectionError) {
                record(errors, projectionFailureStage(error), error);
            } else if (mux?.failure !== undefined) {
                record(errors, "transport", mux.failure);
            } else if (worker === undefined) {
                record(errors, "transport", error);
            } else {
                record(errors, "agent", error);
            }
        }
    } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", forwardAbort);
        if (rpc !== undefined) {
            try { await rpc.close(); }
            catch (error) { record(errors, "transport", error); }
        }
        if (mux !== undefined) {
            try { await mux.close(); }
            catch (error) { record(errors, "transport", error); }
        }
        if (worker !== undefined) {
            try { worker.kill(); }
            catch (error) { record(errors, "transport", error); }
            await settleWorker(worker, options.artifactGraceMs ?? 30_000, errors);
        }

        try {
            const artifactResult = await collectArtifacts(options, outputDirectory, errors, meta === undefined || meta.usage === undefined);
            persistence = artifactResult.persistence;
            if (artifactResult.meta !== undefined) meta = { ...artifactResult.meta, ...meta };
            patch = artifactResult.patch;
            if (patch !== null) {
                patchPath = `${outputDirectory}/${options.task.instance_id}.patch`;
                try {
                    await writeFile(patchPath, patch, "utf8");
                } catch (error) {
                    record(errors, "patch_export", error);
                    patch = null;
                    patchPath = null;
                }
            }
        } catch (error) {
            record(errors, "artifact_copy", error);
        } finally {
            try { await options.container.close(); }
            catch (error) { record(errors, "cleanup", error); }
        }
    }
    meta ??= { runStatus: workerAttempted ? "unknown" : "not_started",
        ...(!workerAttempted ? { usage: { inputTokens: 0, outputTokens: 0, missingCalls: 0 } } : {}) };
    return { stopReason, meta, patch, patchPath, persistence, errors };
}

async function openWorker(
    open: InteractiveProcessRunner,
    container: SwebenchContainer,
    timeoutMs: number,
    signal: AbortSignal,
): Promise<InteractiveProcess> {
    if (open === runInteractiveProcess) return container.openWorkerProcess(timeoutMs, signal);
    return open("docker", swebenchWorkerArgs(container.name), {
        timeoutMs,
        signal,
        maxBytes: 16 * 1024 * 1024,
    });
}

async function collectArtifacts(
    options: SwebenchSupervisorOptions,
    outputDirectory: string,
    errors: SwebenchSupervisorError[],
    recover: boolean,
): Promise<{ readonly persistence: BenchmarkPersistenceLocator | null; readonly patch: string | null; readonly meta?: Readonly<Record<string, unknown>> }> {
    const graceMs = options.artifactGraceMs ?? 30_000;
    const graceController = new AbortController();
    const deadline = setTimeout(() => graceController.abort(), graceMs);
    const copied: Partial<Record<"goals" | "trajectories" | "traces", string>> = {};
    const copy = async (kind: "goals" | "trajectories" | "traces") => {
        try {
            const path = await withinGrace(() => options.container.copyWorkerArtifact(options.metadata.instanceId, outputDirectory, kind, graceController.signal), graceController.signal);
            await access(path);
            copied[kind] = path;
        } catch (error) {
            record(errors, "artifact_copy", error);
        }
    };
    await copy("goals");
    await copy("trajectories");
    await copy("traces");
    let patch: string | null = null;
    try {
        patch = await withinGrace(() => options.container.exportPatch(graceController.signal), graceController.signal);
    } catch (error) {
        record(errors, "patch_export", error);
    }
    let recovered: Readonly<Record<string, unknown>> | undefined;
    try {
        if (recover) recovered = await withinGrace(() => recoverSwebenchResult(copied, options.metadata,
            (message) => record(errors, "artifact_copy", new Error(message)), graceController.signal), graceController.signal);
    } catch (error) { record(errors, "artifact_copy", error); }
    clearTimeout(deadline);
    const recoveredMeta = recovered === undefined ? {} : { meta: recovered };
    if (copied.goals === undefined || !await validateGoalLocator(copied.goals, options.metadata.goalId, options.metadata.runId)) {
        if (copied.goals !== undefined) record(errors, "artifact_copy", new Error("Copied Goal snapshot identity mismatch"));
        return { persistence: null, patch, ...recoveredMeta };
    }
    const persistence: BenchmarkPersistenceLocator = {
        goalSnapshot: relative(outputDirectory, copied.goals),
        trajectory: copied.trajectories === undefined ? relative(outputDirectory, copied.goals) : relative(outputDirectory, copied.trajectories),
        ...(copied.traces === undefined ? {} : { diagnosticTrace: relative(outputDirectory, copied.traces) }),
    };
    return { persistence, patch, ...recoveredMeta };
}

async function withinGrace<T>(factory: () => Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) throw new Error("Artifact grace period exceeded");
    const operation = factory();
    let listener: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
        listener = () => reject(new Error("Artifact grace period exceeded"));
        signal.addEventListener("abort", listener, { once: true });
    });
    try {
        return await Promise.race([operation, aborted]);
    } finally {
        if (listener !== undefined) signal.removeEventListener("abort", listener);
    }
}

async function settleWorker(
    worker: InteractiveProcess,
    timeoutMs: number,
    errors: SwebenchSupervisorError[],
): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Worker did not exit within cleanup grace period")), timeoutMs);
    });
    try {
        await Promise.race([worker.closed, deadline]);
    } catch (error) {
        record(errors, "transport", error);
    } finally {
        if (timeout !== undefined) clearTimeout(timeout);
    }
}

async function validateGoalLocator(path: string, goalId: string, runId: string): Promise<boolean> {
    const file = `${path}/${Buffer.from(goalId, "utf8").toString("base64url")}.json`;
    try {
        const content = await import("node:fs/promises").then((fs) => fs.readFile(file, "utf8"));
        const value = JSON.parse(content) as { id?: unknown; state?: { run?: { id?: unknown } } };
        return value.id === goalId && value.state?.run?.id === runId;
    } catch {
        return false;
    }
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    try {
        while (!(await reader.read()).done) { /* drain Worker diagnostics */ }
    } catch {
        // The process boundary owns diagnostic failures after the Worker exits.
    } finally {
        reader.releaseLock();
    }
}

function validateOptions(options: SwebenchSupervisorOptions): void {
    if (!Number.isSafeInteger(options.taskTimeoutMs) || options.taskTimeoutMs <= 0) throw new RangeError("taskTimeoutMs must be positive");
    if (options.artifactGraceMs !== undefined && (!Number.isSafeInteger(options.artifactGraceMs) || options.artifactGraceMs <= 0)) throw new RangeError("artifactGraceMs must be positive");
    if (options.llmAdapter.structuredOutputMode !== options.metadata.structuredOutputMode) throw new TypeError("LLM structured-output mode does not match Worker metadata");
    if (options.task.instance_id !== options.metadata.instanceId
        || options.task.repo !== options.metadata.repo
        || options.task.base_commit !== options.metadata.baseCommit
        || options.task.problem_statement !== options.metadata.problemStatement) {
        throw new TypeError("SWE-bench task does not match Worker metadata");
    }
    if (options.artifact.manifest.workerSha256 !== options.manifest.workerSha256
        || options.artifact.manifest.nodeSha256 !== options.manifest.nodeSha256
        || options.artifact.manifest.nodeImageId !== options.manifest.nodeImageId) {
        throw new TypeError("Worker artifact manifest does not match preflight manifest");
    }
}

function projectionFailureStage(error: SwebenchAcpProjectionError): SwebenchSupervisorFailureStage {
    if (error.stage === "protocol") return "transport";
    if (error.stage === "provider") return "model";
    if (error.stage === "cleanup") return "cleanup";
    return "runtime";
}

function record(errors: SwebenchSupervisorError[], stage: SwebenchSupervisorFailureStage, error: unknown): void {
    errors.push({ stage, message: boundMessage(error),
        ...(error instanceof SwebenchAcpProjectionError ? { code: error.code } : {}) });
}

function boundMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.length <= 1024 ? message : `${message.slice(0, 1024)}…`;
}
