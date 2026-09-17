import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMMessage, LLMRequest } from "../../llm/src/core/types";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
} from "../../runtime/src/execution-control";
import type {
    PreparationExecutionInput,
    PreparationExecutor,
    PreparationResult,
} from "../../runtime/src/preparation-executor";
import type { ContextCompactor } from "./context-compactor";
import type { ModelConversationMessage } from "./model-inference-view";
import { buildPreparationRequest } from "./prompt";
import {
    parseModelOutput,
} from "./model-output";
import { LLMResponseProtocolError } from "./errors";
import type { PromptBundleRenderer } from "./prompting/types";
import type { TrajectoryModelContextAssembler } from "./trajectory-model-context-assembler";
import type { DiagnosticTraceSink } from "../../runtime/src/index";
import {
    createCheckpointToolDeclarations,
    createGatheringToolDeclarations,
    createPlanningToolDeclarations,
    decodePhaseToolCall,
    type SystemToolDeclaration,
} from "../../contracts/src/index";
import { ContractValidationError } from "../../contracts/src/errors";
import type { LLMToolDefinition } from "../../llm/src/core/types";
import {
    createDefaultModelContextBudgetPolicy,
    TokenBudgetPlanner,
    type ModelCapabilities,
} from "./model-context-budget";
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
    DEFAULT_MAX_THOUGHT_CHARS,
    formatThinkingContext,
    truncateThought,
} from "./thought-budget";

/**
 * 创建 {@link LLMPreparationExecutor} 所需的供应商无关依赖。
 *
 * @example
 * ```ts
 * const dependencies: LLMPreparationExecutorDependencies = {
 *     adapter,
 *     renderer,
 *     contextCompactor,
 * };
 * ```
 */
export interface LLMPreparationExecutorDependencies {
    /** 接收统一消息协议并返回模型原始文本的 Adapter。 */
    readonly adapter?: LLMAdapter;
    /** 由 Composition Root 创建、与 Step Executor 共享的 Prompt Bundle Renderer。 */
    readonly renderer: PromptBundleRenderer;
    /** 由 Composition Root 创建、供所有 phase 共享的 Conversation 裁剪策略。 */
    readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    /** 可选的独立诊断通道；写入失败不会改变执行结果。 */
    readonly traceSink?: DiagnosticTraceSink;
    /** 当前 trajectory-layered@1 调用级上下文组装器。 */
    readonly trajectoryContextAssembler?: TrajectoryModelContextAssembler;
    /** 模型能力；配置后会向 Provider 透传 maxOutputTokens。 */
    readonly modelCapabilities?: ModelCapabilities;
    /** 思考链允许保留的最大字符数（可选，缺省使用 {@link DEFAULT_MAX_THOUGHT_CHARS}）。 */
    readonly maxThoughtChars?: number;
    /** 可替换的模型执行绑定提供者；每次 execute 开始时读取当前绑定。 */
    readonly bindingProvider?: ModelExecutionBindingProvider;
}

/**
 * 使用 LLMAdapter 生成严格 PreparationResult 的准备阶段执行器。
 *
 * @remarks
 * 当 Adapter 配置为 `two_stage` 结构化输出模式时，单步内依次执行自由文本推演与 strict Schema 提取，
 * 兼顾深度推理与合规准备动作。
 */
export class LLMPreparationExecutor implements PreparationExecutor {
    private readonly bindingProvider: ModelExecutionBindingProvider;
    private readonly renderer: PromptBundleRenderer;
    private readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly trajectoryContextAssembler: TrajectoryModelContextAssembler | undefined;
    private readonly modelCapabilities: ModelCapabilities | undefined;
    private readonly maxThoughtChars: number;
    private readonly budgetPlanner: TokenBudgetPlanner | undefined;

    /** @param dependencies - LLM Adapter、共享 Renderer 与共享裁剪策略。 */
    constructor(dependencies: LLMPreparationExecutorDependencies) {
        this.renderer = dependencies.renderer;
        this.contextCompactor = dependencies.contextCompactor;
        this.traceSink = dependencies.traceSink;
        this.trajectoryContextAssembler = dependencies.trajectoryContextAssembler;
        this.modelCapabilities = dependencies.modelCapabilities;
        this.maxThoughtChars = dependencies.maxThoughtChars ?? DEFAULT_MAX_THOUGHT_CHARS;
        if (this.modelCapabilities !== undefined) {
            this.budgetPlanner = new TokenBudgetPlanner(this.modelCapabilities);
        }
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
            throw new Error("Either bindingProvider or adapter must be provided to LLMPreparationExecutor");
        }
    }

    /**
     * @param input - 当前处于 active Preparation 阶段的执行入参。
     * @returns 与当前 phase 严格匹配的 PreparationResult。
     * @throws LLMResponseProtocolError 响应不是合法 JSON、结构错误或分支与
     * phase 不匹配时抛出。
     * @throws Goal 不处于 active Preparation 阶段时抛出 Error。
     * @throws 执行信号中止时抛出 `ExecutionAbortedError`。
     * @throws Adapter 抛出的供应商或传输异常会原样传播。
     */
    async execute(input: PreparationExecutionInput): Promise<PreparationResult> {
        const { goal, authorizedTools: tools, control } = input;

        throwIfAborted(control);
        const workflow = goal.state.workflow;

        if (
            workflow.phase === "executing"
            || workflow.preparation.status !== "active"
        ) {
            throw new Error(
                "Preparation request requires an active preparation Goal",
            );
        }

        const binding = this.bindingProvider.current();
        const adapter = binding.adapter;
        const modelCapabilities = binding.modelCapabilities;
        const trajectoryContextAssembler = binding.trajectoryContextAssembler;
        const budgetPlanner = modelCapabilities === this.modelCapabilities
            ? this.budgetPlanner
            : modelCapabilities === undefined
                ? undefined
                : new TokenBudgetPlanner(modelCapabilities);
        const mode = adapter.structuredOutputMode;

        const plan = await buildPreparationRequest(
            goal,
            tools,
            this.renderer,
            this.contextCompactor,
            control?.signal,
            input.workingMemory,
            trajectoryContextAssembler,
            input.contextLookupResult,
            modelCapabilities,
            input.preparationInputEvidence,
            mode,
            input.lastProbeResult,
            input.probeLimitReached,
        );
        throwIfAborted(control);

        const phase = goal.state.workflow.phase;
        const toolDeclarations: readonly SystemToolDeclaration<PreparationResult>[] =
            plan.bundle.kind === "checkpoint"
                ? createCheckpointToolDeclarations()
                : phase === "gathering_context"
                ? createGatheringToolDeclarations(tools)
                : createPlanningToolDeclarations(tools);

        const startedAt = Date.now();
        const providerRequest = modelCapabilities === undefined
            ? plan.request
            : { ...plan.request, maxOutputTokens: modelCapabilities.maxOutputTokens };
        await recordLlmRequest(this.traceSink, goal, providerRequest);
        let response: Awaited<ReturnType<LLMAdapter["generate"]>>;

        try {
            response = await adapter.generate(providerRequest, control);
        } catch (error) {
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
        throwIfAborted(control);
        await recordLlmResponse(
            this.traceSink,
            goal,
            response,
            Date.now() - startedAt,
        );

        let result: PreparationResult;

        if (response.toolCalls && response.toolCalls.length > 0) {
            const toolCall = response.toolCalls[0]!;
            let rawArgs: unknown;
            try {
                rawArgs = JSON.parse(toolCall.argumentsJson);
            } catch (err) {
                const parseErr = new LLMResponseProtocolError(
                    "INVALID_LLM_RESPONSE",
                    `Failed to parse arguments JSON for tool call "${toolCall.toolId}": ${(err as Error).message}`,
                );
                await recordLlmError(this.traceSink, goal, parseErr, Date.now() - startedAt, "response_parse");
                throw parseErr;
            }

            try {
                result = decodePhaseToolCall(toolDeclarations, toolCall.toolId, rawArgs);
            } catch (error) {
                const validationErr = error instanceof ContractValidationError
                    ? new LLMResponseProtocolError(
                        "INVALID_LLM_RESPONSE",
                        `Tool call "${toolCall.toolId}" validation failed: ${error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
                    )
                    : error;
                await recordLlmError(this.traceSink, goal, validationErr, Date.now() - startedAt, "response_parse");
                throw validationErr;
            }

            const thought = response.content?.trim();
            return Object.assign({}, result, {
                result,
                ...(thought ? { thought } : {}),
            });
        } else {
            try {
                result = parseModelOutput(
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
        }

        return result;
    }
}
