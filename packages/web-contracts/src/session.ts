import type { InferContract } from "../../contracts/src/index";
import {
    browserExecutionStateContract,
    browserInteractionDecisionContract,
    browserInteractionKindContract,
    browserInteractionViewContract,
    browserMessagePositionContract,
    browserRunStatusContract,
    browserSandboxReviewContract,
    browserToolGrantExtraFileContract,
} from "./contracts/common";
import {
    browserActionReviewCommandContract,
    browserActionReviewContract,
    browserActionReviewResultContract,
    browserInteractionDetailContract,
    browserInteractionDetailResultContract,
} from "./contracts/interaction";
import {
    browserBashExecutionDetailContract,
    browserGoalExecutionContract,
    browserGoalListItemContract,
    browserGoalListContract,
    browserGoalPlanContract,
    browserGoalPlanItemContract,
    browserGoalSessionContract,
    browserGoalSessionStateContract,
    browserAskUserAnswerContract,
    browserAskUserOptionContract,
    browserAskUserQuestionContract,
    browserPendingActionContract,
    browserPlanRouteContract,
    browserPlanRouteStageStateContract,
    browserRunStageGroupContract,
    browserRunStageRevisionContract,
    browserRunStageStatusContract,
    browserSessionMessageContract,
    browserSessionRunContract,
    browserSessionStepContract,
} from "./contracts/session";

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
export type BrowserActionReviewCommand = InferContract<typeof browserActionReviewCommandContract>;

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
export type BrowserActionReview = InferContract<typeof browserActionReviewContract>;

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
    InferContract<typeof browserActionReviewResultContract>;

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
export type BrowserRunStatus = InferContract<typeof browserRunStatusContract>;

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
export type BrowserExecutionState = InferContract<typeof browserExecutionStateContract>;

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
export type BrowserGoalExecution = InferContract<typeof browserGoalExecutionContract>;

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
export type BrowserMessagePosition = InferContract<typeof browserMessagePositionContract>;

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
export type BrowserGoalListItem = InferContract<typeof browserGoalListItemContract>;

/**
 * 工作区 Goal 列表响应信封。
 *
 * @remarks
 * `goals` 只包含通过当前快照协议校验的 Goal；`unreadableCount` 是因本地快照
 * 与当前协议不兼容而无法读取的历史 Goal 数量。看板据此说明列表不完整，
 * 而不是把不可读数据当作不存在。
 *
 * @example
 * ```ts
 * const list: BrowserGoalList = {
 *     goals: [],
 *     unreadableCount: 2,
 * };
 * ```
 */
export type BrowserGoalList = InferContract<typeof browserGoalListContract>;

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
export type BrowserSessionMessage = InferContract<typeof browserSessionMessageContract>;

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
export type BrowserBashExecutionDetail = InferContract<typeof browserBashExecutionDetailContract>;

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
export type BrowserSessionStep = InferContract<typeof browserSessionStepContract>;

/**
 * 阶段生命周期状态。
 *
 * @remarks
 * - `in_progress`: 阶段执行中；
 * - `review_pending`: 阶段提出候选等待审查；
 * - `accepted`: 阶段候选已获审查接受。
 */
export type BrowserRunStageStatus = InferContract<typeof browserRunStageStatusContract>;

/**
 * 阶段修订历史记录。
 */
export type BrowserRunStageRevision = InferContract<typeof browserRunStageRevisionContract>;

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
export type BrowserRunStageGroup = InferContract<typeof browserRunStageGroupContract>;

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
export type BrowserPlanRoute = InferContract<typeof browserPlanRouteContract>;

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
export type BrowserPlanRouteStageState = InferContract<typeof browserPlanRouteStageStateContract>;

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
export type BrowserSessionRun = InferContract<typeof browserSessionRunContract>;

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
export type BrowserAskUserOption = InferContract<typeof browserAskUserOptionContract>;

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
export type BrowserAskUserQuestion = InferContract<typeof browserAskUserQuestionContract>;

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
export type BrowserAskUserAnswer = InferContract<typeof browserAskUserAnswerContract>;

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
export type BrowserGoalPlanItem = InferContract<typeof browserGoalPlanItemContract>;

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
export type BrowserGoalPlan = InferContract<typeof browserGoalPlanContract>;

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
export type BrowserToolGrantExtraFile = InferContract<typeof browserToolGrantExtraFileContract>;

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
export type BrowserSandboxReview = InferContract<typeof browserSandboxReviewContract>;

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
export type BrowserPendingAction = InferContract<typeof browserPendingActionContract>;

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
export type BrowserInteractionKind = InferContract<typeof browserInteractionKindContract>;

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
export type BrowserInteractionDecision = InferContract<typeof browserInteractionDecisionContract>;

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
export type BrowserInteractionView = InferContract<typeof browserInteractionViewContract>;

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
export type BrowserInteractionDetail = InferContract<typeof browserInteractionDetailContract>;

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
    InferContract<typeof browserInteractionDetailResultContract>;

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
export type BrowserGoalSession = InferContract<typeof browserGoalSessionContract>;

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
export type BrowserGoalSessionState = InferContract<typeof browserGoalSessionStateContract>;
