import { isModelAssistantMessage, sameNativeIdentity } from "../../model-contracts/src/index";
import type { ModelInputStore, ModelInputRecord } from "../../runtime/src/model-input";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

/** Decide 响应的形状分级结果：单调用进入既有决策路径，多调用成为顺序批次，零调用且有正文归为 Assistant 消息。 */
type DecideResponseOutcome =
    | { readonly kind: "call"; readonly call: LLMToolCall }
    | { readonly kind: "batch"; readonly calls: readonly LLMToolCall[] }
    | { readonly kind: "assistant_message"; readonly text: string };
import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMStreamEvent } from "../../llm/src/core/types";
import { readNormalizedUsage } from "../../llm/src/core/usage";
import type {
    AgentDecision,
    Goal,
} from "../../runtime/src/domain";
import type { DecideOutput } from "../../model-contracts/src/index";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
} from "../../execution-control/src/index";
import type {
    DecideStageResult,
    StepExecutionInput,
    StepExecutor,
    ThinkExchange,
    ThinkStageResult,
    CompletionReviewInput,
} from "../../runtime/src/step-executor";
import type { ContextCompactor } from "./context-compactor";
import type { ModelConversationMessage } from "./model-inference-view";
import { buildStepRequest } from "./prompt";
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
    SystemCompletionReviewDeclaration,
    type CompletionReviewResult,
    type SystemToolDeclaration,
} from "../../model-contracts/src/index";
import { ContractValidationError } from "../../contracts/src/errors";
import type { LLMResponse, LLMToolDefinition, LLMToolCall } from "../../llm/src/core/types";
import type { ExecutionStreamEventDraft, ExecutionStreamPublisher } from "../../execution-stream/src/index";
import { toModelStageFeedback } from "./stage-feedback";
import { buildCompletionReviewRequest } from "./completion-review";

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
            throw new LLMResponseProtocolError(result.kind === "request_think"
                ? "request_think is not available through execute()"
                : "An assistant message decision is not available through execute()");
        }
            return result.decision;
        } catch (error) {
            throw toModelStageFeedback(error, input, "decide");
        }
    }

    /**
     * 把一个声明的工具调用解码为 Decide 输出，并为其业务动作分配稳定身份。
     *
     * @param toolCall - 模型返回的单个调用。
     * @param declarations - 本次请求暴露的声明集合。
     * @param input - 当前 Step 输入，用于判定输入路径归属。
     * @param goal - 当前 Goal，仅用于诊断记录。
     * @param startedAt - 本次模型调用起始时间。
     * @param callId - 本次模型调用标识。
     * @param adapter - 当前 Decide 适配器，用于判定原生会话身份。
     * @returns 解码后的决策；批量的每个调用各调用一次。
     * @throws 参数不是合法 JSON 或不符合声明契约时抛协议错误。
     * @example
     * ```ts
     * const output = await executor.decodeToolCallOutcome(call, declarations, input, goal, startedAt, callId, adapter);
     * ```
     */
    private async decodeToolCallOutcome(
        toolCall: LLMToolCall,
        declarations: readonly SystemToolDeclaration<unknown>[],
        input: StepExecutionInput,
        goal: Goal,
        startedAt: number,
        callId: string,
        adapter: LLMAdapter,
    ): Promise<DecideOutput> {
        let output: DecideOutput;
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
            await recordLlmError(this.traceSink, goal, parseErr, Date.now() - startedAt, "response_parse", callId);
            throw parseErr;
        }
        const declaration = declarations.find(tool => tool.id === toolCall.toolId);
        try {
            output = decodePhaseToolCall(declarations, toolCall.toolId, rawArgs) as DecideOutput;
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
                        ...(declaration === undefined || rawArgs === null || typeof rawArgs !== "object" || Array.isArray(rawArgs) ? {} : {
                            toolCallShape: {
                                toolId: declaration.id,
                                providedFields: Object.keys(rawArgs),
                                allowedFields: Object.keys(declaration.parametersSchema.properties ?? {}),
                                requiredFields: (declaration.parametersSchema.required ?? []) as readonly string[],
                            },
                        }),
                    },
                )
                : error;
            await recordLlmError(this.traceSink, goal, validationErr, Date.now() - startedAt, "response_parse", callId);
            throw validationErr;
        }
        if (output.kind === "tool_call") {
            const actionId = adapter.nativeConversationIdentity !== undefined
                ? `action-${randomUUID()}`
                : toolCall.callId && toolCall.callId.trim().length > 0 && toolCall.callId !== toolCall.toolId
                    ? toolCall.callId : output.action.actionId;
            output = { ...output, action: { ...output.action, actionId } };
        }
        return output;
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
     * 使用当前 Decide 模型独立核查完成候选，不发布公开模型文本或调用参数。
     * @param input - Runtime 已校验的候选与完整提交事实。
     * @returns 从唯一 system_review_completion 调用解码的接受或具体缺口反馈；不改写候选、不提交状态。
     * @throws 调用或预算失败原样抛出；协议错误交由 Decide 纠错链处理。
     * @example
     * ```ts
     * const review = await executor.reviewCompletion({ ...input, candidate, evidence: [] });
     * ```
     */
    async reviewCompletion(input: CompletionReviewInput): Promise<CompletionReviewResult> {
        try {
            const binding = this.bindingProvider.current();
            const { request } = buildCompletionReviewRequest(input, binding);
            const { executionStream: _stream, ...privateInput } = input;
            const { response } = await this.generateModelResponse(
                binding.decideAdapter, request, privateInput, binding.modelCapabilities, "completion_review", [],
            );
            const call = this.requireSingleToolCall(response);
            if (call.toolId !== SystemCompletionReviewDeclaration.id) {
                throw new LLMResponseProtocolError("Completion review returned an undeclared result call");
            }
            return decodePhaseToolCall([SystemCompletionReviewDeclaration], call.toolId,
                JSON.parse(call.argumentsJson));
        } catch (error) {
            const protocolError = error instanceof SyntaxError || error instanceof ContractValidationError
                ? new LLMResponseProtocolError("Completion review response does not match its contract", { cause: error })
                : error;
            throw toModelStageFeedback(protocolError, input, "decide");
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
            adapter.nativeConversationIdentity,
            input.exposedToolIds,
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
            await recordLlmError(this.traceSink, goal, error, Date.now() - startedAt, "response_parse", callId);
            throw error;
        }
        const output = response.content.trim();
        if (output.length === 0) {
            const error = new LLMResponseProtocolError("Think stage returned empty text");
            await recordLlmError(this.traceSink, goal, error, Date.now() - startedAt, "response_parse", callId);
            throw error;
        }
        return {
            goal: input.thinkGoal.trim(),
            output,
            modelContextFrame: { ...plan.modelContextFrame, modelCallId: callId, ...(response.continuation === undefined ? {} : { modelResponse: nativeResponseMessage(response) }) },
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
                ...(input.toolDiscoveryResult === undefined ? {} : { toolDiscoveryResult: input.toolDiscoveryResult }),
                ...(input.runtimeFeedback === undefined ? {} : { runtimeFeedback: input.runtimeFeedback }),
            },
            adapter.nativeConversationIdentity,
            input.exposedToolIds,
        );
        const { response, startedAt, callId } = await this.generateModelResponse(
            adapter,
            plan.request,
            input,
            binding.modelCapabilities,
            "decide",
            plan.modelContextFrame.sections.map(section => section.content),
        );
        let classified: DecideResponseOutcome;
        try {
            classified = this.classifyDecideResponse(response);
        } catch (error) {
            await recordLlmError(this.traceSink, goal, error, Date.now() - startedAt, "response_parse", callId);
            throw error;
        }

        if (classified.kind === "assistant_message") {
            return {
                kind: "assistant_message",
                text: classified.text,
                modelContextFrame: { ...plan.modelContextFrame, modelCallId: callId, ...(response.continuation === undefined ? {} : { modelResponse: nativeResponseMessage(response) }) },
            };
        }
        if (classified.kind === "batch") {
            const decisions: DecideOutput[] = [];
            for (const call of classified.calls) {
                decisions.push(await this.decodeToolCallOutcome(call, plan.toolDeclarations, input, goal, startedAt, callId, adapter));
            }
            return {
                kind: "batch",
                decisions,
                modelContextFrame: { ...plan.modelContextFrame, modelCallId: callId, ...(response.continuation === undefined ? {} : { modelResponse: nativeResponseMessage(response) }) },
            };
        }
        const toolCall = classified.call;

        if (adapter.nativeConversationIdentity !== undefined && (response.continuation === undefined
            || !sameNativeIdentity(response.continuation.identity, adapter.nativeConversationIdentity)
            || !isModelAssistantMessage(nativeResponseMessage(response)))) {
            const error = new LLMResponseProtocolError("Invalid native response identity or continuation data");
            await recordLlmError(this.traceSink, goal, error, Date.now() - startedAt, "response_parse", callId);
            throw error;
        }

        let output = await this.decodeToolCallOutcome(toolCall!, plan.toolDeclarations, input, goal, startedAt, callId, adapter);

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
                await recordLlmError(this.traceSink, input.goal, error, Date.now() - startedAt, "response_parse", callId);
                throw error;
            }
            output = { ...output, goal };
        }

        return output.kind === "request_think"
            ? { kind: "request_think", goal: output.goal, modelContextFrame: { ...plan.modelContextFrame, modelCallId: callId, ...(response.continuation === undefined ? {} : { modelResponse: nativeResponseMessage(response) }) } }
            : { kind: "decision", decision: output, modelContextFrame: { ...plan.modelContextFrame, modelCallId: callId, ...(response.continuation === undefined ? {} : { modelResponse: nativeResponseMessage(response) }) } };
    }

    private requireSingleToolCall(response: LLMResponse) {
        const calls = response.toolCalls ?? [];
        if (calls.length !== 1) {
            const code = calls.length === 0 ? "missing_tool_call" : "multiple_tool_calls";
            throw new LLMResponseProtocolError("Model response requires exactly one declared tool call", {
                issues: [{ code, path: ["toolCalls"], message: calls.length === 0
                    ? "Call one declared tool; do not return a text JSON decision."
                    : "Return exactly one tool call, not multiple calls." }],
            });
        }
        return calls[0]!;
    }

    /**
     * 对 Decide 响应做形状分级：单调用进入既有决策路径，多调用仍判协议错误，
     * 零调用且正文非空归为合法 Assistant 消息，零调用且无可用正文归为无可用结果。
     *
     * @param response - Adapter 返回的原始响应。
     * @returns 单调用返回唯一 call；零调用且有正文返回 Assistant 消息。
     * @throws 多调用抛 `multiple_tool_calls`；零调用且无正文或仅推演义抛 `no_usable_result`。
     * @remarks 结构化控制请求（完成审查等）不经过本分级，仍由 {@link requireSingleToolCall} 要求唯一结果。
     * @example
     * ```ts
     * const outcome = executor.classifyDecideResponse(response);
     * if (outcome.kind === "assistant_message") return { kind: "assistant_message", text: outcome.text };
     * ```
     */
    private classifyDecideResponse(response: LLMResponse): DecideResponseOutcome {
        const calls = response.toolCalls ?? [];
        if (calls.length === 1) return { kind: "call", call: calls[0]! };
        if (calls.length > 1) return { kind: "batch", calls };
        const text = response.content.trim();
        if (text.length === 0) {
            throw new LLMResponseProtocolError("Model response contains no usable decision", {
                issues: [{
                    code: "no_usable_result",
                    path: ["toolCalls"],
                    message: "Return one declared tool call, or a non-empty text answer.",
                }],
            });
        }
        return { kind: "assistant_message", text: response.content };
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
        const providerRequest = {
            ...request,
            sessionId: goal.id,
            ...(modelCapabilities === undefined ? {} : { maxOutputTokens: modelCapabilities.maxOutputTokens }),
        };
        await this.modelInputStore?.append({
            ...metricIdentity, stepIndex: goal.state.run.stepCount + 1, stage,
            occurredAt: new Date().toISOString(),
            messages: providerRequest.messages.map((message, index) => ({
                ...message,
                source: message.role === "tool" || message.role === "assistant" && message.continuation !== undefined ? "native_history" as const
                    : message.role === "system" ? "system" as const
                    : message.content.startsWith('{"source":"runtime_feedback",') ? "request" as const
                    : index === providerRequest.messages.length - 1 - (providerRequest.messages.at(-1)?.content.startsWith('{"source":"runtime_feedback",') ? 1 : 0) ? "working_context" as const
                    : goal.state.messages.some(saved => saved.role === message.role && saved.content === message.content) ? "conversation" as const
                    : sections.includes(message.content) ? "section" as const
                    : input.thinkHistory?.some(exchange => exchange.output === message.content) ? "stage" as const
                    : "request" as const,
            })),
        });
        throwIfAborted(control);
        await recordLlmRequest(this.traceSink, goal, providerRequest, this.modelInputStore === undefined ? undefined : callId, callId);
        await this.appendModelMetric({
            recordType: "call_started",
            ...metricIdentity,
            modelId: goal.state.modelSelection.modelId,
            occurredAt: new Date().toISOString(),
        });
        let response: LLMResponse;
        let decodeDurationMs: number | undefined;
        let requestStartedAt: number | undefined;
        let requestDurationMs: number | undefined;
        try {
            if (adapter.stream === undefined) {
                requestStartedAt = performance.now();
                response = await adapter.generate(providerRequest, control);
                const elapsedMs = performance.now() - requestStartedAt;
                if (Number.isFinite(elapsedMs) && elapsedMs > 0) requestDurationMs = elapsedMs;
                this.publishFallbackModelEvents(input, response);
            } else {
                requestStartedAt = performance.now();
                const streamed = await this.consumeModelStream(adapter, providerRequest, input, control);
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
            await this.appendModelMetric({
                recordType: "call_finished",
                ...metricIdentity,
                occurredAt: new Date().toISOString(),
                outcome: isExecutionAbortedError(error) || control?.signal?.aborted ? "cancelled" : "failed",
                usage: { source: "unavailable" },
                ...(requestDurationMs === undefined ? {} : { requestDurationMs }),
            });
            await recordLlmError(this.traceSink, goal, error, Date.now() - startedAt, "adapter", callId);
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
            ...(requestDurationMs === undefined ? {} : { requestDurationMs }),
            ...(decodeDurationMs === undefined ? {} : { decodeDurationMs }),
        });
        await recordLlmResponse(this.traceSink, goal, response, Date.now() - startedAt, callId);
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
        if (response.reasoning !== undefined && response.reasoning.length > 0) {
            this.publishExecutionEvent(input, {
                kind: "reasoning_delta", visibility: "restricted", durability: "live", delivery: "delta",
                coalescingKey: `reasoning:${input.executionUnitId ?? "run"}`, payload: { text: response.reasoning },
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

function nativeResponseMessage(response: LLMResponse): import("../../model-contracts/src/index").ModelAssistantMessage {
    return {
        role: "assistant", content: response.content,
        ...(response.reasoning === undefined ? {} : { reasoning: response.reasoning }),
        ...(response.toolCalls === undefined ? {} : { toolCalls: response.toolCalls }),
        ...(response.continuation === undefined ? {} : { continuation: response.continuation }),
    };
}
