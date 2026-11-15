import type { PermissionProfile } from "./types";

/**
 * 面向用户的权限档位预设。
 *
 * @remarks
 * 三档都允许工作区树读写、`.git` 读取与常规本机命令；差异只在沙箱边界与越界裁决。
 * `ask` 与 `auto` 只在越界时需要裁决，区别是裁决者；`full` 取消文件与网络边界，只保留
 * `.lazygoal` 内部状态不可访问。`full` 的 `reviewer` 固定为 `user`，因为 `approvals` 为
 * `never` 时 `reviewer` 不参与判定。
 *
 * @example
 * ```ts
 * const profile: PermissionProfile = PERMISSION_PRESETS.auto;
 * ```
 */
export const PERMISSION_PRESETS = {
    ask: {
        sandbox: "workspace-write",
        approvals: "on-request",
        reviewer: "user",
        writableRoots: [],
    },
    auto: {
        sandbox: "workspace-write",
        approvals: "on-request",
        reviewer: "auto_review",
        writableRoots: [],
    },
    full: {
        sandbox: "danger-full-access",
        approvals: "never",
        reviewer: "user",
        writableRoots: [],
    },
} as const satisfies Record<string, PermissionProfile>;

/**
 * 工作区尚未保存档位时生效的默认档位。
 *
 * @remarks
 * 等价于 `PERMISSION_PRESETS.ask`：边界内的 Action 直接执行，越界 Action 等待人工审阅。
 *
 * @example
 * ```ts
 * const profile: PermissionProfile = DEFAULT_PERMISSION_PROFILE;
 * ```
 */
export const DEFAULT_PERMISSION_PROFILE: PermissionProfile = PERMISSION_PRESETS.ask;
