import type {
  BrowserActionReview,
  BrowserControlIntentResult,
  BrowserModelSelectionResult,
  BrowserPermissionModeResult,
  BrowserToolGrantSummary,
} from "../../../../packages/web-contracts/src/index";

/**
 * 从统一控制结果中取出 Grant 摘要。
 *
 * @param result - `grant_revoke` 的原始结果。
 * @returns 更新后的摘要；结果不属于 Grant 撤销时返回 `undefined`。
 * @example
 * ```ts
 * const grants = grantsOf(receipt.result);
 * ```
 */
export function grantsOf(result: BrowserControlIntentResult): readonly BrowserToolGrantSummary[] | undefined {
  if (typeof result !== "object" || result === null || !("grants" in result)) return undefined;
  return (result as { readonly grants: readonly BrowserToolGrantSummary[] }).grants;
}

/**
 * 从统一控制结果中取出权限模式投影。
 *
 * @param result - `permission_mode` 的原始结果。
 * @returns 成功结果；失败或其它命令时返回 `undefined`。
 * @example
 * ```ts
 * const permission = permissionOf(receipt.result);
 * ```
 */
export function permissionOf(
  result: BrowserControlIntentResult,
): Extract<BrowserPermissionModeResult, { readonly ok: true }> | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  if (!("ok" in result) || result.ok !== true || !("mode" in result) || !("revision" in result)) return undefined;
  return result as Extract<BrowserPermissionModeResult, { readonly ok: true }>;
}

/**
 * 从统一控制结果中取出模型选择投影。
 *
 * @param result - `model_selection` 的原始结果。
 * @returns 成功结果；失败或其它命令时返回 `undefined`。
 * @example
 * ```ts
 * const selection = modelSelectionOf(receipt.result);
 * ```
 */
export function modelSelectionOf(
  result: BrowserControlIntentResult,
): Extract<BrowserModelSelectionResult, { readonly ok: true }> | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  if (!("ok" in result) || result.ok !== true) return undefined;
  if (!("goalId" in result) || !("runId" in result) || !("modelId" in result)) return undefined;
  if (!("defaultModelSaved" in result)) return undefined;
  return result as Extract<BrowserModelSelectionResult, { readonly ok: true }>;
}

/**
 * 从统一控制结果中取出 Action 预检。
 *
 * @param result - `action_review` 的原始结果。
 * @returns 预检内容；失败或其它命令时返回 `undefined`。
 * @example
 * ```ts
 * const review = reviewOf(receipt.result);
 * ```
 */
export function reviewOf(result: BrowserControlIntentResult): BrowserActionReview | undefined {
  if (typeof result !== "object" || result === null || !("review" in result)) return undefined;
  return (result as { readonly review: BrowserActionReview }).review;
}
