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
    | "home"
    | "intent_input"
    | "goal_select"
    | "session"
    | "settings"
    | "inspector"
    | "shutting_down";

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
    | { readonly kind: "resume" }
    | { readonly kind: "continueLatest" }
    | { readonly kind: "selectGoal"; readonly goalId: string }
    | { readonly kind: "submitMessage"; readonly content: string }
    | { readonly kind: "approveTask" }
    | { readonly kind: "approveAction"; readonly actionId: string }
    /**
     * 重新推进一个停滞在中间态的 Preparation 阶段。
     *
     * @remarks
     * 仅在当前存在活动 Goal Session 时可用。命令等价于对最新快照再执行一次
     * `advance()`，由 Runtime 重跑 preparation executor 并推进到下一个等待点、
     * 终态或稳定业务错误。它不携带 Goal 状态、不写入快照，也不改变 Runtime
     * 的状态转换语义。
     *
     * 典型场景是 Goal 在上一次推进中被中断（例如进程退出或 executor 失败），
     * 快照停留在 `preparation.status === "active"`：此时 Goal 不属于任何
     * 等待用户输入的状态，`resume` 会被拒绝，只有本命令能恢复。
     *
     * @example
     * ```ts
     * await controller.dispatch({ kind: "retryPreparation" });
     * ```
     */
    | { readonly kind: "retryPreparation" }
    | {
        readonly kind: "rejectAction";
        readonly actionId: string;
        readonly reason: string;
    }
    | { readonly kind: "openHome" }
    | { readonly kind: "openIntentInput" }
    | { readonly kind: "openSettings" }
    | { readonly kind: "openHistory" }
    | { readonly kind: "toggleExecutionMode" }
    | { readonly kind: "setExecutionMode"; readonly mode: ExecutionMode }
    | {
        readonly kind: "openInspector";
        readonly goalId: string;
        readonly steps: readonly UiInspectorStep[];
    }
    | { readonly kind: "inspectStep"; readonly stepIndex: number }
    | { readonly kind: "toggleReasoning" }
    | { readonly kind: "toggleObservation" };

/**
 * 执行期人机协同模式。
 *
 * @remarks
 * - `"confirm"`：逐项人工确认待批准动作（按 Enter 批准，输入意见拒绝）；
 * - `"yolo"`：自动放行待批准动作，全速推进直至任务完成或进入 blocked 等待。
 *
 * @example
 * ```ts
 * const mode: ExecutionMode = "confirm";
 * ```
 */
export type ExecutionMode = "confirm" | "yolo";

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
 * 导航主页面的不可变投影。
 *
 * @example
 * ```ts
 * const view: UiHomeViewModel = { screen: "home", busy: false };
 * ```
 */
export interface UiHomeViewModel {
    readonly screen: "home";
    readonly busy: boolean;
    readonly error?: UiError;
    readonly environmentSummary?: {
        readonly workspaceRoot: string;
        readonly profileId: string;
    };
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
    /** 选择目标后的操作模式（默认为 resume，继续推进；inspect 为只读复盘审查）。 */
    readonly mode?: "resume" | "inspect";
}

/**
 * 环境与配置页面的不可变投影。
 *
 * @example
 * ```ts
 * const view: UiSettingsViewModel = {
 *     screen: "settings",
 *     busy: false,
 *     settings: { workspaceRoot: "/workspace", profileId: "default" },
 * };
 * ```
 */
export interface UiSettingsViewModel {
    readonly screen: "settings";
    readonly busy: boolean;
    readonly error?: UiError;
    readonly settings: {
        readonly workspaceRoot: string;
        readonly profileId: string;
        readonly modelName?: string;
        readonly dataDirectory?: string;
    };
}

/**
 * 轨迹单步执行单元的结构化决策区块。
 *
 * @remarks
 * 记录单步中模型生成的决策类型、思考过程摘要与候选工具调用信息。
 *
 * @example
 * ```ts
 * const decision: UiStepDecisionBlock = {
 *     kind: "tool_call",
 *     toolCall: { toolId: "read_file", actionId: "a1" },
 * };
 * ```
 */
export interface UiStepDecisionBlock {
    readonly kind: "tool_call" | "complete" | "wait" | "fail" | "context_lookup";
    readonly summary?: string;
    readonly reasoning?: string;
    readonly toolCall?: {
        readonly toolId: string;
        readonly actionId: string;
    };
}

/**
 * 轨迹单步执行单元的工具调用与审批区块。
 *
 * @remarks
 * 记录工具入参参数 JSON、审批状态（自动放行、人工批准、拒绝）以及拒绝理由。
 *
 * @example
 * ```ts
 * const action: UiStepActionBlock = {
 *     toolId: "bash",
 *     actionId: "a1",
 *     inputJson: "{\"command\": \"ls\"}",
 *     approvalStatus: "auto_approved",
 * };
 * ```
 */
export interface UiStepActionBlock {
    readonly toolId: string;
    readonly actionId: string;
    readonly inputJson: string;
    readonly approvalStatus: "auto_approved" | "approved" | "rejected" | "awaiting_approval";
    readonly rejectionReason?: string;
}

/**
 * 轨迹单步执行单元的工具执行与观测区块。
 *
 * @remarks
 * 记录工具执行状态、耗时、预览文本与是否发生截断。
 *
 * @example
 * ```ts
 * const obs: UiStepObservationBlock = {
 *     toolId: "bash",
 *     actionId: "a1",
 *     status: "success",
 *     observationPreview: "file1.txt\nfile2.txt",
 *     rawObservation: { exitCode: 0 },
 *     isTruncated: false,
 * };
 * ```
 */
export interface UiStepObservationBlock {
    readonly toolId: string;
    readonly actionId: string;
    readonly status: "success" | "error";
    readonly durationMs?: number;
    readonly observationPreview: string;
    readonly rawObservation: unknown;
    readonly isTruncated: boolean;
}

/**
 * 轨迹单步执行单元的终态或阶段结果区块。
 *
 * @remarks
 * 记录当前步产生的状态流转结果或终态说明。
 *
 * @example
 * ```ts
 * const result: UiStepResultBlock = { outcome: "completed", summary: "任务已完成" };
 * ```
 */
export interface UiStepResultBlock {
    readonly outcome: "next_step" | "completed" | "failed" | "cancelled" | "waiting";
    readonly summary?: string;
    readonly errorCode?: string;
    readonly errorMessage?: string;
}

/**
 * 轨迹复盘中单步（Step）的只读展示数据。
 *
 * @remarks
 * 包含当前步在整个轨迹中的索引、标题、所属阶段、结构化执行区块（Decision/Action/Observation/Result）、
 * 未提交尾部警示，以及对应的原始 JSON 序列化字符串。
 *
 * @example
 * ```ts
 * const step: UiInspectorStep = {
 *     index: 0,
 *     totalSteps: 1,
 *     title: "Step 1: Preparation & Planning",
 *     phase: "planning",
 *     rawJson: "{}",
 * };
 * ```
 */
export interface UiInspectorStep {
    readonly index: number;
    readonly totalSteps: number;
    readonly title?: string;
    readonly executionUnitId?: string;
    readonly phase?: "gathering_context" | "planning" | "executing";
    readonly preparationDetails?: readonly string[];
    readonly decision?: UiStepDecisionBlock;
    readonly action?: UiStepActionBlock;
    readonly observation?: UiStepObservationBlock;
    readonly result?: UiStepResultBlock;
    readonly uncommittedWarning?: string;
    /** 兼容历史对话渲染的可选消息列表。 */
    readonly messages?: readonly GoalMessage[];
    readonly reasoning?: string;
    readonly rawJson: string;
}

/**
 * 轨迹检查器全屏复盘页面的不可变投影。
 *
 * @example
 * ```ts
 * const view: UiInspectorViewModel = {
 *     screen: "inspector",
 *     busy: false,
 *     goalId: "goal-1",
 *     currentStepIndex: 0,
 *     totalSteps: 1,
 *     steps: [],
 *     showReasoning: false,
 * };
 * ```
 */
export interface UiInspectorViewModel {
    readonly screen: "inspector";
    readonly busy: boolean;
    readonly error?: UiError;
    readonly goalId: string;
    readonly currentStepIndex: number;
    readonly totalSteps: number;
    readonly steps: readonly UiInspectorStep[];
    readonly showReasoning: boolean;
    /** 是否完整展开当前步的 Observation 观测输出（默认为 compact 紧凑截断）。 */
    readonly expandObservation?: boolean;
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
    readonly messages: readonly GoalMessage[];
    readonly waitingFor?: UiWaitingFor;
    /** 执行期人机协同模式（"confirm" 逐项确认 / "yolo" 自动放行）。 */
    readonly executionMode?: ExecutionMode;
    /**
     * 当前 Goal 的 Preparation 阶段是否已停滞在无法自行推进的中间态。
     *
     * @remarks
     * 只在「非 `executing` 阶段 + `preparation.status` 为 `active` + 不存在
     * 等待用户输入的等待点 + 当前没有进行中的异步推进」时由 Controller 置为
     * `true`。`active` 在一次正常 `advance()` 进行期间同样是合法的瞬时态，
     * 因此必须叠加 busy 判断，否则正常推进过程中会误报中断。
     *
     * 该状态表示 Goal **不**在等待用户输入，因此不进入 `UiWaitingFor`；
     * 此时 `resume` 会被 Runtime 拒绝，用户只能通过 `retryPreparation` 恢复。
     *
     * @example
     * ```ts
     * if (view.preparationStalled === true) render(<StalledPanel onRetry={retry} />);
     * ```
     */
    readonly preparationStalled?: boolean;
    readonly question?: string;
    readonly proposal?: GoalTask;
    readonly blockedReason?: string;
    readonly pendingAction?: PendingAction;
    readonly terminal?: UiTerminalSummary;
    readonly error?: UiError;
    /** 可选执行模式（"auto" 或 "review"）。 */
    readonly mode?: "auto" | "review";
    /** 可选任务标识或描述。 */
    readonly taskTitle?: string;
    /** 最近一次成功提交的 Action 摘要。 */
    readonly lastCommittedAction?: {
        readonly toolId: string;
        readonly actionId: string;
        readonly inputSummary?: string;
    };
    /** 最近一次成功提交的 Observation 摘要。 */
    readonly lastCommittedObservation?: {
        readonly toolId: string;
        readonly status: string;
        readonly summary?: string;
    };
    /** 是否处于沙箱资源清理阶段。 */
    readonly cleaning?: boolean;
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

/** React 外部 Store 所需的统一快照类型。 */
export type UiViewModel =
    | UiHomeViewModel
    | UiIntentInputViewModel
    | UiGoalSelectViewModel
    | UiSessionViewModel
    | UiSettingsViewModel
    | UiInspectorViewModel
    | UiShuttingDownViewModel;

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
    /** 可选已提交快照保存通知源。 */
    readonly notifyingStore?: { onSave(listener: (goal: Goal) => void): () => void };
    /** 可选执行模式（"auto" 或 "review"）。 */
    readonly mode?: "auto" | "review";
    /** 可选任务标识或标题。 */
    readonly taskTitle?: string;
    /** 可选初始 Goal 会话实例，提供时直接进入 Session 页面。 */
    readonly initialGoal?: import("../../runtime/src/index.js").Goal;
    /** 可选初始展示页面，未指定 initialGoal 时默认为 "intent_input"（若指定 initialScreen 为 "home" 则进入主页）。 */
    readonly initialScreen?: UiScreen;
    /** 可选初始目标选择模式（"resume" 或 "inspect"），在 initialScreen 为 "goal_select" 时生效。 */
    readonly initialGoalSelectMode?: "resume" | "inspect";
    /** 可选初始人机协同模式，默认为 "confirm"。 */
    readonly initialExecutionMode?: ExecutionMode;
    /** 可选的 Trajectory 事件读取器（通常来自 readTrajectoryAtSnapshot）。 */
    readonly readTrajectory?: (
        query: import("../../runtime/src/index.js").TrajectoryReadQuery,
    ) => Promise<Readonly<import("../../runtime/src/index.js").TrajectoryReadResult>>;
    /** 可选当前环境与配置信息，用于 Home 与 Settings 页面只读展示。 */
    readonly environmentSummary?: {
        readonly workspaceRoot: string;
        readonly profileId: string;
        readonly modelName?: string;
        readonly dataDirectory?: string;
    };
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
