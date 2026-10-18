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

import type { LLMAdapter } from "../../llm-core/src/index";
import type {
    LLMContentBlock,
    LLMContentDelivery,
    LLMRequest,
    LLMResponse,
    LLMStreamEvent,
} from "../../llm-core/src/index";
import {
    createContentBlockStreamTracker,
    readNormalizedUsage,
    readToolCalls,
    type ContentBlockStreamTracker,
} from "../../llm-core/src/index";
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
    const observation: ModelStreamObservation = {};
    try {
        if (dependencies.adapter.stream === undefined) {
            publishModelStarted(dependencies, context, callId);
            requestStartedAt = performance.now();
            response = await dependencies.adapter.generate(providerRequest, control);
            const elapsedMs = performance.now() - requestStartedAt;
            if (Number.isFinite(elapsedMs) && elapsedMs > 0) requestDurationMs = elapsedMs;
            publishWholeResponseEvents(dependencies, context, callId, response);
        } else {
            requestStartedAt = performance.now();
            const streamed = await consumeModelStream(dependencies, providerRequest, context, control, callId, observation);
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
        const cancelled = isExecutionAbortedError(error) || control?.signal?.aborted === true;
        publishModelTerminated(dependencies, context, callId, cancelled, observation.tracker?.unfinishedIndexes() ?? []);
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

/** 一次流式调用的观察状态；失败或取消后仍可说明哪些块未完成。 */
interface ModelStreamObservation {
    tracker?: ContentBlockStreamTracker;
}

async function consumeModelStream(
    dependencies: ModelCallDependencies,
    request: LLMRequest,
    context: ModelCallContext,
    control: ExecutionControl | undefined,
    callId: string,
    observation: ModelStreamObservation,
): Promise<{ readonly response: LLMResponse; readonly decodeDurationMs?: number }> {
    if (dependencies.adapter.stream === undefined) {
        publishModelStarted(dependencies, context, callId);
        const response = await dependencies.adapter.generate(request, control);
        publishWholeResponseEvents(dependencies, context, callId, response);
        return { response };
    }

    const tracker = createContentBlockStreamTracker();
    observation.tracker = tracker;
    let firstTextDeltaAt: number | undefined;
    let decodeDurationMs: number | undefined;
    // 借用 Adapter 的迭代器：正常消费到底；异常、取消或提前退出时尝试释放本次拥有的迭代器并保留主失败原因。
    const iterator = dependencies.adapter.stream.call(dependencies.adapter, request, control)[Symbol.asyncIterator]();
    try {
        while (true) {
            const next = await iterator.next();
            if (next.done === true) break;
            const event = next.value;
            throwIfAborted(control);
            tracker.accept(event);
            if (event.kind === "content_block_delta" && event.deltaKind === "text"
                && event.delta.length > 0 && firstTextDeltaAt === undefined) {
                firstTextDeltaAt = performance.now();
            }
            publishModelStreamEvent(dependencies, context, callId, event);
            if (event.kind !== "completed" || firstTextDeltaAt === undefined) continue;
            const measuredDurationMs = performance.now() - firstTextDeltaAt;
            if (measuredDurationMs > 0) decodeDurationMs = measuredDurationMs;
        }
    } finally {
        await releaseIterator(iterator);
    }

    throwIfAborted(control);
    const response = tracker.result();
    return {
        response,
        ...(decodeDurationMs === undefined ? {} : { decodeDurationMs }),
    };
}

/** 尽力释放迭代器；清理异常不覆盖调用方的主失败原因。 */
async function releaseIterator(iterator: AsyncIterator<LLMStreamEvent>): Promise<void> {
    if (iterator.return === undefined) return;
    try {
        await iterator.return();
    } catch {
        // 观察通道的清理失败按既有规则隔离，调用结果或主错误保持不变。
    }
}

/** 失败或取消时发布安全终止摘要：只带调用身份、结果与未完成块索引，不携带任何块内容。 */
function publishModelTerminated(
    dependencies: ModelCallDependencies,
    context: ModelCallContext,
    callId: string,
    cancelled: boolean,
    unfinishedBlockIndexes: readonly number[],
): void {
    publishExecutionEvent(dependencies, context, {
        kind: cancelled ? "model_cancelled" : "model_failed",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { modelCallId: callId, unfinishedBlockIndexes: [...unfinishedBlockIndexes] },
    });
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

function publishModelStarted(
    dependencies: ModelCallDependencies,
    context: ModelCallContext,
    callId: string,
): void {
    publishExecutionEvent(dependencies, context, {
        kind: "model_started",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { modelCallId: callId },
    });
}

/** 无流式能力的 Adapter 在返回后按整块方式观察；不伪造增量。 */
function publishWholeResponseEvents(
    dependencies: ModelCallDependencies,
    context: ModelCallContext,
    callId: string,
    response: LLMResponse,
): void {
    for (const block of response.blocks) {
        publishExecutionEvent(dependencies, context, blockEventDraft(callId, "started", block, "whole"));
        publishExecutionEvent(dependencies, context, blockEventDraft(callId, "completed", block, "whole"));
    }
    publishExecutionEvent(dependencies, context, {
        kind: "model_completed",
        visibility: "public",
        durability: "live",
        delivery: "control",
        payload: { modelCallId: callId, hasToolCalls: readToolCalls(response).length > 0 },
    });
}

function publishModelStreamEvent(
    dependencies: ModelCallDependencies,
    context: ModelCallContext,
    callId: string,
    event: LLMStreamEvent,
): void {
    switch (event.kind) {
        case "started":
            publishModelStarted(dependencies, context, callId);
            return;
        case "content_block_started":
            publishExecutionEvent(dependencies, context, {
                kind: "model_block_started",
                visibility: blockVisibility(event.blockType, event.format),
                durability: "live",
                delivery: "control",
                payload: {
                    modelCallId: callId,
                    blockIndex: event.index,
                    blockType: event.blockType,
                    delivery: event.delivery,
                    ...(event.format === undefined ? {} : { format: event.format }),
                },
            });
            return;
        case "content_block_delta":
            publishExecutionEvent(dependencies, context, {
                kind: "model_block_delta",
                visibility: blockVisibility(event.deltaKind === "tool_arguments" ? "tool_call" : event.deltaKind),
                durability: "live",
                delivery: "delta",
                coalescingKey: `model-block:${callId}:${event.index}`,
                payload: {
                    modelCallId: callId,
                    blockIndex: event.index,
                    deltaKind: event.deltaKind,
                    delta: event.delta,
                },
            });
            return;
        case "content_block_completed":
            publishExecutionEvent(dependencies, context, blockEventDraft(
                callId,
                "completed",
                event.block,
                event.delivery,
            ));
            return;
        case "completed":
            publishExecutionEvent(dependencies, context, {
                kind: "model_completed",
                visibility: "public",
                durability: "live",
                delivery: "control",
                payload: { modelCallId: callId, hasToolCalls: readToolCalls(event.response).length > 0 },
            });
            return;
    }
}

function blockEventDraft(
    callId: string,
    phase: "started" | "completed",
    block: LLMContentBlock,
    delivery: LLMContentDelivery,
): Omit<ExecutionStreamEventDraft, "goalId" | "runId"> {
    const identity = {
        modelCallId: callId,
        blockIndex: block.index,
        blockType: block.type,
        delivery,
        ...(block.type === "text" ? { format: block.format } : {}),
    };
    if (phase === "started") {
        return {
            kind: "model_block_started",
            visibility: blockVisibility(block.type, block.type === "text" ? block.format : undefined),
            durability: "live",
            delivery: "control",
            payload: identity,
        };
    }
    return {
        kind: "model_block_completed",
        visibility: blockVisibility(block.type, block.type === "text" ? block.format : undefined),
        durability: "live",
        delivery: "control",
        // 整块交付没有增量，完整事件携带该块内容；增量块的内容已经发布，不重复发送。
        payload: delivery === "whole" ? { ...identity, ...blockContent(block) } : identity,
    };
}

function blockContent(block: LLMContentBlock): { readonly [key: string]: string } {
    switch (block.type) {
        case "text":
            return { text: block.text };
        case "reasoning":
            return { text: block.text };
        case "tool_call":
            return { callId: block.callId, toolId: block.toolId, argumentsJson: block.argumentsJson };
    }
}

function blockVisibility(
    blockType: LLMContentBlock["type"],
    format?: "plain" | "json",
): "public" | "diagnostic" | "restricted" {
    if (blockType === "reasoning") return "restricted";
    if (blockType === "tool_call") return "diagnostic";
    return format === "json" ? "diagnostic" : "public";
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
