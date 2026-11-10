/**
 * Supervisor 对一次受限 Action 的单次权限决定。
 *
 * @remarks
 * `approve` 只允许当前 Action 一次，不创建持续 Grant；拒绝必须给出非空理由。
 * 该决定不能扩大 Goal 冻结的工具或沙箱范围，Runtime 在执行边界重新强制授权。
 *
 * @example
 * ```ts
 * const decision: SupervisorPermissionDecision = { kind: "approve" };
 * ```
 */
export type SupervisorPermissionDecision =
    | { readonly kind: "approve" }
    | { readonly kind: "reject"; readonly reason: string };

/**
 * Supervisor 权限判断在 JSON Schema 边界使用的可移植结构。
 *
 * @remarks
 * 该结构刻意保留字符串枚举与显式 null，避免输出 Schema 依赖 Provider 不支持的 `const`。
 * `kind` 与 `reason` 的组合语义由消费端执行校验。
 *
 * @example
 * ```ts
 * const wire: SupervisorPermissionDecisionWire = { kind: "approve", reason: null };
 * ```
 */
export interface SupervisorPermissionDecisionWire {
    /** 由消费端结合 `reason` 校验的决定种类。 */
    readonly kind: "approve" | "reject";
    /** `approve` 必须为 `null`；`reject` 必须为非空原因。 */
    readonly reason: string | null;
}
