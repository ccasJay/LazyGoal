import type {
    BrowserAskUserAnswer,
    BrowserToolGrantExtraFile,
} from "./session";

/**
 * Web 命令与响应结果的数据传输对象 (DTO)。
 *
 * @remarks
 * 定义前端向本地后端发起 Goal 编排、消息发送、授权修改及模型切换的通信协议。
 */

/**
 * 受理的异步命令公共基础载荷。
 *
 * @example
 * ```ts
 * const accepted: AcceptedCommand = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     existing: false,
 * };
 * ```
 */
export interface AcceptedCommand {
    readonly goalId: string;
    readonly runId: string;
    readonly existing: boolean;
}

/**
 * 创建新 Goal 的输入命令。
 *
 * @remarks
 * goalId 由前端预先生成以实现天然幂等。
 *
 * @example
 * ```ts
 * const cmd: BrowserCreateGoalCommand = {
 *     goalId: "goal-1",
 *     intent: "实现功能解耦",
 * };
 * ```
 */
export interface BrowserCreateGoalCommand {
    /** 幂等 Goal 标识。 */
    readonly goalId: string;
    /** 用户原始意图。 */
    readonly intent: string;
    /** 初始运行模式。 */
    readonly mode?: "plan";
    /** 显式选定的模型标识。 */
    readonly modelId?: string;
}

/**
 * 创建 Goal 命令的处理结果。
 *
 * @remarks
 * 服务关闭开始后，尚未启动 Launcher 的创建命令以 `service_shutting_down` 拒绝。
 *
 * @example
 * ```ts
 * const res: BrowserCreateGoalResult = {
 *     ok: true,
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     existing: false,
 * };
 * ```
 */
export type BrowserCreateGoalResult =
    | {
        readonly ok: true;
        readonly goalId: string;
        readonly runId: string;
        readonly existing: boolean;
    }
    | {
        readonly ok: false;
        readonly error:
            | "invalid_goal_input"
            | "goal_id_conflict"
            | "goal_busy"
            | "model_not_selectable"
            | "model_catalog_unavailable"
            | "goal_create_failed"
            | "service_shutting_down";
    };

/**
 * 切换计划模式命令。
 *
 * @example
 * ```ts
 * const cmd: BrowserGoalPlanModeCommand = { runId: "run-1" };
 * ```
 */
export interface BrowserGoalPlanModeCommand {
    /** 目标 Run 标识。 */
    readonly runId: string;
}

/**
 * 切换计划模式结果。
 *
 * @remarks
 * 服务关闭开始后，尚未进入 Runtime 的命令以 `service_shutting_down` 拒绝。
 *
 * @example
 * ```ts
 * const res: BrowserGoalPlanModeResult = {
 *     ok: true,
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     existing: false,
 * };
 * ```
 */
export type BrowserGoalPlanModeResult =
    | {
        readonly ok: true;
        readonly goalId: string;
        readonly runId: string;
        readonly existing: boolean;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "goal_busy"
            | "plan_mode_busy"
            | "plan_mode_failed"
            | "service_shutting_down";
    };

/**
 * 选定执行模型命令。
 *
 * @example
 * ```ts
 * const cmd: BrowserModelSelectionCommand = {
 *     runId: "run-1",
 *     modelId: "gpt-4o",
 * };
 * ```
 */
export interface BrowserModelSelectionCommand {
    /** 当前 Run 标识。 */
    readonly runId: string;
    /** 选中的模型标识。 */
    readonly modelId: string;
}

/**
 * 模型选择结果。
 *
 * @remarks
 * 服务关闭开始后，尚未进入持久化的命令以 `service_shutting_down` 拒绝。
 *
 * @example
 * ```ts
 * const res: BrowserModelSelectionResult = {
 *     ok: true,
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     modelId: "gpt-4o",
 *     defaultModelSaved: true,
 * };
 * ```
 */
export type BrowserModelSelectionResult =
    | {
        readonly ok: true;
        readonly goalId: string;
        readonly runId: string;
        readonly modelId: string;
        readonly defaultModelSaved: boolean;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "goal_busy"
            | "model_switch_not_allowed"
            | "model_not_selectable"
            | "model_catalog_unavailable"
            | "model_selection_failed"
            | "service_shutting_down";
    };

/**
 * 设置工作区默认模型偏好命令。
 *
 * @example
 * ```ts
 * const cmd: BrowserModelPreferenceCommand = { modelId: "gpt-4o" };
 * ```
 */
export interface BrowserModelPreferenceCommand {
    /** 目标模型标识。 */
    readonly modelId: string;
}

/**
 * 设置工作区默认模型偏好结果。
 *
 * @example
 * ```ts
 * const res: BrowserModelPreferenceResult = { ok: true, modelId: "gpt-4o" };
 * ```
 */
export type BrowserModelPreferenceResult =
    | { readonly ok: true; readonly modelId: string }
    | { readonly ok: false; readonly error: string };

/**
 * 授权摘要条目。
 *
 * @example
 * ```ts
 * const grant: BrowserToolGrantSummary = {
 *     grantId: "g-1",
 *     scope: "goal",
 *     toolId: "bash",
 *     status: "active",
 * };
 * ```
 */
export interface BrowserToolGrantSummary {
    /** 授权标识。 */
    readonly grantId: string;
    /** 授权作用域。 */
    readonly scope: "goal" | "workspace";
    /** 工具标识。 */
    readonly toolId: string;
    /** 授权状态。 */
    readonly status: "pending" | "active" | "revoked";
    /** 授权分类。 */
    readonly kind?: "tool" | "sandbox";
    /** 目标路径白名单。 */
    readonly targetPath?: string;
    /** 允许的命令。 */
    readonly command?: string;
    /** 网络访问能力。 */
    readonly network?: "none" | "all_outbound";
    /** 额外访问文件列表。 */
    readonly extraFiles?: readonly BrowserToolGrantExtraFile[];
}

/**
 * Action 完整输入查询结果。
 *
 * @example
 * ```ts
 * const res: BrowserActionDetailsResult = {
 *     ok: true,
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     actionId: "act-1",
 *     toolId: "bash",
 *     input: { command: "ls" },
 * };
 * ```
 */
export type BrowserActionDetailsResult =
    | {
        readonly ok: true;
        readonly goalId: string;
        readonly runId: string;
        readonly actionId: string;
        readonly toolId: string;
        readonly input: unknown;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "action_not_waiting"
            | "action_details_unavailable";
    };

/**
 * 工具授权查询或撤销结果。
 *
 * @remarks
 * 关闭期间拒绝新的授权撤销，并以 `service_shutting_down` 标记。
 *
 * @example
 * ```ts
 * const res: BrowserToolGrantResult = {
 *     ok: true,
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     grants: [],
 * };
 * ```
 */
export type BrowserToolGrantResult =
    | {
        readonly ok: true;
        readonly goalId: string;
        readonly runId: string;
        readonly grants: readonly BrowserToolGrantSummary[];
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "permissions_unavailable"
            | "grant_failed"
            | "service_shutting_down";
    };

/**
 * 撤销工具授权命令。
 *
 * @example
 * ```ts
 * const cmd: BrowserToolGrantRevokeCommand = {
 *     runId: "run-1",
 *     grantId: "g-1",
 *     scope: "goal",
 * };
 * ```
 */
export interface BrowserToolGrantRevokeCommand {
    /** 当前 Run 标识。 */
    readonly runId: string;
    /** 待撤销授权标识。 */
    readonly grantId: string;
    /** 作用域。 */
    readonly scope: "goal" | "workspace";
    /** 授权分类。 */
    readonly kind?: "tool" | "sandbox";
}

/**
 * 项目权限模式。
 *
 * @example
 * ```ts
 * const mode: BrowserPermissionMode = "default";
 * ```
 */
export type BrowserPermissionMode = "default" | "yolo";

/**
 * 变更权限模式命令。
 *
 * @example
 * ```ts
 * const cmd: BrowserPermissionModeCommand = {
 *     mode: "yolo",
 *     expectedRevision: 1,
 * };
 * ```
 */
export interface BrowserPermissionModeCommand {
    /** 目标模式。 */
    readonly mode: BrowserPermissionMode;
    /** 期望版本（乐观并发控制）。 */
    readonly expectedRevision: number;
}

/**
 * 权限模式变更结果。
 *
 * @remarks
 * 关闭期间拒绝新的权限模式写入，并以 `service_shutting_down` 标记。
 *
 * @example
 * ```ts
 * const res: BrowserPermissionModeResult = {
 *     ok: true,
 *     mode: "yolo",
 *     revision: 2,
 *     workspaceId: "ws-1",
 * };
 * ```
 */
export type BrowserPermissionModeResult =
    | {
        readonly ok: true;
        readonly mode: BrowserPermissionMode;
        readonly revision: number;
        readonly workspaceId: string;
    }
    | {
        readonly ok: false;
        readonly error: "permissions_unavailable" | "conflict" | "service_shutting_down";
        readonly actualRevision?: number;
    };

/**
 * 当前工作区上下文视图。
 *
 * @example
 * ```ts
 * const ws: BrowserWorkspaceContext = {
 *     workspaceRoot: "/path/to/project",
 *     worktreeRoot: null,
 *     branch: "main",
 * };
 * ```
 */
export interface BrowserWorkspaceContext {
    /** 工作区真实根目录。 */
    readonly workspaceRoot: string;
    /** Git worktree 根目录（若存在）。 */
    readonly worktreeRoot: string | null;
    /** 当前 Git 分支（若存在）。 */
    readonly branch: string | null;
}

/**
 * 发送用户消息命令。
 *
 * @example
 * ```ts
 * const cmd: BrowserGoalMessageCommand = {
 *     runId: "run-1",
 *     content: "继续推进",
 * };
 * ```
 */
export interface BrowserGoalMessageCommand {
    /** 当前 Run 标识。 */
    readonly runId: string;
    /** 消息文本。 */
    readonly content: string;
}

/**
 * 运行中向同一 Run 补充要求的 Steer 命令。
 *
 * @remarks 服务器只有在持久化受理后才确认发送；超时重试复用相同身份与正文。
 * @example
 * ```ts
 * const command: BrowserGoalSteerCommand = { runId: "run-1", messageId: "message-1", content: "保留接口" };
 * ```
 */
export interface BrowserGoalSteerCommand {
    /** 当前 Run 标识。 */
    readonly runId: string;
    /** 客户端生成的幂等消息身份。 */
    readonly messageId: string;
    /** 非空 Steer 正文。 */
    readonly content: string;
}

/**
 * Steer 持久化受理结果。
 *
 * @remarks `existing` 表示同一消息身份此前已经受理；拒绝时输入应保留在客户端。
 * @example
 * ```ts
 * const result: BrowserGoalSteerResult = { ok: true, goalId: "goal-1", runId: "run-1", messageId: "message-1", existing: false };
 * ```
 */
export type BrowserGoalSteerResult =
    | { readonly ok: true; readonly goalId: string; readonly runId: string; readonly messageId: string; readonly existing: boolean }
    | { readonly ok: false; readonly error: "goal_not_found" | "stale_run" | "goal_not_running" | "goal_busy" | "steer_conflict" | "steer_failed" | "service_shutting_down" };

/**
 * 发送用户消息结果。
 *
 * @remarks
 * 服务关闭开始后，尚未进入 Runtime 的命令以 `service_shutting_down` 拒绝。
 *
 * @example
 * ```ts
 * const res: BrowserGoalMessageResult = {
 *     ok: true,
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     existing: false,
 * };
 * ```
 */
export type BrowserGoalMessageResult =
    | {
        readonly ok: true;
        readonly goalId: string;
        readonly runId: string;
        readonly existing: boolean;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "goal_busy"
            | "goal_not_waiting"
            | "goal_not_completed"
            | "structured_interaction_required"
            | "model_restore_failed"
            | "message_conflict"
            | "invalid_message"
            | "message_failed"
            | "service_shutting_down";
    };

/**
 * 结构化交互操作命令。
 *
 * @remarks
 * `cancel_ask_user` 仅取消匹配 request ID 的结构化询问，并继续同一 Run；它不会终止 Run。
 *
 * @example
 * ```ts
 * const cmd: BrowserGoalInteractionCommand = {
 *     kind: "approve_task",
 *     runId: "run-1",
 *     requestId: "req-1",
 * };
 * const cancel: BrowserGoalInteractionCommand = {
 *     kind: "cancel_ask_user", runId: "run-1", requestId: "ask-1",
 * };
 * ```
 */
export type BrowserGoalInteractionCommand =
    | {
        readonly kind: "answer_ask_user";
        readonly runId: string;
        readonly requestId: string;
        readonly answers: readonly BrowserAskUserAnswer[];
    }
    | {
        readonly kind: "cancel_ask_user";
        readonly runId: string;
        readonly requestId: string;
    }
    | {
        readonly kind: "approve_task";
        readonly runId: string;
        readonly requestId: string;
    }
    | {
        readonly kind: "feedback_task";
        readonly runId: string;
        readonly requestId: string;
        readonly feedback: string;
    }
    | {
        readonly kind: "approve_action";
        readonly runId: string;
        readonly actionId: string;
        readonly scope?: "action" | "goal" | "workspace";
    }
    | {
        readonly kind: "reject_action";
        readonly runId: string;
        readonly actionId: string;
        readonly reason: string;
    };

/**
 * 结构化交互结果。
 *
 * @remarks
 * 服务关闭开始后，尚未进入 Runtime 的命令以 `service_shutting_down` 拒绝。
 *
 * @example
 * ```ts
 * const res: BrowserGoalInteractionResult = {
 *     ok: true,
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     existing: false,
 * };
 * ```
 */
export type BrowserGoalInteractionResult =
    | {
        readonly ok: true;
        readonly goalId: string;
        readonly runId: string;
        readonly existing: boolean;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "goal_not_waiting"
            | "stale_request"
            | "action_not_waiting"
            | "model_restore_failed"
            | "goal_busy"
            | "request_mismatch"
            | "action_mismatch"
            | "invalid_interaction"
            | "interaction_failed"
            | "service_shutting_down";
    };

/**
 * 归档 Goal 命令。
 *
 * @example
 * ```ts
 * const cmd: BrowserGoalArchiveCommand = { archived: true };
 * ```
 */
export interface BrowserGoalArchiveCommand {
    /** 是否归档。 */
    readonly archived: boolean;
}

/**
 * 归档 Goal 结果。
 *
 * @example
 * ```ts
 * const res: BrowserGoalArchiveResult = { ok: true };
 * ```
 */
export type BrowserGoalArchiveResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly error: string };

/**
 * 删除 Goal 结果。
 *
 * @example
 * ```ts
 * const res: BrowserGoalDeleteResult = { ok: true };
 * ```
 */
export type BrowserGoalDeleteResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly error: string };

/**
 * 显式恢复 Run 的输入命令。
 *
 * @remarks
 * 精确接收目标 Run ID 和页面读取的提交边界，用于并发防重入与过期检测。
 *
 * @example
 * ```ts
 * const cmd: BrowserResumeGoalCommand = {
 *     runId: "run-1",
 *     expectedCommittedThroughSequence: 12,
 * };
 * ```
 */
export interface BrowserResumeGoalCommand {
    /** 目标 Run 标识。 */
    readonly runId: string;
    /** 页面读取到的最新已提交序列号边界。 */
    readonly expectedCommittedThroughSequence: number;
}

/**
 * 显式恢复 Run 的处理结果。
 *
 * @example
 * ```ts
 * const res: BrowserResumeGoalResult = {
 *     ok: true,
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     existing: false,
 * };
 * ```
 */
export type BrowserResumeGoalResult =
    | {
        readonly ok: true;
        readonly goalId: string;
        readonly runId: string;
        readonly existing: boolean;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "stale_recovery"
            | "goal_busy"
            | "resume_not_allowed"
            | "model_restore_failed"
            | "resume_failed"
            | "service_shutting_down";
    };
