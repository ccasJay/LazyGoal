import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { LLMAdapter } from "../../packages/llm/src/core/adapter.js";
import type { AgentProfile } from "../../packages/runtime/src/agent-profile.js";
import {
    derivePromptEvaluationProfile,
    fingerprintPromptEvaluationCandidate,
    validatePromptEvaluationProfile,
    type PromptEvaluationPromptFingerprint,
} from "./prompt-evaluation-profile.js";
import {
    PROMPT_EVALUATION_PROTOCOL,
    type PromptEvaluationBenchmarkId,
    type PromptEvaluationEventV1,
    type PromptEvaluationRequestV1,
    type PromptEvaluationResultV1,
    type PromptEvaluationTaskResult,
} from "./prompt-evaluation-protocol.js";

/** 单个 benchmark 任务执行时收到的完整 Prompt Evaluation 上下文。 */
export interface PromptEvaluationTaskInput<TTask> {
    /** 本次评测生成的唯一身份。 */
    readonly evaluationId: string;
    /** 当前 Manifest 任务。 */
    readonly task: TTask;
    /** 已由公共层验证并冻结的候选 Profile。 */
    readonly profile: AgentProfile;
    /** 候选 Prompt 的稳定指纹。 */
    readonly fingerprint: PromptEvaluationPromptFingerprint;
    /** 当前任务独占的宿主输出目录。 */
    readonly outputDirectory: string;
    /** 由 CLI 根据本地配置创建的宿主模型适配器。 */
    readonly llmAdapter: LLMAdapter;
    /** 贯穿隔离环境和模型调用的取消信号。 */
    readonly signal?: AbortSignal;
}

/**
 * 一个 benchmark 对公共 Prompt Evaluation runner 的窄适配边界。
 *
 * @remarks
 * Adapter 继续拥有 Manifest、基准 Profile、领域环境和评分。公共 runner 只按
 * 顺序调用任务并聚合 adapter 返回的权威状态，不解释 `domainResult`。
 *
 * @example
 * ```ts
 * const adapter: PromptEvaluationBenchmarkAdapter<Task, { won: boolean }> = {
 *   benchmarkId: "alfworld",
 *   loadManifest: async () => [task],
 *   loadBaseProfile: async () => baseProfile,
 *   validateCandidateProfile: (profile) => profile,
 *   taskId: (value) => value.id,
 *   runTask: async () => taskResult,
 * };
 * ```
 */
export interface PromptEvaluationBenchmarkAdapter<TTask, TDomain> {
    /** 与请求协议一致的稳定 benchmark ID。 */
    readonly benchmarkId: PromptEvaluationBenchmarkId;
    /** 读取并执行领域 Manifest 校验，保持任务顺序。 */
    loadManifest(path: string): Promise<readonly TTask[]>;
    /** 按 ID 加载 benchmark 已有且受信任的基准 Profile。 */
    loadBaseProfile(profileId: string): Promise<AgentProfile>;
    /** 执行 benchmark 专用的候选 Prompt 约束校验。 */
    validateCandidateProfile(profile: AgentProfile): AgentProfile;
    /** 返回 Manifest 内的稳定任务 ID。 */
    taskId(task: TTask): string;
    /** 在 benchmark 自己的隔离环境中执行并评分一个任务。 */
    runTask(input: PromptEvaluationTaskInput<TTask>): Promise<PromptEvaluationTaskResult<TDomain>>;
}

type ErasedPromptEvaluationBenchmarkAdapter = PromptEvaluationBenchmarkAdapter<unknown, unknown>;

/**
 * Prompt Evaluation benchmark adapter 注册表。
 *
 * @remarks
 * 注册表只保存由 CLI 组合根显式注入的 adapter；公共层不反向导入任何领域目录。
 * 重复 ID 会在构造时失败。
 *
 * @example
 * ```ts
 * const registry = new PromptEvaluationBenchmarkRegistry([adapter]);
 * const resolved = registry.require("alfworld");
 * ```
 */
export class PromptEvaluationBenchmarkRegistry {
    private readonly adapters = new Map<PromptEvaluationBenchmarkId, ErasedPromptEvaluationBenchmarkAdapter>();

    /** @param adapters - 当前 CLI 明确支持的 benchmark adapters。 */
    constructor(adapters: readonly PromptEvaluationBenchmarkAdapter<unknown, unknown>[]) {
        for (const adapter of adapters) {
            if (this.adapters.has(adapter.benchmarkId)) {
                throw new PromptEvaluationRunnerError(
                    "DUPLICATE_BENCHMARK",
                    `Duplicate Prompt Evaluation benchmark: ${adapter.benchmarkId}`,
                );
            }
            this.adapters.set(adapter.benchmarkId, adapter);
        }
    }

    /** @returns 当前注册 ID 的不可变集合副本。 */
    ids(): ReadonlySet<string> {
        return new Set(this.adapters.keys());
    }

    /**
     * @param benchmarkId - 请求中的 benchmark ID。
     * @returns 对应 adapter。
     * @throws ID 未注册时抛出 `PromptEvaluationRunnerError`。
     */
    require(benchmarkId: PromptEvaluationBenchmarkId): ErasedPromptEvaluationBenchmarkAdapter {
        const adapter = this.adapters.get(benchmarkId);
        if (adapter === undefined) {
            throw new PromptEvaluationRunnerError(
                "UNSUPPORTED_BENCHMARK",
                `Unsupported Prompt Evaluation benchmark: ${benchmarkId}`,
            );
        }
        return adapter;
    }
}

/** Prompt Evaluation 公共编排错误码。 */
export type PromptEvaluationRunnerErrorCode =
    | "DUPLICATE_BENCHMARK"
    | "UNSUPPORTED_BENCHMARK"
    | "EMPTY_MANIFEST"
    | "INVALID_TASK_ID"
    | "DUPLICATE_TASK_ID"
    | "TASK_RESULT_MISMATCH";

/**
 * 公共 runner 在模型调用前或 adapter 违反返回契约时抛出的稳定错误。
 *
 * @example
 * ```ts
 * if (error instanceof PromptEvaluationRunnerError) console.error(error.code);
 * ```
 */
export class PromptEvaluationRunnerError extends Error {
    readonly name = "PromptEvaluationRunnerError";

    constructor(readonly code: PromptEvaluationRunnerErrorCode, message: string) {
        super(message);
    }
}

/** Prompt Evaluation runner 的外部依赖。 */
export interface PromptEvaluationRunnerDependencies {
    readonly registry: PromptEvaluationBenchmarkRegistry;
    /** 测试可注入的唯一评测 ID 生成器。 */
    readonly evaluationIdGenerator?: () => string;
    /** 测试可注入的 ISO 时间生成器。 */
    readonly now?: () => string;
}

/** 单次评测执行选项。 */
export interface PromptEvaluationRunOptions {
    /** CLI 根据请求引用创建的模型适配器。 */
    readonly llmAdapter: LLMAdapter;
    /** 贯穿后续任务和当前隔离执行的取消信号。 */
    readonly signal?: AbortSignal;
    /** 接收非权威 JSON Lines 事件的输出边界。 */
    readonly onEvent?: (event: PromptEvaluationEventV1) => void | Promise<void>;
}

/**
 * 顺序执行一个候选对一个 Manifest 的公共 Prompt Evaluation runner。
 *
 * @remarks
 * 每个任务获得独立输入对象与输出目录。取消后不再调用后续任务 adapter；其余
 * 任务以无 Attempt 的 `cancelled` 结果列入汇总。领域结果和 passed/failed 状态
 * 完全由 adapter 提供。
 *
 * @example
 * ```ts
 * const runner = new PromptEvaluationRunner({ registry });
 * const result = await runner.run(request, { llmAdapter });
 * ```
 */
export class PromptEvaluationRunner {
    private readonly dependencies: PromptEvaluationRunnerDependencies;

    constructor(dependencies: PromptEvaluationRunnerDependencies) {
        this.dependencies = dependencies;
    }

    /**
     * @param request - 已通过当前协议解析的单候选请求。
     * @param options - 模型、取消与进度输出边界。
     * @returns 内存汇总；原子持久化由后续结果记录边界负责。
     */
    async run(
        request: PromptEvaluationRequestV1,
        options: PromptEvaluationRunOptions,
    ): Promise<PromptEvaluationResultV1> {
        const adapter = this.dependencies.registry.require(request.benchmark.id);
        const baseProfile = await adapter.loadBaseProfile(request.candidate.baseProfileId);
        const derivedProfile = derivePromptEvaluationProfile(baseProfile, request.candidate);
        const profile = validatePromptEvaluationProfile(
            adapter.validateCandidateProfile(derivedProfile),
            baseProfile,
        );
        const fingerprint = fingerprintPromptEvaluationCandidate(request.candidate);
        const tasks = await adapter.loadManifest(request.benchmark.manifestPath);
        const taskIds = validateTasks(adapter, tasks);
        const evaluationId = this.createEvaluationId();
        const results: PromptEvaluationTaskResult[] = [];
        await this.emit(options.onEvent, createEvent(evaluationId, null, "accepted", "progress", this.now()));

        for (let index = 0; index < tasks.length; index += 1) {
            const task = tasks[index];
            const taskId = taskIds[index];
            if (task === undefined || taskId === undefined) continue;
            if (options.signal?.aborted === true) {
                appendCancelledRemainder(results, taskIds, index);
                break;
            }
            await this.emit(options.onEvent, createEvent(
                evaluationId,
                taskId,
                "task_started",
                "progress",
                this.now(),
            ));
            const result = await runAdapterTask(adapter, {
                evaluationId,
                task,
                profile,
                fingerprint,
                outputDirectory: join(
                    request.outputDirectory,
                    "evaluations",
                    evaluationId,
                    "tasks",
                    encodeURIComponent(taskId),
                ),
                llmAdapter: options.llmAdapter,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            });
            if (result.taskId !== taskId) {
                throw new PromptEvaluationRunnerError(
                    "TASK_RESULT_MISMATCH",
                    `Prompt Evaluation adapter returned ${result.taskId} for task ${taskId}`,
                );
            }
            results.push(result);
            await this.emit(options.onEvent, createEvent(
                evaluationId,
                taskId,
                result.status === "cancelled" ? "cancelled" : "task_completed",
                "progress",
                this.now(),
            ));
            if (result.status === "cancelled" || isAborted(options.signal)) {
                appendCancelledRemainder(results, taskIds, index + 1);
                break;
            }
        }

        const status = results.some((result) => result.status === "cancelled")
            ? "cancelled"
            : results.some((result) => result.status === "infrastructure_error")
                ? "infrastructure_error"
                : "completed";
        const finalResult: PromptEvaluationResultV1 = Object.freeze({
            protocol: PROMPT_EVALUATION_PROTOCOL,
            evaluationId,
            status,
            benchmarkId: request.benchmark.id,
            manifestPath: request.benchmark.manifestPath,
            candidateId: request.candidate.id,
            modelConfigId: request.model.configId,
            modelId: request.model.modelId,
            generatedAt: this.now(),
            tasks: Object.freeze([...results]),
        });
        await this.emit(options.onEvent, createEvent(
            evaluationId,
            null,
            status,
            "terminal",
            this.now(),
        ));
        return finalResult;
    }

    private createEvaluationId(): string {
        const value = this.dependencies.evaluationIdGenerator?.() ?? `eval-${randomUUID()}`;
        if (!/^[A-Za-z0-9_.-]+$/u.test(value)) {
            throw new TypeError(`Invalid Prompt Evaluation id: ${value}`);
        }
        return value;
    }

    private now(): string {
        return this.dependencies.now?.() ?? new Date().toISOString();
    }

    private async emit(
        listener: PromptEvaluationRunOptions["onEvent"],
        event: PromptEvaluationEventV1,
    ): Promise<void> {
        await listener?.(event);
    }
}

function validateTasks(
    adapter: ErasedPromptEvaluationBenchmarkAdapter,
    tasks: readonly unknown[],
): readonly string[] {
    if (tasks.length === 0) {
        throw new PromptEvaluationRunnerError("EMPTY_MANIFEST", "Prompt Evaluation Manifest is empty");
    }
    const seen = new Set<string>();
    return tasks.map((task) => {
        const taskId = adapter.taskId(task);
        if (taskId.trim() === "") {
            throw new PromptEvaluationRunnerError("INVALID_TASK_ID", "Prompt Evaluation task ID is empty");
        }
        if (seen.has(taskId)) {
            throw new PromptEvaluationRunnerError("DUPLICATE_TASK_ID", `Duplicate task ID: ${taskId}`);
        }
        seen.add(taskId);
        return taskId;
    });
}

async function runAdapterTask(
    adapter: ErasedPromptEvaluationBenchmarkAdapter,
    input: PromptEvaluationTaskInput<unknown>,
): Promise<PromptEvaluationTaskResult> {
    try {
        return await adapter.runTask(input);
    } catch (error: unknown) {
        if (input.signal?.aborted === true) {
            return cancelledTask(adapter.taskId(input.task));
        }
        return {
            taskId: adapter.taskId(input.task),
            status: "infrastructure_error",
            domainResult: null,
            attemptPath: null,
            errors: [{ stage: "prompt_evaluation_runner", message: boundedErrorMessage(error) }],
        };
    }
}

function appendCancelledRemainder(
    results: PromptEvaluationTaskResult[],
    taskIds: readonly string[],
    start: number,
): void {
    for (let index = start; index < taskIds.length; index += 1) {
        const taskId = taskIds[index];
        if (taskId !== undefined) results.push(cancelledTask(taskId));
    }
}

function cancelledTask(taskId: string): PromptEvaluationTaskResult {
    return {
        taskId,
        status: "cancelled",
        domainResult: null,
        attemptPath: null,
        errors: [],
    };
}

function createEvent(
    evaluationId: string,
    taskId: string | null,
    stage: PromptEvaluationEventV1["stage"],
    type: PromptEvaluationEventV1["type"],
    timestamp: string,
): PromptEvaluationEventV1 {
    return {
        protocol: PROMPT_EVALUATION_PROTOCOL,
        evaluationId,
        type,
        authoritative: false,
        taskId,
        stage,
        timestamp,
    };
}

function boundedErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 1_000);
}

function isAborted(signal: AbortSignal | undefined): boolean {
    return signal?.aborted === true;
}
