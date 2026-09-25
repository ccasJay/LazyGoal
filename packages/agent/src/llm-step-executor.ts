import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMStreamEvent } from "../../llm/src/core/types";
import { readNormalizedUsage } from "../../llm/src/core/usage";
import type {
    AgentDecision,
} from "../../runtime/src/domain";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
} from "../../runtime/src/execution-control";
import type {
    StepExecutionInput,
    StepExecutionResult,
    StepExecutor,
} from "../../runtime/src/step-executor";
import type { ContextCompactor } from "./context-compactor";
import type { ModelConversationMessage } from "./model-inference-view";
import { buildStepRequest } from "./prompt";
import {
    parseModelOutput,
} from "./model-output";
import { LLMResponseProtocolError } from "./errors";
import type { PromptBundleRenderer } from "./prompting/types";
import type { TrajectoryModelContextAssembler } from "./trajectory-model-context-assembler";
import type {
    DiagnosticTraceSink,
    ModelCallMetricsRecorder,
} from "../../runtime/src/index";
import { createDefaultModelContextBudgetPolicy, type ModelCapabilities } from "./model-context-budget";
import {
    MutableModelBinding,
    type ModelExecutionBinding,
    type ModelExecutionBindingProvider,
} from "./model-execution-binding";
import {
    recordLlmError,
    recordLlmRequest,
    recordLlmResponse,
} from "./llm-diagnostic-trace";
import {
    decodePhaseToolCall,
    type SystemToolDeclaration,
} from "../../contracts/src/index";
import { ContractValidationError } from "../../contracts/src/errors";
import type { LLMResponse, LLMToolDefinition } from "../../llm/src/core/types";
import type { ExecutionStreamEventDraft, ExecutionStreamPublisher } from "../../execution-stream/src/index";

/**
 * 创建 {@link LLMStepExecutor} 所需的供应商无关依赖。
 *
 * @example
 * ```ts
 * const dependencies: LLMStepExecutorDependencies = {
 *     adapter,
 *     renderer,
 *     contextCompactor,
 * };
 * ```
 */
export interface LLMStepExecutorDependencies {
    readonly adapter?: LLMAdapter;
    /** 由 Composition Root 创建、供统一执行流使用的 Prompt Bundle Renderer。 */
    readonly renderer: PromptBundleRenderer;
    /** 由 Composition Root 创建、供模型请求共享的 Conversation 裁剪策略。 */
    readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    /** 可选的独立诊断通道；写入失败不会改变执行结果。 */
    readonly traceSink?: DiagnosticTraceSink;
    /** 可选的独立指标事实 Store；写入失败不会改变执行结果。 */
    readonly metricsRecorder?: ModelCallMetricsRecorder;
    /** 当前 trajectory-layered@1 调用级上下文组装器。 */
    readonly trajectoryContextAssembler?: TrajectoryModelContextAssembler;
    /** 模型能力；配置后会向 Provider 透传 maxOutputTokens。 */
    readonly modelCapabilities?: ModelCapabilities;
    /** 可替换的模型执行绑定提供者；每次 execute 开始时读取当前绑定。 */
    readonly bindingProvider?: ModelExecutionBindingProvider;
}

/**
 * 使用 LLMAdapter 生成一个 AgentDecision 的执行器。
 *
 * @remarks
 * 执行器从冻结 Profile、历史消息、授权 ToolDefinition 与当前 Run 构造请求，
 * 只调用 Adapter 一次，再以严格 AgentDecision 协议解析原始响应。Working
 * Context 和模型协议 JSON 都不是面向用户的真实消息；状态推进与 Tool 执行由
 * Runtime Runner 负责。执行器不会修改传入 Goal。
 *
 * 当 Adapter 配置为 `two_stage` 结构化输出模式时，自动启用两阶段流水线并返回带有思考链的 {@link StepExecutionResult}。
 *
 * ToolDefinition 由 Runtime 在调用时传入；执行器不根据 Profile 自行解析 Tool，
 * 也不把未授权 Tool 暴露给模型。
 */
export class LLMStepExecutor implements StepExecutor {
    private readonly bindingProvider: ModelExecutionBindingProvider;
    private readonly renderer: PromptBundleRenderer;
    private readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly metricsRecorder: ModelCallMetricsRecorder | undefined;
    private readonly trajectoryContextAssembler: TrajectoryModelContextAssembler | undefined;
    private readonly modelCapabilities: ModelCapabilities | undefined;

    /** @param dependencies - LLM Adapter、共享 Renderer 与共享裁剪策略。 */
    constructor(dependencies: LLMStepExecutorDependencies) {
        this.renderer = dependencies.renderer;
        this.contextCompactor = dependencies.contextCompactor;
        this.traceSink = dependencies.traceSink;
        this.metricsRecorder = dependencies.metricsRecorder;
        this.trajectoryContextAssembler = dependencies.trajectoryContextAssembler;
        this.modelCapabilities = dependencies.modelCapabilities;
        if (dependencies.bindingProvider !== undefined) {
            this.bindingProvider = dependencies.bindingProvider;
        } else if (dependencies.adapter !== undefined) {
            const fallbackBinding: ModelExecutionBinding = {
                generation: 1,
                selection: {
                    provider: "unknown",
                    modelId: "unknown",
                    structuredOutputMode: dependencies.adapter.structuredOutputMode === "strict" ? "strict" : "prompt_only",
                    inputEstimator: { kind: "character-v1" },
                },
                adapter: dependencies.adapter,
                modelCapabilities: dependencies.modelCapabilities,
                modelContextPolicy: createDefaultModelContextBudgetPolicy(),
                trajectoryContextAssembler: dependencies.trajectoryContextAssembler as TrajectoryModelContextAssembler,
            };
            this.bindingProvider = new MutableModelBinding(fallbackBinding);
        } else {
            throw new Error("Either bindingProvider or adapter must be provided to LLMStepExecutor");
        }
    }

    /**
     * @param input - 执行入参，包含目标快照、已授权工具、工作记忆与中止控制。
     * @returns 严格解析后的 AgentDecision 或两阶段生成的 StepExecutionResult。
     * @throws LLMResponseProtocolError 模型响应不符合严格协议时抛出。
     * @throws 执行信号中止时抛出 `ExecutionAbortedError`。
     * @throws Adapter 抛出的供应商或传输异常会原样传播。
     */
    async execute(input: StepExecutionInput): Promise<AgentDecision | StepExecutionResult> {
        const { goal, authorizedTools: tools, control } = input;
        const binding = this.bindingProvider.current();
        const adapter = binding.adapter;
        const modelCapabilities = binding.modelCapabilities;
        const trajectoryContextAssembler = binding.trajectoryContextAssembler;

        const mode = adapter.structuredOutputMode;
        const plan = await buildStepRequest(
            goal,
            tools,
            this.renderer,
            this.contextCompactor,
            control?.signal,
            input.workingMemory,
            trajectoryContextAssembler,
            input.contextLookupResult,
            modelCapabilities,
            mode,
        );
        throwIfAborted(control);

        const startedAt = Date.now();
        const callId = randomUUID();
        const metricIdentity = {
            goalId: goal.id,
            runId: goal.state.run.id,
            ...(input.executionUnitId === undefined ? {} : { executionUnitId: input.executionUnitId }),
            callId,
        };
        const providerRequest = modelCapabilities === undefined
            ? plan.request
            : { ...plan.request, maxOutputTokens: modelCapabilities.maxOutputTokens };
        await recordLlmRequest(this.traceSink, goal, providerRequest);
        await this.appendModelMetric({
            recordType: "call_started",
            ...metricIdentity,
            occurredAt: new Date().toISOString(),
        });
        let response: Awaited<ReturnType<LLMAdapter["generate"]>>;
        let decodeDurationMs: number | undefined;

        try {
            if (adapter.stream === undefined) {
                response = await adapter.generate(providerRequest, control);
                this.publishFallbackModelEvents(input, response);
            } else {
                const streamed = await this.consumeModelStream(
                    adapter,
                    providerRequest,
                    input,
                    control,
                );
                response = streamed.response;
                decodeDurationMs = streamed.decodeDurationMs;
            }
            throwIfAborted(control);
        } catch (error) {
            await this.appendModelMetric({
                recordType: "call_finished",
                ...metricIdentity,
                occurredAt: new Date().toISOString(),
                outcome: isExecutionAbortedError(error) || control?.signal?.aborted
                    ? "cancelled"
                    : "failed",
                usage: { source: "unavailable" },
            });
            await recordLlmError(
                this.traceSink,
                goal,
                error,
                Date.now() - startedAt,
                "adapter",
            );
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            throw error;
        }
        const usage = readNormalizedUsage(response.providerMetadata);
        await this.appendModelMetric({
            recordType: "call_finished",
            ...metricIdentity,
            occurredAt: new Date().toISOString(),
            outcome: "completed",
            usage: usage === undefined
                ? { source: "unavailable" }
                : { source: "provider_reported", ...usage },
            ...(decodeDurationMs === undefined ? {} : { decodeDurationMs }),
        });
        await recordLlmResponse(
            this.traceSink,
            goal,
            response,
            Date.now() - startedAt,
        );

        let decision: AgentDecision;

        if (response.toolCalls && response.toolCalls.length > 0) {
            const toolCall = response.toolCalls[0]!;
            let rawArgs: unknown;
            try {
                rawArgs = JSON.parse(toolCall.argumentsJson);
            } catch (err) {
                const parseErr = new LLMResponseProtocolError(
                    `Failed to parse arguments JSON for tool call "${toolCall.toolId}": ${(err as Error).message}`,
                    { cause: err },
                );
                await recordLlmError(this.traceSink, goal, parseErr, Date.now() - startedAt, "response_parse");
                throw parseErr;
            }

            try {
                decision = decodePhaseToolCall(plan.toolDeclarations as readonly SystemToolDeclaration<unknown>[], toolCall.toolId, rawArgs) as AgentDecision;
            } catch (error) {
                const validationErr = error instanceof ContractValidationError
                    ? new LLMResponseProtocolError(
                        `Tool call "${toolCall.toolId}" validation failed: ${error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
                        {
                            issues: error.issues.map(i => ({ code: i.code, path: i.path, message: i.message })),
                            cause: error,
                        },
                    )
                    : error;
                await recordLlmError(this.traceSink, goal, validationErr, Date.now() - startedAt, "response_parse");
                throw validationErr;
            }

            if (decision.kind === "tool_call") {
                const effectiveActionId = toolCall.callId && toolCall.callId.trim().length > 0 && toolCall.callId !== toolCall.toolId
                    ? toolCall.callId
                    : (decision.action.actionId && decision.action.actionId.trim().length > 0
                        ? decision.action.actionId
                        : `action-${randomUUID()}`);
                decision = {
                    ...decision,
                    action: {
                        ...decision.action,
                        actionId: effectiveActionId,
                    },
                };
            }

            const thought = response.content?.trim();
            return Object.assign({}, decision, {
                decision,
                ...(thought ? { thought } : {}),
            });
        }

        try {
            decision = parseModelOutput(
                response.content,
                plan.bundle,
            );
        } catch (error) {
            await recordLlmError(
                this.traceSink,
                goal,
                error,
                Date.now() - startedAt,
                "response_parse",
            );
            throw error;
        }

        return decision;
    }

    private async consumeModelStream(
        adapter: LLMAdapter,
        request: Parameters<LLMAdapter["generate"]>[0],
        input: StepExecutionInput,
        control: StepExecutionInput["control"],
    ): Promise<{ readonly response: LLMResponse; readonly decodeDurationMs?: number }> {
        if (adapter.stream === undefined) {
            const response = await adapter.generate(request, control);
            this.publishFallbackModelEvents(input, response);
            return { response };
        }

        let response: LLMResponse | undefined;
        let firstTextDeltaAt: number | undefined;
        let decodeDurationMs: number | undefined;
        for await (const event of adapter.stream.call(adapter, request, control)) {
            throwIfAborted(control);
            if (event.kind === "assistant_text_delta" && event.text.length > 0 && firstTextDeltaAt === undefined) {
                firstTextDeltaAt = performance.now();
            }
            this.publishModelStreamEvent(input, event);
            if (event.kind !== "completed") continue;
            if (response !== undefined) {
                throw new LLMResponseProtocolError("LLM stream produced multiple completed responses");
            }
            response = event.response;
            if (firstTextDeltaAt !== undefined) {
                decodeDurationMs = Math.max(0, performance.now() - firstTextDeltaAt);
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

    private async appendModelMetric(
        record: Parameters<ModelCallMetricsRecorder["record"]>[0],
    ): Promise<void> {
        if (this.metricsRecorder === undefined) return;
        try {
            await this.metricsRecorder.record(record);
        } catch {
            // 指标是独立观察通道；写入故障不得改变 Agent 决策语义。
        }
    }

    private publishFallbackModelEvents(input: StepExecutionInput, response: LLMResponse): void {
        this.publishExecutionEvent(input, {
            kind: "model_started",
            visibility: "public",
            durability: "live",
            delivery: "control",
            payload: {},
        });
        if (response.content.length > 0) {
            this.publishExecutionEvent(input, {
                kind: "assistant_text_delta",
                visibility: "public",
                durability: "live",
                delivery: "delta",
                coalescingKey: `assistant:${input.executionUnitId ?? "run"}`,
                payload: { text: response.content },
            });
        }
        this.publishExecutionEvent(input, {
            kind: "model_completed",
            visibility: "public",
            durability: "live",
            delivery: "control",
            payload: { hasToolCalls: (response.toolCalls?.length ?? 0) > 0 },
        });
    }

    private publishModelStreamEvent(input: StepExecutionInput, event: LLMStreamEvent): void {
        switch (event.kind) {
            case "started":
                this.publishExecutionEvent(input, {
                    kind: "model_started",
                    visibility: "public",
                    durability: "live",
                    delivery: "control",
                    payload: {},
                });
                return;
            case "assistant_text_delta":
                this.publishExecutionEvent(input, {
                    kind: event.kind,
                    visibility: "public",
                    durability: "live",
                    delivery: "delta",
                    coalescingKey: `assistant:${input.executionUnitId ?? "run"}`,
                    payload: { text: event.text },
                });
                return;
            case "reasoning_delta":
                this.publishExecutionEvent(input, {
                    kind: event.kind,
                    visibility: "restricted",
                    durability: "live",
                    delivery: "delta",
                    coalescingKey: `reasoning:${input.executionUnitId ?? "run"}`,
                    payload: { text: event.text },
                });
                return;
            case "model_tool_call_delta":
                this.publishExecutionEvent(input, {
                    kind: event.kind,
                    visibility: "diagnostic",
                    durability: "live",
                    delivery: "delta",
                    coalescingKey: `model-tool-call:${input.executionUnitId ?? "run"}`,
                    payload: {
                        delta: event.delta,
                        ...(event.contentIndex === undefined ? {} : { contentIndex: event.contentIndex }),
                    },
                });
                return;
            case "completed":
                this.publishExecutionEvent(input, {
                    kind: "model_completed",
                    visibility: "public",
                    durability: "live",
                    delivery: "control",
                    payload: { hasToolCalls: (event.response.toolCalls?.length ?? 0) > 0 },
                });
                return;
        }
    }

    private publishExecutionEvent(
        input: StepExecutionInput,
        event: Omit<ExecutionStreamEventDraft, "goalId" | "runId">,
    ): void {
        const publisher = input.executionStream;
        if (publisher === undefined) return;
        try {
            publisher.publish({
                goalId: input.goal.id,
                runId: input.goal.state.run.id,
                ...(input.executionUnitId === undefined ? {} : { executionUnitId: input.executionUnitId }),
                ...event,
            });
        } catch {
            // 流是观察通道；发布故障不得改变 Agent 决策语义。
        }
    }
}
