/**
 * Supervisor 对工作 Trigger 的模型准入结果。
 *
 * @remarks
 * `accept` 必须提供可执行的独立 Goal 意图及 shared/worktree 选择；`ignore` 不产生 Goal。
 * 模型只能选择工作区策略，不能授予超出宿主与用户上限的文件或工具权限。
 *
 * @example
 * ```ts
 * const decision: TriggerAdmissionDecision = { kind: "accept", intent: "Summarize the report", workspaceMode: "worktree" };
 * ```
 */
export interface TriggerAdmissionDecision {
    readonly kind: "accept" | "ignore";
    readonly intent: string;
    readonly workspaceMode?: "shared" | "worktree";
}
