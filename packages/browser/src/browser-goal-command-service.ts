import type {
    Goal,
    GoalModelSelection,
    GoalModelSelectionCoordinator,
    GoalCoordinator,
    GoalStore,
} from "../../runtime/src/index";
import {
    PermissionModeConflictError,
    type PermissionMode,
} from "../../permission/src/index";
import type {
    BrowserActionDetailsResult,
    BrowserGoalPlanModeCommand,
    BrowserGoalPlanModeResult,
    BrowserModelSelectionCommand,
    BrowserModelSelectionResult,
    BrowserPermissionModeCommand,
    BrowserPermissionModeResult,
    BrowserToolGrantResult,
    BrowserToolGrantRevokeCommand,
    BrowserToolGrantSummary,
} from "../../web-contracts/src/index";

export type {
    BrowserActionDetailsResult,
    BrowserGoalPlanModeCommand,
    BrowserGoalPlanModeResult,
    BrowserModelSelectionCommand,
    BrowserModelSelectionResult,
    BrowserPermissionModeCommand,
    BrowserPermissionModeResult,
    BrowserToolGrantResult,
    BrowserToolGrantRevokeCommand,
    BrowserToolGrantSummary,
};

/**
 * 浏览器管理命令使用的最小 GoalCoordinator 适配边界。
 *
 * @remarks
 * 只覆盖仍保留独立入口的管理操作：Plan Mode 选择与授权查询／撤销。普通消息、
 * Steer、Interrupt、交互回答与恢复统一走会话 inputs 入口，不再经过本服务。
 *
 * @example
 * ```ts
 * const coordinator: BrowserGoalCoordinator = {
 *     enterPlanMode: (ref, control) => goalCoordinator.enterPlanMode(ref, control),
 * };
 * ```
 */
export interface BrowserGoalCoordinator {
    /** 依据当前 Goal/Run 身份选择 Plan Mode，并遵守 Runtime 的 Run 状态限制。 */
    enterPlanMode(
        ref: Parameters<GoalCoordinator["enterPlanMode"]>[0],
        control?: Parameters<GoalCoordinator["enterPlanMode"]>[1],
    ): ReturnType<GoalCoordinator["enterPlanMode"]>;

    /** 当前 Goal 下列出 goal 与 workspace 授权。 */
    listToolGrants?(ref: Parameters<GoalCoordinator["listToolGrants"]>[0]): ReturnType<GoalCoordinator["listToolGrants"]>;
    /** 撤销由当前 Goal/Run 限定的持续授权。 */
    revokeToolGrant?(request: Parameters<GoalCoordinator["revokeToolGrant"]>[0]): ReturnType<GoalCoordinator["revokeToolGrant"]>;
    /** 当前 Goal 下统一列出 Tool 与 Sandbox 持续授权。 */
    listGrants?(ref: Parameters<GoalCoordinator["listGrants"]>[0]): ReturnType<GoalCoordinator["listGrants"]>;
    /** 统一撤销由当前 Goal/Run 限定的 Tool 或 Sandbox 持续授权。 */
    revokeGrant?(request: Parameters<GoalCoordinator["revokeGrant"]>[0]): ReturnType<GoalCoordinator["revokeGrant"]>;
    /** 查询项目权限执行模式。 */
    getPermissionMode?(workspaceId?: string): ReturnType<GoalCoordinator["getPermissionMode"]>;
    /** 设置项目权限执行模式。 */
    setPermissionMode?(mode: PermissionMode, expectedRevision: number, workspaceId?: string): ReturnType<GoalCoordinator["setPermissionMode"]>;
}

/**
 * 浏览器管理命令所需依赖。
 *
 * @remarks
 * 本服务不再持有执行预约、内存受理去重或后台推进：会话执行所有权属于 Runtime
 * 会话所有者，`readActiveGoalId` 只用于读取该唯一事实并拒绝与其他 Goal 并发。
 *
 * @example
 * ```ts
 * const dependencies: BrowserGoalCommandDependencies = {
 *     store, coordinator, profileId: "default",
 *     readActiveGoalId: () => sessions.activeGoal,
 * };
 * ```
 */
export interface BrowserGoalCommandDependencies {
    /** 只指向正式工作区 Goal 文件的 Snapshot 读取端口。 */
    readonly store: Pick<GoalStore, "restore">;
    /** 复用本机 GoalCoordinator；浏览器不能直接修改 Goal Snapshot。 */
    readonly coordinator: BrowserGoalCoordinator;
    /** 由本机模型目录验证 ID 并构造完整非敏感选择。 */
    readonly resolveModelSelection?: (
        modelId: string,
        current: GoalModelSelection,
        providerProfileId?: string,
    ) => Promise<GoalModelSelection | undefined>;
    /** 在安全等待点持久化已验证的模型选择。 */
    readonly modelSelectionCoordinator?: GoalModelSelectionCoordinator;
    /** Goal 模型提交后保存 Web 工作区偏好；失败不会撤销已提交选择。 */
    readonly saveModelPreference?: (selection: GoalModelSelection) => Promise<void>;
    /** 读取 Runtime 会话所有者的当前活动 Goal；用于 busy 判定。 */
    readonly readActiveGoalId?: () => string | undefined;
    /** 与宿主关闭共享的可选信号；中止后拒绝尚未开始的写命令。 */
    readonly control?: { readonly signal?: AbortSignal };
}

/**
 * 单进程浏览器会话的管理命令受理器。
 *
 * @remarks
 * 只保留未迁入统一 inputs 入口的管理写入：显式 Plan Mode、模型选择、Action 详情、
 * 授权与权限模式，以及终态 Goal 的归档／删除前置检查。会话创建、消息、Steer、
 * Interrupt、交互回答与恢复都由 Runtime 会话所有者在同一提交边界内完成。
 *
 * @example
 * ```ts
 * const commands = new BrowserGoalCommandService(dependencies);
 * const result = await commands.selectModel("goal-1", { runId: "run-1", modelId: "gpt-4.1" });
 * ```
 */
export class BrowserGoalCommandService {
    /**
     * @param dependencies - 正式 Snapshot 读取、管理 Coordinator 与 Runtime 活动事实读取。
     */
    constructor(private readonly dependencies: BrowserGoalCommandDependencies) {}

    /**
     * 在终态 Goal 上执行归档或删除，拒绝仍持有会话工作的 Goal。
     *
     * @param goalId - 要管理的 Goal 身份。
     * @param operation - 已验证终态后执行的持久化操作。
     * @returns 成功、关闭期间拒绝或其他稳定拒绝码；存储异常原样向路由传播。
     * @example
     * ```ts
     * await commands.manageTerminalGoal("goal-1", () => archive("goal-1"));
     * ```
     */
    async manageTerminalGoal(goalId: string, operation: () => Promise<void>): Promise<"ok" | "goal_not_found" | "goal_not_terminal" | "service_shutting_down"> {
        if (this.isShuttingDown()) return "service_shutting_down";
        const goal = await this.dependencies.store.restore(goalId);
        if (goal === undefined) return "goal_not_found";
        const status = goal.state.run.status;
        if (status !== "completed" && status !== "failed" && status !== "cancelled") return "goal_not_terminal";
        if (this.dependencies.readActiveGoalId?.() === goalId) return "goal_not_terminal";
        if (this.isShuttingDown()) return "service_shutting_down";
        await operation();
        return "ok";
    }

    /**
     * 在当前 Run 的安全等待点提交已重新验证的模型选择。
     *
     * @param goalId - URL 路径中的 Goal 身份。
     * @param command - 当前 Run 身份及模型 ID。
     * @returns 保存成功后的身份，或关闭、身份与模型校验失败等稳定拒绝码。
     */
    async selectModel(goalId: string, command: BrowserModelSelectionCommand): Promise<BrowserModelSelectionResult> {
        if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
        const active = this.dependencies.readActiveGoalId?.();
        if (active !== undefined && active !== goalId) return { ok: false, error: "goal_busy" };
        const goal = await this.dependencies.store.restore(goalId);
        if (goal === undefined) return { ok: false, error: "goal_not_found" };
        if (goal.state.run.id !== command.runId) return { ok: false, error: "stale_run" };
        if (this.dependencies.resolveModelSelection === undefined || this.dependencies.modelSelectionCoordinator === undefined) {
            return { ok: false, error: "model_catalog_unavailable" };
        }
        const status = goal.state.run.status;
        if (
            status !== "completed" && status !== "failed"
            && (status !== "waiting" || goal.state.run.pendingAction !== undefined || goal.state.run.stopReason !== undefined)
        ) {
            return { ok: false, error: "model_switch_not_allowed" };
        }
        let selection: GoalModelSelection | undefined;
        try {
            selection = await this.dependencies.resolveModelSelection(
                command.modelId,
                goal.state.modelSelection,
                command.providerProfileId,
            );
        } catch {
            return { ok: false, error: "model_catalog_unavailable" };
        }
        if (selection === undefined) return { ok: false, error: "model_not_selectable" };
        if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
        const saved = await this.dependencies.modelSelectionCoordinator.updateModelSelection({
            ref: { goalId, runId: command.runId }, selection,
        }, this.dependencies.control);
        if (!saved.ok) {
            const error = saved.error.code === "RUN_MISMATCH" ? "stale_run"
                : saved.error.code === "GOAL_NOT_FOUND" ? "goal_not_found"
                    : saved.error.code === "GOAL_NOT_WAITING" ? "model_switch_not_allowed"
                        : "model_selection_failed";
            return { ok: false, error };
        }
        let defaultModelSaved = false;
        if (this.dependencies.saveModelPreference !== undefined && !this.isShuttingDown()) {
            try {
                await this.dependencies.saveModelPreference(selection);
                defaultModelSaved = true;
            } catch {
                // Goal 模型已提交；偏好失败通过结果字段单独报告。
            }
        }
        return { ok: true, goalId, runId: command.runId, modelId: selection.modelId, defaultModelSaved };
    }

    /**
     * 将显式 Plan Mode 命令交给 Runtime。
     *
     * @param goalId - 路径中的 Goal 稳定身份。
     * @param command - 带当前 Run 身份的模式选择。
     * @returns Runtime 提交完成后的受理结果或稳定拒绝码。
     * @throws 正式 Snapshot 读取或协调器持久化失败时拒绝。
     */
    async enterPlanMode(
        goalId: string,
        command: BrowserGoalPlanModeCommand,
    ): Promise<BrowserGoalPlanModeResult> {
        if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
        const active = this.dependencies.readActiveGoalId?.();
        if (active !== undefined && active !== goalId) return { ok: false, error: "goal_busy" };
        const goal = await this.dependencies.store.restore(goalId);
        if (goal === undefined) return { ok: false, error: "goal_not_found" };
        if (goal.state.run.id !== command.runId) return { ok: false, error: "stale_run" };
        if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
        try {
            const result = await this.dependencies.coordinator.enterPlanMode({ goalId, runId: command.runId });
            return result.ok
                ? { ok: true, goalId, runId: command.runId, existing: false }
                : {
                    ok: false,
                    error: result.error.code === "RUN_NOT_FOUND" ? "stale_run"
                        : result.error.code === "PLAN_MODE_BUSY" ? "plan_mode_busy"
                            : "plan_mode_failed",
                };
        } catch {
            return { ok: false, error: "plan_mode_failed" };
        }
    }

    /**
     * 按当前 Goal/Run/Action 身份读取完整待审批输入。
     *
     * @param goalId - 路径中的 Goal 身份。
     * @param runId - 当前 Run 身份。
     * @param actionId - 当前等待中的 Action 身份。
     * @returns 完整 canonical Tool 输入；身份过期或 Action 不再等待时返回稳定错误。
     */
    async readActionDetails(goalId: string, runId: string, actionId: string): Promise<BrowserActionDetailsResult> {
        let goal: Goal | undefined;
        try { goal = await this.dependencies.store.restore(goalId); }
        catch { return { ok: false, error: "action_details_unavailable" }; }
        if (goal === undefined) return { ok: false, error: "goal_not_found" };
        if (goal.state.run.id !== runId) return { ok: false, error: "stale_run" };
        const pending = goal.state.run.pendingAction;
        if (
            goal.state.run.status !== "waiting"
            || pending === undefined
            || pending.action.actionId !== actionId
            || (pending.status !== "awaiting_approval" && pending.status !== "outcome_unknown")
        ) return { ok: false, error: "action_not_waiting" };
        return {
            ok: true,
            goalId,
            runId,
            actionId,
            toolId: pending.action.toolId,
            input: structuredClone(pending.action.input),
        };
    }

    /** 列出当前 Goal 与 workspace 的授权白名单摘要。 */
    async listToolGrants(goalId: string, runId: string): Promise<BrowserToolGrantResult> {
        const coordinator = this.dependencies.coordinator;
        if (coordinator.listGrants === undefined && coordinator.listToolGrants === undefined) {
            return { ok: false, error: "permissions_unavailable" };
        }
        let goal: Goal | undefined;
        try { goal = await this.dependencies.store.restore(goalId); }
        catch { return { ok: false, error: "grant_failed" }; }
        if (goal === undefined) return { ok: false, error: "goal_not_found" };
        if (goal.state.run.id !== runId) return { ok: false, error: "stale_run" };
        try {
            if (coordinator.listGrants !== undefined) {
                const grants = await coordinator.listGrants({ goalId, runId });
                return {
                    ok: true,
                    goalId,
                    runId,
                    grants: grants.map((grant) => ({
                        grantId: grant.id,
                        kind: grant.kind,
                        scope: grant.scope,
                        toolId: grant.toolId,
                        status: grant.status,
                        ...(grant.kind === "tool" && grant.targetPath !== undefined ? { targetPath: grant.targetPath } : {}),
                        ...(grant.kind === "sandbox" ? {
                            inputDigest: grant.inputDigest,
                            network: grant.network,
                            extraFiles: grant.extraFiles,
                        } : {}),
                    })),
                };
            }
            const grants = await coordinator.listToolGrants!({ goalId, runId });
            return {
                ok: true,
                goalId,
                runId,
                grants: grants.map((grant) => ({
                    grantId: grant.id,
                    kind: "tool" as const,
                    scope: grant.scope,
                    toolId: grant.matcher.toolId,
                    status: grant.status,
                    ...(grant.matcher.kind === "target_path" ? { targetPath: grant.matcher.path } : {}),
                })),
            };
        } catch { return { ok: false, error: "grant_failed" }; }
    }

    /**
     * 撤销绑定当前 Goal/Run 身份的 Tool 授权。
     *
     * @param goalId - 授权所属 Goal。
     * @param command - 当前 Run 与待撤销 Grant 身份。
     * @returns 更新后的授权列表；关闭期间返回 `service_shutting_down` 且不写入。
     * @example
     * ```ts
     * await service.revokeToolGrant("goal-1", { runId: "run-1", grantId: "grant-1", scope: "goal" });
     * ```
     */
    async revokeToolGrant(goalId: string, command: BrowserToolGrantRevokeCommand): Promise<BrowserToolGrantResult> {
        if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
        const coordinator = this.dependencies.coordinator;
        if (coordinator.revokeGrant === undefined && coordinator.revokeToolGrant === undefined) {
            return { ok: false, error: "permissions_unavailable" };
        }
        let goal: Goal | undefined;
        try { goal = await this.dependencies.store.restore(goalId); }
        catch { return { ok: false, error: "grant_failed" }; }
        if (goal === undefined) return { ok: false, error: "goal_not_found" };
        if (goal.state.run.id !== command.runId) return { ok: false, error: "stale_run" };
        if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
        try {
            if (coordinator.revokeGrant !== undefined) {
                await coordinator.revokeGrant({
                    ref: { goalId, runId: command.runId },
                    kind: command.kind ?? "tool",
                    grantId: command.grantId,
                });
            } else {
                await coordinator.revokeToolGrant!({
                    ref: { goalId, runId: command.runId },
                    grantId: command.grantId,
                    scope: command.scope,
                });
            }
            return this.listToolGrants(goalId, command.runId);
        } catch { return { ok: false, error: "grant_failed" }; }
    }

    /**
     * 查询项目权限执行模式。
     *
     * @returns 当前项目权限模式快照；服务不可用时返回稳定错误。
     * @example
     * ```ts
     * const result = await service.getPermissionMode();
     * ```
     */
    async getPermissionMode(): Promise<
        | { readonly ok: true; readonly mode: PermissionMode; readonly revision: number; readonly workspaceId: string }
        | { readonly ok: false; readonly error: "permissions_unavailable" }
    > {
        const coordinator = this.dependencies.coordinator;
        if (coordinator.getPermissionMode === undefined) {
            return { ok: false, error: "permissions_unavailable" };
        }
        try {
            const result = await coordinator.getPermissionMode();
            return { ok: true, mode: result.mode, revision: result.revision, workspaceId: result.workspaceId };
        } catch {
            return { ok: false, error: "permissions_unavailable" };
        }
    }

    /**
     * 切换项目权限执行模式。
     *
     * @param command - 目标模式与期望修订号。
     * @returns 成功切换后的权限模式结果；关闭期间拒绝、版本冲突或底层存储故障时返回稳定错误。
     * @example
     * ```ts
     * const result = await service.setPermissionMode({ mode: "yolo", expectedRevision: 0 });
     * ```
     */
    async setPermissionMode(command: BrowserPermissionModeCommand): Promise<BrowserPermissionModeResult> {
        if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
        const coordinator = this.dependencies.coordinator;
        if (coordinator.setPermissionMode === undefined) {
            return { ok: false, error: "permissions_unavailable" };
        }
        try {
            const result = await coordinator.setPermissionMode(command.mode, command.expectedRevision);
            return { ok: true, mode: result.mode, revision: result.revision, workspaceId: result.workspaceId };
        } catch (error) {
            if (error instanceof PermissionModeConflictError) {
                return { ok: false, error: "conflict", actualRevision: error.actualRevision };
            }
            return { ok: false, error: "permissions_unavailable" };
        }
    }

    private isShuttingDown(): boolean {
        return this.dependencies.control?.signal?.aborted === true;
    }
}
