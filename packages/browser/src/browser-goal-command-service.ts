import type { ExecutionControl } from "../../execution-control/src/index";
import type {
    Goal,
    GoalModelSelection,
    GoalModelSelectionCoordinator,
    GoalCoordinator,
    GoalStore,
    GoalUserAction,
    JsonValue,
    LaunchRequest,
    LaunchResult,
    ResumeGoalRequest,
    RunRef,
    ToolGrant,
} from "../../runtime/src/index";
import {
    PermissionModeConflictError,
    type EffectiveExtraFile,
    type PermissionMode,
    type UnifiedGrantSummary,
} from "../../permission/src/index";
import type {
    BrowserActionDetailsResult,
    BrowserCreateGoalCommand,
    BrowserCreateGoalResult,
    BrowserGoalInteractionCommand,
    BrowserGoalInteractionResult,
    BrowserGoalMessageCommand,
    BrowserGoalMessageResult,
    BrowserGoalSteerCommand,
    BrowserGoalSteerResult,
    BrowserGoalPlanModeCommand,
    BrowserGoalPlanModeResult,
    BrowserModelSelectionCommand,
    BrowserModelSelectionResult,
    BrowserPermissionModeCommand,
    BrowserPermissionModeResult,
    BrowserResumeGoalCommand,
    BrowserResumeGoalResult,
    BrowserToolGrantResult,
    BrowserToolGrantRevokeCommand,
    BrowserToolGrantSummary,
} from "../../web-contracts/src/index";

export type {
    BrowserActionDetailsResult,
    BrowserCreateGoalCommand,
    BrowserCreateGoalResult,
    BrowserGoalInteractionCommand,
    BrowserGoalInteractionResult,
    BrowserGoalMessageCommand,
    BrowserGoalMessageResult,
    BrowserGoalSteerCommand,
    BrowserGoalSteerResult,
    BrowserGoalPlanModeCommand,
    BrowserGoalPlanModeResult,
    BrowserModelSelectionCommand,
    BrowserModelSelectionResult,
    BrowserPermissionModeCommand,
    BrowserPermissionModeResult,
    BrowserResumeGoalCommand,
    BrowserResumeGoalResult,
    BrowserToolGrantResult,
    BrowserToolGrantRevokeCommand,
    BrowserToolGrantSummary,
};

/**
 * 供浏览器创建服务调用的 Runtime Launcher。
 *
 * @remarks
 * Launcher 拥有 Goal 初始化快照保存和自动推进；浏览器服务只在正式快照通知到达后
 * 返回受理，并在进程内跟踪 Launcher 生命周期。
 *
 * @example
 * ```ts
 * const launcher: BrowserGoalLauncher = {
 *     launch: (request, control) => launch(request, dependencies, control),
 * };
 * ```
 */
export interface BrowserGoalLauncher {
    /**
     * 创建并推进一个 Goal。
     *
     * @param request - Goal 身份、意图与本机 Profile 身份。
     * @param control - 与本机关闭流程共享的可选中止控制。
     * @returns 首个等待点/终态或稳定业务错误。
     * @throws 持久化、调度、模型或 Tool 基础设施失败时拒绝。
     */
    launch(request: LaunchRequest, control?: ExecutionControl): Promise<LaunchResult>;
}

/**
 * Goal 成功保存通知的最小边界。
 *
 * @remarks
 * 通知必须在正式 Snapshot 写入成功后触发。浏览器创建服务用它确认 Launcher
 * 已产生真实 Goal，而不轮询文件或把命令响应当作持久化结果。
 *
 * @example
 * ```ts
 * const notifications: BrowserGoalSaveNotifications = {
 *     onSave: (listener) => goalStore.onSave(listener),
 * };
 * ```
 */
export interface BrowserGoalSaveNotifications {
    /**
     * 订阅 Goal 快照成功保存事件。
     *
     * @param listener - 收到已保存的不可变 Goal 快照时调用。
     * @returns 取消订阅函数。
     */
    onSave(listener: (goal: Goal) => void): () => void;
}

/**
 * 浏览器可提交到当前结构化等待点的操作。
 *
 * @remarks
 * 交互命令携带当前 Run 身份；回答、取消询问与任务审批还必须匹配对应 requestId，Action
 * 审批必须匹配 actionId。取消询问仅适用于 AskUser 等待。普通消息不能绕过 Runtime 校验。
 *
 * @example
 * ```ts
 * const command: BrowserGoalInteractionCommand = {
 *     kind: "approve_task", runId: "run-1", requestId: "proposal-1",
 * };
 * ```
 */


/**
 * 浏览器命令使用的最小 GoalCoordinator 适配边界。
 *
 * @example
 * ```ts
 * const coordinator: BrowserGoalCoordinator = {
 *     resume: (request, control) => goalCoordinator.resume(request, control),
 *     continue: (ref, input, control) => goalCoordinator.continue(ref, input, control),
 *     enterPlanMode: (ref, control) => goalCoordinator.enterPlanMode(ref, control),
 * };
 * ```
 */
export interface BrowserGoalCoordinator {
    /**
     * 将已匹配当前等待点的操作交给 Runtime。
     *
     * @param request - 当前 Goal/Run 与类型化用户操作。
     * @param control - 本机关闭协调使用的取消信号。
     * @returns 最新等待点、执行终态或稳定业务错误。
     * @throws Store、Trajectory、Scheduler 或执行依赖失败时拒绝。
     */
    resume(request: ResumeGoalRequest, control?: ExecutionControl): ReturnType<GoalCoordinator["resume"]>;

    /**
     * 为已完成 Run 启动同一 Goal 的后续 Run。
     *
     * @param ref - 当前已完成 Run 的 Goal/Run 身份。
     * @param newInput - 追加到会话的非空新任务文本。
     * @param control - 本机关闭协调使用的取消信号。
     * @returns 新 Run 自动推进到等待点或终态后的结果。
     * @throws Store、Trajectory、Scheduler 或执行依赖失败时拒绝。
     */
    continue(
        ref: Parameters<GoalCoordinator["continue"]>[0],
        newInput: string,
        control?: ExecutionControl,
    ): ReturnType<GoalCoordinator["continue"]>;

    /**
     * 通过 Runtime 当前执行所有者受理 Steer。
     *
     * @param ref - 当前 Goal 与 Run 身份。
     * @param messageId - 客户端生成的稳定幂等身份。
     * @param content - 非空 Steer 正文。
     * @returns 持久化受理或稳定拒绝；受理不表示模型已应用。
     * @throws Snapshot 或 Trajectory 提交失败时传播错误。
     */
    steer?(ref: RunRef, messageId: string, content: string): ReturnType<GoalCoordinator["steer"]>;

    /** 依据当前 Goal/Run 身份选择 Plan Mode，并遵守 Runtime 的 Run 状态限制。 */
    enterPlanMode(
        ref: Parameters<GoalCoordinator["enterPlanMode"]>[0],
        control?: ExecutionControl,
    ): ReturnType<GoalCoordinator["enterPlanMode"]>;

    /**
     * 显式推进中断的未终态 Run。
     *
     * @param ref - 目标 Goal/Run 身份。
     * @param control - 本机关闭协调使用的取消信号。
     * @returns 自动推进到等待点或终态后的结果。
     */
    advance?(
        ref: RunRef,
        control?: ExecutionControl,
    ): ReturnType<GoalCoordinator["advance"]>;

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
 * 浏览器 Goal 创建服务所需依赖。
 *
 * @example
 * ```ts
 * const dependencies: BrowserGoalCommandDependencies = {
 *     store, saveNotifications, launcher, coordinator, profileId: "default",
 * };
 * ```
 */
export interface BrowserGoalCommandDependencies {
    /** 只指向正式工作区 Goal 文件的 Snapshot 读取端口。 */
    readonly store: Pick<GoalStore, "restore">;
    /** 正式 Checkpoint 保存成功后的通知。 */
    readonly saveNotifications: BrowserGoalSaveNotifications;
    /** 复用本机 Runtime Launcher；浏览器不提供替代执行路径。 */
    readonly launcher: BrowserGoalLauncher;
    /** 复用本机 GoalCoordinator；浏览器不能直接修改 Goal Snapshot。 */
    readonly coordinator: BrowserGoalCoordinator;
    /** 由本机模型目录验证 ID 并构造完整非敏感选择。 */
    readonly resolveModelSelection?: (modelId: string, current: GoalModelSelection) => Promise<GoalModelSelection | undefined>;
    /** 在安全等待点持久化已验证的模型选择。 */
    readonly modelSelectionCoordinator?: GoalModelSelectionCoordinator;
    /** 推进前按 Goal 快照重建当前进程模型绑定。 */
    readonly restoreModelBinding?: (goal: Goal) => Promise<boolean>;
    /** 浏览器创建使用的进程默认模型选择。 */
    readonly defaultModelSelection?: GoalModelSelection;
    /** Web 创建省略模型时解析当前工作区偏好；失败必须拒绝创建。 */
    readonly resolveDefaultModelSelection?: () => Promise<GoalModelSelection | undefined>;
    /** Goal 模型提交后保存 Web 工作区偏好；失败不会撤销已提交选择。 */
    readonly saveModelPreference?: (selection: GoalModelSelection) => Promise<void>;
    /** 本机 Composition Root 已验证并加载的 Profile ID。 */
    readonly profileId: string;
    /** 与本机 ShutdownCoordinator 共享的可选信号；中止后拒绝尚未开始的写命令。 */
    readonly control?: ExecutionControl;
}

interface InFlightCreate {
    readonly intent: string;
    readonly mode: "normal" | "plan";
    readonly modelId: string | undefined;
    readonly accepted: Promise<BrowserCreateGoalResult>;
}

interface InFlightPlanMode {
    readonly accepted: Promise<BrowserGoalPlanModeResult>;
}

interface InFlightInteraction {
    readonly fingerprint: string;
    readonly accepted: Promise<BrowserGoalInteractionResult>;
}

interface InFlightMessage {
    readonly content: string;
    readonly accepted: Promise<BrowserGoalMessageResult>;
}

interface InFlightResume {
    readonly runId: string;
    readonly expectedCommittedThroughSequence: number;
    readonly accepted: Promise<BrowserResumeGoalResult>;
}

type Reservation =
    | { readonly kind: "result"; readonly result: BrowserCreateGoalResult }
    | { readonly kind: "in_flight"; readonly accepted: Promise<BrowserCreateGoalResult> };

/**
 * 单进程浏览器会话的 Goal 创建受理器。
 *
 * @remarks
 * 每个稳定 Goal ID 最多启动一次 Launcher；不同 Goal 的创建在初次 Goal 正在执行时
 * 返回 `goal_busy`。创建受理通过保存通知确认，HTTP 客户端断开不会取消 Launcher。
 * Launcher 到达等待点或终态后释放活动锁；页面读取或切换 Goal 不调用此服务。
 *
 * @example
 * ```ts
 * const commands = new BrowserGoalCommandService(dependencies);
 * const result = await commands.create({ goalId: "goal-1", intent: "检查项目" });
 * ```
 */
export class BrowserGoalCommandService {
    private readonly inFlight = new Map<string, InFlightCreate>();
    private readonly inFlightInteractions = new Map<string, InFlightInteraction>();
    private readonly inFlightMessages = new Map<string, InFlightMessage>();
    private readonly inFlightPlanModes = new Map<string, InFlightPlanMode>();
    private readonly inFlightResumes = new Map<string, InFlightResume>();
    private activeGoalId: string | undefined;
    private readonly activityListeners = new Set<(goalId: string, active: boolean) => void>();
    private reservationTail: Promise<void> = Promise.resolve();

    /**
     * @param dependencies - 正式 Snapshot 读取、保存通知、本机 Launcher、Coordinator 与 Profile。
     */
    constructor(private readonly dependencies: BrowserGoalCommandDependencies) {}

    /**
     * 获取当前服务进程正在执行的 Goal ID（若有）。
     */
    getActiveGoalId(): string | undefined {
        return this.activeGoalId;
    }

    /**
     * 订阅进程内 Goal 活动执行状态变更。
     *
     * @param listener - 当 Goal 开始执行或结束执行时通知。
     * @returns 取消订阅函数。
     */
    onGoalActivityChanged(listener: (goalId: string, active: boolean) => void): () => void {
        this.activityListeners.add(listener);
        return () => { this.activityListeners.delete(listener); };
    }

    private setActiveGoalId(goalId: string | undefined): void {
        const previous = this.activeGoalId;
        if (previous === goalId) return;
        this.activeGoalId = goalId;
        if (previous !== undefined) {
            for (const listener of this.activityListeners) {
                try { listener(previous, false); } catch {}
            }
        }
        if (goalId !== undefined) {
            for (const listener of this.activityListeners) {
                try { listener(goalId, true); } catch {}
            }
        }
    }

    /**
     * 在浏览器命令预约锁内管理终态 Goal，避免与新 Run 或模型切换并发。
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
        return this.withReservationLock(async () => {
            if (this.isShuttingDown()) return "service_shutting_down";
            if (this.activeGoalId !== undefined) return "goal_not_terminal";
            const goal = await this.dependencies.store.restore(goalId);
            if (goal === undefined) return "goal_not_found";
            const status = goal.state.run.status;
            if (status !== "completed" && status !== "failed" && status !== "cancelled") return "goal_not_terminal";
            if (this.isShuttingDown()) return "service_shutting_down";
            await operation();
            return "ok";
        });
    }

    /**
     * 在当前 Run 的安全等待点提交已重新验证的模型选择。
     *
     * @param goalId - URL 路径中的 Goal 身份。
     * @param command - 当前 Run 身份及模型 ID。
     * @returns 保存成功后的身份，或关闭、身份与模型校验失败等稳定拒绝码。
     */
    async selectModel(goalId: string, command: BrowserModelSelectionCommand): Promise<BrowserModelSelectionResult> {
        return this.withReservationLock(async () => {
            if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
            if (this.activeGoalId !== undefined) return { ok: false, error: "goal_busy" };
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
                selection = await this.dependencies.resolveModelSelection(command.modelId, goal.state.modelSelection);
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
        });
    }

    /**
     * 按稳定 ID 受理一个 Goal 创建。
     *
     * @param command - 已通过 HTTP wire 校验的 Goal ID 和用户意图。
     * @returns 快照提交后的受理结果；同 ID/同意图的重试返回同一受理结果。
     * @throws 正式 Store 读取失败时拒绝；不会生成虚构 Goal 列表项。
     */
    async create(command: BrowserCreateGoalCommand): Promise<BrowserCreateGoalResult> {
        const reservation = await this.withReservationLock(async (): Promise<Reservation> => {
            if (this.isShuttingDown()) {
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            const current = this.inFlight.get(command.goalId);
            if (current !== undefined) {
                if (current.intent !== command.intent || current.mode !== (command.mode ?? "normal") || current.modelId !== command.modelId) {
                    return { kind: "result", result: { ok: false, error: "goal_id_conflict" } };
                }
                return {
                    kind: "in_flight",
                    accepted: current.accepted.then((result) => result.ok
                        ? { ...result, existing: true }
                        : result),
                };
            }

            const existing = await this.dependencies.store.restore(command.goalId);
            if (existing !== undefined) {
                return existing.definition.intent === command.intent
                    && existing.state.run.mode === (command.mode ?? "normal")
                    && (command.modelId === undefined || existing.state.modelSelection.modelId === command.modelId)
                    ? {
                        kind: "result",
                        result: {
                            ok: true,
                            goalId: existing.id,
                            runId: existing.state.run.id,
                            existing: true,
                        },
                    }
                    : { kind: "result", result: { ok: false, error: "goal_id_conflict" } };
            }

            if (this.activeGoalId !== undefined) {
                return { kind: "result", result: { ok: false, error: "goal_busy" } };
            }

            const defaultSelection = this.dependencies.defaultModelSelection;
            let modelSelection = defaultSelection;
            if (command.modelId === undefined && this.dependencies.resolveDefaultModelSelection !== undefined) {
                try {
                    modelSelection = await this.dependencies.resolveDefaultModelSelection();
                } catch {
                    return { kind: "result", result: { ok: false, error: "model_catalog_unavailable" } };
                }
                if (modelSelection === undefined) {
                    return { kind: "result", result: { ok: false, error: "model_not_selectable" } };
                }
            }
            if (command.modelId !== undefined) {
                if (defaultSelection === undefined || this.dependencies.resolveModelSelection === undefined) {
                    return { kind: "result", result: { ok: false, error: "model_catalog_unavailable" } };
                }
                try {
                    modelSelection = await this.dependencies.resolveModelSelection(command.modelId, defaultSelection);
                } catch {
                    return { kind: "result", result: { ok: false, error: "model_catalog_unavailable" } };
                }
                if (modelSelection === undefined) {
                    return { kind: "result", result: { ok: false, error: "model_not_selectable" } };
                }
            }
            if (this.isShuttingDown()) {
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            this.setActiveGoalId(command.goalId);
            const accepted = this.start(command, modelSelection);
            this.inFlight.set(command.goalId, {
                intent: command.intent,
                mode: command.mode ?? "normal",
                modelId: command.modelId,
                accepted,
            });
            return { kind: "in_flight", accepted };
        });

        return reservation.kind === "result" ? reservation.result : reservation.accepted;
    }

    /**
     * 将显式 Plan Mode 命令交给 Runtime，并在同一服务实例内串行化执行推进。
     *
     * @param goalId - 路径中的 Goal 稳定身份。
     * @param command - 带当前 Run 身份的模式选择。
     * @returns Runtime 提交完成后的受理结果；相同在途请求复用受理。
     * @throws 正式 Snapshot 读取或协调器持久化失败时拒绝。
     */
    async enterPlanMode(
        goalId: string,
        command: BrowserGoalPlanModeCommand,
    ): Promise<BrowserGoalPlanModeResult> {
        const key = `${goalId}\u0000${command.runId}`;
        const reservation = await this.withReservationLock(async (): Promise<
            | { readonly kind: "result"; readonly result: BrowserGoalPlanModeResult }
            | { readonly kind: "in_flight"; readonly accepted: Promise<BrowserGoalPlanModeResult> }
        > => {
            if (this.isShuttingDown()) {
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            const current = this.inFlightPlanModes.get(key);
            if (current !== undefined) {
                return {
                    kind: "in_flight",
                    accepted: current.accepted.then((result) => result.ok
                        ? { ...result, existing: true }
                        : result),
                };
            }
            if (this.activeGoalId !== undefined) {
                return { kind: "result", result: { ok: false, error: "goal_busy" } };
            }
            const goal = await this.dependencies.store.restore(goalId);
            if (goal === undefined) {
                return { kind: "result", result: { ok: false, error: "goal_not_found" } };
            }
            if (goal.state.run.id !== command.runId) {
                return { kind: "result", result: { ok: false, error: "stale_run" } };
            }

            if (this.isShuttingDown()) {
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            this.setActiveGoalId(goalId);
            const accepted = this.startPlanMode(goalId, command);
            this.inFlightPlanModes.set(key, { accepted });
            return { kind: "in_flight", accepted };
        });

        return reservation.kind === "result" ? reservation.result : reservation.accepted;
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
        return this.withReservationLock(async () => {
            if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
            return this.revokeToolGrantWhileOpen(goalId, command);
        });
    }

    private async revokeToolGrantWhileOpen(goalId: string, command: BrowserToolGrantRevokeCommand): Promise<BrowserToolGrantResult> {
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
        return this.withReservationLock(async () => {
            if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
            return this.setPermissionModeWhileOpen(command);
        });
    }

    private async setPermissionModeWhileOpen(command: BrowserPermissionModeCommand): Promise<BrowserPermissionModeResult> {
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

    /**
     * 将一个带当前 Run 身份的结构化操作交给 Runtime 当前等待点。
     *
     * @param goalId - 路径中的 Goal 稳定身份。
     * @param command - 带 Run 与 request/action 身份的已验证 wire 操作。
     * @returns 匹配的变更保存后受理；旧身份、错配等待点、忙碌或执行故障返回稳定错误。
     * @throws 正式工作区 Snapshot 读取失败时拒绝。
     */
    async interact(
        goalId: string,
        command: BrowserGoalInteractionCommand,
    ): Promise<BrowserGoalInteractionResult> {
        const key = interactionKey(goalId, command);
        const fingerprint = JSON.stringify(command);
        const reservation = await this.withReservationLock(async (): Promise<
            | { readonly kind: "result"; readonly result: BrowserGoalInteractionResult }
            | { readonly kind: "in_flight"; readonly accepted: Promise<BrowserGoalInteractionResult> }
        > => {
            if (this.isShuttingDown()) {
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            const current = this.inFlightInteractions.get(key);
            if (current !== undefined) {
                if (current.fingerprint !== fingerprint) {
                    return { kind: "result", result: { ok: false, error: "invalid_interaction" } };
                }
                return {
                    kind: "in_flight",
                    accepted: current.accepted.then((result) => result.ok
                        ? { ...result, existing: true }
                        : result),
                };
            }

            if (this.activeGoalId !== undefined) {
                return { kind: "result", result: { ok: false, error: "goal_busy" } };
            }
            const goal = await this.dependencies.store.restore(goalId);
            if (goal === undefined) {
                return { kind: "result", result: { ok: false, error: "goal_not_found" } };
            }
            const mismatch = validateInteractionTarget(goal, command);
            if (mismatch !== undefined) {
                return { kind: "result", result: { ok: false, error: mismatch } };
            }

            if (this.isShuttingDown()) {
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            if (this.dependencies.restoreModelBinding !== undefined) {
                let restored = false;
                try { restored = await this.dependencies.restoreModelBinding(goal); } catch { restored = false; }
                if (!restored) return { kind: "result", result: { ok: false, error: "model_restore_failed" } };
            }

            if (this.isShuttingDown()) {
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            this.setActiveGoalId(goalId);
            const accepted = this.startInteraction(goalId, command);
            this.inFlightInteractions.set(key, { fingerprint, accepted });
            return { kind: "in_flight", accepted };
        });

        return reservation.kind === "result" ? reservation.result : reservation.accepted;
    }

    /**
     * 根据当前 Run 状态恢复等待会话或创建后续 Run。
     *
     * @param goalId - 路径中的 Goal 稳定身份。
     * @param command - 当前 Run 身份与非空普通文本。
     * @returns 消息与状态变更成功保存后的受理结果，或稳定拒绝码。
     * @throws 正式工作区 Snapshot 读取失败时拒绝。
     */
    async message(
        goalId: string,
        command: BrowserGoalMessageCommand,
    ): Promise<BrowserGoalMessageResult> {
        const key = `${goalId}\u0000${command.runId}`;
        const reservation = await this.withReservationLock(async (): Promise<
            | { readonly kind: "result"; readonly result: BrowserGoalMessageResult }
            | { readonly kind: "in_flight"; readonly accepted: Promise<BrowserGoalMessageResult> }
        > => {
            if (this.isShuttingDown()) {
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            const current = this.inFlightMessages.get(key);
            if (current !== undefined) {
                if (current.content !== command.content) {
                    return { kind: "result", result: { ok: false, error: "message_conflict" } };
                }
                return {
                    kind: "in_flight",
                    accepted: current.accepted.then((result) => result.ok
                        ? { ...result, existing: true }
                        : result),
                };
            }
            if (this.activeGoalId !== undefined) {
                return { kind: "result", result: { ok: false, error: "goal_busy" } };
            }
            if (command.content.trim().length === 0) {
                return { kind: "result", result: { ok: false, error: "invalid_message" } };
            }
            const goal = await this.dependencies.store.restore(goalId);
            if (goal === undefined) {
                return { kind: "result", result: { ok: false, error: "goal_not_found" } };
            }
            if (goal.state.run.id !== command.runId) {
                return { kind: "result", result: { ok: false, error: "stale_run" } };
            }
            const status = goal.state.run.status;
            if (status === "waiting") {
                if (goal.state.run.pendingInteraction !== undefined || goal.state.run.pendingAction !== undefined) {
                    return {
                        kind: "result",
                        result: { ok: false, error: "structured_interaction_required" },
                    };
                }
            } else if (status !== "completed" && status !== "failed") {
                return { kind: "result", result: { ok: false, error: "goal_not_waiting" } };
            }

            if (this.isShuttingDown()) {
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            if (this.dependencies.restoreModelBinding !== undefined) {
                let restored = false;
                try { restored = await this.dependencies.restoreModelBinding(goal); } catch { restored = false; }
                if (!restored) return { kind: "result", result: { ok: false, error: "model_restore_failed" } };
            }

            if (this.isShuttingDown()) {
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            this.setActiveGoalId(goalId);
            const accepted = this.startMessage(goal, command);
            this.inFlightMessages.set(key, { content: command.content, accepted });
            return { kind: "in_flight", accepted };
        });

        return reservation.kind === "result" ? reservation.result : reservation.accepted;
    }

    /**
     * 向当前运行中的 Run 受理 Steer 命令。
     *
     * @param goalId - URL 中的 Goal 身份。
     * @param command - 当前 Run、稳定消息身份和正文。
     * @returns Runtime 持久化受理状态；失败时调用方保留草稿。
     * @throws Snapshot 读取或 Runtime 持久化失败时拒绝。
     */
    async steer(goalId: string, command: BrowserGoalSteerCommand): Promise<BrowserGoalSteerResult> {
        if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
        if (this.activeGoalId !== undefined && this.activeGoalId !== goalId) {
            return { ok: false, error: "goal_busy" };
        }
        if (this.dependencies.coordinator.steer === undefined) {
            return { ok: false, error: "steer_failed" };
        }
        if (command.content.trim().length === 0) return { ok: false, error: "steer_conflict" };
        const goal = await this.dependencies.store.restore(goalId);
        if (goal === undefined) return { ok: false, error: "goal_not_found" };
        if (goal.state.run.id !== command.runId) return { ok: false, error: "stale_run" };
        if (goal.state.run.status !== "running") return { ok: false, error: "goal_not_running" };
        if (this.isShuttingDown()) return { ok: false, error: "service_shutting_down" };
        try {
            const result = await this.dependencies.coordinator.steer(
                { goalId, runId: command.runId }, command.messageId, command.content,
            );
            if (result.ok) return result;
            return { ok: false, error: result.error === "RUN_NOT_FOUND" ? "goal_not_found"
                : result.error === "RUN_NOT_RUNNING" ? "goal_not_running"
                    : result.error === "STEER_CONFLICT" ? "steer_conflict" : "steer_failed" };
        } catch {
            return { ok: false, error: "steer_failed" };
        }
    }

    /**
     * 显式恢复一个处于中断或未终态的 Run。
     *
     * @param goalId - 目标 Goal 标识。
     * @param command - 目标 Run 标识与页面读取的已提交序列号边界。
     * @returns 新快照确认保存后的受理结果或稳定拒绝码；等待预约锁期间进入关闭时不推进。
     */
    async resume(
        goalId: string,
        command: BrowserResumeGoalCommand,
    ): Promise<BrowserResumeGoalResult> {
        if (this.dependencies.control?.signal?.aborted === true) {
            return { ok: false, error: "service_shutting_down" };
        }
        const key = `${goalId}\u0000${command.runId}`;
        const reservation = await this.withReservationLock(async (): Promise<
            | { readonly kind: "result"; readonly result: BrowserResumeGoalResult }
            | { readonly kind: "in_flight"; readonly accepted: Promise<BrowserResumeGoalResult> }
        > => {
            if (this.dependencies.control?.signal?.aborted === true) {
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            const current = this.inFlightResumes.get(key);
            if (current !== undefined) {
                if (current.expectedCommittedThroughSequence !== command.expectedCommittedThroughSequence) {
                    return { kind: "result", result: { ok: false, error: "stale_recovery" } };
                }
                return {
                    kind: "in_flight",
                    accepted: current.accepted.then((result) => result.ok
                        ? { ...result, existing: true }
                        : result),
                };
            }
            if (this.activeGoalId !== undefined) {
                return { kind: "result", result: { ok: false, error: "goal_busy" } };
            }

            const goal = await this.dependencies.store.restore(goalId);
            if (goal === undefined) {
                return { kind: "result", result: { ok: false, error: "goal_not_found" } };
            }
            if (goal.state.run.id !== command.runId) {
                return { kind: "result", result: { ok: false, error: "stale_run" } };
            }
            const status = goal.state.run.status;
            if (status !== "created" && status !== "running") {
                return { kind: "result", result: { ok: false, error: "resume_not_allowed" } };
            }
            const actualCommittedBoundary = goal.state.run.committedThroughSequence ?? 0;
            if (actualCommittedBoundary !== command.expectedCommittedThroughSequence) {
                return { kind: "result", result: { ok: false, error: "stale_recovery" } };
            }

            if (this.isShuttingDown()) {
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            this.setActiveGoalId(goalId);

            if (this.dependencies.restoreModelBinding !== undefined) {
                let restored = false;
                try { restored = await this.dependencies.restoreModelBinding(goal); } catch { restored = false; }
                if (!restored) {
                    this.setActiveGoalId(undefined);
                    return { kind: "result", result: { ok: false, error: "model_restore_failed" } };
                }
            }

            if (this.isShuttingDown()) {
                this.setActiveGoalId(undefined);
                return { kind: "result", result: { ok: false, error: "service_shutting_down" } };
            }
            const accepted = this.startResume(goal, command);
            this.inFlightResumes.set(key, {
                runId: command.runId,
                expectedCommittedThroughSequence: command.expectedCommittedThroughSequence,
                accepted,
            });
            return { kind: "in_flight", accepted };
        });

        return reservation.kind === "result" ? reservation.result : reservation.accepted;
    }

    private async startResume(
        initialGoal: Goal,
        command: BrowserResumeGoalCommand,
    ): Promise<BrowserResumeGoalResult> {
        let settleAcceptance!: (result: BrowserResumeGoalResult) => void;
        let accepted = false;
        const acceptance = new Promise<BrowserResumeGoalResult>((resolve) => {
            settleAcceptance = resolve;
        });
        const goalId = initialGoal.id;
        const runId = initialGoal.state.run.id;
        const key = `${goalId}\u0000${runId}`;

        const unsubscribe = this.dependencies.saveNotifications.onSave((goal) => {
            if (goal.id !== goalId || goal.state.run.id !== runId || accepted) return;
            const newCommittedSequence = goal.state.run.committedThroughSequence ?? 0;
            if (newCommittedSequence <= command.expectedCommittedThroughSequence && goal.state.run.status === initialGoal.state.run.status) {
                return;
            }
            accepted = true;
            settleAcceptance({
                ok: true,
                goalId,
                runId,
                existing: false,
            });
        });

        const advanceFn = this.dependencies.coordinator.advance;
        const progress = Promise.resolve().then(() => this.dependencies.coordinator.advance !== undefined
            ? this.dependencies.coordinator.advance({ goalId, runId }, this.dependencies.control)
            : Promise.reject(new Error("Coordinator advance is not implemented")));

        void progress
            .then(() => {
                if (!accepted) {
                    settleAcceptance({ ok: false, error: "resume_failed" });
                }
            }, () => {
                if (!accepted) {
                    settleAcceptance({ ok: false, error: "resume_failed" });
                }
            })
            .finally(() => {
                unsubscribe();
                if (this.activeGoalId === goalId) this.setActiveGoalId(undefined);
                this.inFlightResumes.delete(key);
            });

        return acceptance;
    }

    private async start(command: BrowserCreateGoalCommand, modelSelection?: GoalModelSelection): Promise<BrowserCreateGoalResult> {
        let settleAcceptance!: (result: BrowserCreateGoalResult) => void;
        let accepted = false;
        const acceptance = new Promise<BrowserCreateGoalResult>((resolve) => {
            settleAcceptance = resolve;
        });

        const unsubscribe = this.dependencies.saveNotifications.onSave((goal) => {
            if (goal.id !== command.goalId || accepted) return;
            accepted = true;
            settleAcceptance(goal.definition.intent === command.intent
                ? {
                    ok: true,
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    existing: false,
                }
                : { ok: false, error: "goal_id_conflict" });
        });

        void Promise.resolve()
            .then(() => this.dependencies.launcher.launch({
                goalId: command.goalId,
                intent: command.intent,
                profileId: this.dependencies.profileId,
                ...(command.mode === undefined ? {} : { mode: command.mode }),
                ...(modelSelection === undefined ? {} : { modelSelection }),
            }, this.dependencies.control))
            .then(() => {
                if (!accepted) {
                    settleAcceptance({ ok: false, error: "goal_create_failed" });
                }
            }, () => {
                if (!accepted) {
                    settleAcceptance({ ok: false, error: "goal_create_failed" });
                }
            })
            .finally(() => {
                unsubscribe();
                if (this.activeGoalId === command.goalId) this.setActiveGoalId(undefined);
                this.inFlight.delete(command.goalId);
            });

        return acceptance;
    }

    private async startPlanMode(
        goalId: string,
        command: BrowserGoalPlanModeCommand,
    ): Promise<BrowserGoalPlanModeResult> {
        const key = `${goalId}\u0000${command.runId}`;
        try {
            const result = await this.dependencies.coordinator.enterPlanMode(
                { goalId, runId: command.runId },
                this.dependencies.control,
            );
            return result.ok
                ? { ok: true, goalId, runId: command.runId, existing: false }
                : {
                    ok: false,
                    error: result.error.code === "RUN_NOT_FOUND" ? "stale_run"
                        : result.error.code === "PLAN_MODE_BUSY" ? "plan_mode_busy"
                            : "plan_mode_failed",
                };
        } finally {
            if (this.activeGoalId === goalId) this.setActiveGoalId(undefined);
            this.inFlightPlanModes.delete(key);
        }
    }

    private async startInteraction(
        goalId: string,
        command: BrowserGoalInteractionCommand,
    ): Promise<BrowserGoalInteractionResult> {
        let settleAcceptance!: (result: BrowserGoalInteractionResult) => void;
        let accepted = false;
        const acceptance = new Promise<BrowserGoalInteractionResult>((resolve) => {
            settleAcceptance = resolve;
        });
        const key = interactionKey(goalId, command);
        const unsubscribe = this.dependencies.saveNotifications.onSave((goal) => {
            if (goal.id !== goalId || goal.state.run.id !== command.runId || accepted) return;
            accepted = true;
            settleAcceptance({
                ok: true,
                goalId,
                runId: goal.state.run.id,
                existing: false,
            });
        });

        void Promise.resolve()
            .then(() => this.dependencies.coordinator.resume({
                ref: { goalId, runId: command.runId },
                action: toRuntimeAction(command),
            }, this.dependencies.control))
            .then((result) => {
                if (!accepted) {
                    settleAcceptance({
                        ok: false,
                        error: result.ok ? "interaction_failed" : "invalid_interaction",
                    });
                }
            }, () => {
                if (!accepted) settleAcceptance({ ok: false, error: "interaction_failed" });
            })
            .finally(() => {
                unsubscribe();
                if (this.activeGoalId === goalId) this.setActiveGoalId(undefined);
                this.inFlightInteractions.delete(key);
            });

        return acceptance;
    }

    private async startMessage(
        initialGoal: Goal,
        command: BrowserGoalMessageCommand,
    ): Promise<BrowserGoalMessageResult> {
        let settleAcceptance!: (result: BrowserGoalMessageResult) => void;
        let accepted = false;
        const acceptance = new Promise<BrowserGoalMessageResult>((resolve) => {
            settleAcceptance = resolve;
        });
        const goalId = initialGoal.id;
        const runId = initialGoal.state.run.id;
        const initialMessageCount = initialGoal.state.messages.length;
        const startsNewRun = initialGoal.state.run.status === "completed" || initialGoal.state.run.status === "failed";
        const key = `${goalId}\u0000${runId}`;
        const unsubscribe = this.dependencies.saveNotifications.onSave((goal) => {
            if (goal.id !== goalId || accepted) return;
            const submittedMessage = goal.state.messages[initialMessageCount];
            if (submittedMessage?.role !== "user" || submittedMessage.content !== command.content) return;
            if (startsNewRun) {
                if (
                    goal.state.run.id === runId
                    || !(goal.state.completedRuns ?? []).some((run) => run.runId === runId)
                ) return;
            } else if (goal.state.run.id !== runId) {
                return;
            }
            accepted = true;
            settleAcceptance({
                ok: true,
                goalId,
                runId: goal.state.run.id,
                existing: false,
            });
        });

        const progress = Promise.resolve().then(() => startsNewRun
            ? this.dependencies.coordinator.continue({ goalId, runId }, command.content, this.dependencies.control)
            : this.dependencies.coordinator.resume({
                ref: { goalId, runId },
                action: { kind: "message", content: command.content },
            }, this.dependencies.control));
        void progress.then((result) => {
            if (!accepted) {
                settleAcceptance({
                    ok: false,
                    error: result.ok ? "message_failed" : messageProgressError(result.error.code),
                });
            }
        }, () => {
            if (!accepted) settleAcceptance({ ok: false, error: "message_failed" });
        }).finally(() => {
            unsubscribe();
            if (this.activeGoalId === goalId) this.setActiveGoalId(undefined);
            this.inFlightMessages.delete(key);
        });

        return acceptance;
    }

    private async withReservationLock<T>(operation: () => Promise<T>): Promise<T> {
        const previous = this.reservationTail;
        let release!: () => void;
        this.reservationTail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        try {
            return await operation();
        } finally {
            release();
        }
    }

    private isShuttingDown(): boolean {
        return this.dependencies.control?.signal?.aborted === true;
    }
}

function interactionKey(goalId: string, command: BrowserGoalInteractionCommand): string {
    const interactionId = "requestId" in command ? command.requestId : command.actionId;
    return `${goalId}\u0000${command.runId}\u0000${command.kind}\u0000${interactionId}`;
}

function validateInteractionTarget(
    goal: Goal,
    command: BrowserGoalInteractionCommand,
): Extract<BrowserGoalInteractionResult, { readonly ok: false }>["error"] | undefined {
    if (goal.state.run.id !== command.runId) return "stale_run";
    if (goal.state.run.status !== "waiting") return "goal_not_waiting";

    const interaction = goal.state.run.pendingInteraction;
    if (command.kind === "cancel_ask_user") {
        return interaction?.kind === "ask_user" && interaction.requestId === command.requestId
            ? undefined
            : "stale_request";
    }
    if (command.kind === "answer_ask_user") {
        return interaction?.kind === "ask_user" && interaction.requestId === command.requestId
            ? undefined
            : "stale_request";
    }
    if (command.kind === "approve_task" || command.kind === "feedback_task") {
        return interaction?.kind === "task_approval" && interaction.requestId === command.requestId
            ? undefined
            : "stale_request";
    }

    const pendingAction = goal.state.run.pendingAction;
    if (
        interaction !== undefined
        || pendingAction === undefined
        || pendingAction.action.actionId !== command.actionId
        || (pendingAction.status !== "awaiting_approval" && pendingAction.status !== "outcome_unknown")
    ) {
        return "action_not_waiting";
    }
    return undefined;
}

function toRuntimeAction(command: BrowserGoalInteractionCommand): GoalUserAction {
    switch (command.kind) {
        case "cancel_ask_user":
            return { kind: "cancel_ask_user", requestId: command.requestId };
        case "answer_ask_user":
            return {
                kind: "answer_ask_user",
                requestId: command.requestId,
                answers: command.answers,
            };
        case "approve_task":
            return { kind: "approve_task", requestId: command.requestId };
        case "feedback_task":
            return {
                kind: "feedback_task",
                requestId: command.requestId,
                feedback: command.feedback,
            };
        case "approve_action":
            return { kind: "approve_action", actionId: command.actionId, scope: command.scope ?? "action" };
        case "reject_action":
            return {
                kind: "reject_action",
                actionId: command.actionId,
                reason: command.reason,
            };
    }
}

function messageProgressError(
    code: string,
): Extract<BrowserGoalMessageResult, { readonly ok: false }>["error"] {
    switch (code) {
        case "RUN_NOT_FOUND": return "stale_run";
        case "GOAL_NOT_WAITING": return "goal_not_waiting";
        case "GOAL_NOT_COMPLETED": return "goal_not_completed";
        case "INVALID_GOAL_INPUT": return "invalid_message";
        default: return "message_failed";
    }
}
