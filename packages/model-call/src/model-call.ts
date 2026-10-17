/**
 * 单次模型调用的执行与观察。
 *
 * @remarks
 * 本模块只拥有一次 Adapter 调用的生命周期：应用输出上限、保存最终输入、记录
 * 调用开始/结束、调用 `generate` 或消费 `stream`、发布既有可见性事件，并返回
 * 最终响应与调用身份。它不选择模型、不持有可变 Binding、不实现请求重试、不
 * 解码业务结果，也不关闭借用资源。
 */

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse, LLMStreamEvent } from "../../llm/src/core/types";
import { readNormalizedUsage } from "../../llm/src/core/usage";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import type { ModelInputStore, ModelInputRecord } from "../../runtime/src/model-input";
import type {
    DiagnosticTraceSink,
    ModelCallMetricsRecorder,
} from "../../runtime/src/index";
import type { ExecutionStreamEventDraft, ExecutionStreamPublisher } from "../../execution-stream/src/index";
import { LLMResponseProtocolError } from "../../model-response/src/index";
import { recordLlmError, recordLlmRequest, recordLlmResponse } from "./llm-diagnostic-trace";

/**
 * 一次调用的收窄上下文。
 *
 * @remarks
 * 只包含调用记录所需的 Goal/Run 身份、Step 序号、模型身份、真实会话消息与
 * 阶段产物；不包含 Goal、Snapshot 或可变 Binding。
 *
 * @example
 * ```ts
 * const context: ModelCallContext = {
 *     goalId: "goal-1", runId: "run-1", stepIndex: 1, modelId: "gpt-4o",
 *     conversationMessages: [], sections: [],
 * };
 * ```
 */
export interface ModelCallContext {
    /** 当前 Goal 的稳定标识。 */
    readonly goalId: string;
    /** 当前 Run 的稳定标识。 */
    readonly runId: string;
    /** 本次调用对应的 Step 序号（从 1 开始）。 */
    readonly stepIndex: number;
    /** 当前绑定选择的模型标识，仅用于指标事实。 */
    readonly modelId: string;
    /** 真实 Conversation 消息；按角色与正文归类请求来源。 */
    readonly conversationMessages: readonly { readonly role: string; readonly content: string }[];
    /** 可选的执行单元标识；省略时按 Run 级归并。 */
    readonly executionUnitId?: string;
    /** 本次请求实际发送的动态 Section 正文，用于来源归类。 */
    readonly sections: readonly string[];
    /** 本 Step 已提交的阶段输出正文（如 Think 文本），用于来源归类。 */
    readonly stageOutputs?: readonly string[];
}

/**
 * 一次调用的注入依赖。
 *
 * @example
 * ```ts
 * const dependencies: ModelCallDependencies = { adapter };
 * ```
 */
export interface ModelCallDependencies {
    /** 执行本次调用的供应商适配器；由调用方借用。 */
    readonly adapter: LLMAdapter;
    /** 可选的独立诊断通道；写入失败不会改变调用结果。 */
    readonly traceSink?: DiagnosticTraceSink;
    /** 完整模型输入查看日志；配置后写入失败阻止此次 Adapter 调用。 */
    readonly modelInputStore?: ModelInputStore;
    /** 可选的独立指标事实 Store；写入失败不会改变调用结果。 */
    readonly metricsRecorder?: ModelCallMetricsRecorder;
    /** 可选的执行流发布通道；发布失败不会改变调用结果。 */
    readonly executionStream?: ExecutionStreamPublisher;
}

/**
 * 单次调用的输入。
 *
 * @example
 * ```ts
 * const input: ModelCallInput = { context, request, stage: "decide" };
 * ```
 */
export interface ModelCallInput {
    /** 收窄后的调用上下文。 */
    readonly context: ModelCallContext;
    /** 已准备完成的最终请求。 */
    readonly request: LLMRequest;
    /** 调用所属阶段，用于输入记录与指标。 */
    readonly stage: ModelInputRecord["stage"];
    /** 可选的供应商输出上限；省略时不透传。 */
    readonly maxOutputTokens?: number;
    /** 可选的调用级取消控制。 */
    readonly control?: ExecutionControl;
}

/**
 * 完成一次模型调用、输入记录与流收集。
 *
 * @param dependencies - 适配器与可选的记录/发布通道。
 * @param input - 收窄上下文、请求、阶段与控制。
 * @returns 最终响应、墙钟起始时间与调用标识。
 * @throws ExecutionAbortedError 取消时抛出；流缺少或重复 completed 时抛协议错误；
 * 输入写入失败阻止 Adapter 调用；诊断与指标失败被隔离。
 * @example
 * ```ts
 * const { response, callId } = await callModel({ adapter }, { context, request, stage: "decide" });
 * ```
 */
export async function callModel(
    dependencies: ModelCallDependencies,
    input: ModelCallInput,
): Promise<{ readonly response: LLMResponse; readonly startedAt: number; readonly callId: string }> {
    const { context, control } = input;
    throwIfAborted(control);
    const startedAt = Date.now();
    const callId = randomUUID();
    const metricIdentity = {
        goalId: context.goalId,
        runId: context.runId,
        ...(context.executionUnitId === undefined ? {} : { executionUnitId: context.executionUnitId }),
        callId,
    };
    const providerRequest = {
        ...input.request,
        sessionId: context.goalId,
        ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
    };
    await dependencies.modelInputStore?.append({
        ...metricIdentity, stepIndex: context.stepIndex, stage: input.stage,
        occurredAt: new Date().toISOString(),
        messages: providerRequest.messages.map((message, index) => ({
            ...message,
            source: message.role === "tool" || message.role === "assistant" && message.continuation !== undefined ? "native_history" as const
                : message.role === "system" ? "system" as const
                : message.content.startsWith('{"source":"runtime_feedback",') ? "request" as const
                : index === providerRequest.messages.length - 1 - (providerRequest.messages.at(-1)?.content.startsWith('{"source":"runtime_feedback",') ? 1 : 0) ? "working_context" as const
                : context.conversationMessages.some(saved => saved.role === message.role && saved.content === message.content) ? "conversation" as const
                : context.sections.includes(message.content) ? "section" as const
                : context.stageOutputs?.includes(message.content) ? "stage" as const
                : "request" as const,
        })),
    });
    throwIfAborted(control);
    await recordLlmRequest(
        dependencies.traceSink,
        context,
        providerRequest,
        dependencies.modelInputStore === undefined ? undefined : callId,
        callId,
    );
    await appendModelMetric(dependencies.metricsRecorder, {
        recordType: "call_started",
        ...metricIdentity,
        modelId: context.modelId,
        occurredAt: new Date().toISOString(),
    });
    let response: LLMResponse;
    let decodeDurationMs: number | undefined;
    let requestStartedAt: number | undefined;
    let requestDurationMs: number | undefined;
    try {
        if (dependencies.adapter.stream === undefined) {
            requestStartedAt = performance.now();
            response = await dependencies.adapter.generate(providerRequest, control);
            const elapsedMs = performance.now() - requestStartedAt;
            if (Number.isFinite(elapsedMs) && elapsedMs > 0) requestDurationMs = elapsedMs;
            publishFallbackModelEvents(dependencies, context, response);
        } else {
            requestStartedAt = performance.now();
            const streamed = await consumeModelStream(dependencies, providerRequest, context, control);
            response = streamed.response;
            decodeDurationMs = streamed.decodeDurationMs;
            const elapsedMs = performance.now() - requestStartedAt;
            if (Number.isFinite(elapsedMs) && elapsedMs > 0) requestDurationMs = elapsedMs;
        }
        throwIfAborted(control);
    } catch (error) {
        if (requestDurationMs === undefined && requestStartedAt !== undefined) {
            const elapsedMs = performance.now() - requestStartedAt;
            if (Number.isFinite(elapsedMs) && elapsedMs > 0) requestDurationMs = elapsedMs;
        }
        await appendModelMetric(dependencies.metricsRecorder, {
            recordType: "call_finished",
            ...metricIdentity,
            occurredAt: new Date().toISOString(),
            outcome: isExecutionAbortedError(error) || control?.signal?.aborted ? "cancelled" : "failed",
            usage: { source: "unavailable" },
            ...(requestDurationMs === undefined ? {} : { requestDurationMs }),
        });
        await recordLlmError(dependencies.traceSink, context, error, Date.now() - startedAt, "adapter", callId);
        if (isExecutionAbortedError(error)) throw error;
        if (control?.signal?.aborted) throw new ExecutionAbortedError();
        throw error;
    }
    const usage = readNormalizedUsage(response.providerMetadata);
    await appendModelMetric(dependencies.metricsRecorder, {
        recordType: "call_finished",
        ...metricIdentity,
        occurredAt: new Date().toISOString(),
        outcome: "completed",
        usage: usage === undefined ? { source: "unavailable" } : { source: "provider_reported", ...usage },
        ...(requestDurationMs === undefined ? {} : { requestDurationMs }),
        ...(decodeDurationMs === undefined ? {} : { decodeDurationMs }),
    });
    await recordLlmResponse(dependencies.traceSink, context, response, Date.now() - startedAt, callId);
    return { response, startedAt, callId };
}

async function consumeModelStream(
    dependencies: ModelCallDependencies,
    request: LLMRequest,
    context: ModelCallContext,
    control: ExecutionControl | undefined,
): Promise<{ readonly response: LLMResponse; readonly decodeDurationMs?: number }> {
    if (dependencies.adapter.stream === undefined) {
        const response = await dependencies.adapter.generate(request, control);
        publishFallbackModelEvents(dependencies, context, response);
        return { response };
    }

    let response: LLMResponse | undefined;
    let firstTextDeltaAt: number | undefined;
    let decodeDurationMs: number | undefined;
    for await (const event of dependencies.adapter.stream.call(dependencies.adapter, request, control)) {
        throwIfAborted(control);
        if (event.kind === "assistant_text_delta" && event.text.length > 0 && firstTextDeltaAt === undefined) {
            firstTextDeltaAt = performance.now();
        }
        publishModelStreamEvent(dependencies, context, event);
        if (event.kind !== "completed") continue;
        if (response !== undefined) {
            throw new LLMResponseProtocolError("LLM stream produced multiple completed responses");
        }
        response = event.response;
        if (firstTextDeltaAt !== undefined) {
            const measuredDurationMs = performance.now() - firstTextDeltaAt;
            if (measuredDurationMs > 0) decodeDurationMs = measuredDurationMs;
        }
    }

    if (response === undefined) {
        throw new LLMResponseProtocolError("LLM stream ended without a completed response");
    }
    return {
        response,
        ...(decodeDurationMs === undefined ? {} : { decodeDurationMs }),
    };
}

async function appendModelMetric(
    recorder: ModelCallMetricsRecorder | undefined,
    record: Parameters<ModelCallMetricsRecorder["record"]>[0],
): Promise<void> {
    if (recorder === undefined) return;
    try {
        await recorder.record(record);
    } catch {
        // 指标是独立观察通道；写入故障不得改变 Agent 决策语义。
    }
}

function publishFallbackModelEvents(
    dependencies: ModelCallDependencies,
    context: ModelCallContext,
    response: LLMResponse,
): void {
    publishExecutionEvent(dependencies, context, {
        kind: "model_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: {},
    });
    if (response.content.length > 0) {
        publishExecutionEvent(dependencies, context, {
            kind: "assistant_text_delta",
            visibility: "public",
            durability: "live",
            delivery: "delta",
            coalescingKey: `assistant:${context.executionUnitId ?? "run"}`,
            payload: { text: response.content },
        });
    }
    if (response.reasoning !== undefined && response.reasoning.length > 0) {
        publishExecutionEvent(dependencies, context, {
            kind: "reasoning_delta", visibility: "restricted", durability: "live", delivery: "delta",
            coalescingKey: `reasoning:${context.executionUnitId ?? "run"}`, payload: { text: response.reasoning },
        });
    }
    publishExecutionEvent(dependencies, context, {
        kind: "model_completed",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { hasToolCalls: (response.toolCalls?.length ?? 0) > 0 },
    });
}

function publishModelStreamEvent(
    dependencies: ModelCallDependencies,
    context: ModelCallContext,
    event: LLMStreamEvent,
): void {
    switch (event.kind) {
        case "started":
            publishExecutionEvent(dependencies, context, {
                kind: "model_started",
                visibility: "public",
                durability: "live",
                delivery: "control",
                payload: {},
            });
            return;
        case "assistant_text_delta":
            publishExecutionEvent(dependencies, context, {
                kind: event.kind,
                visibility: "public",
                durability: "live",
                delivery: "delta",
                coalescingKey: `assistant:${context.executionUnitId ?? "run"}`,
                payload: { text: event.text },
            });
            return;
        case "reasoning_delta":
            publishExecutionEvent(dependencies, context, {
                kind: event.kind,
                visibility: "restricted",
                durability: "live",
                delivery: "delta",
                coalescingKey: `reasoning:${context.executionUnitId ?? "run"}`,
                payload: { text: event.text },
            });
            return;
        case "model_tool_call_delta":
            publishExecutionEvent(dependencies, context, {
                kind: event.kind,
                visibility: "diagnostic",
                durability: "live",
                delivery: "delta",
                coalescingKey: `model-tool-call:${context.executionUnitId ?? "run"}`,
                payload: {
                    delta: event.delta,
                    ...(event.contentIndex === undefined ? {} : { contentIndex: event.contentIndex }),
                },
            });
            return;
        case "completed":
            publishExecutionEvent(dependencies, context, {
                kind: "model_completed",
                visibility: "public",
                durability: "live",
                delivery: "control",
                payload: { hasToolCalls: (event.response.toolCalls?.length ?? 0) > 0 },
            });
            return;
    }
}

function publishExecutionEvent(
    dependencies: ModelCallDependencies,
    context: ModelCallContext,
    event: Omit<ExecutionStreamEventDraft, "goalId" | "runId">,
): void {
    const publisher = dependencies.executionStream;
    if (publisher === undefined) return;
    try {
        publisher.publish({
            goalId: context.goalId,
            runId: context.runId,
            ...(context.executionUnitId === undefined ? {} : { executionUnitId: context.executionUnitId }),
            ...event,
        });
    } catch {
        // 流是观察通道；发布故障不得改变 Agent 决策语义。
    }
}
