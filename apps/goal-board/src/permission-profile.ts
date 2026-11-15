import type {
  BrowserPermissionExtraFile,
  BrowserPermissionProfile,
} from "../../../packages/web-contracts/src/index";

/** 权限设置入口可选的档位身份。 */
export type PermissionPresetId = "ask" | "auto" | "full" | "read-only";

/**
 * 一个可选权限档位的展示信息与提交值。
 *
 * @remarks
 * `profile` 是提交给服务端的完整三轴取值；缺少 `writableRoots` 的档位只表示不额外放行
 * 工作区外目录，用户已有配置在切换档位时会被覆盖为该值。
 *
 * @example
 * ```ts
 * const option = PERMISSION_PRESET_OPTIONS[0];
 * onChoose(option.profile);
 * ```
 */
export interface PermissionPresetOption {
  /** 稳定的档位身份，用于单选控件与展示关联。 */
  readonly id: PermissionPresetId;
  /** 档位名称。 */
  readonly label: string;
  /** 一句话说明该档位的执行范围与裁决方式。 */
  readonly description: string;
  /** 选择该档位时提交的完整档位值。 */
  readonly profile: BrowserPermissionProfile;
}

const ASK_PROFILE: BrowserPermissionProfile = {
  sandbox: "workspace-write",
  approvals: "on-request",
  reviewer: "user",
  writableRoots: [],
};

const AUTO_PROFILE: BrowserPermissionProfile = {
  sandbox: "workspace-write",
  approvals: "on-request",
  reviewer: "auto_review",
  writableRoots: [],
};

const FULL_PROFILE: BrowserPermissionProfile = {
  sandbox: "danger-full-access",
  approvals: "never",
  reviewer: "user",
  writableRoots: [],
};

const READ_ONLY_PROFILE: BrowserPermissionProfile = {
  sandbox: "read-only",
  approvals: "on-request",
  reviewer: "user",
  writableRoots: [],
};

/**
 * 权限入口展示的档位顺序与提交值。
 *
 * @remarks
 * 前三项对应服务端的权限档位预设，末项是本机只读自定义档位。顺序即界面顺序，
 * 不随服务端当前值变化。
 *
 * @example
 * ```ts
 * const full = PERMISSION_PRESET_OPTIONS.find(option => option.id === "full");
 * ```
 */
export const PERMISSION_PRESET_OPTIONS: readonly PermissionPresetOption[] = [
  {
    id: "ask",
    label: "Ask for approval",
    description: "Actions inside the workspace boundary run directly; anything that crosses it waits for you.",
    profile: ASK_PROFILE,
  },
  {
    id: "auto",
    label: "Approve for me",
    description: "Crossing actions are decided by fixed rules; only risky ones wait for you.",
    profile: AUTO_PROFILE,
  },
  {
    id: "full",
    label: "Full access",
    description: "No file or network boundary, except LazyGoal's own saved state.",
    profile: FULL_PROFILE,
  },
  {
    id: "read-only",
    label: "Read-only",
    description: "Read the workspace and run read-only commands; writes are refused.",
    profile: READ_ONLY_PROFILE,
  },
];

/**
 * 比较两个档位的三轴取值是否相同。
 *
 * @param left - 待比较的档位。
 * @param right - 待比较的档位。
 * @returns 三轴与 `writableRoots` 顺序均一致时返回 `true`。
 * @example
 * ```ts
 * const unchanged = permissionProfilesEqual(current, next);
 * ```
 */
export function permissionProfilesEqual(
  left: BrowserPermissionProfile,
  right: BrowserPermissionProfile,
): boolean {
  return left.sandbox === right.sandbox
    && left.approvals === right.approvals
    && left.reviewer === right.reviewer
    && left.writableRoots.length === right.writableRoots.length
    && left.writableRoots.every((root, index) => root === right.writableRoots[index]);
}

/**
 * 找出与服务端档位完全一致的预选项。
 *
 * @remarks
 * 服务端允许 `writableRoots` 等任意组合，因此没有完整匹配时返回 `undefined`，
 * 由调用方按自定义档位展示，不得归入最接近的预设。
 *
 * @param profile - 服务端当前档位。
 * @returns 匹配的预选项；没有完整匹配时返回 `undefined`。
 * @example
 * ```ts
 * const preset = permissionPresetOf(current.profile);
 * ```
 */
export function permissionPresetOf(profile: BrowserPermissionProfile): PermissionPresetOption | undefined {
  return PERMISSION_PRESET_OPTIONS.find((option) => permissionProfilesEqual(option.profile, profile));
}

/**
 * 档位在入口按钮上的展示名称。
 *
 * @param profile - 当前生效的档位。
 * @returns 预设名称；没有完整匹配时返回 `Custom`。
 * @example
 * ```ts
 * const label = permissionPresetLabel(profile);
 * ```
 */
export function permissionPresetLabel(profile: BrowserPermissionProfile): string {
  return permissionPresetOf(profile)?.label ?? "Custom";
}

/**
 * 档位三轴的展示文案。
 *
 * @remarks
 * 展示的是服务端真实取值，不是按钮文案的推断结果；未知取值原样返回，避免把未识别的
 * 档位显示成某个已知预设。
 *
 * @param profile - 当前生效的档位。
 * @returns 沙箱、审批策略与裁决者的英文展示名。
 * @example
 * ```ts
 * const axes = permissionAxisLabels(profile);
 * ```
 */
export function permissionAxisLabels(profile: BrowserPermissionProfile): {
  readonly sandbox: string;
  readonly approvals: string;
  readonly reviewer: string;
} {
  return {
    sandbox: profile.sandbox === "read-only" ? "Read-only"
      : profile.sandbox === "workspace-write" ? "Workspace write"
        : "Full access",
    approvals: profile.approvals === "on-request" ? "On request" : "Never",
    reviewer: profile.reviewer === "user" ? "You" : "Automatic review",
  };
}

/**
 * 边界豁免的网络范围展示文案。
 *
 * @remarks
 * `all_outbound` 必须显式说明包含本机回环地址的任意出站访问，不能只写“允许网络”，
 * 否则用户无法判断实际放行范围。
 *
 * @param network - 豁免记录中的网络取值。
 * @returns 描述实际放行范围的一句话。
 * @example
 * ```ts
 * const text = permissionNetworkLabel("all_outbound");
 * ```
 */
export function permissionNetworkLabel(network: "none" | "all_outbound"): string {
  return network === "all_outbound"
    ? "Any outbound network access, including loopback"
    : "No outbound network access";
}

/**
 * 单条额外文件的范围展示文案。
 *
 * @param file - 豁免记录中的额外文件条目。
 * @returns 方向、规范路径与目录树标记。
 * @example
 * ```ts
 * const text = permissionExtraFileLabel(file);
 * ```
 */
export function permissionExtraFileLabel(file: BrowserPermissionExtraFile): string {
  const direction = file.access === "write" ? "Write" : "Read";
  return `${direction} ${file.canonicalPath}${file.kind === "directory_tree" ? " (directory tree)" : ""}`;
}

/**
 * 豁免状态的展示文案。
 *
 * @param status - 豁免记录中的状态。
 * @returns 首字母大写的状态名。
 * @example
 * ```ts
 * const text = permissionExemptionStatusLabel("active");
 * ```
 */
export function permissionExemptionStatusLabel(status: "pending" | "active" | "revoked"): string {
  switch (status) {
    case "pending": return "Pending";
    case "active": return "Active";
    case "revoked": return "Revoked";
  }
}

/**
 * 权限提交失败或读取失败时的展示文案。
 *
 * @remarks
 * 版本冲突必须携带服务端当前值，避免用户以为提交已生效；读取不到当前值时只说明冲突，
 * 不猜测档位。
 *
 * @param error - 服务端返回的权限错误码。
 * @param current - 冲突或失败时刻读取到的服务端档位；未读取到时为 `null`。
 * @returns 可直接展示的一句话说明。
 * @example
 * ```ts
 * const message = describePermissionProfileFailure("conflict", current);
 * ```
 */
export function describePermissionProfileFailure(
  error: string,
  current: { readonly profile: BrowserPermissionProfile; readonly revision: number } | null,
): string {
  switch (error) {
    case "conflict":
      return current === null
        ? "Project permissions changed elsewhere. Reload before trying again."
        : `Project permissions changed elsewhere. The current value is ${permissionPresetLabel(current.profile)}`
          + ` (revision ${current.revision}). Choose a permission again to retry.`;
    case "permissions_unavailable":
      return "Project permissions are unavailable.";
    case "service_shutting_down":
      return "The service is shutting down. Try again after it restarts.";
    default:
      return "Could not save the permission level.";
  }
}
