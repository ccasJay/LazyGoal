import { isModelAssistantMessage, sameNativeIdentity } from "../../model-contracts/src/index";
import type { ModelInputStore, ModelInputRecord } from "../../runtime/src/model-input";
import { randomUUID } from "node:crypto";

import type { LLMAdapter } from "../../llm-core/src/index";
import type {
    AgentDecision,
    Goal,
} from "../../runtime/src/domain";
import type { DecideOutput, CompletionReviewResult, SystemToolDeclaration } from "../../model-contracts/src/index";
import type {
    DecideStageResult,
    StepExecutionInput,
    StepExecutor,
    ThinkExchange,
    ThinkStageResult,
    CompletionReviewInput,
} from "../../runtime/src/step-executor";
import type { ContextCompactor } from "../../context-budget/src/index";
import type { ModelConversationMessage } from "../../model-view/src/index";
import {
    buildStepRequest,
    buildCompletionReviewRequest,
} from "../../model-request/src/index";
import { LLMResponseProtocolError } from "../../model-response/src/index";
import type { PromptBundleRenderer } from "../../prompt-renderer/src/index";
import type { TrajectoryModelContextAssembler } from "../../model-context/src/index";
import type {
    DiagnosticTraceSink,
    ModelCallMetricsRecorder,
} from "../../runtime/src/index";
import { createDefaultModelContextBudgetPolicy, type ModelCapabilities } from "../../context-budget/src/index";
import {
    callModel,
    recordLlmError,
} from "../../model-call/src/index";
import {
    MutableModelBinding,
    type ModelExecutionBinding,
    type ModelExecutionBindingProvider,
} from "./model-execution-binding";
import {
    assertNativeResponseIdentity,
    classifyDecideResponse,
    decodeCompletionReviewResponse,
    decodeThinkResponse,
    decodeToolCallOutcome,
    nativeResponseMessage,
    normalizeRequestThinkGoal,
    readPublicTextBlocks,
    type DecideResponseOutcome,
} from "../../model-response/src/index";
import type { LLMRequest, LLMResponse, LLMToolDefinition, LLMToolCall } from "../../llm-core/src/index";
import { toModelStageFeedback } from "./stage-feedback";
import {
    COMPLETION_CANDIDATE_TOOL_ID,
    isCompletionCandidateTool,
    readCompleteSummaryPreview,
} from "./summary-preview";
import type { CompletionCandidatePreview } from "../../runtime/src/step-executor";

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
    /**
     * 每个执行单元当前仍然有效的候选预览身份。
     *
     * @remarks
     * 只保存进程内的临时观察状态：同一执行单元出现新候选时，旧候选必须先被
     * 明确作废，消费者才不会被旧预览继续追加。
     */
    private readonly activeCandidateIds = new Map<string, string>();

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
     * 使用唯一解码实现解码工具调用，并在失败时以同一 callId 记录最小诊断。
     *
     * @param toolCall - 模型返回的单个调用。
     * @param declarations - 本次请求暴露的声明集合。
     * @param input - 当前 Step 输入，用于判定业务输入路径归属。
     * @param goal - 当前 Goal，仅用于诊断记录。
     * @param startedAt - 本次模型调用起始时间。
     * @param callId - 本次模型调用标识。
     * @param adapter - 当前 Decide 适配器，用于分配原生动作身份。
     * @returns 解码并绑定动作身份的决策；批量的每个调用各调用一次。
     * @throws 参数不是合法 JSON 或不符合声明契约时抛协议错误。
     */
    private async decodeToolCallWithRecording(
        toolCall: LLMToolCall,
        declarations: readonly SystemToolDeclaration<unknown>[],
        input: StepExecutionInput,
        goal: Goal,
        startedAt: number,
        callId: string,
        adapter: LLMAdapter,
    ): Promise<DecideOutput> {
        try {
            let output = decodeToolCallOutcome(
                toolCall,
                declarations,
                input.authorizedTools.map((tool) => tool.id),
            );
            if (output.kind === "tool_call") {
                const actionId = adapter.nativeConversationIdentity !== undefined
                    ? `action-${randomUUID()}`
                    : toolCall.callId && toolCall.callId.trim().length > 0 && toolCall.callId !== toolCall.toolId
                        ? toolCall.callId : output.action.actionId;
                output = { ...output, action: { ...output.action, actionId } };
            }
            return output;
        } catch (error) {
            await recordLlmError(this.traceSink, traceIdentity(goal), error, Date.now() - startedAt, "response_parse", callId);
            throw error;
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
            const { request } = buildCompletionReviewRequest(input, {
                modelContextPolicy: binding.modelContextPolicy,
                ...(binding.modelCapabilities === undefined ? {} : { modelCapabilities: binding.modelCapabilities }),
            });
            const { executionStream: _stream, ...privateInput } = input;
            const { response } = await this.callModelForStage(
                binding.decideAdapter, request, privateInput, binding.modelCapabilities, "completion_review", [], [],
            );
            return decodeCompletionReviewResponse(response);
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
            adapter.nativeConversationIdentity,
            input.exposedToolIds,
        );
        const { response, startedAt, callId } = await this.callModelForStage(
            adapter,
            plan.request,
            input,
            binding.modelCapabilities,
            "think",
            plan.modelContextFrame.sections.map(section => section.content),
            input.thinkHistory.map(exchange => exchange.output),
        );
        let output: string;
        try {
            output = decodeThinkResponse(response);
        } catch (error) {
            await recordLlmError(this.traceSink, traceIdentity(goal), error, Date.now() - startedAt, "response_parse", callId);
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
        const { response, startedAt, callId } = await this.callModelForStage(
            adapter,
            plan.request,
            input,
            binding.modelCapabilities,
            "decide",
            plan.modelContextFrame.sections.map(section => section.content),
            thinkHistory.map(exchange => exchange.output),
        );
        let classified: DecideResponseOutcome;
        try {
            classified = classifyDecideResponse(response);
        } catch (error) {
            await recordLlmError(this.traceSink, traceIdentity(goal), error, Date.now() - startedAt, "response_parse", callId);
            throw error;
        }

        if (classified.kind === "assistant_message") {
            return {
                kind: "assistant_message",
                text: classified.text,
                modelContextFrame: { ...plan.modelContextFrame, modelCallId: callId, ...(response.continuation === undefined ? {} : { modelResponse: nativeResponseMessage(response) }) },
            };
        }
        // 混合响应的公开正文：与工具调用同在一次响应内，按块顺序交给 Runtime 保存为过程正文。
        const publicTextBlocks = readPublicTextBlocks(response);
        // 完成候选的未确认预览：只读取已声明完成候选工具的顶层 summary 字段值。
        const candidatePreview = readCompletionCandidatePreview(plan.request, response, callId);
        // 预览必须在完成审查之前发布：它始终未确认，被拒绝的候选随后由 Runtime 作废。
        if (candidatePreview !== undefined) {
            publishCandidatePreview(input, callId, candidatePreview, this.activeCandidateIds);
        }
        if (classified.kind === "batch") {
            const decisions: DecideOutput[] = [];
            for (const call of classified.calls) {
                decisions.push(await this.decodeToolCallWithRecording(call, plan.toolDeclarations, input, goal, startedAt, callId, adapter));
            }
            return {
                kind: "batch",
                decisions,
                ...(publicTextBlocks.length === 0 ? {} : { publicTextBlocks }),
                ...(candidatePreview === undefined ? {} : { candidatePreview }),
                modelContextFrame: { ...plan.modelContextFrame, modelCallId: callId, ...(response.continuation === undefined ? {} : { modelResponse: nativeResponseMessage(response) }) },
            };
        }
        const toolCall = classified.call;

        if (adapter.nativeConversationIdentity !== undefined) {
            try {
                assertNativeResponseIdentity(response, adapter.nativeConversationIdentity);
            } catch (error) {
                await recordLlmError(this.traceSink, traceIdentity(goal), error, Date.now() - startedAt, "response_parse", callId);
                throw error;
            }
        }

        let output = await this.decodeToolCallWithRecording(toolCall!, plan.toolDeclarations, input, goal, startedAt, callId, adapter);

        if (output.kind === "request_think") {
            let thinkGoal: string;
            try {
                thinkGoal = normalizeRequestThinkGoal(output);
            } catch (error) {
                await recordLlmError(this.traceSink, traceIdentity(input.goal), error, Date.now() - startedAt, "response_parse", callId);
                throw error;
            }
            output = { ...output, goal: thinkGoal };
        }

        return output.kind === "request_think"
            ? { kind: "request_think", goal: output.goal, modelContextFrame: { ...plan.modelContextFrame, modelCallId: callId, ...(response.continuation === undefined ? {} : { modelResponse: nativeResponseMessage(response) }) } }
            : {
                kind: "decision",
                decision: output,
                ...(publicTextBlocks.length === 0 ? {} : { publicTextBlocks }),
                ...(candidatePreview === undefined ? {} : { candidatePreview }),
                modelContextFrame: { ...plan.modelContextFrame, modelCallId: callId, ...(response.continuation === undefined ? {} : { modelResponse: nativeResponseMessage(response) }) },
            };
    }

    /**
     * 以收窄上下文执行一次模型调用；记录、流收集与发布由调用包负责。
     *
     * @param adapter - 当前阶段 Adapter。
     * @param request - 已准备完成的最终请求。
     * @param input - 当前 Step 输入；只投影调用记录所需身份。
     * @param modelCapabilities - 当前绑定模型能力；配置后透传输出上限。
     * @param stage - 调用所属阶段。
     * @param sections - 本次请求实际发送的动态 Section 正文。
     * @param stageOutputs - 本 Step 已提交的阶段输出正文。
     * @returns 最终响应、起始时间与调用标识。
     * @throws 取消、输入写入失败或流协议错误时按原语义抛出。
     */
    private async callModelForStage(
        adapter: LLMAdapter,
        request: LLMRequest,
        input: StepExecutionInput,
        modelCapabilities: ModelCapabilities | undefined,
        stage: ModelInputRecord["stage"],
        sections: readonly string[],
        stageOutputs: readonly string[],
    ): Promise<{ readonly response: LLMResponse; readonly startedAt: number; readonly callId: string }> {
        const { goal, control } = input;
        return callModel({
            adapter,
            ...(this.traceSink === undefined ? {} : { traceSink: this.traceSink }),
            ...(this.modelInputStore === undefined ? {} : { modelInputStore: this.modelInputStore }),
            ...(this.metricsRecorder === undefined ? {} : { metricsRecorder: this.metricsRecorder }),
            ...(input.executionStream === undefined ? {} : { executionStream: input.executionStream }),
        }, {
            context: {
                goalId: goal.id,
                runId: goal.state.run.id,
                stepIndex: goal.state.run.stepCount + 1,
                modelId: goal.state.modelSelection.modelId,
                conversationMessages: goal.state.messages,
                ...(input.executionUnitId === undefined ? {} : { executionUnitId: input.executionUnitId }),
                sections,
                ...(stageOutputs.length === 0 ? {} : { stageOutputs }),
            },
            request,
            stage,
            ...(modelCapabilities === undefined ? {} : { maxOutputTokens: modelCapabilities.maxOutputTokens }),
            ...(control === undefined ? {} : { control }),
        });
    }
}

function traceIdentity(goal: Goal): { readonly goalId: string; readonly runId: string } {
    return { goalId: goal.id, runId: goal.state.run.id };
}

/**
 * 发布一次未确认的完成候选预览。
 *
 * @remarks
 * 同一执行单元出现新候选时，先明确作废旧候选：新的调用或候选不得继续追加
 * 旧预览。发布端故障不得改变候选、审查或执行结果；预览只是旁路观察面。
 *
 * @param input - 当前 Step 输入；携带可选的执行流发布端口。
 * @param modelCallId - 产生该候选的模型调用身份。
 * @param preview - 已提取的未确认预览。
 * @param activeCandidateIds - 每个执行单元当前有效候选的临时观察状态。
 */
function publishCandidatePreview(
    input: StepExecutionInput,
    modelCallId: string,
    preview: CompletionCandidatePreview,
    activeCandidateIds: Map<string, string>,
): void {
    const publisher = input.executionStream;
    if (publisher === undefined) return;
    const unitKey = input.executionUnitId ?? modelCallId;
    const previous = activeCandidateIds.get(unitKey);
    if (previous !== undefined && previous !== preview.candidateId) {
        publishCandidateInvalidation(input, previous, "replaced");
    }
    activeCandidateIds.set(unitKey, preview.candidateId);
    try {
        publisher.publish({
            goalId: input.goal.id,
            runId: input.goal.state.run.id,
            ...(input.executionUnitId === undefined ? {} : { executionUnitId: input.executionUnitId }),
            kind: "candidate_preview",
            visibility: "public",
            durability: "live",
            delivery: "control",
            payload: {
                candidateId: preview.candidateId,
                modelCallId,
                blockIndex: preview.blockIndex,
                text: preview.text,
                truncated: preview.truncated,
                complete: preview.complete,
            },
        });
    } catch {
        // 预览发布是旁路：故障只影响观察，不改变候选与审查结果。
    }
}

/**
 * 明确作废一个仍然有效的候选预览。
 *
 * @remarks
 * 作废只影响观察：它不改变候选、审查、重试预算或 Run 状态，也不等同于
 * Run 失败。
 *
 * @param input - 当前 Step 输入；携带可选的执行流发布端口。
 * @param candidateId - 被作废的候选身份。
 * @param reason - 作废原因。
 */
export function publishCandidateInvalidation(
    input: StepExecutionInput,
    candidateId: string,
    reason: "rejected" | "cancelled" | "failed" | "replaced" | "ambiguous",
): void {
    const publisher = input.executionStream;
    if (publisher === undefined) return;
    try {
        publisher.publish({
            goalId: input.goal.id,
            runId: input.goal.state.run.id,
            ...(input.executionUnitId === undefined ? {} : { executionUnitId: input.executionUnitId }),
            kind: "candidate_invalidated",
            visibility: "public",
            durability: "live",
            delivery: "control",
            payload: { candidateId, reason },
        });
    } catch {
        // 作废通知是旁路：发布故障不得改变候选与执行结果。
    }
}

/**
 * 从已声明完成候选工具的响应中读取未确认预览。
 *
 * @remarks
 * 只有本次请求实际声明了完成候选工具、且响应中存在身份完全一致的工具调用时
 * 才返回预览；参数对象的其它字段（Evidence、Memory Patch 等）不进入公开正文。
 * 整块参数不伪造逐字增量，只提供完整候选。
 *
 * @param request - 本次实际发出的模型请求。
 * @param response - 本次完整响应。
 * @param modelCallId - 产生该响应的模型调用身份。
 * @returns 未确认预览；没有可公开的顶层 summary 时返回 `undefined`。
 */
export function readCompletionCandidatePreview(
    request: LLMRequest,
    response: LLMResponse,
    modelCallId: string,
): CompletionCandidatePreview | undefined {
    const declared = (request.tools ?? []).some((tool) => tool.id === COMPLETION_CANDIDATE_TOOL_ID);
    if (!declared) return undefined;
    for (const block of response.blocks) {
        if (block.type !== "tool_call") continue;
        if (!isCompletionCandidateTool(block.toolId)) continue;
        const preview = readCompleteSummaryPreview({
            toolId: block.toolId,
            argumentsJson: block.argumentsJson,
        });
        if (!preview.matched || preview.ambiguous) return undefined;
        return {
            candidateId: modelCallId,
            modelCallId,
            blockIndex: block.index,
            text: preview.text,
            truncated: preview.truncated,
            complete: preview.complete,
        };
    }
    return undefined;
}
