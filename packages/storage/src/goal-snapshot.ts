type SnapshotContextLookupNeed =
    | "conversation_history"
    | "historical_execution"
    | "decision_rationale";

type SnapshotContextLookupOperation =
    | "history_search"
    | "directory_browse"
    | "directory_search"
    | "source_expand";

/** Snapshot 中 Tool 输入与 Observation 输出允许的递归 JSON 值。 */
export type SnapshotJsonValue =
    | string
    | number
    | boolean
    | null
    | readonly SnapshotJsonValue[]
    | { readonly [key: string]: SnapshotJsonValue };

/** 当前 Goal Snapshot 的元数据。 */
export interface GoalSnapshotMetadataV1 {
    readonly schemaVersion: 1;
}

/** Snapshot 中冻结的 Agent Profile。 */
export interface GoalSnapshotProfileV1 {
    readonly id: string;
    readonly name?: string | undefined;
    readonly description?: string | undefined;
    readonly systemPrompt: string;
    readonly instructions: readonly string[];
    readonly toolIds: readonly string[];
}

/** Snapshot 中冻结的 Goal 协议组合与执行策略。 */
export interface GoalSnapshotDefinitionV1 {
    /** 创建 Goal 的投递事实与冻结的动作权限范围。 */
    readonly triggerContext?: {
        readonly deliveryId: string;
        readonly trigger: {
            readonly id: string;
            readonly purpose: "work" | "permission" | "interaction" | "cancel" | "progress" | "lifecycle";
            readonly source: "user" | "worker" | "external" | "supervisor";
            readonly workerId?: string;
            readonly generation?: string;
            readonly payload: string;
        };
        readonly authorization: {
            readonly workspaceRoot: string;
            readonly toolIds: readonly string[];
            readonly sandbox: {
                readonly extraFiles: readonly { readonly canonicalPath: string; readonly access: "read" | "write"; readonly kind: "file" | "directory_tree" }[];
                readonly network: "none" | "all_outbound";
            };
        };
    };
    readonly intent: string;
    readonly promptBundleVersion: 1;
    readonly memoryProtocol: { readonly kind: "structured"; readonly version: 1 };
    readonly modelContextProtocol: {
        readonly kind: "trajectory-layered";
        readonly version: 1;
    };
    readonly contextRetrievalProtocol: {
        readonly kind: "bm25-lite";
        readonly version: 1;
    };
    readonly profile: GoalSnapshotProfileV1;
    readonly executionPolicy: { readonly maxSteps: number };
}

/** Snapshot 中单条完成条件的验收声明。 */
export interface GoalSnapshotCompletionAcceptanceV1 {
    readonly expectToolId: string;
    readonly expectOutcome: "success" | "failure";
}

/** Snapshot 中的单条完成条件。 */
export interface GoalSnapshotCompletionCriterionV1 {
    readonly text: string;
    readonly acceptance?: GoalSnapshotCompletionAcceptanceV1 | undefined;
}

/** Snapshot 中的任务定义。 */
export interface GoalSnapshotTaskV1 {
    readonly objective: string;
    readonly completionCriteria: readonly GoalSnapshotCompletionCriterionV1[];
}

/**
 * Snapshot 中保存的消息来源。
 *
 * @remarks
 * 来源描述消息为什么存在；它参与提交重试核对与原生历史去重判定，不参与正文比较。
 * 同文不同来源仍是两条独立消息。
 *
 * @example
 * ```ts
 * const source: GoalSnapshotMessageSourceV1 = { kind: "user_input", inputId: "input-1" };
 * ```
 */
export type GoalSnapshotMessageSourceV1 =
    | { readonly kind: "goal_intent"; readonly goalId: string }
    | { readonly kind: "user_input"; readonly inputId: string }
    | { readonly kind: "interaction_response"; readonly requestId: string }
    | { readonly kind: "model_text"; readonly modelCallId: string; readonly blockIndex: number }
    | { readonly kind: "stage_output"; readonly executionUnitId: string; readonly blockIndex: number }
    | { readonly kind: "completion_candidate"; readonly candidateId: string }
    | { readonly kind: "host_execution"; readonly actionId: string }
    | { readonly kind: "runtime_notice"; readonly noticeId: string };

/**
 * Snapshot 中的 Run 内消息位置。
 *
 * @remarks
 * `afterSequence` 指同一 Run 中消息之前最后一条已提交事实；`order` 按 Snapshot
 * 顺序标识共享锚点的消息。此位置不表示墙钟时间或执行 Step。
 *
 * @example
 * ```ts
 * const position: GoalSnapshotMessagePositionV1 = { afterSequence: 12, order: 0 };
 * ```
 */
export interface GoalSnapshotMessagePositionV1 {
    /** 消息之前的最后一条已提交事实序列。 */
    readonly afterSequence: number;
    /** 同一 Run、同一锚点内的 Snapshot 次序，从零开始。 */
    readonly order: number;
}

/** Snapshot 中按时间顺序保存的真实会话消息。 */
export type GoalSnapshotMessageV1 =
    | {
        readonly role: "user";
        readonly content: string;
        readonly messageId: string;
        readonly runId: string;
        /** 消息之前最后一条已提交 Run 事实及同锚点 Snapshot 次序。 */
        readonly position: GoalSnapshotMessagePositionV1;
        readonly source: GoalSnapshotMessageSourceV1;
    }
    | {
        readonly role: "assistant";
        readonly assistant: { readonly profileId: string };
        readonly content: string;
        readonly messageId: string;
        readonly runId: string;
        /** 消息之前最后一条已提交 Run 事实及同锚点 Snapshot 次序。 */
        readonly position: GoalSnapshotMessagePositionV1;
        readonly purpose: "process" | "answer" | "notice";
        readonly source: GoalSnapshotMessageSourceV1;
    };

/** Snapshot 中的 Tool Action。 */
export interface GoalSnapshotToolCallActionV1 {
    readonly actionId: string;
    readonly toolId: string;
    readonly input: SnapshotJsonValue;
}

/** Snapshot 中的 Tool Observation。 */
export type GoalSnapshotObservationV1 =
    | {
        readonly kind: "success";
        readonly output: SnapshotJsonValue;
        readonly summary: string;
    }
    | {
        readonly kind: "failure";
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
        readonly details?: SnapshotJsonValue;
    }
    | { readonly kind: "rejected"; readonly reason: string };

/** Snapshot 中的一条 Memory Patch 操作。 */
export type GoalSnapshotMemoryPatchOperationV1 =
    | {
        readonly type: "upsert_fact";
        readonly fact: {
            readonly subject: string;
            readonly predicate: string;
            readonly value: SnapshotJsonValue;
            readonly stability: "stable" | "last_observed";
            readonly evidenceSequences: readonly number[];
            readonly scope?: "goal" | "phase" | undefined;
        };
    }
    | {
        readonly type: "retire_fact";
        readonly fact: {
            readonly id: string;
            readonly evidenceSequences: readonly number[];
        };
    }
    | {
        readonly type: "create_hypothesis";
        readonly hypothesis: {
            readonly statement: string;
            readonly scope?: "goal" | "phase" | undefined;
        };
    }
    | {
        readonly type: "update_hypothesis";
        readonly hypothesis: {
            readonly id: string;
            readonly statement?: string | undefined;
            readonly status?: "active" | "resolved" | "superseded" | undefined;
        };
    }
    | {
        readonly type: "create_blocker";
        readonly blocker: {
            readonly description: string;
            readonly scope?: "goal" | "phase" | undefined;
        };
    }
    | {
        readonly type: "update_blocker";
        readonly blocker: {
            readonly id: string;
            readonly description?: string | undefined;
            readonly status?: "active" | "resolved" | "superseded" | undefined;
        };
    };

/** Snapshot 中的 Memory Patch。 */
export interface GoalSnapshotMemoryPatchV1 {
    readonly protocolVersion: 1;
    readonly operations: readonly GoalSnapshotMemoryPatchOperationV1[];
}

/** Structured complete Decision 的完成证据。 */
export interface GoalSnapshotCompletionEvidenceV1 {
    readonly criterionIndex: number;
    readonly evidenceSequences: readonly number[];
}

/** Snapshot 中可回放的 GoalPlan 增量操作。 */
export type GoalSnapshotGoalPlanPatchOperationV1 =
    | {
        readonly type: "add";
        readonly content: string;
        readonly position?: number | undefined;
    }
    | {
        readonly type: "update";
        readonly id: string;
        readonly content?: string | undefined;
        readonly status?: "pending" | "in_progress" | "completed" | "cancelled" | undefined;
        readonly evidenceSequences?: readonly number[] | undefined;
    }
    | {
        readonly type: "reorder";
        readonly id: string;
        readonly position: number;
    }
    | {
        readonly type: "cancel";
        readonly id: string;
    };

/** Snapshot 中 Context Lookup Decision 的过滤器。 */
export interface GoalSnapshotContextLookupFiltersV1 {
    readonly eventTypes?: readonly string[];
    readonly toolIds?: readonly string[];
    readonly actionIds?: readonly string[];
    readonly stepIndexes?: readonly number[];
    readonly paths?: readonly string[];
    readonly errorCodes?: readonly string[];
    readonly objectIds?: readonly string[];
    readonly sequenceRange?: { readonly from: number; readonly to: number };
}

/** Snapshot 中的结构化 Agent Decision 结果。 */
export type GoalSnapshotStructuredDecisionResultV1 =
    | {
        readonly kind: "complete";
        readonly summary: string;
        readonly evidenceSequences: readonly number[];
        readonly memoryPatch?: GoalSnapshotMemoryPatchV1 | undefined;
    }
    | {
        readonly kind: "complete";
        readonly summary: string;
        readonly completionEvidence: readonly GoalSnapshotCompletionEvidenceV1[];
        readonly memoryPatch?: GoalSnapshotMemoryPatchV1 | undefined;
    }
    | {
        readonly kind: "wait";
        readonly reason: string;
        readonly memoryPatch?: GoalSnapshotMemoryPatchV1 | undefined;
    }
    | {
        readonly kind: "fail";
        readonly error: string;
        readonly memoryPatch?: GoalSnapshotMemoryPatchV1 | undefined;
    }
    | {
        readonly kind: "context_lookup";
        readonly operation?: SnapshotContextLookupOperation | undefined;
        readonly need?: SnapshotContextLookupNeed | undefined;
        readonly question?: string | undefined;
        readonly filters?: GoalSnapshotContextLookupFiltersV1 | undefined;
        readonly query?: string | undefined;
        readonly cursor?: string | undefined;
        readonly limit?: number | undefined;
        readonly category?: string | undefined;
        readonly sourceRef?: string | undefined;
        readonly offset?: number | undefined;
    }
    | {
        readonly kind: "tool_discovery";
        readonly query: string;
    }
    | {
        readonly kind: "goal_plan_update";
        readonly baseRevision: number;
        readonly operations: readonly GoalSnapshotGoalPlanPatchOperationV1[];
        readonly memoryPatch?: GoalSnapshotMemoryPatchV1 | undefined;
    }
    | {
        readonly kind: "run_stage_update";
        readonly stageId?: string | undefined;
        readonly baseRevision?: number | undefined;
        readonly reason?: string | undefined;
        readonly target: string;
        readonly acceptanceCriteria: readonly string[];
        readonly memoryPatch?: GoalSnapshotMemoryPatchV1 | undefined;
    }
    | {
        readonly kind: "run_stage_complete";
        readonly stageId: string;
        readonly summary: string;
        readonly evidenceSequences?: readonly number[] | undefined;
        readonly memoryPatch?: GoalSnapshotMemoryPatchV1 | undefined;
    }
    | {
        readonly kind: "run_plan_route_update";
        readonly baseRevision: number;
        readonly reason: string;
        readonly route: GoalSnapshotPlanRouteCandidateV1;
        readonly approvalRequest?: string | undefined;
        readonly memoryPatch?: GoalSnapshotMemoryPatchV1 | undefined;
    };

/** Snapshot 中最近一次完成 Step 的 Decision 结果。 */
export type GoalSnapshotDecisionResultV1 = GoalSnapshotStructuredDecisionResultV1;

/** Snapshot 中最近一次完成 Step。 */
export type GoalSnapshotStepRecordV1 =
    | {
        readonly kind: "action";
        readonly action: GoalSnapshotToolCallActionV1;
        readonly observation: GoalSnapshotObservationV1;
    }
    | {
        readonly kind: "decision";
        readonly result: GoalSnapshotDecisionResultV1;
    };

/** Snapshot 中的 Memory revision 指针。 */
export interface GoalSnapshotMemoryRevisionV1 {
    readonly eventId: string;
    readonly sequence: number;
}

/**
 * Snapshot 中当前 Step 的已提交 Think 链指针。
 *
 * @remarks
 * Think 请求和输出正文只保存在 Trajectory；Snapshot 指针限定其 Goal、Run、Step、
 * 执行单元、输入边界与最新完成事件身份。
 *
 * @example
 * ```ts
 * const pendingThink: GoalSnapshotPendingThinkV1 = {
 *   goalId: "goal-1", runId: "run-1", stepOrdinal: 2,
 *   executionUnitId: "execution-unit-1",
 *   inputBoundary: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
 *   latestThinkEventId: "event-8",
 * };
 * ```
 */
export interface GoalSnapshotPendingThinkV1 {
    readonly goalId: string;
    readonly runId: string;
    readonly stepOrdinal: number;
    readonly executionUnitId: string;
    readonly inputBoundary: string;
    readonly latestThinkEventId: string;
}

/**
 * Snapshot 中可恢复的模型输出修复尝试指针。
 *
 * @example
 * ```ts
 * const repair: GoalSnapshotPendingModelRepairV1 = {
 *     goalId: "goal-1", runId: "run-1", stepOrdinal: 1,
 *     executionUnitId: "unit-1", stage: "decide",
 *     inputBoundary: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
 *     attemptsStarted: 1, latestAttemptEventId: "event-10",
 * };
 * ```
 */
export interface GoalSnapshotPendingModelRepairV1 {
    readonly goalId: string;
    readonly runId: string;
    readonly stepOrdinal: number;
    readonly executionUnitId: string;
    readonly stage: "decide" | "think";
    readonly inputBoundary: string;
    readonly attemptsStarted: number;
    /** 不推进类调用数；与 `attemptsStarted` 独立计数。 */
    readonly continuationsStarted?: number;
    /** 最近一次失败的类别；决定下一次调用计入哪个预算。 */
    readonly latestFailureClass?: "non_advancing" | "protocol";
    readonly latestAttemptEventId: string;
    readonly latestFeedbackEventId?: string;
    readonly thinkRequestId?: string;
}

/** Snapshot 中一次 Decide 返回的多调用批次里尚未暂存的决策。 */
export interface GoalSnapshotPendingActionBatchV1 {
    readonly batchId: string;
    /** 按模型返回顺序排列、尚未暂存的业务 Action；至少一条。 */
    readonly remaining: readonly GoalSnapshotToolCallActionV1[];
}

/** Snapshot 中已获批 Action 的最终执行版本。 */
export interface GoalSnapshotExecutionVersionV1 {
    /** 原请求的稳定引用与原始参数；不被修订覆盖。 */
    readonly original: {
        readonly actionId: string;
        readonly toolId: string;
        readonly input: SnapshotJsonValue;
    };
    /** 最终 canonical 执行参数。 */
    readonly input: SnapshotJsonValue;
    /** 绑定的审阅指纹。 */
    readonly reviewRef: string;
    /** 实际获批的授权期限。 */
    readonly scope: "action" | "goal" | "workspace";
    /** 修订来源；未修订的批准省略。 */
    readonly revision?: { readonly source: "user" | "host" };
}

/** Snapshot 中的未完成 Action。 */
export interface GoalSnapshotPendingActionV1 {
    readonly action: GoalSnapshotToolCallActionV1;
    readonly status: "approved" | "awaiting_approval" | "outcome_unknown";
    /** 暂存该 Action 的执行单元；恢复执行后继续使用同一身份。 */
    readonly executionUnitId?: string;
    readonly attemptsStarted?: number;
    readonly approvalScope?: "action" | "goal" | "workspace";
    readonly grantId?: string;
    readonly approvalKind?: "tool" | "sandbox";
    readonly effectiveSandboxScope?: {
        readonly extraFiles: readonly {
            readonly canonicalPath: string;
            readonly access: "read" | "write";
            readonly kind: "file" | "directory_tree";
        }[];
        readonly network: "none" | "all_outbound";
    };
    /** 批准该 Action 的稳定决定身份；持续授权按该身份暂存与激活。 */
    readonly approvalInputId?: string;
    /** 已获批 Action 的最终执行版本；未修订的批准省略。 */
    readonly executionVersion?: GoalSnapshotExecutionVersionV1;
    /** 结果未知等待的恢复身份；跨重启稳定。 */
    readonly recoveryRef?: string;
}

/**
 * 当前程序的父 Action 与恢复身份；中间结果仍只存 Trajectory。
 *
 * @example
 * ```ts
 * const pointer: GoalSnapshotPendingProgramV1 = {
 *   programId: "p1", action: { actionId: "a1", toolId: "execute_program", input: { code: "return 1" } },
 *   executionUnitId: "u1", codeHash: "abc", workerHash: "def",
 *   nodeVersion: "v22", fixedTime: 0, seed: 1, nextCallIndex: 0,
 *   resultBytes: 0,
 * };
 * ```
 */
export interface GoalSnapshotPendingProgramV1 {
    readonly programId: string;
    readonly action: GoalSnapshotToolCallActionV1;
    readonly executionUnitId: string;
    readonly codeHash: string;
    readonly workerHash: string;
    readonly nodeVersion: string;
    readonly fixedTime: number;
    readonly seed: number;
    readonly nextCallIndex: number;
    readonly resultBytes: number;
    readonly pendingStop?: { readonly code: string; readonly message: string };
}

/** Snapshot 中非 Step 自身导致的 Run 终止原因。 */
export type GoalSnapshotStopReasonV1 =
    | { readonly kind: "max_steps_exceeded" }
    | {
        readonly kind: "execution_error";
        readonly code:
            | "TOOL_NOT_AUTHORIZED"
            | "TOOL_NOT_FOUND"
            | "INVALID_TOOL_INPUT"
            | "INVALID_MEMORY_PATCH"
            | "INVALID_AGENT_DECISION"
            | "COMPLETION_REVIEW_INPUT_TOO_LARGE"
            | "MODEL_REQUEST_FAILED"
            | "TOOL_EXECUTION_ERROR";
        readonly message: string;
    };

/** Snapshot 中的模型上下文 Epoch。 */
export interface GoalSnapshotContextEpochV1 {
    readonly version: 1;
    readonly number: number;
    readonly conversationStartIndex: number;
    readonly openedAtSequence: number;
}

/** Snapshot 中前序阶段结果的引用指针。 */
export interface GoalSnapshotPreviousStageResultRefV1 {
    readonly stageId: string;
    readonly sequence: number;
}

/** Snapshot 中阶段审查拒绝反馈。 */
export interface GoalSnapshotStageRejectionV1 {
    readonly feedback: string;
    readonly rejectedAtSequence?: number | undefined;
}

/** Snapshot 中当前活动阶段的状态。 */
export interface GoalSnapshotRunStageV1 {
    readonly stageId: string;
    readonly revision: number;
    readonly status: "executing" | "accepted";
    readonly target: string;
    readonly acceptanceCriteria: readonly string[];
    readonly previousStageResultRef?: GoalSnapshotPreviousStageResultRefV1 | undefined;
    readonly latestReviewRejection?: GoalSnapshotStageRejectionV1 | undefined;
    readonly acceptedSequence?: number | undefined;
}

/**
 * Snapshot 中单个 Plan Run 路线阶段。
 *
 * @example
 * ```ts
 * const stage: GoalSnapshotPlanRouteStageV1 = {
 *     stageId: "stage-1", revision: 1, status: "pending",
 *     target: "调查入口", acceptanceCriteria: ["定位实现"],
 * };
 * ```
 */
export interface GoalSnapshotPlanRouteStageV1 {
    readonly stageId: string;
    readonly revision: number;
    readonly status: "pending" | "executing" | "accepted";
    readonly target: string;
    readonly acceptanceCriteria: readonly string[];
    readonly acceptedSequence?: number | undefined;
}

/**
 * Snapshot 中已批准 Plan Run 的完整阶段路线与恢复游标。
 *
 * @remarks 普通 Run 和尚未批准任务提案的 Plan Run 不包含该状态。
 *
 * @example
 * ```ts
 * const route: GoalSnapshotPlanRouteV1 = {
 *     revision: 1, nextStageIndex: 0, nextStageOrdinal: 2,
 *     stages: [{ stageId: "stage-1", revision: 1, status: "pending", target: "调查", acceptanceCriteria: ["定位入口"] }],
 * };
 * ```
 */
export interface GoalSnapshotPlanRouteV1 {
    readonly revision: number;
    readonly revisionReason?: string;
    readonly nextStageIndex: number;
    readonly nextStageOrdinal: number;
    readonly stages: readonly GoalSnapshotPlanRouteStageV1[];
}

/**
 * Snapshot 中的 Run 状态。
 *
 * @remarks
 * Run 自己持有模式与已批准任务；它不引用 GoalPlan Todo。
 *
 * @example
 * ```ts
 * const run: GoalSnapshotRunStateV1 = {
 *   id: "run-1",
 *   mode: "normal",
 *   status: "created",
 *   stepCount: 0,
 *   committedThroughSequence: 0,
 *   contextEpoch: { version: 1, number: 0, conversationStartIndex: 0, openedAtSequence: 0 },
 * };
 * ```
 */
export interface GoalSnapshotRunStateV1 {
    readonly id: string;
    readonly mode: "normal" | "plan";
    readonly approvedTask?: GoalSnapshotTaskV1 | undefined;
    readonly status:
        | "created"
        | "running"
        | "waiting"
        | "completed"
        | "failed"
        | "cancelled";
    readonly stepCount: number;
    /** 当前 Run 已向模型暴露完整 Schema 的工具 ID。 */
    readonly exposedToolIds: readonly string[];
    /** Trajectory 可见高水位；包含已提交的模型上下文 frame。 */
    readonly committedThroughSequence: number;
    readonly memoryRevision?: GoalSnapshotMemoryRevisionV1 | undefined;
    /** Snapshot 中当前活动或最新已接受的 Run 内部阶段。 */
    readonly currentStage?: GoalSnapshotRunStageV1 | undefined;
    /** 已批准 Plan Run 的完整路线；普通 Run 和待审批 Run 省略。 */
    readonly planRoute?: GoalSnapshotPlanRouteV1 | undefined;
    readonly lastStep?: GoalSnapshotStepRecordV1 | undefined;
    readonly pendingAction?: GoalSnapshotPendingActionV1 | undefined;
    /** 多调用批次中尚未暂存的后续决策；与 `pendingAction` 共同构成恢复点。 */
    readonly pendingActionBatch?: GoalSnapshotPendingActionBatchV1 | undefined;
    readonly pendingProgram?: GoalSnapshotPendingProgramV1 | undefined;
    readonly pendingInteraction?: GoalSnapshotPendingInteractionV1 | undefined;
    readonly pendingThink?: GoalSnapshotPendingThinkV1 | undefined;
    readonly pendingModelRepair?: GoalSnapshotPendingModelRepairV1 | undefined;
    readonly steerInputs?: readonly GoalSnapshotSteerInputV1[] | undefined;
    readonly interruption?: GoalSnapshotRunInterruptionV1 | undefined;
    readonly stopReason?: GoalSnapshotStopReasonV1 | undefined;
    readonly contextEpoch: GoalSnapshotContextEpochV1;
}

/**
 * Snapshot 中当前 Run 的 Steer 受理与应用记录。
 *
 * @remarks pending 保存正文；applied 只指向 Goal.messages 中已提交的用户消息。
 * @example
 * ```ts
 * const input: GoalSnapshotSteerInputV1 = { messageId: "message-1", status: "pending", content: "补充约束" };
 * ```
 */
export type GoalSnapshotSteerInputV1 =
    | { readonly messageId: string; readonly status: "pending"; readonly content: string }
    | { readonly messageId: string; readonly status: "applied"; readonly messageIndex: number };

/**
 * Snapshot 中的用户 Interrupt 请求及取消结算状态。
 *
 * @remarks 已受理请求在重启后继续取消结算，不调用模型；未知工具效果及 Action 身份保留。
 * @example
 * ```ts
 * const interruption: GoalSnapshotRunInterruptionV1 = {
 *   requestId: "interrupt-1", status: "requested",
 * };
 * ```
 */
export interface GoalSnapshotRunInterruptionV1 {
    readonly requestId: string;
    readonly status: "requested" | "finished";
    readonly interruptedActions?: readonly GoalSnapshotToolCallActionV1[];
    readonly outcomeUnknown?: boolean;
}

/**
 * Snapshot 中的 GoalPlan Todo。
 *
 * @remarks Todo 只保存计划进度，不绑定执行 Run。
 *
 * @example
 * ```ts
 * const item: GoalSnapshotGoalPlanItemV1 = {
 *   id: "todo-1", content: "检查实现", position: 0, status: "pending",
 * };
 * ```
 */
export interface GoalSnapshotGoalPlanItemV1 {
    readonly id: string;
    readonly content: string;
    readonly position: number;
    readonly status: "pending" | "in_progress" | "completed" | "cancelled";
}

/** Snapshot 中的 GoalPlan。 */
export interface GoalSnapshotGoalPlanV1 {
    readonly revision: number;
    readonly items: readonly GoalSnapshotGoalPlanItemV1[];
}

/**
 * Snapshot 中已归档 Run 的最小历史摘要。
 *
 * @example
 * ```ts
 * const run: GoalSnapshotCompletedRunV1 = {
 *   runId: "run-1", status: "completed", stepCount: 2, committedThroughSequence: 8,
 *   messageRange: { start: 0, end: 2 },
 * };
 * ```
 */
export interface GoalSnapshotCompletedRunV1 {
    /** 已归档 Run 的稳定身份。 */
    readonly runId: string;
    /** 已归档 Run 的真实终态。 */
    readonly status: "completed" | "failed" | "cancelled";
    /** 归档时已提交的 Step 数量。 */
    readonly stepCount: number;
    /** 该 Run 的轨迹可见边界。 */
    readonly committedThroughSequence: number;
    /** 该 Run 在 Goal 消息数组中的半开区间。 */
    readonly messageRange: { readonly start: number; readonly end: number };
    /** 浏览器续写的持久化幂等收据。 */
    readonly continuation?: { readonly messageId: string; readonly content: string; readonly nextRunId: string };
}

/**
 * Snapshot 中的 AskUser 预设选项。
 *
 * @example
 * ```ts
 * const option: GoalSnapshotAskUserOptionV1 = {
 *     id: "opt-1",
 *     label: "TypeScript",
 *     description: "使用强类型开发",
 * };
 * ```
 */
export interface GoalSnapshotAskUserOptionV1 {
    readonly id: string;
    readonly label: string;
    readonly description?: string | undefined;
}

/**
 * Snapshot 中的 AskUser 结构化问题契约。
 *
 * @example
 * ```ts
 * const question: GoalSnapshotAskUserQuestionV1 = {
 *     id: "q-1",
 *     header: "语言选择",
 *     question: "请选择首选语言：",
 *     options: [{ id: "opt-1", label: "TypeScript" }, { id: "opt-2", label: "Rust" }],
 *     multiSelect: false,
 * };
 * ```
 */
export interface GoalSnapshotAskUserQuestionV1 {
    readonly id: string;
    readonly header: string;
    readonly question: string;
    readonly options: readonly GoalSnapshotAskUserOptionV1[];
    readonly multiSelect: boolean;
}

/**
 * Snapshot 中持久化等待 AskUser 问答完成的挂起交互。
 *
 * @example
 * ```ts
 * const pending: GoalSnapshotPendingInteractionAskUserV1 = {
 *     kind: "ask_user",
 *     requestId: "req-1",
 *     mode: "plan",
 *     questions: [],
 * };
 * ```
 */
export interface GoalSnapshotPendingInteractionAskUserV1 {
    readonly kind: "ask_user";
    readonly requestId: string;
    readonly mode: "plan" | "execution";
    readonly questions: readonly GoalSnapshotAskUserQuestionV1[];
    readonly routeRevision?: GoalSnapshotPendingPlanRouteRevisionApprovalV1;
}

/** Snapshot 中等待确认的完整路线修订及绑定的批准选项。 */
export interface GoalSnapshotPendingPlanRouteRevisionApprovalV1 {
    readonly baseRevision: number;
    readonly candidate: GoalSnapshotPlanRouteCandidateV1;
    readonly reason: string;
    readonly approvalRequest: string;
    readonly approvalOptionId: string;
}

/**
 * Snapshot 中持久化绑定当前 Run 与 request ID 的任务提案批准等待点。
 *
 * @example
 * ```ts
 * const pending: GoalSnapshotPendingInteractionTaskApprovalV1 = {
 *     kind: "task_approval",
 *     requestId: "proposal-1",
 *     proposal: { objective: "重构模块", completionCriteria: [] },
 *     planRouteCandidate: { stages: [{ target: "调查", acceptanceCriteria: ["定位入口"] }] },
 *     approvalRequest: "请确认任务目标",
 * };
 * ```
 */
export interface GoalSnapshotPendingInteractionTaskApprovalV1 {
    readonly kind: "task_approval";
    readonly requestId: string;
    readonly proposal: GoalSnapshotTaskV1;
    readonly planRouteCandidate: GoalSnapshotPlanRouteCandidateV1;
    readonly approvalRequest: string;
}

/**
 * Snapshot 中待审批路线的单个候选阶段。
 *
 * @example
 * ```ts
 * const stage: GoalSnapshotPlanRouteCandidateStageV1 = {
 *     target: "调查入口", acceptanceCriteria: ["定位现有实现"],
 * };
 * ```
 */
export interface GoalSnapshotPlanRouteCandidateStageV1 {
    readonly target: string;
    readonly acceptanceCriteria: readonly string[];
}

/**
 * Snapshot 中任务审批交互携带的完整候选路线；获批后 Runtime 才分配阶段身份。
 *
 * @example
 * ```ts
 * const route: GoalSnapshotPlanRouteCandidateV1 = {
 *     stages: [{ target: "调查入口", acceptanceCriteria: ["定位现有实现"] }],
 * };
 * ```
 */
export interface GoalSnapshotPlanRouteCandidateV1 {
    readonly stages: readonly GoalSnapshotPlanRouteCandidateStageV1[];
}

/** Snapshot 中的挂起用户交互联合类型。 */
export type GoalSnapshotPendingInteractionV1 =
    | GoalSnapshotPendingInteractionAskUserV1
    | GoalSnapshotPendingInteractionTaskApprovalV1;

/** Snapshot 中的工作流状态，仅保留统一 executing 阶段。 */
export type GoalSnapshotWorkflowV1 = {
    readonly phase: "executing";
};

/**
 * Snapshot v1 中持久化的模型选择与执行协议。
 *
 * @remarks
 * 保存重建 Binding 所需的非敏感 API 家族、容量和模型能力；凭据与 Base URL 不属于快照，本字段扩展不改变 schemaVersion。
 *
 * @example
 * ```ts
 * const selection: GoalSnapshotModelSelectionV1 = {
 *   provider: "opencode-go", modelId: "minimax-m3.1-flash-free",
 *   executionApi: "openai-completions", contextWindowTokens: 1_000_000,
 *   maxOutputTokens: 524_288, reasoning: true, vision: false, supportsRequiredToolChoice: true,
 *   inputEstimator: { kind: "character-v1" },
 * };
 * ```
 */
export interface GoalSnapshotModelSelectionV1 {
    readonly provider: string;
    readonly profileId?: string | undefined;
    readonly modelId: string;
    readonly executionApi?: "openai-completions" | undefined;
    readonly structuredOutputMode?: "strict" | "prompt_only" | "two_stage" | undefined;
    readonly contextWindowTokens?: number | undefined;
    readonly maxOutputTokens?: number | undefined;
    /** 模型是否支持推理内容。 */
    readonly reasoning?: boolean | undefined;
    /** 模型是否接受图像等视觉输入。 */
    readonly vision?: boolean | undefined;
    /** Chat Completions 路径是否接受 `tool_choice: required`。 */
    readonly supportsRequiredToolChoice?: boolean | undefined;
    readonly inputEstimator:
        | { readonly kind: "character-v1" }
        | { readonly kind: "token-encoding"; readonly encoding: "cl100k_base" | "o200k_base" };
}

/**
 * Snapshot 中的 Goal 状态。
 *
 * @remarks 模式和已批准任务属于 Run；GoalPlan 与当前 Run 模式独立保存。
 *
 * @example
 * ```ts
 * const state: GoalSnapshotStateV1 = {
 *   workflow: { phase: "executing" }, messages: [],
 *   run, modelSelection, completedRuns: [],
 * };
 * ```
 */
export interface GoalSnapshotStateV1 {
    readonly nextRunMode?: "plan" | undefined;
    /** Goal 级单调提交修订；省略等同 0。 */
    readonly commitRevision?: number | undefined;
    /** 已受理输入账本；省略表示尚未受理输入。 */
    readonly inputLedger?: readonly GoalSnapshotSessionInputV1[] | undefined;
    /** 待处理普通消息队列；省略表示空队列。 */
    readonly messageQueue?: GoalSnapshotMessageQueueV1 | undefined;
    readonly workflow: GoalSnapshotWorkflowV1;
    readonly messages: readonly GoalSnapshotMessageV1[];
    readonly run: GoalSnapshotRunStateV1;
    readonly modelSelection: GoalSnapshotModelSelectionV1;
    readonly goalPlan?: GoalSnapshotGoalPlanV1 | undefined;
    readonly completedRuns: readonly GoalSnapshotCompletedRunV1[];
}

/**
 * Snapshot 中一条已受理输入的账本记录。
 *
 * @remarks 记录不复制正文；正文只保存在队列项、Run 内 Steer 记录或 Goal 消息中。
 *
 * @example
 * ```ts
 * const record: GoalSnapshotSessionInputV1 = {
 *   inputId: "input-1", kind: "message", digest: "sha256:abc",
 *   sequence: 1, status: "pending", admittedAtRevision: 1,
 * };
 * ```
 */
export interface GoalSnapshotSessionInputV1 {
    readonly inputId: string;
    readonly kind: "message" | "steer" | "interrupt" | "respond" | "resume" | "queue_control";
    readonly digest: string;
    readonly sequence: number;
    readonly status: "pending" | "applied" | "cleared";
    readonly admittedAtRevision: number;
    readonly targetRunId?: string | undefined;
    readonly appliedRunId?: string | undefined;
    readonly messageIndex?: number | undefined;
}

/**
 * Snapshot 中队列内一条尚未应用的普通消息。
 *
 * @example
 * ```ts
 * const item: GoalSnapshotSessionQueueItemV1 = { inputId: "input-2", content: "继续", sequence: 2 };
 * ```
 */
export interface GoalSnapshotSessionQueueItemV1 {
    readonly inputId: string;
    readonly content: string;
    readonly sequence: number;
}

/**
 * Snapshot 中的待处理消息队列、修订与暂停状态。
 *
 * @example
 * ```ts
 * const queue: GoalSnapshotMessageQueueV1 = { revision: 1, items: [] };
 * ```
 */
export interface GoalSnapshotMessageQueueV1 {
    readonly revision: number;
    readonly items: readonly GoalSnapshotSessionQueueItemV1[];
    readonly pause?: {
        readonly reason: "run_failed" | "user_interrupt";
        readonly runId: string;
    } | undefined;
}

/** 当前唯一支持的 Goal Snapshot DTO。 */
export interface GoalSnapshotV1 {
    readonly id: string;
    readonly metadata: GoalSnapshotMetadataV1;
    readonly definition: GoalSnapshotDefinitionV1;
    readonly state: GoalSnapshotStateV1;
}

type SnapshotRulePath = readonly (string | number | "*")[];

interface SnapshotIssue {
    readonly message: string;
    readonly path: readonly PropertyKey[];
}

interface SnapshotStringRule {
    readonly kind: "string";
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: RegExp;
}

interface SnapshotIntegerRule {
    readonly kind: "integer";
    readonly min?: number;
    readonly max?: number;
    readonly safe?: boolean;
}

interface SnapshotArrayRule {
    readonly kind: "array";
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly items?: "non-empty-string" | "string" | "positive-integer" | "non-negative-integer";
    readonly itemMaxLength?: number;
}

interface SnapshotRule {
    readonly path: SnapshotRulePath;
    readonly rule: SnapshotStringRule | SnapshotIntegerRule | SnapshotArrayRule;
}

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

function stringRule(path: SnapshotRulePath, options: Omit<SnapshotStringRule, "kind"> = {}): SnapshotRule {
    return { path, rule: { kind: "string", ...options } };
}

function integerRule(
    path: SnapshotRulePath,
    options: Omit<SnapshotIntegerRule, "kind"> = {},
): SnapshotRule {
    return { path, rule: { kind: "integer", ...options } };
}

function arrayRule(
    path: SnapshotRulePath,
    options: Omit<SnapshotArrayRule, "kind"> = {},
): SnapshotRule {
    return { path, rule: { kind: "array", ...options } };
}

/**
 * Snapshot 字段级约束。
 *
 * @remarks
 * 结构、联合和封闭对象由生成绑定校验；本表只保留 TS 类型无法表达的非空、
 * 数值范围、数组长度、元素约束和摘要格式。路径中的 `*` 表示数组元素。
 */
const snapshotRules: readonly SnapshotRule[] = [
    stringRule(["id"], { minLength: 1 }),
    stringRule(["definition", "profile", "id"], { minLength: 1 }),
    stringRule(["definition", "profile", "name"], { minLength: 1 }),
    stringRule(["definition", "profile", "description"], { minLength: 1 }),
    arrayRule(["definition", "profile", "toolIds"], { items: "non-empty-string" }),
    integerRule(["definition", "executionPolicy", "maxSteps"], { min: 0 }),
    stringRule(["state", "messages", "*", "messageId"], { minLength: 1 }),
    stringRule(["state", "messages", "*", "runId"], { minLength: 1 }),
    stringRule(["state", "messages", "*", "assistant", "profileId"], { minLength: 1 }),
    integerRule(["state", "messages", "*", "position", "afterSequence"], { min: 0 }),
    integerRule(["state", "messages", "*", "position", "order"], { min: 0 }),
    stringRule(["state", "messages", "*", "source", "goalId"], { minLength: 1 }),
    stringRule(["state", "messages", "*", "source", "inputId"], { minLength: 1 }),
    stringRule(["state", "messages", "*", "source", "requestId"], { minLength: 1 }),
    stringRule(["state", "messages", "*", "source", "modelCallId"], { minLength: 1 }),
    stringRule(["state", "messages", "*", "source", "executionUnitId"], { minLength: 1 }),
    stringRule(["state", "messages", "*", "source", "candidateId"], { minLength: 1 }),
    stringRule(["state", "messages", "*", "source", "actionId"], { minLength: 1 }),
    stringRule(["state", "messages", "*", "source", "noticeId"], { minLength: 1 }),
    integerRule(["state", "messages", "*", "source", "blockIndex"], { min: 0 }),
    stringRule(["state", "run", "id"], { minLength: 1 }),
    arrayRule(["state", "run", "exposedToolIds"], { items: "non-empty-string" }),
    integerRule(["state", "run", "stepCount"], { min: 0 }),
    integerRule(["state", "run", "committedThroughSequence"], { min: 0 }),
    stringRule(["state", "run", "memoryRevision", "eventId"], { minLength: 1 }),
    integerRule(["state", "run", "memoryRevision", "sequence"], { min: 1 }),
    stringRule(["state", "run", "approvedTask", "objective"], { minLength: 1 }),
    stringRule(["state", "run", "approvedTask", "completionCriteria", "*", "text"], { minLength: 1 }),
    stringRule(["state", "run", "approvedTask", "completionCriteria", "*", "acceptance", "expectToolId"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "action", "actionId"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "action", "toolId"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "action", "observation", "summary"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "action", "observation", "code"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "action", "observation", "message"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "action", "observation", "reason"], { minLength: 1 }),
    stringRule(["state", "run", "pendingAction", "action", "actionId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingAction", "action", "toolId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingAction", "executionUnitId"], { minLength: 1 }),
    integerRule(["state", "run", "pendingAction", "attemptsStarted"], { min: 1, max: 3 }),
    stringRule(["state", "run", "pendingAction", "grantId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingAction", "approvalInputId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingAction", "recoveryRef"], { minLength: 1 }),
    stringRule(["state", "run", "pendingAction", "effectiveSandboxScope", "extraFiles", "*", "canonicalPath"], { minLength: 1 }),
    stringRule(["state", "run", "pendingAction", "executionVersion", "original", "actionId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingAction", "executionVersion", "original", "toolId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingAction", "executionVersion", "reviewRef"], { minLength: 1 }),
    stringRule(["state", "run", "pendingActionBatch", "batchId"], { minLength: 1 }),
    arrayRule(["state", "run", "pendingActionBatch", "remaining"], { minLength: 1 }),
    stringRule(["state", "run", "pendingActionBatch", "remaining", "*", "actionId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingActionBatch", "remaining", "*", "toolId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingProgram", "programId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingProgram", "action", "actionId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingProgram", "action", "toolId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingProgram", "executionUnitId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingProgram", "codeHash"], { pattern: SHA256_HEX }),
    stringRule(["state", "run", "pendingProgram", "workerHash"], { pattern: SHA256_HEX }),
    stringRule(["state", "run", "pendingProgram", "nodeVersion"], { minLength: 1 }),
    integerRule(["state", "run", "pendingProgram", "fixedTime"], { min: 0 }),
    integerRule(["state", "run", "pendingProgram", "seed"], { min: 0 }),
    integerRule(["state", "run", "pendingProgram", "nextCallIndex"], { min: 0, max: 128 }),
    integerRule(["state", "run", "pendingProgram", "resultBytes"], { min: 0, max: 256 * 1024 * 1024 }),
    stringRule(["state", "run", "pendingProgram", "pendingStop", "code"], { minLength: 1, maxLength: 80 }),
    stringRule(["state", "run", "pendingProgram", "pendingStop", "message"], { minLength: 1, maxLength: 240 }),
    stringRule(["state", "run", "pendingThink", "goalId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingThink", "runId"], { minLength: 1 }),
    integerRule(["state", "run", "pendingThink", "stepOrdinal"], { min: 1 }),
    stringRule(["state", "run", "pendingThink", "executionUnitId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingThink", "inputBoundary"], { pattern: SHA256_DIGEST }),
    stringRule(["state", "run", "pendingThink", "latestThinkEventId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingModelRepair", "goalId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingModelRepair", "runId"], { minLength: 1 }),
    integerRule(["state", "run", "pendingModelRepair", "stepOrdinal"], { min: 1 }),
    stringRule(["state", "run", "pendingModelRepair", "executionUnitId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingModelRepair", "inputBoundary"], { pattern: SHA256_DIGEST }),
    integerRule(["state", "run", "pendingModelRepair", "attemptsStarted"], { min: 0, max: 3 }),
    integerRule(["state", "run", "pendingModelRepair", "continuationsStarted"], { min: 0, max: 3 }),
    stringRule(["state", "run", "pendingModelRepair", "latestAttemptEventId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingModelRepair", "latestFeedbackEventId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingModelRepair", "thinkRequestId"], { minLength: 1 }),
    stringRule(["state", "run", "steerInputs", "*", "messageId"], { minLength: 1 }),
    stringRule(["state", "run", "steerInputs", "*", "content"], { minLength: 1, maxLength: 64_000 }),
    integerRule(["state", "run", "steerInputs", "*", "messageIndex"], { min: 0 }),
    stringRule(["state", "run", "interruption", "requestId"], { minLength: 1 }),
    stringRule(["state", "run", "interruption", "interruptedActions", "*", "actionId"], { minLength: 1 }),
    stringRule(["state", "run", "interruption", "interruptedActions", "*", "toolId"], { minLength: 1 }),
    stringRule(["state", "run", "stopReason", "message"], { minLength: 1 }),
    stringRule(["state", "run", "currentStage", "stageId"], { minLength: 1 }),
    integerRule(["state", "run", "currentStage", "revision"], { min: 1 }),
    stringRule(["state", "run", "currentStage", "target"], { minLength: 1 }),
    arrayRule(["state", "run", "currentStage", "acceptanceCriteria"], { minLength: 1, items: "non-empty-string" }),
    stringRule(["state", "run", "currentStage", "previousStageResultRef", "stageId"], { minLength: 1 }),
    integerRule(["state", "run", "currentStage", "previousStageResultRef", "sequence"], { min: 0 }),
    stringRule(["state", "run", "currentStage", "latestReviewRejection", "feedback"], { minLength: 1 }),
    integerRule(["state", "run", "currentStage", "latestReviewRejection", "rejectedAtSequence"], { min: 0 }),
    integerRule(["state", "run", "currentStage", "acceptedSequence"], { min: 0 }),
    integerRule(["state", "run", "planRoute", "revision"], { min: 1 }),
    stringRule(["state", "run", "planRoute", "revisionReason"], { minLength: 1 }),
    integerRule(["state", "run", "planRoute", "nextStageIndex"], { min: 0 }),
    integerRule(["state", "run", "planRoute", "nextStageOrdinal"], { min: 1 }),
    arrayRule(["state", "run", "planRoute", "stages"], { minLength: 1 }),
    stringRule(["state", "run", "planRoute", "stages", "*", "stageId"], { minLength: 1 }),
    integerRule(["state", "run", "planRoute", "stages", "*", "revision"], { min: 1 }),
    stringRule(["state", "run", "planRoute", "stages", "*", "target"], { minLength: 1 }),
    arrayRule(["state", "run", "planRoute", "stages", "*", "acceptanceCriteria"], { minLength: 1, items: "non-empty-string" }),
    integerRule(["state", "run", "planRoute", "stages", "*", "acceptedSequence"], { min: 0 }),
    stringRule(["state", "run", "pendingInteraction", "requestId"], { minLength: 1 }),
    arrayRule(["state", "run", "pendingInteraction", "questions"], { minLength: 1, maxLength: 3 }),
    stringRule(["state", "run", "pendingInteraction", "questions", "*", "id"], { minLength: 1 }),
    stringRule(["state", "run", "pendingInteraction", "questions", "*", "header"], { minLength: 1 }),
    stringRule(["state", "run", "pendingInteraction", "questions", "*", "question"], { minLength: 1 }),
    arrayRule(["state", "run", "pendingInteraction", "questions", "*", "options"], { minLength: 2, maxLength: 3 }),
    stringRule(["state", "run", "pendingInteraction", "questions", "*", "options", "*", "id"], { minLength: 1 }),
    stringRule(["state", "run", "pendingInteraction", "questions", "*", "options", "*", "label"], { minLength: 1 }),
    stringRule(["state", "run", "pendingInteraction", "questions", "*", "options", "*", "description"], { minLength: 1 }),
    integerRule(["state", "run", "pendingInteraction", "routeRevision", "baseRevision"], { min: 1 }),
    arrayRule(["state", "run", "pendingInteraction", "routeRevision", "candidate", "stages"], { minLength: 1 }),
    stringRule(["state", "run", "pendingInteraction", "routeRevision", "candidate", "stages", "*", "target"], { minLength: 1 }),
    arrayRule(["state", "run", "pendingInteraction", "routeRevision", "candidate", "stages", "*", "acceptanceCriteria"], { minLength: 1, items: "non-empty-string" }),
    stringRule(["state", "run", "pendingInteraction", "routeRevision", "reason"], { minLength: 1 }),
    stringRule(["state", "run", "pendingInteraction", "routeRevision", "approvalRequest"], { minLength: 1 }),
    stringRule(["state", "run", "pendingInteraction", "routeRevision", "approvalOptionId"], { minLength: 1 }),
    stringRule(["state", "run", "pendingInteraction", "proposal", "objective"], { minLength: 1 }),
    stringRule(["state", "run", "pendingInteraction", "proposal", "completionCriteria", "*", "text"], { minLength: 1 }),
    stringRule(["state", "run", "pendingInteraction", "proposal", "completionCriteria", "*", "acceptance", "expectToolId"], { minLength: 1 }),
    arrayRule(["state", "run", "pendingInteraction", "planRouteCandidate", "stages"], { minLength: 1 }),
    stringRule(["state", "run", "pendingInteraction", "planRouteCandidate", "stages", "*", "target"], { minLength: 1 }),
    arrayRule(["state", "run", "pendingInteraction", "planRouteCandidate", "stages", "*", "acceptanceCriteria"], { minLength: 1, items: "non-empty-string" }),
    stringRule(["state", "run", "pendingInteraction", "approvalRequest"], { minLength: 1 }),
    integerRule(["state", "run", "contextEpoch", "number"], { min: 0 }),
    integerRule(["state", "run", "contextEpoch", "conversationStartIndex"], { min: 0 }),
    integerRule(["state", "run", "contextEpoch", "openedAtSequence"], { min: 0 }),
    integerRule(["state", "commitRevision"], { min: 0 }),
    stringRule(["state", "modelSelection", "provider"], { minLength: 1 }),
    stringRule(["state", "modelSelection", "profileId"], { minLength: 1 }),
    stringRule(["state", "modelSelection", "modelId"], { minLength: 1 }),
    integerRule(["state", "modelSelection", "contextWindowTokens"], { min: 1 }),
    integerRule(["state", "modelSelection", "maxOutputTokens"], { min: 1 }),
    integerRule(["state", "goalPlan", "revision"], { min: 0 }),
    stringRule(["state", "goalPlan", "items", "*", "id"], { minLength: 1 }),
    stringRule(["state", "goalPlan", "items", "*", "content"], { minLength: 1 }),
    integerRule(["state", "goalPlan", "items", "*", "position"], { min: 0 }),
    stringRule(["state", "completedRuns", "*", "runId"], { minLength: 1 }),
    integerRule(["state", "completedRuns", "*", "stepCount"], { min: 0 }),
    integerRule(["state", "completedRuns", "*", "committedThroughSequence"], { min: 0 }),
    integerRule(["state", "completedRuns", "*", "messageRange", "start"], { min: 0 }),
    integerRule(["state", "completedRuns", "*", "messageRange", "end"], { min: 0 }),
    stringRule(["state", "completedRuns", "*", "continuation", "messageId"], { minLength: 1 }),
    stringRule(["state", "completedRuns", "*", "continuation", "content"], { minLength: 1 }),
    stringRule(["state", "completedRuns", "*", "continuation", "nextRunId"], { minLength: 1 }),
    stringRule(["state", "inputLedger", "*", "inputId"], { minLength: 1 }),
    stringRule(["state", "inputLedger", "*", "digest"], { pattern: SHA256_DIGEST }),
    integerRule(["state", "inputLedger", "*", "sequence"], { min: 1 }),
    integerRule(["state", "inputLedger", "*", "admittedAtRevision"], { min: 0 }),
    stringRule(["state", "inputLedger", "*", "targetRunId"], { minLength: 1 }),
    stringRule(["state", "inputLedger", "*", "appliedRunId"], { minLength: 1 }),
    integerRule(["state", "inputLedger", "*", "messageIndex"], { min: 0 }),
    integerRule(["state", "messageQueue", "revision"], { min: 0 }),
    stringRule(["state", "messageQueue", "items", "*", "inputId"], { minLength: 1 }),
    stringRule(["state", "messageQueue", "items", "*", "content"], { minLength: 1 }),
    integerRule(["state", "messageQueue", "items", "*", "sequence"], { min: 1 }),
    stringRule(["state", "messageQueue", "pause", "runId"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "summary"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "reason"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "error"], { minLength: 1 }),
    integerRule(["state", "run", "lastStep", "result", "criterionIndex"], { min: 0 }),
    integerRule(["state", "run", "lastStep", "result", "completionEvidence", "*", "criterionIndex"], { min: 0 }),
    arrayRule(["state", "run", "lastStep", "result", "evidenceSequences"], { items: "non-negative-integer" }),
    arrayRule(["state", "run", "lastStep", "result", "completionEvidence", "*", "evidenceSequences"], { items: "positive-integer" }),
    stringRule(["state", "run", "lastStep", "result", "question"], { minLength: 1, maxLength: 1024 }),
    stringRule(["state", "run", "lastStep", "result", "query"], { minLength: 1, maxLength: 512 }),
    stringRule(["state", "run", "lastStep", "result", "cursor"], { minLength: 1, maxLength: 512 }),
    stringRule(["state", "run", "lastStep", "result", "category"], { minLength: 1, maxLength: 64 }),
    stringRule(["state", "run", "lastStep", "result", "sourceRef"], { minLength: 1, maxLength: 512 }),
    integerRule(["state", "run", "lastStep", "result", "limit"], { min: 1, max: 50 }),
    integerRule(["state", "run", "lastStep", "result", "offset"], { min: 0 }),
    arrayRule(["state", "run", "lastStep", "result", "filters", "eventTypes"], { maxLength: 16, items: "non-empty-string" }),
    arrayRule(["state", "run", "lastStep", "result", "filters", "toolIds"], { maxLength: 16, items: "non-empty-string" }),
    arrayRule(["state", "run", "lastStep", "result", "filters", "actionIds"], { maxLength: 16, items: "non-empty-string" }),
    arrayRule(["state", "run", "lastStep", "result", "filters", "stepIndexes"], { maxLength: 16, items: "non-negative-integer" }),
    arrayRule(["state", "run", "lastStep", "result", "filters", "paths"], { maxLength: 16, items: "non-empty-string" }),
    arrayRule(["state", "run", "lastStep", "result", "filters", "errorCodes"], { maxLength: 16, items: "non-empty-string" }),
    arrayRule(["state", "run", "lastStep", "result", "filters", "objectIds"], { maxLength: 16, items: "non-empty-string" }),
    integerRule(["state", "run", "lastStep", "result", "filters", "sequenceRange", "from"], { min: 0, safe: true }),
    integerRule(["state", "run", "lastStep", "result", "filters", "sequenceRange", "to"], { min: 0, safe: true }),
    integerRule(["state", "run", "lastStep", "result", "baseRevision"], { min: 0 }),
    arrayRule(["state", "run", "lastStep", "result", "operations"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "operations", "*", "content"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "operations", "*", "id"], { minLength: 1 }),
    integerRule(["state", "run", "lastStep", "result", "operations", "*", "position"], { min: 0 }),
    arrayRule(["state", "run", "lastStep", "result", "operations", "*", "evidenceSequences"], { items: "non-negative-integer" }),
    stringRule(["state", "run", "lastStep", "result", "target"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "stageId"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "reason"], { minLength: 1 }),
    arrayRule(["state", "run", "lastStep", "result", "acceptanceCriteria"], { minLength: 1, items: "non-empty-string" }),
    stringRule(["state", "run", "lastStep", "result", "approvalRequest"], { minLength: 1 }),
    arrayRule(["state", "run", "lastStep", "result", "route", "stages"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "route", "stages", "*", "target"], { minLength: 1 }),
    arrayRule(["state", "run", "lastStep", "result", "route", "stages", "*", "acceptanceCriteria"], { minLength: 1, items: "non-empty-string" }),
    stringRule(["state", "run", "lastStep", "result", "memoryPatch", "operations", "*", "fact", "subject"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "memoryPatch", "operations", "*", "fact", "predicate"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "memoryPatch", "operations", "*", "fact", "id"], { minLength: 1 }),
    arrayRule(["state", "run", "lastStep", "result", "memoryPatch", "operations", "*", "fact", "evidenceSequences"], { items: "positive-integer" }),
    stringRule(["state", "run", "lastStep", "result", "memoryPatch", "operations", "*", "hypothesis", "id"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "memoryPatch", "operations", "*", "hypothesis", "statement"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "memoryPatch", "operations", "*", "blocker", "id"], { minLength: 1 }),
    stringRule(["state", "run", "lastStep", "result", "memoryPatch", "operations", "*", "blocker", "description"], { minLength: 1 }),
];

function collectSnapshotRuleIssues(goal: GoalSnapshotV1): SnapshotIssue[] {
    const issues: SnapshotIssue[] = [];
    for (const rule of snapshotRules) {
        visitSnapshotRule(goal, rule.path, 0, rule.rule, [], issues);
    }
    return issues;
}

function visitSnapshotRule(
    value: unknown,
    path: SnapshotRulePath,
    index: number,
    rule: SnapshotStringRule | SnapshotIntegerRule | SnapshotArrayRule,
    actualPath: PropertyKey[],
    issues: SnapshotIssue[],
): void {
    if (index === path.length) {
        applySnapshotRule(value, rule, actualPath, issues);
        return;
    }

    const segment = path[index];
    if (segment === undefined) return;
    if (segment === "*") {
        if (!Array.isArray(value)) return;
        for (const [itemIndex, item] of value.entries()) {
            visitSnapshotRule(item, path, index + 1, rule, [...actualPath, itemIndex], issues);
        }
        return;
    }

    if (value === null || typeof value !== "object") return;
    visitSnapshotRule(
        (value as Record<string | number, unknown>)[segment],
        path,
        index + 1,
        rule,
        [...actualPath, segment],
        issues,
    );
}

function applySnapshotRule(
    value: unknown,
    rule: SnapshotStringRule | SnapshotIntegerRule | SnapshotArrayRule,
    path: readonly PropertyKey[],
    issues: SnapshotIssue[],
): void {
    if (value === undefined) return;

    if (rule.kind === "string") {
        if (typeof value !== "string") return;
        if (rule.minLength !== undefined && value.length < rule.minLength) {
            issues.push({ message: "string is shorter than its minimum length", path });
        }
        if (rule.maxLength !== undefined && value.length > rule.maxLength) {
            issues.push({ message: "string exceeds its maximum length", path });
        }
        if (rule.pattern !== undefined && !rule.pattern.test(value)) {
            issues.push({ message: "string does not match its required pattern", path });
        }
        return;
    }

    if (rule.kind === "integer") {
        if (typeof value !== "number" || !Number.isInteger(value)) return;
        if (rule.safe === true && !Number.isSafeInteger(value)) {
            issues.push({ message: "integer exceeds the safe range", path });
        }
        if (rule.min !== undefined && value < rule.min) {
            issues.push({ message: "integer is below its minimum", path });
        }
        if (rule.max !== undefined && value > rule.max) {
            issues.push({ message: "integer exceeds its maximum", path });
        }
        return;
    }

    if (!Array.isArray(value)) return;
    if (rule.minLength !== undefined && value.length < rule.minLength) {
        issues.push({ message: "array is shorter than its minimum length", path });
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        issues.push({ message: "array exceeds its maximum length", path });
    }
    if (rule.items === undefined) return;

    for (const [itemIndex, item] of value.entries()) {
        const itemPath = [...path, itemIndex];
        if (rule.items === "string") {
            if (typeof item !== "string") {
                issues.push({ message: "array item must be a string", path: itemPath });
            }
            continue;
        }
        if (rule.items === "non-empty-string") {
            if (typeof item !== "string" || item.length === 0) {
                issues.push({ message: "array item must be a non-empty string", path: itemPath });
            } else if (rule.itemMaxLength !== undefined && item.length > rule.itemMaxLength) {
                issues.push({ message: "array item exceeds its maximum length", path: itemPath });
            }
            continue;
        }
        if (typeof item !== "number" || !Number.isInteger(item)) {
            issues.push({ message: "array item must be an integer", path: itemPath });
            continue;
        }
        if (rule.items === "positive-integer" && item < 1) {
            issues.push({ message: "array item must be a positive integer", path: itemPath });
        }
        if (rule.items === "non-negative-integer" && item < 0) {
            issues.push({ message: "array item must be a non-negative integer", path: itemPath });
        }
    }
}

interface SnapshotInvariantContext {
    addIssue(issue: { readonly message: string; readonly path: readonly PropertyKey[] }): void;
}

function addInvariantIssue(
    context: SnapshotInvariantContext,
    message: string,
    path: readonly PropertyKey[] = [],
): void {
    context.addIssue({ message, path });
}

/**
 * 计算持久化消息来源的稳定比较键。
 *
 * @remarks
 * 键只由来源自身的判别字段组成，不包含正文或数组位置；同文不同来源因此得到
 * 不同键。本文件不得依赖 Runtime 包，故在持久化形态上独立实现同一规则。
 *
 * @param source - 持久化消息来源。
 * @returns 该来源在同一 Goal 内的稳定比较键。
 * @example
 * ```ts
 * const key = snapshotMessageSourceKey({ kind: "user_input", inputId: "input-1" });
 * ```
 */
function snapshotMessageSourceKey(source: GoalSnapshotMessageSourceV1): string {
    switch (source.kind) {
        case "goal_intent":
            return `goal_intent:${source.goalId}`;
        case "user_input":
            return `user_input:${source.inputId}`;
        case "interaction_response":
            return `interaction_response:${source.requestId}`;
        case "model_text":
            return `model_text:${source.modelCallId}:${source.blockIndex}`;
        case "stage_output":
            return `stage_output:${source.executionUnitId}:${source.blockIndex}`;
        case "completion_candidate":
            return `completion_candidate:${source.candidateId}`;
        case "host_execution":
            return `host_execution:${source.actionId}`;
        case "runtime_notice":
            return `runtime_notice:${source.noticeId}`;
    }
}

function validateSnapshotInvariants(
    goal: GoalSnapshotV1,
    context: SnapshotInvariantContext,
): void {
    const { run } = goal.state;
    const pendingTaskApproval = run.pendingInteraction?.kind === "task_approval";
    if (run.mode === "normal" && run.approvedTask !== undefined) {
        addInvariantIssue(context, "normal Run cannot contain an approved task", ["state", "run", "approvedTask"]);
    }
    if (run.mode === "normal" && run.planRoute !== undefined) {
        addInvariantIssue(context, "normal Run cannot contain a full Plan route", ["state", "run", "planRoute"]);
    }
    if (run.planRoute !== undefined) {
        const route = run.planRoute;
        if (run.approvedTask === undefined) {
            addInvariantIssue(context, "Plan route requires an approved task", ["state", "run", "planRoute"]);
        }
        if (route.nextStageIndex > route.stages.length) {
            addInvariantIssue(context, "Plan route cursor exceeds its stage count", ["state", "run", "planRoute", "nextStageIndex"]);
        }
        const stageIds = new Set<string>();
        let maximumOrdinal = 0;
        for (const [index, stage] of route.stages.entries()) {
            if (stageIds.has(stage.stageId)) {
                addInvariantIssue(context, "Plan route stage IDs must be unique", ["state", "run", "planRoute", "stages", index, "stageId"]);
            }
            stageIds.add(stage.stageId);
            const ordinal = /^stage-(\d+)$/.exec(stage.stageId)?.[1];
            if (ordinal !== undefined) maximumOrdinal = Math.max(maximumOrdinal, Number(ordinal));
            const expectedStatus = index < route.nextStageIndex
                ? "accepted"
                : index === route.nextStageIndex && stage.status === "executing"
                    ? "executing"
                    : "pending";
            if (stage.status !== expectedStatus) {
                addInvariantIssue(context, "Plan route stage status does not match its order and cursor", ["state", "run", "planRoute", "stages", index, "status"]);
            }
            if ((stage.status === "accepted") !== (stage.acceptedSequence !== undefined)) {
                addInvariantIssue(context, "Only accepted Plan route stages may contain acceptedSequence", ["state", "run", "planRoute", "stages", index, "acceptedSequence"]);
            }
            if (stage.acceptedSequence !== undefined && stage.acceptedSequence > run.committedThroughSequence) {
                addInvariantIssue(context, "Plan route acceptedSequence exceeds the committed Snapshot boundary", ["state", "run", "planRoute", "stages", index, "acceptedSequence"]);
            }
        }
        if (route.nextStageOrdinal <= maximumOrdinal) {
            addInvariantIssue(context, "Plan route nextStageOrdinal must exceed assigned stage ordinals", ["state", "run", "planRoute", "nextStageOrdinal"]);
        }
        if (route.revision > 1 && route.revisionReason === undefined) {
            addInvariantIssue(context, "Revised Plan route requires its persisted reason", ["state", "run", "planRoute", "revisionReason"]);
        }
        if (run.currentStage !== undefined) {
            const routeStageIndex = run.currentStage.status === "executing"
                ? route.nextStageIndex
                : route.nextStageIndex - 1;
            const routeStage = route.stages[routeStageIndex];
            if (routeStage === undefined
                || routeStage.stageId !== run.currentStage.stageId
                || routeStage.revision !== run.currentStage.revision
                || routeStage.status !== run.currentStage.status
                || routeStage.target !== run.currentStage.target
                || routeStage.acceptanceCriteria.length !== run.currentStage.acceptanceCriteria.length
                || routeStage.acceptanceCriteria.some((criterion, index) => criterion !== run.currentStage?.acceptanceCriteria[index])
                || (routeStage.status === "accepted" && routeStage.acceptedSequence !== run.currentStage.acceptedSequence)) {
                addInvariantIssue(context, "Current RunStage must match the active or latest accepted Plan route stage", ["state", "run", "currentStage"]);
            }
        }
    }
    if (pendingTaskApproval && run.mode !== "plan") {
        addInvariantIssue(context, "task approval requires a Plan Run", ["state", "run", "pendingInteraction"]);
    }
    if (pendingTaskApproval && run.approvedTask !== undefined) {
        addInvariantIssue(context, "pending task approval cannot coexist with an approved task", ["state", "run"]);
    }
    if (goal.state.goalPlan !== undefined) {
        const ids = new Set<string>();
        let inProgress = 0;
        for (const [index, item] of goal.state.goalPlan.items.entries()) {
            if (ids.has(item.id)) addInvariantIssue(context, "GoalPlan contains duplicate Todo ID", ["state", "goalPlan", "items", index, "id"]);
            ids.add(item.id);
            if (item.position !== index) addInvariantIssue(context, "GoalPlan positions must be contiguous", ["state", "goalPlan", "items", index, "position"]);
            if (item.status === "in_progress") inProgress += 1;
        }
        if (inProgress > 1) addInvariantIssue(context, "GoalPlan allows at most one in_progress Todo", ["state", "goalPlan", "items"]);
    }
    let previousRunEnd = 0;
    for (const [index, history] of goal.state.completedRuns.entries()) {
        if (history.runId === run.id) addInvariantIssue(context, "completedRuns cannot contain current Run", ["state", "completedRuns", index, "runId"]);
        if (history.messageRange.end < history.messageRange.start || history.messageRange.start < previousRunEnd) {
            addInvariantIssue(context, "completedRuns message ranges must be ordered and non-overlapping", ["state", "completedRuns", index, "messageRange"]);
        }
        previousRunEnd = Math.max(previousRunEnd, history.messageRange.end);
    }
    const messageRunBoundaries = new Map<string, number>([
        ...goal.state.completedRuns.map((history) => [history.runId, history.committedThroughSequence] as const),
        [run.id, run.committedThroughSequence],
    ]);
    const lastMessageSequenceByRun = new Map<string, number>();
    const nextMessageOrderByAnchor = new Map<string, number>();
    for (const [index, message] of goal.state.messages.entries()) {
        const boundary = messageRunBoundaries.get(message.runId);
        if (boundary === undefined) {
            addInvariantIssue(context, "Goal message must reference the current or a completed Run", ["state", "messages", index, "runId"]);
            continue;
        }
        if (message.position.afterSequence > boundary) {
            addInvariantIssue(context, "Goal message position exceeds its Run committed boundary", ["state", "messages", index, "position", "afterSequence"]);
        }
        const previousSequence = lastMessageSequenceByRun.get(message.runId);
        if (previousSequence !== undefined && message.position.afterSequence < previousSequence) {
            addInvariantIssue(context, "Goal message positions must follow Snapshot order within each Run", ["state", "messages", index, "position", "afterSequence"]);
        }
        lastMessageSequenceByRun.set(message.runId, Math.max(previousSequence ?? 0, message.position.afterSequence));
        const anchor = `${message.runId}\u0000${message.position.afterSequence}`;
        const expectedOrder = nextMessageOrderByAnchor.get(anchor) ?? 0;
        if (message.position.order !== expectedOrder) {
            addInvariantIssue(context, "Goal message order must be contiguous within a Run fact anchor", ["state", "messages", index, "position", "order"]);
        }
        nextMessageOrderByAnchor.set(anchor, expectedOrder + 1);
    }
    const steerIds = new Set<string>();
    for (const [index, steer] of (run.steerInputs ?? []).entries()) {
        if (steerIds.has(steer.messageId)) {
            addInvariantIssue(context, "Steer message IDs must be unique within the Run", ["state", "run", "steerInputs", index, "messageId"]);
        }
        steerIds.add(steer.messageId);
        if (steer.status === "applied"
            && (steer.messageIndex >= goal.state.messages.length
                || goal.state.messages[steer.messageIndex]?.role !== "user")) {
            addInvariantIssue(context, "Applied Steer must point to a real user message", ["state", "run", "steerInputs", index, "messageIndex"]);
        }
    }
    const inputIds = new Set<string>();
    let previousInputSequence = 0;
    for (const [index, record] of (goal.state.inputLedger ?? []).entries()) {
        if (inputIds.has(record.inputId)) {
            addInvariantIssue(context, "session input IDs must be unique within the Goal", ["state", "inputLedger", index, "inputId"]);
        }
        inputIds.add(record.inputId);
        if (record.sequence <= previousInputSequence) {
            addInvariantIssue(context, "session input sequences must increase in ledger order", ["state", "inputLedger", index, "sequence"]);
        }
        previousInputSequence = record.sequence;
        if (record.status === "applied") {
            if (record.appliedRunId === undefined) {
                addInvariantIssue(context, "applied session input requires its applied Run", ["state", "inputLedger", index, "appliedRunId"]);
            }
            if (record.messageIndex !== undefined
                && (record.messageIndex >= goal.state.messages.length
                    || goal.state.messages[record.messageIndex]?.role !== "user")) {
                addInvariantIssue(context, "applied session input must point to a real user message", ["state", "inputLedger", index, "messageIndex"]);
            }
        } else if (record.appliedRunId !== undefined || record.messageIndex !== undefined) {
            addInvariantIssue(context, "only applied session inputs may reference an applied Run or message", ["state", "inputLedger", index]);
        }
    }
    const messageIds = new Set<string>();
    const messageSourceKeys = new Set<string>();
    for (const [index, message] of goal.state.messages.entries()) {
        if (messageIds.has(message.messageId)) {
            addInvariantIssue(context, "Goal message IDs must be unique within the Goal", ["state", "messages", index, "messageId"]);
        }
        messageIds.add(message.messageId);
        const sourceKey = snapshotMessageSourceKey(message.source);
        if (messageSourceKeys.has(sourceKey)) {
            addInvariantIssue(context, "Goal message sources must be unique within the Goal", ["state", "messages", index, "source"]);
        }
        messageSourceKeys.add(sourceKey);
    }
    const messageQueue = goal.state.messageQueue;
    const queuedInputIds = new Set<string>();
    for (const [index, item] of (messageQueue?.items ?? []).entries()) {
        if (queuedInputIds.has(item.inputId)) {
            addInvariantIssue(context, "queued message IDs must be unique", ["state", "messageQueue", "items", index, "inputId"]);
        }
        queuedInputIds.add(item.inputId);
        const record = (goal.state.inputLedger ?? []).find((candidate) => candidate.inputId === item.inputId);
        if (record === undefined
            || record.kind !== "message"
            || record.status !== "pending"
            || record.sequence !== item.sequence) {
            addInvariantIssue(context, "queued message must match a pending message input record", ["state", "messageQueue", "items", index]);
        }
    }
    for (const [index, record] of (goal.state.inputLedger ?? []).entries()) {
        if (record.kind === "message" && record.status === "pending" && !queuedInputIds.has(record.inputId)) {
            addInvariantIssue(context, "pending message input requires a queued item", ["state", "inputLedger", index]);
        }
    }
    const step = run.lastStep;
    const result = step?.kind === "decision" ? step.result : undefined;

    if (result?.kind === "goal_plan_update" && run.mode !== "plan") {
        addInvariantIssue(
            context,
            "goal_plan_update requires Plan Mode",
            ["state", "run", "lastStep", "result"],
        );
    }

    if (run.contextEpoch.conversationStartIndex > goal.state.messages.length) {
        addInvariantIssue(
            context,
            "contextEpoch conversationStartIndex exceeds messages",
            ["state", "run", "contextEpoch", "conversationStartIndex"],
        );
    }

    if (run.contextEpoch.openedAtSequence > run.committedThroughSequence) {
        addInvariantIssue(
            context,
            "contextEpoch openedAtSequence exceeds committedThroughSequence",
            ["state", "run", "contextEpoch", "openedAtSequence"],
        );
    }

    if ((run.stepCount > 0) !== (step !== undefined)) {
        addInvariantIssue(
            context,
            "lastStep must exist if and only if stepCount is positive",
            ["state", "run", "lastStep"],
        );
    }

    if (run.status === "created" && (
        run.stepCount !== 0
        || step !== undefined
        || run.pendingAction !== undefined
        || run.pendingProgram !== undefined
        || run.pendingInteraction !== undefined
        || run.stopReason !== undefined
    )) {
        addInvariantIssue(context, "created Run cannot contain execution progress");
    }

    if (run.status !== "failed" && run.stopReason !== undefined) {
        addInvariantIssue(context, "stopReason is only valid for a failed Run");
    }

    const pendingAction = run.pendingAction;
    const pendingProgram = run.pendingProgram;
    const pendingInteraction = run.pendingInteraction;
    const pendingThink = run.pendingThink;
    const pendingModelRepair = run.pendingModelRepair;
    const interruption = run.interruption;

    if (pendingInteraction?.kind === "ask_user" && pendingInteraction.routeRevision !== undefined) {
        const approval = pendingInteraction.routeRevision;
        const approvalQuestion = pendingInteraction.questions[0];
        if (run.mode !== "plan"
            || run.approvedTask === undefined
            || run.planRoute === undefined
            || approval.baseRevision !== run.planRoute.revision
            || pendingInteraction.questions.length !== 1
            || approvalQuestion === undefined
            || approvalQuestion.multiSelect
            || !approvalQuestion.options.some((option) => option.id === approval.approvalOptionId)) {
            addInvariantIssue(context, "route revision approval must bind one current Plan route and its explicit approval option", ["state", "run", "pendingInteraction", "routeRevision"]);
        }
    }

    if (interruption !== undefined) {
        if (interruption.status === "finished" && run.status !== "cancelled") {
            addInvariantIssue(context, "finished Interrupt requires a cancelled Run", ["state", "run", "interruption"]);
        }
        if (interruption.status !== "finished" && run.status !== "running" && run.status !== "waiting") {
            addInvariantIssue(context, "active Interrupt requires a running or waiting Run", ["state", "run", "interruption"]);
        }
        if (interruption.outcomeUnknown === true && (interruption.interruptedActions?.length ?? 0) === 0) {
            addInvariantIssue(context, "unknown interrupted outcome requires its Action identities", ["state", "run", "interruption"]);
        }
    }

    if (pendingProgram !== undefined) {
        const input = pendingProgram.action.input;
        if ((run.status !== "running" && run.status !== "waiting")
            || pendingProgram.action.toolId !== "execute_program"
            || !goal.definition.profile.toolIds.includes("execute_program")
            || typeof input !== "object" || input === null || Array.isArray(input)
            || typeof (input as { readonly code?: unknown }).code !== "string"
            || pendingInteraction !== undefined || pendingThink !== undefined
            || pendingModelRepair !== undefined
            || (pendingAction !== undefined
                && pendingAction.action.actionId !== `${pendingProgram.programId}:${pendingProgram.nextCallIndex}`)) {
            addInvariantIssue(context, "pendingProgram does not match the active Run and child Action");
        }
    }

    if (pendingModelRepair !== undefined) {
        if (pendingModelRepair.goalId !== goal.id || pendingModelRepair.runId !== run.id) {
            addInvariantIssue(context, "pendingModelRepair Goal and Run identities must match the Snapshot", ["state", "run", "pendingModelRepair"]);
        }
        if (run.status !== "running" || pendingModelRepair.stepOrdinal !== run.stepCount + 1) {
            addInvariantIssue(context, "pendingModelRepair must target the next incomplete Step of a running Run", ["state", "run", "pendingModelRepair"]);
        }
        if (pendingAction !== undefined || pendingInteraction !== undefined) {
            addInvariantIssue(context, "pendingModelRepair cannot coexist with a pending Action or interaction", ["state", "run", "pendingModelRepair"]);
        }
        if (pendingModelRepair.stage === "think" && pendingModelRepair.thinkRequestId === undefined) {
            addInvariantIssue(context, "Think repair must reference its committed Think request", ["state", "run", "pendingModelRepair", "thinkRequestId"]);
        }
    }

    if (pendingThink !== undefined) {
        if (pendingThink.goalId !== goal.id || pendingThink.runId !== run.id) {
            addInvariantIssue(
                context,
                "pendingThink Goal and Run identities must match the Snapshot",
                ["state", "run", "pendingThink"],
            );
        }
        if (run.status !== "running") {
            addInvariantIssue(context, "pendingThink requires a running Run", ["state", "run", "pendingThink"]);
        }
        if (pendingThink.stepOrdinal !== run.stepCount + 1) {
            addInvariantIssue(context, "pendingThink must point to the next incomplete Step", ["state", "run", "pendingThink", "stepOrdinal"]);
        }
        if (pendingAction !== undefined || pendingInteraction !== undefined) {
            addInvariantIssue(context, "pendingThink cannot coexist with a pending Action or interaction", ["state", "run", "pendingThink"]);
        }
    }

    if (pendingAction !== undefined && pendingInteraction !== undefined) {
        addInvariantIssue(
            context,
            "pendingAction and pendingInteraction are mutually exclusive",
            ["state", "run"],
        );
    }

    if (pendingInteraction !== undefined && run.status !== "waiting") {
        addInvariantIssue(
            context,
            "pendingInteraction requires a waiting Run",
            ["state", "run", "pendingInteraction"],
        );
    }

    if (pendingAction !== undefined) {
        if (
            pendingAction.status === "awaiting_approval"
            && run.status !== "waiting"
        ) {
            addInvariantIssue(context, "awaiting_approval pendingAction requires a waiting Run");
        }

        if (
            pendingAction.status === "outcome_unknown"
            && run.status !== "waiting"
            && run.status !== "failed"
        ) {
            addInvariantIssue(context, "outcome_unknown pendingAction requires a waiting or failed Run");
        }

        if (run.status === "waiting" && pendingAction.status === "approved") {
            addInvariantIssue(context, "waiting Run cannot contain an approved pendingAction");
        }

        if (run.status === "completed" || run.status === "cancelled") {
            addInvariantIssue(context, "terminal Run cannot contain a pendingAction");
        }

        if (run.stopReason?.kind === "max_steps_exceeded") {
            addInvariantIssue(context, "maxSteps failure cannot contain a pendingAction");
        }

        if (
            step?.kind === "action"
            && step.action.actionId === pendingAction.action.actionId
        ) {
            addInvariantIssue(context, "pendingAction cannot repeat the latest completed Action");
        }
    }

    if (run.status === "completed" || run.status === "cancelled") {
        if (pendingInteraction !== undefined) {
            addInvariantIssue(context, "terminal Run cannot contain a pendingInteraction");
        }
    }

    if (run.status === "waiting") {
        if (pendingAction === undefined && pendingInteraction === undefined && result?.kind !== "wait") {
            addInvariantIssue(context, "waiting Run requires a wait decision, a pending Action, or a pending Interaction");
        }

        if (
            pendingAction !== undefined
            && pendingAction.status !== "awaiting_approval"
            && pendingAction.status !== "outcome_unknown"
        ) {
            addInvariantIssue(context, "waiting Run requires an approval or recovery pendingAction");
        }
    }

    if (run.status === "completed" && result?.kind !== "complete") {
        addInvariantIssue(context, "completed Run requires a complete decision");
    }

    if (run.status === "failed") {
        if (run.stopReason === undefined && result?.kind !== "fail") {
            addInvariantIssue(context, "failed Run requires a fail decision");
        }

        if (run.stopReason?.kind === "max_steps_exceeded") {
            const validPreviousStep = step?.kind === "action"
                || result?.kind === "wait"
                || result?.kind === "context_lookup"
                || result?.kind === "tool_discovery"
                || result?.kind === "goal_plan_update"
                || result?.kind === "run_stage_update"
                || result?.kind === "run_stage_complete"
                || result?.kind === "run_plan_route_update"
                || (result?.kind === "complete" && run.currentStage?.status === "executing"
                    && run.currentStage.latestReviewRejection !== undefined);
            const maxSteps = goal.definition.executionPolicy.maxSteps;
            if (maxSteps <= 0 || run.stepCount < maxSteps || !validPreviousStep) {
                addInvariantIssue(context, "maxSteps failure requires a reached positive execution limit");
            }
        }
    }

    if (
        run.status === "running"
        && step?.kind === "decision"
        && result?.kind !== "wait"
        && result?.kind !== "context_lookup"
        && result?.kind !== "tool_discovery"
        && result?.kind !== "goal_plan_update"
        && result?.kind !== "run_stage_update"
        && result?.kind !== "run_stage_complete"
        && result?.kind !== "run_plan_route_update"
        && !(result?.kind === "complete" && run.currentStage?.status === "executing"
            && run.currentStage.latestReviewRejection !== undefined)
    ) {
        addInvariantIssue(
            context,
            "running Run can only preserve a resumed wait, Context Lookup, Tool Discovery, GoalPlan update, or Run Stage decision",
        );
    }

    if (
        run.memoryRevision !== undefined
        && run.memoryRevision.sequence > run.committedThroughSequence
    ) {
        addInvariantIssue(
            context,
            "memoryRevision.sequence cannot exceed committedThroughSequence",
            ["state", "run", "memoryRevision", "sequence"],
        );
    }
}

function validateSnapshotFieldRefinements(
    goal: GoalSnapshotV1,
    context: SnapshotInvariantContext,
): void {
    const exposed = goal.state.run.exposedToolIds;
    if (new Set(exposed).size !== exposed.length) {
        addInvariantIssue(context, "Exposed tool IDs must be unique", ["state", "run", "exposedToolIds"]);
    }

    const result = goal.state.run.lastStep?.kind === "decision"
        ? goal.state.run.lastStep.result
        : undefined;

    const filters = result?.kind === "context_lookup" ? result.filters : undefined;
    if (filters?.sequenceRange !== undefined && filters.sequenceRange.to < filters.sequenceRange.from) {
        addInvariantIssue(
            context,
            "sequenceRange must not be inverted",
            ["state", "run", "lastStep", "result", "filters", "sequenceRange"],
        );
    }

    if (result?.kind === "goal_plan_update") {
        for (const [index, operation] of result.operations.entries()) {
            if (operation.type !== "update") continue;
            const path = ["state", "run", "lastStep", "result", "operations", index];
            if (operation.content === undefined && operation.status === undefined) {
                addInvariantIssue(context, "update operation must change content or status", [...path, "content"]);
            }
            if (operation.status === "completed"
                && (operation.evidenceSequences === undefined || operation.evidenceSequences.length === 0)) {
                addInvariantIssue(context, "completed Todo update must cite current Run evidence", [...path, "evidenceSequences"]);
            }
            if (operation.status !== "completed" && operation.evidenceSequences !== undefined) {
                addInvariantIssue(context, "evidenceSequences is only valid when completing a Todo", [...path, "evidenceSequences"]);
            }
        }
    }

    validateMemoryPatches(goal, context);

    const pending = goal.state.run.pendingAction;
    if (pending !== undefined) {
        if (pending.status !== "approved"
            && (pending.approvalScope !== undefined || pending.grantId !== undefined)) {
            addInvariantIssue(
                context,
                "unapproved Action cannot retain authorization",
                ["state", "run", "pendingAction", "approvalScope"],
            );
        }
        if (pending.status === "approved") {
            const scope = pending.approvalScope ?? "action";
            if ((scope === "action") !== (pending.grantId === undefined)) {
                addInvariantIssue(
                    context,
                    "approval scope and Grant identity are inconsistent",
                    ["state", "run", "pendingAction", "grantId"],
                );
            }
        }
        if (pending.status === "awaiting_approval" && pending.attemptsStarted !== undefined) {
            addInvariantIssue(
                context,
                "unapproved Action cannot have Tool attempts",
                ["state", "run", "pendingAction", "attemptsStarted"],
            );
        }
    }

    const selection = goal.state.modelSelection;
    if (selection.executionApi !== undefined && selection.provider !== "opencode-go") {
        addInvariantIssue(
            context,
            "executionApi is only supported for opencode-go selections",
            ["state", "modelSelection", "executionApi"],
        );
    }
    if (selection.executionApi !== undefined
        && (selection.contextWindowTokens === undefined || selection.maxOutputTokens === undefined)) {
        addInvariantIssue(
            context,
            "executionApi selections require contextWindowTokens and maxOutputTokens",
            ["state", "modelSelection", "executionApi"],
        );
    }
    if (selection.contextWindowTokens !== undefined
        && selection.maxOutputTokens !== undefined
        && selection.maxOutputTokens >= selection.contextWindowTokens) {
        addInvariantIssue(
            context,
            "maxOutputTokens must be strictly less than contextWindowTokens",
            ["state", "modelSelection", "maxOutputTokens"],
        );
    }
}

function validateMemoryPatches(
    goal: GoalSnapshotV1,
    context: SnapshotInvariantContext,
): void {
    const result = goal.state.run.lastStep?.kind === "decision"
        ? goal.state.run.lastStep.result
        : undefined;
    if (result === undefined || !("memoryPatch" in result) || result.memoryPatch === undefined) {
        return;
    }

    for (const [index, operation] of result.memoryPatch.operations.entries()) {
        if (operation.type === "update_hypothesis"
            && operation.hypothesis.statement === undefined
            && operation.hypothesis.status === undefined) {
            addInvariantIssue(
                context,
                "hypothesis update must change statement or status",
                ["state", "run", "lastStep", "result", "memoryPatch", "operations", index],
            );
        }
        if (operation.type === "update_blocker"
            && operation.blocker.description === undefined
            && operation.blocker.status === undefined) {
            addInvariantIssue(
                context,
                "blocker update must change description or status",
                ["state", "run", "lastStep", "result", "memoryPatch", "operations", index],
            );
        }
    }
}

/**
 * 校验已通过生成结构绑定的 Snapshot 字段约束与跨字段不变量。
 *
 * @param goal - 与输入隔离的当前 Snapshot 数据。
 * @throws GoalSnapshotProtocolError 当非空、数值范围、数组长度、摘要格式或跨字段规则失败时。
 *
 * @example
 * ```ts
 * assertGoalSnapshotSemantics(snapshot);
 * ```
 */
export function assertGoalSnapshotSemantics(goal: GoalSnapshotV1): void {
    const issues: SnapshotIssue[] = [...collectSnapshotRuleIssues(goal)];
    const context: SnapshotInvariantContext = {
        addIssue(issue) {
            issues.push({ message: issue.message, path: issue.path });
        },
    };
    validateSnapshotInvariants(goal, context);
    validateSnapshotFieldRefinements(goal, context);

    const first = issues[0];
    if (first !== undefined) {
        throw new GoalSnapshotProtocolError(
            `Invalid Goal snapshot: ${first.message} at ${formatIssuePath(first.path)}`,
            { cause: issues },
        );
    }
}

function formatIssuePath(path: readonly PropertyKey[]): string {
    return path.length === 0 ? "/" : `/${path.map(String).join("/")}`;
}

export const INVALID_GOAL_SNAPSHOT_CODE = "INVALID_GOAL_SNAPSHOT" as const;

/**
 * 表示 Goal JSON 快照违反当前持久化协议的错误。
 *
 * @remarks
 * Codec 对历史版本、未知版本、非法结构和不成立的状态组合统一抛出该错误；
 * 读取失败不会执行迁移、删除或写回。
 *
 * @example
 * ```ts
 * try {
 *     codec.decode(input);
 * } catch (error) {
 *     if (error instanceof GoalSnapshotProtocolError) {
 *         console.error(error.code);
 *     }
 * }
 * ```
 */
export class GoalSnapshotProtocolError extends Error {
    readonly code = INVALID_GOAL_SNAPSHOT_CODE;

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "GoalSnapshotProtocolError";
    }
}
