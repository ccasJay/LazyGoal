import type {
    Goal,
    GoalModelSelection,
    GoalModelSelectionCoordinator,
    GoalCoordinator,
    GoalStore,
    JsonValue,
} from "../../runtime/src/index";
import {
    isRunEnded,
    isSafeWaitingPointForModelSwitching,
    readInteractionDetail,
    type ActionApprovalReviewErrorCode,
    type InteractionDetail,
} from "../../runtime/src/index";
import {
    PermissionProfileConflictError,
    type PermissionProfile,
    type ProjectPermissionProfile,
} from "../../permission/src/index";
import type {
    BrowserActionDetailsResult,
    BrowserActionReviewCommand,
    BrowserActionReviewResult,
    BrowserGoalPlanModeCommand,
    BrowserGoalPlanModeResult,
    BrowserInteractionDetail,
    BrowserInteractionDetailResult,
    BrowserModelPreferenceOutcome,
    BrowserModelSelectionCommand,
    BrowserModelSelectionResult,
    BrowserPermissionExemptionResult,
    BrowserPermissionExemptionRevokeCommand,
    BrowserPermissionExemptionSummary,
    BrowserPermissionProfile,
    BrowserPermissionProfileCommand,
    BrowserPermissionProfileResult,
} from "../../web-contracts/src/index";

export type {
    BrowserActionDetailsResult,
    BrowserActionReviewCommand,
    BrowserActionReviewResult,
    BrowserGoalPlanModeCommand,
    BrowserGoalPlanModeResult,
    BrowserInteractionDetail,
    BrowserInteractionDetailResult,
    BrowserModelSelectionCommand,
    BrowserModelSelectionResult,
    BrowserPermissionExemptionResult,
    BrowserPermissionExemptionRevokeCommand,
    BrowserPermissionExemptionSummary,
    BrowserPermissionProfile,
    BrowserPermissionProfileCommand,
    BrowserPermissionProfileResult,
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

    /** 当前 Goal 下列出 goal 与 workspace 边界豁免。 */
    listPermissionExemptions?(ref: {
        readonly goalId: string;
        readonly runId: string;
    }): Promise<readonly BrowserPermissionExemptionSummary[]>;
    /** 撤销由当前 Goal/Run 限定的一条边界豁免。 */
    revokePermissionExemption?(request: {
        readonly ref: { readonly goalId: string; readonly runId: string };
        readonly exemptionId: string;
    }): Promise<void>;
    /** 查询当前工作区权限档位。 */
    getPermissionProfile?(): Promise<ProjectPermissionProfile>;
    /** 以乐观并发写入当前工作区权限档位。 */
    setPermissionProfile?(profile: PermissionProfile, expectedRevision: number): Promise<ProjectPermissionProfile>;
    /**
     * 只读预检同一工具的最终参数与实际权限范围。
     *
     * @remarks 省略时审批审阅路由返回 500 `review_unavailable`，不提供替代路径。
     */
    reviewActionApproval?(
        request: Parameters<GoalCoordinator["reviewActionApproval"]>[0],
        control?: Parameters<GoalCoordinator["reviewActionApproval"]>[1],
    ): ReturnType<GoalCoordinator["reviewActionApproval"]>;
}

/**
 * 浏览器管理命令所需依赖。
 *
 * @remarks
 * 本服务不再持有执行预约、内存受理去重或后台推进：会话执行所有权属于 Runtime
 * 会话所有者，`readActiveGoalId` 用于归档和 Plan Mode 的前置检查。
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
    /** 在安全等待点或已结算终态持久化已验证的模型选择。 */
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
        if (!isRunEnded(status)) return "goal_not_terminal";
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
        const goal = await this.dependencies.store.restore(goalId);
        if (goal === undefined) return { ok: false, error: "goal_not_found" };
        if (goal.state.run.id !== command.runId) return { ok: false, error: "stale_run" };
        if (this.dependencies.resolveModelSelection === undefined || this.dependencies.modelSelectionCoordinator === undefined) {
            return { ok: false, error: "model_catalog_unavailable" };
        }
        if (!isSafeWaitingPointForModelSwitching(goal)) {
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
        let defaultPreference: BrowserModelPreferenceOutcome | undefined;
        if (command.persistAsDefault === true) {
            defaultPreference = { ok: false, error: "model_preference_save_failed" };
            if (this.dependencies.saveModelPreference !== undefined && !this.isShuttingDown()) {
                try {
                    await this.dependencies.saveModelPreference(selection);
                    defaultPreference = { ok: true };
                } catch {
                    // Goal 模型已提交；偏好失败作为独立子结果报告，不回滚选择。
                }
            }
        }
        return {
            ok: true,
            goalId,
            runId: command.runId,
            selection: {
                modelId: selection.modelId,
                ...(selection.profileId === undefined ? {} : { providerProfileId: selection.profileId }),
            },
            ...(defaultPreference === undefined ? {} : { defaultPreference }),
        };
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

    /**
     * 按当前 Goal/Run/交互身份读取完整审阅内容。
     *
     * @param goalId - 路径中的 Goal 身份。
     * @param runId - 当前 Run 身份。
     * @param interactionId - 当前等待的稳定交互引用。
     * @returns 完整问题／任务范围／Action 输入；引用过期或不再等待时返回稳定错误。
     * @remarks 读取不推进等待，也不返回其他 Action 的参数。
     */
    async readInteractionDetails(
        goalId: string,
        runId: string,
        interactionId: string,
    ): Promise<BrowserInteractionDetailResult> {
        let goal: Goal | undefined;
        try { goal = await this.dependencies.store.restore(goalId); }
        catch { return { ok: false, error: "interaction_details_unavailable" }; }
        if (goal === undefined) return { ok: false, error: "goal_not_found" };
        if (goal.state.run.id !== runId) return { ok: false, error: "stale_run" };
        const result = readInteractionDetail(goal, { runId, interactionId });
        if (!result.ok) {
            return {
                ok: false,
                error: result.code === "INTERACTION_NOT_WAITING" ? "interaction_not_waiting" : "interaction_mismatch",
            };
        }
        return {
            ok: true,
            goalId,
            runId,
            interactionId,
            detail: toBrowserInteractionDetail(result.detail),
        };
    }

    /**
     * 只读预检同一工具的最终参数与实际权限范围。
     *
     * @remarks
     * 预检只重新准备参数、规划执行准入、权限与沙箱范围，并返回可审阅结果；它
     * 不保存批准、不暂存或激活授权、不解除等待，也不调用业务工具。多个客户端
     * 各自预检时互不覆盖草稿或持久化候选。
     *
     * @param goalId - 路径中的 Goal 身份。
     * @param command - 当前 Run、Action、拟修订参数与拟授权期限。
     * @returns 可审阅结果，或可定位的稳定拒绝。
     * @throws Snapshot 读取或预检失败时返回稳定错误，不抛出到 wire 层。
     * @example
     * ```ts
     * const result = await service.reviewActionApproval("goal-1", {
     *     runId: "run-1", actionId: "action-1", scope: "action",
     *     input: { path: "b.txt" },
     * });
     * ```
     */
    async reviewActionApproval(
        goalId: string,
        command: BrowserActionReviewCommand,
    ): Promise<BrowserActionReviewResult> {
        const coordinator = this.dependencies.coordinator;
        if (coordinator.reviewActionApproval === undefined) {
            return { ok: false, error: "review_unavailable" };
        }
        let goal: Goal | undefined;
        try { goal = await this.dependencies.store.restore(goalId); }
        catch { return { ok: false, error: "review_unavailable" }; }
        if (goal === undefined) return { ok: false, error: "goal_not_found" };
        if (goal.state.run.id !== command.runId) return { ok: false, error: "stale_run" };

        let result: Awaited<ReturnType<NonNullable<typeof coordinator.reviewActionApproval>>>;
        try {
            result = await coordinator.reviewActionApproval({
                ref: { goalId, runId: command.runId },
                actionId: command.actionId,
                ...(command.input === undefined ? {} : { input: command.input as JsonValue }),
                ...(command.scope === undefined ? {} : { scope: command.scope }),
            });
        } catch { return { ok: false, error: "review_unavailable" }; }

        if (!result.ok) {
            return {
                ok: false,
                error: toBrowserReviewError(result.code),
                ...(result.issues === undefined ? {} : { issues: result.issues.map((issue) => ({ path: [...issue.path], message: issue.message })) }),
            };
        }
        return {
            ok: true,
            goalId,
            runId: command.runId,
            review: {
                actionId: result.review.actionId,
                toolId: result.review.toolId,
                originalInput: result.review.originalInput,
                finalInput: result.review.finalInput,
                changed: result.review.changed,
                scope: result.review.scope,
                availableScopes: [...result.review.availableScopes],
                capability: {
                    network: result.review.capability.network,
                    extraFiles: result.review.capability.extraFiles.map((file) => ({
                        canonicalPath: file.canonicalPath,
                        access: file.access,
                        kind: file.kind,
                    })),
                    targetPaths: [...result.review.capability.targetPaths],
                },
                requiresSandboxApproval: result.review.requiresSandboxApproval,
                reviewRef: result.review.reviewRef,
            },
        };
    }

    /** 列出当前 Goal 与 workspace 的边界豁免摘要。 */
    async listPermissionExemptions(goalId: string, runId: string): Promise<BrowserPermissionExemptionResult> {
        const coordinator = this.dependencies.coordinator;
        if (coordinator.listPermissionExemptions === undefined) {
            return { ok: false, error: "permissions_unavailable" };
        }
        let goal: Goal | undefined;
        try { goal = await this.dependencies.store.restore(goalId); }
        catch { return { ok: false, error: "exemption_failed" }; }
        if (goal === undefined) return { ok: false, error: "goal_not_found" };
        if (goal.state.run.id !== runId) return { ok: false, error: "stale_run" };
        try {
            const exemptions = await coordinator.listPermissionExemptions({ goalId, runId });
            return { ok: true, goalId, runId, exemptions };
        } catch { return { ok: false, error: "exemption_failed" }; }
    }

    /**
     * 撤销绑定当前 Goal/Run 身份的边界豁免。
     *
     * @param goalId - 豁免所属 Goal。
     * @param command - 当前 Run 与待撤销豁免身份。
     * @returns 更新后的豁免列表；关闭期间返回 `service_shutting_down` 且不写入。
     * @example
     * ```ts
     * await service.revokePermissionExemption("goal-1", { runId: "run-1", exemptionId: "grant-1" });
     * ```
     */
    async revokePermissionExemption(goalId: string, command: BrowserPermissionExemptionRevokeCommand): Promise<BrowserPermissionExemptionResult> {
        if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
        const coordinator = this.dependencies.coordinator;
        if (coordinator.revokePermissionExemption === undefined) {
            return { ok: false, error: "permissions_unavailable" };
        }
        let goal: Goal | undefined;
        try { goal = await this.dependencies.store.restore(goalId); }
        catch { return { ok: false, error: "exemption_failed" }; }
        if (goal === undefined) return { ok: false, error: "goal_not_found" };
        if (goal.state.run.id !== command.runId) return { ok: false, error: "stale_run" };
        if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
        try {
            await coordinator.revokePermissionExemption({
                ref: { goalId, runId: command.runId },
                exemptionId: command.exemptionId,
            });
            return this.listPermissionExemptions(goalId, command.runId);
        } catch { return { ok: false, error: "exemption_failed" }; }
    }

    /**
     * 查询当前工作区的权限档位。
     *
     * @returns 当前完整档位与版本；服务不可用时返回稳定错误。
     * @example
     * ```ts
     * const result = await service.getPermissionProfile();
     * ```
     */
    async getPermissionProfile(): Promise<BrowserPermissionProfileResult> {
        const coordinator = this.dependencies.coordinator;
        if (coordinator.getPermissionProfile === undefined) {
            return { ok: false, error: "permissions_unavailable" };
        }
        try {
            const current = await coordinator.getPermissionProfile();
            return { ok: true, profile: toBrowserPermissionProfile(current.profile), revision: current.revision };
        } catch {
            return { ok: false, error: "permissions_unavailable" };
        }
    }

    /**
     * 切换当前工作区的权限档位。
     *
     * @param command - 目标档位与期望修订号。
     * @returns 成功切换后的权限档位；版本冲突时返回当前已持久化的档位与版本，
     * 关闭或底层存储故障时返回稳定错误。
     * @example
     * ```ts
     * const result = await service.setPermissionProfile({ profile, expectedRevision: 0 });
     * ```
     */
    async setPermissionProfile(command: BrowserPermissionProfileCommand): Promise<BrowserPermissionProfileResult> {
        if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
        const coordinator = this.dependencies.coordinator;
        if (coordinator.setPermissionProfile === undefined) {
            return { ok: false, error: "permissions_unavailable" };
        }
        try {
            const updated = await coordinator.setPermissionProfile(
                toPermissionProfile(command.profile),
                command.expectedRevision,
            );
            return { ok: true, profile: toBrowserPermissionProfile(updated.profile), revision: updated.revision };
        } catch (error) {
            if (error instanceof PermissionProfileConflictError) return this.conflictPermissionProfileResult();
            return { ok: false, error: "permissions_unavailable" };
        }
    }

    /** 冲突时重新读取当前档位；读取失败也只报告冲突，不退回任何默认档。 */
    private async conflictPermissionProfileResult(): Promise<BrowserPermissionProfileResult> {
        const coordinator = this.dependencies.coordinator;
        if (coordinator.getPermissionProfile === undefined) return { ok: false, error: "conflict" };
        try {
            const current = await coordinator.getPermissionProfile();
            return {
                ok: false,
                error: "conflict",
                profile: toBrowserPermissionProfile(current.profile),
                revision: current.revision,
            };
        } catch {
            return { ok: false, error: "conflict" };
        }
    }

    private isShuttingDown(): boolean {
        return this.dependencies.control?.signal?.aborted === true;
    }
}

/** 把已持久化的权限档位投影为 wire 形状。 */
function toBrowserPermissionProfile(profile: PermissionProfile): BrowserPermissionProfile {
    return {
        sandbox: profile.sandbox,
        approvals: profile.approvals,
        reviewer: profile.reviewer,
        writableRoots: [...profile.writableRoots],
    };
}

/** 把 wire 权限档位投影为持久化档位，避免把请求体数组直接交给存储。 */
function toPermissionProfile(profile: BrowserPermissionProfile): PermissionProfile {
    return {
        sandbox: profile.sandbox,
        approvals: profile.approvals,
        reviewer: profile.reviewer,
        writableRoots: [...profile.writableRoots],
    };
}

/** 把 Runtime 审批预检拒绝码投影为 wire 稳定错误码。 */
function toBrowserReviewError(
    code: ActionApprovalReviewErrorCode,
): Extract<BrowserActionReviewResult, { readonly ok: false }>["error"] {
    switch (code) {
        case "ACTION_NOT_AWAITING_APPROVAL": return "action_not_waiting";
        case "ACTION_ID_MISMATCH": return "action_id_mismatch";
        case "TOOL_NOT_FOUND": return "tool_not_found";
        case "INVALID_TOOL_INPUT": return "invalid_tool_input";
        case "SCOPE_UNAVAILABLE": return "scope_unavailable";
        case "SANDBOX_SCOPE_UNAVAILABLE": return "sandbox_scope_unavailable";
        case "REVIEW_UNAVAILABLE": return "review_unavailable";
    }
}

/** 把 Runtime 完整审阅内容投影为 wire DTO；阶段只保留目标与验收条件。 */
function toBrowserInteractionDetail(detail: InteractionDetail): BrowserInteractionDetail {
    switch (detail.kind) {
        case "question":
            return {
                kind: "question",
                mode: detail.mode,
                questions: detail.questions.map((question) => ({
                    id: question.id,
                    header: question.header,
                    question: question.question,
                    multiSelect: question.multiSelect,
                    options: question.options.map((option) => ({
                        id: option.id,
                        label: option.label,
                        ...(option.description === undefined ? {} : { description: option.description }),
                    })),
                })),
                ...(detail.routeRevision === undefined ? {} : {
                    routeRevision: {
                        baseRevision: detail.routeRevision.baseRevision,
                        reason: detail.routeRevision.reason,
                        approvalRequest: detail.routeRevision.approvalRequest,
                        approvalOptionId: detail.routeRevision.approvalOptionId,
                        stages: detail.routeRevision.stages.map((stage) => ({
                            target: stage.target,
                            acceptanceCriteria: [...stage.acceptanceCriteria],
                        })),
                    },
                }),
            };
        case "task_approval":
            return {
                kind: "task_approval",
                objective: detail.objective,
                approvalRequest: detail.approvalRequest,
                completionCriteria: [...detail.completionCriteria],
                stages: detail.stages.map((stage) => ({
                    target: stage.target,
                    acceptanceCriteria: [...stage.acceptanceCriteria],
                })),
            };
        case "action_approval":
        case "action_recovery":
            return {
                kind: detail.kind,
                actionId: detail.actionId,
                toolId: detail.toolId,
                ...(detail.approvalKind === undefined ? {} : { approvalKind: detail.approvalKind }),
                input: detail.input,
                ...(detail.recoveryRef === undefined ? {} : { recoveryRef: detail.recoveryRef }),
                ...(detail.parentProgram === undefined ? {} : { parentProgram: detail.parentProgram }),
            };
    }
}
