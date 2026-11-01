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
 * @param result - `grant_revoke` 的控制结果信封。
 * @returns 更新后的摘要；命令类型不符或结果失败时返回 `undefined`。
 * @example
 * ```ts
 * const grants = grantsOf(receipt.result);
 * ```
 */
export function grantsOf(result: BrowserControlIntentResult): readonly BrowserToolGrantSummary[] | undefined {
  if (result.kind !== "grant_revoke" || !result.result.ok) return undefined;
  return result.result.grants;
}

/**
 * 从统一控制结果中取出权限模式投影。
 *
 * @param result - `permission_mode` 的控制结果信封。
 * @returns 成功结果；命令类型不符或结果失败时返回 `undefined`。
 * @example
 * ```ts
 * const permission = permissionOf(receipt.result);
 * ```
 */
export function permissionOf(
  result: BrowserControlIntentResult,
): Extract<BrowserPermissionModeResult, { readonly ok: true }> | undefined {
  if (result.kind !== "permission_mode" || !result.result.ok) return undefined;
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
