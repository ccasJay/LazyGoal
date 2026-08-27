import { randomUUID } from "node:crypto";

import type {
    ContextCompactor,
    LLMAdapter,
    ModelConversationMessage,
    PromptBundleRenderer,
} from "../../packages/agent/src/index.js";
import {
    GoalCoordinator,
    InlineScheduler,
    launch,
    Runner,
    type AgentProfile,
    type AgentProfileRegistry,
    type ExecutionControl,
    type Goal,
    type GoalProgressResult,
    type GoalStore,
    type PreparationExecutor,
    type RunIdGenerator,
    type RunnerResult,
    type ToolPolicy,
    type ToolRegistry,
    type TrajectoryStore,
    type DiagnosticTraceSink,
} from "../../packages/runtime/src/index.js";
import { LLMStepExecutor } from "../../packages/agent/src/index.js";

/**
 * Benchmark 任务转换后的通用 Goal 描述。
 *
 * @remarks
 * 该描述只包含 LazyGoal 构造 Goal 所需的通用字段，不应携带 benchmark 专用
 * Manifest、环境句柄或评分结果。`maxSteps` 直接冻结到 Goal 的执行策略中。
 *
 * @example
 * ```ts
 * const descriptor: BenchmarkTaskDescriptor = {
 *     intent: "完成一个算术任务",
 *     objective: "返回正确的计算结果",
 *     completionCriteria: ["环境确认答案正确"],
 *     maxSteps: 10,
 * };
 * ```
 */
export interface BenchmarkTaskDescriptor {
    /** 创建 Goal 时保存的原始任务意图。 */
    readonly intent: string;
    /** 批准后冻结到 Goal 的任务目标。 */
    readonly objective: string;
    /** 批准后冻结到 Goal 的可验证完成条件。 */
    readonly completionCriteria: readonly string[];
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
 * Headless Root 的模型完成事实。
 *
 * @example
 * ```ts
 * const model: HeadlessModelResult = {
 *     runStatus: "completed",
 *     completed: true,
 * };
 * ```
 */
export interface HeadlessModelResult {
    /** 最终 Run 状态；Root 不将其解释为 benchmark 成功。 */
    readonly runStatus: Goal["state"]["run"]["status"];
    /** 最后一个 Decision 是否为 `complete`。 */
    readonly completed: boolean;
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
 *     promptBundleVersion: 3,
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
    /** 创建 Goal 时冻结的 Prompt Bundle 版本。 */
    readonly promptBundleVersion: number;
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
        const descriptor = validateTaskDescriptor(
            this.dependencies.adapter.describeTask(task),
        );
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
        validateBindings(bindings);

        let episode: BenchmarkEpisode<TOutcome> | undefined;

        try {
            episode = await this.dependencies.adapter.createEpisode(task, {
                workspaceRoot: this.dependencies.workspaceRoot,
                profile: this.dependencies.profile,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            });
            validateEpisode(episode);

            const profileRegistry = createSingleProfileRegistry(this.dependencies.profile);
            const preparationExecutor = createDescriptorPreparationExecutor(descriptor);
            const runner = new Runner({
                store: bindings.goalStore,
                executor: new LLMStepExecutor({
                    adapter: this.dependencies.llmAdapter,
                    renderer: this.dependencies.renderer,
                    contextCompactor: this.dependencies.contextCompactor,
                    ...(bindings.traceSink === undefined ? {} : { traceSink: bindings.traceSink }),
                }),
                toolRegistry: episode.registry,
                ...(this.dependencies.toolPolicy === undefined
                    ? {}
                    : { toolPolicy: this.dependencies.toolPolicy }),
                trajectorySink: bindings.trajectoryStore,
                ...(bindings.traceSink === undefined ? {} : { traceSink: bindings.traceSink }),
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
                trajectorySink: bindings.trajectoryStore,
                ...(bindings.traceSink === undefined ? {} : { traceSink: bindings.traceSink }),
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
                    promptBundleVersion: this.dependencies.promptBundleVersion,
                    trajectorySink: bindings.trajectoryStore,
                    ...(bindings.traceSink === undefined ? {} : { traceSink: bindings.traceSink }),
                },
                toExecutionControl(options.signal),
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

            return {
                goal,
                progress,
                runner: runnerResult ?? null,
                model: modelResult(goal),
                outcome: episode.readOutcome(),
                persistence: bindings.locator,
            };
        } finally {
            if (episode !== undefined) {
                await episode.close();
            }
        }
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

function createSingleProfileRegistry(profile: AgentProfile): AgentProfileRegistry {
    return {
        get(profileId) {
            return profileId === profile.id ? profile : undefined;
        },
    };
}

function createDescriptorPreparationExecutor(
    descriptor: BenchmarkTaskDescriptor,
): PreparationExecutor {
    return {
        async execute(goal) {
            if (goal.state.workflow.phase === "gathering_context") {
                return { kind: "context_ready" };
            }

            if (goal.state.workflow.phase === "planning") {
                return {
                    kind: "task_proposal",
                    task: {
                        objective: descriptor.objective,
                        completionCriteria: [...descriptor.completionCriteria],
                    },
                    approvalRequest: "Headless benchmark task is ready for execution.",
                };
            }

            throw new Error("Headless preparation was called after executing began");
        },
    };
}

function modelResult(goal: Goal): HeadlessModelResult {
    const lastStep = goal.state.run.lastStep;
    return {
        runStatus: goal.state.run.status,
        completed: lastStep?.kind === "decision"
            && lastStep.result.kind === "complete",
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
    if (
        !Number.isSafeInteger(dependencies.promptBundleVersion)
        || dependencies.promptBundleVersion <= 0
    ) {
        throw new RangeError("promptBundleVersion must be a positive safe integer");
    }
}

function validateTaskDescriptor(
    descriptor: BenchmarkTaskDescriptor,
): BenchmarkTaskDescriptor {
    if (!descriptor || typeof descriptor !== "object") {
        throw new TypeError("Benchmark adapter returned an invalid task descriptor");
    }
    const intent = validateIdentifier(descriptor.intent, "task descriptor intent");
    const objective = validateIdentifier(descriptor.objective, "task descriptor objective");
    if (
        !Array.isArray(descriptor.completionCriteria)
        || descriptor.completionCriteria.length === 0
        || descriptor.completionCriteria.some(
            (criterion) => typeof criterion !== "string" || criterion.trim().length === 0,
        )
    ) {
        throw new TypeError("task descriptor completionCriteria must be non-empty text values");
    }
    if (!Number.isSafeInteger(descriptor.maxSteps) || descriptor.maxSteps < 0) {
        throw new RangeError("task descriptor maxSteps must be a non-negative safe integer");
    }
    return {
        intent,
        objective,
        completionCriteria: [...descriptor.completionCriteria],
        maxSteps: descriptor.maxSteps,
    };
}

function validateBindings(
    bindings: BenchmarkPersistenceBindings,
): void {
    if (!bindings || typeof bindings !== "object") {
        throw new TypeError("Persistence adapter returned invalid bindings");
    }
    validateIdentifier(bindings.locator.goalSnapshot, "goalSnapshot locator");
    validateIdentifier(bindings.locator.trajectory, "trajectory locator");
    if (bindings.locator.diagnosticTrace !== undefined) {
        validateIdentifier(bindings.locator.diagnosticTrace, "diagnosticTrace locator");
    }
}

function validateEpisode<TOutcome>(
    episode: BenchmarkEpisode<TOutcome>,
): void {
    if (!episode || typeof episode !== "object") {
        throw new TypeError("Benchmark adapter returned invalid Episode");
    }
    if (typeof episode.readOutcome !== "function" || typeof episode.close !== "function") {
        throw new TypeError("Benchmark Episode must provide readOutcome and close");
    }
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
