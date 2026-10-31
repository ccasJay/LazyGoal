import { isRecord } from "../../contracts/src/index";
import type {
    DiagnosticTraceSink,
    JsonValue,
    TraceRecord,
} from "../../runtime/src/index";
import {
    allocateDiagnosticTraceRecord,
} from "../../runtime/src/index";
import type { LLMRequest, LLMResponse } from "../../llm-core/src/index";
import { LLMResponseProtocolError } from "../../model-response/src/index";
import { TransientModelRequestFailure } from "../../execution-control/src/index";

const MAX_TRACE_PAYLOAD_CHARS = 24_000;
const MAX_TRACE_STRING_CHARS = 12_000;
const MAX_TRACE_DEPTH = 64;
const MAX_TRACE_ITEMS = 100;
const REDACTED = "[REDACTED]";
const TRUNCATED = "[TRUNCATED]";
const SENSITIVE_KEY_PATTERN = /api[-_]?key|authorization|cookie|password|secret|token/i;

/**
 * 诊断 Trace 的 Goal/Run 归属身份。
 *
 * @remarks
 * 记录只依赖稳定标识，不读取 Goal 状态或 Snapshot。
 *
 * @example
 * ```ts
 * const identity: LlmTraceIdentity = { goalId: "goal-1", runId: "run-1" };
 * ```
 */
export interface LlmTraceIdentity {
    /** 当前 Goal 的稳定标识。 */
    readonly goalId: string;
    /** 当前 Run 的稳定标识。 */
    readonly runId: string;
}

/** Agent LLM 诊断事件的稳定内部类型。 */
type LlmTraceKind =
    | "model_tool_schema"
    | "model_request"
    | "model_response"
    | "model_output_diagnostic"
    | "model_error"
    | "model_context_soft_overflow";

/**
 * 将 LLM 诊断写入独立 Trace 通道；Trace 不可用时静默隔离失败。
 *
 * @param sink - 可选的诊断 Sink。
 * @param identity - 建立 Trace 归属的 Goal/Run 标识。
 * @param kind - 请求、响应或异常类型。
 * @param payload - 尚未写入的诊断字段。
 * @returns Trace 写入完成；Sink 缺失或失败时同样 resolve。
 * @remarks
 * 该函数只接受经过递归脱敏和总大小限制的 JSON payload。它不读取或修改
 * Runtime State，也不把诊断内容转换为 Domain Event。
 */
export async function recordLlmDiagnosticTrace(input: {
    readonly sink: DiagnosticTraceSink | undefined;
    readonly identity: LlmTraceIdentity;
    readonly kind: LlmTraceKind;
    readonly payload: unknown;
}): Promise<void> {
    if (input.sink === undefined) return;

    const record = allocateDiagnosticTraceRecord({
        goalId: input.identity.goalId,
        runId: input.identity.runId,
        kind: input.kind,
        payload: boundJsonValue(input.payload),
    });

    try {
        await input.sink.append(record);
    } catch {
        // Diagnostic Trace is deliberately best effort and must not change Runtime semantics.
    }
}


/**
 * 记录一次模型请求准备；已有完整输入日志时只保存引用，避免重复 system 正文。
 * @param callId - 关联请求、适配器响应及校验错误的调用身份；schema 为发送给 Adapter 的有界脱敏副本。
 * @param modelInputCallId - 已落盘的完整输入身份；未配置输入 Store 时保留有界诊断预览。
 */
export async function recordLlmRequest(
    sink: DiagnosticTraceSink | undefined,
    identity: LlmTraceIdentity,
    request: LLMRequest,
    modelInputCallId?: string,
    callId?: string,
): Promise<void> {
    await recordLlmDiagnosticTrace({
        sink,
        identity,
        kind: "model_request",
        payload: {
            ...(callId === undefined ? {} : { callId }),
            ...(modelInputCallId === undefined ? { messages: request.messages } : { modelInputCallId }),
            ...(request.tools === undefined ? {} : { toolIds: request.tools.map(tool => tool.id) }),
            ...(request.structuredOutput === undefined ? {} : { structuredOutput: request.structuredOutput }),
            ...(request.toolChoice === undefined ? {} : { toolChoice: request.toolChoice }),
        },
    });
    for (const tool of request.tools ?? []) {
        await recordLlmDiagnosticTrace({ sink, identity, kind: "model_tool_schema",
            payload: { ...(callId === undefined ? {} : { callId }), toolId: tool.id, parametersSchema: tool.parametersSchema } });
    }
}

/** 记录 Adapter 返回的有界完整块、原始工具参数和 metadata；callId 与请求及校验错误关联。 */
export function recordLlmResponse(
    sink: DiagnosticTraceSink | undefined,
    identity: LlmTraceIdentity,
    response: LLMResponse,
    durationMs: number,
    callId?: string,
): Promise<void> {
    const providerMetadata = readProviderMetadata(response);

    return recordLlmDiagnosticTrace({
        sink,
        identity,
        kind: "model_response",
        payload: {
            ...(callId === undefined ? {} : { callId }),
            // reasoning 属于受限内容，不进入诊断记录；其余完整块保留原始参数与格式。
            blocks: response.blocks.filter(block => block.type !== "reasoning"),
            ...(providerMetadata === undefined ? {} : { providerMetadata }),
            durationMs,
        },
    });
}

/** 记录适配器或响应解析异常及结构化校验问题；callId 关联原始响应，不改变错误传播。 */
export function recordLlmError(
    sink: DiagnosticTraceSink | undefined,
    identity: LlmTraceIdentity,
    error: unknown,
    durationMs: number,
    stage: "adapter" | "response_parse",
    callId?: string,
): Promise<void> {
    const details = error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            ...(error instanceof LLMResponseProtocolError ? { code: error.code, ...(error.issues === undefined ? {} : { issues: error.issues }) } : {}),
            ...(error instanceof TransientModelRequestFailure
                ? {
                    retryable: true,
                    failureReason: error.reason,
                    ...(error.status === undefined ? {} : { status: error.status }),
                    ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }),
                }
                : {}),
            ...(error.stack === undefined ? {} : { stack: error.stack }),
        }
        : { message: String(error) };

    return recordLlmDiagnosticTrace({
        sink,
        identity,
        kind: "model_error",
        payload: { ...(callId === undefined ? {} : { callId }), stage, durationMs, error: details },
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
        Object.entries(response).filter(([key]) => !["blocks", "continuation"].includes(key)),
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
        ...(isRecord(value) && typeof value.callId === "string" ? { callId: value.callId } : {}),
        ...(isRecord(value) && typeof value.modelInputCallId === "string" ? { modelInputCallId: value.modelInputCallId } : {}),
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

export type { TraceRecord };
