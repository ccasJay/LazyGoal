import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type {
    AcpClientResult,
    AcpContentBlock,
    AcpSessionUpdate,
} from "../../packages/acp/src/index.js";
import { runLazyGoalAcpClient } from "../../packages/acp/src/index.js";
import type { LLMAdapter } from "../../packages/agent/src/index.js";
import {
    createAcpMuxStream,
    MultiplexedConnection,
} from "./multiplex.js";
import {
    createLlmRpcServer,
    type LlmRpcServer,
} from "./llm-rpc.js";
import {
    requireSuccess,
    runInteractiveProcess,
    runProcess,
    type InteractiveProcess,
    type InteractiveProcessRunner,
    type ProcessOptions,
    type ProcessResult,
    type ProcessRunner,
} from "./process.js";
import type { WorkerArtifact } from "./worker-builder.js";

const HOST_PROXY_ENVIRONMENT_VARIABLES = Object.freeze([
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
] as const);

interface ContainerProxyEnvironment {
    readonly names: readonly string[];
    readonly processEnvironment: NodeJS.ProcessEnv;
}

/** LazyGoal 管理的统一隔离镜像来源。 */
export type ImageSource =
    | {
        readonly mode: "custom";
        readonly image: string;
        readonly platform?: string;
    }
    | {
        readonly mode: "managed";
        readonly baseImage?: string;
        readonly platform?: string;
        readonly installCommands: readonly string[];
    };

/**
 * Worker 在隔离环境中的启动配置。
 *
 * @example
 * ```ts
 * const entry: WorkerEntryConfig = {
 *   artifact,
 *   cwd: "/workspace",
 *   command: ["/opt/lazygoal/node", "/opt/lazygoal/worker.mjs"],
 * };
 * ```
 */
export interface WorkerEntryConfig {
    /** 由共享 WorkerBuilder 生成的完整 Worker 产物；省略时不注入 Worker。 */
    readonly artifact?: WorkerArtifact;
    /** Worker 的容器工作目录；默认 `/opt/lazygoal`。 */
    readonly cwd?: string;
    /** `docker exec` 后的命令参数；默认执行注入的 Node/Worker 文件。 */
    readonly command?: readonly string[];
}

/**
 * 领域预检返回的稳定事实。
 *
 * @example
 * ```ts
 * const result: PreflightResult = { ok: true, details: { python: "3.11" } };
 * ```
 */
export interface PreflightResult {
    /** 预检是否允许进入 ACP 作答阶段。 */
    readonly ok: boolean;
    /** 可供报告使用的有界诊断事实。 */
    readonly details?: Readonly<Record<string, unknown>>;
    /** `ok=false` 时的安全原因。 */
    readonly message?: string;
}

/**
 * EnvironmentSpec 可使用的受限容器操作；不暴露 Docker API、容器名或安全参数。
 *
 * @remarks
 * 所有命令都在 Spec 声明的工作目录中运行，文件复制由隔离环境执行。该句柄只在
 * `prepareEnvironment`、`preflight` 和 `collectArtifacts` 回调期间有效。
 *
 * @example
 * ```ts
 * const spec: EnvironmentSpec<Task, string> = {
 *   benchmarkId: "example",
 *   resolveImage: () => ({ mode: "custom", image: "example:latest" }),
 *   getWorkerEntryConfig: () => ({}),
 *   resolveNetworkMode: () => "bridge",
 *   inheritHostProxyEnvironment: () => true,
 *   async prepareEnvironment(env) { await env.exec("mkdir -p data"); },
 *   async preflight() { return { ok: true }; },
 *   async collectArtifacts(_env, output) { return output; },
 * };
 * ```
 */
export interface EnvironmentHandle {
    /** Spec 声明的容器工作目录。 */
    readonly workdir: string;
    /**
     * 在容器中执行一条领域准备或预检命令。
     *
     * @param command - 由 Spec 固定声明的 shell 命令。
     * @param options - 超时、取消和输出边界；未提供时使用安全默认值。
     * @returns 有界进程结果；非零退出码由调用方解释。
     */
    exec(command: string, options?: Partial<ProcessOptions>): Promise<ProcessResult>;
    /** 将宿主准备文件复制到容器内的绝对路径。 */
    copyInto(source: string, target: string): Promise<void>;
    /** 将容器内的领域产物复制到宿主目标路径，并返回该路径。 */
    copyOut(source: string, target: string): Promise<string>;
}

/**
 * Benchmark 对统一隔离环境的声明式适配。
 *
 * @remarks
 * Spec 负责领域镜像需求、环境准备、预检和产物解释；生命周期、安全约束、ACP
 * 通信和容器销毁始终由 `IsolatedEnvironment` 拥有。方法不应直接调用 Docker。
 *
 * @example
 * ```ts
 * const spec: EnvironmentSpec<MyTask, MyArtifact> = makeMyEnvironmentSpec();
 * const image = spec.resolveImage(task);
 * ```
 */
export interface EnvironmentSpec<TTask, TArtifact> {
    /** 用于命名空间和报告身份的稳定 benchmark ID。 */
    readonly benchmarkId: string;
    /** 根据任务选择自带镜像或托管基础镜像。 */
    resolveImage(task: TTask): ImageSource;
    /** 提供共享 Worker 产物及其容器启动参数。 */
    getWorkerEntryConfig(task: TTask): WorkerEntryConfig;
    /**
     * 解析任务所需的容器网络隔离模式。
     *
     * @remarks
     * 默认返回 "none"，容器在完全网络隔离下运行；特定 Benchmark（如 TUA-Bench 的 live-web 任务）
     * 可返回 "bridge" 以允许访问外部网络。未实现此方法的 Spec 保持 "none" 默认值。
     *
     * @param task - 待执行的任务。
     * @returns "none" 或 "bridge"。
     */
    resolveNetworkMode?(task: TTask): "none" | "bridge";
    /**
     * 是否把宿主的标准代理环境变量注入当前任务容器。
     *
     * @remarks
     * 默认不继承。启用时只传递 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、
     * `NO_PROXY` 及其小写形式，并要求网络模式为 `bridge`；其他宿主变量不会进入
     * 容器。回环代理主机会规范化为 `host.docker.internal`。
     *
     * @param task - 待执行的任务。
     * @returns 当前任务是否显式继承宿主代理。
     */
    inheritHostProxyEnvironment?(task: TTask): boolean;
    /** 在 ACP 作答前准备领域依赖、数据和工作区。 */
    prepareEnvironment(env: EnvironmentHandle): Promise<void>;
    /** 在模型调用前验证领域运行时可用性。 */
    preflight(env: EnvironmentHandle): Promise<PreflightResult>;
    /** 在 Worker 结束后回收领域产物；只接收受限句柄。 */
    collectArtifacts(env: EnvironmentHandle, outputDirectory: string, graceMs: number): Promise<TArtifact>;
}

/** 隔离环境阶段错误的稳定分类。 */
export type IsolatedEnvironmentFailureStage =
    | "container_start"
    | "worker_inject"
    | "environment_prepare"
    | "preflight"
    | "transport"
    | "agent"
    | "cancel"
    | "artifact_collect"
    | "cleanup";

/**
 * 隔离环境记录的有界错误。
 *
 * @example
 * ```ts
 * const error: IsolatedEnvironmentError = {
 *   stage: "preflight", message: "Python is unavailable",
 * };
 * ```
 */
export interface IsolatedEnvironmentError {
    readonly stage: IsolatedEnvironmentFailureStage;
    readonly code?: string;
    readonly message: string;
}

/**
 * ACP 双通道作答所需的宿主模型配置。
 *
 * @example
 * ```ts
 * const acp: IsolatedEnvironmentAcpOptions = {
 *   llmAdapter,
 *   prompt: [{ type: "text", text: "完成任务" }],
 * };
 * ```
 */
export interface IsolatedEnvironmentAcpOptions {
    /** 宿主侧供应商适配器；Worker 只通过 LLM RPC 访问它。 */
    readonly llmAdapter: LLMAdapter;
    /** ACP Session 使用的绝对容器工作目录；省略时使用 Spec 工作目录。 */
    readonly cwd?: string;
    /** 发送给 Worker ACP Session 的一次性 Prompt。 */
    readonly prompt: readonly AcpContentBlock[];
    /** 附加到 `session/new` 的非敏感领域 metadata。 */
    readonly sessionMeta?: Readonly<Record<string, unknown>>;
    /** 接收 Worker Tool 更新；回调失败会终止当前作答。 */
    readonly onUpdate?: (update: AcpSessionUpdate) => void | Promise<void>;
}

/**
 * 一次隔离 Attempt 的执行输入。
 *
 * @example
 * ```ts
 * const input: IsolatedEnvironmentRunOptions<Task, Artifact> = {
 *   task, spec, outputDirectory: "/tmp/lazygoal-run",
 * };
 * ```
 */
export interface IsolatedEnvironmentRunOptions<TTask, TArtifact> {
    /** 当前 benchmark 的领域任务。 */
    readonly task: TTask;
    /** 当前任务的声明式环境适配。 */
    readonly spec: EnvironmentSpec<TTask, TArtifact>;
    /** 宿主产物输出根；隔离环境只向其回收领域文件。 */
    readonly outputDirectory: string;
    /** 共享 Worker 产物；未提供时使用 Spec 配置或不注入 Worker。 */
    readonly workerArtifact?: WorkerArtifact;
    /** 作答、环境准备和清理前的总任务时间上限。 */
    readonly taskTimeoutMs?: number;
    /** Worker 退出后领域产物的有界回收时间。 */
    readonly artifactGraceMs?: number;
    /** 外部取消信号。 */
    readonly signal?: AbortSignal;
    /**
     * TUI 模式下超过正常关闭宽限期后触发的强制清理信号。
     *
     * @remarks
     * 未传入时保持原有无头行为不变；传入并触发时，立即停止产物回收、终止 Worker，
     * 并以最多 5 秒尝试强制删除容器。
     */
    readonly forceSignal?: AbortSignal;
    /** 提供 ACP 时由共享层建立 Mux、LLM RPC 和一次性 Client。 */
    readonly acp?: IsolatedEnvironmentAcpOptions;
    /** 无需标准 ACP Client 的确定性测试或自定义 Agent 回调。 */
    readonly runAgent?: (context: IsolatedEnvironmentAgentContext) => Promise<void>;
    /** 测试可注入的交互式 Worker 启动器。 */
    readonly openWorkerProcess?: InteractiveProcessRunner;
    /** 已由 benchmark 适配的容器驱动；省略时使用共享 Docker 实现。 */
    readonly container?: IsolatedContainer;
}

/**
 * 自定义 Agent 回调收到的隔离通信上下文。
 *
 * @example
 * ```ts
 * const runAgent = async ({ worker, signal }: IsolatedEnvironmentAgentContext) => {
 *   await worker.closed;
 *   if (signal.aborted) return;
 * };
 * ```
 */
export interface IsolatedEnvironmentAgentContext {
    readonly environment: EnvironmentHandle;
    readonly worker: InteractiveProcess;
    readonly mux: MultiplexedConnection;
    readonly signal: AbortSignal;
}

/**
 * 已由共享层创建的容器驱动适配；用于 benchmark 保留领域启动和导出细节时接入。
 *
 * @remarks
 * 该接口只暴露生命周期、Worker 注入、受限句柄和 Worker 启动，不暴露 Docker 命令、
 * 容器名或安全参数。默认情况下 `IsolatedEnvironment` 自己实现这些操作。
 *
 * @example
 * ```ts
 * const container: IsolatedContainer = {
 *   async start() {},
 *   async injectWorker() {},
 *   createHandle: () => handle,
 *   async openWorkerProcess() { return worker; },
 *   async close() {},
 * };
 * ```
 */
export interface IsolatedContainer {
    /** 已解析的镜像内容 ID；容器尚未启动时可省略。 */
    readonly imageId?: string;
    /**
     * 创建并启动底层容器。
     * @param signal - 当前 Attempt 的取消信号。
     */
    start(signal?: AbortSignal): Promise<void>;
    /**
     * 将共享 Worker 产物注入容器。
     * @param artifact - 已构建的 Worker；无 Worker 时传 `undefined`。
     * @param signal - 当前 Attempt 的取消信号。
     */
    injectWorker(artifact: WorkerArtifact | undefined, signal?: AbortSignal): Promise<void>;
    /**
     * 创建不暴露容器身份的领域句柄。
     * @param workdir - 领域命令使用的容器工作目录。
     * @param signal - 当前 Attempt 的取消信号。
     * @returns 受限的容器操作句柄。
     */
    createHandle(workdir: string, signal: AbortSignal): EnvironmentHandle;
    /**
     * 启动可接入共享 Mux 的 Worker。
     * @param timeoutMs - Worker 启动与交互的宿主时间上限。
     * @param signal - 当前 Attempt 的取消信号。
     * @returns 交互式 Worker 句柄。
     */
    openWorkerProcess(timeoutMs: number, signal?: AbortSignal): Promise<InteractiveProcess>;
    /** 删除当前容器；重复调用必须幂等。 */
    close(): Promise<void>;
}

/**
 * 一次隔离 Attempt 的结果。
 *
 * @example
 * ```ts
 * const result = await environment.run(options);
 * if (result.status === "completed") console.log(result.artifact);
 * ```
 */
export interface IsolatedEnvironmentResult<TArtifact> {
    readonly status: "completed" | "failed" | "cancelled" | "infrastructure_error";
    readonly artifact: TArtifact | null;
    readonly imageId: string | null;
    readonly acp: AcpClientResult | null;
    readonly errors: readonly IsolatedEnvironmentError[];
}

/** 共享托管镜像的默认基础镜像；只含固定 Node 运行时。 */
export const DEFAULT_MANAGED_IMAGE = "node:22.22.2-bookworm-slim@sha256:868499d55378719bffa87b0ed1f099591823c029b543043c09c2483468e93201" as const;

/**
 * LazyGoal 拥有的 Docker 隔离执行环境。
 *
 * @remarks
 * 每次 `run` 生成独立容器，固定使用 linux/amd64、无宿主挂载、去除全部 capabilities
 * 和 `no-new-privileges`。网络默认关闭；Spec 可显式启用 bridge，并单独选择是否继承
 * 受限的宿主代理变量。Spec 只能通过 `EnvironmentHandle` 处理领域准备与产物，容器
 * 始终在有界回收后删除。
 *
 * @example
 * ```ts
 * const environment = new IsolatedEnvironment();
 * const result = await environment.run({ task, spec, outputDirectory: "~/.lazygoal/workspaces/<workspace-id>/benchmarks/<name>/runs/<run-id>" });
 * ```
 */
export class IsolatedEnvironment {
    private readonly runProcess: ProcessRunner;
    private readonly runInteractive: InteractiveProcessRunner;
    private readonly hostEnvironment: NodeJS.ProcessEnv;

    /**
     * @param options - 可替换的进程边界和安全默认值；测试可注入伪 Docker。
     */
    constructor(options: IsolatedEnvironmentOptions = {}) {
        this.runProcess = options.run ?? runProcess;
        this.runInteractive = options.interactiveRun ?? runInteractiveProcess;
        this.hostEnvironment = options.hostEnvironment ?? process.env;
    }

    /**
     * 执行一次领域 Spec 的完整隔离生命周期。
     *
     * @param options - 任务、Spec、Worker、ACP 和回收配置。
     * @returns 终态、领域产物、ACP 结果及分阶段错误；错误不会绕过容器清理。
     * @throws 参数不满足当前隔离协议时抛出；运行期失败进入返回值的 `errors`。
     */
    async run<TTask, TArtifact>(
        options: IsolatedEnvironmentRunOptions<TTask, TArtifact>,
    ): Promise<IsolatedEnvironmentResult<TArtifact>> {
        validateRunOptions(options);
        const outputDirectory = resolve(options.outputDirectory);
        await mkdir(outputDirectory, { recursive: true });
        const image = options.spec.resolveImage(options.task);
        const platform = image.platform ?? "linux/amd64";
        validateImageSource(image, platform);
        const imageRef = image.mode === "custom" ? image.image : image.baseImage ?? DEFAULT_MANAGED_IMAGE;
        const containerName = makeContainerName(options.spec.benchmarkId);
        const configuredWorker = options.spec.getWorkerEntryConfig(options.task);
        const workerConfig = configuredWorker.artifact === undefined && options.workerArtifact !== undefined
            ? { ...configuredWorker, artifact: options.workerArtifact }
            : configuredWorker;
        const workdir = workerConfig.cwd ?? "/workspace";
        const errors: IsolatedEnvironmentError[] = [];
        const controller = new AbortController();
        const forwardAbort = () => controller.abort();
        options.signal?.addEventListener("abort", forwardAbort, { once: true });
        options.forceSignal?.addEventListener("abort", forwardAbort, { once: true });
        if (options.signal?.aborted || options.forceSignal?.aborted) controller.abort();
        const timeout = setTimeout(() => controller.abort(), options.taskTimeoutMs ?? 300_000);
        let imageId: string | null = options.container?.imageId ?? null;
        let created = false;
        let worker: InteractiveProcess | undefined;
        let mux: MultiplexedConnection | undefined;
        let rpc: LlmRpcServer | undefined;
        let artifact: TArtifact | null = null;
        let acp: AcpClientResult | null = null;
        let status: IsolatedEnvironmentResult<TArtifact>["status"] = "failed";
        const handle = options.container?.createHandle(workdir, controller.signal)
            ?? this.createHandle(containerName, workdir, controller.signal);
        try {
            if (controller.signal.aborted) {
                pushError(errors, "cancel", "Attempt cancelled before container startup");
            } else {
                try {
                    if (options.container !== undefined) {
                        await options.container.start(controller.signal);
                    } else {
                        await this.prepareImage(image, imageRef, platform, controller.signal, (value) => { imageId = value; });
                        const networkMode = options.spec.resolveNetworkMode?.(options.task) ?? "none";
                        const proxyEnvironment = options.spec.inheritHostProxyEnvironment?.(options.task) === true
                            ? resolveContainerProxyEnvironment(this.hostEnvironment)
                            : undefined;
                        if (proxyEnvironment !== undefined
                            && proxyEnvironment.names.length > 0
                            && networkMode !== "bridge") {
                            throw new Error("Host proxy inheritance requires bridge container networking");
                        }
                        await this.createAndStart(
                            containerName,
                            imageId!,
                            platform,
                            workdir,
                            networkMode,
                            proxyEnvironment,
                            controller.signal,
                        );
                    }
                    if (options.container?.imageId !== undefined) imageId = options.container.imageId;
                    created = true;
                } catch (error) {
                    if (options.container !== undefined) {
                        try { await options.container.close(); }
                        catch (cleanupError) { pushError(errors, "cleanup", cleanupError); }
                    }
                    pushError(errors, controller.signal.aborted ? "cancel" : "container_start", error);
                }
            }

            if (created && !controller.signal.aborted) {
                try {
                    if (options.container !== undefined) {
                        await options.container.injectWorker(workerConfig.artifact, controller.signal);
                    } else {
                        await this.injectWorker(containerName, workerConfig, controller.signal);
                    }
                } catch (error) {
                    pushError(errors, controller.signal.aborted ? "cancel" : "worker_inject", error);
                }
            }

            if (created && errors.length === 0 && !controller.signal.aborted) {
                try {
                    if (image.mode === "managed" && options.container !== undefined) {
                        for (const command of image.installCommands) {
                            requireSuccess(await handle.exec(command, { timeoutMs: 1_200_000, signal: controller.signal }), "Managed environment install");
                        }
                    }
                    await options.spec.prepareEnvironment(handle);
                } catch (error) {
                    pushError(errors, controller.signal.aborted ? "cancel" : "environment_prepare", error);
                }
            }

            if (created && errors.length === 0 && !controller.signal.aborted) {
                try {
                    const preflight = await options.spec.preflight(handle);
                    if (!preflight.ok) {
                        const message = preflight.message ?? "Environment preflight failed";
                        const error = new Error(message);
                        if (preflight.details !== undefined) Object.assign(error, { details: preflight.details });
                        throw error;
                    }
                } catch (error) {
                    pushError(errors, controller.signal.aborted ? "cancel" : "preflight", error);
                }
            }

            if (created && errors.length === 0 && !controller.signal.aborted
                && (options.acp !== undefined || options.runAgent !== undefined)) {
                try {
                    worker = options.container !== undefined && options.openWorkerProcess === undefined
                        ? await options.container.openWorkerProcess(options.taskTimeoutMs ?? 300_000, controller.signal)
                        : await this.openWorker(containerName, workerConfig, options.openWorkerProcess, options.taskTimeoutMs ?? 300_000, controller.signal);
                    void drainDiagnostics(worker.errorOutput);
                    void worker.closed.catch(() => undefined);
                    if (options.acp !== undefined) {
                        mux = new MultiplexedConnection({ input: worker.output, output: worker.input });
                        rpc = createLlmRpcServer({
                            stream: mux.channel("llm"),
                            adapter: options.acp.llmAdapter,
                        });
                        acp = await runLazyGoalAcpClient({
                            stream: createAcpMuxStream(mux),
                            cwd: options.acp.cwd ?? workdir,
                            prompt: options.acp.prompt,
                            ...(options.acp.sessionMeta === undefined ? {} : { sessionMeta: options.acp.sessionMeta }),
                            signal: controller.signal,
                            ...(options.acp.onUpdate === undefined ? {} : { onUpdate: options.acp.onUpdate }),
                        });
                    } else {
                        mux = new MultiplexedConnection({ input: worker.output, output: worker.input });
                        await options.runAgent!({ environment: handle, worker, mux, signal: controller.signal });
                    }
                    status = controller.signal.aborted || acp?.stopReason === "cancelled" ? "cancelled" : "completed";
                } catch (error) {
                    pushError(errors, controller.signal.aborted ? "cancel" : "agent", error);
                    status = controller.signal.aborted ? "cancelled" : "failed";
                }
            } else if (created && errors.length === 0) {
                status = controller.signal.aborted ? "cancelled" : "completed";
            } else if (controller.signal.aborted) {
                status = "cancelled";
            }
        } finally {
            clearTimeout(timeout);
            options.signal?.removeEventListener("abort", forwardAbort);
            options.forceSignal?.removeEventListener("abort", forwardAbort);
            const cleanupStart = Date.now();
            const totalGraceMs = options.artifactGraceMs ?? 30_000;
            const hasForceSignal = options.forceSignal !== undefined;

            if (rpc !== undefined) await rpc.close().catch((error) => pushError(errors, "transport", error));
            if (mux !== undefined) await mux.close().catch((error) => pushError(errors, "transport", error));
            if (worker !== undefined) {
                try { worker.kill(); } catch (error) { pushError(errors, "transport", error); }
                const workerTimeoutMs = hasForceSignal
                    ? Math.max(0, totalGraceMs - (Date.now() - cleanupStart))
                    : totalGraceMs;
                await settleWorker(worker, workerTimeoutMs, errors, options.forceSignal);
            }
            if (created) {
                const remainingForArtifacts = hasForceSignal
                    ? Math.max(0, totalGraceMs - (Date.now() - cleanupStart))
                    : totalGraceMs;
                const isForceAborted = options.forceSignal?.aborted || (hasForceSignal && remainingForArtifacts <= 0);

                if (!isForceAborted) {
                    const artifactController = new AbortController();
                    const forwardForce = () => artifactController.abort();
                    if (options.forceSignal !== undefined) {
                        options.forceSignal.addEventListener("abort", forwardForce, { once: true });
                    }
                    const artifactTimeout = setTimeout(() => artifactController.abort(), remainingForArtifacts);
                    try {
                        artifact = await withinGrace(
                            () => options.spec.collectArtifacts(
                                options.container?.createHandle(workdir, artifactController.signal)
                                    ?? this.createHandle(containerName, workdir, artifactController.signal),
                                outputDirectory,
                                remainingForArtifacts,
                            ),
                            remainingForArtifacts,
                            options.forceSignal,
                        );
                    } catch (error) {
                        pushError(errors, "artifact_collect", error);
                    } finally {
                        clearTimeout(artifactTimeout);
                        if (options.forceSignal !== undefined) {
                            options.forceSignal.removeEventListener("abort", forwardForce);
                        }
                    }
                } else {
                    pushError(errors, "artifact_collect", "Artifact collection skipped due to force cleanup timeout");
                }

                const deleteTimeoutMs = hasForceSignal ? 5_000 : 30_000;
                try {
                    let deleteTimer: ReturnType<typeof setTimeout> | undefined;
                    try {
                        await Promise.race([
                            (async () => {
                                if (options.container !== undefined) {
                                    await options.container.close();
                                } else {
                                    await this.remove(containerName, deleteTimeoutMs);
                                }
                            })(),
                            new Promise<never>((_, reject) => {
                                deleteTimer = setTimeout(
                                    () => reject(new Error(`Timed out after ${deleteTimeoutMs}ms attempting to remove container ${containerName}`)),
                                    deleteTimeoutMs,
                                );
                            }),
                        ]);
                    } finally {
                        if (deleteTimer !== undefined) clearTimeout(deleteTimer);
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    const enriched = msg.includes(containerName)
                        ? error
                        : new Error(`Failed to remove container ${containerName}: ${msg}`);
                    pushError(errors, "cleanup", enriched);
                }
            }
        }
        if (controller.signal.aborted && status !== "cancelled") status = "cancelled";
        if (errors.length > 0) {
            if (errors.some((error) => error.stage === "cleanup")) {
                status = "infrastructure_error";
            } else if (status !== "cancelled") {
                status = errors.some((error) => error.stage !== "agent") ? "infrastructure_error" : "failed";
            }
        }
        return { status, artifact, imageId, acp, errors };
    }

    private createHandle(containerName: string, workdir: string, signal: AbortSignal): EnvironmentHandle {
        const run = this.runProcess;
        return Object.freeze({
            workdir,
            exec: async (command: string, options: Partial<ProcessOptions> = {}) => {
                const merged = {
                    timeoutMs: options.timeoutMs ?? 60_000,
                    ...options,
                    signal: options.signal ?? signal,
                } satisfies ProcessOptions;
                return run("docker", ["exec", "--workdir", workdir, containerName, "/bin/bash", "-c", command], merged);
            },
            copyInto: async (source: string, target: string) => {
                requireSuccess(await run("docker", ["cp", source, `${containerName}:${target}`], { timeoutMs: 60_000, signal }), "Copy environment input");
            },
            copyOut: async (source: string, target: string) => {
                await mkdir(dirname(resolve(target)), { recursive: true });
                requireSuccess(await run("docker", ["cp", `${containerName}:${source}`, resolve(target)], { timeoutMs: 60_000, signal }), "Copy environment artifact");
                return resolve(target);
            },
        });
    }

    private async pullAndInspect(image: string, platform: string, signal: AbortSignal, receive: (imageId: string) => void): Promise<void> {
        let inspectResult = await this.runProcess("docker", ["image", "inspect", "--format", "{{.Id}}\t{{.Os}}/{{.Architecture}}", image], { timeoutMs: 30_000, signal, maxBytes: 16 * 1024 });
        if (inspectResult.code !== 0) {
            requireSuccess(await this.runProcess("docker", ["pull", "--platform", platform, image], { timeoutMs: 1_200_000, signal, maxBytes: 16 * 1024, truncate: true }), "Pull isolated image");
            inspectResult = requireSuccess(await this.runProcess("docker", ["image", "inspect", "--format", "{{.Id}}\t{{.Os}}/{{.Architecture}}", image], { timeoutMs: 30_000, signal, maxBytes: 16 * 1024 }), "Inspect isolated image");
        }
        const inspected = inspectResult.stdout.trim();
        const [imageId, actualPlatform] = inspected.split("\t");
        if (!/^sha256:[a-f0-9]{64}$/u.test(imageId ?? "")) throw new Error("Docker returned an invalid image identity");
        if (actualPlatform !== undefined && actualPlatform !== "/" && actualPlatform.trim().length > 1 && actualPlatform !== platform) {
            throw new Error(`Isolated image platform mismatch: expected ${platform}, received ${actualPlatform}`);
        }
        receive(imageId!);
    }

    private async prepareImage(
        source: ImageSource,
        imageRef: string,
        platform: string,
        signal: AbortSignal,
        receive: (imageId: string) => void,
    ): Promise<void> {
        if (source.mode === "custom" || source.installCommands.length === 0) {
            await this.pullAndInspect(imageRef, platform, signal, receive);
            return;
        }
        await this.pullAndInspect(imageRef, platform, signal, () => undefined);
        const digest = createHash("sha256")
            .update(JSON.stringify({ image: imageRef, platform, installCommands: source.installCommands }), "utf8")
            .digest("hex");
        const tag = `lazygoal-managed-${digest.slice(0, 24)}:latest`;
        const context = await mkdtemp(join(tmpdir(), "lazygoal-managed-image-"));
        const dockerfile = resolve(context, "Dockerfile");
        const content = [
            `FROM ${imageRef}`,
            ...source.installCommands.map((command) => `RUN ${command}`),
        ].join("\n") + "\n";
        try {
            await writeFile(dockerfile, content, "utf8");
            requireSuccess(await this.runProcess("docker", ["build", "--platform", platform, "--tag", tag, "--file", dockerfile, context], {
                timeoutMs: 1_800_000,
                signal,
                maxBytes: 16 * 1024 * 1024,
                truncate: true,
            }), "Build managed benchmark image");
            const inspected = requireSuccess(await this.runProcess("docker", ["image", "inspect", "--format", "{{.Id}}\t{{.Os}}/{{.Architecture}}", tag], {
                timeoutMs: 30_000,
                signal,
                maxBytes: 16 * 1024,
            }), "Inspect managed benchmark image").trim();
            const [managedImageId, managedPlatform] = inspected.split("\t");
            if (!/^sha256:[a-f0-9]{64}$/u.test(managedImageId ?? "")) throw new Error("Docker returned an invalid managed image identity");
            if (managedPlatform !== undefined && managedPlatform !== platform) throw new Error(`Managed image platform mismatch: expected ${platform}, received ${managedPlatform}`);
            receive(managedImageId!);
        } finally {
            await rm(context, { recursive: true, force: true });
        }
    }

    private async createAndStart(
        name: string,
        imageId: string,
        platform: string,
        workdir: string,
        networkMode: "none" | "bridge",
        proxyEnvironment: ContainerProxyEnvironment | undefined,
        signal: AbortSignal,
    ): Promise<void> {
        try {
            requireSuccess(await this.runProcess("docker", ["create", "--name", name, "--platform", platform,
                "--network", networkMode, "--cpus", "2", "--memory", "4g", "--pids-limit", "256",
                "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--workdir", workdir,
                ...(proxyEnvironment === undefined || proxyEnvironment.names.length === 0
                    ? []
                    : [
                        "--add-host", "host.docker.internal:host-gateway",
                        ...proxyEnvironment.names.flatMap((variable) => ["--env", variable]),
                    ]),
                "--entrypoint", "/bin/bash", imageId, "-c", "sleep infinity"], {
                timeoutMs: 60_000,
                signal,
                ...(proxyEnvironment === undefined
                    ? {}
                    : { env: proxyEnvironment.processEnvironment }),
            }), "Create isolated container");
            requireSuccess(await this.runProcess("docker", ["start", name], { timeoutMs: 60_000, signal }), "Start isolated container");
        } catch (error) {
            try {
                // Docker may have created the named container before the client observed
                // a create/start failure; removing by this run's unique name is safe and
                // prevents a partially created container from surviving the Attempt.
                await this.remove(name);
            } catch (cleanupError) {
                throw new AggregateError([error, cleanupError], "Isolated container setup and cleanup failed");
            }
            throw error;
        }
    }

    private async injectWorker(name: string, config: WorkerEntryConfig, signal: AbortSignal): Promise<void> {
        const artifact = config.artifact;
        if (artifact === undefined) return;
        const options = { timeoutMs: 60_000, signal, maxBytes: 16 * 1024, truncate: true } as const;
        requireSuccess(await this.runProcess("docker", ["exec", name, "/bin/mkdir", "-p", "/opt/lazygoal"], options), "Create Worker directory");
        for (const [source, target] of [[artifact.workerPath, "worker.mjs"], [artifact.nodePath, "node"], [artifact.manifestPath, "manifest.json"]] as const) {
            requireSuccess(await this.runProcess("docker", ["cp", source, `${name}:/opt/lazygoal/${target}`], options), `Inject Worker ${target}`);
        }
    }

    private async openWorker(name: string, config: WorkerEntryConfig, injected: InteractiveProcessRunner | undefined, timeoutMs: number, signal: AbortSignal): Promise<InteractiveProcess> {
        const args = ["exec", "-i", "--workdir", config.cwd ?? "/opt/lazygoal", name,
            ...(config.command ?? ["/opt/lazygoal/node", "/opt/lazygoal/worker.mjs"])];
        const runner = injected ?? this.runInteractive;
        return runner("docker", args, { timeoutMs, signal, maxBytes: 16 * 1024 * 1024 });
    }

    private async remove(name: string, timeoutMs = 30_000): Promise<void> {
        const result = await this.runProcess("docker", ["rm", "--force", name], { timeoutMs, maxBytes: 16 * 1024, truncate: true });
        if (result.code !== 0 && !result.stderr.includes("No such container")) requireSuccess(result, `Remove isolated container ${name}`);
    }
}

/**
 * IsolatedEnvironment 的可替换进程边界。
 *
 * @example
 * ```ts
 * const options: IsolatedEnvironmentOptions = {
 *   run: fakeDockerRunner,
 * };
 * ```
 */
export interface IsolatedEnvironmentOptions {
    /** 单次 Docker 命令执行器；省略时使用共享 ProcessRunner。 */
    readonly run?: ProcessRunner;
    /** 交互式 Worker 启动器；省略时使用共享 InteractiveProcessRunner。 */
    readonly interactiveRun?: InteractiveProcessRunner;
    /** 宿主环境快照；仅显式启用代理继承的 Spec 可读取标准代理变量。 */
    readonly hostEnvironment?: NodeJS.ProcessEnv;
}

function resolveContainerProxyEnvironment(
    hostEnvironment: NodeJS.ProcessEnv,
): ContainerProxyEnvironment {
    const processEnvironment: NodeJS.ProcessEnv = { ...hostEnvironment };
    const names: string[] = [];
    for (const name of HOST_PROXY_ENVIRONMENT_VARIABLES) {
        const value = hostEnvironment[name];
        if (value === undefined || value.trim() === "") continue;
        names.push(name);
        processEnvironment[name] = name.toLowerCase() === "no_proxy"
            ? value
            : normalizeProxyUrlForContainer(value);
    }
    return { names: Object.freeze(names), processEnvironment };
}

function normalizeProxyUrlForContainer(value: string): string {
    try {
        const url = new URL(value);
        if (url.hostname === "localhost"
            || url.hostname === "127.0.0.1"
            || url.hostname === "[::1]") {
            url.hostname = "host.docker.internal";
            return url.toString();
        }
    } catch {
        // 非 URL 代理格式保持原值，由代理客户端解释。
    }
    return value;
}

function makeContainerName(benchmarkId: string): string {
    const safe = benchmarkId.toLowerCase().replace(/[^a-z0-9_.-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 32) || "benchmark";
    return `lazygoal-${safe}-${randomUUID()}`;
}

function validateRunOptions<TTask, TArtifact>(options: IsolatedEnvironmentRunOptions<TTask, TArtifact>): void {
    if (options.spec.benchmarkId.trim() === "") throw new TypeError("EnvironmentSpec benchmarkId must be non-empty");
    if (options.outputDirectory.trim() === "") throw new TypeError("outputDirectory must be non-empty");
    if (options.taskTimeoutMs !== undefined && (!Number.isSafeInteger(options.taskTimeoutMs) || options.taskTimeoutMs <= 0)) throw new RangeError("taskTimeoutMs must be positive");
    if (options.artifactGraceMs !== undefined && (!Number.isSafeInteger(options.artifactGraceMs) || options.artifactGraceMs <= 0)) throw new RangeError("artifactGraceMs must be positive");
    if (options.acp !== undefined && options.runAgent !== undefined) throw new TypeError("acp and runAgent are mutually exclusive");
}

function validateImageSource(image: ImageSource, platform: string): void {
    if (platform !== "linux/amd64") throw new RangeError("Isolated benchmark images must target linux/amd64");
    if (image.mode === "custom") {
        if (image.image.trim() === "") throw new TypeError("Custom benchmark image must be non-empty");
        if (!isSafeImageReference(image.image)) throw new TypeError("Custom benchmark image contains unsupported characters");
        return;
    }
    if (image.baseImage !== undefined && image.baseImage.trim() === "") {
        throw new TypeError("Managed benchmark base image must be non-empty");
    }
    if (image.baseImage !== undefined && !isSafeImageReference(image.baseImage)) {
        throw new TypeError("Managed benchmark base image contains unsupported characters");
    }
    if (image.installCommands.some((command) => command.trim() === "")) {
        throw new TypeError("Managed benchmark install commands must be non-empty");
    }
}

function isSafeImageReference(value: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9._/@:-]*$/u.test(value);
}

function pushError(errors: IsolatedEnvironmentError[], stage: IsolatedEnvironmentFailureStage, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const code = isRecordLike(error) && typeof error.code === "string" ? error.code : undefined;
    errors.push({ stage, message, ...(code === undefined ? {} : { code }) });
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

async function drainDiagnostics(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            if (process.env.DEBUG_BENCHMARK_WORKER) {
                process.stderr.write(decoder.decode(chunk.value));
            }
        }
    } catch {
        // Worker exit and transport failures are reported through their owning promises.
    } finally {
        reader.releaseLock();
    }
}

async function settleWorker(
    worker: InteractiveProcess,
    timeoutMs: number,
    errors: IsolatedEnvironmentError[],
    forceSignal?: AbortSignal,
): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let forceHandler: (() => void) | undefined;
    try {
        await Promise.race([
            worker.closed,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Worker did not exit within cleanup grace period")), timeoutMs);
                if (forceSignal !== undefined) {
                    if (forceSignal.aborted) {
                        reject(new Error("Worker cleanup wait aborted by force signal"));
                        return;
                    }
                    forceHandler = () => reject(new Error("Worker cleanup wait aborted by force signal"));
                    forceSignal.addEventListener("abort", forceHandler, { once: true });
                }
            }),
        ]);
    } catch (error) {
        pushError(errors, "transport", error);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
        if (forceSignal !== undefined && forceHandler !== undefined) {
            forceSignal.removeEventListener("abort", forceHandler);
        }
    }
}

async function withinGrace<T>(
    factory: () => Promise<T>,
    timeoutMs: number,
    forceSignal?: AbortSignal,
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let forceHandler: (() => void) | undefined;
    try {
        return await Promise.race([
            factory(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Environment artifact grace period exceeded")), timeoutMs);
                if (forceSignal !== undefined) {
                    if (forceSignal.aborted) {
                        reject(new Error("Artifact collection aborted by force signal"));
                        return;
                    }
                    forceHandler = () => reject(new Error("Artifact collection aborted by force signal"));
                    forceSignal.addEventListener("abort", forceHandler, { once: true });
                }
            }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
        if (forceSignal !== undefined && forceHandler !== undefined) {
            forceSignal.removeEventListener("abort", forceHandler);
        }
    }
}
