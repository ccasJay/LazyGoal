/**
 * Web 会话与看板投影的数据传输对象 (DTO)。
 *
 * @remarks
 * 类型与约束的唯一来源是 [`wire.ts`](./wire.ts)；本模块只保留既有公开导入路径。
 */

export type {
    BrowserActionReview,
    BrowserActionReviewCommand,
    BrowserActionReviewResult,
    BrowserAskUserAnswer,
    BrowserAskUserOption,
    BrowserAskUserQuestion,
    BrowserBashExecutionDetail,
    BrowserExecutionState,
    BrowserGoalExecution,
    BrowserGoalList,
    BrowserGoalListItem,
    BrowserGoalPlan,
    BrowserGoalPlanItem,
    BrowserGoalSession,
    BrowserGoalSessionState,
    BrowserInteractionDecision,
    BrowserInteractionDetail,
    BrowserInteractionDetailResult,
    BrowserInteractionKind,
    BrowserInteractionView,
    BrowserMessagePosition,
    BrowserPendingAction,
    BrowserPlanRoute,
    BrowserPlanRouteStage,
    BrowserPlanRouteStageState,
    BrowserRunStageGroup,
    BrowserRunStageRevision,
    BrowserRunStageStatus,
    BrowserRunStatus,
    BrowserSandboxReview,
    BrowserSessionMessage,
    BrowserSessionRun,
    BrowserSessionStep,
    BrowserToolGrantExtraFile,
} from "./wire";
