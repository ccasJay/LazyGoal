import { contract } from "../contract";
import type { InferContract } from "../types";
import { ContractValidationError } from "../errors";

/** 完成审查只接受候选或返回缺口，不生成业务决策。 */
export const CompletionReviewResultContract = contract.discriminatedUnion("kind", [
    contract.object({ kind: contract.literal("accept") }),
    contract.object({
        kind: contract.literal("reject"),
        feedback: contract.string(),
    }),
]);

/**
 * 对已校验完成候选的模型审查结果。
 *
 * @remarks 接受不代表提交成功；拒绝反馈由 Runtime 界限化后进入 Decide 纠错链，不能作为证据。
 * @example
 * ```ts
 * const result: CompletionReviewResult = { kind: "reject", feedback: "Read the implementation before judging its behavior." };
 * ```
 */
export type CompletionReviewResult = InferContract<typeof CompletionReviewResultContract>;

/**
 * 在已解码的模型 JSON 边界拒绝空白审查反馈。
 * @param result - 通过结构契约的模型审查结果。
 * @returns 可用于 Runtime 反馈的审查结果。
 * @throws ContractValidationError 拒绝结果未指出任何缺口时抛出。
 * @example
 * ```ts
 * const result = validateCompletionReviewResult({ kind: "accept" });
 * ```
 */
export function validateCompletionReviewResult(result: CompletionReviewResult): CompletionReviewResult {
    if (result.kind === "reject" && result.feedback.trim().length === 0) {
        throw new ContractValidationError([{ code: "string_pattern", path: ["result", "feedback"], message: "Reject feedback must describe a concrete gap." }], false);
    }
    return result;
}
