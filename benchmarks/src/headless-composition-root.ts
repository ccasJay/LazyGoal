import { randomUUID } from "node:crypto";

import {
    createDefaultModelContextBudgetPolicy,
    LLMStepExecutor,
    TrajectoryModelContextAssembler,
    type ContextCompactor,
    type LLMAdapter,
    type LLMRequest,
    type LLMResponse,
    type ModelConversationMessage,
    type NormalizedUsage,
    type PromptBundleRenderer,
    readNormalizedUsage,
} from "../../packages/agent/src/index.js";
import {
    DEFAULT_WORKING_MEMORY_LIMITS,
    GoalCoordinator,
    InlineScheduler,
    isExecutionAbortedError,
    launch,
    Runner,
    throwIfAborted,
    type AgentProfile,
    type AgentProfileRegistry,
    type CompletionCriterion,
    type ExecutionControl,
    type Goal,
    type GoalProgressResult,
    type GoalProtocolValidator,
    type GoalStore,
    type PreparationExecutor,
    type RunIdGenerator,
    readTrajectoryAtSnapshot,
    type RunnerResult,
    type ToolPolicy,
    type ToolRegistry,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
    type DiagnosticTraceSink,
    TrajectoryCheckpointCommitter,
    type WorkingMemoryLimits,
} from "../../packages/runtime/src/index.js";
/**
 * Benchmark 任务转换后的通用 Goal 描述。
 *
 * @remarks
 * 该描述只包含 LazyGoal 构造 Goal 所需的通用字段，不应携带 benchmark 专用
 * Manifest、环境句柄或评分结果。`maxSteps` 直接冻结到 Goal 的执行策略中。
 * `completionCriteria` 支持简写纯文本字符串或携带验收声明的结构化 {@link CompletionCriterion}。
 *
 * @example
 * ```ts
 * const descriptor: BenchmarkTaskDescriptor = {
 *     intent: "完成一个算术任务",
 *     objective: "返回正确的计算结果",
 *     completionCriteria: [
 *         "环境确认答案正确",
 *         {
 *             text: "运行验证工具",
 *             acceptance: { expectToolId: "verify", expectOutcome: "success" },
 *         },
 *     ],
 *     maxSteps: 10,
 * };
 * ```
 */
export interface BenchmarkTaskDescriptor {
    /** 创建 Goal 时保存的原始任务意图。 */
    readonly intent: string;
    /** 批准后冻结到 Goal 的任务目标。 */
    readonly objective: string;
    /** 批准后冻结到 Goal 的可验证完成条件，支持纯文本或结构化验收声明。 */
    readonly completionCriteria: readonly (string | CompletionCriterion)[];
    /** executing 阶段允许的最大 Step 数；`0` 表示不按数量限制。 */
    readonly maxSteps: number;
}

/**
 * 创建一次 benchmark 环境会话时可使用的通用上下文。
 *
 * @remarks
 * Root 只传递工作区、冻结 Profile 与调用级中止信号；任务字段和外部环境协议
 * 由具体 adapter 自己持有。Episode 不应把该上下文写回 Goal Snapshot。
 *
 * @example
 * ```ts
 * const context: BenchmarkEpisodeContext = {
 *     workspaceRoot: process.cwd(),
 *     profile,
 * };
 * ```
 */
export interface BenchmarkEpisodeContext {
    /** benchmark 运行使用的工作区根目录。 */
    readonly workspaceRoot: string;
    /** 本次运行冻结到 Goal 的 Profile。 */
    readonly profile: AgentProfile;
    /** 可选的调用级中止信号。 */
    readonly signal?: AbortSignal;
}

/**
 * 一次 benchmark 环境会话及其 LazyGoal Tool 边界。
 *
 * @remarks
 * Episode 负责环境进程、连接和领域状态。`readOutcome` 只读取环境最终事实，
 * 不执行评分；`close` 必须幂等，以便 Root 在成功、失败和中止路径统一清理。
 *
 * @example
 * ```ts
 * const episode: BenchmarkEpisode<{ readonly won: boolean }> = {
 *     registry,
 *     readOutcome: () => ({ won: true }),
 *     close: async () => undefined,
 * };
 * ```
 */
export interface BenchmarkEpisode<TOutcome> {
    /** 当前任务可用的 Tool 实现注册表。 */
    readonly registry: ToolRegistry;
    /** 读取环境事实；不得在此处计算 benchmark 评分。 */
    readOutcome(): TOutcome;
    /** 关闭外部环境资源；重复调用不得产生额外副作用。 */
    close(): Promise<void>;
}

/**
 * 将任意 benchmark 任务和环境转换为通用 LazyGoal 输入的适配器。
 *
 * @remarks
 * Adapter 只拥有领域任务、环境会话和不透明 outcome；Root 不解析 Manifest、
 * 环境协议或评分字段。不同 benchmark 可以使用不同的 `TTask` 与 `TOutcome`。
 *
 * @example
 * ```ts
 * const adapter: BenchmarkAdapter<MyTask, MyOutcome> = {
 *     describeTask: (task) => ({
 *         intent: task.prompt,
 *         objective: task.objective,
 *         completionCriteria: ["环境报告成功"],
 *         maxSteps: 20,
 *     }),
 *     createEpisode: async () => episode,
 * };
 * ```
 */
export interface BenchmarkAdapter<TTask, TOutcome> {
    /** 将领域任务转换为 Root 可冻结的通用 Goal 描述。 */
    describeTask(task: TTask): BenchmarkTaskDescriptor;
    /** 为一个 task 创建隔离的环境会话和 Tool Registry。 */
    createEpisode(
        task: TTask,
        context: BenchmarkEpisodeContext,
    ): Promise<BenchmarkEpisode<TOutcome>>;
}

/**
 * 当前 benchmark task 的 LazyGoal 持久化装配上下文。
 *
 * @remarks
 * `namespace` 由 benchmark 的 Persistence Adapter 计算，Goal/Run 标识由 Root
 * 分配。该上下文不规定物理目录，后端可使用文件、数据库或测试替身。
 *
 * @example
 * ```ts
 * const context: BenchmarkPersistenceContext = {
 *     benchmarkId: "example",
 *     namespace: "task-001",
 *     goalId: "goal-1",
 *     runId: "run-1",
 * };
 * ```
 */
export interface BenchmarkPersistenceContext {
    /** benchmark 的稳定标识。 */
    readonly benchmarkId: string;
    /** 当前 task 对应的隔离命名空间。 */
    readonly namespace: string;
    /** Root 分配的 Goal 稳定标识。 */
    readonly goalId: string;
    /** Root 分配的 Run 稳定标识。 */
    readonly runId: string;
}

/**
 * benchmark 结果中可定位的 LazyGoal 持久化位置。
 *
 * @remarks
 * Locator 是稳定引用，不要求暴露底层物理路径。未启用 Diagnostic Trace 时省略
 * `diagnosticTrace`，不可用 `undefined` 伪造已启用的诊断位置。
 *
 * @example
 * ```ts
 * const locator: BenchmarkPersistenceLocator = {
 *     goalSnapshot: "memory://example/task-001/goal",
 *     trajectory: "memory://example/task-001/trajectory",
 * };
 * ```
 */
export interface BenchmarkPersistenceLocator {
    /** 最新 Goal Snapshot 的稳定定位标识。 */
    readonly goalSnapshot: string;
    /** 事实 Trajectory 的稳定定位标识。 */
    readonly trajectory: string;
    /** 启用时 Diagnostic Trace 的稳定定位标识。 */
    readonly diagnosticTrace?: string;
}

/**
 * Root 使用的一组 LazyGoal 持久化 Port。
 *
 * @remarks
 * `trajectoryStore` 同时承担 `TrajectorySink` 追加边界；Root 会把同一组实例注入
 * Launcher、Coordinator、Runner 和 Step Executor。benchmark 不应在此层复制
 * Snapshot、Trajectory 或 Trace 协议。
 *
 * @example
 * ```ts
 * const bindings: BenchmarkPersistenceBindings = {
 *     goalStore,
 *     trajectoryStore,
 *     locator: { goalSnapshot: "file://goal", trajectory: "file://trajectory" },
 * };
 * ```
 */
export interface BenchmarkPersistenceBindings {
    /** 保存和恢复最新完整 Goal Snapshot 的 LazyGoal Port。 */
    readonly goalStore: GoalStore;
    /** 追加并读取事实 Trajectory 的 LazyGoal Port。 */
    readonly trajectoryStore: TrajectoryStore;
    /** 可选的独立 Diagnostic Trace 旁路。 */
    readonly traceSink?: DiagnosticTraceSink;
    /** 当前 task 的稳定存储定位。 */
    readonly locator: BenchmarkPersistenceLocator;
}

/**
 * 将 benchmark task 适配到 LazyGoal 持久化 Port 的装配边界。
 *
 * @remarks
 * 该接口只负责命名空间映射和 Port 实例装配，不是第二套存储协议。实现应直接
 * 返回 LazyGoal 已有 Port；提交边界、事件校验、Trace 旁路和恢复语义由 LazyGoal
 * Runtime/Storage 负责。
 *
 * @example
 * ```ts
 * const persistence: BenchmarkPersistenceAdapter<MyTask> = {
 *     namespaceFor: (task) => task.id,
 *     open: async (context) => ({ goalStore, trajectoryStore, locator }),
 * };
 * ```
 */
export interface BenchmarkPersistenceAdapter<TTask> {
    /** 为 task 计算与其他 task 隔离的稳定 namespace。 */
    namespaceFor(task: TTask): string;
    /** 打开当前 Goal/Run 所需的 LazyGoal 持久化绑定。 */
    open(context: BenchmarkPersistenceContext): Promise<BenchmarkPersistenceBindings>;
}

/**
 * headless 单次 run 聚合的模型 token 用量事实。
 *
 * @remarks
 * `inputTokens` 与 `outputTokens` 只对携带用量的调用求和;`missingCalls`
 * 记录响应未携带用量的调用次数,缺失调用不向 token 总数贡献任何值。
 * 该聚合是 run 级内存状态,不持久化;未发生任何模型调用时整个 `usage`
 * 缺省。溢出防护为实现细节:求和超出安全整数后停止累加并保留最后一次
 * 合法值。
 *
 * @example
 * ```ts
 * const usage: HeadlessModelUsage = { inputTokens: 150, outputTokens: 25, missingCalls: 1 };
 * ```
 */
export interface HeadlessModelUsage {
    /** 携带用量的调用的输入 token 总和。 */
    readonly inputTokens: number;
    /** 携带用量的调用的输出 token 总和。 */
    readonly outputTokens: number;
    /** 未携带用量(响应缺失 usage)的调用次数。 */
    readonly missingCalls: number;
}

/**
 * Headless Root 的模型完成事实。
 *
 * @remarks
 * `usage` 在 run 期间发生至少一次模型调用时提供;每次基础设施重试的
 * `run()` 独立累计,天然满足按尝试独立聚合。
 *
 * @example
 * ```ts
 * const model: HeadlessModelResult = {
 *     runStatus: "completed",
 *     completed: true,
 *     usage: { inputTokens: 150, outputTokens: 25, missingCalls: 0 },
 * };
 * ```
 */
export interface HeadlessModelResult {
    /** 最终 Run 状态；Root 不将其解释为 benchmark 成功。 */
    readonly runStatus: Goal["state"]["run"]["status"];
    /** 最后一个 Decision 是否为 `complete`。 */
    readonly completed: boolean;
    /** run 级聚合的模型 token 用量；未发生模型调用时缺省。 */
    readonly usage?: HeadlessModelUsage;
}

/**
 * 一次 headless benchmark task 的通用执行结果。
 *
 * @remarks
 * `outcome` 保持 benchmark 自己的类型；Root 只返回 Runtime 状态和模型完成事实，
 * 不计算成功率、失败分类或重试结果。`runner` 在 Root 尚未进入 Runner 的异常
 * 返回路径上为 `null`，但正常 headless 生命周期会记录对应的 Runner 结果。
 *
 * @example
 * ```ts
 * const result = await root.run(task);
 * console.log(result.goal.id, result.outcome);
 * ```
 */
export interface HeadlessEpisodeResult<TOutcome> {
    /** 持久化后恢复的最新完整 Goal。 */
    readonly goal: Goal;
    /** Coordinator 最终返回的等待点、终态或业务错误。 */
    readonly progress: GoalProgressResult;
    /** InlineScheduler 记录的 Runner 结果；尚未调度时为 `null`。 */
    readonly runner: RunnerResult | null;
    /** 模型是否声明完成及最终 Run 状态。 */
    readonly model: HeadlessModelResult;
    /** 环境提供的原始领域结果。 */
    readonly outcome: TOutcome;
    /** Goal、Trajectory 和可选 Trace 的稳定定位。 */
    readonly persistence: BenchmarkPersistenceLocator;
    /** Episode 关闭失败时附加的原始错误；关闭成功时省略。 */
    readonly cleanupError?: unknown;
}

/**
 * 主执行失败且 Episode 关闭也失败时的组合错误。
 *
 * @remarks
 * `primaryError` 保留模型、Runtime 或环境的原始失败，`cleanupError` 记录资源释放
 * 故障。中止错误不会被该类型包装，以便调用方继续识别中止语义。
 *
 * @example
 * ```ts
 * try {
 *     await root.run(task);
 * } catch (error) {
 *     if (error instanceof HeadlessEpisodeCleanupError) {
 *         console.error(error.primaryError, error.cleanupError);
 *     }
 * }
 * ```
 */
export class HeadlessEpisodeCleanupError extends Error {
    readonly code = "HEADLESS_EPISODE_CLEANUP_FAILED" as const;

    /** 主执行路径抛出的原始错误。 */
    readonly primaryError: unknown;
    /** Episode 关闭路径抛出的原始错误。 */
    readonly cleanupError: unknown;

    /** @param primaryError 主执行错误；@param cleanupError 关闭错误。 */
    constructor(primaryError: unknown, cleanupError: unknown) {
        super("Headless benchmark episode execution and cleanup both failed", {
            cause: primaryError,
        });
        this.name = "HeadlessEpisodeCleanupError";
        this.primaryError = primaryError;
        this.cleanupError = cleanupError;
    }
}

/**
 * headless 单 task 调用的运行选项。
 *
 * @example
 * ```ts
 * await root.run(task, { signal: controller.signal });
 * ```
 */
export interface HeadlessRunOptions {
    /** 贯穿 Adapter、LLM、Tool 和 Runtime 的调用级中止信号。 */
    readonly signal?: AbortSignal;
}

/**
 * 创建 {@link HeadlessCompositionRoot} 所需的通用依赖。
 *
 * @remarks
 * Root 使用传入的 Profile、LLM、Renderer、Compactor 与 Persistence Adapter 装配
 * 一个独立 task。默认的 Goal/Run ID 生成器使用 UUID，测试可注入确定性生成器。
 *
 * @example
 * ```ts
 * const dependencies: HeadlessCompositionRootDependencies<MyTask, MyOutcome> = {
 *     benchmarkId: "example",
 *     workspaceRoot: process.cwd(),
 *     profile,
 *     llmAdapter,
 *     renderer,
 *     contextCompactor,
 *     adapter,
 *     persistence,
 * };
 * ```
 */
export interface HeadlessCompositionRootDependencies<TTask, TOutcome> {
    /** benchmark 的稳定标识，用于持久化命名空间。 */
    readonly benchmarkId: string;
    /** benchmark 运行使用的工作区根目录。 */
    readonly workspaceRoot: string;
    /** 创建 Goal 时冻结的 Profile。 */
    readonly profile: AgentProfile;
    /**
     * 在首次保存或模型调用前校验当前 Prompt/Memory/Context 组合的适配器。
     */
    readonly protocolValidator?: GoalProtocolValidator;
    /** structured@1 Patch 接受时使用的限制；省略时采用默认限制。 */
    readonly workingMemoryLimits?: WorkingMemoryLimits;
    /** executing 阶段使用的 LLM Adapter。 */
    readonly llmAdapter: LLMAdapter;
    /** 由 Composition Root 创建并共享的 Prompt Renderer。 */
    readonly renderer: PromptBundleRenderer;
    /** 由 Composition Root 创建并共享的上下文裁剪策略。 */
    readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    /** benchmark 任务与环境的领域适配器。 */
    readonly adapter: BenchmarkAdapter<TTask, TOutcome>;
    /** task 到 LazyGoal 持久化 Port 的命名空间适配器。 */
    readonly persistence: BenchmarkPersistenceAdapter<TTask>;
    /** executing Tool 的自动放行或审批策略；省略时默认自动放行。 */
    readonly toolPolicy?: ToolPolicy;
    /** 测试可注入稳定的 Goal ID 生成器。 */
    readonly goalIdGenerator?: () => string;
    /** 测试可注入稳定的 Run ID 生成器。 */
    readonly runIdGenerator?: RunIdGenerator;
}

/**
 * 将一个 benchmark task 装配为完整 headless LazyGoal 执行。
 *
 * @remarks
 * Root 的边界是单 task、单次执行。它经过 Runtime 的 Preparation、Planning、
 * Approval 和 Executing 状态转换，但 Preparation 结果由 task descriptor 确定性
 * 提供，不触发交互式 LLM Preparation。所有 Runtime 组件共享 Persistence Adapter
 * 返回的 Port 实例；Root 不解析 Manifest、环境协议或 benchmark 评分。
 *
 * @example
 * ```ts
 * const root = new HeadlessCompositionRoot(dependencies);
 * const result = await root.run(task);
 * if (result.model.completed) console.log(result.outcome);
 * ```
 */
export class HeadlessCompositionRoot<TTask, TOutcome> {
    private readonly dependencies: HeadlessCompositionRootDependencies<TTask, TOutcome>;

    /** @param dependencies - 单 task headless 运行所需的通用装配依赖。 */
    constructor(
        dependencies: HeadlessCompositionRootDependencies<TTask, TOutcome>,
    ) {
        validateRootDependencies(dependencies);
        this.dependencies = dependencies;
    }

    /**
     * 运行一个 benchmark task，直到 waiting 或 executing 终态。
     *
     * @param task - benchmark 自己定义的任务对象。
     * @param options - 可选调用级中止信号。
     * @returns 包含最新 Goal、Runner 状态、模型完成事实、环境结果和定位器的结果。
     * @throws Adapter、LLM、Runtime 或持久化依赖失败时传播原始异常；中止时传播
     *   `ExecutionAbortedError`。
     */
    async run(
        task: TTask,
        options: HeadlessRunOptions = {},
    ): Promise<HeadlessEpisodeResult<TOutcome>> {
        const control = toExecutionControl(options.signal);
        throwIfAborted(control);
        const descriptor = validateTaskDescriptor(
            this.dependencies.adapter.describeTask(task),
            this.dependencies.profile,
        );
        throwIfAborted(control);
        const goalId = createIdentifier(
            this.dependencies.goalIdGenerator,
            "goal",
        );
        const runId = createIdentifier(
            this.dependencies.runIdGenerator,
            "run",
        );
        const namespace = validateIdentifier(
            this.dependencies.persistence.namespaceFor(task),
            "persistence namespace",
        );
        const bindings = await this.dependencies.persistence.open({
            benchmarkId: this.dependencies.benchmarkId,
            namespace,
            goalId,
            runId,
        });
        throwIfAborted(control);
        validateBindings(bindings);

        let episode: BenchmarkEpisode<TOutcome> | undefined;
        let result: HeadlessEpisodeResult<TOutcome> | undefined;
        let primaryError: unknown;
        let executionFailed = false;

        try {
            episode = await this.dependencies.adapter.createEpisode(task, {
                workspaceRoot: this.dependencies.workspaceRoot,
                profile: this.dependencies.profile,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            });
            throwIfAborted(control);
            validateEpisode(episode);

            const profileRegistry = createSingleProfileRegistry(this.dependencies.profile);
            const preparationExecutor = createDescriptorPreparationExecutor(descriptor);
            const usageRecorder = new UsageRecordingLLMAdapter(this.dependencies.llmAdapter);
            const workingMemoryLimits = this.dependencies.workingMemoryLimits
                ?? DEFAULT_WORKING_MEMORY_LIMITS;
            const checkpointCommitter = new TrajectoryCheckpointCommitter({
                store: bindings.goalStore,
                trajectoryStore: bindings.trajectoryStore,
                ...(bindings.traceSink === undefined ? {} : { traceSink: bindings.traceSink }),
            });
            const trajectoryContextAssembler = new TrajectoryModelContextAssembler({
                trajectoryStore: bindings.trajectoryStore,
                policy: createDefaultModelContextBudgetPolicy(),
            });
            const runner = new Runner({
                store: bindings.goalStore,
                executor: new LLMStepExecutor({
                    adapter: usageRecorder,
                    renderer: this.dependencies.renderer,
                    contextCompactor: this.dependencies.contextCompactor,
                    ...(bindings.traceSink === undefined ? {} : { traceSink: bindings.traceSink }),
                    trajectoryContextAssembler,
                }),
                toolRegistry: episode.registry,
                ...(this.dependencies.toolPolicy === undefined
                    ? {}
                    : { toolPolicy: this.dependencies.toolPolicy }),
                ...(bindings.traceSink === undefined ? {} : { traceSink: bindings.traceSink }),
                trajectoryStore: bindings.trajectoryStore,
                workingMemoryLimits,
                ...(this.dependencies.protocolValidator === undefined
                    ? {}
                    : { protocolValidator: this.dependencies.protocolValidator }),
                checkpointCommitter,
            });
            let runnerResult: RunnerResult | undefined;
            const scheduler = new InlineScheduler({
                runUntilBlocked: async (ref, runOptions, control) => {
                    runnerResult = await runner.runUntilBlocked(ref, runOptions, control);
                    return runnerResult;
                },
            });
            const coordinator = new GoalCoordinator({
                store: bindings.goalStore,
                preparationExecutor,
                scheduler,
                toolRegistry: episode.registry,
                ...(bindings.traceSink === undefined ? {} : { traceSink: bindings.traceSink }),
                trajectoryStore: bindings.trajectoryStore,
                workingMemoryLimits,
                ...(this.dependencies.protocolValidator === undefined
                    ? {}
                    : { protocolValidator: this.dependencies.protocolValidator }),
                checkpointCommitter,
            });
            const ref = { goalId, runId };
            const launched = await launch(
                {
                    goalId,
                    intent: descriptor.intent,
                    profileId: this.dependencies.profile.id,
                    maxSteps: descriptor.maxSteps,
                },
                {
                    profiles: profileRegistry,
                    runIdGenerator: () => runId,
                    store: bindings.goalStore,
                    coordinator,
                    ...(this.dependencies.protocolValidator === undefined
                        ? {}
                        : { protocolValidator: this.dependencies.protocolValidator }),
                    trajectoryStore: bindings.trajectoryStore,
                    ...(bindings.traceSink === undefined ? {} : { traceSink: bindings.traceSink }),
                },
                control,
            );
            const progress = await this.approvePlanning(
                launched,
                coordinator,
                ref,
                options.signal,
            );
            const goal = await bindings.goalStore.restore(goalId);

            if (goal === undefined || goal.state.run.id !== runId) {
                throw new Error("Headless Root could not restore its final Goal");
            }

            result = {
                goal,
                progress,
                runner: runnerResult ?? null,
                model: modelResult(goal, usageRecorder.snapshot()),
                outcome: episode.readOutcome(),
                persistence: bindings.locator,
            };
        } catch (error) {
            executionFailed = true;
            primaryError = error;
        }

        let cleanupError: unknown;
        let cleanupFailed = false;
        if (episode !== undefined) {
            try {
                await episode.close();
            } catch (error) {
                cleanupFailed = true;
                cleanupError = error;
            }
        }

        if (executionFailed) {
            if (cleanupFailed && isExecutionAbortedError(primaryError)) {
                attachCleanupError(primaryError, cleanupError);
            } else if (cleanupFailed) {
                throw new HeadlessEpisodeCleanupError(primaryError, cleanupError);
            }
            throw primaryError;
        }

        if (cleanupFailed) {
            if (result === undefined) {
                throw cleanupError;
            }
            return {
                ...result,
                cleanupError,
            };
        }

        if (result === undefined) {
            throw new Error("Headless Root completed without a result");
        }
        return result;
    }

    private async approvePlanning(
        launched: Awaited<ReturnType<typeof launch>>,
        coordinator: Pick<GoalCoordinator, "resume">,
        ref: { readonly goalId: string; readonly runId: string },
        signal: AbortSignal | undefined,
    ): Promise<GoalProgressResult> {
        if (
            !launched.ok
            || launched.kind !== "waiting"
            || launched.phase !== "planning"
            || launched.waitingFor !== "approval"
        ) {
            if (launched.ok) return launched;
            throw new Error(`${launched.error.code}: ${launched.error.message}`);
        }

        return coordinator.resume(
            {
                ref,
                action: { kind: "approve" },
            },
            toExecutionControl(signal),
        );
    }
}

/**
 * 按最新 Goal Snapshot 的提交边界读取 benchmark task 的 Trajectory。
 *
 * @remarks
 * 该函数只是 LazyGoal 既有读取 Port 的 benchmark 便捷适配，不复制事件分类或
 * 恢复逻辑。`committed` 与 `uncommittedTail` 均为审计读取结果，未提交 tail
 * 不会被 Root 自动 replay。
 *
 * @param bindings - 当前 task 打开的 GoalStore 与 TrajectoryStore。
 * @param query - 目标 Goal/Run 标识及可选序列范围。
 * @returns 以最新有效 Snapshot 的 `committedThroughSequence` 分开的事件。
 * @throws Snapshot 或 Trajectory 读取失败时传播 LazyGoal 原始错误。
 *
 * @example
 * ```ts
 * const view = await readHeadlessTrajectoryAtSnapshot(bindings, {
 *     goalId: "goal-1",
 *     runId: "run-1",
 * });
 * console.log(view.uncommittedTail.length);
 * ```
 */
export function readHeadlessTrajectoryAtSnapshot(
    bindings: Pick<BenchmarkPersistenceBindings, "goalStore" | "trajectoryStore">,
    query: TrajectoryReadQuery,
): Promise<Readonly<TrajectoryReadResult>> {
    return readTrajectoryAtSnapshot(
        bindings.goalStore,
        bindings.trajectoryStore,
        query,
    );
}

function createSingleProfileRegistry(profile: AgentProfile): AgentProfileRegistry {
    return {
        get(profileId) {
            return profileId === profile.id ? profile : undefined;
        },
    };
}

function createDescriptorPreparationExecutor(
    descriptor: Pick<NormalizedBenchmarkTaskDescriptor, "objective" | "completionCriteria">,
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
                        completionCriteria: descriptor.completionCriteria.map(
                            (criterion) => ({
                                text: criterion.text,
                                ...(criterion.acceptance === undefined
                                    ? {}
                                    : {
                                        acceptance: {
                                            expectToolId: criterion.acceptance.expectToolId,
                                            expectOutcome: criterion.acceptance.expectOutcome,
                                        },
                                    }),
                            }),
                        ),
                    },
                    approvalRequest: "Headless benchmark task is ready for execution.",
                };
            }

            throw new Error("Headless preparation was called after executing began");
        },
    };
}

/**
 * 包装注入的 LLM Adapter,在每次成功调用后累计 run 级归一化用量。
 *
 * @remarks
 * 只观察响应中的 `providerMetadata.usage`,不修改请求与响应语义;调用失败
 * 或中止时异常原样传播且不记录用量。求和超出安全整数后停止累加并保留
 * 最后一次合法值。
 */
class UsageRecordingLLMAdapter implements LLMAdapter {
    readonly structuredOutputMode: LLMAdapter["structuredOutputMode"];
    private readonly inner: LLMAdapter;
    private inputTokens = 0;
    private outputTokens = 0;
    private missingCalls = 0;
    private calls = 0;
    private frozen = false;

    constructor(inner: LLMAdapter) {
        this.inner = inner;
        this.structuredOutputMode = inner.structuredOutputMode;
    }

    async generate(
        request: LLMRequest,
        control?: ExecutionControl,
    ): Promise<LLMResponse> {
        const response = await this.inner.generate(request, control);
        this.record(readNormalizedUsage(response.providerMetadata));
        return response;
    }

    /** @returns run 级聚合用量;未发生任何模型调用时为 `undefined`。 */
    snapshot(): HeadlessModelUsage | undefined {
        if (this.calls === 0) return undefined;
        return {
            inputTokens: this.inputTokens,
            outputTokens: this.outputTokens,
            missingCalls: this.missingCalls,
        };
    }

    private record(usage: NormalizedUsage | undefined): void {
        this.calls += 1;
        if (usage === undefined) {
            this.missingCalls += 1;
            return;
        }
        if (this.frozen) return;
        const inputTokens = this.inputTokens + usage.inputTokens;
        const outputTokens = this.outputTokens + usage.outputTokens;
        if (
            !Number.isSafeInteger(inputTokens)
            || !Number.isSafeInteger(outputTokens)
        ) {
            this.frozen = true;
            return;
        }
        this.inputTokens = inputTokens;
        this.outputTokens = outputTokens;
    }
}

function modelResult(
    goal: Goal,
    usage: HeadlessModelUsage | undefined,
): HeadlessModelResult {
    const lastStep = goal.state.run.lastStep;
    return {
        runStatus: goal.state.run.status,
        completed: lastStep?.kind === "decision"
            && lastStep.result.kind === "complete",
        ...(usage === undefined ? {} : { usage }),
    };
}

function toExecutionControl(
    signal: AbortSignal | undefined,
): ExecutionControl | undefined {
    return signal === undefined ? undefined : { signal };
}

function validateRootDependencies<TTask, TOutcome>(
    dependencies: HeadlessCompositionRootDependencies<TTask, TOutcome>,
): void {
    validateIdentifier(dependencies.benchmarkId, "benchmarkId");
    validateIdentifier(dependencies.workspaceRoot, "workspaceRoot");
    validateIdentifier(dependencies.profile.id, "profile.id");
    if (dependencies.protocolValidator !== undefined) {
        dependencies.protocolValidator.validate({
            promptBundleVersion: 1,
            memoryProtocol: { kind: "structured", version: 1 },
            modelContextProtocol: { kind: "trajectory-layered", version: 1 },
            contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        });
    }
}

/**
 * 校验并规范化后的 Benchmark 任务描述。
 *
 * @remarks
 * 所有完成条件均归一化为 {@link CompletionCriterion} 结构化对象。
 */
export interface NormalizedBenchmarkTaskDescriptor {
    /** 任务意图。 */
    readonly intent: string;
    /** 任务目标。 */
    readonly objective: string;
    /** 规范化后的结构化完成条件列表。 */
    readonly completionCriteria: readonly CompletionCriterion[];
    /** executing 阶段允许的最大 Step 数。 */
    readonly maxSteps: number;
}

/**
 * 校验并规范化 BenchmarkTaskDescriptor。
 *
 * @remarks
 * 验证 descriptor 各字段合法性。完成条件列表中的纯文本字符串会被自动归一化为
 * `{ text: criterion }`；结构化条件会严格检查 `text` 非空及可选 `acceptance` 的字段取值。
 * 若提供了 `profile`，声明的 `expectToolId` 必须属于 `profile.toolIds`，否则抛出 `TypeError`，
 * 防止未授权工具导致任务永无法完成。
 *
 * @param descriptor - 待校验的原始任务描述。
 * @param profile - 当前运行冻结的 AgentProfile，用于校验验收工具授权。
 * @returns 规范化后的任务描述，所有 completionCriteria 均为 {@link CompletionCriterion}。
 * @throws 当 descriptor 非法、缺少必要字段、包含未授权工具或非法验收形态时抛出 `TypeError` 或 `RangeError`。
 *
 * @example
 * ```ts
 * const normalized = validateTaskDescriptor({
 *     intent: "运行测试",
 *     objective: "测试通过",
 *     completionCriteria: [
 *         "输出通过",
 *         { text: "命令执行成功", acceptance: { expectToolId: "bash", expectOutcome: "success" } },
 *     ],
 *     maxSteps: 5,
 * });
 * ```
 */
export function validateTaskDescriptor(
    descriptor: BenchmarkTaskDescriptor,
    profile?: AgentProfile,
): NormalizedBenchmarkTaskDescriptor {
    if (!descriptor || typeof descriptor !== "object") {
        throw new TypeError("Benchmark adapter returned an invalid task descriptor");
    }
    const intent = validateIdentifier(descriptor.intent, "task descriptor intent");
    const objective = validateIdentifier(descriptor.objective, "task descriptor objective");
    if (
        !Array.isArray(descriptor.completionCriteria)
        || descriptor.completionCriteria.length === 0
    ) {
        throw new TypeError("task descriptor completionCriteria must be non-empty text values");
    }
    const normalizedCriteria: CompletionCriterion[] = [];
    for (const criterion of descriptor.completionCriteria) {
        if (typeof criterion === "string") {
            if (criterion.trim().length === 0) {
                throw new TypeError("task descriptor completionCriteria must be non-empty text values");
            }
            normalizedCriteria.push({ text: criterion });
        } else if (typeof criterion === "object" && criterion !== null) {
            if (typeof criterion.text !== "string" || criterion.text.trim().length === 0) {
                throw new TypeError("task descriptor completionCriteria text must be non-empty text");
            }
            if (criterion.acceptance !== undefined) {
                if (typeof criterion.acceptance !== "object" || criterion.acceptance === null) {
                    throw new TypeError("task descriptor completion criterion acceptance must be an object");
                }
                const { expectToolId, expectOutcome } = criterion.acceptance;
                if (typeof expectToolId !== "string" || expectToolId.trim().length === 0) {
                    throw new TypeError("task descriptor completion criterion acceptance expectToolId must be non-empty text");
                }
                if (expectOutcome !== "success" && expectOutcome !== "failure") {
                    throw new TypeError("task descriptor completion criterion acceptance expectOutcome must be \"success\" or \"failure\"");
                }
                if (profile !== undefined && !profile.toolIds.includes(expectToolId)) {
                    throw new TypeError(`task descriptor completion criterion requires tool "${expectToolId}" not present in agent profile`);
                }
                normalizedCriteria.push({
                    text: criterion.text,
                    acceptance: {
                        expectToolId,
                        expectOutcome,
                    },
                });
            } else {
                normalizedCriteria.push({ text: criterion.text });
            }
        } else {
            throw new TypeError("task descriptor completionCriteria must be non-empty text values or CompletionCriterion objects");
        }
    }
    if (!Number.isSafeInteger(descriptor.maxSteps) || descriptor.maxSteps < 0) {
        throw new RangeError("task descriptor maxSteps must be a non-negative safe integer");
    }
    return {
        intent,
        objective,
        completionCriteria: normalizedCriteria,
        maxSteps: descriptor.maxSteps,
    };
}

function validateBindings(
    bindings: BenchmarkPersistenceBindings,
): void {
    if (!bindings || typeof bindings !== "object") {
        throw new TypeError("Persistence adapter returned invalid bindings");
    }
    if (
        typeof bindings.goalStore?.save !== "function"
        || typeof bindings.goalStore.restore !== "function"
    ) {
        throw new TypeError("Persistence bindings must provide a GoalStore");
    }
    if (
        typeof bindings.trajectoryStore?.append !== "function"
        || typeof bindings.trajectoryStore.read !== "function"
        || typeof bindings.trajectoryStore.readWithBoundary !== "function"
    ) {
        throw new TypeError("Persistence bindings must provide a TrajectoryStore");
    }
    if (!bindings.locator || typeof bindings.locator !== "object") {
        throw new TypeError("Persistence bindings must provide a locator");
    }
    validateIdentifier(bindings.locator.goalSnapshot, "goalSnapshot locator");
    validateIdentifier(bindings.locator.trajectory, "trajectory locator");
    if (bindings.locator.diagnosticTrace !== undefined) {
        validateIdentifier(bindings.locator.diagnosticTrace, "diagnosticTrace locator");
    }
    if (
        bindings.traceSink !== undefined
        && typeof bindings.traceSink.append !== "function"
    ) {
        throw new TypeError("Persistence bindings traceSink must provide append");
    }
    if (
        (bindings.traceSink === undefined)
        !== (bindings.locator.diagnosticTrace === undefined)
    ) {
        throw new TypeError("Trace sink and diagnosticTrace locator must be enabled together");
    }
}

function validateEpisode<TOutcome>(
    episode: BenchmarkEpisode<TOutcome>,
): void {
    if (!episode || typeof episode !== "object") {
        throw new TypeError("Benchmark adapter returned invalid Episode");
    }
    if (
        !episode.registry
        || typeof episode.registry.get !== "function"
        || typeof episode.readOutcome !== "function"
        || typeof episode.close !== "function"
    ) {
        throw new TypeError("Benchmark Episode must provide readOutcome and close");
    }
}

function attachCleanupError(
    error: unknown,
    cleanupError: unknown,
): void {
    if (typeof error !== "object" || error === null) return;
    Object.defineProperty(error, "cleanupError", {
        configurable: true,
        enumerable: false,
        value: cleanupError,
        writable: false,
    });
}

function createIdentifier(
    factory: (() => string) | undefined,
    kind: string,
): string {
    return validateIdentifier(factory?.() ?? randomUUID(), `${kind} id`);
}

function validateIdentifier(value: string, field: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new TypeError(`${field} must be non-empty text`);
    }
    return value;
}
