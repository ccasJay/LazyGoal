import type {
    DiagnosticTraceSink,
    Goal,
    JsonValue,
    TraceRecord,
} from "../../runtime/src/index";
import {
    allocateDiagnosticTraceRecord,
} from "../../runtime/src/index";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";

const MAX_TRACE_PAYLOAD_CHARS = 24_000;
const MAX_TRACE_STRING_CHARS = 12_000;
const MAX_TRACE_DEPTH = 6;
const MAX_TRACE_ITEMS = 100;
const REDACTED = "[REDACTED]";
const TRUNCATED = "[TRUNCATED]";
const SENSITIVE_KEY_PATTERN = /api[-_]?key|authorization|cookie|password|secret|token/i;

/** Agent LLM 诊断事件的稳定内部类型。 */
type LlmTraceKind =
    | "model_request"
    | "model_response"
    | "model_error"
    | "model_context_soft_overflow";

/**
 * 将 LLM 诊断写入独立 Trace 通道；Trace 不可用时静默隔离失败。
 *
 * @param sink - 可选的诊断 Sink。
 * @param goal - 当前 Goal，用于建立 Trace 归属。
 * @param kind - 请求、响应或异常类型。
 * @param payload - 尚未写入的诊断字段。
 * @returns Trace 写入完成；Sink 缺失或失败时同样 resolve。
 * @remarks
 * 该函数只接受经过递归脱敏和总大小限制的 JSON payload。它不读取或修改
 * Runtime State，也不把诊断内容转换为 Domain Event。
 */
export async function recordLlmDiagnosticTrace(input: {
    readonly sink: DiagnosticTraceSink | undefined;
    readonly goal: Goal;
    readonly kind: LlmTraceKind;
    readonly payload: unknown;
}): Promise<void> {
    if (input.sink === undefined) return;

    const record = allocateDiagnosticTraceRecord({
        goalId: input.goal.id,
        runId: input.goal.state.run.id,
        kind: input.kind,
        payload: boundJsonValue(input.payload),
    });

    try {
        await input.sink.append(record);
    } catch {
        // Diagnostic Trace is deliberately best effort and must not change Runtime semantics.
    }
}


/** 记录一次已发送的模型请求。 */
export function recordLlmRequest(
    sink: DiagnosticTraceSink | undefined,
    goal: Goal,
    request: LLMRequest,
): Promise<void> {
    return recordLlmDiagnosticTrace({
        sink,
        goal,
        kind: "model_request",
        payload: { messages: request.messages },
    });
}

/** 记录一次模型响应及供应商扩展 metadata。 */
export function recordLlmResponse(
    sink: DiagnosticTraceSink | undefined,
    goal: Goal,
    response: LLMResponse,
    durationMs: number,
): Promise<void> {
    const providerMetadata = readProviderMetadata(response);

    return recordLlmDiagnosticTrace({
        sink,
        goal,
        kind: "model_response",
        payload: {
            content: response.content,
            ...(providerMetadata === undefined ? {} : { providerMetadata }),
            durationMs,
        },
    });
}

/** 记录适配器或响应解析异常。 */
export function recordLlmError(
    sink: DiagnosticTraceSink | undefined,
    goal: Goal,
    error: unknown,
    durationMs: number,
    stage: "adapter" | "response_parse",
): Promise<void> {
    const details = error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            ...(error.stack === undefined ? {} : { stack: error.stack }),
        }
        : { message: String(error) };

    return recordLlmDiagnosticTrace({
        sink,
        goal,
        kind: "model_error",
        payload: { stage, durationMs, error: details },
    });
}

/**
 * 记录固定模型输入超过历史预算的软超限诊断。
 *
 * @param input - Goal/Run 身份和已脱敏的预算报告字段。
 * @returns Trace 写入完成或被隔离后 resolve。
 * @remarks
 * 软超限不会阻止主模型调用；该记录只说明 Hot/Warm 被置空，不能作为 Goal
 * 状态或 Snapshot 恢复依据。
 */
export function recordModelContextSoftOverflowDiagnosticTrace(input: {
    readonly sink: DiagnosticTraceSink | undefined;
    readonly goalId: string;
    readonly runId: string;
    readonly payload: unknown;
}): Promise<void> {
    if (input.sink === undefined) return Promise.resolve();

    const record = allocateDiagnosticTraceRecord({
        goalId: input.goalId,
        runId: input.runId,
        kind: "model_context_soft_overflow",
        payload: boundJsonValue(input.payload),
    });

    return input.sink.append(record).catch(() => undefined);
}

function readProviderMetadata(response: unknown): unknown {
    if (!isRecord(response)) return undefined;

    if (response.providerMetadata !== undefined) {
        return response.providerMetadata;
    }

    const metadata = Object.fromEntries(
        Object.entries(response).filter(([key]) => key !== "content"),
    );

    return Object.keys(metadata).length === 0 ? undefined : metadata;
}

function boundJsonValue(value: unknown): JsonValue {
    const sanitized = sanitizeValue(value, 0);
    const serialized = JSON.stringify(sanitized);

    if (serialized.length <= MAX_TRACE_PAYLOAD_CHARS) {
        return sanitized;
    }

    return {
        truncated: true,
        preview: serialized.slice(0, MAX_TRACE_PAYLOAD_CHARS),
    };
}

function sanitizeValue(value: unknown, depth: number, key?: string): JsonValue {
    // 数字值不可能是凭据;敏感键仅对非数字脱敏,避免误伤 token 计数字段
    // (如 usage.inputTokens)。
    if (
        key !== undefined
        && SENSITIVE_KEY_PATTERN.test(key)
        && typeof value !== "number"
    ) {
        return REDACTED;
    }

    if (depth >= MAX_TRACE_DEPTH) return TRUNCATED;
    if (value === null) return null;
    if (typeof value === "string") {
        return value.length > MAX_TRACE_STRING_CHARS
            ? `${value.slice(0, MAX_TRACE_STRING_CHARS)}${TRUNCATED}`
            : value;
    }
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : String(value);

    if (Array.isArray(value)) {
        return value
            .slice(0, MAX_TRACE_ITEMS)
            .map((item) => sanitizeValue(item, depth + 1));
    }

    if (isRecord(value)) {
        const entries = Object.entries(value).slice(0, MAX_TRACE_ITEMS);
        return Object.fromEntries(
            entries.map(([entryKey, entryValue]) => [
                entryKey,
                sanitizeValue(entryValue, depth + 1, entryKey),
            ]),
        );
    }

    return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type { TraceRecord };
