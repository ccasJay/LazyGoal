import { contract } from "../../../contracts/src/index";
import { browserNonEmptyStringContract } from "./common";
import { browserMessagePositionContract } from "./common";
import {
    browserSessionInputOutcomeContract,
    browserSessionStateContract,
} from "./input";

/** 实时执行活动事件的稳定联合。 */
export const browserGoalActivityEventContract = contract.union([
    contract.openObject({
        kind: contract.literal("assistant_text_delta"),
        text: contract.string(),
        truncated: contract.boolean(),
        sourceEventId: browserNonEmptyStringContract,
        sourceCursor: contract.integer({ minimum: 1 }),
    }),
    contract.openObject({
        kind: contract.literal("model_started"),
        stage: contract.optional(
            contract.enum(["think", "decide", "completion_review"] as const),
        ),
        modelCallId: contract.optional(browserNonEmptyStringContract),
        executionUnitId: contract.optional(browserNonEmptyStringContract),
        occurredAt: contract.optional(contract.string({ maxLength: 40 })),
    }),
    contract.openObject({ kind: contract.literal("model_completed") }),
    contract.openObject({ kind: contract.literal("step_started") }),
    contract.openObject({
        kind: contract.literal("tool_started"),
        sourceEventId: browserNonEmptyStringContract,
        sourceCursor: contract.integer({ minimum: 1 }),
        actionId: browserNonEmptyStringContract,
        executionUnitId: browserNonEmptyStringContract,
        toolId: browserNonEmptyStringContract,
        inputSummary: contract.optional(contract.string()),
    }),
    contract.openObject({
        kind: contract.literal("tool_finished"),
        sourceEventId: browserNonEmptyStringContract,
        sourceCursor: contract.integer({ minimum: 1 }),
        actionId: browserNonEmptyStringContract,
        toolId: browserNonEmptyStringContract,
        outcome: contract.enum(["success", "failure"] as const),
        summary: contract.optional(contract.string()),
    }),
    contract.openObject({
        kind: contract.literal("tool_attempt_started"),
        sourceEventId: browserNonEmptyStringContract,
        sourceCursor: contract.integer({ minimum: 1 }),
        actionId: browserNonEmptyStringContract,
        attempt: contract.integer({ minimum: 1 }),
    }),
    contract.openObject({
        kind: contract.literal("tool_attempt_failed"),
        sourceEventId: browserNonEmptyStringContract,
        sourceCursor: contract.integer({ minimum: 1 }),
        actionId: browserNonEmptyStringContract,
        attempt: contract.integer({ minimum: 1 }),
        reason: contract.string(),
    }),
    contract.openObject({
        kind: contract.literal("activity_boundary"),
        sourceEventId: browserNonEmptyStringContract,
        sourceCursor: contract.integer({ minimum: 1 }),
        reason: contract.enum([
            "assistant_reply",
            "user_wait",
            "stage_change",
            "terminal",
            "failure",
            "unknown",
        ] as const),
    }),
    contract.openObject({
        kind: contract.literal("candidate_preview"),
        sourceEventId: browserNonEmptyStringContract,
        sourceCursor: contract.integer({ minimum: 1 }),
        candidateId: browserNonEmptyStringContract,
        text: contract.string(),
        startOffset: contract.integer({ minimum: 0 }),
        truncated: contract.boolean(),
        complete: contract.boolean(),
    }),
    contract.openObject({
        kind: contract.literal("candidate_invalidated"),
        sourceEventId: browserNonEmptyStringContract,
        sourceCursor: contract.integer({ minimum: 1 }),
        candidateId: browserNonEmptyStringContract,
        reason: contract.enum([
            "rejected",
            "cancelled",
            "failed",
            "replaced",
            "ambiguous",
        ] as const),
    }),
]);

/** 已提交消息的实时推送摘要。 */
export const browserCommittedMessageEventContract = contract.openObject({
    messageId: browserNonEmptyStringContract,
    role: contract.enum(["user", "assistant"] as const),
    runId: browserNonEmptyStringContract,
    position: browserMessagePositionContract,
    purpose: contract.optional(contract.enum(["process", "answer", "notice"] as const)),
    commitRevision: contract.integer(),
    previewId: contract.optional(browserNonEmptyStringContract),
});

/** 交互要求的实时推送摘要。 */
export const browserInteractionRequiredEventContract = contract.openObject({
    interactionId: browserNonEmptyStringContract,
    kind: contract.enum([
        "ask_user",
        "task_approval",
        "action_approval",
        "action_recovery",
    ] as const),
    runId: browserNonEmptyStringContract,
});

/** 浏览器端消费的 Goal 范围实时推送事件。 */
export const browserGoalLiveEventContract = contract.union([
    contract.openObject({
        type: contract.literal("state_sync"),
        goalId: browserNonEmptyStringContract,
        state: browserSessionStateContract,
    }),
    contract.openObject({
        type: contract.literal("input_result"),
        goalId: browserNonEmptyStringContract,
        outcome: browserSessionInputOutcomeContract,
    }),
    contract.openObject({
        type: contract.literal("activity"),
        goalId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        activity: browserGoalActivityEventContract,
    }),
    contract.openObject({
        type: contract.literal("message_committed"),
        goalId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        message: browserCommittedMessageEventContract,
    }),
    contract.openObject({
        type: contract.literal("interaction_required"),
        goalId: browserNonEmptyStringContract,
        runId: browserNonEmptyStringContract,
        interaction: browserInteractionRequiredEventContract,
    }),
    contract.openObject({
        type: contract.literal("snapshot_changed"),
        goalId: browserNonEmptyStringContract,
        runId: contract.optional(browserNonEmptyStringContract),
    }),
    contract.openObject({
        type: contract.literal("refresh_required"),
        goalId: browserNonEmptyStringContract,
        runId: contract.optional(browserNonEmptyStringContract),
    }),
]);

/** 本模块建立的 SSE 实时事件合同。 */
export const eventsWebContracts = [
    browserGoalActivityEventContract,
    browserCommittedMessageEventContract,
    browserInteractionRequiredEventContract,
    browserGoalLiveEventContract,
] as const;
