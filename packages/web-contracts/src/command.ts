/**
 * Web 命令与响应结果的数据传输对象 (DTO)。
 *
 * @remarks
 * 类型与约束的唯一来源是 [`wire.ts`](./wire.ts)；本模块只保留既有公开导入路径。
 */

export type {
    AcceptedCommand,
    BrowserActionDetailsResult,
    BrowserGoalArchiveCommand,
    BrowserGoalArchiveResult,
    BrowserGoalDeleteResult,
    BrowserGoalPlanModeCommand,
    BrowserGoalPlanModeResult,
    BrowserModelPreferenceCommand,
    BrowserModelPreferenceOutcome,
    BrowserModelPreferenceResult,
    BrowserModelSelectionCommand,
    BrowserModelSelectionCommit,
    BrowserModelSelectionResult,
    BrowserPermissionExemptionResult,
    BrowserPermissionExemptionRevokeBody,
    BrowserPermissionExemptionRevokeCommand,
    BrowserPermissionExemptionSummary,
    BrowserPermissionProfile,
    BrowserPermissionProfileCommand,
    BrowserPermissionProfileResult,
    BrowserWorkspaceContext,
} from "./wire";
