import type { ContextUnit } from "./context-unit";

/** 适配 256k Context Window 时为 Conversation 预留的默认字符预算。 */
export const DEFAULT_LLM_CONVERSATION_CHAR_BUDGET = 196608;

/**
 * 按完整上下文单元生成单轮模型可见上下文的异步策略边界。
 *
 * @remarks
 * Compactor 不感知单元来源，也不得修改输入。接口从第一版即为异步，以允许后续
 * 实现执行受 `AbortSignal` 控制的摘要工作；具体实现产生的错误由调用方原样传播。
 *
 * @example
 * ```ts
 * const compactor: ContextCompactor<string> =
 *     new DropOldestContextCompactor(1000);
 * const visible = await compactor.compact(units);
 * ```
 */
export interface ContextCompactor<T> {
    /**
     * @param units - 按时间从旧到新排列的完整上下文单元。
     * @param signal - 可选的调用级中止信号；中止时实现应停止工作并拒绝 Promise。
     * @returns 供本轮模型使用的新单元列表；不得返回被拆分的输入单元。
     * @throws 中止信号或具体策略失败时拒绝 Promise。
     */
    compact(
        units: readonly ContextUnit<T>[],
        signal?: AbortSignal,
    ): Promise<readonly ContextUnit<T>[]>;
}

// TODO(model-context-summary): 未来可注入生成摘要的新 Compactor，但默认策略不得生成或持久化摘要。

/**
 * 从最旧单元开始丢弃、只保留连续最新后缀的默认裁剪器。
 *
 * @remarks
 * 字符预算是软上限：最新单元始终完整保留，即使它自身已经超出预算。向前选择时
 * 遇到首个无法整体容纳的单元立即停止，不跳过它选择更旧单元。实例不保存调用
 * 结果或会话状态，可以安全地由多个 Executor 共享。
 *
 * @example
 * ```ts
 * const compactor = new DropOldestContextCompactor(196608);
 * const visible = await compactor.compact(units, controller.signal);
 * ```
 */
export class DropOldestContextCompactor implements ContextCompactor<unknown> {
    private readonly characterBudget: number;

    /**
     * @param characterBudget - Conversation 的正安全整数软预算。
     * @throws `RangeError` 当预算不是正安全整数时立即抛出。
     */
    constructor(
        characterBudget: number = DEFAULT_LLM_CONVERSATION_CHAR_BUDGET,
    ) {
        if (!Number.isSafeInteger(characterBudget) || characterBudget <= 0) {
            throw new RangeError(
                "Conversation character budget must be a positive safe integer",
            );
        }

        this.characterBudget = characterBudget;
    }

    /** @inheritdoc */
    async compact<T>(
        units: readonly ContextUnit<T>[],
        signal?: AbortSignal,
    ): Promise<readonly ContextUnit<T>[]> {
        signal?.throwIfAborted();

        if (units.length === 0) {
            return [];
        }

        const total = units.reduce(
            (sum, unit) => sum + unit.characterCount,
            0,
        );

        if (total <= this.characterBudget) {
            return [...units];
        }

        let firstRetainedIndex = units.length - 1;
        let retainedCharacters = units[firstRetainedIndex]!.characterCount;

        for (let index = firstRetainedIndex - 1; index >= 0; index -= 1) {
            signal?.throwIfAborted();
            const candidate = units[index]!;

            if (
                retainedCharacters + candidate.characterCount
                > this.characterBudget
            ) {
                break;
            }

            retainedCharacters += candidate.characterCount;
            firstRetainedIndex = index;
        }

        return units.slice(firstRetainedIndex);
    }
}
