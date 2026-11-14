/**
 * Context Epoch 工作窗口的容量解析。
 *
 * @remarks
 * 容量基数按以下优先级确定：用户配置的 `[context].epoch_limit_tokens`，其次是模型标称
 * 上下文窗口。配置上限不得大于已知的模型窗口；两者都未知时拒绝解析，由调用方在发送
 * 模型请求前失败并提示配置。整理阈值以容量为基数，默认 80%。
 *
 * @example
 * ```ts
 * const capacity = resolveEpochCapacity({ modelContextWindowTokens: 200_000 });
 * console.log(capacity.capacityTokens, capacity.thresholdPercent);
 * ```
 */

/** 未配置阈值时使用的默认整理阈值百分比。 */
export const DEFAULT_COMPACT_THRESHOLD_PERCENT = 80;

/** Epoch 容量无法确定为可执行值时的稳定错误码。 */
export const EPOCH_CAPACITY_UNAVAILABLE = "EPOCH_CAPACITY_UNAVAILABLE" as const;

/** Epoch 容量或阈值非法时抛出的配置错误。 */
export class EpochCapacityError extends Error {
    readonly code = EPOCH_CAPACITY_UNAVAILABLE;

    constructor(message: string) {
        super(`${EPOCH_CAPACITY_UNAVAILABLE}: ${message}`);
        this.name = "EpochCapacityError";
    }
}

/**
 * 解析 Epoch 容量的输入。
 *
 * @example
 * ```ts
 * const input: EpochCapacityInput = { configuredLimitTokens: 120_000 };
 * ```
 */
export interface EpochCapacityInput {
    /** 模型标称上下文窗口；未知时省略。 */
    readonly modelContextWindowTokens?: number | undefined;
    /** 用户配置的 Epoch 上限；省略时以模型窗口为基数。 */
    readonly configuredLimitTokens?: number | undefined;
    /** 整理阈值百分比；省略时使用 {@link DEFAULT_COMPACT_THRESHOLD_PERCENT}。 */
    readonly thresholdPercent?: number | undefined;
}

/**
 * 已解析且冻结的 Epoch 工作窗口。
 *
 * @example
 * ```ts
 * const capacity: EpochCapacity = {
 *     capacityTokens: 200_000,
 *     thresholdPercent: 80,
 *     source: "model",
 * };
 * ```
 */
export interface EpochCapacity {
    /** 用作阈值基数的 Token 容量。 */
    readonly capacityTokens: number;
    /** 触发整理的占用百分比。 */
    readonly thresholdPercent: number;
    /** 容量基数的来源：模型标称窗口或用户配置。 */
    readonly source: "model" | "configured";
}

/**
 * 解析并冻结 Epoch 工作窗口。
 *
 * @param input - 模型窗口、用户上限与阈值。
 * @returns 容量、阈值与容量来源。
 * @throws {@link EpochCapacityError} 当容量无法确定、配置上限超过已知模型窗口或阈值非 1–99 的整数时。
 * @example
 * ```ts
 * const capacity = resolveEpochCapacity({
 *     modelContextWindowTokens: 200_000,
 *     configuredLimitTokens: 120_000,
 * });
 * ```
 */
export function resolveEpochCapacity(input: EpochCapacityInput): EpochCapacity {
    const thresholdPercent = input.thresholdPercent ?? DEFAULT_COMPACT_THRESHOLD_PERCENT;
    if (!Number.isInteger(thresholdPercent) || thresholdPercent < 1 || thresholdPercent > 99) {
        throw new EpochCapacityError("compact_threshold_percent must be an integer between 1 and 99");
    }

    const windowTokens = input.modelContextWindowTokens;
    if (windowTokens !== undefined && (!Number.isSafeInteger(windowTokens) || windowTokens <= 0)) {
        throw new EpochCapacityError("model context window must be a positive safe integer");
    }

    const configured = input.configuredLimitTokens;
    if (configured !== undefined && (!Number.isSafeInteger(configured) || configured <= 0)) {
        throw new EpochCapacityError("epoch_limit_tokens must be a positive safe integer");
    }

    if (configured !== undefined) {
        if (windowTokens !== undefined && configured > windowTokens) {
            throw new EpochCapacityError(
                `epoch_limit_tokens ${configured} exceeds the model context window ${windowTokens}; lower the limit`,
            );
        }
        return Object.freeze({
            capacityTokens: configured,
            thresholdPercent,
            source: "configured" as const,
        });
    }

    if (windowTokens !== undefined) {
        return Object.freeze({
            capacityTokens: windowTokens,
            thresholdPercent,
            source: "model" as const,
        });
    }

    throw new EpochCapacityError(
        "The model context window is unknown; configure [context].epoch_limit_tokens to set a work window limit",
    );
}

/**
 * 尝试解析 Epoch 工作窗口，不抛出配置错误。
 *
 * @remarks
 * 供只读展示使用：容量不可确定或配置不自洽时返回 `undefined`，由调用方显示
 * Context 不可用，而不是把错误传播给指标查询。
 *
 * @param input - 模型窗口、用户上限与阈值。
 * @returns 已解析的容量；不可确定时为 `undefined`。
 * @example
 * ```ts
 * const capacity = tryResolveEpochCapacity({ modelContextWindowTokens: 128_000 });
 * ```
 */
export function tryResolveEpochCapacity(input: EpochCapacityInput): EpochCapacity | undefined {
    try {
        return resolveEpochCapacity(input);
    } catch {
        return undefined;
    }
}

/**
 * 判断占用是否严格超过整理阈值。
 *
 * @param occupiedTokens - 当前工作窗口的结算占用。
 * @param capacity - 已解析的工作窗口。
 * @returns 占用换算为容量百分比后是否严格超过阈值。
 * @example
 * ```ts
 * const reached = exceedsCompactThreshold(161_000, capacity);
 * ```
 */
export function exceedsCompactThreshold(
    occupiedTokens: number,
    capacity: Pick<EpochCapacity, "capacityTokens" | "thresholdPercent">,
): boolean {
    if (!Number.isSafeInteger(occupiedTokens) || occupiedTokens < 0) return false;
    return occupiedTokens * 100 > capacity.thresholdPercent * capacity.capacityTokens;
}
