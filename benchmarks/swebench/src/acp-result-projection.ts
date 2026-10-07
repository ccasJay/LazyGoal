import { AcpRequestError } from "../../../packages/acp/src/index.js";
import { isRecord } from "./manifest.js";
import type {
    SessionNotification,
    ToolKind,
} from "@agentclientprotocol/sdk";
import type {
    AcpPromptResult,
    AcpSessionUpdate,
} from "../../../packages/acp/src/index.js";
import { isExecutionAbortedError } from "../../../packages/execution-control/src/index.js";
import {
    type JsonValue,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
} from "../../../packages/runtime/src/index.js";
import type {
    BenchmarkPersistenceLocator,
    HeadlessEpisodeResult,
    HeadlessModelUsage,
} from "../../src/headless-composition-root.js";

/** ACP Tool 输入和输出的默认 UTF-8 字节上限。 */
export const DEFAULT_ACP_TOOL_VALUE_BYTES = 16 * 1024;

/**
 * 发送给 ACP Session 的 Trajectory 投影配置。
 *
 * @remarks
 * `update` 只在底层 TrajectoryStore 成功追加 `tool_started` 或 `tool_finished`
 * 后调用；通知失败会拒绝本次 append，使 Runtime 进入错误路径，但不会撤销已经
 * 提交的事实。`signal` 中止后不会继续发送更新。
 *
 * @example
 * ```ts
 * const store = new AcpTrajectoryStore(baseStore, {
 *     sessionId: "session-1",
 *     update: async (notification) => clientUpdate(notification),
 * });
 * ```
 */
export interface AcpTrajectoryStoreOptions {
    /** 只允许接收这些更新的 ACP Session ID。 */
    readonly sessionId: string;
    /** 将已提交 Tool 事实发送给对应 ACP Session。 */
    readonly update: (notification: SessionNotification) => Promise<void>;
    /** Prompt 取消信号；中止后不再发送成功 Tool 更新。 */
    readonly signal?: AbortSignal;
    /** 输入和输出的最大 UTF-8 字节数；省略时使用 16 KiB。 */
    readonly maxValueBytes?: number;
}

/**
 * 将 Runtime Trajectory 的 Tool 事实投影为 ACP v1 Tool 更新。
 *
 * @remarks
 * 该装饰器只改变通知副作用，不改变底层 TrajectoryStore 的读取或追加结果。Tool
 * ID 映射到稳定的 ACP `ToolKind`；过长 JSON 值变成带 `truncated` 标记的 bounded
 * JSON 对象。实例属于一个 Session，不能跨题目或 Session 复用。
 *
 * @example
 * ```ts
 * const projected = new AcpTrajectoryStore(store, {
 *     sessionId: "session-1",
 *     update: async (notification) => send(notification),
 * });
 * ```
 */
export class AcpTrajectoryStore implements TrajectoryStore {
    private readonly inner: TrajectoryStore;
    private readonly options: Required<Pick<AcpTrajectoryStoreOptions, "sessionId" | "update" | "maxValueBytes">> & Pick<AcpTrajectoryStoreOptions, "signal">;

    constructor(inner: TrajectoryStore, options: AcpTrajectoryStoreOptions) {
        if (typeof options.sessionId !== "string" || options.sessionId.trim() === "") {
            throw new TypeError("ACP trajectory sessionId must be non-empty text");
        }
        if (typeof options.update !== "function") {
            throw new TypeError("ACP trajectory update must be a function");
        }
        const maxValueBytes = options.maxValueBytes ?? DEFAULT_ACP_TOOL_VALUE_BYTES;
        if (!Number.isSafeInteger(maxValueBytes) || maxValueBytes < 256) {
            throw new RangeError("ACP trajectory maxValueBytes must be at least 256 bytes");
        }
        this.inner = inner;
        this.options = {
            sessionId: options.sessionId,
            update: options.update,
            maxValueBytes,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        };
    }

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        const event = await this.inner.append(draft);
        if (event.eventType === "tool_started" || event.eventType === "tool_finished") {
            await this.notifyToolEvent(event);
        }
        return event;
    }

    read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.inner.read(query);
    }

    readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        return this.inner.readWithBoundary(query, committedThroughSequence);
    }

    private async notifyToolEvent(event: Extract<TrajectoryEvent, { eventType: "tool_started" | "tool_finished" }>): Promise<void> {
        if (this.options.signal?.aborted) return;
        const metadata = projectionMetadata(event);
        if (event.eventType === "tool_started") {
            const payload = event.payload;
            await this.options.update({
                sessionId: this.options.sessionId,
                update: {
                    sessionUpdate: "tool_call",
                    toolCallId: payload.actionId,
                    title: payload.toolId,
                    name: payload.toolId,
                    kind: toolKind(payload.toolId),
                    status: "in_progress",
                    rawInput: boundValue(payload.input, this.options.maxValueBytes),
                    _meta: metadata,
                },
            });
            return;
        }
        const payload = event.payload;
        const observation = payload.observation;
        await this.options.update({
            sessionId: this.options.sessionId,
            update: {
                sessionUpdate: "tool_call_update",
                toolCallId: payload.actionId,
                status: observation.kind === "success" ? "completed" : "failed",
                rawOutput: boundValue(observation, this.options.maxValueBytes),
                content: [{
                    type: "content",
                    content: {
                        type: "text",
                        text: boundedText(observationSummary(observation), this.options.maxValueBytes),
                    },
                }],
                _meta: metadata,
            },
        });
    }
}

/**
 * 由 Headless Root 终态映射得到的 ACP `_meta` 内容。
 *
 * @example
 * ```ts
 * const meta: SwebenchAcpResultMeta = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     runStatus: "completed",
 *     stopReason: null,
 *     completed: true,
 * };
 * ```
 */
export interface SwebenchAcpResultMeta extends Readonly<Record<string, unknown>> {
    readonly goalId: string;
    readonly runId: string;
    readonly runStatus: "created" | "running" | "waiting" | "completed" | "failed" | "cancelled";
    readonly stopReason: null | { readonly kind: string; readonly code?: string; readonly message?: string };
    readonly completed: boolean;
    readonly usage?: HeadlessModelUsage;
    readonly persistence?: BenchmarkPersistenceLocator;
}

/**
 * Worker 内部的安全失败，已有结果随 meta 保留；跨进程必须经 toSwebenchAcpFailure 编码。
 * @example
 * ```ts
 * throw new SwebenchAcpProjectionError("runtime", "INVALID_AGENT_DECISION", "Invalid model decision", meta);
 * ```
 */
export class SwebenchAcpProjectionError extends Error {
    readonly stage: "protocol" | "runtime" | "provider" | "cleanup";
    readonly code: string;

    constructor(stage: "protocol" | "runtime" | "provider" | "cleanup", code: string, message: string, readonly meta?: SwebenchAcpResultMeta) {
        super(message);
        this.name = "SwebenchAcpProjectionError";
        this.stage = stage;
        this.code = code;
    }
}

/**
 * 将 Headless Root 的可返回结果映射为 ACP Prompt 终态。
 *
 * @remarks
 * `completed` 与 `waiting` 都返回 `end_turn`；`max_steps_exceeded` 返回
 * `max_turn_requests`；已取消 Run 返回 `cancelled`。其他失败、未收敛状态或
 * cleanupError 都抛出安全的 `SwebenchAcpProjectionError`，不会形成成功响应。
 * `_meta` 只包含经过字段、整数和字节边界校验的 Goal/Run、终态、用量和 locator。
 *
 * @param result - Headless Root 已恢复并校验的结果。
 * @returns ACP Prompt 终态与可审计 metadata。
 * @throws `SwebenchAcpProjectionError` 当结果代表 Runtime 或基础设施失败时。
 * @example
 * ```ts
 * const response = mapSwebenchAcpResult(result);
 * console.log(response.stopReason, response.meta?.runStatus);
 * ```
 */
export function mapSwebenchAcpResult(result: HeadlessEpisodeResult<null>): AcpPromptResult {
    const meta = resultMeta(result);
    if (result.cleanupError !== undefined) {
        throw new SwebenchAcpProjectionError("cleanup", "CLEANUP_ERROR", "Worker cleanup failed", meta);
    }
    if (!result.progress.ok) {
        throw new SwebenchAcpProjectionError("runtime", result.progress.error.code, "Headless Runtime did not reach a valid terminal state", meta);
    }
    const run = result.goal.state.run;
    if (result.runner !== null && !result.runner.ok) {
        throw new SwebenchAcpProjectionError("runtime", result.runner.error.code, "Headless Runner did not reach a valid terminal state", meta);
    }
    if (result.model.runStatus !== run.status) {
        throw new SwebenchAcpProjectionError("protocol", "RUN_STATUS_MISMATCH", "Headless model and Goal Run statuses differ");
    }
    if (run.status === "completed" || run.status === "waiting") {
        return { stopReason: "end_turn", meta };
    }
    if (run.status === "cancelled") {
        return { stopReason: "cancelled", meta };
    }
    if (run.status === "failed" && run.stopReason?.kind === "max_steps_exceeded") {
        return { stopReason: "max_turn_requests", meta };
    }
    throw new SwebenchAcpProjectionError(
        "runtime",
        run.stopReason?.kind === "execution_error" ? run.stopReason.code : "RUN_NOT_TERMINAL",
        "Headless Runtime failed before a supported ACP terminal state",
        meta,
    );
}

/** 将中止错误转换成没有伪成功事实的取消结果。 */
export function cancelledAcpResult(
    identity: { readonly goalId: string; readonly runId: string },
): AcpPromptResult {
    validateIdentity(identity.goalId, "goalId");
    validateIdentity(identity.runId, "runId");
    return {
        stopReason: "cancelled",
        meta: {
            goalId: identity.goalId,
            runId: identity.runId,
            runStatus: "cancelled",
            stopReason: { kind: "cancelled" },
            completed: false,
        },
    };
}

/**
 * 将 Worker 异常编码为标准 ACP 错误；未知异常只发送固定安全消息。
 * @param error - 同进程失败；只有显式投影错误携带业务 metadata。
 * @returns 可被 SDK 序列化的错误，不把失败转换为成功终态。
 * @example
 * ```ts
 * throw toSwebenchAcpFailure(new Error("private detail"));
 * ```
 */
export function toSwebenchAcpFailure(error: unknown): AcpRequestError {
    const failure = error instanceof SwebenchAcpProjectionError ? error
        : new SwebenchAcpProjectionError("runtime", isExecutionAbortedError(error) ? "CANCELLED" : "WORKER_RUNTIME_ERROR", "Worker Runtime failed");
    return new AcpRequestError(-32603, failure.message, {
        swebench: { stage: failure.stage, code: failure.code, message: failure.message,
            ...(failure.meta === undefined ? {} : { meta: failure.meta }) },
    });
}

/**
 * 校验跨 ACP 传入的结果 metadata，只接受当前题目的身份和已知状态。
 * @param value - 未可信的 JSON 值。
 * @param identity - 当前 Supervisor 的 Goal/Run 身份。
 * @returns 已筛选的报告事实。
 * @throws TypeError 当身份、状态、停止原因或用量非法时。
 * @example
 * ```ts
 * const meta = parseSwebenchAcpMeta(response.meta, { goalId, runId });
 * ```
 */
export function parseSwebenchAcpMeta(value: unknown, identity: { goalId: string; runId: string }): SwebenchAcpResultMeta {
    if (!isRecord(value) || value.goalId !== identity.goalId || value.runId !== identity.runId
        || !["created", "running", "waiting", "completed", "failed", "cancelled"].includes(String(value.runStatus))
        || typeof value.completed !== "boolean" || value.completed !== (value.runStatus === "completed")) throw new TypeError("Invalid Worker result identity or status");
    let stopReason: SwebenchAcpResultMeta["stopReason"] = null;
    if (value.stopReason !== null) {
        const reason = value.stopReason;
        if (!isRecord(reason) || !["execution_error", "max_steps_exceeded", "cancelled"].includes(String(reason.kind))
            || (reason.kind === "execution_error" && (typeof reason.code !== "string" || typeof reason.message !== "string"))
            || (reason.code !== undefined && typeof reason.code !== "string")
            || (reason.message !== undefined && typeof reason.message !== "string")) throw new TypeError("Invalid Worker stop reason");
        stopReason = { kind: reason.kind as string,
            ...(reason.code === undefined ? {} : { code: boundedText(reason.code as string, 1024) }),
            ...(reason.message === undefined ? {} : { message: boundedText(reason.message as string, 1024) }) };
    }
    let usage: HeadlessModelUsage | undefined;
    if (value.usage !== undefined) {
        const raw = value.usage;
        if (!isRecord(raw) || ![raw.inputTokens, raw.outputTokens, raw.missingCalls].every(n =>
            typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) throw new TypeError("Invalid Worker usage");
        usage = { inputTokens: raw.inputTokens as number, outputTokens: raw.outputTokens as number, missingCalls: raw.missingCalls as number };
    }
    return { goalId: identity.goalId, runId: identity.runId, runStatus: value.runStatus as SwebenchAcpResultMeta["runStatus"],
        completed: value.completed, stopReason, ...(usage === undefined ? {} : { usage }) };
}

/**
 * 解码 SDK 错误中的 benchmark 数据；不依赖远端自定义 Error 原型。
 * @returns 非 benchmark 错误返回 undefined；合法数据返回本地错误及结果事实。
 * @throws TypeError 当声明为 benchmark 的数据非法时。
 * @example
 * ```ts
 * const failure = readSwebenchAcpFailure(error, { goalId, runId });
 * ```
 */
export function readSwebenchAcpFailure(error: unknown, identity: { goalId: string; runId: string }): SwebenchAcpProjectionError | undefined {
    if (!(error instanceof AcpRequestError) || !isRecord(error.data) || !("swebench" in error.data)) return undefined;
    const data = error.data.swebench;
    if (!isRecord(data) || !["protocol", "runtime", "provider", "cleanup"].includes(String(data.stage))
        || typeof data.code !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/.test(data.code)
        || typeof data.message !== "string" || data.message.length > 1024) throw new TypeError("Invalid Worker error data");
    return new SwebenchAcpProjectionError(data.stage as SwebenchAcpProjectionError["stage"], data.code, data.message,
        data.meta === undefined ? undefined : parseSwebenchAcpMeta(data.meta, identity));
}

function resultMeta(result: HeadlessEpisodeResult<null>): SwebenchAcpResultMeta {
    const run = result.goal.state.run;
    validateIdentity(result.goal.id, "goalId");
    validateIdentity(run.id, "runId");
    if (run.status === "created" || run.status === "running" || run.status === "waiting"
        || run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
        // Keep the exhaustive runtime status check local to this adapter boundary.
    } else {
        throw new SwebenchAcpProjectionError("protocol", "INVALID_RUN_STATUS", "Worker returned an unknown Run status");
    }
    const stopReason = run.stopReason === undefined
        ? null
        : run.stopReason.kind === "max_steps_exceeded"
            ? { kind: "max_steps_exceeded" }
            : {
                kind: "execution_error",
                code: boundedText(run.stopReason.code, DEFAULT_ACP_TOOL_VALUE_BYTES),
                message: boundedText(run.stopReason.message, DEFAULT_ACP_TOOL_VALUE_BYTES),
            };
    const usage = result.model.usage === undefined ? undefined : validateUsage(result.model.usage);
    const persistence = result.persistence === undefined ? undefined : validatePersistence(result.persistence);
    return {
        goalId: result.goal.id,
        runId: run.id,
        runStatus: run.status,
        stopReason,
        completed: result.model.completed === true,
        ...(usage === undefined ? {} : { usage }),
        ...(persistence === undefined ? {} : { persistence }),
    };
}

function projectionMetadata(event: Extract<TrajectoryEvent, { eventType: "tool_started" | "tool_finished" }>): Record<string, unknown> {
    validateIdentity(event.goalId, "goalId");
    validateIdentity(event.runId, "runId");
    validateIdentity(event.payload.actionId, "actionId");
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) {
        throw new SwebenchAcpProjectionError("protocol", "INVALID_TRAJECTORY_SEQUENCE", "Trajectory sequence is invalid");
    }
    return {
        goalId: event.goalId,
        runId: event.runId,
        actionId: event.payload.actionId,
        eventType: event.eventType,
        sequence: event.sequence,
        ...(event.executionUnitId === undefined ? {} : { executionUnitId: event.executionUnitId }),
    };
}

function toolKind(toolId: string): ToolKind {
    if (toolId === "read_file") return "read";
    if (toolId === "write_file" || toolId === "edit_file") return "edit";
    if (toolId === "grep") return "search";
    if (toolId === "bash") return "execute";
    return "other";
}

function observationSummary(observation: { readonly kind: string; readonly summary?: string; readonly message?: string }): string {
    return observation.kind === "success"
        ? observation.summary ?? "Tool completed"
        : observation.message ?? "Tool failed";
}

function boundValue(value: JsonValue, maxBytes: number): JsonValue {
    const serialized = JSON.stringify(value);
    const bytes = Buffer.byteLength(serialized, "utf8");
    if (bytes <= maxBytes) return value;
    return {
        truncated: true,
        bytes,
        maxBytes,
        value: Buffer.from(serialized, "utf8").subarray(0, maxBytes).toString("utf8"),
    };
}

function boundedText(value: string, maxBytes: number): string {
    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes <= maxBytes) return value;
    return `${Buffer.from(value, "utf8").subarray(0, Math.max(0, maxBytes - 32)).toString("utf8")}… [truncated ${bytes} bytes]`;
}

function validateIdentity(value: string, field: string): void {
    if (typeof value !== "string" || value.trim() === "") {
        throw new SwebenchAcpProjectionError("protocol", "INVALID_IDENTITY", `${field} is invalid`);
    }
}

function validateUsage(usage: HeadlessModelUsage): HeadlessModelUsage {
    for (const [field, value] of Object.entries(usage)) {
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
            throw new SwebenchAcpProjectionError("protocol", "INVALID_USAGE", `${field} usage is invalid`);
        }
    }
    return usage;
}

function validatePersistence(locator: BenchmarkPersistenceLocator): BenchmarkPersistenceLocator {
    for (const [field, value] of Object.entries(locator)) {
        if (typeof value !== "string" || value.trim() === "") {
            throw new SwebenchAcpProjectionError("protocol", "INVALID_LOCATOR", `${field} locator is invalid`);
        }
    }
    return locator;
}

/** 仅用于保持 ACP Session 更新的公共类型可见性。 */
export type SwebenchAcpUpdate = AcpSessionUpdate;
