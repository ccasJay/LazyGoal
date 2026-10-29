import { contract } from "../../../contracts/src/index";
import { browserNonEmptyStringContract, browserRunStatusContract } from "./common";
import { browserActionReviewIssueContract } from "./interaction";

/** 轨迹 Run 状态投影。 */
export const browserTrajectoryRunContract = contract.openObject({
    runId: browserNonEmptyStringContract,
    status: browserRunStatusContract,
    current: contract.boolean(),
    committedThroughSequence: contract.integer({ minimum: 0 }),
});

/** 单条轨迹事件列表条目。 */
export const browserTrajectoryEntryContract = contract.openObject({
    eventId: browserNonEmptyStringContract,
    sequence: contract.integer({ minimum: 1 }),
    occurredAt: contract.string(),
    eventType: contract.string(),
    category: contract.enum([
        "lifecycle",
        "decision",
        "memory",
        "action",
        "tool",
        "observation",
        "terminal",
        "commit",
    ] as const),
    executionUnitId: contract.optional(browserNonEmptyStringContract),
    stepIndex: contract.optional(contract.integer()),
    actionId: contract.optional(browserNonEmptyStringContract),
    programId: contract.optional(browserNonEmptyStringContract),
    callIndex: contract.optional(contract.integer({ minimum: 0 })),
    parentActionId: contract.optional(browserNonEmptyStringContract),
    title: contract.string(),
    preview: contract.string(),
    previewTruncated: contract.boolean(),
    inputPreview: contract.optional(contract.string()),
    resultPreview: contract.optional(contract.string()),
    modelCallId: contract.optional(contract.string()),
    modelStage: contract.optional(contract.enum(["think", "decide"] as const)),
});

/** 轨迹分页查询响应页。 */
export const browserTrajectoryPageContract = contract.openObject({
    goalId: browserNonEmptyStringContract,
    run: browserTrajectoryRunContract,
    entries: contract.array(browserTrajectoryEntryContract),
    total: contract.integer({ minimum: 0 }),
    committedCount: contract.integer({ minimum: 0 }),
    previousCursor: contract.nullable(contract.integer({ minimum: 0 })),
    nextCursor: contract.nullable(contract.integer({ minimum: 0 })),
    locatedSequence: contract.nullable(contract.integer({ minimum: 0 })),
});

/** 模型输出校验修复反馈。 */
export const browserTrajectoryFeedbackWireContract = contract.openObject({
    code: contract.string(),
    origin: contract.string(),
    issues: contract.array(browserActionReviewIssueContract),
    constraints: contract.optional(contract.array(contract.string())),
});

/** 模型输出校验修复负载。 */
export const browserModelRepairFeedbackRecordedPayloadContract = contract.openObject({
    type: contract.literal("model_repair_feedback_recorded"),
    stage: contract.string(),
    attempt: contract.integer(),
    feedback: browserTrajectoryFeedbackWireContract,
});

/** 执行错误停止负载。 */
export const browserExecutionErrorPayloadContract = contract.openObject({
    type: contract.literal("execution_error"),
    code: contract.string(),
    message: contract.string(),
});

/** 模型重试开始负载。 */
export const browserModelRepairAttemptStartedPayloadContract = contract.openObject({
    type: contract.literal("model_repair_attempt_started"),
    stage: contract.optional(contract.string()),
    attempt: contract.integer(),
});

/** 轨迹事件 payload 的 wire 结构：只声明判别字段，其余 JSON 字段原样保留。 */
export const browserTrajectoryEventPayloadContract = contract.openObject({
    type: contract.string(),
});

/** 轨迹事件的 wire 传输信封。 */
export const browserTrajectoryEventWireContract = contract.openObject({
    eventId: browserNonEmptyStringContract,
    goalId: browserNonEmptyStringContract,
    runId: browserNonEmptyStringContract,
    sequence: contract.integer({ minimum: 1 }),
    occurredAt: contract.string(),
    phase: contract.string(),
    eventType: contract.string(),
    executionUnitId: contract.optional(browserNonEmptyStringContract),
    stepIndex: contract.optional(contract.integer()),
    actionId: contract.optional(browserNonEmptyStringContract),
    programId: contract.optional(browserNonEmptyStringContract),
    callIndex: contract.optional(contract.integer()),
    parentActionId: contract.optional(browserNonEmptyStringContract),
    payload: browserTrajectoryEventPayloadContract,
    eventSchemaVersion: contract.optional(contract.integer()),
});

/** 观察结果 wire 表达。 */
export const browserTrajectoryObservationContract = contract.union([
    contract.openObject({
        kind: contract.literal("success"),
        output: contract.unknown(),
        summary: contract.string(),
    }),
    contract.openObject({
        kind: contract.literal("failure"),
        code: contract.string(),
        message: contract.string(),
        retryable: contract.boolean(),
        details: contract.optional(contract.unknown()),
    }),
    contract.openObject({
        kind: contract.literal("rejected"),
        reason: contract.string(),
    }),
    contract.openObject({
        kind: contract.optional(contract.string()),
        output: contract.optional(contract.unknown()),
        summary: contract.optional(contract.string()),
        code: contract.optional(contract.string()),
        message: contract.optional(contract.string()),
    }),
]);

/** 工具结束事件的 wire 投影。 */
export const browserTrajectoryToolFinishedContract = contract.openObject({
    eventType: contract.string(),
    payload: contract.openObject({
        observation: contract.optional(contract.unknown()),
    }),
});

/** 轨迹 Run 列表响应。 */
export const browserTrajectoryRunsContract = contract.openObject({
    runs: contract.array(browserTrajectoryRunContract),
    nextOffset: contract.nullable(contract.integer({ minimum: 0 })),
});

/** 完整轨迹事件与关联上下文详情。 */
export const browserTrajectoryDetailContract = contract.openObject({
    event: browserTrajectoryEventWireContract,
    input: contract.optional(contract.unknown()),
    result: contract.optional(browserTrajectoryObservationContract),
    toolFinished: contract.optional(browserTrajectoryToolFinishedContract),
    toolStartedAt: contract.optional(contract.string()),
    toolFinishedAt: contract.optional(contract.string()),
    toolDurationMs: contract.nullable(contract.number()),
    observationConfirmed: contract.boolean(),
});

/** 本模块建立的 Trajectory 合同。 */
export const trajectoryWebContracts = [
    browserTrajectoryRunContract,
    browserTrajectoryEntryContract,
    browserTrajectoryPageContract,
    browserTrajectoryRunsContract,
    browserTrajectoryFeedbackWireContract,
    browserModelRepairFeedbackRecordedPayloadContract,
    browserExecutionErrorPayloadContract,
    browserModelRepairAttemptStartedPayloadContract,
    browserTrajectoryEventPayloadContract,
    browserTrajectoryEventWireContract,
    browserTrajectoryObservationContract,
    browserTrajectoryToolFinishedContract,
    browserTrajectoryDetailContract,
] as const;
