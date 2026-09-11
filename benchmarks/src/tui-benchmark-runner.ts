import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type React from "react";
import type { LLMAdapter, PromptBundleRenderer } from "../../packages/agent/src/index.js";
import { LLMStepExecutor } from "../../packages/agent/src/index.js";
import {
    createGoal,
    CheckpointGateGoalStore,
    GoalCoordinator,
    InlineScheduler,
    createNoopDiagnosticTraceSink,
    InMemoryToolRegistry,
    ManagedResourceRegistry,
    ProcessExitPort,
    Runner,
    ShutdownCoordinator,
    type AgentProfile,
    type DiagnosticTraceSink,
    type ExitPort,
    type ExecutionControl,
    type Goal,
    type GoalProgressResult,
    type GoalStore,
    type ManagedResource,
    type PreparationExecutor,
    type StepExecutor,
    type ToolPolicy,
    type ToolRegistry,
    type TrajectoryStore,
} from "../../packages/runtime/src/index.js";
import { InMemoryGoalStore, JsonFileTrajectoryStore } from "../../packages/storage/src/index.js";
import {
    mountTuiApp,
    SessionController,
    type MountedTuiApp,
    type MountTuiOptions,
} from "../../packages/tui/src/index.js";
import type {
    BenchmarkAttemptStatus,
} from "./attempt-recorder.js";
import type {
    BenchmarkTaskDescriptor,
} from "./headless-composition-root.js";
import {
    IsolatedEnvironment,
    type EnvironmentSpec,
    type IsolatedContainer,
    type IsolatedEnvironmentResult,
} from "./isolated-environment.js";
import { ToolRpcClient, type ToolRpcMessage } from "./tool-rpc.js";
import {
    createTuiToolPolicy,
    type TuiExecutionMode,
} from "./tui-tool-policy.js";

const DEFAULT_PROTOCOLS = {
    promptBundleVersion: 1,
    memoryProtocol: { kind: "structured", version: 1 } as const,
    modelContextProtocol: { kind: "trajectory-layered", version: 1 } as const,
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 } as const,
};

/**
 * 为已确定 Descriptor 的任务创建自动提供 context_ready 与 task_proposal 的 PreparationExecutor。
 *
 * @remarks
 * 在 gathering_context 阶段自动返回 context_ready；在 planning 阶段自动根据 Descriptor 生成 task_proposal。
 *
 * @param descriptor - Benchmark 任务描述符。
 * @returns 满足 Runtime 契约的 PreparationExecutor 实例。
 *
 * @example
 * ```ts
 * const executor = createDescriptorPreparationExecutor(descriptor);
 * ```
 */
export function createDescriptorPreparationExecutor(
    descriptor: BenchmarkTaskDescriptor,
): PreparationExecutor {
    return {
        async execute({ goal }) {
            if (goal.state.workflow.phase === "gathering_context") {
                return { kind: "context_ready" };
            }

            if (goal.state.workflow.phase === "planning") {
                return {
                    kind: "task_proposal",
                    task: {
                        objective: descriptor.objective,
                        completionCriteria: descriptor.completionCriteria.map((c) =>
                            typeof c === "string" ? { text: c } : c,
                        ),
                    },
                    approvalRequest: "Benchmark task is ready for execution.",
                };
            }

            throw new Error(`Unexpected preparation phase ${goal.state.workflow.phase}`);
        },
    };
}

/**
 * TUI 沙箱单任务执行的输入选项。
 *
 * @example
 * ```ts
 * const options: TuiSandboxRunOptions<Task, Artifact> = {
 *     benchmarkId: "swebench",
 *     task,
 *     descriptor,
 *     spec,
 *     outputDirectory: "/tmp/output",
 *     mode: "review",
 *     profile,
 *     adapter,
 * };
 * ```
 */
export interface TuiSandboxRunOptions<TTask, TArtifact, TOutcome = unknown> {
    /** 当前任务的基准唯一标识（如 "swebench" 或 "gaia"）。 */
    readonly benchmarkId: string;
    /** 领域任务对象。 */
    readonly task: TTask;
    /** 领域任务转换为 Goal 的标准描述。 */
    readonly descriptor: BenchmarkTaskDescriptor;
    /** 声明式隔离环境适配。 */
    readonly spec: EnvironmentSpec<TTask, TArtifact>;
    /** 宿主本次尝试输出根目录。 */
    readonly outputDirectory: string;
    /** 执行模式（"auto" 或 "review"），默认 "review"。 */
    readonly mode?: TuiExecutionMode;
    /** Agent Profile。 */
    readonly profile: AgentProfile;
    /** 模型执行适配器。 */
    readonly adapter: LLMAdapter;
    /** 可选最大 step 步数限制，未提供时使用 descriptor.maxSteps。 */
    readonly maxSteps?: number;
    /** 清理总宽限期，默认 30_000ms。 */
    readonly gracePeriodMs?: number;
    /** 外部进程退出端口，省略时使用 ProcessExitPort。 */
    readonly exitPort?: ExitPort;
    /** 渲染器，测试可注入自定义渲染器。 */
    readonly render?: MountTuiOptions["render"];
    /** 错误信息输出回调。 */
    readonly writeError?: (message: string) => void;
    /** 诊断/结果输出回调。 */
    readonly writeOut?: (message: string) => void;
    /** 可选注入的隔离环境实例，测试可注入 fake 环境。 */
    readonly environment?: IsolatedEnvironment;
    /** 可选注入的已适配容器驱动，测试或特殊容器场景可直接注入。 */
    readonly container?: IsolatedContainer;
    /** 可选的自定义工具注册工厂（用于将 Remote 工具映射到宿主 Registry）。 */
    readonly createToolRegistry?: (client: ToolRpcClient) => ToolRegistry;
    /** 可选只读工具名单，用于审查模式策略。 */
    readonly readonlyToolIds?: readonly string[];
    /** 可选自定义 ToolPolicy 实例，省略时按 mode 和 readonlyToolIds 创建。 */
    readonly toolPolicy?: ToolPolicy;
    /** 可选自定义 PreparationExecutor 实例。 */
    readonly preparationExecutor?: PreparationExecutor;
    /** 可选自定义 StepExecutor 实例。 */
    readonly stepExecutor?: StepExecutor;
    /** 可选 PromptBundleRenderer。 */
    readonly promptBundleRenderer?: PromptBundleRenderer;
    /** 可选持久化 GoalStore。 */
    readonly store?: GoalStore;
    /** 可选持久化 TrajectoryStore。 */
    readonly trajectoryStore?: TrajectoryStore;
    /** 可选 DiagnosticTraceSink。 */
    readonly traceSink?: DiagnosticTraceSink;
    /** 可选 Goal ID。 */
    readonly goalId?: string;
    /** 可选 Run ID。 */
    readonly runId?: string;
    /** 领域产物解释/评分回调；可从收集到的 TArtifact 计算 TOutcome。 */
    readonly evaluateOutcome?: (artifact: TArtifact | null) => Promise<TOutcome> | TOutcome;
    /** 宿主反向代理端口处理；如 GAIA web_search/web_fetch。 */
    readonly backendHandler?: (call: { toolId: string; input: unknown }) => Promise<unknown>;
}

/**
 * TUI 沙箱单任务执行的综合结果。
 *
 * @example
 * ```ts
 * const result = await runTuiWithSandbox(options);
 * if (result.exitCode === 0) console.log("Task completed successfully");
 * ```
 */
export interface TuiSandboxRunResult<TArtifact, TOutcome = unknown> {
    /** 进程退出状态码（0: 成功, 1: 失败/未完成/清理异常, 2: 参数错误, 130: 用户中断）。 */
    readonly exitCode: number;
    /** Attempt 终态。 */
    readonly status: BenchmarkAttemptStatus;
    /** 收集到的领域产物（如果有）。 */
    readonly artifact: TArtifact | null;
    /** 计算出的领域评测结果（如果有）。 */
    readonly outcome?: TOutcome;
    /** 发生的异常信息列表。 */
    readonly errors: readonly string[];
}

/**
 * 驱动单个 Benchmark 任务在 TUI 沙箱透明代理运行时中执行。
 *
 * @remarks
 * - 在启动异步环境工作前建立 AbortController、force AbortController、受管资源和 SIGINT 入口；
 * - 将沙箱生命周期作为单一受管资源接入 ShutdownCoordinator，共享 30 秒宽限期；
 * - 正常完成时只收集一次产物并销毁容器，返回退出码 0（若运行失败或清理异常返回 1）；
 * - SIGINT/Ctrl+C 中断时冻结 CheckpointGate，中止执行并安全清理，返回退出码 130；
 * - 无效模式或非法参数在容器创建前快速返回 2。
 *
 * @param options - 单任务运行配置。
 * @returns 包含状态码与产物的综合运行结果。
 *
 * @example
 * ```ts
 * const result = await runTuiWithSandbox({
 *     benchmarkId: "swebench",
 *     task,
 *     descriptor,
 *     spec,
 *     outputDirectory: "/tmp/run-1",
 *     mode: "auto",
 *     profile,
 *     adapter,
 * });
 * process.exitCode = result.exitCode;
 * ```
 */
export async function runTuiWithSandbox<TTask, TArtifact, TOutcome = unknown>(
    options: TuiSandboxRunOptions<TTask, TArtifact, TOutcome>,
): Promise<TuiSandboxRunResult<TArtifact, TOutcome>> {
    const writeError = options.writeError ?? ((message: string) => {
        console.error(message);
    });

    // 1. 参数与模式校验（req-1-1）
    const mode: TuiExecutionMode = options.mode ?? "review";
    if (mode !== "auto" && mode !== "review") {
        const errorMsg = `Invalid mode "${String(options.mode)}". Allowed modes: "auto", "review"`;
        writeError(errorMsg);
        return {
            exitCode: 2,
            status: "infrastructure_error",
            artifact: null,
            errors: [errorMsg],
        };
    }

    if (!options.outputDirectory || options.outputDirectory.trim() === "") {
        const errorMsg = "outputDirectory must be specified and non-empty";
        writeError(errorMsg);
        return {
            exitCode: 2,
            status: "infrastructure_error",
            artifact: null,
            errors: [errorMsg],
        };
    }

    if (!options.task || !options.spec || !options.descriptor) {
        const errorMsg = "task, spec, and descriptor must be provided";
        writeError(errorMsg);
        return {
            exitCode: 2,
            status: "infrastructure_error",
            artifact: null,
            errors: [errorMsg],
        };
    }

    // 2. 生命周期信号与受管资源准备（req-1-2 至 req-1-5, req-4-3）
    const abortController = new AbortController();
    const forceController = new AbortController();
    const resources = new ManagedResourceRegistry();
    const gracePeriodMs = options.gracePeriodMs ?? 30_000;

    const baseStore = options.store ?? new InMemoryGoalStore();
    const gate = new CheckpointGateGoalStore(baseStore);
    const trajectoryStore = options.trajectoryStore
        ?? new JsonFileTrajectoryStore(join(options.outputDirectory, "trajectories"));
    const traceSink = options.traceSink ?? createNoopDiagnosticTraceSink();

    const exitPort = options.exitPort ?? new ProcessExitPort();
    const shutdownCoordinator = new ShutdownCoordinator({
        checkpointStore: gate,
        resources,
        abortController,
        exitPort,
        gracePeriodMs,
    });

    let shutdownRequested = false;
    let shutdownPromise: Promise<void> | undefined;
    let app: MountedTuiApp | undefined;
    let unregisterSigint: (() => void) | undefined;
    let environmentRunPromise: Promise<IsolatedEnvironmentResult<TArtifact>> | undefined;

    // 单一沙箱生命周期受管适配器（req-1-3, req-1-5）
    const sandboxResource: ManagedResource = {
        close: async () => {
            abortController.abort();
            if (environmentRunPromise !== undefined) {
                await environmentRunPromise.catch(() => undefined);
            }
        },
        forceClose: async () => {
            forceController.abort();
            if (environmentRunPromise !== undefined) {
                await environmentRunPromise.catch(() => undefined);
            }
        },
    };
    resources.register(sandboxResource);

    const requestShutdown = (): Promise<void> => {
        if (shutdownPromise !== undefined) {
            return shutdownPromise;
        }

        shutdownRequested = true;
        gate.freeze();
        abortController.abort();
        shutdownPromise = (async () => {
            app?.unmount();
            if (app !== undefined) {
                await app.waitUntilExit().catch(() => undefined);
            }
            await shutdownCoordinator.shutdown().catch(() => undefined);
        })();
        return shutdownPromise;
    };

    const onSigint = (): void => {
        void requestShutdown();
    };

    process.on("SIGINT", onSigint);
    unregisterSigint = resources.register({
        close: () => {
            process.off("SIGINT", onSigint);
        },
    });

    let runErrors: string[] = [];
    let terminalGoal: Goal | undefined;
    let autoBlocked = false;

    try {
        const environment = options.environment ?? new IsolatedEnvironment();

        environmentRunPromise = environment.run<TTask, TArtifact>({
            task: options.task,
            spec: options.spec,
            outputDirectory: options.outputDirectory,
            signal: abortController.signal,
            forceSignal: forceController.signal,
            artifactGraceMs: gracePeriodMs,
            ...(options.container !== undefined ? { container: options.container } : {}),
            runAgent: async ({ environment: _handle, worker: _worker, mux, signal }) => {
                const toolChannel = mux.channel<ToolRpcMessage>("tools");
                const client = new ToolRpcClient({
                    stream: toolChannel,
                    ...(options.backendHandler !== undefined ? { backendHandler: options.backendHandler } : {}),
                });

                const toolRegistry = options.createToolRegistry !== undefined
                    ? options.createToolRegistry(client)
                    : new InMemoryToolRegistry();

                const toolPolicy = options.toolPolicy
                    ?? createTuiToolPolicy({
                        mode,
                        readonlyToolIds: options.readonlyToolIds,
                    });

                const stepExecutor = options.stepExecutor ?? new LLMStepExecutor({
                    adapter: options.adapter,
                    profile: options.profile,
                    ...(options.promptBundleRenderer !== undefined
                        ? { promptBundleRenderer: options.promptBundleRenderer }
                        : {}),
                });

                const runner = new Runner({
                    store: gate,
                    ...(trajectoryStore !== undefined ? { trajectoryStore } : {}),
                    traceSink,
                    toolRegistry,
                    executor: stepExecutor,
                    toolPolicy,
                });

                const scheduler = new InlineScheduler(runner);

                const preparationExecutor: PreparationExecutor = options.preparationExecutor
                    ?? createDescriptorPreparationExecutor(options.descriptor);

                const coordinator = new GoalCoordinator({
                    store: gate,
                    ...(trajectoryStore !== undefined ? { trajectoryStore } : {}),
                    traceSink,
                    scheduler,
                    preparationExecutor,
                });

                const goalId = options.goalId ?? `goal-${randomUUID()}`;
                const runId = options.runId ?? `run-${randomUUID()}`;
                const goal = createGoal({
                    ...DEFAULT_PROTOCOLS,
                    id: goalId,
                    intent: options.descriptor.intent,
                    profile: options.profile,
                    runId,
                    maxSteps: options.maxSteps ?? options.descriptor.maxSteps,
                });

                await gate.save(goal);

                // 确定性 Preparation：推进并自动批准预定义任务（req-4-1, req-4-2）
                let progress = await coordinator.advance({ goalId, runId }, { signal });
                if (
                    progress.ok
                    && progress.kind === "waiting"
                    && progress.phase === "planning"
                    && progress.waitingFor === "approval"
                ) {
                    progress = await coordinator.resume({
                        ref: { goalId, runId },
                        action: { kind: "approve" },
                    }, { signal });
                }

                if (!progress.ok) {
                    runErrors.push(progress.error.message);
                    return;
                }

                if (progress.kind === "terminal") {
                    terminalGoal = progress.goal;
                    return;
                }

                // 挂载 TUI
                const sessionController = new SessionController({
                    launcher: {
                        async launch() {
                            return { ok: true, goalId, runId };
                        },
                    },
                    coordinator,
                    store: gate,
                    catalog: gate,
                    profileId: options.profile.id,
                    goalIdGenerator: () => randomUUID(),
                    control: { signal },
                });

                if (options.render !== undefined) {
                    app = mountTuiApp({
                        controller: sessionController,
                        onShutdown: requestShutdown,
                        render: options.render,
                    });
                }

                // 执行循环
                while (!signal.aborted) {
                    if (progress.kind === "terminal") {
                        terminalGoal = progress.goal;
                        break;
                    }

                    if (progress.kind === "waiting") {
                        if (progress.waitingFor === "action_approval") {
                            if (mode === "auto") {
                                // auto 模式下由 policy 自动放行；如仍遇到 approval 则说明异常
                                autoBlocked = true;
                                runErrors.push(`Auto mode encountered unexpected action approval for ${progress.goal.state.run.pendingAction?.action.actionId}`);
                                break;
                            }
                            // review 模式下由 TUI 用户审批（或等待 UI 操作）
                            // 在非交互测试中等待 signal 或由 UI 驱动
                            break;
                        } else if (progress.waitingFor === "blocked" || progress.waitingFor === "question") {
                            if (mode === "auto") {
                                // auto 模式遇到用户输入阻塞以未完成结果退出（req-1-7/req-4-2）
                                autoBlocked = true;
                                break;
                            }
                            break;
                        }
                    }

                    progress = await coordinator.advance({ goalId, runId }, { signal });
                    if (!progress.ok) {
                        runErrors.push(progress.error.message);
                        break;
                    }
                }

                await client.close().catch(() => undefined);
            },
        });

        const envResult = await environmentRunPromise;

        // 3. 结果汇总与退出码决策（req-1-2, req-1-3, req-4-3）
        if (shutdownRequested) {
            if (shutdownPromise !== undefined) {
                await shutdownPromise;
            }
            return {
                exitCode: 130,
                status: "cancelled",
                artifact: envResult.artifact,
                errors: envResult.errors.map((e) => `[${e.stage}] ${e.message}`),
            };
        }

        app?.unmount();
        if (app !== undefined) {
            await app.waitUntilExit().catch(() => undefined);
        }

        const allErrors = [
            ...runErrors,
            ...envResult.errors.map((e) => `[${e.stage}] ${e.message}`),
        ];

        let outcome: TOutcome | undefined;
        if (options.evaluateOutcome !== undefined) {
            outcome = await options.evaluateOutcome(envResult.artifact);
        }

        const isCleanupError = envResult.errors.some((e) => e.stage === "cleanup");
        const isInfraError = envResult.status === "infrastructure_error" || isCleanupError;
        const isFailed = envResult.status === "failed" || autoBlocked || runErrors.length > 0;

        let status: BenchmarkAttemptStatus = "completed";
        if (isInfraError) {
            status = "infrastructure_error";
        } else if (isFailed) {
            status = "failed";
        } else if (envResult.status === "cancelled") {
            status = "cancelled";
        }

        const exitCode = status === "completed" ? 0 : 1;
        if (allErrors.length > 0) {
            for (const err of allErrors) {
                writeError(err);
            }
        }

        return {
            exitCode,
            status,
            artifact: envResult.artifact,
            ...(outcome !== undefined ? { outcome } : {}),
            errors: allErrors,
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        writeError(message);
        return {
            exitCode: 1,
            status: "infrastructure_error",
            artifact: null,
            errors: [message],
        };
    } finally {
        unregisterSigint?.();
    }
}