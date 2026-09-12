import type { TokenBudgetPlanner } from "./model-context-budget";

/** 超长思考链安全截断标记。 */
export const THOUGHT_TRUNCATION_MARKER = "\n...[思考链过长已安全截断]...";

/** 默认单次思考链注入第二阶段的最大字符限制（默认 8000 字符）。 */
export const DEFAULT_MAX_THOUGHT_CHARS = 8000;

/**
 * 思考链预算裁剪与安全截断选项。
 */
export interface TruncateThoughtOptions {
    /** 自定义最大安全字符限制（缺省为 {@link DEFAULT_MAX_THOUGHT_CHARS}）。 */
    readonly maxChars?: number;
    /** 可选的 Token 预算计算器，用于动态衡量截断后的输入开销。 */
    readonly planner?: TokenBudgetPlanner;
}

/**
 * 思考链截断与度量结果契约。
 */
export interface TruncateThoughtResult {
    /** 经过安全长度截断后的思考链文本。 */
    readonly thought: string;
    /** 是否发生了尾部截断。 */
    readonly truncated: boolean;
    /** 截断后的预估 Token 数（若提供了 planner）。 */
    readonly estimatedTokens?: number;
}

/**
 * 在将第一阶段捕获的思考链组装入第二阶段前，执行确定性安全长度截断与 Token 预算规划。
 *
 * @remarks
 * 该函数为纯计算过程，无副作用。若思考链超过安全长度上限，将在尾部注入确定性截断标记，
 * 防止长思考链挤占第二阶段原生 strict Schema 与结构化输出预算。
 *
 * @param thought - 第一阶段模型自由推演返回的原始思考链文本。
 * @param options - 截断长度与预算计算器选项。
 * @returns 包含截断后文本、截断布尔标识及可选 Token 预估的结果对象。
 * @example
 * ```ts
 * const result = truncateThought("第一步思考...", { maxChars: 4000 });
 * console.log(result.thought, result.truncated);
 * ```
 */
export function truncateThought(
    thought: string,
    options: TruncateThoughtOptions = {},
): TruncateThoughtResult {
    const maxChars = options.maxChars ?? DEFAULT_MAX_THOUGHT_CHARS;
    let finalThought = thought;
    let truncated = false;

    if (thought.length > maxChars) {
        const sliceLen = Math.max(0, maxChars - THOUGHT_TRUNCATION_MARKER.length);
        finalThought = thought.slice(0, sliceLen) + THOUGHT_TRUNCATION_MARKER;
        truncated = true;
    }

    let estimatedTokens: number | undefined;
    if (options.planner !== undefined) {
        estimatedTokens = options.planner.measure(finalThought).inputTokens;
    }

    return Object.freeze({
        thought: finalThought,
        truncated,
        ...(estimatedTokens !== undefined ? { estimatedTokens } : {}),
    });
}

/**
 * 将经过安全截断的思考链包装为第二阶段提取时专用的推理依据上下文文本。
 *
 * @param thought - 经过安全截断后的思考链。
 * @returns 供模型作为上下文依据的指引文本。
 * @example
 * ```ts
 * const text = formatThinkingContext("我的思考过程...");
 * ```
 */
export function formatThinkingContext(thought: string): string {
    return `[Stage 1 Reasoning / CoT]\n${thought}\n\nBased on the reasoning above, provide your decision strictly adhering to the JSON Schema.`;
}
