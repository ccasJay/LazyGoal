import type {
    Goal,
    RunMode,
    RunStatus,
} from "./domain";
import type { ExecutionStreamEvent } from "../../execution-stream/src/index";
import type {
    SessionInput,
    SessionInputAdmissionResult,
    SessionInputQueryResult,
    SessionInputReceipt,
    SessionQueuePauseReason,
} from "./session-input";
import type { SessionInputOutcome, SessionOutputStream } from "./session-stream";

/**
 * 会话输出流的事件联合。
 *
 * @remarks
 * 首项为一致快照 `state_sync`；`input_result` 按 `inputId` 关联受理或拒绝；
 * `activity` 携带公开执行事件（Run 仍是来源身份）；`sync_error` 报告读取故障；
 * `closed` 报告订阅结束原因（背压、主动关闭或发布端关闭）。
 *
 * @example
 * ```ts
 * const event: SessionOutputEvent = { type: "state_sync", state };
 * ```
 */
export type SessionOutputEvent =
    | { readonly type: "state_sync"; readonly state: GoalSessionState }
    | { readonly type: "input_result"; readonly outcome: SessionInputOutcome }
    | { readonly type: "activity"; readonly event: ExecutionStreamEvent }
    | { readonly type: "sync_error"; readonly message: string }
    | { readonly type: "closed"; readonly reason: "backpressure" | "closed" | "publisher_closed" };

/**
 * 会话句柄可见的 Goal 状态投影。
 *
 * @remarks
 * 该投影只包含安全、可公开的会话事实：Run 身份与状态、提交修订、队列修订与
 * 暂停、待处理数量、当前等待类型以及是否需要显式恢复。它不包含隐藏推理、
 * 密钥或原始 Provider 响应。
 *
 * @example
 * ```ts
 * const state = await session.read();
 * if (state?.needsRecovery) console.log(state.runStatus, state.commitRevision);
 * ```
 */
export interface GoalSessionState {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** 当前（或最新）Run 的稳定标识。 */
    readonly runId: string;
    /** 当前 Run 的持久化状态。 */
    readonly runStatus: RunStatus;
    /** 当前 Run 的模式。 */
    readonly mode: RunMode;
    /** Goal 级单调提交修订；省略等同 0。 */
    readonly commitRevision: number;
    /** 消息队列修订。 */
    readonly queueRevision: number;
    /** 队列是否处于暂停。 */
    readonly queuePaused: boolean;
    /** 暂停原因；未暂停时省略。 */
    readonly queuePauseReason?: SessionQueuePauseReason | undefined;
    /** 尚未应用的普通消息数量。 */
    readonly pendingMessageCount: number;
    /** 尚未应用的 Steer 数量。 */
    readonly pendingSteerCount: number;
    /** 当前等待的交互类型；运行中或终态时省略。 */
    readonly waitingFor?:
        | "ask_user"
        | "task_approval"
        | "action_approval"
        | "action_recovery"
        | "blocked"
        | undefined;
    /**
     * 是否需要调用方显式恢复执行。
     *
     * @remarks
     * `true` 表示快照仍处于 `created`／`running`（或存在未结算的用户中断），
     * 但当前实例没有持有该 Goal 的执行所有者：只读连接、重建实例和新的普通
     * 消息都不会自动恢复，必须提交显式 `resume`。
     */
    readonly needsRecovery: boolean;
    /**
     * 当前 Run 的用户中断状态；未受理用户中断时省略。
     *
     * @remarks
     * 调用方据此区分已受理（`requested`）、停止／有限收尾（`repairing`）与
     * 已结算（`finished`）；`outcomeUnknown` 表示仍有未解决的未知外部效果。
     */
    readonly interruption?: {
        readonly requestId: string;
        readonly status: "requested" | "repairing" | "finished";
        readonly outcomeUnknown: boolean;
    } | undefined;
    /** 当前实例是否持有该 Goal 的执行所有者。 */
    readonly executionOwner: boolean;
}

/**
 * Session 句柄委派的会话操作边界。
 *
 * @remarks
 * 句柄只做身份携带与委派，不自行改写 Goal 快照；具体读取、受理与解除连接由
 * Runtime 会话所有者实现。
 *
 * @example
 * ```ts
 * const handle = new Session("goal-1", "session-1", manager);
 * ```
 */
export interface SessionHandlePort {
    /** 读取 Goal 的最新安全会话投影。 */
    readSessionState(goalId: string): Promise<GoalSessionState | undefined>;
    /** 受理解析一条会话输入。 */
    sendSessionInput(goalId: string, input: SessionInput): Promise<SessionInputAdmissionResult>;
    /** 按身份查询持久化输入收据。 */
    querySessionInput(goalId: string, inputId: string): Promise<SessionInputQueryResult>;
    /** 建立该句柄对整个 Goal 的输出订阅。 */
    openSessionEvents(goalId: string, sessionId: string): SessionOutputStream;
    /** 释放该句柄的来源与订阅；不影响共享实例与其他句柄。 */
    detachSession(sessionId: string): void;
}

/**
 * 单个 Goal 的轻量会话句柄。
 *
 * @remarks
 * 句柄由 {@link SessionManager} 创建，携带 Goal 与句柄身份；多个句柄可以连接
 * 同一 Goal 并共享同一个 Runtime 执行所有者。句柄只暴露读取、输入受理与解除
 * 连接；它不拥有实例关闭权，`detach()` 不删除 Goal、不取消执行、不暂停队列。
 *
 * @example
 * ```ts
 * const { session } = await sessions.open("goal-1");
 * const state = await session.read();
 * const receipt = await session.send({ kind: "message", inputId: "input-1", content: "继续" });
 * session.detach();
 * ```
 */
export class Session {
    /** 该句柄连接的 Goal 稳定标识。 */
    readonly goalId: string;
    /** 句柄自身的稳定标识；用于释放该句柄的订阅与来源。 */
    readonly sessionId: string;
    private readonly port: SessionHandlePort;
    private readonly streams = new Set<SessionOutputStream>();
    private detachedState = false;

    /**
     * @param goalId - 连接的 Goal。
     * @param sessionId - 句柄稳定标识。
     * @param port - 委派的 Runtime 会话操作边界。
     */
    constructor(goalId: string, sessionId: string, port: SessionHandlePort) {
        this.goalId = goalId;
        this.sessionId = sessionId;
        this.port = port;
    }

    /** 该句柄是否已解除连接。 */
    get detached(): boolean {
        return this.detachedState;
    }

    /**
     * 读取最新安全会话状态。
     *
     * @returns 最新投影；Goal 不存在时返回 `undefined`。
     * @throws 句柄已解除连接、快照损坏或读取失败时抛出异常。
     * @example
     * ```ts
     * const state = await session.read();
     * ```
     */
    async read(): Promise<GoalSessionState | undefined> {
        this.assertAttached();
        return this.port.readSessionState(this.goalId);
    }

    /**
     * 受理一条会话输入。
     *
     * @param input - 带稳定 `inputId` 的会话输入。
     * @returns 已受理收据、既有收据或稳定业务拒绝。
     * @throws 句柄已解除连接时拒绝；保存失败或结果不明时抛出
     *   {@link SessionInputAdmissionError}。
     * @example
     * ```ts
     * await session.send({ kind: "message", inputId: "input-1", content: "继续" });
     * ```
     */
    async send(input: SessionInput): Promise<SessionInputAdmissionResult> {
        this.assertAttached();
        return this.port.sendSessionInput(this.goalId, input);
    }

    /**
     * 按身份查询持久化输入收据。
     *
     * @param inputId - 首次调用方保存的输入身份。
     * @returns 收据、未找到或 Goal 缺失的稳定结果。
     * @throws 句柄已解除连接或底层读取失败时抛出异常。
     * @example
     * ```ts
     * const queried = await session.getInput("input-1");
     * ```
     */
    async getInput(inputId: string): Promise<SessionInputQueryResult> {
        this.assertAttached();
        return this.port.querySessionInput(this.goalId, inputId);
    }

    /**
     * 建立整个 Goal 的输出订阅。
     *
     * @returns 独立、单消费者的异步输出流；首项是一致 `state_sync`。
     * @throws 句柄已解除连接时拒绝。
     * @example
     * ```ts
     * const stream = session.events();
     * ```
     */
    events(): SessionOutputStream {
        this.assertAttached();
        const stream = this.port.openSessionEvents(this.goalId, this.sessionId);
        this.streams.add(stream);
        return stream;
    }

    /**
     * 幂等解除该句柄的连接。
     *
     * @remarks
     * 只释放该句柄自己的输入来源与订阅；不删除 Goal、不取消执行、不暂停队列，
     * 也不接管共享 Runtime 的关闭权。解除后该句柄的后续调用会被拒绝。
     * @example
     * ```ts
     * session.detach();
     * ```
     */
    detach(): void {
        if (this.detachedState) return;
        this.detachedState = true;
        for (const stream of [...this.streams]) stream.close();
        this.streams.clear();
        this.port.detachSession(this.sessionId);
    }

    private assertAttached(): void {
        if (this.detachedState) {
            throw new SessionDetachedError(this.goalId, this.sessionId);
        }
    }
}

/** 已解除连接的 Session 句柄被继续使用时抛出的类型化错误。 */
export class SessionDetachedError extends Error {
    readonly code = "SESSION_DETACHED" as const;

    constructor(
        readonly goalId: string,
        readonly sessionId: string,
    ) {
        super(`Session "${sessionId}" for Goal "${goalId}" was detached`);
        this.name = "SessionDetachedError";
    }
}

/** 便于测试与调用方构造只读状态投影的最小输入。 */
export interface GoalSessionStateInput {
    readonly goal: Goal;
    readonly executionOwner: boolean;
}

/**
 * 从已提交 Goal 快照投影安全会话状态。
 *
 * @param input - 当前 Goal 与实例是否持有执行所有者。
 * @returns 不含隐藏推理与敏感字段的状态投影。
 * @example
 * ```ts
 * const state = projectGoalSessionState({ goal, executionOwner: false });
 * ```
 */
export function projectGoalSessionState(input: GoalSessionStateInput): GoalSessionState {
    const { goal, executionOwner } = input;
    const run = goal.state.run;
    const queue = goal.state.messageQueue;
    const pendingSteers = (run.steerInputs ?? []).filter((steer) => steer.status === "pending").length;
    const interruptionActive = run.interruption !== undefined && run.interruption.status !== "finished";
    return {
        goalId: goal.id,
        runId: run.id,
        runStatus: run.status,
        mode: run.mode,
        commitRevision: goal.state.commitRevision ?? 0,
        queueRevision: queue?.revision ?? 0,
        queuePaused: queue?.pause !== undefined,
        ...(queue?.pause === undefined ? {} : { queuePauseReason: queue.pause.reason }),
        pendingMessageCount: queue?.items.length ?? 0,
        pendingSteerCount: pendingSteers,
        ...(run.status === "waiting" ? { waitingFor: resolveWaitingFor(goal) } : {}),
        needsRecovery: !executionOwner
            && (run.status === "created" || run.status === "running" || interruptionActive),
        ...(run.interruption === undefined
            ? {}
            : {
                interruption: {
                    requestId: run.interruption.requestId,
                    status: run.interruption.status,
                    outcomeUnknown: run.interruption.outcomeUnknown === true,
                },
            }),
        executionOwner,
    };
}

function resolveWaitingFor(goal: Goal): GoalSessionState["waitingFor"] {
    const run = goal.state.run;
    if (run.interruption !== undefined && run.interruption.status !== "finished") {
        return "action_recovery";
    }
    if (run.pendingInteraction?.kind === "ask_user") return "ask_user";
    if (run.pendingInteraction?.kind === "task_approval") return "task_approval";
    if (run.pendingAction?.status === "awaiting_approval") return "action_approval";
    if (run.pendingAction?.status === "outcome_unknown") return "action_recovery";
    return "blocked";
}

/** 会话受理结果的稳定拒绝分类；`BUSY` 表示实例活动名额由其他 Goal 占用。 */
export type SessionManagerErrorCode =
    | "INVALID_INPUT"
    | "INPUT_CONFLICT"
    | "PROFILE_NOT_FOUND"
    | "GOAL_NOT_FOUND"
    | "GOAL_UNREADABLE"
    | "SESSION_NOT_READY"
    | "BUSY";

/** 供外部读取的最小收据别名，避免调用方直接依赖内部记录类型。 */
export type SessionReceipt = SessionInputReceipt;
