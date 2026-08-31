import { stableJson } from "./prompting/environment";

/** 模型输入预算使用的计量单位。 */
export type ModelInputMeasurementUnit = "token" | "character";

/** 字符兜底模式下沿用的总模型输入默认预算。 */
export const DEFAULT_MODEL_INPUT_CHARACTER_BUDGET = 196_608;
/** 默认响应预留比例。 */
export const DEFAULT_MODEL_RESPONSE_RESERVE_RATIO = 0.1;
/** 默认 Warm 历史预算比例。 */
export const DEFAULT_MODEL_WARM_SHARE = 0.25;
/** 默认 Compact 触发比例。 */
export const DEFAULT_MODEL_COMPACT_TRIGGER_RATIO = 0.85;
/** Token 模式下大型输出 preview 默认上限。 */
export const DEFAULT_MODEL_LARGE_OUTPUT_TOKEN_PREVIEW_LIMIT = 2_048;
/** 字符模式下大型输出 preview 默认上限。 */
export const DEFAULT_MODEL_LARGE_OUTPUT_CHARACTER_PREVIEW_LIMIT = 8_192;

/**
 * 一次最终模型输入投影的确定性计量结果。
 *
 * @example
 * ```ts
 * const estimate: ModelInputEstimate = { unit: "character", count: 120 };
 * ```
 */
export interface ModelInputEstimate {
    /** 计量单位；同一个 Goal 生命周期内不得切换。 */
    readonly unit: ModelInputMeasurementUnit;
    /** 非负安全整数计数。 */
    readonly count: number;
}

/**
 * 对最终模型输入结构执行计量的适配器。
 *
 * @remarks
 * Token 适配器可以调用目标模型专用 tokenizer；未提供时应使用字符实现作为
 * 有界兜底。输入只读，Estimator 不保存请求或 Goal 状态。
 *
 * @example
 * ```ts
 * const estimator: ModelInputEstimator = {
 *     unit: "token",
 *     estimate: (value) => tokenize(JSON.stringify(value)).length,
 * };
 * ```
 */
export interface ModelInputEstimator {
    /** 当前适配器输出的计量单位。 */
    readonly unit: ModelInputMeasurementUnit;
    /**
     * @param input - 已完成渲染、即将计入模型预算的只读结构。
     * @returns 非负安全整数计量值。
     * @throws 无法计量或结果不是安全整数时抛出配置/输入错误。
     */
    estimate(input: unknown): number;
}

/**
 * 使用 UTF-16 code unit 长度的字符计量器。
 *
 * @remarks
 * 对对象和数组使用其 JSON 表示计量，确保固定 View 的结构符号也占用预算；对
 * 字符串直接计量。该实现不依赖区域设置、当前时间或随机数。
 *
 * @example
 * ```ts
 * const estimator = new CharacterModelInputEstimator();
 * estimator.estimate({ messages: [{ role: "user", content: "继续" }] });
 * ```
 */
export class CharacterModelInputEstimator implements ModelInputEstimator {
    readonly unit = "character" as const;

    /** @inheritdoc */
    estimate(input: unknown): number {
        if (typeof input === "string") {
            return input.length;
        }

        try {
            return stableJson(input).length;
        } catch (error) {
            throw new RangeError("Model input cannot be serialized for character estimation", {
                cause: error,
            });
        }
    }
}

/**
 * 将目标模型 tokenizer 包装为 ModelInputEstimator。
 *
 * @param estimate - 接收最终输入结构并返回 Token 数的函数。
 * @returns 带 `token` 单位的只读 Estimator。
 * @throws RangeError 当函数返回负数、非整数或超过安全整数时。
 * @example
 * ```ts
 * const estimator = createTokenModelInputEstimator((input) =>
 *     tokenizer.encode(JSON.stringify(input)).length,
 * );
 * ```
 */
export function createTokenModelInputEstimator(
    estimate: (input: unknown) => number,
): ModelInputEstimator {
    return Object.freeze({
        unit: "token",
        estimate(input: unknown): number {
            const count = estimate(input);

            if (!Number.isSafeInteger(count) || count < 0) {
                throw new RangeError(
                    "Token estimator must return a non-negative safe integer",
                );
            }

            return count;
        },
    });
}

/**
 * 模型上下文预算策略的可配置输入。
 *
 * @example
 * ```ts
 * const input: ModelContextBudgetPolicyInput = {
 *     modelInputBudget: 128_000,
 *     responseReserve: 8_000,
 * };
 * ```
 */
export interface ModelContextBudgetPolicyInput {
    /** 总输入预算（含固定输入、历史和响应预留）。 */
    readonly modelInputBudget: number;
    /** 响应预留的绝对计量值；省略时使用总预算的 10%。 */
    readonly responseReserve?: number;
    /** Warm 分层最多占可用历史预算的比例，默认 0.25。 */
    readonly warmShare?: number;
    /** Warm 的绝对上限；省略时仅受 `warmShare` 限制。 */
    readonly warmLimit?: number;
    /** 触发 Compact 候选评估的比例，默认 0.85。 */
    readonly compactTriggerRatio?: number;
    /** 大型历史输出 preview 的上限；省略时按计量单位使用默认值。 */
    readonly largeOutputPreviewLimit?: number;
}

/**
 * 已校验的模型上下文预算策略。
 *
 * @remarks
 * 策略只保存一次 Goal 执行期间不可变的预算配置。响应预留在构造时按总预算
 * 计算；Warm 预算通过 `plan` 从剩余历史预算分配，未使用部分可以回借给 Hot。
 * 所有绝对值必须是正安全整数，比例必须位于 `(0, 1]`。
 *
 * @example
 * ```ts
 * const policy = createModelContextBudgetPolicy({ modelInputBudget: 100_000 });
 * const plan = policy.plan({ fixedInput: { task: "demo" } });
 * console.log(plan.hotBudget);
 * ```
 */
export interface ModelContextBudgetPolicy {
    /** 该策略使用的固定 Token 或字符计量器。 */
    readonly estimator: ModelInputEstimator;
    readonly modelInputBudget: number;
    readonly responseReserve: number;
    readonly warmShare: number;
    readonly warmLimit?: number;
    readonly compactTriggerRatio: number;
    readonly largeOutputPreviewLimit: number;
    /**
     * @param input - 本轮已渲染的不可裁剪固定输入。
     * @returns 固定输入计量、历史预算以及 Hot/Warm 初始配额。
     * @throws 配置非法或固定输入无法计量时抛出错误。
     */
    plan(input: ModelContextBudgetPlanInput): ModelContextBudgetPlan;
    /**
     * @param plan - 本策略生成的预算计划。
     * @param warmUsed - Warm 实际占用的计量值。
     * @returns 将未使用 Warm 预算回借后重新计算的 Hot 上限。
     * @throws warmUsed 不是非负安全整数或超过 Warm 配额时抛出 RangeError。
     */
    reallocateHotBudget(plan: ModelContextBudgetPlan, warmUsed: number): number;
}

/**
 * 预算规划使用的固定输入与可选 Warm 使用量。
 *
 * @example
 * ```ts
 * const input: ModelContextBudgetPlanInput = {
 *     fixedInput: { system: "...", task: "..." },
 * };
 * ```
 */
export interface ModelContextBudgetPlanInput {
    /** System/Profile/Tools/Task/Execution/Conversation/Working Memory 等完整固定 View。 */
    readonly fixedInput: unknown;
}

/**
 * 一次预算规划的不可变报告。
 *
 * @remarks
 * `softOverflow` 表示固定输入已经达到或超过总预算；此时历史层配额为零，但调用方
 * 仍应保留完整固定结构，并由上层记录诊断，而不是静默截断固定字段。
 *
 * @example
 * ```ts
 * const report: ModelContextBudgetPlan = policy.plan({ fixedInput: "view" });
 * if (report.softOverflow) console.warn("fixed view exceeds history budget");
 * ```
 */
export interface ModelContextBudgetPlan {
    readonly measuredAs: ModelInputMeasurementUnit;
    readonly modelInputBudget: number;
    readonly responseReserve: number;
    readonly fixedInput: ModelInputEstimate;
    readonly historyBudget: number;
    readonly warmBudget: number;
    readonly hotBudget: number;
    readonly softOverflow: boolean;
}

/**
 * 创建并校验模型上下文预算策略。
 *
 * @param input - 总预算、响应预留和 Hot/Warm 分配比例。
 * @param estimator - 对最终固定输入执行 Token 或字符计量的适配器。
 * @returns 可复用的只读预算策略。
 * @throws RangeError 当配置不是正安全整数、比例非法或预留占满总预算时。
 * @example
 * ```ts
 * const policy = createModelContextBudgetPolicy({
 *     modelInputBudget: 16_384,
 * }, new CharacterModelInputEstimator());
 * ```
 */
export function createModelContextBudgetPolicy(
    input: ModelContextBudgetPolicyInput,
    estimator: ModelInputEstimator = new CharacterModelInputEstimator(),
): ModelContextBudgetPolicy {
    assertPositiveSafeInteger(input.modelInputBudget, "modelInputBudget");

    const responseReserve = input.responseReserve
        ?? Math.max(
            1,
            Math.floor(input.modelInputBudget * DEFAULT_MODEL_RESPONSE_RESERVE_RATIO),
        );
    assertPositiveSafeInteger(responseReserve, "responseReserve");

    if (responseReserve >= input.modelInputBudget) {
        throw new RangeError("responseReserve must be less than modelInputBudget");
    }

    const warmShare = input.warmShare ?? DEFAULT_MODEL_WARM_SHARE;
    assertRatio(warmShare, "warmShare");

    if (input.warmLimit !== undefined) {
        assertPositiveSafeInteger(input.warmLimit, "warmLimit");
    }

    const compactTriggerRatio = input.compactTriggerRatio
        ?? DEFAULT_MODEL_COMPACT_TRIGGER_RATIO;
    assertRatio(compactTriggerRatio, "compactTriggerRatio");

    const defaultPreview = estimator.unit === "token"
        ? DEFAULT_MODEL_LARGE_OUTPUT_TOKEN_PREVIEW_LIMIT
        : DEFAULT_MODEL_LARGE_OUTPUT_CHARACTER_PREVIEW_LIMIT;
    const largeOutputPreviewLimit = input.largeOutputPreviewLimit ?? defaultPreview;
    assertPositiveSafeInteger(largeOutputPreviewLimit, "largeOutputPreviewLimit");

    return Object.freeze({
        estimator,
        modelInputBudget: input.modelInputBudget,
        responseReserve,
        warmShare,
        ...(input.warmLimit === undefined ? {} : { warmLimit: input.warmLimit }),
        compactTriggerRatio,
        largeOutputPreviewLimit,
        plan(planInput: ModelContextBudgetPlanInput): ModelContextBudgetPlan {
            const fixedCount = estimator.estimate(planInput.fixedInput);

            if (!Number.isSafeInteger(fixedCount) || fixedCount < 0) {
                throw new RangeError("Model input estimator must return a non-negative safe integer");
            }

            const availableBeforeHistory = input.modelInputBudget - responseReserve;
            const softOverflow = fixedCount >= availableBeforeHistory;
            const historyBudget = softOverflow
                ? 0
                : input.modelInputBudget - responseReserve - fixedCount;
            const warmBudget = softOverflow
                ? 0
                : Math.min(
                    input.warmLimit ?? historyBudget,
                    Math.floor(historyBudget * warmShare),
                );

            return Object.freeze({
                measuredAs: estimator.unit,
                modelInputBudget: input.modelInputBudget,
                responseReserve,
                fixedInput: Object.freeze({ unit: estimator.unit, count: fixedCount }),
                historyBudget,
                warmBudget,
                hotBudget: historyBudget - warmBudget,
                softOverflow,
            });
        },
        reallocateHotBudget(
            plan: ModelContextBudgetPlan,
            warmUsed: number,
        ): number {
            if (!Number.isSafeInteger(warmUsed) || warmUsed < 0) {
                throw new RangeError("warmUsed must be a non-negative safe integer");
            }

            if (warmUsed > plan.warmBudget) {
                throw new RangeError("warmUsed must not exceed the planned warm budget");
            }

            return plan.hotBudget + (plan.warmBudget - warmUsed);
        },
    });
}

/**
 * 创建字符兜底模式的默认上下文预算策略。
 *
 * @param estimator - 可选的 Token/字符计量器；省略时使用字符兜底。
 * @returns 使用 `196608` 总预算和设计默认比例的策略。
 * @example
 * ```ts
 * const policy = createDefaultModelContextBudgetPolicy();
 * ```
 */
export function createDefaultModelContextBudgetPolicy(
    estimator: ModelInputEstimator = new CharacterModelInputEstimator(),
): ModelContextBudgetPolicy {
    return createModelContextBudgetPolicy({
        modelInputBudget: DEFAULT_MODEL_INPUT_CHARACTER_BUDGET,
    }, estimator);
}

/** 选择目标模型 Token 计量器，缺失时使用字符兜底。 */
export function resolveModelInputEstimator(
    tokenEstimator?: ModelInputEstimator,
): ModelInputEstimator {
    if (tokenEstimator !== undefined) {
        if (tokenEstimator.unit !== "token") {
            throw new RangeError("Injected model estimator must use token units");
        }

        return tokenEstimator;
    }

    return new CharacterModelInputEstimator();
}

function assertPositiveSafeInteger(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`${field} must be a positive safe integer`);
    }
}

function assertRatio(value: number, field: string): void {
    if (!Number.isFinite(value) || value <= 0 || value > 1) {
        throw new RangeError(`${field} must be greater than 0 and at most 1`);
    }
}
