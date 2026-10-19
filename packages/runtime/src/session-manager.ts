import { randomUUID } from "node:crypto";

import type { AgentProfileRegistry } from "./agent-profile";
import type { GoalModelSelection, Goal, RunMode } from "./domain";
import type { GoalStore } from "./goal-store";
import type { GoalCoordinator } from "./goal-coordinator";
import type { GoalProtocolValidator } from "./domain";
import {
    createGoalCheckpoint,
    type CreateGoalResult,
    type RunIdGenerator,
} from "./launcher";
import {
    Session,
    projectGoalSessionState,
    type SessionInputConsumptionResult,
    type GoalSessionState,
    type SessionHandlePort,
    type SessionManagerErrorCode,
} from "./session";
import { SessionInputAdmission, type SessionInputAdmissionDependencies } from "./session-admission";
import {
    projectInteractionView,
    readInteractionDetail,
    type GoalInteractionView,
    type InteractionDetailResult,
    type InteractionViewRef,
} from "./interaction-view";
import type { GoalUserAction } from "./goal-coordinator";
import {
    computeSessionInputDigest,
    findSessionInputRecord,
    nextSessionInputSequence,
    toSessionInputReceipt,
    validateSessionInputShape,
    withQueuePause,
    type SessionInputDigest,
    type SessionInputReceipt,
    type SessionInputRecord,
    type SessionInput,
    type SessionInputAdmissionResult,
    type SessionInteractionResponse,
    type SessionInputQueryResult,
} from "./session-input";
import { withGoalMutationGate } from "./goal-mutation-gate";
import {
    GoalRevisionMonitor,
    GoalSessionStream,
    SESSION_INPUT_RESULT_KIND,
    type SessionOutputStream,
} from "./session-stream";
import {
    InMemoryExecutionStreamPublisher,
    type ExecutionStreamPublisher,
    type StreamJsonValue,
} from "../../execution-stream/src/index";
import type {
    DiagnosticTraceSink,
    TrajectoryStore,
} from "./trajectory";
import type { TrajectoryCheckpointCommitterPort } from "./trajectory-checkpoint-committer";

/**
 * 创建长期 Session 的请求。
 *
 * @remarks
 * `goalId` 与 `inputId` 由调用方提供并长期保存：相同身份与载荷的重试必须
 * 关联同一 Goal，不得生成新的 Goal 或重复首条消息。`content` 同时作为 Goal
 * 的冻结 intent 和首条真实用户消息。
 *
 * @example
 * ```ts
 * const request: SessionCreateRequest = {
 *   goalId: "goal-1",
 *   inputId: "input-1",
 *   content: "实现恢复能力",
 *   profileId: "default",
 * };
 * ```
 */
export interface SessionCreateRequest {
    /** 稳定 Goal 标识。 */
    readonly goalId: string;
    /** 首条输入的稳定身份。 */
    readonly inputId: string;
    /** 非空首条文本。 */
    readonly content: string;
    /** 用于冻结 Profile 的 Profile ID。 */
    readonly profileId: string;
    /** 首个 Run 的模式；省略时为普通模式。 */
    readonly mode?: RunMode | undefined;
    /** 非负 Step 上限；`0` 或省略表示无限。 */
    readonly maxSteps?: number | undefined;
    /**
     * 首个 Run 使用的模型选择。
     *
     * @remarks 省略时使用装配提供的默认选择；装配未提供默认选择时使用
     * Domain 的基准选择，由执行前的绑定核验决定是否可服务。
     */
    readonly modelSelection?: GoalModelSelection | undefined;
}

/** 把会话交互回答映射为既有 Coordinator 用户操作；不改变安全与授权规则。 */
function toGoalUserAction(
    response: SessionInteractionResponse,
    requestId: string,
): GoalUserAction {
    switch (response.kind) {
        case "answer_ask_user":
            return { kind: "answer_ask_user", requestId, answers: response.answers };
        case "reply_to_question":
            return { kind: "reply_to_question", requestId, content: response.content };
        case "skip_question":
            return { kind: "skip_question", requestId };
        case "approve_task":
            return { kind: "approve_task", requestId };
        case "feedback_task":
            return { kind: "feedback_task", requestId, feedback: response.feedback };
        case "approve_action":
            return {
                kind: "approve_action",
                actionId: response.actionId,
                ...(response.scope === undefined ? {} : { scope: response.scope }),
            };
        case "reject_action":
            return { kind: "reject_action", actionId: response.actionId, reason: response.reason };
    }
}

/** 把收据投影为可发布的 JSON 对象；不包含队列正文或隐藏推理。 */
function serializeReceipt(receipt: SessionInputReceipt): Record<string, StreamJsonValue> {
    return {
        goalId: receipt.goalId,
        inputId: receipt.inputId,
        kind: receipt.kind,
        digest: receipt.digest,
        sequence: receipt.sequence,
        status: receipt.status,
        admittedAtRevision: receipt.admittedAtRevision,
        ...(receipt.targetRunId === undefined ? {} : { targetRunId: receipt.targetRunId }),
        ...(receipt.appliedRunId === undefined ? {} : { appliedRunId: receipt.appliedRunId }),
        ...(receipt.messageIndex === undefined ? {} : { messageIndex: receipt.messageIndex }),
    };
}

/**
 * 有界关闭未能在期限内结算自有工作时抛出的类型化错误。
 *
 * @remarks 错误保留仍未结算的 Goal 身份；调用方不能把该错误报告为安全关闭，
 * 也不能立即重用同一存储。
 *
 * @example
 * ```ts
 * try { await sessions.close({ timeoutMs: 1000 }); } catch (error) {
 *   if (error instanceof SessionManagerCloseError) console.error(error.unsettledGoalIds);
 * }
 * ```
 */
export class SessionManagerCloseError extends Error {
    readonly code = "SESSION_MANAGER_CLOSE_TIMEOUT" as const;

    constructor(readonly unsettledGoalIds: readonly string[]) {
        super(`Session manager close timed out with unsettled work: ${unsettledGoalIds.join(", ") || "none"}`);
        this.name = "SessionManagerCloseError";
    }
}

/** 停止消费用的可等待信号。 */
const STOPPED = Symbol("stopped");

function deferredSignal(): { readonly promise: typeof STOPPED extends never ? never : Promise<typeof STOPPED>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<typeof STOPPED>((done) => {
        resolve = () => done(STOPPED);
    });
    return { promise, resolve };
}

/** 创建或连接 Session 的结果。 */
export type SessionCreateResult =
    | {
        readonly ok: true;
        readonly existing: boolean;
        readonly session: Session;
        readonly receipt: SessionInputReceipt;
    }
    | {
        readonly ok: false;
        readonly error: { readonly code: SessionManagerErrorCode; readonly message: string };
    };

/**
 * 单消息封装的调用结果。
 *
 * @remarks `ok: true` 在指定 Run 到达等待或终态后返回真实结果与可恢复身份；
 * 等待交互时立即返回可恢复身份，不永久挂起等待尚未实现的回答。封装只创建并
 * 释放自己的订阅，不关闭借用的实例。
 *
 * @example
 * ```ts
 * const result = await sessions.query(request);
 * if (result.ok) console.log(result.outcome);
 * ```
 */
export type SessionQueryResult =
    | {
        readonly ok: true;
        readonly session: Session;
        readonly receipt: SessionInputReceipt;
        readonly runId: string;
        readonly outcome: "completed" | "failed" | "cancelled" | "waiting";
        readonly state: GoalSessionState;
    }
    | {
        readonly ok: false;
        readonly error: { readonly code: SessionManagerErrorCode | "QUERY_FAILED"; readonly message: string };
    };

/** 只读连接已有 Goal 的结果。 */
export type SessionOpenResult =
    | {
        readonly ok: true;
        readonly session: Session;
        readonly state: GoalSessionState;
    }
    | {
        readonly ok: false;
        readonly error: { readonly code: SessionManagerErrorCode; readonly message: string };
    };

/**
 * 创建 {@link SessionManager} 所需依赖。
 *
 * @remarks
 * `store`、`committer` 与 `coordinator` 必须与执行链共享同一实例，会话受理才能
 * 与 Runner、Coordinator 的提交按 Goal 线性化。构造不产生 I/O，也不拥有这些
 * Port 的生命周期。
 *
 * @example
 * ```ts
 * const sessions = new SessionManager({ store, committer, coordinator, profiles, runIdGenerator });
 * ```
 */
export interface SessionManagerDependencies {
    /** 最新 Goal 快照存储。 */
    readonly store: GoalStore;
    /** 与执行链共享的 Trajectory/Snapshot 提交器。 */
    readonly committer: TrajectoryCheckpointCommitterPort;
    /** 运行 created/running Run 的调度入口与后继 Run 创建入口。 */
    readonly coordinator: Pick<GoalCoordinator, "advance" | "continue" | "steer" | "interrupt" | "resume">;
    /** 冻结 Profile 解析。 */
    readonly profiles: AgentProfileRegistry;
    /** 新 Run 身份生成器。 */
    readonly runIdGenerator: RunIdGenerator;
    /** 可选的 Prompt/Memory 协议校验器。 */
    readonly protocolValidator?: GoalProtocolValidator | undefined;
    /** 可选 Domain Event 追加与 Snapshot 边界读取端口。 */
    readonly trajectoryStore?: TrajectoryStore | undefined;
    /** 可选诊断记录边界。 */
    readonly traceSink?: DiagnosticTraceSink | undefined;
    /**
     * 后台执行任务的追踪边界。
     *
     * @remarks 生命周期实现应在关闭时等待已受理任务；省略时由本实例在
     * `waitForIdle()` 中自行等待并观察异常。
     */
    readonly trackBackgroundTask?: ((label: string, task: Promise<void>) => void) | undefined;
    /** 可选日志端口；只用于观察后台执行异常。 */
    readonly onBackgroundFailure?: ((goalId: string, error: unknown) => void) | undefined;
    /** 与执行链共享的实时事件发布端口；省略时输出流只依赖快照同步。 */
    readonly executionStream?: ExecutionStreamPublisher | undefined;
    /**
     * 提交核对任务的定时器边界；省略时使用进程定时器。
     *
     * @remarks 用于测试注入 fake clock；生产保持不超过一秒的核对间隔。
     */
    readonly resyncIntervalMs?: number | undefined;
    /** 定时器实现；省略时使用进程 `setInterval`/`clearInterval`。 */
    readonly setInterval?: ((handler: () => void, timeout: number) => unknown) | undefined;
    readonly clearInterval?: ((handle: unknown) => void) | undefined;
    /**
     * 新 Run 启动前按最新 Goal 对齐模型 Binding。
     *
     * @remarks
     * 每次推进或创建后继 Run 前以最新快照的 `modelSelection` 调用一次，避免继承
     * 另一个 Goal 的进程绑定；省略时不改变 Binding。
     */
    readonly alignModelBinding?: ((selection: GoalModelSelection) => void) | undefined;
    /**
     * 创建 Session 时未显式指定模型选择所用的默认选择。
     *
     * @remarks 由装配提供本进程真正可服务的默认选择；省略时沿用 Domain 基准。
     */
    readonly defaultModelSelection?: GoalModelSelection | undefined;
}

/**
 * 拥有单活动 Goal 名额、后台执行与 Goal 句柄的 Runtime 会话所有者。
 *
 * @remarks
 * `create` 先持久化 Goal、首条用户消息、Run 与受理收据，再返回句柄并以被追踪
 * 的后台任务推进首个 Run：返回不等待 Run 完成，首次保存失败不会调用模型或
 * 工具。`open` 只做只读连接，不推进、不消费队列。一个实例同时只运行一个 Goal：
 * 其他 Goal 的新执行、交互推进与输入受理返回 `BUSY`，不会进入全局调度队列。
 *
 * 后台任务异常被观察并保留真实恢复状态（Run 保持 `created`／`running`，
 * `read()` 报告 `needsRecovery`），不会形成未处理的 Promise rejection。模型与
 * 工具等待期间不持有 Goal 短提交边界，因此活动 Goal 的输入、读取与控制不被
 * 长调用阻塞。
 *
 * @example
 * ```ts
 * const sessions = new SessionManager({ store, committer, coordinator, profiles, runIdGenerator });
 * const created = await sessions.create({ goalId: "goal-1", inputId: "input-1", content: "开始", profileId: "default" });
 * ```
 */
export class SessionManager implements SessionHandlePort {
    private readonly store: GoalStore;
    private readonly committer: TrajectoryCheckpointCommitterPort;
    private readonly coordinator: Pick<GoalCoordinator, "advance" | "continue" | "steer" | "interrupt" | "resume">;
    private readonly profiles: AgentProfileRegistry;
    private readonly runIdGenerator: RunIdGenerator;
    private readonly protocolValidator: GoalProtocolValidator | undefined;
    private readonly trajectoryStore: TrajectoryStore | undefined;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly trackBackgroundTask: ((label: string, task: Promise<void>) => void) | undefined;
    private readonly onBackgroundFailure: ((goalId: string, error: unknown) => void) | undefined;
    private readonly alignModelBinding: ((selection: GoalModelSelection) => void) | undefined;
    private readonly defaultModelSelection: GoalModelSelection | undefined;
    private readonly executionStream: ExecutionStreamPublisher | undefined;
    private readonly revisionMonitor: GoalRevisionMonitor;
    private readonly sessionStreams = new Map<string, Set<GoalSessionStream>>();
    private readonly sessionConsumers = new Map<string, Set<{ readonly stopped: boolean; stop: () => void }>>();
    private readonly pendingWakes = new Set<string>();
    private readonly admission: SessionInputAdmission;
    private readonly executions = new Map<string, Promise<void>>();
    private readonly backgroundTasks = new Set<Promise<void>>();
    private readonly explicitContinuations = new Set<string>();
    private activeGoalId: string | undefined;

    /** @param dependencies - Store、提交器、Coordinator、Profile 与身份生成器。 */
    constructor(dependencies: SessionManagerDependencies) {
        this.store = dependencies.store;
        this.committer = dependencies.committer;
        this.coordinator = dependencies.coordinator;
        this.profiles = dependencies.profiles;
        this.runIdGenerator = dependencies.runIdGenerator;
        this.protocolValidator = dependencies.protocolValidator;
        this.trajectoryStore = dependencies.trajectoryStore;
        this.traceSink = dependencies.traceSink;
        this.trackBackgroundTask = dependencies.trackBackgroundTask;
        this.onBackgroundFailure = dependencies.onBackgroundFailure;
        this.alignModelBinding = dependencies.alignModelBinding;
        this.defaultModelSelection = dependencies.defaultModelSelection;
        this.executionStream = dependencies.executionStream;
        this.revisionMonitor = new GoalRevisionMonitor({
            readGoal: (goalId) => this.store.restore(goalId),
            ...(dependencies.resyncIntervalMs === undefined ? {} : { intervalMs: dependencies.resyncIntervalMs }),
            ...(dependencies.setInterval === undefined ? {} : { setInterval: dependencies.setInterval }),
            ...(dependencies.clearInterval === undefined ? {} : { clearInterval: dependencies.clearInterval }),
            onError: (goalId, error) => this.onBackgroundFailure?.(goalId, error),
        });
        const admissionDependencies: SessionInputAdmissionDependencies = {
            store: this.store,
            committer: this.committer,
            onAdmitted: (goalId, input) => this.wakeAfterAdmission(goalId, input),
        };
        this.admission = new SessionInputAdmission(admissionDependencies);
    }

    /** 当前实例活动执行名额的持有 Goal；空闲时为 `undefined`。 */
    get activeGoal(): string | undefined {
        return this.activeGoalId;
    }

    /**
     * 创建或连接一个长期 Session。
     *
     * @param request - 稳定 Goal／输入身份、首条文本与执行配置。
     * @param control - 当前创建调用共享的中止控制。
     * @returns 已持久化受理的句柄与首条收据，或稳定业务失败。
     * @throws 首次保存或 Trajectory 依赖失败时传播原始异常；调用方必须使用原
     *   身份查询或重试。
     * @example
     * ```ts
     * const created = await sessions.create(request);
     * ```
     */
    async create(
        request: SessionCreateRequest,
        control?: Parameters<typeof createGoalCheckpoint>[2],
    ): Promise<SessionCreateResult> {
        const shape = validateSessionInputShape({
            kind: "message",
            inputId: request.inputId,
            content: request.content,
        });
        if (shape !== undefined) {
            return this.failure("INVALID_INPUT", shape.message);
        }

        const existing = await this.store.restore(request.goalId);
        if (existing !== undefined) {
            return this.connectExistingCreate(request, existing);
        }

        if (this.activeGoalId !== undefined && this.activeGoalId !== request.goalId) {
            return this.failure(
                "BUSY",
                `Goal "${this.activeGoalId}" currently owns the instance execution slot`,
            );
        }
        const reserved = this.activeGoalId === undefined;
        if (reserved) this.activeGoalId = request.goalId;
        const effectiveSelection = request.modelSelection ?? this.defaultModelSelection;

        let created: CreateGoalResult;
        try {
            created = await createGoalCheckpoint(
                {
                    goalId: request.goalId,
                    intent: request.content,
                    profileId: request.profileId,
                    ...(request.mode === undefined ? {} : { mode: request.mode }),
                    ...(request.maxSteps === undefined ? {} : { maxSteps: request.maxSteps }),
                    ...(effectiveSelection === undefined
                        ? {}
                        : { modelSelection: effectiveSelection }),
                    firstInput: {
                        inputId: request.inputId,
                        digest: computeSessionInputDigest({
                            kind: "message",
                            inputId: request.inputId,
                            content: request.content,
                        }),
                    },
                },
                {
                    profiles: this.profiles,
                    runIdGenerator: this.runIdGenerator,
                    store: this.store,
                    coordinator: this.coordinator,
                    ...(this.protocolValidator === undefined
                        ? {}
                        : { protocolValidator: this.protocolValidator }),
                    ...(this.trajectoryStore === undefined
                        ? {}
                        : { trajectoryStore: this.trajectoryStore }),
                    ...(this.traceSink === undefined ? {} : { traceSink: this.traceSink }),
                },
                control,
            );
        } catch (error) {
            if (reserved) this.activeGoalId = undefined;
            throw error;
        }

        if (!created.ok) {
            if (reserved) this.activeGoalId = undefined;
            return this.failure(
                created.error.code === "PROFILE_NOT_FOUND" ? "PROFILE_NOT_FOUND" : "INVALID_INPUT",
                created.error.message,
            );
        }

        const record = findSessionInputRecord(created.goal, request.inputId);
        const session = this.createHandle(request.goalId);
        this.startExecution(request.goalId);
        return {
            ok: true,
            existing: false,
            session,
            receipt: toSessionInputReceipt(request.goalId, record ?? {
                inputId: request.inputId,
                kind: "message",
                digest: computeSessionInputDigest({
                    kind: "message",
                    inputId: request.inputId,
                    content: request.content,
                }),
                sequence: 1,
                status: "applied",
                admittedAtRevision: created.goal.state.commitRevision ?? 1,
                appliedRunId: created.ref.runId,
                messageIndex: 0,
            }),
        };
    }

    /**
     * 只读连接已有 Goal。
     *
     * @param goalId - 已存在的 Goal。
     * @returns 新的轻量句柄与最新安全状态，或稳定失败。
     * @throws 快照损坏或读取失败时返回 `GOAL_UNREADABLE` 而不静默回退；底层
     *   异常不会伪装为 Goal 不存在。
     * @example
     * ```ts
     * const opened = await sessions.open("goal-1");
     * ```
     */
    async open(goalId: string): Promise<SessionOpenResult> {
        let goal: Goal | undefined;
        try {
            goal = await this.store.restore(goalId);
        } catch (error) {
            return this.failure(
                "GOAL_UNREADABLE",
                error instanceof Error ? error.message : String(error),
            );
        }
        if (goal === undefined) {
            return this.failure("GOAL_NOT_FOUND", `Goal "${goalId}" was not found`);
        }
        return {
            ok: true,
            session: this.createHandle(goalId),
            state: projectGoalSessionState({ goal, executionOwner: this.activeGoalId === goalId }),
        };
    }

    /**
     * 读取指定 Goal 的最新安全状态。
     *
     * @param goalId - 目标 Goal。
     * @returns 最新投影；Goal 不存在时返回 `undefined`。
     * @throws 快照损坏或读取失败时抛出异常。
     * @example
     * ```ts
     * const state = await sessions.readSessionState("goal-1");
     * ```
     */
    async readSessionState(goalId: string): Promise<GoalSessionState | undefined> {
        const goal = await this.store.restore(goalId);
        if (goal === undefined) return undefined;
        return projectGoalSessionState({ goal, executionOwner: this.activeGoalId === goalId });
    }

    /**
     * 读取指定 Goal 当前已提交等待的类型化交互视图。
     *
     * @remarks 只读取最新快照；重复同步、重连与多客户端读取都得到同一
     * `interactionId`，不会因读取创建交互或推进执行。
     *
     * @param goalId - 目标 Goal。
     * @returns 类型化交互视图；没有可决定等待或 Goal 不存在时返回 `undefined`。
     * @throws 快照损坏或读取失败时抛出异常。
     * @example
     * ```ts
     * const view = await sessions.readSessionInteraction("goal-1");
     * ```
     */
    async readSessionInteraction(goalId: string): Promise<GoalInteractionView | undefined> {
        const goal = await this.store.restore(goalId);
        return goal === undefined ? undefined : projectInteractionView(goal);
    }

    /**
     * 按稳定引用读取当前交互的完整审阅内容。
     *
     * @remarks 引用必须同时匹配当前 Run 与当前等待身份；过期引用返回稳定拒绝，
     * 读取不推进等待、不调用模型或工具、也不返回其他 Action 的输入。
     *
     * @param goalId - 目标 Goal。
     * @param ref - 调用方保存的 Run 与交互引用。
     * @returns 完整审阅内容，或引用不匹配的稳定拒绝。
     * @throws 快照损坏或读取失败时抛出异常。
     * @example
     * ```ts
     * const detail = await sessions.readSessionInteractionDetail("goal-1", ref);
     * ```
     */
    async readSessionInteractionDetail(
        goalId: string,
        ref: InteractionViewRef,
    ): Promise<InteractionDetailResult> {
        const goal = await this.store.restore(goalId);
        if (goal === undefined) {
            return {
                ok: false,
                code: "INTERACTION_NOT_WAITING",
                message: `Goal "${goalId}" was not found`,
            };
        }
        return readInteractionDetail(goal, ref);
    }

    /**
     * 受理一条会话输入。
     *
     * @remarks
     * 非活动 Goal 的输入受理明确返回 `BUSY`，不会进入全局调度队列；活动 Goal
     * 的受理只等待持久化，不等待模型或工具。普通消息在被受理后唤醒执行所有者
     * 继续消费队列（后继 Run 创建由队列消费实现）。
     *
     * @param goalId - 目标 Goal。
     * @param input - 带稳定身份的会话输入。
     * @returns 已受理收据、既有收据或稳定业务拒绝。
     * @throws 保存失败或结果不明时抛出 `SessionInputAdmissionError`。
     * @example
     * ```ts
     * await sessions.sendSessionInput("goal-1", input);
     * ```
     */
    async sendSessionInput(goalId: string, input: SessionInput): Promise<SessionInputAdmissionResult> {
        const busy = this.activeGoalId !== undefined && this.activeGoalId !== goalId
            ? {
                ok: false as const,
                code: "BUSY" as const,
                message: `Goal "${this.activeGoalId}" currently owns the instance execution slot`,
            }
            : undefined;
        if (busy !== undefined) {
            await this.publishInputResult(goalId, input, busy);
            return busy;
        }
        const result = input.kind === "steer"
            ? await this.admitSteer(goalId, input)
            : input.kind === "interrupt"
                ? await this.admitInterrupt(goalId, input)
                : input.kind === "respond"
                    ? await this.admitRespond(goalId, input)
                    : input.kind === "resume"
                        ? await this.admitResume(goalId, input)
                        : await this.admission.admit(goalId, input);
        await this.publishInputResult(goalId, input, result);
        return result;
    }

    /** 以控制事件发布输入受理结果；事件携带真实 Goal／Run，发布失败不改变已提交结果。 */
    private async publishInputResult(
        goalId: string,
        input: SessionInput,
        result: SessionInputAdmissionResult,
    ): Promise<void> {
        if (this.executionStream === undefined) return;
        try {
            const goal = await this.store.restore(goalId);
            if (goal === undefined) return;
            this.executionStream.publish({
                goalId,
                runId: result.ok
                    ? (result.receipt.targetRunId ?? result.receipt.appliedRunId ?? goal.state.run.id)
                    : goal.state.run.id,
                kind: SESSION_INPUT_RESULT_KIND,
                visibility: "public",
                durability: "checkpoint",
                delivery: "control",
                payload: {
                    goalId,
                    inputId: input.inputId,
                    kind: input.kind,
                    ok: result.ok,
                    ...(result.ok ? { existing: result.existing } : {}),
                    ...(result.ok ? { receipt: serializeReceipt(result.receipt) } : {}),
                    ...(result.ok ? {} : { code: result.code }),
                },
            });
        } catch {
            // 实时发布是旁路：失败不改变已提交的受理结果。
        }
    }

    /**
     * 受理交互回答并委派既有 Coordinator 规则。
     *
     * @remarks
     * 先核验 Goal、Run、请求及必要 Action 身份，再由现有等待恢复规则应用；匹配
     * 回答只推进对应的等待，旧请求、错身份或载荷冲突不会解除等待。应用成功后
     * 写入统一账本收据；收据提交失败时抛出
     * {@link SessionInputAdmissionError}，调用方必须按原身份查询状态而不是重复生成
     * 新身份——交互解析结果以 Snapshot 为准。
     */
    private async admitRespond(
        goalId: string,
        input: Extract<SessionInput, { readonly kind: "respond" }>,
    ): Promise<SessionInputAdmissionResult> {
        const shape = validateSessionInputShape(input);
        if (shape !== undefined) return { ok: false, code: shape.code, message: shape.message };
        const digest = computeSessionInputDigest(input);

        const current = await this.store.restore(goalId);
        if (current === undefined) {
            return { ok: false, code: "GOAL_NOT_FOUND", message: `Goal "${goalId}" was not found` };
        }
        const existing = findSessionInputRecord(current, input.inputId);
        if (existing !== undefined) {
            return existing.digest === digest && existing.kind === "respond"
                ? { ok: true, existing: true, receipt: toSessionInputReceipt(goalId, existing) }
                : {
                    ok: false,
                    code: "INPUT_CONFLICT",
                    message: `Input "${input.inputId}" already exists with a different kind or payload`,
                };
        }
        const identity = this.verifyInteractionIdentity(current, input);
        if (identity !== undefined) return identity;

        const action = toGoalUserAction(input.response, input.requestId);
        const result = await this.coordinator.resume(
            { ref: { goalId, runId: input.runId }, action },
        );
        if (!result.ok) {
            return {
                ok: false,
                code: result.error.code === "RUN_NOT_FOUND" ? "RUN_NOT_FOUND" : "INTERACTION_MISMATCH",
                message: `Interaction response "${input.inputId}" was rejected: ${result.error.code} ${result.error.message}`,
            };
        }

        const committed = await withGoalMutationGate(this.store, goalId, async () => {
            const latest = await this.store.restore(goalId);
            if (latest === undefined) return undefined;
            const record: SessionInputRecord = {
                inputId: input.inputId,
                kind: "respond",
                digest,
                sequence: nextSessionInputSequence(latest),
                status: "applied",
                admittedAtRevision: (latest.state.commitRevision ?? 0) + 1,
                targetRunId: input.runId,
                appliedRunId: latest.state.run.id,
            };
            const nextGoal: Goal = {
                ...latest,
                state: {
                    ...latest.state,
                    inputLedger: [...(latest.state.inputLedger ?? []), record],
                },
            };
            await this.committer.commit(nextGoal, { sessionState: "caller" });
            return record;
        });
        if (committed === undefined) {
            return { ok: false, code: "GOAL_NOT_FOUND", message: `Goal "${goalId}" was not found` };
        }
        this.continueQueueIfEligible(goalId);
        return { ok: true, existing: false, receipt: toSessionInputReceipt(goalId, committed) };
    }

    /**
     * 受理显式恢复命令。
     *
     * @remarks
     * 必须匹配最新 Run 与当前 Goal 提交修订；等待交互、暂停队列或没有可恢复
     * 工作时返回稳定拒绝。恢复不会代答等待，也不会解除失败／Interrupt 造成的
     * 队列暂停，但会重新唤醒执行所有者推进当前 Run 或已受理队首。
     */
    private async admitResume(
        goalId: string,
        input: Extract<SessionInput, { readonly kind: "resume" }>,
    ): Promise<SessionInputAdmissionResult> {
        const shape = validateSessionInputShape(input);
        if (shape !== undefined) return { ok: false, code: shape.code, message: shape.message };
        const digest = computeSessionInputDigest(input);

        const current = await this.store.restore(goalId);
        if (current === undefined) {
            return { ok: false, code: "GOAL_NOT_FOUND", message: `Goal "${goalId}" was not found` };
        }
        const existing = findSessionInputRecord(current, input.inputId);
        if (existing !== undefined) {
            return existing.digest === digest && existing.kind === "resume"
                ? { ok: true, existing: true, receipt: toSessionInputReceipt(goalId, existing) }
                : {
                    ok: false,
                    code: "INPUT_CONFLICT",
                    message: `Input "${input.inputId}" already exists with a different kind or payload`,
                };
        }
        if (current.state.run.id !== input.runId) {
            return { ok: false, code: "RUN_NOT_FOUND", message: `Run "${input.runId}" is not the latest Run` };
        }
        if ((current.state.commitRevision ?? 0) !== input.commitRevision) {
            return {
                ok: false,
                code: "STALE_REVISION",
                message: `commitRevision ${input.commitRevision} does not match current ${current.state.commitRevision ?? 0}`,
            };
        }
        if (this.activeGoalId !== undefined && this.activeGoalId !== goalId) {
            return {
                ok: false,
                code: "BUSY",
                message: `Goal "${this.activeGoalId}" currently owns the instance execution slot`,
            };
        }

        const status = current.state.run.status;
        if (status === "waiting") {
            const waiting = current.state.run.pendingInteraction !== undefined
                || current.state.run.pendingAction !== undefined;
            if (waiting) {
                return {
                    ok: false,
                    code: "INTERACTION_REQUIRED",
                    message: `Run "${input.runId}" is waiting for a matching interaction response`,
                };
            }
            // blocked 等待需要显式文本才能继续；恢复不得代答。
            const content = input.content;
            if (content === undefined || content.trim().length === 0) {
                return {
                    ok: false,
                    code: "RUN_NOT_RESUMABLE",
                    message: `Run "${input.runId}" is blocked and requires explicit resume content`,
                };
            }
            const resumed = await this.coordinator.resume({
                ref: { goalId, runId: input.runId },
                action: { kind: "message", content },
            });
            if (!resumed.ok) {
                return {
                    ok: false,
                    code: resumed.error.code === "RUN_NOT_FOUND" ? "RUN_NOT_FOUND" : "RUN_NOT_RESUMABLE",
                    message: `Resume "${input.inputId}" was rejected: ${resumed.error.code} ${resumed.error.message}`,
                };
            }
            const resumedRecord = await this.recordResumeReceipt(goalId, input, digest);
            if (resumedRecord === undefined) {
                return { ok: false, code: "GOAL_NOT_FOUND", message: `Goal "${goalId}" was not found` };
            }
            this.continueQueueIfEligible(goalId);
            return { ok: true, existing: false, receipt: toSessionInputReceipt(goalId, resumedRecord) };
        }
        if (current.state.messageQueue?.pause !== undefined) {
            return {
                ok: false,
                code: "QUEUE_PAUSED",
                message: "The Goal message queue is paused; continue it explicitly with queue_control",
            };
        }
        if (status !== "created" && status !== "running" && status !== "completed"
            && status !== "failed" && status !== "cancelled") {
            return {
                ok: false,
                code: "RUN_NOT_RESUMABLE",
                message: `Run "${input.runId}" cannot be resumed from ${status}`,
            };
        }

        const record = await this.recordResumeReceipt(goalId, input, digest);
        if (record === undefined) {
            return { ok: false, code: "GOAL_NOT_FOUND", message: `Goal "${goalId}" was not found` };
        }

        if (status === "created" || status === "running") {
            this.startExecution(goalId);
        } else {
            this.continueQueueIfEligible(goalId);
        }
        return { ok: true, existing: false, receipt: toSessionInputReceipt(goalId, record) };
    }

    /** 核验交互回答与当前等待身份是否匹配；不匹配时返回稳定拒绝。 */
    private verifyInteractionIdentity(
        goal: Goal,
        input: Extract<SessionInput, { readonly kind: "respond" }>,
    ): SessionInputAdmissionResult | undefined {
        if (goal.state.run.id !== input.runId) {
            return { ok: false, code: "RUN_NOT_FOUND", message: `Run "${input.runId}" is not the latest Run` };
        }
        const pendingInteraction = goal.state.run.pendingInteraction;
        const pendingAction = goal.state.run.pendingAction;
        const response = input.response;
        if (response.kind === "approve_action" || response.kind === "reject_action") {
            const expectedActionId = pendingAction?.action.actionId;
            if (expectedActionId === undefined || expectedActionId !== response.actionId) {
                return {
                    ok: false,
                    code: "INTERACTION_MISMATCH",
                    message: `Action "${response.actionId}" is not the current pending Action`,
                };
            }
            return undefined;
        }
        if (pendingInteraction === undefined || pendingInteraction.requestId !== input.requestId) {
            return {
                ok: false,
                code: "INTERACTION_MISMATCH",
                message: `requestId "${input.requestId}" is not the current pending interaction`,
            };
        }
        if (response.kind === "answer_ask_user"
            || response.kind === "reply_to_question"
            || response.kind === "skip_question") {
            return pendingInteraction.kind === "ask_user"
                ? undefined
                : {
                    ok: false,
                    code: "INTERACTION_MISMATCH",
                    message: "The current interaction is not an ask_user request",
                };
        }
        return pendingInteraction.kind === "task_approval"
            ? undefined
            : {
                ok: false,
                code: "INTERACTION_MISMATCH",
                message: "The current interaction is not a task approval request",
            };
    }

    /**
     * 受理关联当前 Run 的用户 Interrupt。
     *
     * @remarks
     * 中断意图、统一账本收据与队列暂停在同一 Snapshot 提交中生效，然后才委派
     * 现有中止与有限修复路径：受理不等待停止完成。重复身份返回原收据，其他
     * 中断请求或非 running／waiting 目标明确拒绝。
     */
    private async admitInterrupt(
        goalId: string,
        input: Extract<SessionInput, { readonly kind: "interrupt" }>,
    ): Promise<SessionInputAdmissionResult> {
        const shape = validateSessionInputShape(input);
        if (shape !== undefined) return { ok: false, code: shape.code, message: shape.message };
        const digest = computeSessionInputDigest(input);

        const current = await this.store.restore(goalId);
        if (current === undefined) {
            return { ok: false, code: "GOAL_NOT_FOUND", message: `Goal "${goalId}" was not found` };
        }
        const existing = findSessionInputRecord(current, input.inputId);
        if (existing !== undefined) {
            return existing.digest === digest && existing.kind === "interrupt"
                ? { ok: true, existing: true, receipt: toSessionInputReceipt(goalId, existing) }
                : {
                    ok: false,
                    code: "INPUT_CONFLICT",
                    message: `Input "${input.inputId}" already exists with a different kind or payload`,
                };
        }

        const result = await this.coordinator.interrupt(
            { goalId, runId: input.runId },
            input.inputId,
            { digest },
        );
        if (!result.ok) {
            return {
                ok: false,
                code: result.error,
                message: `Interrupt input "${input.inputId}" was rejected: ${result.error}`,
            };
        }
        const committed = await this.store.restore(goalId);
        const record = committed === undefined ? undefined : findSessionInputRecord(committed, input.inputId);
        if (record === undefined) {
            return {
                ok: false,
                code: "GOAL_NOT_FOUND",
                message: `Goal "${goalId}" disappeared while admitting Interrupt input`,
            };
        }
        return {
            ok: true,
            existing: result.existing,
            receipt: toSessionInputReceipt(goalId, record),
        };
    }

    /**
     * 受理关联当前 running Run 的 Steer。
     *
     * @remarks
     * 先按统一账本判定重复与身份冲突，再委派执行所有者；受理不取消在途模型或
     * 工具调用，执行器在下一模型边界按受理顺序应用。目标 Run 非 running、已
     * 进入 Interrupt 或身份冲突时明确拒绝，不降级为普通队列消息。
     */
    private async admitSteer(
        goalId: string,
        input: Extract<SessionInput, { readonly kind: "steer" }>,
    ): Promise<SessionInputAdmissionResult> {
        const shape = validateSessionInputShape(input);
        if (shape !== undefined) return { ok: false, code: shape.code, message: shape.message };
        const digest = computeSessionInputDigest(input);

        const current = await this.store.restore(goalId);
        if (current === undefined) {
            return { ok: false, code: "GOAL_NOT_FOUND", message: `Goal "${goalId}" was not found` };
        }
        const existing = findSessionInputRecord(current, input.inputId);
        if (existing !== undefined) {
            return existing.digest === digest && existing.kind === "steer"
                ? { ok: true, existing: true, receipt: toSessionInputReceipt(goalId, existing) }
                : {
                    ok: false,
                    code: "INPUT_CONFLICT",
                    message: `Input "${input.inputId}" already exists with a different kind or payload`,
                };
        }

        const result = await this.coordinator.steer(
            { goalId, runId: input.runId },
            input.inputId,
            input.content,
            { digest },
        );
        if (!result.ok) {
            return {
                ok: false,
                code: result.error === "STEER_CONFLICT" ? "STEER_CONFLICT" : result.error,
                message: `Steer input "${input.inputId}" was rejected: ${result.error}`,
            };
        }
        const committed = await this.store.restore(goalId);
        const record = committed === undefined ? undefined : findSessionInputRecord(committed, input.inputId);
        if (record === undefined) {
            return {
                ok: false,
                code: "GOAL_NOT_FOUND",
                message: `Goal "${goalId}" disappeared while admitting Steer input`,
            };
        }
        return {
            ok: true,
            existing: result.existing,
            receipt: toSessionInputReceipt(goalId, record),
        };
    }

    /** @param goalId - 目标 Goal。 @param inputId - 输入身份。 @returns 持久化收据或稳定失败。 */
    querySessionInput(goalId: string, inputId: string): Promise<SessionInputQueryResult> {
        return this.admission.query(goalId, inputId);
    }

    /** @param sessionId - 需要释放的句柄身份。 @remarks 解除连接只释放该句柄的订阅与来源。 */
    detachSession(sessionId: string): void {
        const streams = this.sessionStreams.get(sessionId);
        if (streams !== undefined) {
            for (const stream of [...streams]) stream.close();
            this.sessionStreams.delete(sessionId);
        }
        const consumers = this.sessionConsumers.get(sessionId);
        if (consumers !== undefined) {
            for (const consumer of consumers) consumer.stop();
            this.sessionConsumers.delete(sessionId);
        }
    }

    /**
     * 创建或连接 Session 并等待首个 Run 到达等待或终态。
     *
     * @remarks
     * 复用同一创建与执行链，不另建执行循环；等待以最新持久化状态复核，末次
     * 提交通知丢失时由不超过一秒的核对周期补齐。等待交互时立即返回可恢复身份。
     *
     * @param request - 与 `create` 相同的稳定创建请求。
     * @param control - 当前调用共享的中止控制。
     * @returns 首个 Run 的真实结果与可恢复身份，或稳定失败。
     * @throws 创建阶段的存储或 Trajectory 失败时传播原始异常。
     * @example
     * ```ts
     * const result = await sessions.query({ goalId: "goal-1", inputId: "input-1", content: "一次性任务", profileId: "default" });
     * ```
     */
    async query(
        request: SessionCreateRequest,
        control?: Parameters<typeof createGoalCheckpoint>[2],
    ): Promise<SessionQueryResult> {
        const created = await this.create(request, control);
        if (!created.ok) return created;
        const runId = created.receipt.appliedRunId;
        if (runId === undefined) {
            return {
                ok: false,
                error: { code: "QUERY_FAILED", message: "Creation receipt does not reference its first Run" },
            };
        }
        // 先等待本实例的执行任务结算：它保持事件循环活跃，不依赖实时通知。
        const execution = this.executions.get(request.goalId);
        if (execution !== undefined) {
            await execution.catch(() => undefined);
        }
        const state = await this.waitForRunOutcome(request.goalId, runId);
        if (state === undefined) {
            return {
                ok: false,
                error: { code: "GOAL_NOT_FOUND", message: `Goal "${request.goalId}" was not found` },
            };
        }
        if (state.runId !== runId) {
            return {
                ok: false,
                error: {
                    code: "QUERY_FAILED",
                    message: `Run "${runId}" was replaced before reaching a reportable state`,
                },
            };
        }
        return {
            ok: true,
            session: created.session,
            receipt: created.receipt,
            runId,
            outcome: state.runStatus === "completed" || state.runStatus === "failed"
                || state.runStatus === "cancelled" || state.runStatus === "waiting"
                ? state.runStatus
                : "waiting",
            state,
        };
    }


    /** 在短提交边界内为已生效的恢复命令写入账本收据。 */
    private async recordResumeReceipt(
        goalId: string,
        input: Extract<SessionInput, { readonly kind: "resume" }>,
        digest: SessionInputDigest,
    ): Promise<SessionInputRecord | undefined> {
        return withGoalMutationGate(this.store, goalId, async () => {
            const latest = await this.store.restore(goalId);
            if (latest === undefined) return undefined;
            const existing = findSessionInputRecord(latest, input.inputId);
            if (existing !== undefined) return existing;
            const entry: SessionInputRecord = {
                inputId: input.inputId,
                kind: "resume",
                digest,
                sequence: nextSessionInputSequence(latest),
                status: "applied",
                admittedAtRevision: (latest.state.commitRevision ?? 0) + 1,
                targetRunId: input.runId,
                appliedRunId: latest.state.run.id,
            };
            const nextGoal: Goal = {
                ...latest,
                state: {
                    ...latest.state,
                    inputLedger: [...(latest.state.inputLedger ?? []), entry],
                },
            };
            await this.committer.commit(nextGoal, { sessionState: "caller" });
            return entry;
        });
    }

    /** 以只读核对等待目标 Run 到达等待或终态；通知丢失由核对周期补齐。 */
    private waitForRunOutcome(goalId: string, runId: string): Promise<GoalSessionState | undefined> {
        return new Promise((resolve) => {
            let finished = false;
            const finish = (state: GoalSessionState | undefined): void => {
                if (finished) return;
                finished = true;
                unsubscribe();
                resolve(state);
            };
            const check = async (): Promise<void> => {
                if (finished) return;
                let state: GoalSessionState | undefined;
                try {
                    state = await this.readSessionState(goalId);
                } catch (error) {
                    this.onBackgroundFailure?.(goalId, error);
                    return;
                }
                if (state === undefined) {
                    finish(undefined);
                    return;
                }
                if (state.runId === runId) {
                    if (state.runStatus === "waiting" || state.runStatus === "completed"
                        || state.runStatus === "failed" || state.runStatus === "cancelled") {
                        finish(state);
                    }
                    return;
                }
                // Run 已被后继 Run 替换：目标 Run 的终态在归档历史中。
                const archivedStatus = await this.archivedRunStatus(goalId, runId);
                if (archivedStatus !== undefined) {
                    finish({ ...state, runId, runStatus: archivedStatus });
                }
            };
            const unsubscribe = this.revisionMonitor.observe(goalId, (signal) => {
                if (signal.kind === "revision_changed") void check();
            });
            void check();
        });
    }

    private async archivedRunStatus(goalId: string, runId: string): Promise<GoalSessionState["runStatus"] | undefined> {
        const goal = await this.store.restore(goalId);
        return goal?.state.completedRuns?.find((record) => record.runId === runId)?.status;
    }

    /**
     * 顺序消费宿主提供的异步输入来源。
     *
     * @remarks 每条输入先等待持久化受理再读取下一项；业务拒绝继续消费，基础设施
     * 失败停止该来源且不预取。解除句柄或停止消费后，迟到的输入不会被受理。
     */
    async consumeSessionInputs(
        goalId: string,
        sessionId: string,
        inputs: AsyncIterable<SessionInput>,
    ): Promise<SessionInputConsumptionResult> {
        const stopped = deferredSignal();
        const consumer = {
            stopped: false,
            stop: () => {
                consumer.stopped = true;
                stopped.resolve();
            },
        };
        let consumers = this.sessionConsumers.get(sessionId);
        if (consumers === undefined) {
            consumers = new Set();
            this.sessionConsumers.set(sessionId, consumers);
        }
        consumers.add(consumer);
        try {
            const iterator = inputs[Symbol.asyncIterator]();
            while (true) {
                let next: IteratorResult<SessionInput> | typeof STOPPED;
                try {
                    next = await Promise.race([iterator.next(), stopped.promise]);
                } catch (error) {
                    return { reason: "failed", error };
                }
                // 停止消费后不再等待挂起的 next()，也不受理迟到项；来源资源归宿主。
                if (next === STOPPED || consumer.stopped) {
                    void iterator.return?.();
                    return { reason: "stopped" };
                }
                if (next.done === true) return { reason: "completed" };
                try {
                    await this.sendSessionInput(goalId, next.value);
                } catch (error) {
                    void iterator.return?.().catch(() => undefined);
                    return { reason: "failed", error };
                }
            }
        } finally {
            consumers.delete(consumer);
            if (consumers.size === 0) this.sessionConsumers.delete(sessionId);
        }
    }

    /**
     * 建立整个 Goal 的会话输出流。
     *
     * @remarks
     * 调用即注册缓冲再读取一致快照；首项为 `state_sync`。存在订阅时启动不超过
     * 一秒的提交核对任务，没有观察者时停止。订阅退出只释放自己的队列。
     *
     * @param goalId - 目标 Goal。
     * @param sessionId - 建立订阅的句柄身份。
     * @returns 独立、单消费者的输出流。
     */
    openSessionEvents(goalId: string, sessionId: string): SessionOutputStream {
        const publisher = this.executionStream ?? new InMemoryExecutionStreamPublisher();
        const stream = new GoalSessionStream({
            publisher,
            goalId,
            readState: (target) => this.readSessionState(target),
            onClosed: (closed) => {
                closed.setMonitorUnsubscribe(() => undefined);
                this.sessionStreams.get(sessionId)?.delete(closed);
            },
        });
        const unsubscribeMonitor = this.revisionMonitor.observe(goalId, () => {
            void stream.resync();
        });
        stream.setMonitorUnsubscribe(unsubscribeMonitor);
        let streams = this.sessionStreams.get(sessionId);
        if (streams === undefined) {
            streams = new Set();
            this.sessionStreams.set(sessionId, streams);
        }
        streams.add(stream);
        return stream;
    }

    /**
     * 停止全部订阅、输入消费与核对任务，并有界等待后台执行结算。
     *
     * @param options - 可选的结算期限；省略时无限等待。
     * @returns 无未结算工作时完成。
     * @throws SessionManagerCloseError 期限届满仍有未结算的输入消费或后台执行。
     * @example
     * ```ts
     * await sessions.close({ timeoutMs: 5000 });
     * ```
     */
    async close(options?: { readonly timeoutMs?: number }): Promise<void> {
        for (const streams of this.sessionStreams.values()) {
            for (const stream of [...streams]) stream.close();
        }
        this.sessionStreams.clear();
        for (const consumers of this.sessionConsumers.values()) {
            for (const consumer of consumers) consumer.stop();
        }
        this.sessionConsumers.clear();
        this.revisionMonitor.dispose();

        const timeoutMs = options?.timeoutMs;
        if (timeoutMs === undefined) {
            await this.waitForIdle();
            return;
        }
        let timer: unknown;
        const deadline = new Promise<"timeout">((resolve) => {
            // 期限由调用方主动等待，不适用 unref：到期前必须保持事件循环活跃。
            timer = setTimeout(() => resolve("timeout"), timeoutMs);
        });
        const settled = await Promise.race([
            this.waitForIdle().then(() => "settled" as const),
            deadline,
        ]);
        clearTimeout(timer as ReturnType<typeof setTimeout>);
        if (settled === "timeout") {
            throw new SessionManagerCloseError([...this.executions.keys()]);
        }
    }

    /**
     * 等待所有已受理的后台执行任务结束。
     *
     * @remarks 该方法只用于测试与关闭结算；它不取消执行，也不释放活动名额。
     * @returns 当没有后台执行任务时完成。
     * @example
     * ```ts
     * await sessions.waitForIdle();
     * ```
     */
    async waitForIdle(): Promise<void> {
        while (this.backgroundTasks.size > 0) {
            await Promise.allSettled([...this.backgroundTasks]);
        }
    }

    private connectExistingCreate(
        request: SessionCreateRequest,
        goal: Goal,
    ): SessionCreateResult {
        const record = findSessionInputRecord(goal, request.inputId);
        if (record === undefined) {
            return this.failure(
                "INPUT_CONFLICT",
                `Goal "${request.goalId}" already exists without the requested creation input`,
            );
        }
        const digest = computeSessionInputDigest({
            kind: "message",
            inputId: request.inputId,
            content: request.content,
        });
        if (record.digest !== digest || record.kind !== "message") {
            return this.failure(
                "INPUT_CONFLICT",
                `Goal "${request.goalId}" was created with a different input payload`,
            );
        }
        // 创建重试只连接原 Goal：既不推进 Run，也不把重试当作恢复指令。
        return {
            ok: true,
            existing: true,
            session: this.createHandle(request.goalId),
            receipt: toSessionInputReceipt(request.goalId, record),
        };
    }

    private createHandle(goalId: string): Session {
        return new Session(goalId, `session-${randomUUID()}`, this);
    }

    /**
     * 受理后唤醒执行所有者。
     *
     * @remarks
     * 只有新的普通消息或显式继续队列会唤醒；创建重试、只读连接和普通查询都
     * 不会。运行中或重建后仍需显式恢复的 Run 不会被唤醒，避免隐式解除恢复约束。
     */
    private wakeAfterAdmission(goalId: string, input: SessionInput): void {
        const explicitContinuation = input.kind === "queue_control" && input.action === "continue";
        if (input.kind !== "message" && !explicitContinuation) return;
        if (explicitContinuation) this.explicitContinuations.add(goalId);
        if (this.executions.has(goalId)) {
            // 执行所有者正在运行：在它退出前重新检查队列，避免新受理项无人消费。
            this.pendingWakes.add(goalId);
            return;
        }
        if (this.activeGoalId !== undefined && this.activeGoalId !== goalId) return;
        const task = this.runWake(goalId, explicitContinuation);
        this.backgroundTasks.add(task);
        void task.catch(() => undefined).finally(() => {
            this.backgroundTasks.delete(task);
        });
    }

    /**
     * 在会话内联推进（交互回答、显式恢复）后继续消费队列。
     *
     * @remarks 只有终态、未暂停且仍有待处理消息的 Goal 会重新启动执行所有者；
     * 等待与运行中的结果保持原状。
     */
    private continueQueueIfEligible(goalId: string): void {
        if (this.executions.has(goalId)) return;
        if (this.activeGoalId !== undefined && this.activeGoalId !== goalId) return;
        const task = this.runWake(goalId, false);
        this.backgroundTasks.add(task);
        void task.catch(() => undefined).finally(() => {
            this.backgroundTasks.delete(task);
        });
    }

    private async runWake(goalId: string, explicitContinuation: boolean): Promise<void> {
        const goal = await this.store.restore(goalId);
        if (goal === undefined) return;
        const status = goal.state.run.status;
        const queue = goal.state.messageQueue;
        if (queue?.pause !== undefined && !explicitContinuation) return;
        if ((queue?.items.length ?? 0) === 0) return;
        if (status !== "completed" && status !== "failed" && status !== "cancelled") return;
        if (this.executions.has(goalId)) return;
        if (this.activeGoalId !== undefined && this.activeGoalId !== goalId) return;
        this.startExecution(goalId);
    }

    private startExecution(goalId: string): void {
        if (this.executions.has(goalId)) return;
        if (this.activeGoalId !== undefined && this.activeGoalId !== goalId) return;
        this.activeGoalId = goalId;
        const task = this.runExecution(goalId);
        this.executions.set(goalId, task);
        this.backgroundTasks.add(task);
        void task.catch(() => undefined).finally(() => {
            this.backgroundTasks.delete(task);
        });
        this.trackBackgroundTask?.("session_execution", task);
    }

    private async runExecution(goalId: string): Promise<void> {
        try {
            // 同一执行所有者在 Run 结束后继续消费队列；等待、暂停与无消息时释放名额。
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const goal = await this.store.restore(goalId);
                if (goal === undefined) return;
                const status = goal.state.run.status;
                if (status === "created" || status === "running") {
                    this.alignModelBinding?.(goal.state.modelSelection);
                    const result = await this.coordinator.advance({ goalId, runId: goal.state.run.id });
                    if (!result.ok) {
                        this.onBackgroundFailure?.(goalId, new Error(`${result.error.code}: ${result.error.message}`));
                        return;
                    }
                    continue;
                }
                if (status === "waiting") return;

                const queue = goal.state.messageQueue;
                if (queue?.pause !== undefined) return;
                if ((queue?.items.length ?? 0) === 0) return;

                if (status === "failed" || status === "cancelled") {
                    if (!this.explicitContinuations.delete(goalId)) {
                        await this.pauseQueueAfterTerminalRun(goalId);
                        return;
                    }
                }
                const advanced = await this.startNextQueuedRun(goalId);
                if (!advanced) return;
            }
        } catch (error) {
            // 后台异常被观察：保留真实恢复状态，不伪装为终态或成功。
            this.onBackgroundFailure?.(goalId, error);
        } finally {
            this.executions.delete(goalId);
            if (this.activeGoalId === goalId) this.activeGoalId = undefined;
            if (this.pendingWakes.delete(goalId)) {
                this.continueQueueIfEligible(goalId);
            }
        }
    }

    /**
     * 为队首消息创建后继 Run。
     *
     * @remarks 归档旧 Run、追加真实用户消息、创建新 Run 与应用队首输入在同一
     * Snapshot 提交中完成；队列修订或队首身份失配时不创建 Run，也不跳过旧项。
     */
    private async startNextQueuedRun(goalId: string): Promise<boolean> {
        const goal = await this.store.restore(goalId);
        if (goal === undefined) return false;
        const queue = goal.state.messageQueue;
        const head = queue?.items[0];
        if (head === undefined || queue === undefined) return false;
        this.alignModelBinding?.(goal.state.modelSelection);
        const result = await this.coordinator.continue(
            { goalId, runId: goal.state.run.id },
            head.content,
            undefined,
            undefined,
            { inputId: head.inputId, queueRevision: queue.revision },
        );
        if (!result.ok) {
            this.onBackgroundFailure?.(goalId, new Error(`${result.error.code}: ${result.error.message}`));
            return false;
        }
        return true;
    }

    /** 在失败或取消的终态上持久化队列暂停，保留尚未应用的消息。 */
    private async pauseQueueAfterTerminalRun(goalId: string): Promise<void> {
        try {
            await withGoalMutationGate(this.store, goalId, async () => {
                const latest = await this.store.restore(goalId);
                if (latest === undefined) return;
                const status = latest.state.run.status;
                if (status !== "failed" && status !== "cancelled") return;
                if (latest.state.messageQueue?.pause !== undefined) return;
                const reason = latest.state.run.interruption !== undefined ? "user_interrupt" : "run_failed";
                const paused: Goal = {
                    ...latest,
                    state: {
                        ...latest.state,
                        messageQueue: withQueuePause(latest.state.messageQueue, {
                            reason,
                            runId: latest.state.run.id,
                        }),
                    },
                };
                await this.committer.commit(paused, { sessionState: "caller" });
            });
        } catch (error) {
            this.onBackgroundFailure?.(goalId, error);
        }
    }

    private failure(code: SessionManagerErrorCode, message: string): { readonly ok: false; readonly error: { readonly code: SessionManagerErrorCode; readonly message: string } } {
        return { ok: false, error: { code, message } };
    }
}
