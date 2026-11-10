/**
 * Supervisor 对工作 Trigger 的模型准入结果。
 *
 * @remarks
 * `accept` 只选择 shared/worktree 工作区策略；Goal 意图始终由原始 work material 提供。`ignore` 必须将工作区策略设为 `null` 且不产生 Goal。
 * 模型只能选择工作区策略，不能授予超出宿主与用户上限的文件或工具权限。
 *
 * @example
 * ```ts
 * const decision: TriggerAdmissionDecision = { kind: "accept", workspaceMode: "worktree" };
 * ```
 */
export interface TriggerAdmissionDecision {
    readonly kind: "accept" | "ignore";
    readonly workspaceMode: "shared" | "worktree" | null;
}
