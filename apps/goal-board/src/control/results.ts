import type {
  BrowserActionReview,
  BrowserControlIntentResult,
  BrowserModelSelectionResult,
  BrowserPermissionExemptionSummary,
  BrowserPermissionProfileResult,
} from "../../../../packages/web-contracts/src/index";

/**
 * 从统一控制结果中取出边界豁免摘要。
 *
 * @param result - `exemption_revoke` 的控制结果信封。
 * @returns 更新后的豁免列表；命令类型不符或结果失败时返回 `undefined`。
 * @example
 * ```ts
 * const exemptions = exemptionsOf(receipt.result);
 * ```
 */
export function exemptionsOf(
  result: BrowserControlIntentResult,
): readonly BrowserPermissionExemptionSummary[] | undefined {
  if (result.kind !== "exemption_revoke" || !result.result.ok) return undefined;
  return result.result.exemptions;
}

/**
 * 从统一控制结果中取出权限档位投影。
 *
 * @param result - `permission_profile` 的控制结果信封。
 * @returns 成功结果；命令类型不符或结果失败时返回 `undefined`。
 * @example
 * ```ts
 * const permission = permissionProfileOf(receipt.result);
 * ```
 */
export function permissionProfileOf(
  result: BrowserControlIntentResult,
): Extract<BrowserPermissionProfileResult, { readonly ok: true }> | undefined {
  if (result.kind !== "permission_profile" || !result.result.ok) return undefined;
  return result.result;
}

/**
 * 从统一控制结果中取出模型选择投影。
 *
 * @param result - `model_selection` 的控制结果信封。
 * @returns 成功结果；命令类型不符或结果失败时返回 `undefined`。
 * @example
 * ```ts
 * const selection = modelSelectionOf(receipt.result);
 * ```
 */
export function modelSelectionOf(
  result: BrowserControlIntentResult,
): Extract<BrowserModelSelectionResult, { readonly ok: true }> | undefined {
  if (result.kind !== "model_selection" || !result.result.ok) return undefined;
  return result.result;
}

/**
 * 从统一控制结果中取出 Action 预检。
 *
 * @param result - `action_review` 的控制结果信封。
 * @returns 预检内容；命令类型不符或结果失败时返回 `undefined`。
 * @example
 * ```ts
 * const review = reviewOf(receipt.result);
 * ```
 */
export function reviewOf(result: BrowserControlIntentResult): BrowserActionReview | undefined {
  if (result.kind !== "action_review" || !result.result.ok) return undefined;
  return result.result.review;
}
