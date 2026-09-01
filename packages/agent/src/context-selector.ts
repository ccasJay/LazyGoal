import {
    TokenBudgetPlanner,
    type ModelCapabilities,
} from "./model-context-budget";

/** ContextSelector 的可裁剪历史单元。 */
export interface ContextSelectionUnit<T = unknown> {
    readonly id: string;
    readonly value: T;
    readonly measurement?: number;
}

/** 一次统一上下文选择输入。 */
export interface ContextSelectionInput<T = unknown> {
    readonly authority: unknown;
    readonly lookup?: unknown;
    readonly latestConversation: ContextSelectionUnit<T>;
    readonly hot?: readonly ContextSelectionUnit<T>[];
    readonly olderConversation?: readonly ContextSelectionUnit<T>[];
    readonly warm?: readonly ContextSelectionUnit<T>[];
    /** 将候选结构渲染为最终 messages 后计量。 */
    readonly render: (parts: {
        readonly authority: unknown;
        readonly lookup?: unknown;
        readonly conversation: readonly T[];
        readonly hot: readonly T[];
        readonly olderConversation: readonly T[];
        readonly warm: readonly T[];
    }) => unknown;
}

/** 选择结果，保留完整单元边界和每次实际计量。 */
export interface ContextSelectionResult<T = unknown> {
    readonly conversation: readonly T[];
    readonly hot: readonly T[];
    readonly olderConversation: readonly T[];
    readonly warm: readonly T[];
    readonly inputTokens: number;
    readonly hardInputLimit: number;
    readonly hardOverflow: boolean;
    readonly removedWarm: number;
    readonly removedOlderConversation: number;
    readonly removedHot: number;
}

/** 权威输入无法装入模型硬预算时的稳定错误码。 */
export const MODEL_CONTEXT_HARD_OVERFLOW = "MODEL_CONTEXT_HARD_OVERFLOW" as const;

/** fail-closed 的上下文硬溢出错误。 */
export class ModelContextHardOverflowError extends Error {
    readonly code = MODEL_CONTEXT_HARD_OVERFLOW;
    constructor(message = "authoritative context exceeds model hard input limit") {
        super(`${MODEL_CONTEXT_HARD_OVERFLOW}: ${message}`);
        this.name = "ModelContextHardOverflowError";
    }
}

/** 权威优先、按完整单元回退的统一上下文选择器。 */
export class ContextSelector<T = unknown> {
    private readonly planner: TokenBudgetPlanner;

    constructor(planner: TokenBudgetPlanner | ModelCapabilities) {
        this.planner = "measure" in planner
            ? planner as TokenBudgetPlanner
            : new TokenBudgetPlanner(planner as ModelCapabilities);
    }

    select(input: ContextSelectionInput<T>): ContextSelectionResult<T> {
        const hot = [...(input.hot ?? [])];
        const older = [...(input.olderConversation ?? [])];
        const warm = [...(input.warm ?? [])];
        const conversation = [input.latestConversation];
        const render = () => input.render({
            authority: input.authority,
            ...(input.lookup === undefined ? {} : { lookup: input.lookup }),
            conversation: conversation.map((u) => u.value),
            hot: hot.map((u) => u.value),
            olderConversation: older.map((u) => u.value),
            warm: warm.map((u) => u.value),
        });
        let measured = this.planner.measure(render());
        while (measured.hardOverflow && warm.length > 0) {
            warm.shift();
            measured = this.planner.measure(render());
        }
        while (measured.hardOverflow && older.length > 0) {
            older.shift();
            measured = this.planner.measure(render());
        }
        while (measured.hardOverflow && hot.length > 0) {
            hot.shift();
            measured = this.planner.measure(render());
        }
        if (measured.hardOverflow) {
            throw new ModelContextHardOverflowError();
        }
        return Object.freeze({
            conversation: Object.freeze(conversation.map((u) => u.value)),
            hot: Object.freeze(hot.map((u) => u.value)),
            olderConversation: Object.freeze(older.map((u) => u.value)),
            warm: Object.freeze(warm.map((u) => u.value)),
            inputTokens: measured.inputTokens,
            hardInputLimit: this.planner.hardInputLimit,
            hardOverflow: measured.hardOverflow,
            removedWarm: (input.warm?.length ?? 0) - warm.length,
            removedOlderConversation: (input.olderConversation?.length ?? 0) - older.length,
            removedHot: (input.hot?.length ?? 0) - hot.length,
        });
    }
}
