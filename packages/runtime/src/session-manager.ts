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
    type GoalSessionState,
    type SessionHandlePort,
    type SessionManagerErrorCode,
} from "./session";
import { SessionInputAdmission, type SessionInputAdmissionDependencies } from "./session-admission";
import {
    computeSessionInputDigest,
    findSessionInputRecord,
    toSessionInputReceipt,
    validateSessionInputShape,
    type SessionInput,
    type SessionInputAdmissionResult,
    type SessionInputQueryResult,
    type SessionInputReceipt,
} from "./session-input";
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
    /** 首个 Run 使用的模型选择；省略时使用默认基准。 */
    readonly modelSelection?: GoalModelSelection | undefined;
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
    /** 运行 created/running Run 的调度入口。 */
    readonly coordinator: Pick<GoalCoordinator, "advance">;
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
    private readonly coordinator: Pick<GoalCoordinator, "advance">;
    private readonly profiles: AgentProfileRegistry;
    private readonly runIdGenerator: RunIdGenerator;
    private readonly protocolValidator: GoalProtocolValidator | undefined;
    private readonly trajectoryStore: TrajectoryStore | undefined;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly trackBackgroundTask: ((label: string, task: Promise<void>) => void) | undefined;
    private readonly onBackgroundFailure: ((goalId: string, error: unknown) => void) | undefined;
    private readonly admission: SessionInputAdmission;
    private readonly executions = new Map<string, Promise<void>>();
    private readonly backgroundTasks = new Set<Promise<void>>();
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
        const admissionDependencies: SessionInputAdmissionDependencies = {
            store: this.store,
            committer: this.committer,
            onAdmitted: (goalId) => this.wakeExecution(goalId),
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

        let created: CreateGoalResult;
        try {
            created = await createGoalCheckpoint(
                {
                    goalId: request.goalId,
                    intent: request.content,
                    profileId: request.profileId,
                    ...(request.mode === undefined ? {} : { mode: request.mode }),
                    ...(request.maxSteps === undefined ? {} : { maxSteps: request.maxSteps }),
                    ...(request.modelSelection === undefined
                        ? {}
                        : { modelSelection: request.modelSelection }),
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
        this.wakeExecution(request.goalId);
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
        if (this.activeGoalId !== undefined && this.activeGoalId !== goalId) {
            return {
                ok: false,
                code: "BUSY",
                message: `Goal "${this.activeGoalId}" currently owns the instance execution slot`,
            };
        }
        return this.admission.admit(goalId, input);
    }

    /** @param goalId - 目标 Goal。 @param inputId - 输入身份。 @returns 持久化收据或稳定失败。 */
    querySessionInput(goalId: string, inputId: string): Promise<SessionInputQueryResult> {
        return this.admission.query(goalId, inputId);
    }

    /** @param sessionId - 需要释放的句柄身份。 @remarks 解除连接只释放该句柄的订阅与来源。 */
    detachSession(_sessionId: string): void {
        // TODO 7/8 注册的订阅与输入来源在此释放。
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

    private wakeExecution(goalId: string): void {
        if (this.activeGoalId !== undefined && this.activeGoalId !== goalId) return;
        void this.store.restore(goalId).then((goal) => {
            if (goal === undefined) return;
            const status = goal.state.run.status;
            if (status === "created" || status === "running") {
                this.startExecution(goalId);
                return;
            }
        }).catch((error: unknown) => {
            this.onBackgroundFailure?.(goalId, error);
        });
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
            const goal = await this.store.restore(goalId);
            if (goal === undefined) return;
            const status = goal.state.run.status;
            if (status !== "created" && status !== "running") {
                // 队列消费与后继 Run 创建由会话队列所有权实现决定；此处只释放名额。
                return;
            }
            const result = await this.coordinator.advance({ goalId, runId: goal.state.run.id });
            if (!result.ok) {
                this.onBackgroundFailure?.(goalId, new Error(`${result.error.code}: ${result.error.message}`));
            }
        } catch (error) {
            // 后台异常被观察：保留真实恢复状态，不伪装为终态或成功。
            this.onBackgroundFailure?.(goalId, error);
        } finally {
            this.executions.delete(goalId);
            if (this.activeGoalId === goalId) this.activeGoalId = undefined;
        }
    }

    private failure(code: SessionManagerErrorCode, message: string): { readonly ok: false; readonly error: { readonly code: SessionManagerErrorCode; readonly message: string } } {
        return { ok: false, error: { code, message } };
    }
}
