import { contract } from "../../../contracts/src/index";
import {
    browserNonEmptyStringContract,
    browserToolGrantExtraFileContract,
} from "./common";

/** 受理的异步命令公共基础载荷。 */
export const acceptedCommandContract = contract.openObject({
    goalId: browserNonEmptyStringContract,
    runId: browserNonEmptyStringContract,
    existing: contract.boolean(),
});

/** 切换计划模式命令。 */
export const browserGoalPlanModeCommandContract = contract.object({
    runId: browserNonEmptyStringContract,
});

/** 切换计划模式结果。 */
export const browserGoalPlanModeResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        goalId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        existing: contract.boolean(),
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.enum([
            "goal_not_found",
            "stale_run",
            "goal_busy",
            "plan_mode_busy",
            "plan_mode_failed",
            "service_shutting_down",
        ] as const),
    }),
]);

/** 选定执行模型命令。 */
export const browserModelSelectionCommandContract = contract.object({
    runId: browserNonEmptyStringContract,
    modelId: browserNonEmptyStringContract,
    providerProfileId: contract.optional(browserNonEmptyStringContract),
});

/** 模型选择结果。 */
export const browserModelSelectionResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        goalId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        modelId: browserNonEmptyStringContract,
        defaultModelSaved: contract.boolean(),
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.enum([
            "goal_not_found",
            "stale_run",
            "goal_busy",
            "model_switch_not_allowed",
            "model_not_selectable",
            "model_catalog_unavailable",
            "model_selection_failed",
            "service_shutting_down",
        ] as const),
    }),
]);

/** 设置工作区默认模型偏好命令。 */
export const browserModelPreferenceCommandContract = contract.object({
    modelId: browserNonEmptyStringContract,
    providerProfileId: contract.optional(browserNonEmptyStringContract),
});

/** 设置工作区默认模型偏好结果。 */
export const browserModelPreferenceResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        modelId: browserNonEmptyStringContract,
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.string(),
    }),
]);

/** 授权摘要条目。 */
export const browserToolGrantSummaryContract = contract.openObject({
    grantId: browserNonEmptyStringContract,
    scope: contract.enum(["goal", "workspace"] as const),
    toolId: browserNonEmptyStringContract,
    status: contract.enum(["pending", "active", "revoked"] as const),
    kind: contract.optional(contract.enum(["tool", "sandbox"] as const)),
    targetPath: contract.optional(contract.string()),
    command: contract.optional(contract.string()),
    network: contract.optional(contract.enum(["none", "all_outbound"] as const)),
    extraFiles: contract.optional(contract.array(browserToolGrantExtraFileContract)),
});

/** Action 完整输入查询结果。 */
export const browserActionDetailsResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        goalId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        actionId: browserNonEmptyStringContract,
        toolId: browserNonEmptyStringContract,
        input: contract.unknown(),
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.enum([
            "goal_not_found",
            "stale_run",
            "action_not_waiting",
            "action_details_unavailable",
        ] as const),
    }),
]);

/** 工具授权查询或撤销结果。 */
export const browserToolGrantResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        goalId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        grants: contract.array(browserToolGrantSummaryContract),
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.enum([
            "goal_not_found",
            "stale_run",
            "permissions_unavailable",
            "grant_failed",
            "service_shutting_down",
        ] as const),
    }),
]);

/** 撤销工具授权命令。 */
export const browserToolGrantRevokeCommandContract = contract.object({
    runId: browserNonEmptyStringContract,
    grantId: browserNonEmptyStringContract,
    scope: contract.enum(["goal", "workspace"] as const),
    kind: contract.optional(contract.enum(["tool", "sandbox"] as const)),
});

/** 项目权限模式。 */
export const browserPermissionModeContract = contract.enum(["default", "yolo"] as const);

/** 变更权限模式命令。 */
export const browserPermissionModeCommandContract = contract.object({
    mode: browserPermissionModeContract,
    expectedRevision: contract.integer({ minimum: 0 }),
});

/** 权限模式变更结果。 */
export const browserPermissionModeResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        mode: browserPermissionModeContract,
        revision: contract.integer(),
        workspaceId: browserNonEmptyStringContract,
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.enum([
            "permissions_unavailable",
            "conflict",
            "service_shutting_down",
        ] as const),
        actualRevision: contract.optional(contract.integer()),
    }),
]);

/** 当前工作区上下文视图。 */
export const browserWorkspaceContextContract = contract.openObject({
    workspaceRoot: browserNonEmptyStringContract,
    worktreeRoot: contract.nullable(browserNonEmptyStringContract),
    branch: contract.nullable(browserNonEmptyStringContract),
});

/** 归档或恢复 Goal 的 wire 命令。 */
export const browserGoalArchiveCommandContract = contract.object({
    archived: contract.boolean(),
});

/** 归档 Goal 结果。 */
export const browserGoalArchiveResultContract = contract.union([
    contract.openObject({ ok: contract.literal(true) }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.string(),
    }),
]);

/** 删除 Goal 结果。 */
export const browserGoalDeleteResultContract = contract.union([
    contract.openObject({ ok: contract.literal(true) }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.string(),
    }),
]);

/** 本模块建立的命令与结果合同。 */
export const commandWebContracts = [
    acceptedCommandContract,
    browserGoalPlanModeCommandContract,
    browserGoalPlanModeResultContract,
    browserModelSelectionCommandContract,
    browserModelSelectionResultContract,
    browserModelPreferenceCommandContract,
    browserModelPreferenceResultContract,
    browserToolGrantSummaryContract,
    browserActionDetailsResultContract,
    browserToolGrantResultContract,
    browserToolGrantRevokeCommandContract,
    browserPermissionModeContract,
    browserPermissionModeCommandContract,
    browserPermissionModeResultContract,
    browserWorkspaceContextContract,
    browserGoalArchiveCommandContract,
    browserGoalArchiveResultContract,
    browserGoalDeleteResultContract,
] as const;
