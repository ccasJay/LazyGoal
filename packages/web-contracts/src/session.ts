import type { BrowserJsonValue } from "./session-input";

/**
 * Web 会话与看板投影的数据传输对象 (DTO)。
 *
 * @remarks
 * 仅包含经安全白名单过滤后的只读投影事实，不直接暴露 Runtime Snapshot、
 * 凭据、私有 Prompt 或内部执行对象。
 */

/**
 * 只读审批预检的 wire 请求。
 *
 * @remarks
 * 预检只返回可审阅内容，不保存批准、不暂存或激活授权、不解除等待，也不调用
 * 业务工具。省略 `input` 表示按原样审阅当前请求。
 *
 * @example
 * ```ts
 * const command: BrowserActionReviewCommand = {
 *     runId: "run-1", actionId: "action-1", scope: "action",
 *     input: { path: "b.txt" },
 * };
 * ```
 */
export interface BrowserActionReviewCommand {
    /** 当前 Run 身份。 */
    readonly runId: string;
    /** 当前待审批 Action 身份。 */
    readonly actionId: string;
    /** 拟审阅的最终参数；省略表示原样审阅。 */
    readonly input?: BrowserJsonValue;
    /** 拟申请的授权期限；省略表示单次放行。 */
    readonly scope?: "action" | "goal" | "workspace";
}

/**
 * 只读审批预检返回的可审阅内容。
 *
 * @remarks
 * `reviewRef` 是内容一致性引用而非认证令牌；确认时必须原样带回并重新计算比对。
 *
 * @example
 * ```ts
 * const review: BrowserActionReview = {
 *     actionId: "action-1", toolId: "write_file",
 *     originalInput: { path: "a.txt" }, finalInput: { path: "b.txt" },
 *     changed: true, scope: "action", availableScopes: ["action"],
 *     capability: { network: "none", extraFiles: [], targetPaths: [] },
 *     requiresSandboxApproval: false, reviewRef: "review:0123456789abcdef",
 * };
 * ```
 */
export interface BrowserActionReview {
    /** 当前待审批 Action 身份。 */
    readonly actionId: string;
    /** 被审阅的 Tool 身份。 */
    readonly toolId: string;
    /** 原请求参数。 */
    readonly originalInput: BrowserJsonValue;
    /** 重新准备后的最终 canonical 参数。 */
    readonly finalInput: BrowserJsonValue;
    /** 最终参数是否与原请求不同。 */
    readonly changed: boolean;
    /** 本次审阅对应的授权期限。 */
    readonly scope: "action" | "goal" | "workspace";
    /** 当前真正可用的授权期限。 */
    readonly availableScopes: readonly ("action" | "goal" | "workspace")[];
    /** 重新计算出的实际能力范围。 */
    readonly capability: {
        readonly network: "none" | "all_outbound";
        readonly extraFiles: readonly BrowserToolGrantExtraFile[];
        readonly targetPaths: readonly string[];
    };
    /** 最终范围是否超出默认沙箱，需要沙箱能力审批。 */
    readonly requiresSandboxApproval: boolean;
    /** 审阅指纹；确认时必须原样带回。 */
    readonly reviewRef: string;
}

/**
 * 只读审批预检的 wire 结果。
 *
 * @remarks 失败时保留当前等待与调用方本地草稿，不裁剪参数、不降级权限，也不执行
 * 原操作作为补偿。
 *
 * @example
 * ```ts
 * const result: BrowserActionReviewResult = { ok: false, error: "action_not_waiting" };
 * ```
 */
export type BrowserActionReviewResult =
    | {
        readonly ok: true;
        readonly goalId: string;
        readonly runId: string;
        readonly review: BrowserActionReview;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "action_not_waiting"
            | "action_id_mismatch"
            | "tool_not_found"
            | "invalid_tool_input"
            | "scope_unavailable"
            | "sandbox_scope_unavailable"
            | "review_unavailable";
        /** 可定位的字段级问题。 */
        readonly issues?: readonly { readonly path: readonly (string | number)[]; readonly message: string }[];
    };

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
 * 浏览器可读的 Run 内消息位置。
 *
 * @remarks
 * `afterSequence` 对应消息前最后一条已提交 Run 事实，`order` 保持同锚点消息的
 * Snapshot 次序；该值不表示墙钟时间或执行 Step。
 *
 * @example
 * ```ts
 * const position: BrowserMessagePosition = { afterSequence: 12, order: 0 };
 * ```
 */
export interface BrowserMessagePosition {
    /** 消息之前的最后一条已提交事实序列。 */
    readonly afterSequence: number;
    /** 同一 Run、同一事实锚点内的零基 Snapshot 次序。 */
    readonly order: number;
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
 * 包含稳定身份、来源、Run 内位置及有界正文；超出长度限制的正文会在服务端截断。
 *
 * @example
 * ```ts
 * const msg: BrowserSessionMessage = {
 *     messageId: "msg-1",
 *     role: "user",
 *     content: "请检查代码质量",
 *     runId: "run-1",
 *     position: { afterSequence: 0, order: 0 },
 * };
 * ```
 */
export interface BrowserSessionMessage {
    /** 消息稳定身份。 */
    readonly messageId: string;
    /** 消息角色。 */
    readonly role: "user" | "assistant";
    /** 消息正文。 */
    readonly content: string;
    /** 消息所属的 Run 标识；每条正式消息必须关联到真实 Run。 */
    readonly runId: string;
    /** 消息在所属 Run 已提交事实流中的稳定位置。 */
    readonly position: BrowserMessagePosition;
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
 * 汇总 Action、Observation 和显式 Think 阶段的已提交事实，不包含供应商隐藏推理或原始 Prompt。
 * Think 是同一 Runtime Step 内的展示成员，不增加 `stepCount`。
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
    /** 已提交事实中的稳定来源事件 ID，用于活动投影与 Trajectory 定位。 */
    readonly sourceEventId?: string;
    /** 已提交工具调用的稳定 Action 身份；多调用执行单元省略。 */
    readonly actionId?: string;
    /** 已验证的来源边界；`true` 表示此 Step 必须与前一活动组断开。 */
    readonly activityBoundaryBefore?: true;
    /** 轨迹序列号。 */
    readonly sequence: number;
    /** Step 序号。 */
    readonly stepIndex: number;
    /** 决策或阶段控制种类（如 `tool_call`、`request_think`）。 */
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
    /** 显式 Think 的目标及已提交输出；输出缺省表示尚无已提交完成事实。超长文本有界展示，完整正文从 Trajectory 详情读取。 */
    readonly think?: {
        /** 本次明确的思考目标；最多 4,000 字符。 */
        readonly goal: string;
        /** 已提交的显式分析正文；最多 64,000 字符，不包含供应商隐藏推理。 */
        readonly output?: string;
        /** 目标或正文被截断时为 true；完整事件仍可从 Trajectory 读取。 */
        readonly truncated?: true;
    };
    /** Bash 专有执行详情。 */
    readonly bashExecution?: BrowserBashExecutionDetail;
    /** 因数量超限是否省略 Bash 详情。 */
    readonly bashExecutionOmitted?: true;
    /** 错误纠正或恢复尝试摘要。 */
    readonly recoveryAttempts?: readonly string[];
    /** 所属稳定阶段身份；若为 Run 级控制活动则省略。 */
    readonly stageId?: string;
}

/**
 * 阶段生命周期状态。
 *
 * @remarks
 * - `in_progress`: 阶段执行中；
 * - `review_pending`: 阶段提出候选等待审查；
 * - `accepted`: 阶段候选已获审查接受。
 */
export type BrowserRunStageStatus = "in_progress" | "review_pending" | "accepted";

/**
 * 阶段修订历史记录。
 */
export interface BrowserRunStageRevision {
    /** 修订版本号。 */
    readonly revision: number;
    /** 该修订的目标说明。 */
    readonly target: string;
    /** 该修订提出的理由。 */
    readonly reason?: string;
}

/**
 * Run 中按稳定身份聚合的阶段执行与审查记录看板投影。
 *
 * @remarks
 * 聚合同一阶段的多轮修订、阶段状态、验收条件、审查拒绝反馈、已接受结果摘要，以及归属该阶段的真实 Steps。
 *
 * @example
 * ```ts
 * const stage: BrowserRunStageGroup = {
 *     stageId: "stage-1",
 *     revision: 1,
 *     target: "完成基础配置",
 *     acceptanceCriteria: ["测试通过"],
 *     status: "accepted",
 *     resultSummary: "配置验证成功",
 *     steps: [],
 * };
 * ```
 */
export interface BrowserRunStageGroup {
    /** 稳定阶段身份。 */
    readonly stageId: string;
    /** 当前最新修订号。 */
    readonly revision: number;
    /** 当前阶段目标。 */
    readonly target: string;
    /** 阶段验收条件。 */
    readonly acceptanceCriteria: readonly string[];
    /** 阶段生命周期状态。 */
    readonly status: BrowserRunStageStatus;
    /** 已提交阶段结果摘要（若已接受）。 */
    readonly resultSummary?: string;
    /** 最新审查拒绝缺口（若在当前或此前修订中被拒绝）。 */
    readonly latestReviewRejection?: {
        readonly code: string;
        readonly issues: readonly string[];
    };
    /** 前序阶段结果引用。 */
    readonly previousStageResultRef?: {
        readonly stageId: string;
        readonly revision: number;
    };
    /** 修订记录。 */
    readonly revisions?: readonly BrowserRunStageRevision[];
    /** 归属该阶段的真实 Step 列表。 */
    readonly steps: readonly BrowserSessionStep[];
}

/**
 * Plan Run 会话中的一条已批准路线。
 *
 * @remarks
 * 表示 Runtime Snapshot 中的权威路线和当前游标，不包含普通 Run 的 RunStage，也不把模型候选伪装成已批准路线。
 *
 * @example
 * ```ts
 * const route: BrowserPlanRoute = {
 *     revision: 1, nextStageIndex: 0,
 *     stages: [{ stageId: "stage-1", revision: 1, status: "pending", target: "调查", acceptanceCriteria: ["定位入口"] }],
 * };
 * ```
 */
export interface BrowserPlanRoute {
    /** 当前完整路线修订号。 */
    readonly revision: number;
    /** 最近一次路线修订理由；初始路线省略。 */
    readonly revisionReason?: string;
    /** 唯一可激活阶段的零基位置；等于阶段数表示路线全部接受。 */
    readonly nextStageIndex: number;
    /** Runtime 分配的完整有序阶段状态。 */
    readonly stages: readonly BrowserPlanRouteStageState[];
}

/**
 * 已批准 Plan Run 中带 Runtime 身份的阶段状态。
 *
 * @example
 * ```ts
 * const stage: BrowserPlanRouteStageState = {
 *     stageId: "stage-1", revision: 1, status: "pending", target: "调查", acceptanceCriteria: ["定位入口"],
 * };
 * ```
 */
export interface BrowserPlanRouteStageState {
    /** Runtime 分配且在路线修订间稳定的阶段身份。 */
    readonly stageId: string;
    /** 当前阶段定义修订号。 */
    readonly revision: number;
    /** 路线阶段状态。 */
    readonly status: "pending" | "executing" | "accepted";
    /** 阶段目标。 */
    readonly target: string;
    /** 阶段验收条件。 */
    readonly acceptanceCriteria: readonly string[];
    /** 阶段接受事实的 Trajectory 序号。 */
    readonly acceptedSequence?: number;
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
    /** 该 Run 划分的阶段分组列表；若未包含阶段操作则为空或省略。 */
    readonly stages?: readonly BrowserRunStageGroup[];
    /** 当前 Run 为已获批 Plan Run 时的完整 Runtime 权威路线；普通 Run 省略。 */
    readonly planRoute?: BrowserPlanRoute;
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
 * Plan Run 任务提案中的一个有序阶段。
 *
 * @example
 * ```ts
 * const stage: BrowserPlanRouteStage = {
 *     target: "调查入口", acceptanceCriteria: ["定位现有实现"],
 * };
 * ```
 */
export interface BrowserPlanRouteStage {
    /** 阶段目标。 */
    readonly target: string;
    /** 阶段验收条件。 */
    readonly acceptanceCriteria: readonly string[];
}

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
 * 当前交互视图的种类。
 *
 * @remarks
 * `question` 是模型发起的结构化问卷；`task_approval` 是 Plan 任务提案审批；
 * `action_approval` 是工具／沙箱审批；`action_recovery` 是结果未知的恢复等待。
 *
 * @example
 * ```ts
 * const kind: BrowserInteractionKind = "action_recovery";
 * ```
 */
export type BrowserInteractionKind =
    | "question"
    | "task_approval"
    | "action_approval"
    | "action_recovery";

/**
 * 当前交互允许的决定。
 *
 * @remarks
 * 只描述响应种类；Interrupt 是独立的 Run 级输入，不在该列表中。恢复等待只
 * 允许 `retry_unknown_action` 与 `decline_unknown_action_retry`。
 *
 * @example
 * ```ts
 * const decisions: readonly BrowserInteractionDecision[] = ["approve_task", "send_task_feedback"];
 * ```
 */
export type BrowserInteractionDecision =
    | "answer_questions"
    | "reply_to_question"
    | "skip_question"
    | "approve_task"
    | "send_task_feedback"
    | "approve_action"
    | "approve_action_revision"
    | "reject_action"
    | "retry_unknown_action"
    | "decline_unknown_action_retry";

/**
 * 当前已提交等待的类型化交互视图摘要。
 *
 * @remarks
 * 身份来自与已提交等待相同的快照：重复同步、
 * 重连与其他客户端读取得到同一 `interactionId`。`truncated` 为真表示有界摘要
 * 省略了决定所需内容，必须先完成详情读取再提交依赖完整范围的批准。
 *
 * @example
 * ```ts
 * const view: BrowserInteractionView = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     kind: "question",
 *     interactionId: "question:ask-1",
 *     requestId: "ask-1",
 *     decisions: ["answer_questions", "reply_to_question", "skip_question"],
 *     truncated: false,
 * };
 * ```
 */
export interface BrowserInteractionView {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** 等待所属的 Run 身份。 */
    readonly runId: string;
    /** 交互种类。 */
    readonly kind: BrowserInteractionKind;
    /** 由种类与等待身份构成的稳定引用。 */
    readonly interactionId: string;
    /** 问答与任务审批的请求身份。 */
    readonly requestId?: string;
    /** 工具／沙箱审批与恢复等待的 Action 身份。 */
    readonly actionId?: string;
    /**
     * 本次未知结果等待的恢复身份。
     *
     * @remarks 仅恢复等待提供；重执行决定必须原样带回该引用。
     */
    readonly recoveryRef?: string;
    /** 当前等待允许的决定。 */
    readonly decisions: readonly BrowserInteractionDecision[];
    /** 有界摘要是否省略了决定所需内容。 */
    readonly truncated: boolean;
}

/**
 * 当前交互的完整审阅内容。
 *
 * @remarks
 * 只包含身份匹配的当前等待：问题的完整正文与选项、任务提案的完整目标／验收／
 * 有序路线，或待审 Action 的完整 canonical 输入。读取不推进等待。
 *
 * @example
 * ```ts
 * const detail: BrowserInteractionDetail = {
 *     kind: "task_approval", objective: "实现导入", approvalRequest: "请确认",
 *     completionCriteria: ["导入成功"], stages: [],
 * };
 * ```
 */
export type BrowserInteractionDetail =
    | {
        readonly kind: "question";
        readonly mode: "plan" | "execution";
        readonly questions: readonly BrowserAskUserQuestion[];
        readonly routeRevision?: {
            readonly baseRevision: number;
            readonly reason: string;
            readonly approvalRequest: string;
            readonly approvalOptionId: string;
            readonly stages: readonly BrowserPlanRouteStage[];
        };
    }
    | {
        readonly kind: "task_approval";
        readonly objective: string;
        readonly approvalRequest: string;
        readonly completionCriteria: readonly string[];
        readonly stages: readonly BrowserPlanRouteStage[];
    }
    | {
        readonly kind: "action_approval" | "action_recovery";
        readonly actionId: string;
        readonly toolId: string;
        readonly approvalKind?: "tool" | "sandbox";
        /** 完整 canonical Tool 输入。 */
        readonly input: unknown;
        /** 本次未知结果等待的恢复身份；仅恢复等待提供。 */
        readonly recoveryRef?: string;
        readonly parentProgram?: {
            readonly actionId: string;
            readonly callNumber: number;
        };
    };

/**
 * 当前交互完整详情读取的结果。
 *
 * @remarks
 * 引用必须同时匹配当前 Run 与当前等待身份；过期引用返回稳定错误，不返回其他
 * Action 的参数，也不触发执行。读取失败保留等待，依赖完整范围的批准保持禁用。
 *
 * @example
 * ```ts
 * const result: BrowserInteractionDetailResult = { ok: false, error: "interaction_mismatch" };
 * ```
 */
export type BrowserInteractionDetailResult =
    | {
        readonly ok: true;
        readonly goalId: string;
        readonly runId: string;
        readonly interactionId: string;
        readonly detail: BrowserInteractionDetail;
    }
    | {
        readonly ok: false;
        readonly error:
            | "goal_not_found"
            | "stale_run"
            | "interaction_not_waiting"
            | "interaction_mismatch"
            | "interaction_details_unavailable";
    };

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
    /** 已受理、尚未应用的普通消息；Runtime 队列是唯一真源。 */
    readonly pendingMessages?: readonly { readonly inputId: string; readonly content: string }[];
    /** 队列修订与暂停事实；省略表示修订 0 且未暂停。 */
    readonly queue?: {
        readonly revision: number;
        readonly paused: boolean;
        readonly pauseReason?: "run_failed" | "user_interrupt";
    };
    /** 已受理的用户终止及自动收尾进度。 */
    readonly interruption?: {
        readonly requestId: string;
        readonly status: "requested" | "repairing" | "finished";
        readonly repairCallsStarted: number;
        readonly outcomeUnknown?: boolean;
    };
    /** 历史与当前 Run 列表。 */
    readonly runs: readonly BrowserSessionRun[];
    /** 任务计划。 */
    readonly goalPlan?: BrowserGoalPlan;
    /** 当前已提交等待的类型化交互视图；没有可决定等待时省略。 */
    readonly interaction?: BrowserInteractionView;
    /** 等待人工审批的 Action。 */
    readonly pendingAction?: BrowserPendingAction;
    /** 历史是否因达到上限被截断。 */
    readonly historyTruncated: boolean;
}

/**
 * 初始读取和分页使用的窄 Goal 状态。
 *
 * @remarks
 * 不内嵌消息、步骤或历史阶段；`history` 明确指向 Activity 窗口。当前 Run、Plan
 * 路线、队列、等待、交互与待审批 Action 仍保留在此状态中。
 *
 * @example
 * ```ts
 * const state: BrowserGoalSessionState = {
 *     goalId: "goal-1", intent: "检查仓库", currentRunId: "run-1",
 *     runStatus: "running", currentRunMode: "normal",
 *     history: {
 *         messages: { included: false, source: "activity" },
 *         steps: { included: false, source: "activity" },
 *         stages: { included: false, source: "activity" },
 *     },
 * };
 * ```
 */
export interface BrowserGoalSessionState {
    readonly goalId: string;
    readonly intent: string;
    readonly currentRunId: string;
    readonly runStatus: BrowserRunStatus;
    readonly currentRunMode: "normal" | "plan";
    readonly nextRunMode?: "plan";
    readonly currentRunStepCount: number;
    readonly currentPlanRoute?: BrowserPlanRoute;
    readonly execution?: BrowserGoalExecution;
    readonly pendingSteers?: readonly { readonly messageId: string; readonly content: string }[];
    readonly pendingMessages?: readonly { readonly inputId: string; readonly content: string }[];
    readonly queue?: {
        readonly revision: number;
        readonly paused: boolean;
        readonly pauseReason?: "run_failed" | "user_interrupt";
    };
    readonly interruption?: {
        readonly requestId: string;
        readonly status: "requested" | "repairing" | "finished";
        readonly repairCallsStarted: number;
        readonly outcomeUnknown?: boolean;
    };
    readonly goalPlan?: BrowserGoalPlan;
    readonly interaction?: BrowserInteractionView;
    readonly pendingAction?: BrowserPendingAction;
    readonly history: {
        readonly messages: { readonly included: false; readonly source: "activity" };
        readonly steps: { readonly included: false; readonly source: "activity" };
        readonly stages: { readonly included: false; readonly source: "activity" };
    };
}
