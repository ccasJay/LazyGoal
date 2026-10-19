import type {
    Session,
    SessionInputOutcome,
    SessionInputReceipt,
    SessionManager,
    SessionOutputEvent,
    SessionOutputStream,
    GoalModelSelection,
    GoalSessionState,
} from "../../runtime/src/index";
import type {
    BrowserCreateSessionCommand,
    BrowserCreateSessionResult,
    BrowserGoalActivityEvent,
    BrowserGoalLiveEvent,
    BrowserSessionInputCommand,
    BrowserSessionInputOutcome,
    BrowserSessionInputQueryResult,
    BrowserSessionInputReceipt,
    BrowserSessionInputResult,
    BrowserSessionState,
} from "../../web-contracts/src/index";

/**
 * Browser 端口消费的最小执行事件形状。
 *
 * @remarks
 * 只声明投影实际读取的字段，保持浏览器包不反向依赖 Execution Stream 包；
 * Runtime 会话输出直接以结构兼容的事件对象传入。
 *
 * @example
 * ```ts
 * const event: BrowserGoalExecutionEvent = {
 *     goalId: "goal-1", runId: "run-1", kind: "model_started",
 *     visibility: "public", durability: "live", payload: {},
 * };
 * ```
 */
export interface BrowserGoalExecutionEvent {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** 事件来源 Run。 */
    readonly runId: string;
    /** 事件类型名称。 */
    readonly kind: string;
    /** 来源事件标识；与 Trajectory 标识空间分离。 */
    readonly eventId: string;
    /** 来源游标；只在该实时来源内排序。 */
    readonly cursor: number;
    /** 可选的执行单元标识。 */
    readonly executionUnitId?: string;
    /** 可选的 Action 标识。 */
    readonly actionId?: string;
    /** 订阅过滤使用的可见性。 */
    readonly visibility: "public" | "diagnostic" | "restricted";
    /** 事件对应的实时、Trajectory 或 Snapshot 提交边界。 */
    readonly durability: "live" | "trajectory" | "checkpoint";
    /** JSON-safe 的事件内容。 */
    readonly payload: unknown;
}

const MAX_LIVE_TEXT_LENGTH = 2_000;
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
                const result = await dependencies.sessions.sendSessionInput(goalId, input);
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
            return { ok: true, feed: createBrowserSessionFeed(opened.session, opened.session.events(), signal) };
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
        "create" | "open" | "readSessionState" | "sendSessionInput" | "querySessionInput"
    >;
    /** 创建新 Goal 时使用的 Profile 身份。 */
    readonly profileId: string;
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
 * @param signal - 可选的 HTTP 断开信号。
 * @returns 有界、单消费者的安全事件流。
 * @example
 * ```ts
 * const feed = createBrowserSessionFeed(session, session.events(), signal);
 * ```
 */
export function createBrowserSessionFeed(
    session: Session,
    stream: SessionOutputStream,
    signal?: AbortSignal,
): BrowserGoalLiveFeed {
    return new BrowserSessionFeedImpl(session, stream, signal);
}

class BrowserSessionFeedImpl implements BrowserGoalLiveFeed {
    private readonly queue = new LiveEventQueue();
    private closed = false;
    private readonly onAbort: () => void;

    constructor(
        private readonly session: Session,
        private readonly stream: SessionOutputStream,
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
                this.onSessionEvent(event);
            }
        } catch {
            if (!this.closed) this.push({ type: "refresh_required", goalId: this.session.goalId });
        } finally {
            if (!this.closed) this.close();
        }
    }

    private onSessionEvent(event: SessionOutputEvent): void {
        const goalId = this.session.goalId;
        switch (event.type) {
            case "state_sync":
                this.push({ type: "state_sync", goalId, state: projectSessionState(goalId, event.state) });
                return;
            case "input_result":
                this.push({ type: "input_result", goalId, outcome: projectInputOutcome(goalId, event.outcome) });
                return;
            case "activity":
                this.onExecutionEvent(goalId, event.event);
                return;
            case "sync_error":
                // 读取故障不伪装业务结果：要求客户端重新同步最新快照。
                this.push({ type: "refresh_required", goalId });
                return;
            case "closed":
                if (event.reason !== "closed") this.push({ type: "refresh_required", goalId });
                this.close();
                return;
        }
    }

    private onExecutionEvent(goalId: string, event: BrowserGoalExecutionEvent): void {
        if (event.goalId !== goalId) return;
        if (event.kind === "live_gap") {
            this.push({ type: "refresh_required", goalId });
            return;
        }
        if (event.durability === "checkpoint" || event.kind === "step_committed") {
            this.push({ type: "snapshot_changed", goalId, runId: event.runId });
            return;
        }
        const activity = projectLiveActivity(event);
        if (activity !== undefined) {
            this.push({ type: "activity", goalId, runId: event.runId, activity });
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

function projectLiveActivity(
    event: BrowserGoalExecutionEvent,
): BrowserGoalActivityEvent | undefined {
    const identity = { sourceEventId: event.eventId, sourceCursor: event.cursor };
    switch (event.kind) {
        case "model_started":
            return { kind: event.kind };
        case "model_completed":
            return { kind: "model_completed" };
        case "step_started":
            return { kind: "step_started" };
        case "tool_started": {
            if (event.actionId === undefined || event.executionUnitId === undefined
                || !isRecord(event.payload) || typeof event.payload.toolId !== "string") return undefined;
            const inputSummary = projectSafeToolInputSummary(event.payload.toolId, event.payload.input);
            return {
                kind: "tool_started",
                ...identity,
                actionId: event.actionId,
                executionUnitId: event.executionUnitId,
                toolId: event.payload.toolId,
                ...(inputSummary === undefined ? {} : { inputSummary }),
            };
        }
        case "tool_finished": {
            if (event.actionId === undefined || !isRecord(event.payload)
                || typeof event.payload.toolId !== "string" || !isRecord(event.payload.observation)) return undefined;
            const observation = event.payload.observation;
            const outcome = observation.kind === "failure" ? "failure" : observation.kind === "success" ? "success" : undefined;
            if (outcome === undefined) return undefined;
            const summary = outcome === "failure" && typeof observation.message === "string"
                ? observation.message
                : typeof observation.summary === "string" ? observation.summary : undefined;
            return {
                kind: "tool_finished",
                ...identity,
                actionId: event.actionId,
                toolId: event.payload.toolId,
                outcome,
                ...(summary === undefined ? {} : { summary: summary.slice(0, 500) }),
            };
        }
        case "tool_attempt_started": {
            if (event.actionId === undefined || !isRecord(event.payload)
                || !Number.isSafeInteger(event.payload.attempt)) return undefined;
            return { kind: "tool_attempt_started", ...identity, actionId: event.actionId, attempt: Number(event.payload.attempt) };
        }
        case "tool_attempt_failed": {
            if (event.actionId === undefined || !isRecord(event.payload)
                || !Number.isSafeInteger(event.payload.attempt) || typeof event.payload.reason !== "string") return undefined;
            return {
                kind: "tool_attempt_failed", ...identity, actionId: event.actionId,
                attempt: Number(event.payload.attempt), reason: event.payload.reason.slice(0, 160),
            };
        }
        case "model_block_delta": {
            // 只有公开的普通正文增量进入当前活动视图；结构化 JSON、工具参数与 reasoning 不投影。
            if (!isRecord(event.payload) || event.payload.deltaKind !== "text"
                || typeof event.payload.delta !== "string") return undefined;
            const text = event.payload.delta;
            return {
                kind: "assistant_text_delta",
                ...identity,
                text: text.slice(0, MAX_LIVE_TEXT_LENGTH),
                truncated: text.length > MAX_LIVE_TEXT_LENGTH,
            };
        }
        case "model_block_completed": {
            // 整块交付的公开正文以完整文本一次性呈现；增量块的内容已由增量发布。
            if (!isRecord(event.payload) || event.payload.blockType !== "text"
                || event.payload.delivery !== "whole" || typeof event.payload.text !== "string") return undefined;
            const text = event.payload.text;
            if (text.length === 0) return undefined;
            return {
                kind: "assistant_text_delta",
                ...identity,
                text: text.slice(0, MAX_LIVE_TEXT_LENGTH),
                truncated: text.length > MAX_LIVE_TEXT_LENGTH,
            };
        }
        case "model_block_started":
            // 模型失败／取消的安全终止摘要只结束本次调用的观察，不产生公开活动 DTO。
        case "model_failed":
        case "model_cancelled":
            return undefined;
        case "decision_received": {
            if (isRecord(event.payload) && isRecord(event.payload.decision) && event.payload.decision.kind === "tool_call") return undefined;
            return projectActivityBoundary(identity, "assistant_reply");
        }
        case "run_waiting":
        case "task_approved":
        case "task_feedback_received":
        case "ask_user_answered":
        case "ask_user_cancelled":
            return projectActivityBoundary(identity, "user_wait");
        case "run_stage_declared":
        case "run_stage_accepted":
        case "run_stage_rejected":
        case "run_plan_route_revised":
            return projectActivityBoundary(identity, "stage_change");
        case "run_failed":
        case "run_completed":
        case "run_cancelled":
            return projectActivityBoundary(identity, "terminal");
        case "execution_error":
        case "action_rejected":
            return projectActivityBoundary(identity, "failure");
        case "model_response_received":
        case "model_context_frame":
        case "think_requested":
        case "think_completed":
        case "model_repair_attempt_started":
        case "model_repair_feedback_recorded":
        case "model_request_retry_recorded":
        case "action_staged":
        case "action_approved":
        case "action_recovered":
        case "observation_recorded":
        case "state_committed":
        case "memory_patch_accepted":
        case "context_lookup_requested":
        case "context_lookup_completed":
        case "context_lookup_not_found":
        case "context_lookup_failed":
            return undefined;
        default:
            return projectActivityBoundary(identity, "unknown");
    }
}

function projectSafeToolInputSummary(toolId: string, input: unknown): string | undefined {
    if (!isRecord(input)) return undefined;
    const key = toolId === "read_file" || toolId === "write_file" || toolId === "edit_file" ? "path"
        : toolId === "grep" ? "pattern"
            : toolId === "web_search" ? "query"
                : toolId === "web_fetch" ? "url" : undefined;
    const value = key === undefined ? undefined : input[key];
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 240) : undefined;
}

function projectActivityBoundary(
    identity: { readonly sourceEventId: string; readonly sourceCursor: number },
    reason: ActivityBoundaryReason,
): BrowserGoalActivityEvent {
    return { kind: "activity_boundary", ...identity, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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
