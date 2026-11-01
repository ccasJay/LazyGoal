import type { BrowserControlReceipt } from "../../../../packages/web-contracts/src/index";
import { modelSelectionOf } from "./results";

/** 一次模型选择命令的页面侧结论。 */
export type ModelSelectionOutcome =
  | {
      readonly kind: "applied";
      readonly modelId: string;
      /** 默认偏好子结果；未请求时为 `not_requested`。 */
      readonly preference: "saved" | "failed" | "not_requested";
    }
  | { readonly kind: "rejected"; readonly error: string; readonly refresh: boolean }
  | { readonly kind: "unknown" };

/**
 * 从控制收据读取模型选择与默认偏好的子结果。
 *
 * @remarks
 * 模型切换成功不会因偏好失败而回退：`preference: "failed"` 表示部分成功，
 * 页面应保留可重试入口。未知收据不推断选择结果。
 *
 * @param receipt - `model_selection` 的受理收据。
 * @returns 页面侧结论。
 * @example
 * ```ts
 * const outcome = modelSelectionOutcomeOf(receipt);
 * ```
 */
export function modelSelectionOutcomeOf(receipt: BrowserControlReceipt): ModelSelectionOutcome {
  if (receipt.status === "unknown") return { kind: "unknown" };
  if (receipt.status === "rejected") {
    return { kind: "rejected", error: receipt.error, refresh: receipt.refresh === true };
  }
  const selection = modelSelectionOf(receipt.result);
  if (selection === undefined) return { kind: "unknown" };
  return {
    kind: "applied",
    modelId: selection.selection.modelId,
    preference: selection.defaultPreference === undefined
      ? "not_requested"
      : selection.defaultPreference.ok ? "saved" : "failed",
  };
}
