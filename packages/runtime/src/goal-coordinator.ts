import { randomUUID } from "node:crypto";

import type {
    CompletedRunRecord,
    Goal,
    GoalTask,
    GoalProtocolValidator,
    JsonValue,
    PendingInteractionAskUser,
    RunRef,
    RunState,
    AskUserAnswer,
    AskUserQuestion,
} from "./domain";
import { createRun } from "./domain";
import type { GoalStore } from "./goal-store";
import type {
    ExecutionStreamEventDraft,
    ExecutionStreamPublisher,
    StreamJsonValue,
} from "../../execution-stream/src/index";
import { validateAskUserAnswers } from "../../model-contracts/src/index";
import type { ContextLookupPort } from "./context-retrieval";
import type { RunScheduler } from "./scheduler";
import type { InterruptRunResult, SteerInputResult } from "./runner";
import {
    InMemoryToolRegistry,
    type ToolObservation,
    type ToolRegistry,
} from "../../tool-core/src/index";
import {
    throwIfAborted,
    isExecutionAbortedError,
    type ExecutionControl,
} from "../../execution-control/src/index";
import { transition } from "./transition";
import { appendGoalMessage } from "./goal-message";
import { createRunPlanRoute, reviseRunPlanExecution } from "./run-plan";
import {
    computeActionApprovalReviewRef,
    computeApprovalInputId,
    resolveActionExecutionAction,
    resolveActionRecoveryRef,
    type ActionApprovalCapability,
    type ActionApprovalReview,
    type ActionApprovalReviewRequest,
    type ActionApprovalReviewResult,
    type ActionApprovalScope,
    type ActionExecutionVersion,
} from "./action-approval";
import {
    resolveEffectiveSandboxScope,
    isSeatbeltSupported,
    type DerivedSandboxAccess,
    type EffectiveSandboxScope,
    type SandboxAccessRequest,
} from "../../sandbox/src/index";
import { evaluateSandboxAuthorization } from "../../permission/src/index";
import type { SessionInputDigest, SessionInputRecord, SessionMessageQueue } from "./session-input";
import {
    type DiagnosticTraceSink,
    type TrajectoryEventDraft,
    type TrajectoryEvent,
    type TrajectoryStore,
} from "./trajectory";
import {
    advanceContextEpoch,
    selectLatestConversationStart,
    toEpochRange,
} from "./context-epoch";
import type { WorkingMemoryLimitsInput } from "../../working-memory/src/index";
import {
    TrajectoryCheckpointCommitter,
    type TrajectoryCheckpointCommitResult,
    type TrajectoryCheckpointCommitterPort,
} from "./trajectory-checkpoint-committer";
import { withGoalMutationGate } from "./goal-mutation-gate";
import {
    DefaultPermissionGrantService,
    createSandboxGrantMatcher,
    createToolGrantMatcher,
    toolGrantMatchersEqual,
    type PermissionMode,
    type ProjectPermissionMode,
    type ProjectPermissionModeStore,
    type SandboxGrantStore,
    type ToolGrantScope,
    type ToolGrantStore,
    type UnifiedGrantSummary,
} from "./tool-grant";

function isStreamDeltaKind(kind: string): boolean {
    return kind.endsWith("_delta");
}

/** 判断 JSON 值是否为普通对象；用于读取可选的沙箱能力申请字段。 */
function isJsonRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function streamCoalescingKey(
    executionUnitId: string | undefined,
    actionId: string | undefined,
    kind: string,
): string {
    return `${kind}:${executionUnitId ?? actionId ?? "run"}`;
}

function cloneCriterion(criterion: GoalTask["completionCriteria"][number]): GoalTask["completionCriteria"][number] {
    return {
        text: criterion.text,
        ...(criterion.acceptance === undefined
            ? {}
            : {
                acceptance: {
                    expectToolId: criterion.acceptance.expectToolId,
                    expectOutcome: criterion.acceptance.expectOutcome,
                },
            }),
    };
}

function cloneTask(task: GoalTask): GoalTask {
    return {
        objective: task.objective,
        completionCriteria: task.completionCriteria.map(cloneCriterion),
    };
}

/** 用户跳过整份问卷时写入模型可见历史的明确控制语义。 */
const ASK_USER_SKIP_MESSAGE =
    "The user did not answer this question and asked to continue the current task without an answer to it.";

function formatAskUserAnswers(
    questions: readonly AskUserQuestion[],
    answers: readonly AskUserAnswer[],
): string {
    const answerMap = new Map(answers.map((a) => [a.questionId, a]));
    const blocks: string[] = [];

    for (const q of questions) {
        const answer = answerMap.get(q.id);
        if (!answer) continue;

        const selectedLabels: string[] = [];
        for (const optId of answer.optionIds) {
            const matchedOpt = q.options.find((o) => o.id === optId);
            if (matchedOpt) {
                selectedLabels.push(matchedOpt.label);
            }
        }
        if (answer.otherText !== undefined && answer.otherText.trim().length > 0) {
            selectedLabels.push(`Other: ${answer.otherText.trim()}`);
        }

        blocks.push(
            `### ${q.header}\n${q.question}\nAnswer: ${selectedLabels.join(", ")}`,
        );
    }

    return blocks.join("\n\n");
}

/** Goal 推进失败时返回的稳定业务错误码。 */
export type GoalProgressErrorCode =
    | "RUN_NOT_FOUND"
    | "GOAL_NOT_WAITING"
    | "GOAL_NOT_COMPLETED"
    | "INVALID_GOAL_INPUT"
    | "INVALID_PHASE_RESULT"
    | "ACTION_NOT_AUTHORIZED"
    | "INVALID_CONTEXT_LOOKUP"
    | "CONTEXT_LOOKUP_CHAIN_LIMIT"
    | "PLAN_MODE_BUSY"
    | "QUEUE_REVISION_MISMATCH"
    | "TOOL_NOT_AUTHORIZED"
    | "TOOL_NOT_FOUND"
    | "INVALID_TOOL_INPUT"
    | "TOOL_EXECUTION_ERROR";

/**
 * 由会话队列消费驱动的后继 Run 绑定。
 *
 * @remarks
 * 提供该绑定时，被应用的队首消息、输入账本状态、队列修订与新 Run 创建在
 * 同一 Snapshot 提交中完成；`newInput` 必须等于队首消息正文，队列修订失配
 * 时拒绝且不创建 Run。
 *
 * @example
 * ```ts
 * const binding: ContinuationQueueBinding = { inputId: "input-2", queueRevision: 3 };
 * ```
 */
export interface ContinuationQueueBinding {
    /** 被应用的队首输入身份。 */
    readonly inputId: string;
    /** 调用方观察到的队列修订。 */
    readonly queueRevision: number;
}

/**
 * 用户对 Goal 当前交互等待点提交的操作。
 *
 * @remarks
 * 统一执行生命周期支持以下用户操作：
 * - `message`: 向普通 wait/blocked 等待追加用户消息；
 * - `approve_task`: 携带当前提案的 `requestId` 批准任务并推进执行；
 * - `feedback_task`: 携带当前提案的 `requestId` 提供反馈，使旧提案失效并重新规划；
 * - `answer_ask_user`: 回答 Agent 发起的 `ask_user` 结构化问卷；
 * - `reply_to_question`: 以非空整体回复替代整份问卷，原文作为真实用户消息继续当前 Run；
 * - `skip_question`: 提交“未回答并要求继续”的控制语义并继续当前 Run，不等同于取消 Run；
 * - `approve_action`: 批准首次待审批的工具调用（附带一次性授权）；
 * - `approve_action_revision`: 批准同一工具的修订参数版本，提交绑定审阅引用的最终参数；
 * - `reject_action`: 拒绝首次待审批的工具调用并记录原因；
 * - `retry_unknown_action`/`decline_unknown_action_retry`: 明确允许或拒绝结果未知的操作按获批版本再次执行；
 * 兼容分支 `approve` 与 `approve_task` 行为一致，且同样必须携带当前提案的 `requestId`。
 *
 * @example
 * ```ts
 * const action: GoalUserAction = {
 *   kind: "approve_task",
 *   requestId: "proposal-1",
 * };
 * ```
 */
export type GoalUserAction =
    | { readonly kind: "message"; readonly content: string; readonly inputId?: string | undefined }
    | { readonly kind: "approve_task"; readonly requestId: string }
    | { readonly kind: "feedback_task"; readonly requestId: string; readonly feedback: string }
    | {
        readonly kind: "answer_ask_user";
        readonly requestId: string;
        readonly answers: readonly AskUserAnswer[];
    }
    | { readonly kind: "reply_to_question"; readonly requestId: string; readonly content: string }
    | { readonly kind: "skip_question"; readonly requestId: string }
    | {
        readonly kind: "approve_action";
        readonly actionId: string;
        readonly scope?: "action" | ToolGrantScope;
        /**
         * 批准决定的稳定身份。
         *
         * @remarks 会话入口使用会话输入身份；省略时由 Coordinator 按批准内容派生，
         * 保证同一决定重试复用同一条暂存授权。
         */
        readonly approvalInputId?: string;
    }
    | {
        /**
         * 批准同一工具的修订参数版本。
         *
         * @remarks 提交绑定审阅引用的最终参数与期限；提交阶段会重新计算并比对，
         * 与审阅内容不一致时明确拒绝并要求重新审阅。
         */
        readonly kind: "approve_action_revision";
        readonly actionId: string;
        readonly input: JsonValue;
        readonly scope?: "action" | ToolGrantScope;
        readonly reviewRef: string;
        /** 批准决定的稳定身份；省略时由 Coordinator 按批准内容派生。 */
        readonly approvalInputId?: string;
    }
    | {
        /**
         * 明确允许结果未知的操作按获批版本再次执行。
         *
         * @remarks 绑定本次未知结果等待身份；不携带新参数或持续授权期限。
         */
        readonly kind: "retry_unknown_action";
        readonly actionId: string;
        readonly recoveryRef: string;
    }
    | {
        /**
         * 拒绝结果未知的操作再次执行。
         *
         * @remarks 保留此前效果未知的事实，不把原操作记作未执行、已回滚或成功。
         */
        readonly kind: "decline_unknown_action_retry";
        readonly actionId: string;
        readonly recoveryRef: string;
        readonly reason: string;
    }
    | {
        readonly kind: "reject_action";
        readonly actionId: string;
        readonly reason: string;
    }
    | { readonly kind: "approve"; readonly requestId: string };

/**
 * 恢复等待中 Goal 所需的稳定关联键与用户操作。
 *
 * @example
 * ```ts
 * const request: ResumeGoalRequest = {
 *   ref: { goalId: "goal-1", runId: "run-1" },
 *   action: { kind: "approve_task", requestId: "proposal-1" },
 * };
 * ```
 */
export interface ResumeGoalRequest {
    /** 目标 Goal 与当前 Run 的关联键。 */
    readonly ref: RunRef;
    /** 与当前等待类型匹配的用户操作。 */
    readonly action: GoalUserAction;
}

/**
 * GoalCoordinator 推进一次 Goal 后到达的等待点、执行终态或业务失败。
 *
 * @remarks
 * 统一执行生命周期中 phase 恒为 `executing`。
 * 等待点细分为：
 * - `ask_user`: 等待回答 Agent 结构化提问；
 * - `task_approval`: 等待用户批准或反馈任务提案；
 * - `action_approval`: 等待审批副作用工具调用；
 * - `action_recovery`: 等待恢复结果未知的工具调用；
 * - `blocked`: 等待解除 Agent 主动发起的 wait。
 *
 * @example
 * ```ts
 * const result = await coordinator.advance({ goalId: "goal-1", runId: "run-1" });
 * if (result.ok && result.kind === "waiting") {
 *   console.log(result.waitingFor);
 * }
 * ```
 */
export type GoalProgressResult =
    | {
        readonly ok: true;
        readonly kind: "waiting";
        readonly phase: "executing";
        readonly waitingFor:
            | "ask_user"
            | "task_approval"
            | "action_approval"
            | "action_recovery"
            | "blocked";
        readonly goal: Goal;
    }
    | {
        readonly ok: true;
        readonly kind: "terminal";
        readonly phase: "executing";
        readonly goal: Goal;
    }
    | {
        readonly ok: false;
        readonly error: {
            readonly code: GoalProgressErrorCode;
            readonly message: string;
        };
    };


/**
 * 创建 {@link GoalCoordinator} 所需的执行与持久化依赖。
 *
 * @remarks
 * Coordinator 作为外层调度控制器，推进 Goal 执行并处理交互恢复。
 *
 * @example
 * ```ts
 * const coordinator = new GoalCoordinator({ store, scheduler });
 * ```
 */
export interface GoalCoordinatorDependencies {
    /** 用于恢复和保存 Goal 最新完整快照。 */
    readonly store: GoalStore;
    /** 运行 executing Goal，直到 blocked、waiting 或终态。 */
    readonly scheduler: RunScheduler;
    /** 创建 completed continue 的新 Run ID；省略时使用随机 UUID。 */
    readonly runIdGenerator?: () => string;
    /** 工具注册表；省略时按空 InMemoryToolRegistry 处理。 */
    readonly toolRegistry?: ToolRegistry;
    /** 可选的 Goal/Workspace 授权账本；持续授权只有配置此 Port 才可批准。 */
    readonly toolGrantStore?: ToolGrantStore;
    /** 可选的 Sandbox 持续授权账本；沙箱能力持续授权只有配置此 Port 才可批准。 */
    readonly sandboxGrantStore?: SandboxGrantStore;
    /** 当前 workspace 的稳定身份，与 Grant 账本目录绑定。 */
    readonly workspaceId?: string;
    /** 当前 workspace 根目录，用于解析文件授权目标身份。 */
    readonly workspaceRoot?: string;
    /** 可选 Domain Event 追加与 Snapshot 边界读取端口；省略时只保存 Snapshot。 */
    readonly trajectoryStore?: TrajectoryStore;
    /** 可选诊断记录边界；诊断故障不得改变 Snapshot 或 Domain Event 语义。 */
    readonly traceSink?: DiagnosticTraceSink;
    /** structured@1 Patch 接受时使用的 Working Memory 限制。 */
    readonly workingMemoryLimits?: WorkingMemoryLimitsInput;
    /** 可选 Prompt/Memory 协议校验器；Composition Root 可用它在推进前执行额外的协议边界校验。 */
    readonly protocolValidator?: GoalProtocolValidator;
    /** 可选共享提交器；省略时由 Coordinator 按当前依赖创建。 */
    readonly checkpointCommitter?: TrajectoryCheckpointCommitterPort;
    /** 只读 committed Trajectory 检索端口；缺失时 lookup 产生 unavailable 结果。 */
    readonly contextLookupPort?: ContextLookupPort;
    /** 可选的项目权限执行模式存储端口。 */
    readonly permissionModeStore?: ProjectPermissionModeStore;
    /** 可选的 Goal/Run 实时事件发布端口；发布故障不得改变执行语义。 */
    readonly executionStream?: ExecutionStreamPublisher;
}

/**
 * 推进可恢复 Goal，直到下一交互等待点或执行终态。
 *
 * @remarks
 * `advance` 是自动推进入口。新 Goal 直接进入统一执行生命周期。
 * 每次下游调用（调度或恢复）前都会先保存最新完整 Goal；保存失败时错误原样传播。
 * `resume` 恢复处于 `ask_user`、`task_approval`、工具审批或 blocked 等待的 Goal。
 *
 * @example
 * ```ts
 * const result = await coordinator.advance({ goalId: "goal-1", runId: "run-1" });
 * if (result.ok && result.kind === "waiting") {
 *   console.log(result.waitingFor);
 * }
 * ```
 */
export class GoalCoordinator {
    private readonly store: GoalStore;
    private readonly scheduler: RunScheduler;
    private readonly runIdGenerator: () => string;
    private readonly toolRegistry: ToolRegistry;
    private readonly toolGrantStore: ToolGrantStore | undefined;
    private readonly sandboxGrantStore: SandboxGrantStore | undefined;
    private readonly permissionModeStore: ProjectPermissionModeStore | undefined;
    private readonly workspaceId: string | undefined;
    private readonly workspaceRoot: string | undefined;
    private readonly checkpointCommitter: TrajectoryCheckpointCommitterPort;
    private readonly trajectoryStore: TrajectoryStore | undefined;
    private readonly workingMemoryLimits: WorkingMemoryLimitsInput | undefined;
    private readonly protocolValidator: GoalProtocolValidator | undefined;
    private readonly contextLookupPort: ContextLookupPort | undefined;
    private readonly executionStream: ExecutionStreamPublisher | undefined;
    private readonly continuationGates = new Map<string, Promise<void>>();

    /** @param dependencies - GoalCoordinatorDependencies。 */
    constructor(dependencies: GoalCoordinatorDependencies) {
        this.store = dependencies.store;
        this.scheduler = dependencies.scheduler;
        this.runIdGenerator = dependencies.runIdGenerator ?? randomUUID;
        this.toolRegistry = dependencies.toolRegistry ?? new InMemoryToolRegistry();
        this.toolGrantStore = dependencies.toolGrantStore;
        this.sandboxGrantStore = dependencies.sandboxGrantStore;
        this.permissionModeStore = dependencies.permissionModeStore;
        this.workspaceId = dependencies.workspaceId;
        this.workspaceRoot = dependencies.workspaceRoot;
        this.trajectoryStore = dependencies.trajectoryStore;
        this.workingMemoryLimits = dependencies.workingMemoryLimits;
        this.protocolValidator = dependencies.protocolValidator;
        this.contextLookupPort = dependencies.contextLookupPort;
        this.executionStream = dependencies.executionStream;
        this.checkpointCommitter = dependencies.checkpointCommitter
            ?? new TrajectoryCheckpointCommitter({
                store: dependencies.store,
                ...(dependencies.trajectoryStore === undefined
                    ? {}
                    : { trajectoryStore: dependencies.trajectoryStore }),
                ...(dependencies.traceSink === undefined
                    ? {}
                    : { traceSink: dependencies.traceSink }),
            });
    }

    /**
     * 列出当前 workspace 下可见的持续授权。
     *
     * @param ref - 当前 Goal 与 Run 身份。
     * @returns 当前 Goal Grant 与 workspace Grant；不返回其它 workspace 的记录。
     * @throws 未配置 Grant Store 或请求身份与当前 workspace 不匹配时拒绝。
     * @example
     * ```ts
     * const grants = await coordinator.listToolGrants({ goalId, runId });
     * ```
     */
    async listToolGrants(ref: RunRef): Promise<readonly import("./tool-grant").ToolGrant[]> {
        if (this.toolGrantStore === undefined || this.workspaceId === undefined) {
            throw new Error("Tool Grant storage is unavailable");
        }
        const goal = await this.restore(ref);
        if (goal === undefined || goal.state.run.id !== ref.runId) throw new Error("Run not found");
        return this.toolGrantStore.list({ workspaceId: this.workspaceId, goalId: goal.id });
    }

    /**
     * 撤销当前 workspace 中一条可见的持续授权。
     *
     * @param request - 目标 Run、Grant ID 和目标授权范围。
     * @returns 已撤销 Grant；撤销完成后后续匹配 Action 必须重新等待审批。
     * @throws Run 不存在、Grant 越权或存储/Trajectory 写入失败时拒绝。
     * @example
     * ```ts
     * await coordinator.revokeToolGrant({ ref, grantId: "grant-1", scope: "workspace" });
     * ```
     */
    async revokeToolGrant(request: {
        readonly ref: RunRef;
        readonly grantId: string;
        readonly scope: ToolGrantScope;
    }): Promise<import("./tool-grant").ToolGrant> {
        if (this.toolGrantStore === undefined || this.workspaceId === undefined) {
            throw new Error("Tool Grant storage is unavailable");
        }
        const goal = await this.restore(request.ref);
        if (goal === undefined) throw new Error("Run not found");
        if (goal.state.run.id !== request.ref.runId) throw new Error("Run reference does not match the current Goal");
        const visible = await this.toolGrantStore.list({
            workspaceId: this.workspaceId,
            ...(request.scope === "goal" ? { goalId: goal.id } : {}),
        });
        const grant = visible.find((candidate) => candidate.id === request.grantId && candidate.scope === request.scope);
        if (grant === undefined) throw new Error("Tool Grant is outside the requested scope");
        const revoked = await this.toolGrantStore.revoke({
            grantId: request.grantId,
            workspaceId: this.workspaceId,
            ...(request.scope === "goal" ? { goalId: goal.id } : {}),
        });
        await this.appendTrajectory({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            eventType: "tool_grant_revoked",
            payload: { type: "tool_grant_revoked", grantId: revoked.id, scope: revoked.scope },
        });
        await this.saveCheckpoint(goal);
        return revoked;
    }

    /**
     * 统一列出当前项目与 Goal 作用域下的所有 Tool 与 Sandbox 持续授权。
     *
     * @param ref - 当前 Goal 与 Run 身份。
     * @returns 统一聚合的授权列表。
     * @throws 未配置存储或请求身份与当前 workspace 不匹配时拒绝。
     * @example
     * ```ts
     * const grants = await coordinator.listGrants({ goalId, runId });
     * ```
     */
    async listGrants(ref: RunRef): Promise<readonly UnifiedGrantSummary[]> {
        if (this.workspaceId === undefined) {
            throw new Error("Workspace identity is unavailable");
        }
        const goal = await this.restore(ref);
        if (goal === undefined || goal.state.run.id !== ref.runId) throw new Error("Run not found");
        const service = new DefaultPermissionGrantService(
            this.toolGrantStore ?? {
                findActiveMatching: async () => undefined,
                stage: async () => { throw new Error("Unavailable"); },
                activate: async () => { throw new Error("Unavailable"); },
                list: async () => [],
                revoke: async () => { throw new Error("Unavailable"); },
            },
            this.sandboxGrantStore ?? {
                findActiveMatching: async () => undefined,
                stage: async () => { throw new Error("Unavailable"); },
                activate: async () => { throw new Error("Unavailable"); },
                list: async () => [],
                revoke: async () => { throw new Error("Unavailable"); },
            },
        );
        return service.list({ workspaceId: this.workspaceId, goalId: goal.id });
    }

    /**
     * 统一撤销一条 Tool 或 Sandbox 持续授权。
     *
     * @param request - 目标 Run、类别和 Grant ID。
     * @throws Run 不存在、Grant 越权或存储写入失败时拒绝。
     * @example
     * ```ts
     * await coordinator.revokeGrant({ ref, kind: "sandbox", grantId: "grant-1" });
     * ```
     */
    async revokeGrant(request: {
        readonly ref: RunRef;
        readonly kind: "tool" | "sandbox";
        readonly grantId: string;
    }): Promise<void> {
        if (this.workspaceId === undefined) {
            throw new Error("Workspace identity is unavailable");
        }
        const goal = await this.restore(request.ref);
        if (goal === undefined) throw new Error("Run not found");
        if (goal.state.run.id !== request.ref.runId) throw new Error("Run reference does not match the current Goal");

        let scope: "goal" | "workspace";
        if (request.kind === "tool") {
            if (this.toolGrantStore === undefined) throw new Error("Tool Grant storage is unavailable");
            const revoked = await this.toolGrantStore.revoke({
                grantId: request.grantId,
                workspaceId: this.workspaceId,
                goalId: goal.id,
            });
            scope = revoked.scope;
        } else if (request.kind === "sandbox") {
            if (this.sandboxGrantStore === undefined) throw new Error("Sandbox Grant storage is unavailable");
            const revoked = await this.sandboxGrantStore.revoke({
                grantId: request.grantId,
                workspaceId: this.workspaceId,
                goalId: goal.id,
            });
            scope = revoked.scope;
        } else {
            throw new Error(`Unsupported grant kind: ${request.kind as string}`);
        }

        if (request.kind === "tool") {
            await this.appendTrajectory({
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "executing",
                eventType: "tool_grant_revoked",
                payload: {
                    type: "tool_grant_revoked",
                    grantId: request.grantId,
                    scope,
                },
            });
        } else {
            await this.appendTrajectory({
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "executing",
                eventType: "sandbox_grant_revoked",
                payload: {
                    type: "sandbox_grant_revoked",
                    grantId: request.grantId,
                    scope,
                },
            });
        }
        await this.saveCheckpoint(goal);
    }

    /**
     * 查询指定或当前工作区的权限执行模式。
     *
     * @param workspaceId - 可选的工作区标识，省略时使用当前 Coordinator 绑定的 workspaceId。
     * @returns 权限模式事实。若无存储或未配置，返回默认 default 模式。
     * @example
     * ```ts
     * const mode = await coordinator.getPermissionMode();
     * ```
     */
    async getPermissionMode(workspaceId?: string): Promise<ProjectPermissionMode> {
        const targetWorkspace = workspaceId ?? this.workspaceId ?? "default";
        if (this.permissionModeStore === undefined) {
            return { workspaceId: targetWorkspace, mode: "default", revision: 0 };
        }
        return this.permissionModeStore.get(targetWorkspace);
    }

    /**
     * 切换指定或当前工作区的权限执行模式。
     *
     * @param mode - 目标权限模式。
     * @param expectedRevision - 期望修订号。
     * @param workspaceId - 可选的工作区标识，省略时使用当前 Coordinator 绑定的 workspaceId。
     * @returns 更新后的权限模式事实。
     * @throws 版本冲突或存储故障时抛出异常。
     * @example
     * ```ts
     * const updated = await coordinator.setPermissionMode("yolo", current.revision);
     * ```
     */
    async setPermissionMode(
        mode: PermissionMode,
        expectedRevision: number,
        workspaceId?: string,
    ): Promise<ProjectPermissionMode> {
        const targetWorkspace = workspaceId ?? this.workspaceId ?? "default";
        if (this.permissionModeStore === undefined) {
            throw new Error("Permission mode store is not configured");
        }
        return this.permissionModeStore.set(targetWorkspace, mode, expectedRevision);
    }

    /**
     * 为未启动的当前 Run 或已完成 Run 的下一次 Run 选择 Plan Mode。
     *
     * @remarks
     * 同一 Goal 的模式选择与 `run_started` 提交按 Store 实例上的串行边界线性化。
     * 未启动 Run 的模式和事件一起提交；已完成或失败 Run 只把一次性选择写入
     * `nextRunMode`，由后续 Run 创建时消费。命令文本不会成为 Goal 消息或 Run
     * Step。重复选择不重复写入。已经提交 `run_started` 的普通 Run 及其它非终态
     * 等待点不能再切换；Trajectory 中存在未提交的 `run_started` 时也会拒绝。
     *
     * @param ref - Goal 与当前 Run 的关联键。
     * @param control - 当前调用共享的可选中止控制。
     * @returns 当前等待点、终态或稳定业务错误。
     * @example
     * ```ts
     * await coordinator.enterPlanMode({ goalId: "goal-1", runId: "run-1" });
     * ```
     */
    async enterPlanMode(
        ref: RunRef,
        control?: ExecutionControl,
    ): Promise<GoalProgressResult> {
        return withGoalMutationGate(this.store, ref.goalId, async () => {
            throwIfAborted(control);
            const goal = await this.restore(ref, control);
            throwIfAborted(control);
            if (goal === undefined) return this.runNotFound(ref);
            this.validateGoalProtocol(goal);

            if (goal.state.run.status === "completed" || goal.state.run.status === "failed") {
                if (goal.state.nextRunMode === "plan") {
                    return { ok: true, kind: "terminal", phase: "executing", goal };
                }
                const nextGoal: Goal = {
                    ...goal,
                    state: { ...goal.state, nextRunMode: "plan" },
                };
                const saved = await this.checkpointCommitter.saveCheckpoint(nextGoal, control);
                return { ok: true, kind: "terminal", phase: "executing", goal: saved };
            }

            if (goal.state.run.mode === "plan") {
                return goal.state.run.status === "waiting"
                    ? this.executingWaitingResult(goal)
                    : { ok: true, kind: "terminal", phase: "executing", goal };
            }

            if (goal.state.run.status !== "created") {
                return this.planModeBusy();
            }

            if (this.trajectoryStore !== undefined) {
                const boundary = await this.trajectoryStore.readWithBoundary(
                    { goalId: goal.id, runId: goal.state.run.id },
                    goal.state.run.committedThroughSequence ?? 0,
                );
                if (boundary.uncommittedTail.some((event) => event.payload.type === "run_started")) {
                    return this.planModeBusy();
                }
            }

            const planGoal: Goal = {
                ...goal,
                state: {
                    ...goal.state,
                    run: { ...goal.state.run, mode: "plan" },
                },
            };
            const committed = await this.checkpointCommitter.commit(planGoal, {
                facts: [{
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    eventType: "plan_mode_entered",
                    payload: { type: "plan_mode_entered" },
                }],
                ...(control === undefined ? {} : { control }),
            });
            this.publishCommittedEvents(committed, committed.events);
            return { ok: true, kind: "terminal", phase: "executing", goal: committed.goal };
        });
    }

    private planModeBusy(): GoalProgressResult {
        return {
            ok: false,
            error: {
                code: "PLAN_MODE_BUSY",
                message: "Plan Mode can only be selected before run_started is committed or after a Run completes or fails",
            },
        };
    }

    /**
     * 从最新快照自动推进 Goal。
     *
     * @param ref - Goal 与其当前 Run 的关联键。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns 下一等待点、执行终态或稳定业务失败。
     * @throws Scheduler 或 GoalStore 失败时传播原始异常；中止时抛出 `ExecutionAbortedError`。
     *
     * @example
     * ```ts
     * const result = await coordinator.advance({ goalId: "g-1", runId: "r-1" });
     * ```
     */
    async advance(
        ref: RunRef,
        control?: ExecutionControl,
    ): Promise<GoalProgressResult> {
        throwIfAborted(control);
        const goal = await this.restore(ref, control);
        throwIfAborted(control);

        if (goal === undefined) {
            return this.runNotFound(ref);
        }

        this.validateGoalProtocol(goal);

        if (
            goal.state.run.status === "created"
            || goal.state.run.status === "running"
        ) {
            await this.activatePendingGrant(goal);
            throwIfAborted(control);
            const scheduled = await this.scheduler.schedule(ref, undefined, control);
            throwIfAborted(control);
            return this.afterSchedule(ref, scheduled, control);
        }

        if (goal.state.run.status === "waiting") {
            return this.executingWaitingResult(goal);
        }

        if (
            goal.state.run.status === "completed"
            || goal.state.run.status === "failed"
            || goal.state.run.status === "cancelled"
        ) {
            return {
                ok: true,
                kind: "terminal",
                phase: "executing",
                goal,
            };
        }

        return {
            ok: false,
            error: {
                code: "INVALID_PHASE_RESULT",
                message: `Scheduler left Run "${ref.runId}" in ${goal.state.run.status}`,
            },
        };
    }

    /**
     * 为已完成或失败的 Run 创建并推进一个新的会话 Run。
     *
     * @remarks
     * `continue` 只接受当前 `completed`、`failed` 或 `cancelled` Run 和非空输入。它在同一个 Goal 内先
     * 归档上一 Run 的消息区间、追加真实用户消息、创建新 Run，并一次性消费
     * `nextRunMode`；没有待用选择时，新 Run 使用普通模式。新 Run 的创建提交与
     * `/plan` 选择共享同一按 Goal 串行化边界，快照成功后才调用 Scheduler。waiting
     * Run 仍必须走 {@link resume}，不会因为输入内容而创建新 Run。每个 Coordinator
     * 实例按 Goal 串行化 continue 请求，避免同一终态快照被两次消费。
     *
     * @param ref - 当前已完成或失败 Run 的 Goal/Run 关联键。
     * @param newInput - 要追加到 Goal.messages 的非空用户输入。
     * @param control - 当前会话调用共享的可选中止控制。
     * @param continuation - 可选的浏览器重试收据身份；持久化到被归档 Run 并指向新 Run。
     * @returns 新 Run 调度到 waiting 或终态后的结果；输入或状态非法时返回稳定错误。
     * @throws GoalStore、Trajectory 或 Scheduler 基础设施失败时传播原始异常。
     * @example
     * ```ts
     * const result = await coordinator.continue(
     *   { goalId: "goal-1", runId: "run-1" },
     *   "继续处理下一个计划项",
     * );
     * ```
     */
    async continue(
        ref: RunRef,
        newInput: string,
        control?: ExecutionControl,
        continuation?: { readonly messageId: string },
        queueBinding?: ContinuationQueueBinding,
    ): Promise<GoalProgressResult> {
        return this.withContinuationGate(ref.goalId, async () => {
            const preparation = await withGoalMutationGate(
                this.store,
                ref.goalId,
                async (): Promise<
                    | { readonly progress: GoalProgressResult }
                    | { readonly nextRef: RunRef }
                > => {
                    throwIfAborted(control);
                    if (newInput.trim().length === 0) {
                        return { progress: this.invalidGoalInput("Continuation input must not be empty") };
                    }

                    const goal = await this.restore(ref, control);
                    throwIfAborted(control);
                    if (goal === undefined) return { progress: this.runNotFound(ref) };
                    this.validateGoalProtocol(goal);

                    if (goal.state.run.status !== "completed" && goal.state.run.status !== "failed"
                        && goal.state.run.status !== "cancelled") {
                        return { progress: this.goalNotCompleted(ref) };
                    }

                    let queueState:
                        | {
                            readonly inputId: string;
                            readonly ledger: readonly SessionInputRecord[];
                            readonly queue: SessionMessageQueue;
                        }
                        | undefined;
                    if (queueBinding !== undefined) {
                        const queue = goal.state.messageQueue ?? { revision: 0, items: [] };
                        if (queue.revision !== queueBinding.queueRevision) {
                            return {
                                progress: {
                                    ok: false,
                                    error: {
                                        code: "QUEUE_REVISION_MISMATCH",
                                        message: `queueRevision ${queueBinding.queueRevision} does not match current revision ${queue.revision}`,
                                    },
                                },
                            };
                        }
                        const head = queue.items[0];
                        if (head === undefined || head.inputId !== queueBinding.inputId) {
                            return {
                                progress: {
                                    ok: false,
                                    error: {
                                        code: "QUEUE_REVISION_MISMATCH",
                                        message: `queued head does not match input "${queueBinding.inputId}"`,
                                    },
                                },
                            };
                        }
                        if (head.content !== newInput) {
                            return {
                                progress: this.invalidGoalInput(
                                    "Continuation input must match the queued message body",
                                ),
                            };
                        }
                        queueState = {
                            inputId: head.inputId,
                            ledger: (goal.state.inputLedger ?? []).map((record) =>
                                record.inputId === head.inputId && record.status === "pending"
                                    ? { ...record, status: "applied" as const }
                                    : record),
                            queue: {
                                revision: queue.revision + 1,
                                items: queue.items.slice(1),
                                ...(queue.pause === undefined ? {} : { pause: queue.pause }),
                            },
                        };
                    }

                    const runId = this.runIdGenerator();
                    if (
                        typeof runId !== "string"
                        || runId.trim().length === 0
                        || runId === goal.state.run.id
                        || (goal.state.completedRuns ?? []).some((record) => record.runId === runId)
                    ) {
                        return {
                            progress: this.invalidGoalInput("Run ID generator returned a duplicate or empty ID"),
                        };
                    }

                    const priorMessages = goal.state.messages;
                    const priorHistory = goal.state.completedRuns ?? [];
                    const historyEnd = priorMessages.length;
                    const previousRangeEnd = priorHistory.at(-1)?.messageRange.end ?? 0;
                    const history: CompletedRunRecord = {
                        runId: goal.state.run.id,
                        status: goal.state.run.status,
                        stepCount: goal.state.run.stepCount,
                        committedThroughSequence: goal.state.run.committedThroughSequence,
                        messageRange: {
                            start: previousRangeEnd,
                            end: historyEnd,
                        },
                        ...(continuation === undefined ? {} : {
                            continuation: { ...continuation, content: newInput, nextRunId: runId },
                        }),
                    };

                    const nextRunMode = goal.state.nextRunMode ?? "normal";
                    const nextRun = createRun(runId, nextRunMode);
                    const { nextRunMode: _consumedNextRunMode, ...stateWithoutNextRunMode } = goal.state;
                    const appended = appendGoalMessage(
                        {
                            ...goal,
                            state: {
                                ...stateWithoutNextRunMode,
                                messages: priorMessages,
                            },
                        },
                        {
                            role: "user",
                            content: newInput,
                            runId,
                            source: {
                                kind: "user_input",
                                inputId: queueState?.inputId ?? `continuation:${runId}`,
                            },
                        },
                    );
                    // 追加后的实际下标即该消息在对话中的位置；同源复用时保持原位置。
                    const messageIndex = appended.reused
                        ? priorMessages.findIndex((message) => message.messageId === appended.message.messageId)
                        : appended.goal.state.messages.length - 1;
                    const nextGoal: Goal = {
                        ...appended.goal,
                        state: {
                            ...appended.goal.state,
                            run: nextRun,
                            completedRuns: [...priorHistory, history],
                            ...(queueState === undefined
                                ? {}
                                : {
                                    inputLedger: queueState.ledger.map((record) => record.inputId === queueState.inputId
                                        ? { ...record, appliedRunId: runId, messageIndex }
                                        : record),
                                    messageQueue: queueState.queue,
                                }),
                        },
                    };

                    throwIfAborted(control);
                    const committed = await this.checkpointCommitter.commit(nextGoal, {
                        facts: [
                            {
                                goalId: goal.id,
                                runId,
                                phase: goal.state.workflow.phase,
                                eventType: "run_created",
                                payload: {
                                    type: "run_created",
                                    mode: nextRun.mode,
                                },
                            },
                            ...(queueBinding === undefined
                                ? []
                                : [{
                                    goalId: goal.id,
                                    runId,
                                    phase: goal.state.workflow.phase,
                                    eventType: "session_input_applied" as const,
                                    payload: {
                                        type: "session_input_applied" as const,
                                        inputId: queueBinding.inputId,
                                        runId,
                                        messageIndex,
                                    },
                                }]),
                        ],
                        ...(queueBinding === undefined ? {} : { sessionState: "caller" as const }),
                        ...(control === undefined ? {} : { control }),
                    });
                    this.publishCommittedEvents(committed, committed.events);
                    throwIfAborted(control);
                    return { nextRef: { goalId: goal.id, runId } };
                },
            );
            if ("progress" in preparation) return preparation.progress;

            const scheduled = await this.scheduler.schedule(preparation.nextRef, undefined, control);
            throwIfAborted(control);
            return this.afterSchedule(preparation.nextRef, scheduled, control);
        });
    }

    /**
     * 将用户补充输入交给同一 Run 的执行器持久化受理。
     *
     * @remarks
     * Steer 不创建新 Run，也不取消当前模型或工具调用；执行器在后续模型边界应用。
     * Coordinator 不直接改写 Goal Snapshot，受理与检查点提交由 Scheduler 中的 Runner 串行化。
     *
     * @param ref - 当前 Goal 与 Run 的稳定关联身份。
     * @param messageId - 客户端生成的幂等身份；相同身份与正文可安全重试。
     * @param content - 非空的补充或修正文本。
     * @param ledger - 提供时在同一提交中写入统一输入账本条目；queueBinding 会原子消费匹配的队列消息。
     * @returns 持久化受理、幂等重试或稳定拒绝结果。
     * @throws Runner 的 Snapshot 或 Trajectory 提交失败时传播错误。
     * @example
     * ```ts
     * const result = await coordinator.steer({ goalId, runId }, "message-1", "不要修改公开接口");
     * ```
     */
    steer(
        ref: RunRef,
        messageId: string,
        content: string,
        ledger?: {
            readonly digest: SessionInputDigest;
            readonly queueBinding?: { readonly messageId: string; readonly queueRevision: number };
        },
    ): Promise<SteerInputResult> {
        return this.scheduler.steer === undefined
            ? Promise.resolve({ ok: false, error: "RUN_CONTROL_UNAVAILABLE" })
            : this.scheduler.steer(ref, messageId, content, ledger);
    }

    /**
     * 持久化受理当前 Run 的用户 Interrupt，并请求其执行所有者停止原调用。
     *
     * @param ref - 当前 Goal 与 Run 的稳定身份。
     * @param requestId - 客户端稳定请求身份，用于受理结果重试。
     * @param ledger - 提供时在同一提交中写入统一输入账本收据并暂停队列。
     * @returns 已保存的终止意图或稳定拒绝；受理不表示收尾已经结束。
     * @throws Snapshot 或 Trajectory 提交失败时传播原始错误。
     * @example
     * ```ts
     * const result = await coordinator.interrupt({ goalId, runId }, "interrupt-1");
     * ```
     */
    interrupt(
        ref: RunRef,
        requestId: string,
        ledger?: { readonly digest: SessionInputDigest },
    ): Promise<InterruptRunResult> {
        return this.scheduler.interrupt === undefined
            ? Promise.resolve({ ok: false, error: "INTERRUPT_CONFLICT" })
            : this.scheduler.interrupt(ref, requestId, ledger);
    }

    /**
     * 只读预检同一工具的最终参数与实际权限范围。
     *
     * @remarks
     * 预检只重新准备参数、规划执行准入、权限与沙箱范围，并返回可审阅结果；它
     * 不保存批准、不暂存或激活 Grant、不解除等待、不调用业务工具，也不隐式触发
     * 宿主审批回调。多个客户端各自预检时互不覆盖草稿或持久化候选。
     *
     * 预检只接受处于首次审批等待、尚未开始执行的当前操作；工具身份、Goal／Run、
     * PTC 程序与调用位置不能由修订请求替换。
     *
     * @param request - 当前操作引用、拟修订参数与拟授权期限。
     * @param control - 当前调用共享的可选中止控制。
     * @returns 可审阅结果，或可定位的稳定拒绝。
     * @throws GoalStore 读取失败时传播原始异常。
     * @example
     * ```ts
     * const result = await coordinator.reviewActionApproval({
     *     ref: { goalId: "goal-1", runId: "run-1" },
     *     actionId: "action-1",
     *     input: { path: "b.txt", content: "x" },
     *     scope: "action",
     * });
     * ```
     */
    async reviewActionApproval(
        request: {
            readonly ref: RunRef;
            readonly actionId: string;
            readonly input?: JsonValue | undefined;
            readonly scope?: ActionApprovalScope | undefined;
        },
        control?: ExecutionControl,
    ): Promise<ActionApprovalReviewResult> {
        throwIfAborted(control);
        const goal = await this.restore(request.ref, control);
        throwIfAborted(control);
        if (goal === undefined) {
            return {
                ok: false,
                code: "ACTION_NOT_AWAITING_APPROVAL",
                message: `Goal "${request.ref.goalId}" was not found`,
            };
        }

        const pending = goal.state.run.pendingAction;
        if (pending === undefined || pending.status !== "awaiting_approval") {
            return {
                ok: false,
                code: "ACTION_NOT_AWAITING_APPROVAL",
                message: "Only a first-time approval wait can be reviewed or revised",
            };
        }

        if (pending.action.actionId !== request.actionId) {
            return {
                ok: false,
                code: "ACTION_ID_MISMATCH",
                message: `Action "${request.actionId}" is not the current pending Action`,
            };
        }

        const scope = request.scope ?? "action";
        const availableScopes = this.availableApprovalScopes(pending.approvalKind);
        if (!availableScopes.includes(scope)) {
            return {
                ok: false,
                code: "SCOPE_UNAVAILABLE",
                message: `Persistent authorization scope "${scope}" is unavailable for this workspace`,
            };
        }

        const prepared = await this.prepareApprovalReview(
            pending.action.toolId,
            request.input === undefined ? pending.action.input : request.input,
            control,
        );
        if (!prepared.ok) return prepared;

        const reviewRef = computeActionApprovalReviewRef({
            actionId: pending.action.actionId,
            toolId: pending.action.toolId,
            originalInput: pending.action.input,
            finalInput: prepared.finalInput,
            scope,
            capability: prepared.capability,
        });

        const review: ActionApprovalReview = {
            actionId: pending.action.actionId,
            toolId: pending.action.toolId,
            originalInput: structuredClone(pending.action.input),
            finalInput: structuredClone(prepared.finalInput),
            changed: JSON.stringify(prepared.finalInput) !== JSON.stringify(pending.action.input),
            scope,
            availableScopes,
            capability: prepared.capability,
            requiresSandboxApproval: prepared.requiresSandboxApproval,
            reviewRef,
        };
        return { ok: true, review };
    }

    /** 计算当前工作区真正可用的授权期限。 */
    private availableApprovalScopes(
        approvalKind: "tool" | "sandbox" | undefined,
    ): readonly ActionApprovalScope[] {
        if (this.workspaceId === undefined) return ["action"];
        const persistent = approvalKind === "sandbox"
            ? this.sandboxGrantStore !== undefined
            : this.toolGrantStore !== undefined;
        return persistent ? ["action", "goal", "workspace"] : ["action"];
    }

    /**
     * 按最终获批参数与范围暂存持续授权。
     *
     * @remarks 暂存发生在批准快照提交之前；只有被该批准引用的一条记录才会被激活。
     * 匹配器按最终参数重新生成，不沿用旧范围或旧输入匹配器。
     */
    private async stageApprovalGrant(
        goal: Goal,
        pendingAction: NonNullable<Goal["state"]["run"]["pendingAction"]>,
        finalInput: JsonValue,
        approvalScope: "goal" | "workspace",
        approvalInputId: string,
        control?: ExecutionControl,
    ): Promise<{ readonly ok: true; readonly grantId: string } | { readonly ok: false; readonly message: string }> {
        if (this.workspaceId === undefined) {
            return { ok: false, message: "Persistent authorization is unavailable for this workspace" };
        }

        if (pendingAction.approvalKind === "sandbox") {
            if (this.sandboxGrantStore === undefined) {
                return { ok: false, message: "Persistent Sandbox authorization is unavailable for this workspace" };
            }
            const effectiveScope = pendingAction.effectiveSandboxScope ?? { extraFiles: [], network: "none" };
            const matcher = createSandboxGrantMatcher(
                pendingAction.action.toolId,
                finalInput,
                effectiveScope,
            );
            const grant = await this.sandboxGrantStore.stage({
                scope: approvalScope,
                ...(approvalScope === "goal" ? { goalId: goal.id } : {}),
                workspaceId: this.workspaceId,
                source: {
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    actionId: pendingAction.action.actionId,
                    approvalInputId,
                },
                matcher,
            });
            return { ok: true, grantId: grant.id };
        }

        if (this.toolGrantStore === undefined) {
            return { ok: false, message: "Persistent Tool authorization is unavailable for this workspace" };
        }
        const registration = this.toolRegistry.get(pendingAction.action.toolId);
        if (registration === undefined) {
            return { ok: false, message: "Cannot authorize an unregistered Tool" };
        }
        const prepared = registration.prepare(finalInput, control);
        if (!prepared.ok) {
            return { ok: false, message: "Cannot authorize an Action with invalid Tool input" };
        }
        const matcher = await createToolGrantMatcher(
            pendingAction.action.toolId,
            prepared.input,
            this.workspaceRoot,
        );
        const grant = await this.toolGrantStore.stage({
            scope: approvalScope,
            ...(approvalScope === "goal" ? { goalId: goal.id } : {}),
            workspaceId: this.workspaceId,
            source: {
                goalId: goal.id,
                runId: goal.state.run.id,
                actionId: pendingAction.action.actionId,
                approvalInputId,
            },
            matcher,
        });
        return { ok: true, grantId: grant.id };
    }

    /**
     * 重新准备拟审阅参数并计算实际目标与能力范围。
     *
     * @remarks 只做参数与路径元数据准备，不执行工具、不调用模型、不保存候选。
     */
    private async prepareApprovalReview(
        toolId: string,
        proposedInput: JsonValue,
        control?: ExecutionControl,
    ): Promise<
        | {
            readonly ok: true;
            readonly finalInput: JsonValue;
            readonly capability: ActionApprovalCapability;
            readonly requiresSandboxApproval: boolean;
            readonly effectiveSandboxScope: EffectiveSandboxScope;
        }
        | {
            readonly ok: false;
            readonly code: "TOOL_NOT_FOUND" | "INVALID_TOOL_INPUT" | "SANDBOX_SCOPE_UNAVAILABLE";
            readonly message: string;
            readonly issues?: readonly { readonly path: readonly (string | number)[]; readonly message: string }[] | undefined;
        }
    > {
        const registration = this.toolRegistry.get(toolId);
        if (registration === undefined) {
            return { ok: false, code: "TOOL_NOT_FOUND", message: `Tool "${toolId}" is not registered` };
        }

        let prepared;
        try {
            prepared = registration.prepare(proposedInput, control);
            throwIfAborted(control);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            throwIfAborted(control);
            return {
                ok: false,
                code: "INVALID_TOOL_INPUT",
                message: error instanceof Error ? error.message : String(error),
            };
        }

        if (!prepared.ok) {
            return {
                ok: false,
                code: "INVALID_TOOL_INPUT",
                message: prepared.error.message,
                ...(prepared.error.issues === undefined
                    ? {}
                    : { issues: prepared.error.issues.map((issue) => ({ path: [...issue.path], message: issue.message })) }),
            };
        }

        const finalInput = prepared.input;
        let sandboxAccessRequest: SandboxAccessRequest | undefined;
        if (typeof prepared.resolveSandboxAccess === "function") {
            const derived = await prepared.resolveSandboxAccess(control);
            if (derived !== undefined) sandboxAccessRequest = derived;
        } else if (isJsonRecord(finalInput) && isJsonRecord(finalInput.sandboxAccess)) {
            sandboxAccessRequest = finalInput.sandboxAccess as unknown as SandboxAccessRequest;
        }

        let effectiveSandboxScope: EffectiveSandboxScope = { extraFiles: [], network: "none" };
        if (this.workspaceRoot !== undefined && sandboxAccessRequest !== undefined) {
            try {
                effectiveSandboxScope = await resolveEffectiveSandboxScope(
                    this.workspaceRoot,
                    sandboxAccessRequest,
                );
            } catch (error) {
                if (isExecutionAbortedError(error)) throw error;
                return {
                    ok: false,
                    code: "SANDBOX_SCOPE_UNAVAILABLE",
                    message: error instanceof Error ? error.message : String(error),
                };
            }
        }

        let targetPaths: string[] = [];
        try {
            const matcher = await createToolGrantMatcher(toolId, finalInput, this.workspaceRoot);
            if (matcher.kind === "target_path") targetPaths.push(matcher.path);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            return {
                ok: false,
                code: "INVALID_TOOL_INPUT",
                message: error instanceof Error ? error.message : String(error),
            };
        }
        targetPaths.push(...effectiveSandboxScope.extraFiles.map((file) => file.canonicalPath));

        const requiresSandboxApproval = evaluateSandboxAuthorization({
            isSeatbeltSupported: isSeatbeltSupported(),
            workspaceRoot: this.workspaceRoot,
            effectiveScope: effectiveSandboxScope,
        }).decision === "approval_required";

        return {
            ok: true,
            finalInput,
            capability: {
                network: effectiveSandboxScope.network,
                extraFiles: effectiveSandboxScope.extraFiles,
                targetPaths: [...new Set(targetPaths)].sort(),
            },
            requiresSandboxApproval,
            effectiveSandboxScope,
        };
    }

    /**
     * 提交交互等待中的用户操作（问答、任务提案批准/反馈、工具审核或消息）。
     *
     * @remarks
     * 交互恢复处理逻辑：
     * - `ask_user`: 校验 requestId 和答案结构，写入 `ask_user_answered` 事实并解除等待；
     * - `task_approval`: 批准或反馈必须匹配当前提案 requestId。批准固定任务并推进
     *   ContextEpoch；反馈写入用户消息与 Trajectory，使旧请求失效后在同一 Run 重新规划；
     * - `approve_action`/`approve_action_revision`: 批准首次未执行的工具调用，可附带修订后的最终参数版本；
     * - `reject_action`: 拒绝首次未执行的工具调用；
     * - `retry_unknown_action`/`decline_unknown_action_retry`: 明确允许或拒绝结果未知的操作按获批版本再次执行；
     * - `message`: 解除因 wait 决策引起的 blocked 等待。
     * Goal/Run 引用不匹配时返回 `RUN_NOT_FOUND`；任务请求 ID 过期时返回
     * `INVALID_GOAL_INPUT`，两者均保留当前等待点。有效恢复先保存快照，再调用
     * {@link advance}。
     *
     * @param request - 当前 RunRef 与用户操作。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns 保存后自动推进得到的下一等待点或执行终态。
     * @throws GoalStore 或 Scheduler 失败时传播原始异常；中止时抛出 `ExecutionAbortedError`。
     *
     * @example
     * ```ts
     * const result = await coordinator.resume({
     *   ref: { goalId: "g-1", runId: "r-1" },
     *   action: { kind: "approve_task", requestId: "proposal-1" },
     * });
     * ```
     */
    async resume(
        request: ResumeGoalRequest,
        control?: ExecutionControl,
    ): Promise<GoalProgressResult> {
        throwIfAborted(control);
        const goal = await this.restore(request.ref, control);
        throwIfAborted(control);

        if (goal === undefined) {
            return this.runNotFound(request.ref);
        }

        this.validateGoalProtocol(goal);

        if (goal.state.run.status !== "waiting") {
            return this.goalNotWaiting(request.ref);
        }

        // 已受理但尚未处理的停止先于本次决定：旧等待的回答与批准都必须失效。
        if (goal.state.run.interruption?.status === "requested") {
            return this.invalidGoalInput(
                `Run "${request.ref.runId}" was interrupted by "${goal.state.run.interruption.requestId}"; the previous wait can no longer be answered`,
            );
        }

        const pendingInteraction = goal.state.run.pendingInteraction;
        if (pendingInteraction !== undefined) {
            if (pendingInteraction.kind === "ask_user") {
                if (request.action.kind === "skip_question" || request.action.kind === "reply_to_question") {
                    return this.resolveAskUserWithoutAnswers(
                        goal,
                        pendingInteraction,
                        request.action,
                        request.ref,
                        control,
                    );
                }

                if (request.action.kind !== "answer_ask_user") {
                    return this.invalidGoalInput(
                        "ask_user interaction requires an answer_ask_user, reply_to_question or skip_question action",
                    );
                }

                if (request.action.requestId.trim().length === 0) {
                    return this.invalidGoalInput("requestId must not be empty");
                }

                if (request.action.requestId !== pendingInteraction.requestId) {
                    return this.invalidGoalInput(
                        `Submitted requestId "${request.action.requestId}" does not match pendingInteraction requestId "${pendingInteraction.requestId}"`,
                    );
                }

                try {
                    validateAskUserAnswers(pendingInteraction.questions, request.action.answers);
                } catch (error) {
                    return this.invalidGoalInput(
                        error instanceof Error ? error.message : String(error),
                    );
                }

                const resolvedRun = transition(goal.state.run, {
                    kind: "resolve_interaction",
                    interactionKind: "ask_user",
                });

                if (!resolvedRun.ok) {
                    throw new Error(
                        `GoalCoordinator invariant violated: ${resolvedRun.error.message}`,
                    );
                }

                const answerContent = formatAskUserAnswers(
                    pendingInteraction.questions,
                    request.action.answers,
                );

                const routeRevision = pendingInteraction.routeRevision;
                const approvedRouteRevision = routeRevision !== undefined
                    && request.action.answers.some((answer) => answer.questionId === "q-1"
                        && answer.optionIds.length === 1
                        && answer.optionIds[0] === routeRevision.approvalOptionId
                        && answer.otherText === undefined);
                let nextRunState = resolvedRun.state;
                let revisedRouteEvent: TrajectoryEventDraft | undefined;
                if (routeRevision !== undefined && approvedRouteRevision) {
                    const currentRoute = goal.state.run.planRoute;
                    if (currentRoute === undefined || currentRoute.revision !== routeRevision.baseRevision) {
                        return this.invalidGoalInput("Pending route revision no longer matches the current Plan route");
                    }
                    const revised = reviseRunPlanExecution(
                        currentRoute,
                        routeRevision.candidate,
                        routeRevision.reason,
                        goal.state.run.currentStage,
                    );
                    nextRunState = {
                        ...nextRunState,
                        planRoute: revised.route,
                        ...(revised.currentStage === undefined ? {} : { currentStage: revised.currentStage }),
                    };
                    revisedRouteEvent = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        eventType: "run_plan_route_revised",
                        payload: { type: "run_plan_route_revised", route: revised.route, reason: routeRevision.reason },
                    };
                }

                const resumedGoal: Goal = appendGoalMessage(
                    goal,
                    {
                        role: "user",
                        content: answerContent,
                        runId: goal.state.run.id,
                        source: {
                            kind: "interaction_response",
                            requestId: pendingInteraction.requestId,
                        },
                    },
                ).goal;
                const resumedGoalWithRun: Goal = {
                    ...resumedGoal,
                    state: {
                        ...resumedGoal.state,
                        run: nextRunState,
                    },
                };

                throwIfAborted(control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    eventType: "run_resumed",
                    payload: { type: "run_resumed" },
                }, control);

                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    eventType: "ask_user_answered",
                    payload: {
                        type: "ask_user_answered",
                        requestId: pendingInteraction.requestId,
                        answers: request.action.answers,
                    },
                }, control);

                if (revisedRouteEvent !== undefined) {
                    await this.appendTrajectory(revisedRouteEvent, control);
                }

                await this.saveCheckpoint(resumedGoalWithRun, control);
                return this.advance(request.ref, control);
            }

            if (pendingInteraction.kind === "task_approval") {
                if (
                    request.action.kind === "approve_task"
                    || request.action.kind === "approve"
                ) {
                    if (request.action.requestId.trim().length === 0) {
                        return this.invalidGoalInput("Task approval requestId must not be empty");
                    }

                    if (request.action.requestId !== pendingInteraction.requestId) {
                        return this.invalidGoalInput(
                            `Submitted requestId "${request.action.requestId}" does not match pendingInteraction requestId "${pendingInteraction.requestId}"`,
                        );
                    }

                    const proposal = pendingInteraction.proposal;
                    const epoch = this.advanceGoalContextEpoch(goal, "task_approved");
                    const resolvedRun = transition(epoch.goal.state.run, {
                        kind: "resolve_interaction",
                        interactionKind: "task_approval",
                    });

                    if (!resolvedRun.ok) {
                        throw new Error(
                            `GoalCoordinator invariant violated: ${resolvedRun.error.message}`,
                        );
                    }

                    const { currentStage: _currentStage, ...approvedRun } = resolvedRun.state;
                    const approvedGoal: Goal = {
                        ...epoch.goal,
                        state: {
                            ...epoch.goal.state,
                            run: {
                                ...approvedRun,
                                approvedTask: cloneTask(proposal),
                                planRoute: createRunPlanRoute(pendingInteraction.planRouteCandidate),
                            },
                        },
                    };

                    throwIfAborted(control);
                    await this.appendTrajectory({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        eventType: "run_resumed",
                        payload: { type: "run_resumed" },
                    }, control);
                    await this.appendTrajectory(epoch.fact, control);
                    await this.appendTrajectory({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        eventType: "task_approved",
                        payload: {
                            type: "task_approved",
                            requestId: pendingInteraction.requestId,
                            task: proposal,
                        },
                    }, control);

                    await this.saveCheckpoint(approvedGoal, control);
                    return this.advance(request.ref, control);
                }

                if (request.action.kind === "feedback_task") {
                    const feedbackText = request.action.feedback;

                    if (feedbackText.trim().length === 0) {
                        return this.invalidGoalInput("Feedback must not be empty");
                    }

                    if (request.action.requestId.trim().length === 0) {
                        return this.invalidGoalInput("Task feedback requestId must not be empty");
                    }

                    if (request.action.requestId !== pendingInteraction.requestId) {
                        return this.invalidGoalInput(
                            `Submitted requestId "${request.action.requestId}" does not match pendingInteraction requestId "${pendingInteraction.requestId}"`,
                        );
                    }

                    const resolvedRun = transition(goal.state.run, {
                        kind: "resolve_interaction",
                        interactionKind: "task_approval",
                    });

                    if (!resolvedRun.ok) {
                        throw new Error(
                            `GoalCoordinator invariant violated: ${resolvedRun.error.message}`,
                        );
                    }

                    const feedbackMessage = appendGoalMessage(goal, {
                        role: "user",
                        content: feedbackText,
                        runId: goal.state.run.id,
                        source: {
                            kind: "interaction_response",
                            requestId: pendingInteraction.requestId,
                        },
                    }).goal;
                    const resumedGoal: Goal = {
                        ...feedbackMessage,
                        state: {
                            ...feedbackMessage.state,
                            run: resolvedRun.state,
                        },
                    };

                    throwIfAborted(control);
                    await this.appendTrajectory({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        eventType: "run_resumed",
                        payload: { type: "run_resumed" },
                    }, control);
                    await this.appendTrajectory({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        eventType: "task_feedback_received",
                        payload: {
                            type: "task_feedback_received",
                            requestId: pendingInteraction.requestId,
                            feedback: feedbackText,
                        },
                    }, control);

                    await this.saveCheckpoint(resumedGoal, control);
                    return this.advance(request.ref, control);
                }

                return this.invalidGoalInput(
                    "task_approval interaction requires request-bound approve_task or feedback_task",
                );
            }

            return this.invalidGoalInput("Unknown pending interaction kind");
        }

        const pendingAction = goal.state.run.pendingAction;
        if (pendingAction !== undefined) {
            if (request.action.kind === "approve_action") {
                if (pendingAction.status !== "awaiting_approval") {
                    return this.invalidGoalInput(
                        "approve_action only applies to a first-time approval wait; unknown outcomes require an explicit re-execution decision",
                    );
                }

                if (request.action.actionId.trim().length === 0) {
                    return this.invalidGoalInput("Action ID must not be empty");
                }

                if (request.action.actionId !== pendingAction.action.actionId) {
                    return this.invalidGoalInput(
                        "Approved actionId does not match pendingAction",
                    );
                }

                const approvalScope = request.action.scope ?? "action";
                if (!this.availableApprovalScopes(pendingAction.approvalKind).includes(approvalScope)) {
                    return this.invalidGoalInput(
                        `Persistent authorization scope "${approvalScope}" is unavailable for this workspace`,
                    );
                }

                const approvalInputId = request.action.approvalInputId
                    ?? computeApprovalInputId({
                        actionId: pendingAction.action.actionId,
                        toolId: pendingAction.action.toolId,
                        scope: approvalScope,
                        finalInput: pendingAction.action.input,
                    });

                let grantId: string | undefined;
                if (approvalScope !== "action") {
                    const staged = await this.stageApprovalGrant(
                        goal,
                        pendingAction,
                        pendingAction.action.input,
                        approvalScope,
                        approvalInputId,
                        control,
                    );
                    if (!staged.ok) return this.invalidGoalInput(staged.message);
                    grantId = staged.grantId;
                }

                const approvedRun = transition(goal.state.run, {
                    kind: "approve_action",
                    actionId: request.action.actionId,
                    approvalScope,
                    ...(grantId === undefined ? {} : { grantId }),
                    approvalInputId,
                });

                if (!approvedRun.ok) {
                    throw new Error(
                        `GoalCoordinator invariant violated: ${approvedRun.error.message}`,
                    );
                }

                const approvedGoal: Goal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        run: approvedRun.state,
                    },
                };
                throwIfAborted(control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    actionId: request.action.actionId,
                    ...(pendingAction.executionUnitId === undefined
                        ? {}
                        : { executionUnitId: pendingAction.executionUnitId }),
                    eventType: "action_approved",
                    payload: {
                        type: "action_approved",
                        actionId: request.action.actionId,
                        approvalScope,
                        ...(grantId === undefined ? {} : { grantId }),
                        approvalInputId,
                    },
                }, control);
                await this.saveCheckpoint(approvedGoal, control);
                throwIfAborted(control);
                if (grantId !== undefined) {
                    await this.activatePendingGrant(approvedGoal);
                }
                const scheduled = await this.scheduler.schedule(
                    request.ref,
                    { authorizedActionId: request.action.actionId },
                    control,
                );
                throwIfAborted(control);
                return this.afterSchedule(request.ref, scheduled, control);
            }

            if (request.action.kind === "approve_action_revision") {
                if (pendingAction.status !== "awaiting_approval") {
                    return this.invalidGoalInput(
                        "approve_action_revision only applies to a first-time approval wait",
                    );
                }

                if (request.action.actionId.trim().length === 0) {
                    return this.invalidGoalInput("Action ID must not be empty");
                }

                if (request.action.actionId !== pendingAction.action.actionId) {
                    return this.invalidGoalInput(
                        "Approved actionId does not match pendingAction",
                    );
                }

                if (request.action.reviewRef.trim().length === 0) {
                    return this.invalidGoalInput(
                        "An approval revision requires the review reference it was prepared with",
                    );
                }

                const approvalScope = request.action.scope ?? "action";
                if (!this.availableApprovalScopes(pendingAction.approvalKind).includes(approvalScope)) {
                    return this.invalidGoalInput(
                        `Persistent authorization scope "${approvalScope}" is unavailable for this workspace`,
                    );
                }

                const prepared = await this.prepareApprovalReview(
                    pendingAction.action.toolId,
                    request.action.input,
                    control,
                );
                if (!prepared.ok) {
                    return this.invalidGoalInput(
                        `Approval revision cannot be prepared: ${prepared.message}`,
                    );
                }

                const reviewRef = computeActionApprovalReviewRef({
                    actionId: pendingAction.action.actionId,
                    toolId: pendingAction.action.toolId,
                    originalInput: pendingAction.action.input,
                    finalInput: prepared.finalInput,
                    scope: approvalScope,
                    capability: prepared.capability,
                });
                if (reviewRef !== request.action.reviewRef) {
                    return this.invalidGoalInput(
                        "The approval review is no longer current; review the action again before approving",
                    );
                }

                const approvalKind = prepared.requiresSandboxApproval
                    ? "sandbox" as const
                    : pendingAction.approvalKind;

                const approvalInputId = request.action.approvalInputId
                    ?? computeApprovalInputId({
                        actionId: pendingAction.action.actionId,
                        toolId: pendingAction.action.toolId,
                        scope: approvalScope,
                        finalInput: prepared.finalInput,
                    });

                let grantId: string | undefined;
                if (approvalScope !== "action") {
                    const staged = await this.stageApprovalGrant(
                        goal,
                        approvalKind === undefined
                            ? pendingAction
                            : { ...pendingAction, approvalKind },
                        prepared.finalInput,
                        approvalScope,
                        approvalInputId,
                        control,
                    );
                    if (!staged.ok) return this.invalidGoalInput(staged.message);
                    grantId = staged.grantId;
                }

                const executionVersion: ActionExecutionVersion = {
                    original: {
                        actionId: pendingAction.action.actionId,
                        toolId: pendingAction.action.toolId,
                        input: structuredClone(pendingAction.action.input),
                    },
                    input: structuredClone(prepared.finalInput),
                    reviewRef,
                    scope: approvalScope,
                    revision: { source: "user" },
                };

                const invalidatedBatchActionIds = (goal.state.run.pendingActionBatch?.remaining ?? [])
                    .map((action) => action.actionId);
                const approvedRun = transition(goal.state.run, {
                    kind: "approve_action_revision",
                    actionId: request.action.actionId,
                    approvalScope,
                    ...(grantId === undefined ? {} : { grantId }),
                    approvalInputId,
                    executionVersion,
                    effectiveSandboxScope: prepared.effectiveSandboxScope,
                    ...(approvalKind === undefined ? {} : { approvalKind }),
                });

                if (!approvedRun.ok) {
                    throw new Error(
                        `GoalCoordinator invariant violated: ${approvedRun.error.message}`,
                    );
                }

                // 修订使同批次尚未开始的旧决策失效：模型在知晓实际参数后重新决策。
                const { pendingActionBatch: _invalidatedBatch, ...runWithoutBatch } = approvedRun.state;
                const revisedRun: RunState = invalidatedBatchActionIds.length === 0
                    ? approvedRun.state
                    : runWithoutBatch;
                const approvedGoal: Goal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        run: revisedRun,
                    },
                };
                throwIfAborted(control);
                const revisionProgram = goal.state.run.pendingProgram;
                const revisionAssociation = revisionProgram === undefined ? {} : {
                    executionUnitId: `${revisionProgram.executionUnitId}:call:${revisionProgram.nextCallIndex}`,
                    programId: revisionProgram.programId,
                    callIndex: revisionProgram.nextCallIndex,
                };
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    actionId: request.action.actionId,
                    ...revisionAssociation,
                    eventType: "action_revised",
                    payload: {
                        type: "action_revised",
                        actionId: request.action.actionId,
                        reviewRef,
                        originalInput: structuredClone(pendingAction.action.input),
                        finalInput: structuredClone(prepared.finalInput),
                        approvalScope,
                        ...(grantId === undefined ? {} : { grantId }),
                        approvalInputId,
                        revisionSource: executionVersion.revision?.source ?? "user",
                        effectiveSandboxScope: structuredClone(prepared.effectiveSandboxScope),
                        ...(invalidatedBatchActionIds.length === 0
                            ? {}
                            : { invalidatedBatchActionIds }),
                    },
                }, control);
                await this.saveCheckpoint(approvedGoal, control);
                throwIfAborted(control);
                if (grantId !== undefined) {
                    await this.activatePendingGrant(approvedGoal);
                }
                const scheduled = await this.scheduler.schedule(
                    request.ref,
                    { authorizedActionId: request.action.actionId },
                    control,
                );
                throwIfAborted(control);
                return this.afterSchedule(request.ref, scheduled, control);
            }

            if (request.action.kind === "retry_unknown_action") {
                if (pendingAction.status !== "outcome_unknown") {
                    return this.invalidGoalInput(
                        "retry_unknown_action only applies to an unknown-outcome wait",
                    );
                }

                if (request.action.actionId.trim().length === 0) {
                    return this.invalidGoalInput("Action ID must not be empty");
                }

                if (request.action.actionId !== pendingAction.action.actionId) {
                    return this.invalidGoalInput(
                        "Retried actionId does not match pendingAction",
                    );
                }

                if (resolveActionRecoveryRef(pendingAction) !== request.action.recoveryRef) {
                    return this.invalidGoalInput(
                        "The recovery reference no longer matches the current unknown outcome",
                    );
                }

                const approvedRun = transition(goal.state.run, {
                    kind: "retry_unknown_action",
                    actionId: request.action.actionId,
                    recoveryRef: request.action.recoveryRef,
                });

                if (!approvedRun.ok) {
                    throw new Error(
                        `GoalCoordinator invariant violated: ${approvedRun.error.message}`,
                    );
                }

                const approvedGoal: Goal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        run: approvedRun.state,
                    },
                };
                throwIfAborted(control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    actionId: request.action.actionId,
                    eventType: "action_reexecution_authorized",
                    payload: {
                        type: "action_reexecution_authorized",
                        actionId: request.action.actionId,
                        recoveryRef: request.action.recoveryRef,
                    },
                }, control);
                await this.saveCheckpoint(approvedGoal, control);
                throwIfAborted(control);
                const scheduled = await this.scheduler.schedule(
                    request.ref,
                    { authorizedActionId: request.action.actionId },
                    control,
                );
                throwIfAborted(control);
                return this.afterSchedule(request.ref, scheduled, control);
            }

            if (request.action.kind === "decline_unknown_action_retry") {
                if (pendingAction.status !== "outcome_unknown") {
                    return this.invalidGoalInput(
                        "decline_unknown_action_retry only applies to an unknown-outcome wait",
                    );
                }

                if (request.action.actionId.trim().length === 0) {
                    return this.invalidGoalInput("Action ID must not be empty");
                }

                if (request.action.actionId !== pendingAction.action.actionId) {
                    return this.invalidGoalInput(
                        "Declined actionId does not match pendingAction",
                    );
                }

                if (resolveActionRecoveryRef(pendingAction) !== request.action.recoveryRef) {
                    return this.invalidGoalInput(
                        "The recovery reference no longer matches the current unknown outcome",
                    );
                }

                if (request.action.reason.trim().length === 0) {
                    return this.invalidGoalInput("Declining a retry requires a reason");
                }

                const declinedRun = transition(goal.state.run, {
                    kind: "decline_unknown_action_retry",
                    actionId: request.action.actionId,
                    recoveryRef: request.action.recoveryRef,
                    reason: request.action.reason,
                });

                if (!declinedRun.ok) {
                    throw new Error(
                        `GoalCoordinator invariant violated: ${declinedRun.error.message}`,
                    );
                }

                const program = goal.state.run.pendingProgram;
                const declinedObservation = {
                    kind: "failure" as const,
                    code: "REEXECUTION_DECLINED",
                    message: request.action.reason,
                    retryable: false,
                };
                const programAssociation = program === undefined ? {} : {
                    executionUnitId: `${program.executionUnitId}:call:${program.nextCallIndex}`,
                    programId: program.programId,
                    callIndex: program.nextCallIndex,
                };
                const updatedRun = program === undefined ? declinedRun.state : {
                    ...declinedRun.state,
                    pendingProgram: {
                        ...declinedRun.state.pendingProgram!,
                        resultBytes: program.resultBytes + Buffer.byteLength(JSON.stringify({
                            observation: declinedObservation,
                            sourceReferences: [0],
                        })),
                    },
                };

                const declinedGoal: Goal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        run: updatedRun,
                    },
                };
                throwIfAborted(control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    actionId: request.action.actionId,
                    ...programAssociation,
                    eventType: "action_reexecution_declined",
                    payload: {
                        type: "action_reexecution_declined",
                        actionId: request.action.actionId,
                        recoveryRef: request.action.recoveryRef,
                        reason: request.action.reason,
                    },
                }, control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    actionId: request.action.actionId,
                    ...programAssociation,
                    eventType: "observation_recorded",
                    payload: {
                        type: "observation_recorded",
                        actionId: request.action.actionId,
                        observation: declinedObservation,
                    },
                }, control);
                await this.saveCheckpoint(declinedGoal, control);
                return this.advance(request.ref, control);
            }

            if (request.action.kind === "reject_action") {
                if (pendingAction.status !== "awaiting_approval") {
                    return this.invalidGoalInput(
                        "reject_action only applies to a first-time approval wait; unknown outcomes require an explicit re-execution decision",
                    );
                }

                if (request.action.actionId.trim().length === 0) {
                    return this.invalidGoalInput("Action ID must not be empty");
                }

                if (request.action.actionId !== pendingAction.action.actionId) {
                    return this.invalidGoalInput(
                        "Rejected actionId does not match pendingAction",
                    );
                }

                if (request.action.reason.trim().length === 0) {
                    return this.invalidGoalInput("Rejection reason must not be empty");
                }

                const rejectedRun = transition(goal.state.run, {
                    kind: "reject_action",
                    actionId: request.action.actionId,
                    reason: request.action.reason,
                });

                if (!rejectedRun.ok) {
                    throw new Error(
                        `GoalCoordinator invariant violated: ${rejectedRun.error.message}`,
                    );
                }

                const program = goal.state.run.pendingProgram;
                const rejectedObservation = { kind: "rejected" as const, reason: request.action.reason };
                const programAssociation = program === undefined ? {} : {
                    executionUnitId: `${program.executionUnitId}:call:${program.nextCallIndex}`,
                    programId: program.programId,
                    callIndex: program.nextCallIndex,
                };
                const updatedRun = program === undefined ? rejectedRun.state : {
                    ...rejectedRun.state,
                    pendingProgram: {
                        ...rejectedRun.state.pendingProgram!,
                        resultBytes: program.resultBytes + Buffer.byteLength(JSON.stringify({
                            observation: rejectedObservation,
                            sourceReferences: [0],
                        })),
                    },
                };

                const rejectedGoal: Goal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        run: updatedRun,
                    },
                };
                throwIfAborted(control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    actionId: request.action.actionId,
                    ...programAssociation,
                    eventType: "action_rejected",
                    payload: {
                        type: "action_rejected",
                        actionId: request.action.actionId,
                        reason: request.action.reason,
                    },
                }, control);
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    actionId: request.action.actionId,
                    ...programAssociation,
                    eventType: "observation_recorded",
                    payload: {
                        type: "observation_recorded",
                        actionId: request.action.actionId,
                        observation: rejectedObservation,
                    },
                }, control);
                await this.saveCheckpoint(rejectedGoal, control);
                return this.advance(request.ref, control);
            }

            return this.invalidGoalInput(
                "pendingAction requires approve_action or reject_action",
            );
        }

        if (request.action.kind !== "message") {
            return this.invalidGoalInput(
                "executing blocked requires a message action",
            );
        }

        if (request.action.content.trim().length === 0) {
            return this.invalidGoalInput("Message content must not be empty");
        }

        const resumedRun = transition(goal.state.run, { kind: "resume" });

        if (!resumedRun.ok) {
            throw new Error(
                `GoalCoordinator invariant violated: ${resumedRun.error.message}`,
            );
        }

        const resumedGoal: Goal = appendGoalMessage(
            goal,
            {
                role: "user",
                content: request.action.content,
                runId: goal.state.run.id,
                source: {
                    kind: "user_input",
                    inputId: request.action.inputId ?? `resume:${goal.state.run.id}`,
                },
            },
        ).goal;
        const resumedGoalWithRun: Goal = {
            ...resumedGoal,
            state: {
                ...resumedGoal.state,
                run: resumedRun.state,
            },
        };
        throwIfAborted(control);
        await this.appendTrajectory({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            eventType: "run_resumed",
            payload: { type: "run_resumed" },
        }, control);
        await this.saveCheckpoint(resumedGoalWithRun, control);
        return this.advance(request.ref, control);
    }

    /**
     * 结算问答等待的整体回复与跳过分支。
     *
     * @remarks
     * 两种分支都不伪造逐题选择、不应用路线候选、也不把 Run 标记为 cancelled：
     * 它们在同一提交中解除问答等待并追加真实用户消息，`reply_to_question` 使用
     * 用户原文，`skip_question` 使用明确的“未回答并要求继续”控制语义。
     */
    private async resolveAskUserWithoutAnswers(
        goal: Goal,
        pending: PendingInteractionAskUser,
        action: Extract<GoalUserAction, { readonly kind: "reply_to_question" | "skip_question" }>,
        ref: RunRef,
        control?: ExecutionControl,
    ): Promise<GoalProgressResult> {
        if (action.requestId !== pending.requestId) {
            return this.invalidGoalInput(
                `Submitted requestId "${action.requestId}" does not match pendingInteraction requestId "${pending.requestId}"`,
            );
        }
        if (action.kind === "reply_to_question" && action.content.trim().length === 0) {
            return this.invalidGoalInput("Question reply must not be empty");
        }

        const resolvedRun = transition(goal.state.run, {
            kind: "resolve_interaction",
            interactionKind: "ask_user",
        });
        if (!resolvedRun.ok) {
            throw new Error(
                `GoalCoordinator invariant violated: ${resolvedRun.error.message}`,
            );
        }

        const resumedGoal: Goal = appendGoalMessage(
            goal,
            {
                role: "user",
                content: action.kind === "reply_to_question"
                    ? action.content
                    : ASK_USER_SKIP_MESSAGE,
                runId: goal.state.run.id,
                source: {
                    kind: "interaction_response",
                    requestId: pending.requestId,
                },
            },
        ).goal;
        const resumedGoalWithRun: Goal = {
            ...resumedGoal,
            state: {
                ...resumedGoal.state,
                run: resolvedRun.state,
            },
        };

        throwIfAborted(control);
        await this.appendTrajectory({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            eventType: "run_resumed",
            payload: { type: "run_resumed" },
        }, control);
        if (action.kind === "reply_to_question") {
            await this.appendTrajectory({
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "executing",
                eventType: "ask_user_replied",
                payload: { type: "ask_user_replied", requestId: pending.requestId, content: action.content },
            }, control);
        } else {
            await this.appendTrajectory({
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "executing",
                eventType: "ask_user_skipped",
                payload: { type: "ask_user_skipped", requestId: pending.requestId },
            }, control);
        }

        await this.saveCheckpoint(resumedGoalWithRun, control);
        return this.advance(ref, control);
    }

    private advanceGoalContextEpoch(
        goal: Goal,
        reason: "conversation_pruned" | "input_threshold" | "task_approved",
    ): {
        readonly goal: Goal;
        readonly fact: TrajectoryEventDraft;
    } {
        const current = goal.state.run.contextEpoch;
        const messages = goal.state.messages;
        const start = selectLatestConversationStart(
            messages,
            current.conversationStartIndex,
        );
        const boundary = goal.state.run.committedThroughSequence;
        const opened = advanceContextEpoch(current, messages, start, boundary + 2);
        const closed = toEpochRange(current, messages.length, boundary);
        return {
            goal: this.withRun(goal, {
                ...goal.state.run,
                contextEpoch: opened,
            }),
            fact: {
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: goal.state.workflow.phase,
                eventType: "context_epoch_advanced",
                payload: {
                    type: "context_epoch_advanced",
                    closedEpoch: closed,
                    openedEpoch: opened,
                    reason,
                },
            },
        };
    }

    private async restore(
        ref: RunRef,
        control?: ExecutionControl,
    ): Promise<Goal | undefined> {
        throwIfAborted(control);
        const goal = await this.store.restore(ref.goalId);
        throwIfAborted(control);

        if (
            goal === undefined
            || goal.id !== ref.goalId
            || goal.state.run.id !== ref.runId
        ) {
            return undefined;
        }

        return goal;
    }

    private validateGoalProtocol(goal: Goal): void {
        if (this.protocolValidator === undefined) return;

        this.protocolValidator.validate({
            promptBundleVersion: goal.definition.promptBundleVersion,
            memoryProtocol: goal.definition.memoryProtocol,
            modelContextProtocol: goal.definition.modelContextProtocol,
            contextRetrievalProtocol: goal.definition.contextRetrievalProtocol,
        });
    }

    private async saveCheckpoint(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<Goal> {
        const result = await this.checkpointCommitter.commit(goal, {
            ...(control === undefined ? {} : { control }),
        });
        return result.goal;
    }

    private async appendTrajectory(
        draft: TrajectoryEventDraft,
        control?: ExecutionControl,
        countAsFact = true,
    ): Promise<Readonly<TrajectoryEvent> | undefined> {
        const event = await this.checkpointCommitter.append(draft, control, countAsFact);
        this.publishTrajectoryEvent(
            draft,
            event,
            event?.payload.type ?? draft.eventType,
        );
        return event;
    }

    private publishExecutionEvent(
        target: Goal | { readonly goalId: string; readonly runId: string },
        event: Omit<ExecutionStreamEventDraft, "goalId" | "runId">,
    ): void {
        if (this.executionStream === undefined) return;
        const goalId = "goalId" in target ? target.goalId : target.id;
        const runId = "runId" in target ? target.runId : target.state.run.id;
        try {
            this.executionStream.publish({ goalId, runId, ...event });
        } catch {
            // Stream 是旁路观察面，发布故障不得改变 Coordinator 语义。
        }
    }

    private publishTrajectoryEvent(
        draft: TrajectoryEventDraft,
        event: Readonly<TrajectoryEvent> | undefined,
        kind: string,
    ): void {
        const executionUnitId = event?.executionUnitId ?? draft.executionUnitId;
        const actionId = event?.actionId ?? draft.actionId;
        this.publishExecutionEvent(draft, {
            ...(executionUnitId === undefined ? {} : { executionUnitId }),
            ...(actionId === undefined ? {} : { actionId }),
            kind,
            visibility: "public",
            durability: event === undefined ? "live" : "trajectory",
            delivery: isStreamDeltaKind(kind) ? "delta" : "control",
            ...(isStreamDeltaKind(kind)
                ? { coalescingKey: streamCoalescingKey(executionUnitId, actionId, kind) }
                : {}),
            payload: (event?.payload ?? draft.payload) as unknown as StreamJsonValue,
        });
    }

    private publishCommittedEvents(
        result: TrajectoryCheckpointCommitResult,
        events: readonly TrajectoryEvent[],
    ): void {
        for (const event of events) {
            const executionUnitId = event.executionUnitId;
            const actionId = event.actionId;
            this.publishExecutionEvent(result.goal, {
                ...(executionUnitId === undefined ? {} : { executionUnitId }),
                ...(actionId === undefined ? {} : { actionId }),
                kind: event.eventType,
                visibility: "public",
                durability: "checkpoint",
                delivery: isStreamDeltaKind(event.eventType) ? "delta" : "control",
                ...(isStreamDeltaKind(event.eventType)
                    ? { coalescingKey: streamCoalescingKey(executionUnitId, actionId, event.eventType) }
                    : {}),
                payload: event.payload as unknown as StreamJsonValue,
            });
        }
    }

    private async activatePendingGrant(goal: Goal): Promise<void> {
        const pending = goal.state.run.pendingAction;
        if (pending?.status !== "approved" || pending.grantId === undefined) return;
        if (
            this.workspaceId === undefined
            || (pending.approvalScope !== "goal" && pending.approvalScope !== "workspace")
        ) {
            throw new Error("Approved Action references an unavailable Grant store");
        }
        if (pending.approvalInputId === undefined) {
            throw new Error("Approved Action does not carry its approval decision identity");
        }
        const source = {
            goalId: goal.id,
            runId: goal.state.run.id,
            actionId: pending.action.actionId,
            approvalInputId: pending.approvalInputId,
        };
        // 授权复核必须针对实际获批版本：修订后的最终参数与能力范围。
        const executionAction = resolveActionExecutionAction(pending);

        if (pending.approvalKind === "sandbox") {
            if (this.sandboxGrantStore === undefined) {
                throw new Error("Approved Action references an unavailable Sandbox Grant store");
            }
            const grant = (await this.sandboxGrantStore.list({
                workspaceId: this.workspaceId,
                goalId: goal.id,
            })).find((candidate) => candidate.id === pending.grantId);
            if (
                grant === undefined
                || grant.scope !== pending.approvalScope
                || grant.workspaceId !== this.workspaceId
                || grant.source.goalId !== source.goalId
                || grant.source.runId !== source.runId
                || grant.source.actionId !== source.actionId
            ) {
                throw new Error("Approved Action Grant does not match the committed Goal identity");
            }
            const effectiveScope = pending.effectiveSandboxScope ?? { extraFiles: [], network: "none" };
            const matcher = createSandboxGrantMatcher(
                executionAction.toolId,
                executionAction.input,
                effectiveScope,
            );
            if (
                grant.matcher.toolId !== matcher.toolId
                || grant.matcher.inputDigest !== matcher.inputDigest
                || grant.matcher.scope.network !== matcher.scope.network
            ) {
                throw new Error("Approved Action Grant matcher does not match the committed Sandbox capability");
            }
            await this.sandboxGrantStore.activate(pending.grantId, source);
            return;
        }

        if (this.toolGrantStore === undefined) {
            throw new Error("Approved Action references an unavailable Tool Grant store");
        }
        const grant = (await this.toolGrantStore.list({
            workspaceId: this.workspaceId,
            goalId: goal.id,
        })).find((candidate) => candidate.id === pending.grantId);
        if (
            grant === undefined
            || grant.scope !== pending.approvalScope
            || grant.workspaceId !== this.workspaceId
            || grant.source.goalId !== source.goalId
            || grant.source.runId !== source.runId
            || grant.source.actionId !== source.actionId
        ) {
            throw new Error("Approved Action Grant does not match the committed Goal identity");
        }
        const registration = this.toolRegistry.get(executionAction.toolId);
        if (registration === undefined) throw new Error("Approved Action Tool is no longer registered");
        const prepared = registration.prepare(executionAction.input);
        if (!prepared.ok) throw new Error("Approved Action Tool input is no longer valid");
        const matcher = await createToolGrantMatcher(executionAction.toolId, prepared.input, this.workspaceRoot);
        if (!toolGrantMatchersEqual(grant.matcher, matcher)) {
            throw new Error("Approved Action Grant matcher does not match the committed Tool input");
        }
        await this.toolGrantStore.activate(pending.grantId, {
            ...source,
        });
    }

    private async afterSchedule(
        ref: RunRef,
        scheduled: Awaited<ReturnType<RunScheduler["schedule"]>>,
        control?: ExecutionControl,
    ): Promise<GoalProgressResult> {
        throwIfAborted(control);
        if (!scheduled.ok) {
            return scheduled;
        }

        const latestGoal = await this.restore(ref, control);
        throwIfAborted(control);

        if (latestGoal === undefined) {
            return this.runNotFound(ref);
        }

        if (latestGoal.state.run.status === "waiting") {
            return this.executingWaitingResult(latestGoal);
        }

        if (
            latestGoal.state.run.status === "completed"
            || latestGoal.state.run.status === "failed"
            || latestGoal.state.run.status === "cancelled"
        ) {
            return {
                ok: true,
                kind: "terminal",
                phase: "executing",
                goal: latestGoal,
            };
        }

        return {
            ok: false,
            error: {
                code: "INVALID_PHASE_RESULT",
                message: `Scheduler left Run "${ref.runId}" in ${latestGoal.state.run.status}`,
            },
        };
    }

    private executingWaitingResult(goal: Goal): GoalProgressResult {
        const pendingInteraction = goal.state.run.pendingInteraction;
        const pendingAction = goal.state.run.pendingAction;

        let waitingFor: "ask_user" | "task_approval" | "action_approval" | "action_recovery" | "blocked";
        if (pendingInteraction !== undefined) {
            waitingFor = pendingInteraction.kind === "ask_user" ? "ask_user" : "task_approval";
        } else if (pendingAction?.status === "awaiting_approval") {
            waitingFor = "action_approval";
        } else if (pendingAction?.status === "outcome_unknown") {
            waitingFor = "action_recovery";
        } else {
            waitingFor = "blocked";
        }

        return {
            ok: true,
            kind: "waiting",
            phase: "executing",
            waitingFor,
            goal,
        };
    }

    private withRun(goal: Goal, run: Goal["state"]["run"]): Goal {
        return {
            ...goal,
            state: {
                ...goal.state,
                run,
            },
        };
    }

    private goalNotWaiting(ref: RunRef): GoalProgressResult {
        return {
            ok: false,
            error: {
                code: "GOAL_NOT_WAITING",
                message: `Goal "${ref.goalId}" is not waiting for user input`,
            },
        };
    }

    private invalidGoalInput(message: string): GoalProgressResult {
        return {
            ok: false,
            error: {
                code: "INVALID_GOAL_INPUT",
                message,
            },
        };
    }

    private runNotFound(ref: RunRef): GoalProgressResult {
        return {
            ok: false,
            error: {
                code: "RUN_NOT_FOUND",
                message: `Run "${ref.runId}" for Goal "${ref.goalId}" was not found`,
            },
        };
    }

    private goalNotCompleted(ref: RunRef): GoalProgressResult {
        return {
            ok: false,
            error: {
                code: "GOAL_NOT_COMPLETED",
                message: `Goal "${ref.goalId}" has no completed or failed Run to continue`,
            },
        };
    }

    private async withContinuationGate<T>(
        goalId: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        const previous = this.continuationGates.get(goalId) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        this.continuationGates.set(goalId, current);
        await previous;
        try {
            return await operation();
        } finally {
            release();
            if (this.continuationGates.get(goalId) === current) {
                this.continuationGates.delete(goalId);
            }
        }
    }
}
