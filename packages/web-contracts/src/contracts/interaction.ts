import { contract } from "../../../contracts/src/index";
import {
    browserNonEmptyStringContract,
    browserToolGrantExtraFileContract,
} from "./common";
import {
    browserAskUserQuestionContract,
    browserParentProgramContract,
    browserPlanRouteStageContract,
} from "./session";

/** Action 审阅可申请的授权期限。 */
export const browserActionReviewScopeContract = contract.enum([
    "action",
    "goal",
    "workspace",
] as const);

/** 只读审批预检的 wire 请求。 */
export const browserActionReviewCommandContract = contract.object({
    runId: browserNonEmptyStringContract,
    actionId: browserNonEmptyStringContract,
    input: contract.optional(contract.unknown()),
    scope: contract.optional(browserActionReviewScopeContract),
});

/** 重新计算出的实际能力范围。 */
export const browserActionCapabilityContract = contract.openObject({
    network: contract.enum(["none", "all_outbound"] as const),
    extraFiles: contract.array(browserToolGrantExtraFileContract),
    targetPaths: contract.array(contract.string()),
});

/** 只读审批预检返回的可审阅内容。 */
export const browserActionReviewContract = contract.openObject({
    actionId: browserNonEmptyStringContract,
    toolId: browserNonEmptyStringContract,
    originalInput: contract.unknown(),
    finalInput: contract.unknown(),
    changed: contract.boolean(),
    scope: browserActionReviewScopeContract,
    availableScopes: contract.array(browserActionReviewScopeContract),
    capability: browserActionCapabilityContract,
    requiresSandboxApproval: contract.boolean(),
    reviewRef: browserNonEmptyStringContract,
});

/** 可定位的字段级问题。 */
export const browserActionReviewIssueContract = contract.openObject({
    path: contract.array(contract.union([contract.string(), contract.number()])),
    message: contract.string(),
});

/** 只读审批预检的 wire 结果。 */
export const browserActionReviewResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        goalId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        review: browserActionReviewContract,
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.enum([
            "goal_not_found",
            "stale_run",
            "action_not_waiting",
            "action_id_mismatch",
            "tool_not_found",
            "invalid_tool_input",
            "scope_unavailable",
            "sandbox_scope_unavailable",
            "review_unavailable",
        ] as const),
        issues: contract.optional(contract.array(browserActionReviewIssueContract)),
    }),
]);

/** 问答详情中的路线修订提议。 */
export const browserInteractionRouteRevisionContract = contract.openObject({
    baseRevision: contract.integer(),
    reason: browserNonEmptyStringContract,
    approvalRequest: browserNonEmptyStringContract,
    approvalOptionId: browserNonEmptyStringContract,
    stages: contract.array(browserPlanRouteStageContract),
});

/** 当前交互的完整审阅内容。 */
export const browserInteractionDetailContract = contract.union([
    contract.openObject({
        kind: contract.literal("question"),
        mode: contract.enum(["plan", "execution"] as const),
        questions: contract.array(browserAskUserQuestionContract),
        routeRevision: contract.optional(browserInteractionRouteRevisionContract),
    }),
    contract.openObject({
        kind: contract.literal("task_approval"),
        objective: contract.string(),
        approvalRequest: contract.string(),
        completionCriteria: contract.array(contract.string()),
        stages: contract.array(browserPlanRouteStageContract),
    }),
    contract.openObject({
        kind: contract.literal("action_approval"),
        actionId: browserNonEmptyStringContract,
        toolId: browserNonEmptyStringContract,
        approvalKind: contract.optional(contract.enum(["tool", "sandbox"] as const)),
        input: contract.unknown(),
        recoveryRef: contract.optional(browserNonEmptyStringContract),
        parentProgram: contract.optional(browserParentProgramContract),
    }),
    contract.openObject({
        kind: contract.literal("action_recovery"),
        actionId: browserNonEmptyStringContract,
        toolId: browserNonEmptyStringContract,
        approvalKind: contract.optional(contract.enum(["tool", "sandbox"] as const)),
        input: contract.unknown(),
        recoveryRef: contract.optional(browserNonEmptyStringContract),
        parentProgram: contract.optional(browserParentProgramContract),
    }),
]);

/** 当前交互完整详情读取的结果。 */
export const browserInteractionDetailResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        goalId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        interactionId: browserNonEmptyStringContract,
        detail: browserInteractionDetailContract,
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: contract.enum([
            "goal_not_found",
            "stale_run",
            "interaction_not_waiting",
            "interaction_mismatch",
            "interaction_details_unavailable",
        ] as const),
    }),
]);

/** 本模块建立的交互与 Action Review 合同。 */
export const interactionWebContracts = [
    browserActionReviewScopeContract,
    browserActionReviewCommandContract,
    browserActionCapabilityContract,
    browserActionReviewContract,
    browserActionReviewIssueContract,
    browserActionReviewResultContract,
    browserInteractionRouteRevisionContract,
    browserInteractionDetailContract,
    browserInteractionDetailResultContract,
] as const;
