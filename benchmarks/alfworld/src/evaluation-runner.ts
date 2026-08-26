import { randomUUID } from "node:crypto";

import type {
    ContextCompactor,
    LLMAdapter,
    ModelConversationMessage,
    PromptBundleRenderer,
} from "../../../packages/agent/src/index.js";
import {
    LLMStepExecutor,
} from "../../../packages/agent/src/index.js";
import {
    createGoal,
    ExecutionAbortedError,
    isExecutionAbortedError,
    Runner,
    type AgentProfile,
    type ExecutionControl,
    type Goal,
    type RunnerDependencies,
    type RunnerResult,
    type ToolPolicy,
} from "../../../packages/runtime/src/index.js";
import { InMemoryGoalStore } from "../../../packages/storage/src/index.js";
import type {
    AlfworldManifest,
    AlfworldManifestTask,
} from "./manifest.js";
import {
    createAlfworldToolSet,
} from "./alfworld-tools.js";
import {
    SidecarError,
    type SidecarClient,
    type SidecarStepResult,
    type SidecarTask,
} from "./sidecar-client.js";
import {
    aggregateEvaluationReport,
    createEpisodeAttempt,
    type EpisodeEnvironmentFacts,
    type EpisodeExecutionFacts,
    type EpisodeFailureCategory,
    type EpisodeAttempt,
    type EpisodeModelFacts,
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
 * 的组合由 `createRunnerEpisodeExecutor` 提供。这样报告聚合可以在没有 Conda
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
        if (!Number.isSafeInteger(dependencies.metadata.promptBundleVersion)
            || dependencies.metadata.promptBundleVersion <= 0) {
            throw new RangeError("promptBundleVersion must be a positive integer");
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
 * 创建使用现有 `LLMStepExecutor` 与 Runtime `Runner` 的 Episode 执行器。
 *
 * @remarks
 * 每次调用创建新的内存 GoalStore、ToolRegistry 和 ALFWorld 会话；Runner 只
 * 看到 Profile 授权的基础 Tool 与专用环境 Tool。`createClient` 必须返回任务级
 * sidecar 客户端，调用结束后由执行器关闭。
 *
 * @example
 * ```ts
 * const executeEpisode = createRunnerEpisodeExecutor({
 *   profile, promptBundleVersion: 3, adapter, renderer,
 *   contextCompactor, workspaceRoot, createClient,
 * });
 * ```
 */
export function createRunnerEpisodeExecutor(
    dependencies: RunnerEpisodeExecutorDependencies,
): EpisodeExecutor {
    return async (context) => {
        if (context.profile.id !== dependencies.profile.id) {
            throw new Error("Episode Profile does not match the assembled evaluation Profile");
        }
        const environment: EpisodeEnvironmentFacts = {
            done: false,
            won: false,
            steps: 0,
            goalConditionSuccessRate: 0,
        };
        let latestEnvironment = environment;
        const client = dependencies.createClient(context.task);
        const trackingClient: Pick<SidecarClient, "reset" | "step" | "close"> = {
            reset: async (task, signal) => {
                const result = await client.reset(task, signal);
                latestEnvironment = {
                    done: false,
                    won: false,
                    steps: 0,
                    goalConditionSuccessRate: 0,
                };
                return result;
            },
            step: async (command, signal): Promise<SidecarStepResult> => {
                const result = await client.step(command, signal);
                latestEnvironment = {
                    done: result.done,
                    won: result.won,
                    steps: latestEnvironment.steps + 1,
                    goalConditionSuccessRate: result.goalConditionSuccessRate,
                };
                return result;
            },
            close: () => client.close(),
        };
        const toolSet = createAlfworldToolSet(
            dependencies.workspaceRoot,
            toSidecarTask(context.task),
            trackingClient,
        );
        const store = new InMemoryGoalStore();
        const runnerDependencies: RunnerDependencies = {
            store,
            executor: new LLMStepExecutor({
                adapter: dependencies.adapter,
                renderer: dependencies.renderer,
                contextCompactor: dependencies.contextCompactor,
            }),
            toolRegistry: toolSet.registry,
            toolPolicy: ALLOW_EVALUATION_TOOLS,
        };
        const runner = dependencies.createRunner?.(runnerDependencies)
            ?? new Runner(runnerDependencies);
        const goal = createExecutingGoal(
            { ...context, profile: dependencies.profile },
            dependencies.promptBundleVersion,
            dependencies.goalIdFactory?.() ?? randomUUID(),
            dependencies.runIdFactory?.() ?? randomUUID(),
        );
        await store.save(goal);

        let model: EpisodeModelFacts = { runStatus: null, completed: false };
        let failure: EpisodeExecutionFacts["failure"];

        try {
            const control = context.signal === undefined
                ? undefined
                : { signal: context.signal } satisfies ExecutionControl;
            const result = await runner.run(
                { goalId: goal.id, runId: goal.state.run.id },
                {},
                control,
            );
            model = modelFactsFromResult(result);
            failure = failureFromRunnerResult(result);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            failure = failureDescriptor(error);
        } finally {
            try {
                await toolSet.session.close();
            } catch (error) {
                if (failure === undefined) failure = failureDescriptor(error);
            }
        }

        return {
            environment: latestEnvironment,
            model,
            ...(failure === undefined ? {} : { failure }),
        };
    };
}

/**
 * 真实 Runner Episode 执行器的依赖；LLM 与 sidecar 均由 Composition Root 注入。
 *
 * @example
 * ```ts
 * const dependencies: RunnerEpisodeExecutorDependencies = {
 *   profile, promptBundleVersion: 3, adapter, renderer, contextCompactor,
 *   workspaceRoot, createClient,
 * };
 * ```
 */
export interface RunnerEpisodeExecutorDependencies {
    readonly profile: AgentProfile;
    readonly promptBundleVersion: number;
    readonly adapter: LLMAdapter;
    readonly renderer: PromptBundleRenderer;
    readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    readonly workspaceRoot: string;
    readonly createClient: (
        task: AlfworldManifestTask,
    ) => Pick<SidecarClient, "reset" | "step" | "close">;
    readonly createRunner?: (
        dependencies: RunnerDependencies,
    ) => Pick<Runner, "run">;
    readonly goalIdFactory?: () => string;
    readonly runIdFactory?: () => string;
}

/** 评测自动放行已注册且已由 Profile 授权的 Tool。 */
export const ALLOW_EVALUATION_TOOLS: ToolPolicy = {
    evaluate: () => "allow",
};

/**
 * 为一个 Manifest 任务构造已完成 Preparation 的 executing Goal。
 *
 * @param context - 当前任务和已校验 Profile。
 * @param promptBundleVersion - 冻结到 Goal 的 Prompt Bundle 版本。
 * @param goalId - Goal 稳定标识。
 * @param runId - Run 稳定标识。
 * @returns 可直接交给 Runner 的 executing Goal。
 * @example
 * ```ts
 * const goal = createExecutingGoal(context, 3, "goal-1", "run-1");
 * ```
 */
export function createExecutingGoal(
    context: EpisodeExecutionContext,
    promptBundleVersion: number,
    goalId: string,
    runId: string,
): Goal {
    const initial = createGoal({
        id: goalId,
        intent: `Evaluate fixed ALFWorld task ${context.task.taskId}`,
        promptBundleVersion,
        profile: context.profile,
        runId,
        maxSteps: context.task.maxSteps,
    });
    return {
        ...initial,
        state: {
            ...initial.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: `Complete ALFWorld task ${context.task.taskId}`,
                    completionCriteria: ["The environment reports won=true"],
                },
            },
        },
    };
}

function toSidecarTask(task: AlfworldManifestTask): SidecarTask {
    return {
        taskId: task.taskId,
        gameFile: task.gameFile,
        split: task.split,
        seed: task.seed,
        maxSteps: task.maxSteps,
    };
}

function modelFactsFromResult(result: RunnerResult): EpisodeModelFacts {
    if (!result.ok) return { runStatus: null, completed: false };
    return {
        runStatus: result.state.status,
        completed: result.state.lastStep?.kind === "decision"
            && result.state.lastStep.result.kind === "complete",
    };
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
