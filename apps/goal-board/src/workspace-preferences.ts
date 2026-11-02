import type { SessionTab } from "./types";

/** 工作区偏好的 cookie 名称前缀。 */
export const WORKSPACE_PREFERENCE_PREFIX = "lazygoal_workspace_";

/** 可恢复的界面位置。 */
export interface WorkspaceLayout {
  /** 侧栏是否折叠。 */
  readonly sidebarCollapsed: boolean;
  /** Activity 面板宽度档位。 */
  readonly activityWidth: "standard" | "wide";
  /** 上次打开的 Goal；没有选择时为 `null`。 */
  readonly selectedGoalId: string | null;
  /** 上次打开的视图。 */
  readonly view: SessionTab;
}

/**
 * 一份工作区偏好的解码结果。
 *
 * @remarks
 * `absent` 表示从未保存；`invalid` 表示存储内容缺失字段、类型不符或无法解析。
 * 解码不读取服务端状态，也不判断 Goal 是否仍然存在。
 *
 * @example
 * ```ts
 * const decoded = decodeWorkspacePreferences(readCookie(name));
 * ```
 */
export type PreferenceDecode =
  | { readonly kind: "absent" }
  | { readonly kind: "valid"; readonly value: WorkspaceLayout }
  | { readonly kind: "invalid"; readonly reason: string };

/**
 * 恢复界面位置时的最终结论。
 *
 * @remarks
 * `awaiting-identity` 表示尚未取得 `workspaceRoot`，此时不得应用任何已保存位置。
 * `defaulted` 表示使用默认布局并保留可操作反馈。
 *
 * @example
 * ```ts
 * const state: WorkspaceRestoreState = { kind: "defaulted", reason: "unreadable" };
 * ```
 */
export type WorkspaceRestoreState =
  | { readonly kind: "awaiting-identity" }
  | { readonly kind: "restored"; readonly value: WorkspaceLayout }
  | {
      readonly kind: "defaulted";
      readonly reason: "no-preference" | "unreadable" | "goal-unavailable" | "identity-unavailable";
    };

/**
 * 由工作区根目录派生稳定的偏好桶键。
 *
 * @remarks
 * 使用 FNV-1a 32 位散列并转成 36 进制字符串。键只用于隔离 cookie，不保存本机绝对路径；
 * 不同 root（包括不同 worktree）得到不同键，因此互不覆盖。
 *
 * @param workspaceRoot - 服务端报告的工作区根目录。
 * @returns 稳定的短键。
 * @example
 * ```ts
 * workspacePreferenceKey("/repo"); // "1x2y3z"
 * ```
 */
export function workspacePreferenceKey(workspaceRoot: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < workspaceRoot.length; index += 1) {
    hash ^= workspaceRoot.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** 由工作区根目录派生 cookie 名称。 */
export function workspacePreferenceCookieName(workspaceRoot: string): string {
  return `${WORKSPACE_PREFERENCE_PREFIX}${workspacePreferenceKey(workspaceRoot)}`;
}

/**
 * 编码一份界面位置。
 *
 * @param layout - 要保存的位置。
 * @returns 可直接写入 cookie 的值。
 * @example
 * ```ts
 * document.cookie = `${name}=${encodeWorkspacePreferences(layout)}; path=/`;
 * ```
 */
export function encodeWorkspacePreferences(layout: WorkspaceLayout): string {
  return encodeURIComponent(JSON.stringify(layout));
}

/**
 * 解码存储中的界面位置。
 *
 * @remarks
 * 这是界面侧唯一的运行时校验边界：cookie 可能缺失、被截断或被修改。任何不满足契约的
 * 内容都返回 `invalid`，不做默认填充，也不尝试部分恢复。
 *
 * @param raw - cookie 原始值；缺失时传 `undefined`。
 * @returns 解码结果。
 * @example
 * ```ts
 * if (decodeWorkspacePreferences(raw).kind === "invalid") useDefaultLayout();
 * ```
 */
export function decodeWorkspacePreferences(raw: string | undefined): PreferenceDecode {
  if (raw === undefined || raw.length === 0) return { kind: "absent" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return { kind: "invalid", reason: "unreadable" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { kind: "invalid", reason: "not-an-object" };
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.sidebarCollapsed !== "boolean") return { kind: "invalid", reason: "sidebar-collapsed" };
  if (record.activityWidth !== "standard" && record.activityWidth !== "wide") {
    return { kind: "invalid", reason: "activity-width" };
  }
  if (record.selectedGoalId !== null && typeof record.selectedGoalId !== "string") {
    return { kind: "invalid", reason: "selected-goal" };
  }
  if (!isSessionTab(record.view)) return { kind: "invalid", reason: "view" };
  return {
    kind: "valid",
    value: {
      sidebarCollapsed: record.sidebarCollapsed,
      activityWidth: record.activityWidth,
      selectedGoalId: record.selectedGoalId,
      view: record.view,
    },
  };
}

/**
 * 组合身份、解码与 Goal 可用性，得出恢复结论。
 *
 * @remarks
 * 身份未就绪时一律不应用已保存位置；所选 Goal 已不存在或不可访问时退回默认布局。
 *
 * @param input - 工作区身份状态、解码结果与所选 Goal 是否仍可用。
 * @returns 恢复结论。
 * @example
 * ```ts
 * selectWorkspaceRestoreState({ identity: "ready", decode, goalAvailable: true });
 * ```
 */
export function selectWorkspaceRestoreState(input: {
  readonly identity: "pending" | "ready" | "unavailable";
  readonly decode: PreferenceDecode;
  readonly goalAvailable: boolean;
}): WorkspaceRestoreState {
  if (input.identity === "pending") return { kind: "awaiting-identity" };
  if (input.identity === "unavailable") return { kind: "defaulted", reason: "identity-unavailable" };
  if (input.decode.kind === "absent") return { kind: "defaulted", reason: "no-preference" };
  if (input.decode.kind === "invalid") return { kind: "defaulted", reason: "unreadable" };
  if (input.decode.value.selectedGoalId !== null && !input.goalAvailable) {
    return { kind: "defaulted", reason: "goal-unavailable" };
  }
  return { kind: "restored", value: input.decode.value };
}

/**
 * 把恢复结论转成用户可见说明。
 *
 * @param state - 恢复结论。
 * @returns 需要提示时的英文说明；正常恢复时返回 `undefined`。
 * @example
 * ```ts
 * restoreNotice({ kind: "defaulted", reason: "unreadable" });
 * ```
 */
export function restoreNotice(state: WorkspaceRestoreState): string | undefined {
  if (state.kind !== "defaulted") return undefined;
  switch (state.reason) {
    case "no-preference": return undefined;
    case "unreadable": return "Saved layout could not be read. Using the default layout.";
    case "goal-unavailable": return "The last opened Goal is no longer available. Showing Goals.";
    case "identity-unavailable": return "This workspace could not be identified. Layout will not be restored.";
  }
}

function isSessionTab(value: unknown): value is SessionTab {
  return value === "Board" || value === "Activity" || value === "Plan" || value === "Trajectory";
}
