import type {
    ExecutionControl,
    Goal,
    GoalCatalog,
    GoalCatalogEntry,
    GoalMessage,
    GoalProgressResult,
    GoalStore,
    GoalTask,
    LaunchRequest,
    LaunchResult,
    PendingAction,
    ResumeGoalRequest,
    RunRef,
    RunStatus,
} from "../../runtime/src/index";

/** Controller 在已有异步操作期间拒绝新命令时使用的稳定错误码。 */
export const UI_BUSY_CODE = "UI_BUSY" as const;

/** Controller 进入关闭流程后拒绝新命令时使用的稳定错误码。 */
export const UI_SHUTTING_DOWN_CODE = "UI_SHUTTING_DOWN" as const;

/** Controller 支持的顶层 TUI 页面。 */
export type UiScreen =
    | "intent_input"
    | "goal_select"
    | "session"
    | "shutting_down"
    | "fatal";

/**
 * 可展示给用户并可由 UI 稳定判断的错误。
 *
 * @example
 * ```ts
 * const error: UiError = { code: "RUN_NOT_FOUND", message: "Goal was not found" };
 * ```
 */
export interface UiError {
    /** 机器可判断的稳定错误码。 */
    readonly code: string;
    /** 面向用户的英文错误消息。 */
    readonly message: string;
}

/**
 * TUI 发往 SessionController 的最小命令协议。
 *
 * @remarks
 * 命令只描述用户意图，不携带 Goal 状态；Controller 负责读取最新快照并
 * 映射到 Launcher、Coordinator、Store 或 Catalog。
 *
 * @example
 * ```ts
 * await controller.dispatch({ kind: "create", intent: "Inspect the repository" });
 * ```
 */
export type UiCommand =
    | { readonly kind: "create"; readonly intent: string }
    /** 打开可恢复 Goal 选择页面；`resume` 是面向 CLI 的同义入口。 */
    | { readonly kind: "openGoalSelect" }
    | { readonly kind: "resume" }
    | { readonly kind: "continueLatest" }
    | { readonly kind: "selectGoal"; readonly goalId: string }
    | { readonly kind: "submitMessage"; readonly content: string }
    | { readonly kind: "approveTask" }
    | { readonly kind: "approveAction"; readonly actionId: string }
    | {
        readonly kind: "rejectAction";
        readonly actionId: string;
        readonly reason: string;
    };

/** Session 等待用户输入的细分类型。 */
export type UiWaitingFor =
    | "question"
    | "approval"
    | "blocked"
    | "action_approval"
    | "action_recovery";

/**
 * Session 终态在 ViewModel 中的有界摘要。
 *
 * @example
 * ```ts
 * if (view.terminal?.status === "completed") console.log(view.terminal.summary);
 * ```
 */
export interface UiTerminalSummary {
    /** 已终止 Run 的 Runtime 状态。 */
    readonly status: Extract<RunStatus, "completed" | "failed" | "cancelled">;
    /** Agent 提供的完成摘要（如果有）。 */
    readonly summary?: string;
    /** Runtime 或取消流程提供的终止原因（如果有）。 */
    readonly reason?: string;
}

/**
 * 初始意图输入页面的不可变投影。
 *
 * @example
 * ```ts
 * const view: UiIntentInputViewModel = { screen: "intent_input", busy: false };
 * ```
 */
export interface UiIntentInputViewModel {
    readonly screen: "intent_input";
    readonly busy: boolean;
    readonly error?: UiError;
}

/**
 * 可恢复 Goal 选择页面的不可变投影。
 *
 * @example
 * ```ts
 * const view: UiGoalSelectViewModel = { screen: "goal_select", busy: false, goals: [] };
 * ```
 */
export interface UiGoalSelectViewModel {
    readonly screen: "goal_select";
    readonly busy: boolean;
    readonly goals: readonly GoalCatalogEntry[];
    readonly error?: UiError;
}

/**
 * 当前单 Goal 会话的不可变投影。
 *
 * @remarks
 * `goal` 始终是最新完整快照的结构化副本；其余字段是 Controller 从该快照
 * 和最近一次推进结果派生的显示字段，UI 不应自行推断 Runtime 状态机。
 *
 * @example
 * ```ts
 * if (view.screen === "session" && view.waitingFor === "question") {
 *   console.log(view.question);
 * }
 * ```
 */
export interface UiSessionViewModel {
    readonly screen: "session";
    readonly busy: boolean;
    readonly goal: Goal;
    readonly phase: Goal["state"]["workflow"]["phase"];
    readonly runStatus: RunStatus;
    readonly stepCount: number;
    readonly checkpoint?: string;
    readonly messages: readonly GoalMessage[];
    readonly waitingFor?: UiWaitingFor;
    readonly question?: string;
    readonly proposal?: GoalTask;
    readonly blockedReason?: string;
    readonly pendingAction?: PendingAction;
    readonly terminal?: UiTerminalSummary;
    readonly error?: UiError;
}

/**
 * 关闭流程页面的不可变投影；由后续 ShutdownController 驱动。
 *
 * @example
 * ```ts
 * const view: UiShuttingDownViewModel = { screen: "shutting_down", busy: true };
 * ```
 */
export interface UiShuttingDownViewModel {
    readonly screen: "shutting_down";
    readonly busy: boolean;
    readonly goal?: Goal;
    readonly error?: UiError;
}

/**
 * 不可恢复错误页面的不可变投影。
 *
 * @example
 * ```ts
 * const view: UiFatalViewModel = {
 *   screen: "fatal",
 *   busy: false,
 *   error: { code: "CONFIG_ERROR", message: "Configuration is invalid" },
 * };
 * ```
 */
export interface UiFatalViewModel {
    readonly screen: "fatal";
    readonly busy: boolean;
    readonly error: UiError;
}

/** React 外部 Store 所需的统一快照类型。 */
export type UiViewModel =
    | UiIntentInputViewModel
    | UiGoalSelectViewModel
    | UiSessionViewModel
    | UiShuttingDownViewModel
    | UiFatalViewModel;

/** SessionController 快照订阅回调。 */
export type UiSubscriber = () => void;

/**
 * Controller 使用的 Launcher 适配边界。
 *
 * @remarks
 * 生产组合根可将 Runtime 的 `launch` 函数包装为该对象；测试可以直接返回
 * 固定的 `LaunchResult`，从而不启动真实模型或进程。
 *
 * @example
 * ```ts
 * const launcher: SessionLauncher = {
 *   launch: (request, control) => launch(request, runtimeDeps, control),
 * };
 * ```
 */
export interface SessionLauncher {
    /**
     * @param request - Controller 生成的 Goal 创建请求。
     * @param control - 当前调用共享的可选中止控制。
     * @returns 最新等待点、终态或稳定业务错误。
     */
    launch(
        request: LaunchRequest,
        control?: ExecutionControl,
    ): Promise<LaunchResult>;
}

/**
 * Controller 使用的 Coordinator 适配边界。
 *
 * @example
 * ```ts
 * const coordinator: SessionCoordinator = new GoalCoordinator(runtimeDeps);
 * ```
 */
export interface SessionCoordinator {
    /**
     * 从最新快照推进到下一等待点或终态。
     *
     * @param ref - Goal 与当前 Run 的关联键。
     * @param control - 可选的共享中止控制。
     * @returns 最新等待点、终态或稳定业务错误。
     */
    advance(ref: RunRef, control?: ExecutionControl): Promise<GoalProgressResult>;
    /**
     * 将 UI 用户操作恢复到对应等待点。
     *
     * @param request - Goal/Run 关联键与用户操作。
     * @param control - 可选的共享中止控制。
     * @returns 最新等待点、终态或稳定业务错误。
     */
    resume(
        request: ResumeGoalRequest,
        control?: ExecutionControl,
    ): Promise<GoalProgressResult>;
}

/**
 * 创建 SessionController 所需的运行时适配与身份生成依赖。
 *
 * @remarks
 * `goalIdGenerator` 与 `profileId` 由组合根提供；Controller 不依赖 UUID、
 * Profile Registry 或具体文件系统。`store` 与 `catalog` 通常由同一个
 * JsonFileGoalStore 实例实现，以保证恢复边界一致。
 *
 * @example
 * ```ts
 * const dependencies: SessionControllerDependencies = {
 *   launcher,
 *   coordinator,
 *   store,
 *   catalog: store,
 *   profileId: "default",
 *   goalIdGenerator: () => crypto.randomUUID(),
 * };
 * ```
 */
export interface SessionControllerDependencies {
    /** 创建并自动推进新 Goal 的 Launcher 适配器。 */
    readonly launcher: SessionLauncher;
    /** 推进或恢复已存在 Goal 的 Coordinator。 */
    readonly coordinator: SessionCoordinator;
    /** 按 goalId 读取最新完整快照。 */
    readonly store: Pick<GoalStore, "restore">;
    /** 查询可恢复 Goal 摘要。 */
    readonly catalog: GoalCatalog;
    /** 新 Goal 使用的 Profile ID。 */
    readonly profileId: string;
    /** 每次合法 create 命令生成一次稳定 Goal ID。 */
    readonly goalIdGenerator: () => string;
    /** 可选的 executing Step 上限。 */
    readonly maxSteps?: number;
    /** 贯穿本次 Controller 调用链的可选中止控制。 */
    readonly control?: ExecutionControl;
}

/**
 * Controller 在 busy 或关闭状态拒绝命令时抛出的稳定错误。
 *
 * @example
 * ```ts
 * try {
 *   await controller.dispatch(command);
 * } catch (error) {
 *   if (error instanceof UiDispatchRejectedError) console.log(error.code);
 * }
 * ```
 */
export class UiDispatchRejectedError extends Error {
    /** 可供 UI 判断的拒绝码。 */
    readonly code: typeof UI_BUSY_CODE | typeof UI_SHUTTING_DOWN_CODE;

    /** @param code - 拒绝原因；@param message - 面向调用方的消息。 */
    constructor(
        code: typeof UI_BUSY_CODE | typeof UI_SHUTTING_DOWN_CODE,
        message: string,
    ) {
        super(message);
        this.name = "UiDispatchRejectedError";
        this.code = code;
    }
}
