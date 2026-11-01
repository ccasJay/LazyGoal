import type {
    Session,
    SessionInput,
    SessionInputOutcome,
    SessionInteractionResponse,
    SessionInputReceipt,
    SessionManager,
    SessionOutputEvent,
    SessionOutputStream,
    GoalModelSelection,
    GoalSessionState,
    SessionEventSource,
    SessionGenerationEvent,
    SessionInteractionEvent,
    SessionMessageCommittedEvent,
    SessionMessageQuery,
    SessionToolActivityEvent,
} from "../../runtime/src/index";
import type {
    BrowserCreateSessionCommand,
    BrowserCreateSessionResult,
    BrowserControlScope,
    BrowserControlSnapshot,
    BrowserGoalActivityEvent,
    BrowserGoalLiveEvent,
    BrowserGoalSessionState,
    BrowserSessionInputCommand,
    BrowserSessionInputOutcome,
    BrowserSessionInputQueryResult,
    BrowserSessionInputReceipt,
    BrowserSessionInputResult,
    BrowserSessionInteractionResponse,
    BrowserSessionMessageListResult,
    BrowserSessionMessageResult,
    BrowserSessionState,
    BrowserToolActivity,
} from "../../web-contracts/src/index";
import { BROWSER_ACTIVITY_EVENT_TYPES, isJsonValue } from "../../web-contracts/src/index";

const MAX_PENDING_LIVE_EVENTS = 128;
type ActivityBoundaryReason = "assistant_reply" | "user_wait" | "stage_change" | "terminal" | "failure" | "unknown";

/**
 * 一个已连接 Goal 的安全实时事件流。
 *
 * @example
 * ```ts
 * const feed = await session.openEvents("goal-1");
 * if (feed.ok) for await (const event of feed.feed.events) console.log(event.type);
 * ```
 */
export interface BrowserGoalLiveFeed {
    /** 当前授权页面可读的安全事件流。 */
    readonly events: AsyncIterable<BrowserGoalLiveEvent>;
    /** 解除该连接的订阅与句柄；不影响其他连接或执行。 */
    close(): void;
}

/**
 * Browser 委派 Runtime 会话的窄端口。
 *
 * @remarks
 * Browser 不持有输入账本、队列、执行名额或后台推进：创建、受理、收据查询、
 * 状态读取与 Goal 范围订阅全部委派同一个 Runtime 会话所有者。实现方负责把
 * Runtime 结果投影为 `web-contracts` 的 wire DTO，并在失败时返回稳定错误码。
 *
 * @example
 * ```ts
 * const port: BrowserGoalSessionPort = {
 *     create: (command) => root.sessions.create(toCreateRequest(command)),
 *     submit: (goalId, input) => root.sessions.sendSessionInput(goalId, toRuntimeInput(input)),
 *     readInput: (goalId, inputId) => root.sessions.querySessionInput(goalId, inputId),
 *     readState: (goalId) => root.sessions.readSessionState(goalId),
 *     openEvents: async (goalId, signal) => openSessionEvents(root.sessions, goalId, signal),
 * };
 * ```
 */
export interface BrowserGoalSessionPort {
    /**
     * 创建或连接长期 Session，并持久化受理首条输入。
     *
     * @param command - 已通过 wire 校验的创建命令。
     * @returns 已受理的 Goal／Run 与首条收据，或稳定拒绝码。
     * @throws 首次保存或 Trajectory 依赖失败时传播原始异常，调用方按原身份核验。
     */
    create(command: BrowserCreateSessionCommand): Promise<BrowserCreateSessionResult>;
    /**
     * 受理一条统一会话输入。
     *
     * @param goalId - URL 路径中的 Goal 身份。
     * @param input - 已通过 wire 校验的会话输入。
     * @returns 新受理、既有收据或稳定拒绝码。
     * @throws 保存失败或结果不明时传播错误，路由转换为 `input_admission_failed`。
     */
    submit(goalId: string, input: BrowserSessionInputCommand): Promise<BrowserSessionInputResult>;
    /**
     * 按身份查询持久化收据。
     *
     * @param goalId - 目标 Goal。
     * @param inputId - 调用方保存的输入身份。
     * @returns 命中收据、未找到或稳定读取失败。
     * @throws Goal 缺失以外的读取故障时传播错误。
     */
    readInput(goalId: string, inputId: string): Promise<BrowserSessionInputQueryResult>;
    /**
     * 读取最新安全会话状态。
     *
     * @param goalId - 目标 Goal。
     * @returns 安全投影；Goal 不存在时返回 `undefined`。
     * @throws 快照损坏或读取失败时传播错误。
     */
    readState(goalId: string): Promise<BrowserSessionState | undefined>;
    /**
     * 打开覆盖整个 Goal 的安全实时事件流。
     *
     * @param goalId - 目标 Goal。
     * @param signal - HTTP 请求断开时结束订阅的取消信号。
     * @returns 有界安全事件流或 Goal 缺失、不可读的稳定拒绝。
     * @throws 打开订阅时的底层读取失败向上传播。
     */
    openEvents(goalId: string, signal?: AbortSignal): Promise<BrowserSessionEventsResult>;
    /**
     * 按稳定身份执行有界消息列表读取。
     *
     * @param goalId - 目标 Goal。
     * @param query - 追加起点、区间末尾与页大小。
     * @returns 有界消息列表或稳定失败。
     * @throws 底层读取失败时传播错误。
     */
    listMessages(goalId: string, query: SessionMessageQuery): Promise<BrowserSessionMessageListResult>;
    /**
     * 按稳定身份读取单条消息正文。
     *
     * @param goalId - 目标 Goal。
     * @param messageId - 消息稳定身份。
     * @param offset - 起始位置（UTF-16 code unit）。
     * @returns 消息正文或稳定失败。
     * @throws 底层读取失败时传播错误。
     */
    readMessage(goalId: string, messageId: string, offset?: number): Promise<BrowserSessionMessageResult>;
}

/** Goal 范围实时流的打开结果。 */
export type BrowserSessionEventsResult =
    | { readonly ok: true; readonly feed: BrowserGoalLiveFeed }
    | { readonly ok: false; readonly error: "goal_not_found" | "goal_unreadable" };

/**
 * 构造委派 Runtime 会话所有者的 Browser 窄端口。
 *
 * @remarks
 * 端口只做 wire DTO 与 Runtime 结果之间的投影：受理状态、去重判定、队列、执行
 * 名额与恢复全部由 Runtime 决定。创建时的模型选择由调用方通过
 * `resolveModelSelection` 解析；解析失败明确返回，不做隐式回退。
 *
 * @param dependencies - Runtime 会话所有者、创建模型解析与关闭状态读取。
 * @returns 可交给 `createBrowserGoalRoutes` 的会话端口。
 * @example
 * ```ts
 * const port = createBrowserGoalSessionPort({
 *     sessions: root.sessions,
 *     isShuttingDown: () => root.abortController.signal.aborted,
 *     resolveModelSelection: async (command) => ({ ok: true, selection: await resolve(command) }),
 * });
 * ```
 */
export function createBrowserGoalSessionPort(
    dependencies: BrowserGoalSessionPortDependencies,
): BrowserGoalSessionPort {
    const shuttingDown = (): boolean => dependencies.isShuttingDown?.() === true;
    return {
        create: async (command) => {
            if (shuttingDown()) return { ok: false, error: "service_shutting_down" };
            const resolved = await dependencies.resolveModelSelection(command);
            if (!resolved.ok) return { ok: false, error: resolved.error };
            if (shuttingDown()) return { ok: false, error: "service_shutting_down" };
            const created = await dependencies.sessions.create({
                goalId: command.goalId,
                inputId: command.inputId,
                content: command.intent,
                profileId: dependencies.profileId,
                ...(command.mode === undefined ? {} : { mode: command.mode }),
                modelSelection: resolved.selection,
            });
            if (!created.ok) {
                const code = created.error.code;
                return {
                    ok: false,
                    error: code === "PROFILE_NOT_FOUND" ? "profile_not_found"
                        : code === "INVALID_INPUT" ? "invalid_goal_input"
                            : code === "GOAL_UNREADABLE" ? "goal_unreadable"
                                : code === "INPUT_CONFLICT" ? "goal_id_conflict"
                                    : code === "BUSY" ? "goal_busy" : "create_failed",
                };
            }
            const runId = created.receipt.appliedRunId
                ?? (await dependencies.sessions.readSessionState(command.goalId))?.runId;
            if (runId === undefined) return { ok: false, error: "create_failed" };
            return {
                ok: true,
                existing: created.existing,
                goalId: command.goalId,
                runId,
                receipt: projectSessionInputReceipt(created.receipt),
            };
        },
        submit: async (goalId, input) => {
            if (shuttingDown()) return { ok: false, error: "session_unavailable" };
            try {
                const result = await dependencies.sessions.sendSessionInput(
                    goalId,
                    toRuntimeSessionInput(input),
                );
                return result.ok
                    ? { ok: true, existing: result.existing, receipt: projectSessionInputReceipt(result.receipt) }
                    : { ok: false, error: result.code };
            } catch {
                // 保存可能已经发生：调用方必须使用原 inputId 查询或重试。
                return { ok: false, error: "input_admission_failed" };
            }
        },
        readInput: async (goalId, inputId) => {
            const result = await dependencies.sessions.querySessionInput(goalId, inputId);
            if (result.ok) {
                return result.found
                    ? { ok: true, found: true, receipt: projectSessionInputReceipt(result.receipt) }
                    : { ok: true, found: false };
            }
            return { ok: false, error: result.code === "GOAL_NOT_FOUND" ? "GOAL_NOT_FOUND" : "input_read_failed" };
        },
        readState: async (goalId) => {
            const state = await dependencies.sessions.readSessionState(goalId);
            return state === undefined ? undefined : projectSessionState(goalId, state);
        },
        openEvents: async (goalId, signal) => {
            const opened = await dependencies.sessions.open(goalId);
            if (!opened.ok) {
                return {
                    ok: false,
                    error: opened.error.code === "GOAL_NOT_FOUND" ? "goal_not_found" : "goal_unreadable",
                };
            }
            return {
                ok: true,
                feed: createBrowserSessionFeed(
                    opened.session,
                    opened.session.events(),
                    dependencies.readGoalState,
                    signal,
                ),
            };
        },
        listMessages: async (goalId, query) => {
            const result = await dependencies.sessions.readSessionMessages(goalId, query);
            if (!result.ok) return { ok: false, error: "message_range_invalid" };
            return {
                ok: true,
                messages: result.messages.map((message) => ({
                    messageId: message.messageId,
                    role: message.role,
                    runId: message.runId,
                    position: message.position,
                    ...(message.purpose === undefined ? {} : { purpose: message.purpose }),
                    sourceKind: message.sourceKind,
                    sourceId: message.sourceId,
                    content: message.content,
                    contentLength: message.contentLength,
                    truncated: message.truncated,
                })),
                ...(result.nextAfterMessageId === undefined ? {} : { nextAfterMessageId: result.nextAfterMessageId }),
                ...(result.throughMessageId === undefined ? {} : { throughMessageId: result.throughMessageId }),
                total: result.total,
            };
        },
        readMessage: async (goalId, messageId, offset) => {
            const result = await dependencies.sessions.readSessionMessageBody(goalId, messageId, offset);
            if (!result.ok) return { ok: false, error: "message_not_found" };
            return {
                ok: true,
                message: {
                    messageId: result.entry.messageId,
                    role: result.entry.role,
                    runId: result.entry.runId,
                    position: result.entry.position,
                    ...(result.entry.purpose === undefined ? {} : { purpose: result.entry.purpose }),
                    sourceKind: result.entry.sourceKind,
                    sourceId: result.entry.sourceId,
                    content: result.entry.content,
                    contentLength: result.entry.contentLength,
                    truncated: result.entry.truncated,
                },
                ...(result.nextOffset === undefined ? {} : { nextOffset: result.nextOffset }),
            };
        },
    };
}

/**
 * Browser 会话窄端口的依赖。
 *
 * @example
 * ```ts
 * const dependencies: BrowserGoalSessionPortDependencies = {
 *     sessions: root.sessions,
 *     profileId: "default",
 *     resolveModelSelection: async () => ({ ok: true, selection: root.defaultModelSelection }),
 * };
 * ```
 */
export interface BrowserGoalSessionPortDependencies {
    /** Runtime 会话所有者；创建、受理、收据、状态与订阅都委派它。 */
    readonly sessions: Pick<
        SessionManager,
        | "create"
        | "open"
        | "readSessionState"
        | "sendSessionInput"
        | "querySessionInput"
        | "readSessionMessages"
        | "readSessionMessageBody"
    >;
    /** 创建新 Goal 时使用的 Profile 身份。 */
    readonly profileId: string;
    /**
     * 读取同一提交边界的完整 Goal 控制投影。
     *
     * @remarks
     * 每次订阅建立或重建时调用一次，用于在 `state_sync` 中携带可直接应用的
     * 权威控制快照；增量事件不重复调用。读取失败或无法与 Runtime 状态对齐时，
     * 快照被省略，客户端按既有窄状态入口自行恢复。
     *
     * @param goalId - 正在订阅的 Goal 身份。
     * @returns 完整 Goal 控制投影；Goal 不存在时返回 `undefined`。
     */
    readGoalState(goalId: string): Promise<BrowserGoalSessionState | undefined>;
    /**
     * 解析创建时的完整模型选择。
     *
     * @param command - 已通过 wire 校验的创建命令。
     * @returns 已验证的选择或稳定失败码；不做隐式回退。
     */
    resolveModelSelection(command: BrowserCreateSessionCommand): Promise<
        | { readonly ok: true; readonly selection: GoalModelSelection }
        | { readonly ok: false; readonly error: "model_not_selectable" | "model_catalog_unavailable" }
    >;
    /** 读取宿主关闭状态；关闭后拒绝尚未开始的写命令。 */
    isShuttingDown?: () => boolean;
}

/**
 * 把 Runtime 会话输出流投影为浏览器安全事件流。
 *
 * @remarks
 * 首项 `state_sync` 直接来自 Runtime 的一致快照；`input_result` 按 `inputId` 关联；
 * 执行活动只投影公开白名单类型，并保留真实来源 Run。发布缺口与同步读取失败都
 * 只要求客户端重新读取最新 Snapshot，不伪装 Run 终态；背压或发布端关闭时结束
 * 该订阅，其他订阅与执行不受影响。句柄 `detach()` 只释放本连接的资源。
 *
 * @param session - 由 `sessions.open` 返回的只读句柄。
 * @param stream - `session.events()` 返回的 Goal 范围输出流。
 * @param readGoalState - 首次同步时读取一次完整 Goal 控制投影。
 * @param signal - 可选的 HTTP 断开信号。
 * @returns 有界、单消费者的安全事件流。
 * @example
 * ```ts
 * const feed = createBrowserSessionFeed(session, session.events(), readGoalState, signal);
 * ```
 */
export function createBrowserSessionFeed(
    session: Session,
    stream: SessionOutputStream,
    readGoalState: (goalId: string) => Promise<BrowserGoalSessionState | undefined>,
    signal?: AbortSignal,
): BrowserGoalLiveFeed {
    return new BrowserSessionFeedImpl(session, stream, readGoalState, signal);
}

class BrowserSessionFeedImpl implements BrowserGoalLiveFeed {
    private readonly queue = new LiveEventQueue();
    private closed = false;
    private readonly onAbort: () => void;

    constructor(
        private readonly session: Session,
        private readonly stream: SessionOutputStream,
        private readonly readGoalState: (goalId: string) => Promise<BrowserGoalSessionState | undefined>,
        private readonly signal?: AbortSignal,
    ) {
        this.onAbort = () => this.close();
        if (this.signal?.aborted === true) {
            this.close();
        } else {
            this.signal?.addEventListener("abort", this.onAbort, { once: true });
        }
        if (!this.closed) void this.observe();
    }

    get events(): AsyncIterable<BrowserGoalLiveEvent> {
        return this.queue;
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.signal?.removeEventListener("abort", this.onAbort);
        this.stream.close();
        this.session.detach();
        this.queue.close();
    }

    private push(event: BrowserGoalLiveEvent): void {
        if (this.closed) return;
        if (!this.queue.push(event)) this.close();
    }

    private async observe(): Promise<void> {
        try {
            for await (const event of this.stream) {
                if (this.closed || this.signal?.aborted === true) return;
                await this.onSessionEvent(event);
            }
        } catch {
            if (!this.closed) this.push({ type: "refresh_required", goalId: this.session.goalId });
        } finally {
            if (!this.closed) this.close();
        }
    }

    private async onSessionEvent(event: SessionOutputEvent): Promise<void> {
        const goalId = this.session.goalId;
        switch (event.type) {
            case "state_sync": {
                const state = projectSessionState(goalId, event.state);
                const snapshot = await this.readControlSnapshot(goalId, state);
                this.push({
                    type: "state_sync",
                    goalId,
                    state,
                    ...(snapshot === undefined ? {} : { snapshot }),
                });
                return;
            }
            case "input_result":
                this.push({ type: "input_result", goalId, outcome: projectInputOutcome(goalId, event.outcome) });
                return;
            case "generation_event":
                if (!this.isOwnSource(goalId, event.event.source)) return;
                if (this.pushCommittedBoundary(goalId, event.event.source, ["activity", "trajectory"])) return;
                this.onGenerationEvent(goalId, event.event);
                return;
            case "tool_activity":
                if (!this.isOwnSource(goalId, event.event.source)) return;
                if (this.pushCommittedBoundary(goalId, event.event.source, ["activity", "trajectory"])) return;
                this.onToolActivity(goalId, event.event);
                return;
            case "message_committed":
                this.push({
                    type: "message_committed",
                    goalId,
                    runId: event.event.runId,
                    message: projectCommittedMessage(event.event),
                });
                return;
            case "interaction_required": {
                const interaction = projectInteractionSummary(event.event);
                this.push({
                    type: "interaction_required",
                    goalId,
                    runId: event.event.runId,
                    interaction,
                });
                this.push({
                    type: "interaction_opened",
                    goalId,
                    runId: event.event.runId,
                    interactionId: interaction.interactionId,
                    kind: projectInteractionKind(interaction.kind),
                });
                return;
            }
            case "interaction_settled":
                this.push({
                    type: "interaction_settled",
                    goalId,
                    runId: event.event.runId,
                    interactionId: event.event.interactionId,
                    kind: projectInteractionKind(event.event.interactionKind),
                });
                if (this.pushCommittedBoundary(goalId, event.event.source, ["session"])) return;
                this.push({
                    type: "activity",
                    goalId,
                    runId: event.event.runId,
                    activity: projectActivityBoundary(event.event.source, "user_wait"),
                });
                return;
            case "run_status":
                this.push({
                    type: "run_status_changed",
                    goalId,
                    runId: event.event.source.runId,
                    status: projectRunStatus(event.event.kind),
                });
                if (this.pushCommittedBoundary(goalId, event.event.source, ["session"])) return;
                this.push({
                    type: "activity",
                    goalId,
                    runId: event.event.source.runId,
                    activity: projectActivityBoundary(event.event.source, projectRunStatusReason(event.event.kind)),
                });
                return;
            case "run_result":
                this.push({
                    type: "run_result",
                    goalId,
                    runId: event.event.runId,
                    result: event.event.kind,
                });
                if (this.pushCommittedBoundary(goalId, event.event.source, ["session"])) return;
                this.push({
                    type: "activity",
                    goalId,
                    runId: event.event.runId,
                    activity: projectActivityBoundary(event.event.source, "terminal"),
                });
                return;
            case "stream_fault":
                // 读取故障或缺口不伪装业务结果：要求客户端重新同步最新快照。
                this.push({
                    type: "stream_fault",
                    goalId,
                    code: event.event.kind === "gap" ? "gap" : "read_failed",
                    resync: ["session"],
                });
                this.push({ type: "refresh_required", goalId });
                return;
            case "commit_boundary": {
                const eventTypes = event.event.eventTypes;
                if (eventTypes.includes("observation_recorded") && event.event.actionId !== undefined) {
                    this.push({
                        type: "tool_activity",
                        goalId,
                        runId: event.event.source.runId,
                        activity: {
                            actionId: event.event.actionId,
                            ...(event.event.executionUnitId === undefined ? {} : { executionUnitId: event.event.executionUnitId }),
                            phase: "observed_committed",
                        },
                    });
                }
                this.push({
                    type: "state_committed",
                    goalId,
                    runId: event.event.source.runId,
                    commitRevision: event.event.commitRevision ?? 0,
                    changed: projectCommittedScopes(eventTypes),
                });
                this.push({ type: "snapshot_changed", goalId, runId: event.event.source.runId });
                return;
            }
            case "closed":
                this.push({ type: "closed", goalId, reason: event.reason });
                if (event.reason !== "closed") this.push({ type: "refresh_required", goalId });
                this.close();
                return;
        }
    }

    /**
     * 判断来源事件是否属于当前观察的 Goal。
     *
     * @remarks
     * 跨 Goal 的迟到输出必须被忽略：它既不能覆盖当前 Goal 的活动，也不能被
     * 当作当前 Run 的事实。
     *
     * @param goalId - 当前观察的 Goal。
     * @param source - 来源信封。
     * @returns 是否属于当前 Goal。
     */
    private isOwnSource(goalId: string, source: SessionEventSource): boolean {
        return source.goalId === goalId;
    }

    /**
     * 已随 Snapshot 落盘的来源事件只要求客户端重新核对受影响投影。
     *
     * @param goalId - 观察的 Goal。
     * @param source - 来源信封。
     * @param changed - 本次提交实际改变的作用域。
     * @returns 已按提交边界推送通知时返回 `true`。
     */
    private pushCommittedBoundary(
        goalId: string,
        source: SessionEventSource,
        changed: readonly BrowserControlScope[],
    ): boolean {
        if (source.durability !== "checkpoint") return false;
        this.push({
            type: "state_committed",
            goalId,
            runId: source.runId,
            commitRevision: 0,
            changed,
        });
        this.push({ type: "snapshot_changed", goalId, runId: source.runId });
        return true;
    }

    /**
     * 组装可直接应用的权威控制快照。
     *
     * @remarks
     * 只在首次同步或重连时读取一次完整 Goal 投影；Goal 缺失、读取失败或与
     * Runtime 快照的 Run 身份不一致时省略快照，不拼接来自不同提交的字段。
     *
     * @param goalId - 订阅的 Goal。
     * @param state - 同一订阅的窄会话状态。
     * @returns 可直接应用的快照；无法对齐时返回 `undefined`。
     */
    private async readControlSnapshot(
        goalId: string,
        state: BrowserSessionState,
    ): Promise<BrowserControlSnapshot | undefined> {
        try {
            const goal = await this.readGoalState(goalId);
            if (goal === undefined || goal.goalId !== goalId || goal.currentRunId !== state.runId) return undefined;
            return { goal, session: state };
        } catch {
            return undefined;
        }
    }

    private onGenerationEvent(goalId: string, event: SessionGenerationEvent): void {
        const source = event.source;
        switch (event.kind) {
            case "model_call_started":
                this.push({ type: "activity", goalId, runId: source.runId, activity: {
                    kind: "model_started", occurredAt: source.occurredAt,
                    ...(event.stage === undefined ? {} : { stage: event.stage }),
                    ...(event.modelCallId === undefined ? {} : { modelCallId: event.modelCallId }),
                    ...(event.executionUnitId === undefined ? {} : { executionUnitId: event.executionUnitId }),
                } });
                return;
            case "model_call_completed":
                this.push({ type: "activity", goalId, runId: source.runId, activity: { kind: "model_completed" } });
                return;
            case "step_started":
                this.push({ type: "activity", goalId, runId: source.runId, activity: { kind: "step_started" } });
                return;
            case "text_delta":
                this.push({
                    type: "activity",
                    goalId,
                    runId: source.runId,
                    activity: {
                        kind: "assistant_text_delta",
                        text: event.text,
                        truncated: event.truncated,
                        sourceEventId: source.eventId,
                        sourceCursor: source.cursor,
                    },
                });
                return;
            case "reply":
                this.push({
                    type: "activity",
                    goalId,
                    runId: source.runId,
                    activity: projectActivityBoundary(source, "assistant_reply"),
                });
                return;
            case "candidate_preview":
                this.push({
                    type: "activity",
                    goalId,
                    runId: source.runId,
                    activity: {
                        kind: "candidate_preview",
                        sourceEventId: source.eventId,
                        sourceCursor: source.cursor,
                        candidateId: event.candidateId,
                        text: event.text,
                        startOffset: event.startOffset,
                        truncated: event.truncated,
                        complete: event.complete,
                    },
                });
                return;
            case "candidate_invalidated":
                this.push({
                    type: "activity",
                    goalId,
                    runId: source.runId,
                    activity: {
                        kind: "candidate_invalidated",
                        sourceEventId: source.eventId,
                        sourceCursor: source.cursor,
                        candidateId: event.candidateId,
                        reason: event.reason,
                    },
                });
                return;
        }
    }

    private onToolActivity(goalId: string, event: SessionToolActivityEvent): void {
        this.push({
            type: "tool_activity",
            goalId,
            runId: event.source.runId,
            activity: projectToolActivity(event),
        });
        const source = event.source;
        switch (event.kind) {
            case "started":
                this.push({
                    type: "activity",
                    goalId,
                    runId: source.runId,
                    activity: {
                        kind: "tool_started",
                        sourceEventId: source.eventId,
                        sourceCursor: source.cursor,
                        actionId: event.actionId,
                        executionUnitId: event.executionUnitId,
                        toolId: event.toolId,
                        ...(event.inputSummary === undefined ? {} : { inputSummary: event.inputSummary }),
                    },
                });
                return;
            case "attempt_started":
                this.push({
                    type: "activity",
                    goalId,
                    runId: source.runId,
                    activity: {
                        kind: "tool_attempt_started",
                        sourceEventId: source.eventId,
                        sourceCursor: source.cursor,
                        actionId: event.actionId,
                        attempt: event.attempt,
                    },
                });
                return;
            case "attempt_failed":
                this.push({
                    type: "activity",
                    goalId,
                    runId: source.runId,
                    activity: {
                        kind: "tool_attempt_failed",
                        sourceEventId: source.eventId,
                        sourceCursor: source.cursor,
                        actionId: event.actionId,
                        attempt: event.attempt,
                        reason: event.reason,
                    },
                });
                return;
            case "finished":
                this.push({
                    type: "activity",
                    goalId,
                    runId: source.runId,
                    activity: {
                        kind: "tool_finished",
                        sourceEventId: source.eventId,
                        sourceCursor: source.cursor,
                        actionId: event.actionId,
                        toolId: event.toolId,
                        outcome: event.outcome,
                        ...(event.summary === undefined ? {} : { summary: event.summary }),
                    },
                });
                return;
        }
    }
}

class LiveEventQueue implements AsyncIterable<BrowserGoalLiveEvent>, AsyncIterator<BrowserGoalLiveEvent> {
    private readonly events: BrowserGoalLiveEvent[] = [];
    private readonly waiters: Array<(result: IteratorResult<BrowserGoalLiveEvent>) => void> = [];
    private closed = false;

    push(event: BrowserGoalLiveEvent): boolean {
        if (this.closed) return false;
        const waiter = this.waiters.shift();
        if (waiter !== undefined) {
            waiter({ value: event, done: false });
            return true;
        }
        if (this.events.length >= MAX_PENDING_LIVE_EVENTS) {
            this.events.length = 0;
            this.events.push({ type: "refresh_required", goalId: event.goalId });
            return false;
        }
        this.events.push(event);
        return true;
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        for (const waiter of this.waiters.splice(0)) {
            waiter({ value: undefined, done: true });
        }
    }

    next(): Promise<IteratorResult<BrowserGoalLiveEvent>> {
        const event = this.events.shift();
        if (event !== undefined) return Promise.resolve({ value: event, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
    }

    return(): Promise<IteratorResult<BrowserGoalLiveEvent>> {
        this.close();
        return Promise.resolve({ value: undefined, done: true });
    }

    [Symbol.asyncIterator](): AsyncIterator<BrowserGoalLiveEvent> {
        return this;
    }
}

function projectInteractionKind(
    kind: "ask_user" | "task_approval" | "action_approval" | "action_recovery",
): "question" | "task_approval" | "action_approval" | "action_recovery" {
    return kind === "ask_user" ? "question" : kind;
}

function projectRunStatus(kind: "waiting" | "stage_changed" | "failure" | "unknown"): "running" | "waiting" | "failed" {
    switch (kind) {
        case "waiting":
            return "waiting";
        case "failure":
            return "failed";
        case "stage_changed":
        case "unknown":
            return "running";
    }
}

function projectToolActivity(event: SessionToolActivityEvent): BrowserToolActivity {
    switch (event.kind) {
        case "started":
            return {
                actionId: event.actionId,
                executionUnitId: event.executionUnitId,
                toolId: event.toolId,
                attempt: 1,
                phase: "started",
            };
        case "attempt_started":
            return {
                actionId: event.actionId,
                ...(event.executionUnitId === undefined ? {} : { executionUnitId: event.executionUnitId }),
                attempt: event.attempt,
                phase: "attempting",
            };
        case "attempt_failed":
            return {
                actionId: event.actionId,
                ...(event.executionUnitId === undefined ? {} : { executionUnitId: event.executionUnitId }),
                attempt: event.attempt,
                phase: "retrying",
                reason: event.reason,
            };
        case "finished":
            return {
                actionId: event.actionId,
                ...(event.executionUnitId === undefined ? {} : { executionUnitId: event.executionUnitId }),
                toolId: event.toolId,
                phase: "result_pending",
                outcome: event.outcome,
                ...(event.summary === undefined ? {} : { summary: event.summary }),
            };
    }
}

function projectRunStatusReason(kind: "waiting" | "stage_changed" | "failure" | "unknown"): ActivityBoundaryReason {
    switch (kind) {
        case "waiting":
            return "user_wait";
        case "stage_changed":
            return "stage_change";
        case "failure":
            return "failure";
        case "unknown":
            return "unknown";
    }
}

function projectActivityBoundary(
    source: SessionEventSource,
    reason: ActivityBoundaryReason,
): BrowserGoalActivityEvent {
    return {
        kind: "activity_boundary",
        sourceEventId: source.eventId,
        sourceCursor: source.cursor,
        reason,
    };
}

/** 只改变会话控制快照的已提交事件类型。 */
const SESSION_COMMIT_EVENT_TYPES: ReadonlySet<string> = new Set([
    "state_committed",
    "step_committed",
    "goal_created",
    "run_created",
    "run_started",
    "run_waiting",
    "run_completed",
    "run_failed",
    "run_cancelled",
    "run_resumed",
    "run_interrupt_requested",
    "run_interrupted_action_unknown",
    "run_stage_declared",
    "run_stage_accepted",
    "run_stage_rejected",
    "run_plan_route_revised",
    "session_input_admitted",
    "session_input_applied",
    "session_input_cleared",
    "steer_input_received",
    "steer_input_applied",
    "ask_user_answered",
    "ask_user_replied",
    "ask_user_skipped",
    "task_approved",
    "task_feedback_received",
    "plan_mode_entered",
    "goal_plan_updated",
    "action_staged",
    "action_approved",
    "action_revised",
    "action_rejected",
    "action_recovered",
    "action_reexecution_authorized",
    "execution_error",
]);

/** 只改变 Tool／Sandbox Grant 摘要的已提交事件类型。 */
const GRANT_COMMIT_EVENT_TYPES: ReadonlySet<string> = new Set([
    "tool_grant_revoked",
    "sandbox_grant_revoked",
]);

/**
 * 从已提交来源事件类型推导实际失效作用域。
 *
 * @remarks
 * 只有已知会改变会话控制、Grant 摘要或 Activity／Trajectory 投影的事件才会声明
 * 对应作用域；无法识别的事件按 `session` 保守报告，不把全部作用域标为失效。
 *
 * @param eventTypes - 提交边界包含的来源事件类型。
 * @returns 非空且去重的失效作用域。
 */
function projectCommittedScopes(eventTypes: readonly string[]): readonly BrowserControlScope[] {
    const scopes = new Set<BrowserControlScope>();
    for (const eventType of eventTypes) {
        if (GRANT_COMMIT_EVENT_TYPES.has(eventType)) {
            scopes.add("grants");
            continue;
        }
        if (SESSION_COMMIT_EVENT_TYPES.has(eventType)) scopes.add("session");
        if ((BROWSER_ACTIVITY_EVENT_TYPES as readonly string[]).includes(eventType)) {
            scopes.add("activity");
            scopes.add("trajectory");
        }
        if (!SESSION_COMMIT_EVENT_TYPES.has(eventType)
            && !(BROWSER_ACTIVITY_EVENT_TYPES as readonly string[]).includes(eventType)) {
            scopes.add("session");
        }
    }
    return scopes.size === 0 ? ["session"] : [...scopes];
}

/**
 * 把 Runtime 的正式消息通知投影为 wire 结果。
 *
 * @param event - Runtime 已保存消息通知。
 * @returns 只包含身份、来源关联与提交修订的 wire 结果。
 */
function projectCommittedMessage(event: SessionMessageCommittedEvent): {
    readonly messageId: string;
    readonly role: "user" | "assistant";
    readonly runId: string;
    readonly position: SessionMessageCommittedEvent["position"];
    readonly purpose?: "process" | "answer" | "notice";
    readonly commitRevision: number;
    readonly previewId?: string;
} {
    return {
        messageId: event.messageId,
        role: event.role,
        runId: event.runId,
        position: event.position,
        ...(event.purpose === undefined ? {} : { purpose: event.purpose }),
        commitRevision: event.commitRevision,
        ...(event.previewId === undefined ? {} : { previewId: event.previewId }),
    };
}

/**
 * 把 Runtime 的等待交互投影为 wire 结果。
 *
 * @param event - Runtime 交互等待事件。
 * @returns 只包含规范引用与种类的 wire 结果。
 */
function projectInteractionSummary(event: SessionInteractionEvent): {
    readonly interactionId: string;
    readonly kind: "ask_user" | "task_approval" | "action_approval" | "action_recovery";
    readonly runId: string;
} {
    return {
        interactionId: event.interactionId,
        kind: event.interactionKind,
        runId: event.runId,
    };
}

/**
 * 把 Runtime 会话状态投影为不含 `undefined` 属性的 wire 投影。
 *
 * @remarks 只复制公开白名单字段；未设置的可选事实按缺省省略，便于 JSON 序列化。
 */
export function projectSessionState(goalId: string, state: GoalSessionState): BrowserSessionState {
    return {
        goalId,
        runId: state.runId,
        runStatus: state.runStatus,
        mode: state.mode,
        commitRevision: state.commitRevision,
        queueRevision: state.queueRevision,
        queuePaused: state.queuePaused,
        ...(state.queuePauseReason === undefined ? {} : { queuePauseReason: state.queuePauseReason }),
        pendingMessageCount: state.pendingMessageCount,
        pendingSteerCount: state.pendingSteerCount,
        ...(state.waitingFor === undefined ? {} : { waitingFor: state.waitingFor }),
        ...(state.interaction === undefined
            ? {}
            : {
                interaction: {
                    interactionId: state.interaction.interactionId,
                    kind: state.interaction.kind,
                    runId: state.interaction.runId,
                    ...(state.interaction.requestId === undefined ? {} : { requestId: state.interaction.requestId }),
                    ...(state.interaction.actionId === undefined ? {} : { actionId: state.interaction.actionId }),
                },
            }),
        messages: {
            count: state.messages.count,
            ...(state.messages.throughMessageId === undefined ? {} : { throughMessageId: state.messages.throughMessageId }),
            recent: state.messages.recent.map((message) => ({
                messageId: message.messageId,
                role: message.role,
                runId: message.runId,
                position: message.position,
                ...(message.purpose === undefined ? {} : { purpose: message.purpose }),
                sourceKind: message.sourceKind,
                sourceId: message.sourceId,
            })),
        },
        needsRecovery: state.needsRecovery,
        ...(state.interruption === undefined
            ? {}
            : {
                interruption: {
                    requestId: state.interruption.requestId,
                    status: state.interruption.status,
                    outcomeUnknown: state.interruption.outcomeUnknown,
                },
            }),
        executionOwner: state.executionOwner,
    };
}

/**
 * 把 Runtime 输入结果投影为 wire 结果。
 *
 * @param goalId - 观察的 Goal。
 * @param outcome - Runtime 公开受理／拒绝结果。
 * @returns 不含隐藏字段的 wire 结果。
 */
export function projectInputOutcome(goalId: string, outcome: SessionInputOutcome): BrowserSessionInputOutcome {
    return {
        goalId,
        inputId: outcome.inputId,
        kind: outcome.kind,
        ok: outcome.ok,
        ...(outcome.existing === undefined ? {} : { existing: outcome.existing }),
        ...(outcome.receipt === undefined ? {} : { receipt: projectSessionInputReceipt(outcome.receipt) }),
        ...(outcome.code === undefined ? {} : { code: outcome.code }),
    };
}

/**
 * 把 Runtime 收据投影为 wire 收据。
 *
 * @param receipt - Runtime 持久化收据。
 * @returns 只包含去重与追溯事实的 wire 收据。
 */
/**
 * 将 wire 命令收窄为 Runtime 会话输入。
 *
 * @remarks
 * wire DTO 的开放 JSON `input` 在合同推导中保持 `unknown`；Runtime 要求可移植的
 * `JsonValue`。该转换只收窄已经过 parser 的 JSON 值，不改变命令形状、不补默认值。
 */
function toRuntimeSessionInput(input: BrowserSessionInputCommand): SessionInput {
    if (input.kind !== "respond") return input;
    return { ...input, response: toRuntimeInteractionResponse(input.response) };
}

function toRuntimeInteractionResponse(
    response: BrowserSessionInteractionResponse,
): SessionInteractionResponse {
    if (response.kind !== "approve_action_revision") return response;
    if (!isJsonValue(response.input)) {
        throw new TypeError("Action review input must be a JSON value");
    }
    return { ...response, input: response.input };
}

export function projectSessionInputReceipt(receipt: SessionInputReceipt): BrowserSessionInputReceipt {
    return {
        goalId: receipt.goalId,
        inputId: receipt.inputId,
        kind: receipt.kind,
        sequence: receipt.sequence,
        status: receipt.status,
        admittedAtRevision: receipt.admittedAtRevision,
        ...(receipt.targetRunId === undefined ? {} : { targetRunId: receipt.targetRunId }),
        ...(receipt.appliedRunId === undefined ? {} : { appliedRunId: receipt.appliedRunId }),
        ...(receipt.messageIndex === undefined ? {} : { messageIndex: receipt.messageIndex }),
    };
}
