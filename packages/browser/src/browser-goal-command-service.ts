import type {
    ExecutionControl,
    Goal,
    GoalCoordinator,
    GoalStore,
    GoalUserAction,
    LaunchRequest,
    LaunchResult,
    ResumeGoalRequest,
} from "../../runtime/src/index";

/**
 * 浏览器发起的 Goal 创建命令。
 *
 * @remarks
 * Goal ID 由客户端在提交前生成并在重试时复用，意图与首次 Run 模式共同标识创建请求。
 * Profile 与执行策略由本机 Composition Root 决定，浏览器不能覆盖这些设置。
 *
 * @example
 * ```ts
 * const command: BrowserCreateGoalCommand = {
 *     goalId: crypto.randomUUID(),
 *     intent: "检查当前项目",
 *     mode: "plan",
 * };
 * ```
 */
export interface BrowserCreateGoalCommand {
    /** 创建请求的稳定身份，也是同一请求安全重试的幂等键。 */
    readonly goalId: string;
    /** 要冻结到新 Goal 的原始用户意图。 */
    readonly intent: string;
    /** 首个 Run 的显式模式；省略时使用 Normal Mode。 */
    readonly mode?: "plan";
}

/**
 * 浏览器显式选择当前或下一 Run 的 Plan Mode。
 *
 * @remarks
 * 命令由当前会话的 Goal/Run 身份限定，不会创建消息或 Run Step。
 * Runtime 仅允许在 Run 启动前或已完成后切换；其他状态按稳定错误码拒绝。
 *
 * @example
 * ```ts
 * const command: BrowserGoalPlanModeCommand = { runId: "run-1" };
 * ```
 */
export interface BrowserGoalPlanModeCommand {
    /** 页面读取到的当前 Run 稳定身份。 */
    readonly runId: string;
}

/**
 * 浏览器选择 Plan Mode 的受理结果。
 *
 * @example
 * ```ts
 * const result: BrowserGoalPlanModeResult = {
 *     ok: true, goalId: "goal-1", runId: "run-1", existing: false,
 * };
 * ```
 */
export type BrowserGoalPlanModeResult =
    | { readonly ok: true; readonly goalId: string; readonly runId: string; readonly existing: boolean }
    | {
        readonly ok: false;
        readonly error: "goal_not_found" | "stale_run" | "goal_busy" | "plan_mode_busy" | "plan_mode_failed";
    };

/**
 * 浏览器提交的普通会话文本。
 *
 * @remarks
 * 命令绑定当前 Run。等待中的普通文本恢复同一 Run；已完成 Run 的文本创建后继 Run。
 * 文本不适用于结构化交互等待点，也不携带任意 Profile 或执行策略。
 *
 * @example
 * ```ts
 * const command: BrowserGoalMessageCommand = {
 *     runId: "run-1",
 *     content: "继续检查剩余内容",
 * };
 * ```
 */
export interface BrowserGoalMessageCommand {
    /** 页面读取到的当前 Run 稳定身份。 */
    readonly runId: string;
    /** 用户提交的非空文本。 */
    readonly content: string;
}

/**
 * 普通会话文本命令的受理结果。
 *
 * @remarks
 * 成功只在用户消息及相应 Run 状态变更已保存后返回。相同在途内容的重试复用原受理。
 *
 * @example
 * ```ts
 * const result: BrowserGoalMessageResult = {
 *     ok: true, goalId: "goal-1", runId: "run-2", existing: false,
 * };
 * ```
 */
export type BrowserGoalMessageResult =
    | {
        readonly ok: true;
        readonly goalId: string;
        /** 等待恢复时为原 Run；完成后续任务时为新 Run。 */
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
            | "message_conflict"
            | "invalid_message"
            | "message_failed";
    };

/**
 * 浏览器创建命令的受理结果。
 *
 * @remarks
 * 成功只在真实 Goal Snapshot 已成功保存后返回。`existing` 表示相同 ID 和意图
 * 已经存在或此请求是同一在途创建的重试；错误不会创建虚构列表项。
 *
 * @example
 * ```ts
 * const result: BrowserCreateGoalResult = {
 *     ok: true, goalId: "goal-1", runId: "run-1", existing: false,
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
        readonly error: "invalid_goal_input" | "goal_id_conflict" | "goal_busy" | "goal_create_failed";
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
 * 每种操作都携带当前 Run 身份与相应的 requestId/actionId。普通消息不属于此联合，
 * 也不能借由回答或审批结构绕过 Runtime 的等待类型和请求身份校验。
 *
 * @example
 * ```ts
 * const command: BrowserGoalInteractionCommand = {
 *     kind: "approve_task", runId: "run-1", requestId: "proposal-1",
 * };
 * ```
 */
export type BrowserGoalInteractionCommand =
    | {
        readonly kind: "answer_ask_user";
        readonly runId: string;
        readonly requestId: string;
        readonly answers: NonNullable<Extract<GoalUserAction, { kind: "answer_ask_user" }>["answers"]>;
    }
    | { readonly kind: "approve_task"; readonly runId: string; readonly requestId: string }
    | { readonly kind: "feedback_task"; readonly runId: string; readonly requestId: string; readonly feedback: string }
    | { readonly kind: "approve_action"; readonly runId: string; readonly actionId: string }
    | { readonly kind: "reject_action"; readonly runId: string; readonly actionId: string; readonly reason: string };

/**
 * 浏览器结构化交互的受理结果。
 *
 * @remarks
 * 成功响应只在匹配的 Run 更新被保存后发出；重复的同一在途请求返回 `existing: true`。
 * 拒绝结果只含稳定错误码，不暴露快照、模型内容或异常文本。
 *
 * @example
 * ```ts
 * const result: BrowserGoalInteractionResult = {
 *     ok: true, goalId: "goal-1", runId: "run-1", existing: false,
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
            | "goal_busy"
            | "invalid_interaction"
            | "interaction_failed";
    };

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
     * 依据当前 Goal/Run 身份选择 Plan Mode，并遵守 Runtime 的 Run 状态限制。
     *
     * @param ref - 当前 Goal 与 Run 的稳定关联键。
     * @param control - 本机关闭协调使用的取消信号。
     * @returns 选择提交后的 Goal 或稳定业务错误。
     * @throws Store、Trajectory 或提交边界故障时拒绝。
     */
    enterPlanMode(
        ref: Parameters<GoalCoordinator["enterPlanMode"]>[0],
        control?: ExecutionControl,
    ): ReturnType<GoalCoordinator["enterPlanMode"]>;
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
    /** 本机 Composition Root 已验证并加载的 Profile ID。 */
    readonly profileId: string;
    /** 与本机 ShutdownCoordinator 共享的可选取消信号。 */
    readonly control?: ExecutionControl;
}

interface InFlightCreate {
    readonly intent: string;
    readonly mode: "normal" | "plan";
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
    private activeGoalId: string | undefined;
    private reservationTail: Promise<void> = Promise.resolve();

    /**
     * @param dependencies - 正式 Snapshot 读取、保存通知、本机 Launcher、Coordinator 与 Profile。
     */
    constructor(private readonly dependencies: BrowserGoalCommandDependencies) {}

    /**
     * 按稳定 ID 受理一个 Goal 创建。
     *
     * @param command - 已通过 HTTP wire 校验的 Goal ID 和用户意图。
     * @returns 快照提交后的受理结果；同 ID/同意图的重试返回同一受理结果。
     * @throws 正式 Store 读取失败时拒绝；不会生成虚构 Goal 列表项。
     */
    async create(command: BrowserCreateGoalCommand): Promise<BrowserCreateGoalResult> {
        const reservation = await this.withReservationLock(async (): Promise<Reservation> => {
            const current = this.inFlight.get(command.goalId);
            if (current !== undefined) {
                if (current.intent !== command.intent || current.mode !== (command.mode ?? "normal")) {
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

            this.activeGoalId = command.goalId;
            const accepted = this.start(command);
            this.inFlight.set(command.goalId, {
                intent: command.intent,
                mode: command.mode ?? "normal",
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

            this.activeGoalId = goalId;
            const accepted = this.startPlanMode(goalId, command);
            this.inFlightPlanModes.set(key, { accepted });
            return { kind: "in_flight", accepted };
        });

        return reservation.kind === "result" ? reservation.result : reservation.accepted;
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

            this.activeGoalId = goalId;
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

            this.activeGoalId = goalId;
            const accepted = this.startMessage(goal, command);
            this.inFlightMessages.set(key, { content: command.content, accepted });
            return { kind: "in_flight", accepted };
        });

        return reservation.kind === "result" ? reservation.result : reservation.accepted;
    }

    private async start(command: BrowserCreateGoalCommand): Promise<BrowserCreateGoalResult> {
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
                if (this.activeGoalId === command.goalId) this.activeGoalId = undefined;
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
            if (this.activeGoalId === goalId) this.activeGoalId = undefined;
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
                if (this.activeGoalId === goalId) this.activeGoalId = undefined;
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
            if (this.activeGoalId === goalId) this.activeGoalId = undefined;
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
}

function interactionKey(goalId: string, command: BrowserGoalInteractionCommand): string {
    const requestId = "requestId" in command ? command.requestId : command.actionId;
    return `${goalId}\u0000${command.runId}\u0000${command.kind}\u0000${requestId}`;
}

function validateInteractionTarget(
    goal: Goal,
    command: BrowserGoalInteractionCommand,
): Extract<BrowserGoalInteractionResult, { readonly ok: false }>["error"] | undefined {
    if (goal.state.run.id !== command.runId) return "stale_run";
    if (goal.state.run.status !== "waiting") return "goal_not_waiting";

    const interaction = goal.state.run.pendingInteraction;
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
            return { kind: "approve_action", actionId: command.actionId };
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
