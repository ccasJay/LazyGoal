import type { ModelInputStore, ModelInputRecord } from "../../runtime/src/model-input";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMStreamEvent } from "../../llm/src/core/types";
import { readNormalizedUsage } from "../../llm/src/core/usage";
import type {
    AgentDecision,
} from "../../runtime/src/domain";
import type { DecideOutput } from "../../contracts/src/index";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
} from "../../runtime/src/execution-control";
import type {
    DecideStageResult,
    StepExecutionInput,
    StepExecutor,
    ThinkExchange,
    ThinkStageResult,
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
import { toModelStageFeedback } from "./stage-feedback";

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
    /** 完整模型输入查看日志；配置后写入失败阻止此次 Adapter 调用，不改变上下文比较基线。 */
    readonly modelInputStore?: ModelInputStore;
    /** 可选的独立指标事实 Store；写入失败不会改变执行结果。 */
    readonly metricsRecorder?: ModelCallMetricsRecorder;
    /** 当前 trajectory-layered@1 调用级上下文组装器。 */
    readonly trajectoryContextAssembler?: TrajectoryModelContextAssembler;
    /** 模型能力；配置后会向 Provider 透传 maxOutputTokens。 */
    readonly modelCapabilities?: ModelCapabilities;
    /** 可替换的模型执行绑定提供者；每次 Decide 或 Think 阶段开始时读取当前绑定。 */
    readonly bindingProvider?: ModelExecutionBindingProvider;
}

/**
 * 使用阶段绑定的 Adapter 执行 Decide 与 Think 请求。
 *
 * @remarks
 * 执行器从冻结 Profile、历史消息、授权 ToolDefinition 与当前 Run 构造请求。`execute()`
 * 保留单次直接 Decide 入口；Runtime Runner 使用 `decide()`/`think()` 驱动模型提出的阶段循环。
 * Decide 按绑定选择供应商支持的结构化模式，Think 始终使用 prompt_only 且不挂载工具。
 * Working Context、阶段消息和模型协议 JSON 都不是面向用户的真实 Conversation；状态
 * 推进、阶段检查点和 Tool 执行由 Runtime Runner 负责。执行器不会修改传入 Goal。
 *
 * ToolDefinition 由 Runtime 在调用时传入；执行器不根据 Profile 自行解析 Tool，
 * 也不把未授权 Tool 暴露给模型。
 */
export class LLMStepExecutor implements StepExecutor {
    private readonly bindingProvider: ModelExecutionBindingProvider;
    private readonly renderer: PromptBundleRenderer;
    private readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly modelInputStore: ModelInputStore | undefined;
    private readonly metricsRecorder: ModelCallMetricsRecorder | undefined;
    private readonly trajectoryContextAssembler: TrajectoryModelContextAssembler | undefined;
    private readonly modelCapabilities: ModelCapabilities | undefined;

    /** @param dependencies - 阶段绑定或单 Adapter Decide 入口、共享 Renderer 与共享裁剪策略。 */
    constructor(dependencies: LLMStepExecutorDependencies) {
        this.renderer = dependencies.renderer;
        this.contextCompactor = dependencies.contextCompactor;
        this.traceSink = dependencies.traceSink;
        this.modelInputStore = dependencies.modelInputStore;
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
                thinkAdapter: dependencies.adapter,
                decideAdapter: dependencies.adapter,
                modelCapabilities: dependencies.modelCapabilities,
                modelContextPolicy: createDefaultModelContextBudgetPolicy(),
                trajectoryContextAssembler: dependencies.trajectoryContextAssembler as TrajectoryModelContextAssembler,
            };
            this.bindingProvider = new MutableModelBinding(fallbackBinding);
        } else {
            throw new Error("Either bindingProvider or adapter must be provided to LLMStepExecutor");
        }
    }

    /** @param input - 执行入参；此兼容入口始终执行单次 Decide，不启用 Think 控制分支。 */
    async execute(input: StepExecutionInput): Promise<AgentDecision> {
        try {
            const result = await this.executeDecideStage(input, false, input.thinkHistory ?? []);
            if (result.kind !== "decision") {
                throw new LLMResponseProtocolError("request_think is not available through execute()");
            }
            return result.decision;
        } catch (error) {
            throw toModelStageFeedback(error, input, "decide");
        }
    }

    /**
     * 执行一次允许模型选择 Think 或直接决策的 Decide。
     *
     * @param input - 当前 Step 输入及先前已提交的 Think 目标/输出。
     * @returns 控制请求或业务决策，以及本次请求的模型上下文 frame。
     * @throws 模型调用失败或输出契约无效时抛出。
     * @example
     * ```ts
     * const result = await executor.decide({ ...input, thinkHistory: [] });
     * ```
     */
    async decide(input: StepExecutionInput & { readonly thinkHistory: readonly ThinkExchange[] }): Promise<DecideStageResult> {
        try {
            return await this.executeDecideStage(input, true, input.thinkHistory);
        } catch (error) {
            throw toModelStageFeedback(error, input, "decide");
        }
    }

    /**
     * 以 prompt_only 调用同一模型的 Think Adapter，拒绝工具调用与空文本。
     *
     * @param input - 当前 Step、明确推演目标和已提交的 Think 历史。
     * @returns 待 Runner 提交的自由文本与本次请求 frame。
     * @throws 输出为空、包含工具调用、模型请求失败或被中止时抛出。
     * @example
     * ```ts
     * const result = await executor.think({ ...input, thinkGoal: "比较方案", thinkHistory: [] });
     * ```
     */
    async think(input: StepExecutionInput & {
        readonly thinkGoal: string;
        readonly thinkHistory: readonly ThinkExchange[];
    }): Promise<ThinkStageResult> {
        try {
            return await this.executeThinkStage(input);
        } catch (error) {
            throw toModelStageFeedback(error, input, "think");
        }
    }

    private async executeThinkStage(input: StepExecutionInput & {
        readonly thinkGoal: string;
        readonly thinkHistory: readonly ThinkExchange[];
    }): Promise<ThinkStageResult> {
        const { goal, control } = input;
        const binding = this.bindingProvider.current();
        const adapter = binding.thinkAdapter;
        const plan = await buildStepRequest<DecideOutput>(
            goal,
            input.authorizedTools,
            this.renderer,
            this.contextCompactor,
            control?.signal,
            input.workingMemory,
            binding.trajectoryContextAssembler,
            input.contextLookupResult,
            binding.modelCapabilities,
            "prompt_only",
            "think",
            {
                thinkGoal: input.thinkGoal,
                thinkHistory: input.thinkHistory,
                ...(input.runtimeFeedback === undefined ? {} : { runtimeFeedback: input.runtimeFeedback }),
            },
        );
        const { response, startedAt, callId } = await this.generateModelResponse(
            adapter,
            plan.request,
            input,
            binding.modelCapabilities,
            "think",
            plan.modelContextFrame.sections.map(section => section.content),
        );
        if ((response.toolCalls?.length ?? 0) > 0) {
            const error = new LLMResponseProtocolError("Think stage must not return tool calls");
            await recordLlmError(this.traceSink, goal, error, Date.now() - startedAt, "response_parse");
            throw error;
        }
        const output = response.content.trim();
        if (output.length === 0) {
            const error = new LLMResponseProtocolError("Think stage returned empty text");
            await recordLlmError(this.traceSink, goal, error, Date.now() - startedAt, "response_parse");
            throw error;
        }
        return {
            goal: input.thinkGoal.trim(),
            output,
            modelContextFrame: { ...plan.modelContextFrame, modelCallId: callId },
        };
    }

    private async executeDecideStage(
        input: StepExecutionInput,
        allowThink: boolean,
        thinkHistory: readonly ThinkExchange[],
    ): Promise<DecideStageResult> {
        const { goal, authorizedTools: tools, control } = input;
        const binding = this.bindingProvider.current();
        const adapter = binding.decideAdapter;
        const plan = await buildStepRequest<DecideOutput>(
            goal,
            tools,
            this.renderer,
            this.contextCompactor,
            control?.signal,
            input.workingMemory,
            binding.trajectoryContextAssembler,
            input.contextLookupResult,
            binding.modelCapabilities,
            adapter.structuredOutputMode,
            "decide",
            {
                allowThink,
                thinkHistory,
                ...(input.runtimeFeedback === undefined ? {} : { runtimeFeedback: input.runtimeFeedback }),
            },
        );
        const { response, startedAt, callId } = await this.generateModelResponse(
            adapter,
            plan.request,
            input,
            binding.modelCapabilities,
            "decide",
            plan.modelContextFrame.sections.map(section => section.content),
        );

        let output: DecideOutput;
        if (response.toolCalls && response.toolCalls.length > 0) {
            const toolCall = response.toolCalls[0]!;
            let rawArgs: unknown;
            try {
                rawArgs = JSON.parse(toolCall.argumentsJson);
            } catch (err) {
                const parseErr = new LLMResponseProtocolError(
                    `Failed to parse arguments JSON for tool call "${toolCall.toolId}": ${(err as Error).message}`,
                    {
                        cause: err,
                        issues: [{
                            code: "invalid_tool_arguments",
                            path: ["arguments"],
                            message: "Tool arguments must contain valid JSON.",
                        }],
                    },
                );
                await recordLlmError(this.traceSink, goal, parseErr, Date.now() - startedAt, "response_parse");
                throw parseErr;
            }
            try {
                output = decodePhaseToolCall(
                    plan.toolDeclarations as readonly SystemToolDeclaration<unknown>[],
                    toolCall.toolId,
                    rawArgs,
                ) as DecideOutput;
            } catch (error) {
                const validationErr = error instanceof ContractValidationError
                    ? new LLMResponseProtocolError(
                        `Tool call "${toolCall.toolId}" validation failed: ${error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
                        {
                            issues: error.issues.map(i => ({
                                code: i.code,
                                path: input.authorizedTools.some(tool => tool.id === toolCall.toolId)
                                    ? ["action", "input", ...i.path]
                                    : i.path,
                                message: i.message,
                            })),
                            cause: error,
                        },
                    )
                    : error;
                await recordLlmError(this.traceSink, goal, validationErr, Date.now() - startedAt, "response_parse");
                throw validationErr;
            }
            if (output.kind === "tool_call") {
                const effectiveActionId = toolCall.callId && toolCall.callId.trim().length > 0 && toolCall.callId !== toolCall.toolId
                    ? toolCall.callId
                    : (output.action.actionId && output.action.actionId.trim().length > 0
                        ? output.action.actionId
                        : `action-${randomUUID()}`);
                output = { ...output, action: { ...output.action, actionId: effectiveActionId } };
            }
        } else {
            try {
                output = parseModelOutput(response.content, plan.bundle);
            } catch (error) {
                await recordLlmError(this.traceSink, goal, error, Date.now() - startedAt, "response_parse");
                throw error;
            }
        }

        if (output.kind === "request_think") {
            const goal = output.goal.trim();
            if (goal.length === 0) {
                const error = new LLMResponseProtocolError("request_think.goal must contain non-whitespace text", {
                    issues: [{
                        code: "blank_think_goal",
                        path: ["goal"],
                        message: "Think goal must contain non-whitespace text.",
                    }],
                });
                await recordLlmError(this.traceSink, input.goal, error, Date.now() - startedAt, "response_parse");
                throw error;
            }
            output = { ...output, goal };
        }

        return output.kind === "request_think"
            ? { kind: "request_think", goal: output.goal, modelContextFrame: { ...plan.modelContextFrame, modelCallId: callId } }
            : { kind: "decision", decision: output, modelContextFrame: { ...plan.modelContextFrame, modelCallId: callId } };
    }

    private async generateModelResponse(
        adapter: LLMAdapter,
        request: Parameters<LLMAdapter["generate"]>[0],
        input: StepExecutionInput,
        modelCapabilities: ModelCapabilities | undefined,
        stage: ModelInputRecord["stage"],
        sections: readonly string[],
    ): Promise<{ readonly response: LLMResponse; readonly startedAt: number; readonly callId: string }> {
        const { goal, control } = input;
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
            ? request
            : { ...request, maxOutputTokens: modelCapabilities.maxOutputTokens };
        await this.modelInputStore?.append({
            ...metricIdentity, stepIndex: goal.state.run.stepCount + 1, stage,
            occurredAt: new Date().toISOString(),
            messages: providerRequest.messages.map((message, index) => ({
                ...message,
                source: message.role === "system" ? "system" as const
                    : index === providerRequest.messages.length - 1 ? "working_context" as const
                    : goal.state.messages.some(saved => saved.role === message.role && saved.content === message.content) ? "conversation" as const
                    : sections.includes(message.content) ? "section" as const
                    : input.thinkHistory?.some(exchange => exchange.output === message.content) ? "stage" as const
                    : "request" as const,
            })),
        });
        throwIfAborted(control);
        await recordLlmRequest(this.traceSink, goal, providerRequest, this.modelInputStore === undefined ? undefined : callId);
        await this.appendModelMetric({
            recordType: "call_started",
            ...metricIdentity,
            occurredAt: new Date().toISOString(),
        });
        let response: LLMResponse;
        let decodeDurationMs: number | undefined;
        try {
            if (adapter.stream === undefined) {
                response = await adapter.generate(providerRequest, control);
                this.publishFallbackModelEvents(input, response);
            } else {
                const streamed = await this.consumeModelStream(adapter, providerRequest, input, control);
                response = streamed.response;
                decodeDurationMs = streamed.decodeDurationMs;
            }
            throwIfAborted(control);
        } catch (error) {
            await this.appendModelMetric({
                recordType: "call_finished",
                ...metricIdentity,
                occurredAt: new Date().toISOString(),
                outcome: isExecutionAbortedError(error) || control?.signal?.aborted ? "cancelled" : "failed",
                usage: { source: "unavailable" },
            });
            await recordLlmError(this.traceSink, goal, error, Date.now() - startedAt, "adapter");
            if (isExecutionAbortedError(error)) throw error;
            if (control?.signal?.aborted) throw new ExecutionAbortedError();
            throw error;
        }
        const usage = readNormalizedUsage(response.providerMetadata);
        await this.appendModelMetric({
            recordType: "call_finished",
            ...metricIdentity,
            occurredAt: new Date().toISOString(),
            outcome: "completed",
            usage: usage === undefined ? { source: "unavailable" } : { source: "provider_reported", ...usage },
            ...(decodeDurationMs === undefined ? {} : { decodeDurationMs }),
        });
        await recordLlmResponse(this.traceSink, goal, response, Date.now() - startedAt);
        return { response, startedAt, callId };
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
