/**
 * 模型请求准备的公共入口。
 *
 * @remarks
 * 该入口提供 Decide/Think 与完成审查请求构造、消息组装、Section 更新计划与请求
 * 检查；只读取传入的 Goal、View、Renderer 与已注入的历史组装 Port，不调用模型、
 * 不写调用记录、不提交 frame，也不依赖执行器或默认 Bundle。
 */

export {
    buildStepRequest,
    createStageMessages,
} from "./prompt";
export type {
    ModelOutputRequestPlan,
    StepPromptStageContext,
} from "./prompt";

export {
    renderRequest,
    renderWorkingContextMessage,
} from "./render";

export {
    DYNAMIC_SECTION_DIFF_ERROR_CODE,
    DynamicSectionDiffError,
    planDynamicSectionUpdates,
} from "./dynamic-section-diff";
export type {
    DynamicSectionUpdateMessage,
    DynamicSectionUpdatePlan,
} from "./dynamic-section-diff";

export {
    COMPLETION_REVIEW_PROMPT,
    buildCompletionReviewRequest,
    deduplicateCommittedEvidence,
} from "./completion-review";
export type {
    CompletionReviewRequestBudget,
} from "./completion-review";

export { requestRequiresContextCheckpoint } from "./request-inspection";
