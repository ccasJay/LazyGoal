import { resolveWaitingFor } from "./domain";
import type {
    Goal,
    GoalMessagePosition,
    RunMode,
    RunStatus,
    RunWaitingFor,
} from "./domain";
import type {
    SessionInput,
    SessionInputAdmissionResult,
    SessionInputQueryResult,
    SessionInputReceipt,
    SessionQueuePauseReason,
} from "./session-input";
import type { SessionInputOutcome, SessionOutputStream } from "./session-stream";
import type {
    GoalInteractionView,
    InteractionDetailResult,
    InteractionViewRef,
} from "./interaction-view";
import type { GoalMessageSource } from "./domain";
import { projectInteractionView } from "./interaction-view";
import type {
    SessionMessageBodyResult,
    SessionMessageListResult,
    SessionMessageQuery,
} from "./session-message-query";
import type {
    InteractionHandlerAttachOptions,
    InteractionHandlerAttachResult,
    InteractionHandlerHandle,
    SessionInteractionHandlers,
} from "./interaction-handlers";

/**
 * 一个输入来源的消费结果。
 *
 * @remarks `completed` 表示来源正常结束；`stopped` 表示消费被调用方或句柄解除
 * 连接停止；`failed` 表示保存或受理基础设施失败，已受理工作仍然有效。
 *
 * @example
 * ```ts
 * const result = await session.consume(inputs);
 * if (result.reason === "failed") console.error(result.error);
 * ```
 */
export type SessionInputConsumptionResult = {
    readonly reason: "completed" | "stopped";
} | {
    readonly reason: "failed";
    readonly error: unknown;
};

/**
 * 会话输出流的事件联合。
 *
 * @remarks
 * 联合定义在 {@link SessionOutputEvent}：每个成员都是可辨识判别式，消费者按
 * `type` 分派即可，不需要猜测任意 `kind: string` 或未知 payload。
 */
export type { SessionOutputEvent } from "./session-output";

/**
 * 已提交消息的公开摘要。
 *
 * @remarks
 * 摘要只包含身份、角色、Run 归属、稳定位置、用途与来源判别式，不包含正文；正文由按
 * `messageId` 的只读查询提供。
 *
 * @example
 * ```ts
 * const summary: SessionMessageSummary = {
 *   messageId: "msg-1", role: "assistant", runId: "run-1", position: { afterSequence: 8, order: 0 }, purpose: "answer", sourceKind: "completion_candidate",
 * };
 * ```
 */
export interface SessionMessageSummary {
    /** 消息稳定身份。 */
    readonly messageId: string;
    /** 消息角色。 */
    readonly role: "user" | "assistant";
    /** 消息所属 Run。 */
    readonly runId: string;
    /** 消息在所属 Run 已提交事实流中的稳定位置。 */
    readonly position: GoalMessagePosition;
    /** 助手消息用途；用户消息省略。 */
    readonly purpose?: "process" | "answer" | "notice" | undefined;
    /** 来源判别式。 */
    readonly sourceKind: GoalMessageSource["kind"];
    /** 来源的稳定标识；用于关联同源重试与被替换的预览。 */
    readonly sourceId: string;
}

/**
 * 会话状态中已提交消息的有界范围。
 *
 * @remarks
 * `count` 是该 Goal 的已提交消息总数，`recent` 只保留最近若干条摘要，
 * `throughMessageId` 标识本次范围末尾。范围被截断时消费者必须按稳定身份继续
 * 读取，不能声称历史已全部同步。
 *
 * @example
 * ```ts
 * const range: SessionMessageRange = { count: 3, throughMessageId: "msg-3", recent: [] };
 * ```
 */
export interface SessionMessageRange {
    /** 该 Goal 的已提交消息总数。 */
    readonly count: number;
    /** 范围末尾的消息身份；没有消息时省略。 */
    readonly throughMessageId?: string | undefined;
    /** 最近的消息摘要，按提交顺序。 */
    readonly recent: readonly SessionMessageSummary[];
}

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
    /**
     * 当前 Run 的等待原因；运行中或终态时省略。
     *
     * @remarks
     * `blocked` 表示 Agent 主动等待且没有待处理交互或 Action。用户中断受理后旧交互
     * 引用失效，随后结算为取消。
     */
    readonly waitingFor?: RunWaitingFor | undefined;
    /**
     * 当前等待交互的规范引用；没有等待时省略。
     *
     * @remarks
     * 引用沿用 human-interaction 的 `interactionId` 契约：同一等待在初始同步、
     * 重复通知与重连后保持不变。等待之外不产生该字段。
     */
    readonly interaction?: {
        readonly interactionId: string;
        readonly kind: "question" | "task_approval" | "action_approval" | "action_recovery";
        readonly runId: string;
        readonly requestId?: string | undefined;
        readonly actionId?: string | undefined;
    } | undefined;
    /** 已提交消息的有界范围；不包含正文。 */
    readonly messages: SessionMessageRange;
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
     * 调用方据此区分等待取消结算（`requested`）与已结算（`finished`）；`outcomeUnknown` 表示仍有未解决的未知外部效果。
     */
    readonly interruption?: {
        readonly requestId: string;
        readonly status: "requested" | "finished";
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
    /** 按最新快照派生当前类型化交互视图。 */
    readSessionInteraction(goalId: string): Promise<GoalInteractionView | undefined>;
    /** 按稳定引用读取当前交互的完整审阅内容。 */
    readSessionInteractionDetail(
        goalId: string,
        ref: InteractionViewRef,
    ): Promise<InteractionDetailResult>;
    /** 受理解析一条会话输入。 */
    sendSessionInput(goalId: string, input: SessionInput): Promise<SessionInputAdmissionResult>;
    /** 按身份查询持久化输入收据。 */
    querySessionInput(goalId: string, inputId: string): Promise<SessionInputQueryResult>;
    /** 按稳定身份执行有界消息列表读取。 */
    readSessionMessages(goalId: string, query: SessionMessageQuery): Promise<SessionMessageListResult>;
    /** 按稳定身份读取单条消息正文。 */
    readSessionMessageBody(
        goalId: string,
        messageId: string,
        offset?: number,
    ): Promise<SessionMessageBodyResult>;
    /** 建立该句柄对整个 Goal 的输出订阅。 */
    openSessionEvents(goalId: string, sessionId: string): SessionOutputStream;
    /** 连接按交互种类分派的自动处理器；同一 Goal 只允许一个自动所有者。 */
    attachSessionInteractionHandlers(
        goalId: string,
        sessionId: string,
        handlers: SessionInteractionHandlers,
        options?: InteractionHandlerAttachOptions,
    ): InteractionHandlerAttachResult;
    /** 释放该句柄持有的自动处理器连接；不影响其他句柄与 Goal。 */
    detachSessionInteractionHandlers(goalId: string, sessionId: string): void;
    /** 顺序消费一个宿主拥有的异步输入来源。 */
    consumeSessionInputs(
        goalId: string,
        sessionId: string,
        inputs: AsyncIterable<SessionInput>,
    ): Promise<SessionInputConsumptionResult>;
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
    private readonly handlers = new Set<InteractionHandlerHandle>();
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
     * 读取当前已提交等待的类型化交互视图。
     *
     * @remarks 只读取最新快照派生的身份、种类与可用决定，不触发执行；重复同步
     * 或重连得到相同 `interactionId`。
     *
     * @returns 当前交互视图；没有可决定等待时返回 `undefined`。
     * @throws 句柄已解除连接或快照读取失败时抛出异常。
     * @example
     * ```ts
     * const view = await session.interaction();
     * ```
     */
    async interaction(): Promise<GoalInteractionView | undefined> {
        this.assertAttached();
        return this.port.readSessionInteraction(this.goalId);
    }

    /**
     * 按稳定引用读取当前交互的完整审阅内容。
     *
     * @param ref - 调用方保存的 Run 与交互引用。
     * @returns 完整内容，或引用与当前等待不匹配的稳定拒绝。
     * @throws 句柄已解除连接或快照读取失败时抛出异常。
     * @example
     * ```ts
     * const detail = await session.interactionDetail({ runId: "run-1", interactionId: "question:ask-1" });
     * ```
     */
    async interactionDetail(ref: InteractionViewRef): Promise<InteractionDetailResult> {
        this.assertAttached();
        return this.port.readSessionInteractionDetail(this.goalId, ref);
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
     * 按稳定身份执行有界消息列表读取。
     *
     * @remarks
     * 只读当前快照的正式消息：翻页区间由首批确定的 `throughMessageId` 固定，
     * 翻页期间新追加的消息不会混入既定范围。读取不调用模型或工具、不写状态。
     *
     * @param query - 追加起点、区间末尾与页大小。
     * @returns 列表结果，或明确的范围错误。
     * @throws 句柄已解除连接或快照读取失败时抛出异常。
     * @example
     * ```ts
     * const page = await session.messages({ limit: 50 });
     * ```
     */
    async messages(query: SessionMessageQuery = {}): Promise<SessionMessageListResult> {
        this.assertAttached();
        return this.port.readSessionMessages(this.goalId, query);
    }

    /**
     * 按稳定身份读取单条消息正文。
     *
     * @param messageId - 消息稳定身份。
     * @param offset - 起始位置（UTF-16 code unit）；省略时从头读取。
     * @returns 正文结果，或明确的不存在。
     * @throws 句柄已解除连接或快照读取失败时抛出异常。
     * @example
     * ```ts
     * const body = await session.message("msg-1");
     * ```
     */
    async message(messageId: string, offset?: number): Promise<SessionMessageBodyResult> {
        this.assertAttached();
        return this.port.readSessionMessageBody(this.goalId, messageId, offset);
    }

    /**
     * 连接按交互种类分派的自动处理器。
     *
     * @remarks
     * 同一 Goal 只允许一个自动所有者：已有连接时返回稳定冲突，不替换原处理器。
     * 连接先做一致同步，再核验当前等待是否允许自动投递；本次连接之前已经存在的
     * 历史等待不会因此被程序化回答，只有本实例新产生的等待或宿主显式恢复发现的
     * 请求才会被投递。处理函数在短提交 Gate 外运行，结果仍作为统一 `send` 受理。
     *
     * @param handlers - 按种类注册的处理函数；缺少对应函数时保持等待。
     * @returns 可解除的处理器句柄，或稳定冲突。
     * @throws 句柄已解除连接时拒绝。
     * @example
     * ```ts
     * const attached = session.attachInteractionHandlers({ onQuestion: async () => ({ kind: "unhandled" }) });
     * ```
     */
    attachInteractionHandlers(
        handlers: SessionInteractionHandlers,
        options?: InteractionHandlerAttachOptions,
    ): InteractionHandlerAttachResult {
        this.assertAttached();
        const result = this.port.attachSessionInteractionHandlers(this.goalId, this.sessionId, handlers, options);
        if (result.ok) this.handlers.add(result.handle);
        return result;
    }

    /**
     * 顺序消费一个异步输入来源。
     *
     * @remarks
     * 逐条等待持久化受理结果后才读取下一项，不等待业务执行结束；业务拒绝作为
     * 输入结果继续消费，保存或受理基础设施失败时停止读取该来源、不预取后续项并
     * 报告原始错误。来源结束时只结束该来源的消费：已受理输入、Session 与其他
     * 来源保持有效。停止消费后迟到的 `next()` 结果不会被受理，来源资源归宿主。
     *
     * @param inputs - 宿主拥有的异步输入来源。
     * @returns 来源结束、消费停止或基础设施失败的结果。
     * @throws 句柄已解除连接时拒绝。
     * @example
     * ```ts
     * for await (const input of inputs) await session.send(input);
     * const result = await session.consume(inputs);
     * ```
     */
    consume(inputs: AsyncIterable<SessionInput>): Promise<SessionInputConsumptionResult> {
        this.assertAttached();
        return this.port.consumeSessionInputs(this.goalId, this.sessionId, inputs);
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
        for (const handle of [...this.handlers]) handle.detach();
        this.handlers.clear();
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
    const interaction = projectInteractionView(goal);
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
        ...(run.status === "waiting" ? { waitingFor: resolveWaitingFor(run) } : {}),
        ...(interaction === undefined
            ? {}
            : {
                interaction: {
                    interactionId: interaction.interactionId,
                    kind: interaction.kind,
                    runId: interaction.runId,
                    ...(interaction.kind === "question" || interaction.kind === "task_approval"
                        ? { requestId: interaction.requestId }
                        : { actionId: interaction.actionId }),
                },
            }),
        messages: projectSessionMessageRange(goal),
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

/**
 * 状态投影中保留的最近消息摘要数量。
 *
 * @remarks 范围只用于定位与核对；完整历史由有界消息查询按稳定身份读取。
 */
export const MAX_SESSION_MESSAGE_RECENT = 20;

/**
 * 从已提交消息投影有界消息范围。
 *
 * @param goal - 当前已提交 Goal 快照。
 * @returns 消息总数、范围末尾身份与最近摘要。
 * @example
 * ```ts
 * const range = projectSessionMessageRange(goal);
 * ```
 */
export function projectSessionMessageRange(goal: Goal): SessionMessageRange {
    const messages = goal.state.messages;
    const recent = messages.slice(-MAX_SESSION_MESSAGE_RECENT).map((message) => ({
        messageId: message.messageId,
        role: message.role,
        runId: message.runId,
        position: { ...message.position },
        ...(message.role === "assistant" ? { purpose: message.purpose } : {}),
        sourceKind: message.source.kind,
        sourceId: projectMessageSourceId(message.source),
    }));
    const last = messages.at(-1);
    return {
        count: messages.length,
        ...(last === undefined ? {} : { throughMessageId: last.messageId }),
        recent,
    };
}

function projectMessageSourceId(source: GoalMessageSource): string {
    switch (source.kind) {
        case "goal_intent":
            return source.goalId;
        case "user_input":
            return source.inputId;
        case "interaction_response":
            return source.requestId;
        case "model_text":
            return `${source.modelCallId}#${source.blockIndex}`;
        case "stage_output":
            return `${source.executionUnitId}#${source.blockIndex}`;
        case "completion_candidate":
            return source.candidateId;
        case "host_execution":
            return source.actionId;
        case "runtime_notice":
            return source.noticeId;
    }
}


/** 会话受理结果的稳定拒绝分类；`BUSY` 表示实例活动名额由其他 Goal 占用或实例正在关闭。 */
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
