/**
 * Web 会话与看板投影的数据传输对象 (DTO)。
 *
 * @remarks
 * 仅包含经安全白名单过滤后的只读投影事实，不直接暴露 Runtime Snapshot、
 * 凭据、私有 Prompt 或内部执行对象。
 */

/**
 * Run 生命周期状态。
 *
 * @remarks
 * 表达当前或历史 Run 的执行阶段。
 *
 * @example
 * ```ts
 * const status: BrowserRunStatus = "running";
 * ```
 */
export type BrowserRunStatus =
    | "created"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled";

/**
 * Run 执行与恢复状态。
 *
 * @remarks
 * 由 Snapshot 与服务进程的活动预约共同投影，不保存到持久化 Snapshot。
 * - `active`: 当前服务正持有该 Goal 的活动执行预约；
 * - `recoverable`: 该 Run 处于 created/running 且当前服务未持有其执行预约，可显式恢复；
 * - `inactive`: 处于 waiting 或终态，不可显式恢复。
 *
 * @example
 * ```ts
 * const state: BrowserExecutionState = "recoverable";
 * ```
 */
export type BrowserExecutionState = "active" | "recoverable" | "inactive";

/**
 * Run 提交边界与执行活动投影。
 *
 * @example
 * ```ts
 * const execution: BrowserGoalExecution = {
 *     state: "recoverable",
 *     committedThroughSequence: 12,
 * };
 * ```
 */
export interface BrowserGoalExecution {
    /** 进程活动状态投影。 */
    readonly state: BrowserExecutionState;
    /** 当前 Run 的已提交序列号边界。 */
    readonly committedThroughSequence: number;
}

/**
 * 工作区 Goal 列表项的安全传输对象。
 *
 * @remarks
 * 仅包含工作区快照目录验证后的身份、截断意图、生命周期状态与更新时间。
 * 不返回模型选择、系统提示词或内部执行图。
 *
 * @example
 * ```ts
 * const item: BrowserGoalListItem = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     intent: "测试目标",
 *     workflowPhase: "executing",
 *     runStatus: "waiting",
 *     updatedAt: "2026-10-18T00:00:00.000Z",
 *     archived: false,
 * };
 * ```
 */
export interface BrowserGoalListItem {
    /** Goal 的唯一稳定标识。 */
    readonly goalId: string;
    /** 当前快照的 Run 标识。 */
    readonly runId: string;
    /** 限长后的用户原始意图。 */
    readonly intent: string;
    /** 工作流阶段（如 "executing"）。 */
    readonly workflowPhase: string;
    /** 当前 Run 的真实生命周期状态。 */
    readonly runStatus: BrowserRunStatus;
    /** 当前 Run 的进程活动与提交边界投影。 */
    readonly execution?: BrowserGoalExecution;
    /** 快照最后更新时间（ISO 8601 字符串）。 */
    readonly updatedAt: string;
    /** 是否已被用户归档。 */
    readonly archived: boolean;
}

/**
 * 会话时间线中的用户或助手文本消息。
 *
 * @remarks
 * 仅包含角色、有界文本及所属 Run 标识；超出长度限制的正文会在服务端截断。
 *
 * @example
 * ```ts
 * const msg: BrowserSessionMessage = {
 *     role: "user",
 *     content: "请检查代码质量",
 *     runId: "run-1",
 * };
 * ```
 */
export interface BrowserSessionMessage {
    /** 消息角色。 */
    readonly role: "user" | "assistant";
    /** 消息正文。 */
    readonly content: string;
    /** 消息所属的 Run 标识；历史无归属时省略。 */
    readonly runId?: string;
}

/**
 * Bash 命令执行的有界观察结果详情。
 *
 * @remarks
 * 仅在已提交的 Bash 步骤中展示，包含受限命令与标准输入输出；其他工具不暴露此结构。
 *
 * @example
 * ```ts
 * const detail: BrowserBashExecutionDetail = {
 *     command: "npm test",
 *     exitCode: 0,
 *     stdout: "PASS",
 * };
 * ```
 */
export interface BrowserBashExecutionDetail {
    /** 执行的命令文本。 */
    readonly command: string;
    /** 进程退出码。 */
    readonly exitCode?: number;
    /** 限长后的标准输出。 */
    readonly stdout?: string;
    /** 限长后的标准错误。 */
    readonly stderr?: string;
    /** 失败原因描述。 */
    readonly failure?: string;
}

/**
 * 会话单步执行的安全投影。
 *
 * @remarks
 * 汇总 Action 与 Observation 的已提交事实，不包含私有中间状态或原始 Prompt。
 *
 * @example
 * ```ts
 * const step: BrowserSessionStep = {
 *     runId: "run-1",
 *     executionUnitId: "unit-1",
 *     sequence: 1,
 *     stepIndex: 1,
 *     status: "completed",
 *     summary: "读取配置文件成功",
 * };
 * ```
 */
export interface BrowserSessionStep {
    /** 所属 Run 标识。 */
    readonly runId: string;
    /** 执行单元标识。 */
    readonly executionUnitId: string;
    /** 轨迹序列号。 */
    readonly sequence: number;
    /** Step 序号。 */
    readonly stepIndex: number;
    /** 决策种类（如 "tool_call"）。 */
    readonly decisionKind?: string;
    /** 工具标识。 */
    readonly toolId?: string;
    /** 输入摘要（如受限文件路径或搜索关键词）。 */
    readonly inputSummary?: string;
    /** 审批状态。 */
    readonly actionStatus?: "awaiting_approval" | "approved" | "rejected";
    /** 步骤终态分类。 */
    readonly status: "recorded" | "completed" | "failed" | "rejected";
    /** 工具观察结果摘要。 */
    readonly summary?: string;
    /** Bash 专有执行详情。 */
    readonly bashExecution?: BrowserBashExecutionDetail;
    /** 因数量超限是否省略 Bash 详情。 */
    readonly bashExecutionOmitted?: true;
    /** 错误纠正或恢复尝试摘要。 */
    readonly recoveryAttempts?: readonly string[];
}

/**
 * 会话中单个 Run 的历史投影。
 *
 * @remarks
 * 聚合 Run 状态、步骤历史和终止详情。
 *
 * @example
 * ```ts
 * const run: BrowserSessionRun = {
 *     runId: "run-1",
 *     status: "completed",
 *     stepCount: 3,
 *     steps: [],
 *     current: true,
 * };
 * ```
 */
export interface BrowserSessionRun {
    /** Run 标识。 */
    readonly runId: string;
    /** Run 状态。 */
    readonly status: BrowserRunStatus;
    /** 步数统计。 */
    readonly stepCount: number;
    /** 步骤列表。 */
    readonly steps: readonly BrowserSessionStep[];
    /** 是否为当前最新 Run。 */
    readonly current: boolean;
    /** 终态原因详情。 */
    readonly terminalDetail?: {
        readonly code?: string;
        readonly message: string;
    };
}

/**
 * 结构化问卷选项。
 *
 * @example
 * ```ts
 * const option: BrowserAskUserOption = {
 *     id: "opt-1",
 *     label: "选项 A",
 *     description: "详细说明",
 * };
 * ```
 */
export interface BrowserAskUserOption {
    /** 选项局部标识。 */
    readonly id: string;
    /** 选项标题。 */
    readonly label: string;
    /** 选项补充说明。 */
    readonly description?: string;
}

/**
 * 结构化问卷问题。
 *
 * @example
 * ```ts
 * const question: BrowserAskUserQuestion = {
 *     id: "q-1",
 *     header: "确认方案",
 *     question: "是否继续？",
 *     multiSelect: false,
 *     options: [{ id: "opt-1", label: "是" }],
 * };
 * ```
 */
export interface BrowserAskUserQuestion {
    /** 问题局部标识。 */
    readonly id: string;
    /** 简短分类标题。 */
    readonly header: string;
    /** 提问内容。 */
    readonly question: string;
    /** 是否支持多选。 */
    readonly multiSelect: boolean;
    /** 候选选项列表。 */
    readonly options: readonly BrowserAskUserOption[];
}

/**
 * 结构化问卷单个问题的用户回答。
 *
 * @example
 * ```ts
 * const answer: BrowserAskUserAnswer = {
 *     questionId: "q-1",
 *     optionIds: ["opt-1"],
 * };
 * ```
 */
export interface BrowserAskUserAnswer {
    /** 被回答的问题标识。 */
    readonly questionId: string;
    /** 选中的选项标识列表。 */
    readonly optionIds: readonly string[];
    /** 自由文本补充。 */
    readonly otherText?: string;
}

/**
 * 当前等待人工交互的请求视图。
 *
 * @remarks
 * 支持 AskUser 问卷及 TaskApproval 任务提案两种交互类型。
 *
 * @example
 * ```ts
 * const interaction: BrowserPendingInteraction = {
 *     kind: "task_approval",
 *     requestId: "req-1",
 *     objective: "完成重构",
 *     approvalRequest: "是否批准执行？",
 *     completionCriteria: ["测试全部通过"],
 * };
 * ```
 */
export type BrowserPendingInteraction =
    | {
        readonly kind: "ask_user";
        readonly requestId: string;
        readonly mode: "plan" | "execution";
        readonly questions: readonly BrowserAskUserQuestion[];
    }
    | {
        readonly kind: "task_approval";
        readonly requestId: string;
        readonly objective: string;
        readonly approvalRequest: string;
        readonly completionCriteria: readonly string[];
    };

/**
 * 目标拆解计划中的条目。
 *
 * @example
 * ```ts
 * const item: BrowserGoalPlanItem = {
 *     id: "todo-1",
 *     content: "编写类型契约",
 *     position: 0,
 *     status: "in_progress",
 * };
 * ```
 */
export interface BrowserGoalPlanItem {
    /** 条目唯一标识。 */
    readonly id: string;
    /** 任务内容。 */
    readonly content: string;
    /** 排序位置。 */
    readonly position: number;
    /** 任务状态。 */
    readonly status: "pending" | "in_progress" | "completed" | "cancelled";
}

/**
 * Goal 的多步任务执行计划视图。
 *
 * @example
 * ```ts
 * const plan: BrowserGoalPlan = {
 *     revision: 1,
 *     items: [],
 * };
 * ```
 */
export interface BrowserGoalPlan {
    /** 计划版本修订号。 */
    readonly revision: number;
    /** 计划条目列表。 */
    readonly items: readonly BrowserGoalPlanItem[];
}

/**
 * 工具授权或沙箱访问中的单个外部文件/目录条目。
 *
 * @example
 * ```ts
 * const extra: BrowserToolGrantExtraFile = {
 *     canonicalPath: "/tmp/data",
 *     access: "read",
 *     kind: "file",
 * };
 * ```
 */
export interface BrowserToolGrantExtraFile {
    /** 规范化绝对路径。 */
    readonly canonicalPath: string;
    /** 访问权限方向。 */
    readonly access: "read" | "write";
    /** 文件类型。 */
    readonly kind: "file" | "directory_tree";
}

/**
 * 沙箱权限审阅摘要。
 *
 * @example
 * ```ts
 * const review: BrowserSandboxReview = {
 *     extraFiles: [],
 *     network: "none",
 * };
 * ```
 */
export interface BrowserSandboxReview {
    /** 越界文件或目录列表。 */
    readonly extraFiles: readonly BrowserToolGrantExtraFile[];
    /** 网络访问范围。 */
    readonly network: "none" | "all_outbound";
    /** 网络访问附加说明。 */
    readonly networkNotice?: string;
}

/**
 * 待用户审批的工具或沙箱 Action 视图。
 *
 * @example
 * ```ts
 * const action: BrowserPendingAction = {
 *     actionId: "act-1",
 *     toolId: "bash",
 *     status: "awaiting_approval",
 *     inputPreview: "npm test",
 *     inputPreviewTruncated: false,
 * };
 * ```
 */
export interface BrowserPendingAction {
    /** Action 唯一标识。 */
    readonly actionId: string;
    /** 工具标识。 */
    readonly toolId: string;
    /** 审批状态。 */
    readonly status: "approved" | "awaiting_approval" | "outcome_unknown";
    /** 输入摘要。 */
    readonly inputSummary?: string;
    /** 输入文本预览。 */
    readonly inputPreview: string;
    /** 预览是否被截断。 */
    readonly inputPreviewTruncated: boolean;
    /** 目标路径。 */
    readonly targetPath?: string;
    /** 审批类型。 */
    readonly approvalKind?: "tool" | "sandbox";
    /** 沙箱审阅信息。 */
    readonly sandboxReview?: BrowserSandboxReview;
    /** 父程序调用标识。 */
    readonly parentProgram?: {
        readonly actionId: string;
        readonly callNumber: number;
    };
}

/**
 * 完整 Goal 会话详情的传输对象。
 *
 * @remarks
 * 汇集意图、消息、Run 历史、计划、交互等待点与审批状态；不包含未保存或私有凭据。
 *
 * @example
 * ```ts
 * const session: BrowserGoalSession = {
 *     goalId: "goal-1",
 *     intent: "重构工程",
 *     currentRunId: "run-1",
 *     runStatus: "running",
 *     currentRunMode: "normal",
 *     messages: [],
 *     runs: [],
 *     historyTruncated: false,
 * };
 * ```
 */
export interface BrowserGoalSession {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** 原始意图。 */
    readonly intent: string;
    /** 当前最新 Run 标识。 */
    readonly currentRunId: string;
    /** 当前 Run 生命周期状态。 */
    readonly runStatus: BrowserRunStatus;
    /** 当前 Run 的运行模式。 */
    readonly currentRunMode: "normal" | "plan";
    /** 下一 Run 预设的模式。 */
    readonly nextRunMode?: "plan";
    /** 当前 Run 的进程活动与提交边界投影。 */
    readonly execution?: BrowserGoalExecution;
    /** 会话历史消息。 */
    readonly messages: readonly BrowserSessionMessage[];
    /** 已受理且尚未进入模型输入的 Steer 消息，按受理顺序排列。 */
    readonly pendingSteers?: readonly { readonly messageId: string; readonly content: string }[];
    /** 历史与当前 Run 列表。 */
    readonly runs: readonly BrowserSessionRun[];
    /** 任务计划。 */
    readonly goalPlan?: BrowserGoalPlan;
    /** 等待人工交互。 */
    readonly pendingInteraction?: BrowserPendingInteraction;
    /** 等待人工审批的 Action。 */
    readonly pendingAction?: BrowserPendingAction;
    /** 历史是否因达到上限被截断。 */
    readonly historyTruncated: boolean;
}
