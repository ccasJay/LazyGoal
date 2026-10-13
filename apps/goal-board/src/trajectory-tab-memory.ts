/**
 * 轨迹检查器 Tab 偏好与有效性解析。
 *
 * @remarks
 * 负责根据当前事件可用 Tab 列表与用户的偏好 Tab 计算实际生效的活动 Tab。
 * 当偏好 Tab 存在且属于可用 Tab 之一时采用偏好；
 * 否则优雅回退至 "Summary"（默认概览）。
 *
 * @param availableTabs - 当前事件支持展示的 Tab 名称集合。
 * @param preferredTab - 用户显式选中的偏好 Tab 名称，或 null/undefined。
 * @returns 最终生效的 Tab 名称；若偏好 Tab 可用则返回偏好 Tab，否则回退为 "Summary"。
 *
 * @example
 * ```ts
 * const active = resolveActiveDetailTab(["Summary", "Raw"], "Input");
 * // active === "Summary" (目标事件无 Input 载荷，优雅回退)
 *
 * const active2 = resolveActiveDetailTab(["Summary", "Input", "Raw"], "Input");
 * // active2 === "Input" (目标事件具备 Input 载荷，保持偏好)
 * ```
 */
export function resolveActiveDetailTab(
  availableTabs: readonly string[],
  preferredTab: string | null | undefined,
): string {
  if (preferredTab && availableTabs.includes(preferredTab)) {
    return preferredTab;
  }
  return "Summary";
}
