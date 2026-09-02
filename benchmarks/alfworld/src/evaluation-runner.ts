import { join } from "node:path";

import type {
    ContextCompactor,
    LLMAdapter,
    ModelConversationMessage,
    PromptBundleRenderer,
} from "../../../packages/agent/src/index.js";
import { createDefaultPromptBundleProtocolValidator } from "../../../packages/agent/src/index.js";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    type AgentProfile,
    type RunnerResult,
    type ToolPolicy,
} from "../../../packages/runtime/src/index.js";
import {
    HeadlessCompositionRoot,
    HeadlessEpisodeCleanupError,
    type HeadlessCompositionRootDependencies,
} from "../../src/headless-composition-root.js";
import { JsonFileBenchmarkPersistenceAdapter } from "../../src/file-persistence-adapter.js";
import type {
    AlfworldManifest,
    AlfworldManifestTask,
} from "./manifest.js";
import {
    SidecarError,
    type SidecarClient,
} from "./sidecar-client.js";
import { AlfworldBenchmarkAdapter } from "./alfworld-adapter.js";
import {
    aggregateEvaluationReport,
    createEpisodeAttempt,
    type EpisodeEnvironmentFacts,
    type EpisodeExecutionFacts,
    type EpisodeFailureCategory,
    type EpisodeAttempt,
    type EvaluationReport,
    type EvaluationReportMetadata,
} from "./report.js";

/**
 * 一个评测任务在当前尝试中的执行上下文。
 *
 * @example
 * ```ts
 * const context: EpisodeExecutionContext = {
 *   task, profile,
 * };
 * ```
 */
export interface EpisodeExecutionContext {
    readonly task: AlfworldManifestTask;
    readonly profile: AgentProfile;
    readonly signal?: AbortSignal;
}

/**
 * 评测器使用的 Episode 执行函数；实现可以注入真实 Runner 或测试替身。
 *
 * @example
 * ```ts
 * const executeEpisode: EpisodeExecutor = async () => execution;
 * ```
 */
export type EpisodeExecutor = (
    context: EpisodeExecutionContext,
) => Promise<EpisodeExecutionFacts>;

/**
 * EvaluationRunner 的依赖。
 *
 * @remarks
 * `executeEpisode` 是唯一需要接触 sidecar 的边界；Runner、GoalStore 和 LLM
 * 的组合由 `createAlfworldEpisodeExecutor` 提供。这样报告聚合可以在没有 Conda
 * 或模型凭据的测试中独立验证。
 *
 * @example
 * ```ts
 * const dependencies: EvaluationRunnerDependencies = {
 *   metadata,
 *   executeEpisode: async () => fakeExecution,
 * };
 * const runner = new EvaluationRunner(dependencies);
 * ```
 */
export interface EvaluationRunnerDependencies {
    readonly metadata: EvaluationReportMetadata;
    readonly executeEpisode: EpisodeExecutor;
    /** 每个任务允许的基础设施重试次数，默认不重试。 */
    readonly maxInfrastructureRetries?: number;
    /** 测试可注入单调时钟；默认使用 `Date.now`。 */
    readonly now?: () => number;
}

/**
 * 顺序运行固定 Manifest 并聚合独立评测报告。
 *
 * @remarks
 * 成功只由 Episode 环境事实中的 `won=true` 决定。基础设施重试会创建新的
 * `EpisodeAttempt`，原始失败记录永远保留；模型 `complete` 不会覆盖环境失败。
 *
 * @example
 * ```ts
 * const evaluator = new EvaluationRunner({ metadata, executeEpisode });
 * const report = await evaluator.run();
 * ```
 */
export class EvaluationRunner {
    private readonly metadata: EvaluationReportMetadata;
    private readonly executeEpisode: EpisodeExecutor;
    private readonly maxInfrastructureRetries: number;
    private readonly now: () => number;

    /** @param dependencies - 报告元数据、Episode 执行边界和重试策略。 */
    constructor(dependencies: EvaluationRunnerDependencies) {
        const maxRetries = dependencies.maxInfrastructureRetries ?? 0;
        if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) {
            throw new RangeError("maxInfrastructureRetries must be a non-negative integer");
        }
        this.metadata = dependencies.metadata;
        this.executeEpisode = dependencies.executeEpisode;
        this.maxInfrastructureRetries = maxRetries;
        this.now = dependencies.now ?? Date.now;
    }

    /**
     * 按清单顺序运行全部任务。
     *
     * @param signal - 可选评测级中止信号；中止时不伪造当前任务成功记录。
     * @returns 包含全部已完成尝试的机器可读报告。
     * @throws 中止信号触发时抛出 `ExecutionAbortedError`；报告聚合错误原样传播。
     */
    async run(signal?: AbortSignal): Promise<EvaluationReport> {
        const attempts: EpisodeAttempt[] = [];

        for (const task of this.metadata.manifest.tasks) {
            throwIfEvaluationAborted(signal);
            let retrySequence = 0;

            while (true) {
                const startedAt = this.now();
                let execution: EpisodeExecutionFacts;

                try {
                    execution = await this.executeEpisode({
                        task,
                        profile: this.metadata.profile,
                        ...(signal === undefined ? {} : { signal }),
                    });
                    throwIfEvaluationAborted(signal);
                } catch (error) {
                    if (isExecutionAbortedError(error) || signal?.aborted === true) {
                        throw new ExecutionAbortedError();
                    }
                    execution = failureExecution(error);
                }

                const attempt = createEpisodeAttempt(
                    task,
                    this.metadata,
                    execution,
                    retrySequence,
                    this.now() - startedAt,
                );
                attempts.push(attempt);

                if (
                    execution.failure !== undefined
                    && isRetryableFailure(execution.failure.category)
                    && retrySequence < this.maxInfrastructureRetries
                ) {
                    retrySequence += 1;
                    continue;
                }

                break;
            }
        }

        return aggregateEvaluationReport(this.metadata, attempts);
    }
}

/**
 * ALFWorld Episode 执行器的 Composition Root 依赖。
 *
 * @remarks
 * 单 task 的 Goal、Runner、Snapshot、Trajectory 和 Episode 生命周期由通用
 * `HeadlessCompositionRoot` 组装；此接口只保留 ALFWorld evaluator 需要注入的
 * Profile、LLM、Sidecar 工厂和文件持久化根目录。`createClient` 必须返回只服务
 * 当前 Manifest task 的 sidecar 客户端。
 *
 * @example
 * ```ts
 * const dependencies: AlfworldEpisodeExecutorDependencies = {
 *   profile, adapter, renderer, contextCompactor,
 *   workspaceRoot, createClient,
 * };
 * ```
 */
export interface AlfworldEpisodeExecutorDependencies {
    readonly profile: AgentProfile;
    readonly adapter: LLMAdapter;
    readonly renderer: PromptBundleRenderer;
    readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    readonly workspaceRoot: string;
    readonly createClient: (
        task: AlfworldManifestTask,
    ) => Pick<SidecarClient, "reset" | "step" | "close">;
    /** Benchmark Goal/Trajectory/Trace 文件的根目录；省略时使用 workspace 下的默认目录。 */
    readonly persistenceRoot?: string;
    /** 是否写入每个 task 的 Diagnostic Trace 文件；默认关闭。 */
    readonly enableTrace?: boolean;
    readonly goalIdFactory?: () => string;
    readonly runIdFactory?: () => string;
}

/** 评测自动放行已注册且已由 Profile 授权的 Tool。 */
export const ALLOW_EVALUATION_TOOLS: ToolPolicy = {
    evaluate: () => "allow",
};

/**
 * 创建委托通用 Headless Root 的 ALFWorld Episode 执行器。
 *
 * @remarks
 * Root 负责完整 LazyGoal 生命周期与持久化；该边界只把 ALFWorld Manifest task、
 * Sidecar 会话和四个授权 Tool 转换为 Episode，并把 Root 的 Runtime 结果映射回
 * evaluator 使用的环境事实、模型事实和失败分类。`won` 不在此处或 Root 中解释，
 * 仍由 `EvaluationRunner` 的报告逻辑判定成功。
 *
 * @param dependencies - LLM、Profile、Sidecar 工厂和 benchmark 持久化配置。
 * @returns 可直接注入 `EvaluationRunner` 的单 task 执行函数。
 * @throws 依赖配置无效时抛出异常；单 task 的运行或持久化错误由返回函数传播。
 * @example
 * ```ts
 * const executeEpisode = createAlfworldEpisodeExecutor({
 *   profile, adapter, renderer,
 *   contextCompactor, workspaceRoot, createClient,
 * });
 * ```
 */
export function createAlfworldEpisodeExecutor(
    dependencies: AlfworldEpisodeExecutorDependencies,
): EpisodeExecutor {
    const benchmarkAdapter = new AlfworldBenchmarkAdapter({
        workspaceRoot: dependencies.workspaceRoot,
        createClient: dependencies.createClient,
    });
    const persistence = new JsonFileBenchmarkPersistenceAdapter<AlfworldManifestTask>({
        rootDirectory: dependencies.persistenceRoot
            ?? join(dependencies.workspaceRoot, ".lazygoal", "benchmarks"),
        namespaceFor: (task) => task.taskId,
        enableTrace: dependencies.enableTrace ?? false,
    });
    const rootDependencies: HeadlessCompositionRootDependencies<
        AlfworldManifestTask,
        EpisodeEnvironmentFacts
    > = {
        benchmarkId: "alfworld",
        workspaceRoot: dependencies.workspaceRoot,
        profile: dependencies.profile,
        llmAdapter: dependencies.adapter,
        renderer: dependencies.renderer,
        contextCompactor: dependencies.contextCompactor,
        adapter: benchmarkAdapter,
        persistence,
        toolPolicy: ALLOW_EVALUATION_TOOLS,
        protocolValidator: createDefaultPromptBundleProtocolValidator(),
        ...(dependencies.goalIdFactory === undefined
            ? {}
            : { goalIdGenerator: dependencies.goalIdFactory }),
        ...(dependencies.runIdFactory === undefined
            ? {}
            : { runIdGenerator: dependencies.runIdFactory }),
    };
    const root = new HeadlessCompositionRoot(rootDependencies);

    return async (context) => {
        if (context.profile.id !== dependencies.profile.id) {
            throw new Error("Episode Profile does not match the assembled evaluation Profile");
        }
        const result = await root.run(
            context.task,
            context.signal === undefined ? {} : { signal: context.signal },
        );
        const failure = failureFromHeadlessResult(result);
        return {
            environment: result.outcome,
            model: result.model,
            ...(failure === undefined ? {} : { failure }),
        };
    };
}

function failureFromHeadlessResult(
    result: Awaited<ReturnType<HeadlessCompositionRoot<
        AlfworldManifestTask,
        EpisodeEnvironmentFacts
    >["run"]>>,
): EpisodeExecutionFacts["failure"] {
    if (result.cleanupError !== undefined) {
        return failureDescriptor(result.cleanupError);
    }
    if (!result.progress.ok) {
        return {
            category: "infrastructure",
            code: result.progress.error.code,
        };
    }
    if (result.runner !== null) {
        return failureFromRunnerResult(result.runner);
    }
    return undefined;
}

function failureFromRunnerResult(
    result: RunnerResult,
): EpisodeExecutionFacts["failure"] {
    if (!result.ok) {
        return {
            category: "infrastructure",
            code: result.error.code,
        };
    }

    const stopReason = result.state.stopReason;
    if (stopReason?.kind === "execution_error") {
        return {
            category: "infrastructure",
            code: stopReason.code,
        };
    }
    if (stopReason?.kind === "max_steps_exceeded") {
        return { category: "task_not_won", code: "MAX_STEPS_EXCEEDED" };
    }
    return result.state.status === "failed"
        ? { category: "task_not_won", code: "MODEL_FAILED" }
        : undefined;
}

function failureExecution(error: unknown): EpisodeExecutionFacts {
    const failure = failureDescriptor(error);
    return {
        environment: {
            done: false,
            won: false,
            steps: 0,
            goalConditionSuccessRate: 0,
        },
        model: { runStatus: null, completed: false },
        failure,
    };
}

function failureDescriptor(error: unknown): NonNullable<EpisodeExecutionFacts["failure"]> {
    if (error instanceof HeadlessEpisodeCleanupError) {
        return failureDescriptor(error.primaryError);
    }
    if (error instanceof SidecarError) {
        const category: EpisodeFailureCategory = error.code === "TIMEOUT"
            ? "timeout"
            : error.code === "PROTOCOL_ERROR"
                ? "protocol"
                : error.code === "ABORTED"
                    ? "aborted"
                    : "infrastructure";
        return { category, code: error.code };
    }
    if (error instanceof ExecutionAbortedError) return { category: "aborted" };
    return {
        category: "infrastructure",
        code: error instanceof Error && error.name.length > 0 ? error.name : "ERROR",
    };
}

function isRetryableFailure(category: EpisodeFailureCategory): boolean {
    return category === "infrastructure"
        || category === "protocol"
        || category === "timeout";
}

function throwIfEvaluationAborted(signal?: AbortSignal): void {
    if (signal?.aborted === true) throw new ExecutionAbortedError();
}
