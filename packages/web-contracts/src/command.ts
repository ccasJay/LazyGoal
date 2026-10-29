import type { InferContract } from "../../contracts/src/index";
import {
    acceptedCommandContract,
    browserActionDetailsResultContract,
    browserGoalArchiveCommandContract,
    browserGoalArchiveResultContract,
    browserGoalDeleteResultContract,
    browserGoalPlanModeCommandContract,
    browserGoalPlanModeResultContract,
    browserModelPreferenceCommandContract,
    browserModelPreferenceResultContract,
    browserModelSelectionCommandContract,
    browserModelSelectionResultContract,
    browserPermissionModeCommandContract,
    browserPermissionModeContract,
    browserPermissionModeResultContract,
    browserToolGrantResultContract,
    browserToolGrantRevokeCommandContract,
    browserToolGrantSummaryContract,
    browserWorkspaceContextContract,
} from "./contracts/command";

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
export type AcceptedCommand = InferContract<typeof acceptedCommandContract>;

/**
 * 切换计划模式命令。
 *
 * @example
 * ```ts
 * const cmd: BrowserGoalPlanModeCommand = { runId: "run-1" };
 * ```
 */
export type BrowserGoalPlanModeCommand =
    InferContract<typeof browserGoalPlanModeCommandContract>;

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
    InferContract<typeof browserGoalPlanModeResultContract>;

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
export type BrowserModelSelectionCommand =
    InferContract<typeof browserModelSelectionCommandContract>;

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
    InferContract<typeof browserModelSelectionResultContract>;

/**
 * 设置工作区默认模型偏好命令。
 *
 * @example
 * ```ts
 * const cmd: BrowserModelPreferenceCommand = { modelId: "gpt-4o" };
 * ```
 */
export type BrowserModelPreferenceCommand =
    InferContract<typeof browserModelPreferenceCommandContract>;

/**
 * 设置工作区默认模型偏好结果。
 *
 * @example
 * ```ts
 * const res: BrowserModelPreferenceResult = { ok: true, modelId: "gpt-4o" };
 * ```
 */
export type BrowserModelPreferenceResult =
    InferContract<typeof browserModelPreferenceResultContract>;

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
export type BrowserToolGrantSummary =
    InferContract<typeof browserToolGrantSummaryContract>;

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
    InferContract<typeof browserActionDetailsResultContract>;

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
    InferContract<typeof browserToolGrantResultContract>;

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
export type BrowserToolGrantRevokeCommand =
    InferContract<typeof browserToolGrantRevokeCommandContract>;

/**
 * 项目权限模式。
 *
 * @example
 * ```ts
 * const mode: BrowserPermissionMode = "default";
 * ```
 */
export type BrowserPermissionMode =
    InferContract<typeof browserPermissionModeContract>;

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
export type BrowserPermissionModeCommand =
    InferContract<typeof browserPermissionModeCommandContract>;

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
    InferContract<typeof browserPermissionModeResultContract>;

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
export type BrowserWorkspaceContext =
    InferContract<typeof browserWorkspaceContextContract>;

/**
 * 归档或恢复 Goal 的 wire 命令。
 *
 * @example
 * ```ts
 * const cmd: BrowserGoalArchiveCommand = { archived: true };
 * ```
 */
export type BrowserGoalArchiveCommand =
    InferContract<typeof browserGoalArchiveCommandContract>;

/**
 * 归档 Goal 结果。
 *
 * @example
 * ```ts
 * const res: BrowserGoalArchiveResult = { ok: true };
 * ```
 */
export type BrowserGoalArchiveResult =
    InferContract<typeof browserGoalArchiveResultContract>;

/**
 * 删除 Goal 结果。
 *
 * @example
 * ```ts
 * const res: BrowserGoalDeleteResult = { ok: true };
 * ```
 */
export type BrowserGoalDeleteResult =
    InferContract<typeof browserGoalDeleteResultContract>;
