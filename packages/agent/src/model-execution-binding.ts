import type { LLMAdapter } from "../../llm/src/core/adapter.js";
import type { GoalModelSelection } from "../../runtime/src/domain.js";
import type { TrajectoryStore } from "../../runtime/src/index.js";
import {
    CharacterModelInputEstimator,
    createDefaultModelContextBudgetPolicy,
    createModelCapabilities,
    createModelContextBudgetPolicy,
    ModelCapabilitiesError,
    resolveTokenEstimatorEncoding,
    type ModelCapabilities,
    type ModelContextBudgetPolicy,
    type ModelContextBudgetPolicyInput,
    type ModelInputEstimator,
} from "./model-context-budget.js";
import { TrajectoryModelContextAssembler } from "./trajectory-model-context-assembler.js";

/**
 * 单一代不可变模型执行绑定契约。
 *
 * @remarks
 * 封装在特定 generation 下模型调用的完整上下文依赖，包括同一 provider/model 的 Think 与 Decide
 * Adapter、选择状态、模型能力（上限/估算器）、上下文预算策略及轨迹上下文组装器。
 *
 * @example
 * ```ts
 * const binding: ModelExecutionBinding = {
 *   generation: 1,
 *   selection,
 *   thinkAdapter,
 *   decideAdapter,
 *   modelCapabilities,
 *   modelContextPolicy,
 *   trajectoryContextAssembler,
 * };
 * ```
 */
export interface ModelExecutionBinding {
    /** 绑定的单调递增代号。 */
    readonly generation: number;
    /** 当前绑定的模型选择配置。 */
    readonly selection: GoalModelSelection;
    /** 固定使用 prompt_only 的 Think Adapter。 */
    readonly thinkAdapter: LLMAdapter;
    /** 按供应商能力固定使用 strict 或 prompt_only 的 Decide Adapter。 */
    readonly decideAdapter: LLMAdapter;
    /** 目标模型的 Token 容量与输出上限能力；字符模式下为 undefined。 */
    readonly modelCapabilities?: ModelCapabilities | undefined;
    /** 模型上下文预算策略。 */
    readonly modelContextPolicy: ModelContextBudgetPolicy;
    /** 轨迹上下文组装器。 */
    readonly trajectoryContextAssembler: TrajectoryModelContextAssembler;
}

/**
 * 模型执行绑定提供者契约。
 *
 * @remarks
 * 供执行器在每个 Decide 或 Think 阶段调用开始时读取不可变执行绑定。
 *
 * @example
 * ```ts
 * const binding = provider.current();
 * ```
 */
export interface ModelExecutionBindingProvider {
    /**
     * 获取当前生效的模型执行绑定快照。
     */
    current(): Readonly<ModelExecutionBinding>;
}

/**
 * 构造模型执行绑定的输入参数。
 *
 * @example
 * ```ts
 * const input: CreateModelExecutionBindingInput = {
 *     generation: 1,
 *     selection,
 *     thinkAdapter,
 *     decideAdapter,
 *     trajectoryStore,
 * };
 * ```
 */
export interface CreateModelExecutionBindingInput {
    /** 绑定的目标代号；必须为正安全整数。 */
    readonly generation: number;
    /** 目标模型选择状态。 */
    readonly selection: GoalModelSelection;
    /** 与目标 provider/model 匹配且固定使用 prompt_only 的 Think Adapter。 */
    readonly thinkAdapter: LLMAdapter;
    /** 与目标 provider/model 匹配且固定使用供应商适配输出模式的 Decide Adapter。 */
    readonly decideAdapter: LLMAdapter;
    /** 轨迹存储实例，用于组装 Trajectory 上下文。 */
    readonly trajectoryStore: TrajectoryStore;
    /** 可选的显式上下文预算配置；未提供时根据 capabilities 或默认字符预算计算。 */
    readonly modelContextBudget?: ModelContextBudgetPolicyInput | undefined;
    /** 可选的自定义输入估算器。 */
    readonly customEstimator?: ModelInputEstimator | undefined;
}

/**
 * 根据目标模型选择离线构造不可变的 ModelExecutionBinding。
 *
 * @remarks
 * 绑定同一模型的阶段 Adapter；根据 inputEstimator 分支分别配置 Token 或字符预算，并重新生成上下文预算与
 * 轨迹组装器。供应商的结构化输出能力在 LLM Factory 中映射为 Decide Adapter 模式。
 *
 * @param input - 构造绑定所需的目标参数与存储设施。
 * @returns 构造完成且已冻结的 ModelExecutionBinding。
 * @throws RangeError 当 generation 不是正安全整数。
 * @throws ModelCapabilitiesError 当模式失配、容量不足或估算器配置非法。
 *
 * @example
 * ```ts
 * const binding = createModelExecutionBinding({
 *   generation: 1,
 *   selection,
 *   thinkAdapter,
 *   decideAdapter,
 *   trajectoryStore,
 * });
 * ```
 */
export function createModelExecutionBinding(
    input: CreateModelExecutionBindingInput,
): Readonly<ModelExecutionBinding> {
    if (!Number.isSafeInteger(input.generation) || input.generation <= 0) {
        throw new RangeError("Generation must be a positive safe integer");
    }

    let modelCapabilities: ModelCapabilities | undefined;
    let modelContextPolicy: ModelContextBudgetPolicy;

    if (input.selection.inputEstimator.kind === "token-encoding") {
        const tokenEstimator = input.customEstimator?.unit === "token"
            ? input.customEstimator
            : resolveTokenEstimatorEncoding(input.selection.inputEstimator.encoding);

        if (input.selection.contextWindowTokens === undefined) {
            throw new ModelCapabilitiesError("contextWindowTokens is required for token-encoding estimator");
        }
        if (input.selection.maxOutputTokens === undefined) {
            throw new ModelCapabilitiesError("maxOutputTokens is required for token-encoding estimator");
        }

        modelCapabilities = createModelCapabilities({
            contextWindowTokens: input.selection.contextWindowTokens,
            maxOutputTokens: input.selection.maxOutputTokens,
            tokenEstimator,
        });

        modelContextPolicy = input.modelContextBudget !== undefined
            ? createModelContextBudgetPolicy(input.modelContextBudget, tokenEstimator)
            : createModelContextBudgetPolicy({
                modelInputBudget: Math.floor(modelCapabilities.contextWindowTokens * 0.95),
                responseReserve: modelCapabilities.maxOutputTokens,
            }, tokenEstimator);
    } else {
        const estimator = input.customEstimator ?? new CharacterModelInputEstimator();
        modelCapabilities = undefined;
        modelContextPolicy = input.modelContextBudget !== undefined
            ? createModelContextBudgetPolicy(input.modelContextBudget, estimator)
            : createDefaultModelContextBudgetPolicy(estimator);
    }

    const trajectoryContextAssembler = new TrajectoryModelContextAssembler({
        trajectoryStore: input.trajectoryStore,
        policy: modelContextPolicy,
    });

    return Object.freeze({
        generation: input.generation,
        selection: input.selection,
        thinkAdapter: input.thinkAdapter,
        decideAdapter: input.decideAdapter,
        modelCapabilities,
        modelContextPolicy,
        trajectoryContextAssembler,
    });
}

/**
 * 支持同步发布新 generation 绑定的模型执行绑定提供者实现。
 *
 * @remarks
 * 管理当前进程内的活动模型执行绑定。当用户完成模型切换并成功持久化 Snapshot 后，
 * 通过 publish 方法同步替换当前绑定并递增 generation。
 *
 * @example
 * ```ts
 * const bindingManager = new MutableModelBinding(initialBinding);
 * const current = bindingManager.current();
 * bindingManager.publish(candidateBinding);
 * ```
 */
export class MutableModelBinding implements ModelExecutionBindingProvider {
    private binding: Readonly<ModelExecutionBinding>;

    /**
     * @param initialBinding - 初始生效的模型执行绑定。
     */
    constructor(initialBinding: Readonly<ModelExecutionBinding>) {
        this.binding = initialBinding;
    }

    /**
     * @returns 当前生效的模型执行绑定快照。
     */
    current(): Readonly<ModelExecutionBinding> {
        return this.binding;
    }

    /**
     * 同步发布下一个代号的模型执行绑定。
     *
     * @param nextBinding - 新构造的候选绑定；其 generation 必须严格大于当前 generation。
     * @throws RangeError 当 nextBinding 的 generation 未单调递增时抛出。
     */
    publish(nextBinding: Readonly<ModelExecutionBinding>): void {
        if (!Number.isSafeInteger(nextBinding.generation) || nextBinding.generation <= this.binding.generation) {
            throw new RangeError(
                `Next binding generation (${nextBinding.generation}) must be strictly greater than current generation (${this.binding.generation})`,
            );
        }
        this.binding = nextBinding;
    }

    /**
     * 基于当前 generation 离线构造下一代候选绑定。
     *
     * @remarks
     * 构造成功但尚未发布时，不会影响当前 generation。
     *
     * @param input - 构造参数（不包含 generation，自动设为 current.generation + 1）。
     * @returns 候选模型执行绑定。
     */
    createCandidate(input: {
        readonly selection: GoalModelSelection;
        readonly thinkAdapter: LLMAdapter;
        readonly decideAdapter: LLMAdapter;
        readonly trajectoryStore: TrajectoryStore;
        readonly modelContextBudget?: ModelContextBudgetPolicyInput | undefined;
        readonly customEstimator?: ModelInputEstimator | undefined;
    }): Readonly<ModelExecutionBinding> {
        return createModelExecutionBinding({
            ...input,
            generation: this.binding.generation + 1,
        });
    }
}
