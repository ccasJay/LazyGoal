import type {
    ExecutionControl,
    Goal,
    GoalCatalog,
    GoalCatalogEntry,
    GoalMessage,
    GoalProgressResult,
    GoalStore,
    GoalTask,
    GoalModelSelection,
    LaunchRequest,
    LaunchResult,
    PendingAction,
    ResumeGoalRequest,
    RunRef,
    RunStatus,
    ToolGrant,
} from "../../runtime/src/index";
import type { AskUserAnswer, AskUserQuestion } from "../../contracts/src/index";
import type { LlmModelCatalog, LlmModelDescriptor } from "../../llm/src/model-catalog";
import type { LlmConfig } from "../../llm/src/config";
import type { ExecutionStreamPublisher } from "../../execution-stream/src/index";
import type { PermissionMode, ProjectPermissionMode } from "../../permission/src/index";

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
    | "tool_permissions"
    | "settings"
    | "inspector"
    | "model_select"
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
 * 映射到 Launcher、Coordinator、Store 或 Catalog。任务批准和反馈命令必须携带
 * 当前任务提案的 request ID，避免旧交互操作新提案。
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
    | { readonly kind: "enterPlanMode" }
    | { readonly kind: "approveTask"; readonly requestId: string }
    | {
        readonly kind: "feedbackTask";
        readonly requestId: string;
        readonly feedback: string;
    }
    | {
        readonly kind: "answerAskUser";
        readonly requestId: string;
        readonly answers: readonly AskUserAnswer[];
    }
    | { readonly kind: "approveAction"; readonly actionId: string; readonly scope?: "action" | "goal" | "workspace" }
    | { readonly kind: "revokeToolGrant"; readonly grantId: string; readonly scope: ToolGrant["scope"] }
    | { readonly kind: "openToolPermissions" }
    | { readonly kind: "closeToolPermissions" }
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
    | { readonly kind: "toggleObservation" }
    | { readonly kind: "openModelSelector" }
    | { readonly kind: "cancelModelSelect" }
    | { readonly kind: "selectModel"; readonly model: LlmModelDescriptor };

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

/** 面向用户的临时通知提示。 */
export interface UiNotice {
    readonly kind: "info" | "warning" | "error";
    readonly message: string;
}

/**
 * TUI 中规范化的 AskUser 交互请求视图模型。
 *
 * @remarks
 * 包含当前问卷请求的稳定标识、生命周期模式与规范化问题列表。
 *
 * @example
 * ```ts
 * const req: UiAskUserRequest = {
 *     requestId: "ask-1",
 *     mode: "plan",
 *     questions: [],
 * };
 * ```
 */
export interface UiAskUserRequest {
    readonly requestId: string;
    readonly mode: "plan" | "execution";
    readonly questions: readonly AskUserQuestion[];
}

/** Session 等待用户输入的细分类型。 */
export type UiWaitingFor =
    | "ask_user"
    | "task_approval"
    | "action_approval"
    | "action_recovery"
    | "blocked";

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
    readonly notice?: UiNotice;
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
 * 包含当前步在整个轨迹中的索引、当步包含的消息与可选模型思考内容，以及对应的原始 JSON 序列化字符串。
 * 包含当前步在整个轨迹中的索引、标题、所属阶段、结构化执行区块（Decision/Action/Observation/Result）、
 * 未提交尾部警示，以及对应的原始 JSON 序列化字符串。
 *
 * @example
 * ```ts
 * const step: UiInspectorStep = {
 *     index: 0,
 *     totalSteps: 1,
 *     messages: [],
 *     title: "Step 1: Execution",
 *     phase: "executing",
 *     rawJson: "{}",
 * };
 * ```
 */
export interface UiInspectorStep {
    readonly index: number;
    readonly totalSteps: number;
    readonly title?: string;
    readonly executionUnitId?: string;
    readonly phase?: "executing";
    /** Goal 生命周期事件与初始化上下文的简要详情。 */
    readonly lifecycleDetails?: readonly string[];
    readonly decision?: UiStepDecisionBlock;
    readonly action?: UiStepActionBlock;
    readonly observation?: UiStepObservationBlock;
    readonly result?: UiStepResultBlock;
    /** 从已提交 Trajectory 投影的模型纠错与 Tool 重试摘要。 */
    readonly recoveryDetails?: readonly string[];
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
 * if (view.screen === "session" && view.waitingFor === "ask_user") {
 *   console.log(view.askUser);
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
    /** 服务端持久化的项目权限执行模式（"default" 默认逐项确认 / "yolo" 自动放行）。 */
    readonly permissionMode?: PermissionMode;
    /** 服务端项目权限模式的当前修订号。 */
    readonly permissionRevision?: number;
    /** 当前挂起的 AskUser 问卷请求（当 waitingFor 为 "ask_user" 时有效）。 */
    readonly askUser?: UiAskUserRequest;
    /** 问卷所属任务模式（"plan" 任务批准前 / "execution" 任务批准后）。 */
    readonly interactionMode?: "plan" | "execution";
    readonly proposal?: GoalTask;
    /** 当前任务提案的稳定关联请求标识。 */
    readonly proposalRequestId?: string;
    /** Agent 发起的任务审批提示文案。 */
    readonly approvalRequest?: string;
    readonly blockedReason?: string;
    readonly pendingAction?: PendingAction;
    /** 当前 Goal 与工作区的授权摘要，不包含精确输入摘要。 */
    readonly toolGrants?: readonly UiToolGrantSummary[];
    /** 授权摘要读取失败时供界面说明。 */
    readonly toolGrantError?: UiError;
    readonly terminal?: UiTerminalSummary;
    /** Goal Snapshot 中已提交的当前计划；计划独立于 Run 模式显示。 */
    readonly goalPlan?: Goal["state"]["goalPlan"];
    readonly error?: UiError;
    readonly notice?: UiNotice;
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
    /**
     * 已按单调顺序成功提交到持久化存储的步骤历史时间线。
     *
     * @remarks
     * 瀑布式流式展示的数据源。未执行任何步骤时为空数组或未定义。
     */
    readonly committedSteps?: readonly UiStepSummary[];
    /** 是否处于沙箱资源清理阶段。 */
    readonly cleaning?: boolean;
    /**
     * 统一单调有序的时间线项目列表（不可变历史）。
     *
     * @remarks
     * 包含已提交的 User 消息、已提交的执行步骤以及已提交的 Assistant Markdown Blocks。
     * Session 页面中的 Ink Static 历史组件直接消费本时间线，不再在 Screen 内维护本地副本。
     *
     * @example
     * ```ts
     * if (view.timeline) {
     *   console.log(view.timeline.length);
     * }
     * ```
     */
    readonly timeline?: readonly UiTimelineItem[];
    /**
     * 当前正在流式接收的 Assistant 动态尾部。
     *
     * @remarks
     * 在有活动 Assistant 消息流时存在，由尚未提交到不可变历史的 pendingBlocks 与 mutableTail 组成。
     * 随着所有 Block 经由 Commit Tick 提交完毕后置为 undefined。
     *
     * @example
     * ```ts
     * if (view.streamingTail) {
     *   console.log(view.streamingTail.content);
     * }
     * ```
     */
    readonly streamingTail?: UiStreamingTail;
    /** 当前执行流正在发生的 Step/模型/Tool 活动，用于动态尾部渲染。 */
    readonly liveActivity?: UiExecutionActivity;
}

/**
 * 当前 Goal 与工作区的可撤销授权管理页投影。
 *
 * @example
 * ```ts
 * if (view.screen === "tool_permissions") console.log(view.grants.length);
 * ```
 */
export interface UiToolPermissionsViewModel {
    readonly screen: "tool_permissions";
    readonly busy: boolean;
    readonly goal: Goal;
    readonly grants: readonly UiToolGrantSummary[];
    readonly error?: UiError;
    readonly session: UiSessionViewModel;
}

/**
 * TUI 可安全显示和撤销的持续授权摘要。
 *
 * @example
 * ```ts
 * const grant: UiToolGrantSummary = {
 *   grantId: "grant-1", scope: "goal", toolId: "write_file", status: "active",
 *   targetPath: "src/app.ts",
 * };
 * ```
 */
export interface UiToolGrantSummary {
    readonly grantId: string;
    readonly scope: ToolGrant["scope"];
    readonly toolId: string;
    readonly status: ToolGrant["status"];
    readonly targetPath?: string;
}

/**
 * 执行流适配器向 Session 页面提供的瞬时活动摘要。
 *
 * @remarks
 * 该摘要只来自实时事件，不作为 Goal Snapshot 或 Trajectory 的恢复事实；重新
 * 打开会话时由已提交快照重新建立历史，新的实时事件再建立活动摘要。
 *
 * @example
 * ```ts
 * const activity: UiExecutionActivity = {
 *   kind: "tool",
 *   executionUnitId: "step-1",
 *   label: "Running bash",
 *   toolId: "bash",
 * };
 * ```
 */
export interface UiExecutionActivity {
    /** 当前活动属于 Step、模型生成还是 Tool 执行。 */
    readonly kind: "step" | "model" | "tool";
    /** 关联 Runtime Step 的稳定标识。 */
    readonly executionUnitId: string;
    /** 面向 UI 的当前阶段标签。 */
    readonly label: string;
    /** Tool 标识；仅 Tool 活动提供。 */
    readonly toolId?: string;
    /** Action 标识；若事件携带则提供。 */
    readonly actionId?: string;
    /** 最近收到的 Tool 输出尾部，受 Controller 的固定字符上限约束。 */
    readonly output?: string;
}

/**
 * Session 时间线中已提交不可变项的联合类型。
 *
 * @remarks
 * 保持严格的产生顺序，供 SessionScreen 中的 Ink Static 组件直接渲染：
 * 1. `message`: 原子提交的用户或系统消息；
 * 2. `assistant_markdown`: 由 Assistant 流式增量提交的稳定 Markdown Block；
 * 3. `step`: 已成功执行并持久化的步骤摘要。
 *
 * @example
 * ```ts
 * const item: UiTimelineItem = {
 *     kind: "assistant_markdown",
 *     id: "msg-1-blk-0",
 *     block: "Hello world\n\n",
 *     showAuthor: true,
 * };
 * ```
 */
export type UiTimelineItem =
    | { readonly kind: "message"; readonly id: string; readonly message: GoalMessage }
    | { readonly kind: "assistant_markdown"; readonly id: string; readonly block: string; readonly showAuthor: boolean }
    | { readonly kind: "step"; readonly id: string; readonly step: UiStepSummary };

/**
 * 正在流式接收的 Assistant 动态尾部。
 *
 * @remarks
 * 包含当前活动流关联的消息 ID、尚未提交的 Markdown 内容与作者标识显示状态。
 *
 * @example
 * ```ts
 * const tail: UiStreamingTail = {
 *     messageId: "msg-1",
 *     content: "Thinking actively...",
 *     showAuthor: false,
 * };
 * ```
 */
export interface UiStreamingTail {
    /** 关联的 Assistant 消息唯一标识。 */
    readonly messageId: string;
    /** 尚未提交到不可变历史的全部活动尾部文本（pending + mutable）。 */
    readonly content: string;
    /** 是否需要在尾部前置显示 Assistant 作者标识（若该消息尚无 block 进入历史则为 true）。 */
    readonly showAuthor: boolean;
}

/**
 * 已提交执行步骤在 UI 瀑布流时间线中的轻量摘要投影。
 *
 * @remarks
 * 仅包含 TUI 渲染瀑布流时间线所需的最小字段，不持有底层 AST 或完整 payload。
 * 由 SessionController 随每次持久化提交事件按单调递增 stepCount 构造并追加。
 *
 * @example
 * ```ts
 * const step: UiStepSummary = {
 *   stepNumber: 1,
 *   toolId: "read_file",
 *   actionId: "act-1",
 *   status: "success",
 *   inputSummary: "src/types.ts",
 *   outputSummary: "Read 215 lines",
 * };
 * ```
 */
export interface UiStepSummary {
    /** 步骤序号，从 1 开始单调递增。 */
    readonly stepNumber: number;
    /** 调用的工具标识。 */
    readonly toolId: string;
    /** 该步骤关联的 Action 唯一标识。 */
    readonly actionId: string;
    /** 步骤执行结果状态。 */
    readonly status: "success" | "failure";
    /** 输入参数的单行紧凑摘要（如果有）。 */
    readonly inputSummary?: string;
    /** 观察结果的单行紧凑摘要（如果有）。 */
    readonly outputSummary?: string;
}

/** 触发打开模型选择界面的原始页面语义位置。 */
export type UiModelSelectOrigin =
    | "intent"
    | "ask_user"
    | "task_approval"
    | "blocked";

/** 模型选择界面的三态异步状态。 */
export type UiModelSelectState =
    | { readonly status: "loading"; readonly generation: number }
    | {
        readonly status: "list";
        readonly generation: number;
        readonly models: readonly LlmModelDescriptor[];
        readonly warning?: string | undefined;
    }
    | {
        readonly status: "error";
        readonly generation: number;
        readonly error: UiError;
    };

/** 模型选择界面的不可变投影。 */
export interface UiModelSelectViewModel {
    readonly screen: "model_select";
    readonly busy: boolean;
    readonly origin: UiModelSelectOrigin;
    readonly goal?: Goal | undefined;
    readonly currentModelId: string;
    readonly state: UiModelSelectState;
    readonly error?: UiError | undefined;
    readonly notice?: UiNotice | undefined;
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
    | UiToolPermissionsViewModel
    | UiSettingsViewModel
    | UiInspectorViewModel
    | UiModelSelectViewModel
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
    /**
     * 在已完成 Run 上保存新输入并创建下一个 Run；等待中的 Run 不使用此入口。
     *
     * @param ref - 当前已完成 Run 的 Goal/Run 关联键。
     * @param newInput - 要追加到 Goal messages 的非空用户输入。
     * @param control - 可选的共享中止控制。
     * @returns 新 Run 的等待点、终态或稳定错误。
     * @example
     * ```ts
     * await coordinator.continue?.({ goalId: "goal-1", runId: "run-1" }, "继续");
     * ```
     */
    readonly continue?: (
        ref: RunRef,
        newInput: string,
        control?: ExecutionControl,
    ) => Promise<GoalProgressResult>;
    /**
     * 为未启动的当前 Run 或已完成 Run 的下一 Run 选择 Plan Mode。
     *
     * @param ref - 当前 Goal 与 Run 的关联键。
     * @param control - 可选调用级中止控制。
     * @returns 模式选择后的最新等待点、终态或稳定错误；`run_started` 已提交的普通
     *   Run 不会被改写。
     * @example
     * ```ts
     * await coordinator.enterPlanMode({ goalId: "goal-1", runId: "run-1" });
     * ```
     */
    readonly enterPlanMode?: (ref: RunRef, control?: ExecutionControl) => Promise<GoalProgressResult>;
    /**
     * 列出当前 Goal 与工作区授权；实现应验证当前 Run 身份。
     *
     * @param ref - 当前 Goal 与 Run 的关联键。
     * @returns 当前授权；不得返回其它工作区的授权。
     */
    readonly listToolGrants?: (ref: RunRef) => Promise<readonly ToolGrant[]>;
    /**
     * 撤销当前工作区中指定范围的授权。
     *
     * @param request - 当前 Run、授权 ID 和授权范围。
     * @returns 已撤销记录；后续匹配操作重新等待审批。
     */
    readonly revokeToolGrant?: (request: {
        readonly ref: RunRef;
        readonly grantId: string;
        readonly scope: ToolGrant["scope"];
    }) => Promise<ToolGrant>;
    /**
     * 查询指定或当前工作区的权限执行模式。
     *
     * @param workspaceId - 可选的工作区标识。
     * @returns 权限模式事实。
     * @throws 底层存储故障时抛出异常。
     */
    readonly getPermissionMode?: (workspaceId?: string) => Promise<ProjectPermissionMode>;
    /**
     * 切换指定或当前工作区的权限执行模式。
     *
     * @param mode - 目标权限模式。
     * @param expectedRevision - 期望修订号。
     * @param workspaceId - 可选的工作区标识。
     * @returns 更新后的权限模式事实。
     * @throws 版本冲突或底层存储故障时抛出异常。
     */
    readonly setPermissionMode?: (
        mode: PermissionMode,
        expectedRevision: number,
        workspaceId?: string,
    ) => Promise<ProjectPermissionMode>;
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
    /** 可选的模型目录服务，用于支持 /model 命令查询。 */
    readonly modelCatalog?: LlmModelCatalog | undefined;
    /** 可选的模型配置，用于目录查询与上下文校验。 */
    readonly llmConfig?: LlmConfig | undefined;
    /** 可选的模型切换处理句柄，供 selectModel 命令执行原子切换。 */
    readonly modelSwitcher?: {
        switchModel(options: {
            readonly goal?: Goal | undefined;
            readonly targetModel: LlmModelDescriptor;
        }): Promise<{ readonly ok: true; readonly goal?: Goal } | { readonly ok: false; readonly error: UiError }>;
    } | undefined;
    /** 当前默认模型 ID。 */
    readonly defaultModelId?: string | undefined;
    /** 可选的初始模型选择，用于新建 Goal。 */
    readonly defaultModelSelection?: GoalModelSelection | undefined;
    /** 可选的模型恢复校验器，供恢复 Goal 时校验与重建 Binding。 */
    readonly modelRestorer?: {
        restoreModel(options: { readonly goal: Goal }): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: UiError }>;
    } | undefined;
    /**
     * 可选注入的 Transcript 调度器。
     *
     * @remarks
     * 允许单元测试注入 FakeScheduler，实现对 40ms Commit 节奏的无等待精确步进控制。
     *
     * @example
     * ```ts
     * const deps: SessionControllerDependencies = { ...baseDeps, transcriptScheduler: fakeScheduler };
     * ```
     */
    readonly transcriptScheduler?: import("./streaming-transcript-controller.js").TranscriptScheduler | undefined;
    /** 可选的 Goal/Run 通用执行流；TUI 只消费事件，不拥有 Runtime 语义。 */
    readonly executionStream?: ExecutionStreamPublisher;
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
