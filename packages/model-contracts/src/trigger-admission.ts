/**
 * Supervisor 对工作 Trigger 的模型准入结果。
 *
 * @remarks
 * `accept` 必须提供可执行的独立 Goal 意图；`ignore` 的意图为空且不产生 Goal。模型结果只决定
 * 是否准入，不能授予超出宿主与用户上限的权限。
 *
 * @example
 * ```ts
 * const decision: TriggerAdmissionDecision = { kind: "accept", intent: "Summarize the report" };
 * ```
 */
export interface TriggerAdmissionDecision {
    readonly kind: "accept" | "ignore";
    readonly intent: string;
}
