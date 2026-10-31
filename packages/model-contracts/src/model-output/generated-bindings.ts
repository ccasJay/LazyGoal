import { askUserAgentDecisionBinding } from "../generated/ask-user-agent-decision/binding";
import { completionReviewAcceptBinding } from "../generated/completion-review-accept/binding";
import { completionReviewRejectBinding } from "../generated/completion-review-reject/binding";
import { contextLookupRequestBinding } from "../generated/context-lookup-request/binding";
import { executingCompleteAgentDecisionBinding } from "../generated/executing-complete-agent-decision/binding";
import { failAgentDecisionBinding } from "../generated/fail-agent-decision/binding";
import { goalPlanUpdateAgentDecisionBinding } from "../generated/goal-plan-update-agent-decision/binding";
import { modelContextCheckpointResultBinding } from "../generated/model-context-checkpoint-result/binding";
import { normalCompleteAgentDecisionBinding } from "../generated/normal-complete-agent-decision/binding";
import { requestThinkBinding } from "../generated/request-think/binding";
import { runPlanRouteUpdateAgentDecisionBinding } from "../generated/run-plan-route-update-agent-decision/binding";
import { runStageCompleteAgentDecisionBinding } from "../generated/run-stage-complete-agent-decision/binding";
import { runStageUpdateAgentDecisionBinding } from "../generated/run-stage-update-agent-decision/binding";
import { systemAskUserInputBinding } from "../generated/system-ask-user-input/binding";
import { systemCompleteRunInputBinding } from "../generated/system-complete-run-input/binding";
import { systemCompleteRunStageInputBinding } from "../generated/system-complete-run-stage-input/binding";
import { systemCompleteTaskInputBinding } from "../generated/system-complete-task-input/binding";
import { systemCompletionReviewInputBinding } from "../generated/system-completion-review-input/binding";
import { systemContextCheckpointInputBinding } from "../generated/system-context-checkpoint-input/binding";
import { systemContextLookupInputBinding } from "../generated/system-context-lookup-input/binding";
import { systemFailGoalInputBinding } from "../generated/system-fail-goal-input/binding";
import { systemFindToolsInputBinding } from "../generated/system-find-tools-input/binding";
import { systemProposeTaskPlanInputBinding } from "../generated/system-propose-task-plan-input/binding";
import { systemRequestThinkInputBinding } from "../generated/system-request-think-input/binding";
import { systemReviseRunStageInputBinding } from "../generated/system-revise-run-stage-input/binding";
import { systemStartNextRunStageInputBinding } from "../generated/system-start-next-run-stage-input/binding";
import { systemStartRunStageInputBinding } from "../generated/system-start-run-stage-input/binding";
import { systemUpdateGoalPlanInputBinding } from "../generated/system-update-goal-plan-input/binding";
import { systemUpdatePlanRouteInputBinding } from "../generated/system-update-plan-route-input/binding";
import { systemWaitForInputInputBinding } from "../generated/system-wait-for-input-input/binding";
import { taskProposalAgentDecisionBinding } from "../generated/task-proposal-agent-decision/binding";
import { toolCallDecisionEnvelopeBinding } from "../generated/tool-call-decision-envelope/binding";
import { toolDiscoveryDecisionBinding } from "../generated/tool-discovery-decision/binding";
import { waitAgentDecisionBinding } from "../generated/wait-agent-decision/binding";
import type { ModelOutputBindingSet } from "./bindings";

/**
 * 模型线从 Catalog 生成制品装配的全部契约绑定。
 *
 * @remarks
 * 每个绑定由 `contracts/catalog.json` 的同一 TS 声明生成；组合器按请求从中选择分支。
 * `tool_call` 使用固定外壳绑定，业务输入由工具线的 `AuthorizedToolBinding` 提供。
 * 该集合不读取 Goal 状态，也不授予工具或 Runtime 权限。
 *
 * @example
 * ```ts
 * const bundle = createBoundModelOutputContractBundle({ kind: "executing" }, modelOutputBindings);
 * ```
 */
export const modelOutputBindings: ModelOutputBindingSet = {
    executing: {
        toolCall: toolCallDecisionEnvelopeBinding,
        normalComplete: normalCompleteAgentDecisionBinding,
        executingComplete: executingCompleteAgentDecisionBinding,
        wait: waitAgentDecisionBinding,
        fail: failAgentDecisionBinding,
        contextLookup: contextLookupRequestBinding,
        toolDiscovery: toolDiscoveryDecisionBinding,
        askUser: askUserAgentDecisionBinding,
        taskProposal: taskProposalAgentDecisionBinding,
        goalPlanUpdate: goalPlanUpdateAgentDecisionBinding,
        runStageUpdate: runStageUpdateAgentDecisionBinding,
        runStageComplete: runStageCompleteAgentDecisionBinding,
        runPlanRouteUpdate: runPlanRouteUpdateAgentDecisionBinding,
        requestThink: requestThinkBinding,
    },
    checkpoint: modelContextCheckpointResultBinding,
    completionReview: {
        accept: completionReviewAcceptBinding,
        reject: completionReviewRejectBinding,
    },
    systemTools: {
        completionReview: systemCompletionReviewInputBinding,
        completeTask: systemCompleteTaskInputBinding,
        completeRun: systemCompleteRunInputBinding,
        waitForInput: systemWaitForInputInputBinding,
        failGoal: systemFailGoalInputBinding,
        contextLookup: systemContextLookupInputBinding,
        findTools: systemFindToolsInputBinding,
        askUser: systemAskUserInputBinding,
        proposeTaskPlan: systemProposeTaskPlanInputBinding,
        updatePlanRoute: systemUpdatePlanRouteInputBinding,
        contextCheckpoint: systemContextCheckpointInputBinding,
        updateGoalPlan: systemUpdateGoalPlanInputBinding,
        startRunStage: systemStartRunStageInputBinding,
        reviseRunStage: systemReviseRunStageInputBinding,
        completeRunStage: systemCompleteRunStageInputBinding,
        startNextRunStage: systemStartNextRunStageInputBinding,
        requestThink: systemRequestThinkInputBinding,
    },
};
