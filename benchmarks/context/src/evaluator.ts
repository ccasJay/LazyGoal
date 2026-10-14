import type { JudgeRecord } from "./judge.js";
/**
 * 评分结果保留确定性事实、Judge 完整性与隔离违规。
 * @example
 * ```ts
 * const result = evaluate(true, judge, 0.8, []);
 * ```
 */
export interface ContextScore {
    readonly deterministic: boolean | null;
    readonly judge: JudgeRecord | null;
    readonly violations: readonly string[];
    readonly combined: "passed" | "failed" | "incomplete";
}
/** 已知失败优先；Judge 高分与评分缺失均不能覆盖确定性失败。 */
export function evaluate(deterministic: boolean | null, judge: JudgeRecord | null, threshold: number, violations: readonly string[]): ContextScore {
    const combined = violations.length || deterministic === false ? "failed"
        : deterministic === null || judge?.status !== "complete" ? "incomplete"
        : judge.score! >= threshold ? "passed" : "failed";
    return { deterministic, judge, violations, combined };
}
