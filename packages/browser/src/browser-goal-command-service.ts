import type {
    ExecutionControl,
    Goal,
    GoalStore,
    LaunchRequest,
    LaunchResult,
} from "../../runtime/src/index";

/**
 * 浏览器发起的 Goal 创建命令。
 *
 * @remarks
 * Goal ID 由客户端在提交前生成并在重试时复用，意图创建后冻结。Profile 与执行策略
 * 由本机 Composition Root 决定，浏览器不能覆盖这些设置。
 *
 * @example
 * ```ts
 * const command: BrowserCreateGoalCommand = {
 *     goalId: crypto.randomUUID(),
 *     intent: "检查当前项目",
 * };
 * ```
 */
export interface BrowserCreateGoalCommand {
    /** 创建请求的稳定身份，也是同一请求安全重试的幂等键。 */
    readonly goalId: string;
    /** 要冻结到新 Goal 的原始用户意图。 */
    readonly intent: string;
}

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
 * 浏览器 Goal 创建服务所需依赖。
 *
 * @example
 * ```ts
 * const dependencies: BrowserGoalCommandDependencies = {
 *     store, saveNotifications, launcher, profileId: "default",
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
    /** 本机 Composition Root 已验证并加载的 Profile ID。 */
    readonly profileId: string;
    /** 与本机 ShutdownCoordinator 共享的可选取消信号。 */
    readonly control?: ExecutionControl;
}

interface InFlightCreate {
    readonly intent: string;
    readonly accepted: Promise<BrowserCreateGoalResult>;
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
    private activeGoalId: string | undefined;
    private reservationTail: Promise<void> = Promise.resolve();

    /**
     * @param dependencies - 正式 Snapshot 读取、保存通知、本机 Launcher 與 Profile。
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
                if (current.intent !== command.intent) {
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
            this.inFlight.set(command.goalId, { intent: command.intent, accepted });
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
