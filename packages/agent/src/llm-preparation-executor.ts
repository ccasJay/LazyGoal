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
    TokenBudgetPlanner,
    type ModelCapabilities,
} from "./model-context-budget";
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
    readonly adapter: LLMAdapter;
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
}

/**
 * 使用 LLMAdapter 生成严格 PreparationResult 的准备阶段执行器。
 *
 * @remarks
 * 当 Adapter 配置为 `two_stage` 结构化输出模式时，单步内依次执行自由文本推演与 strict Schema 提取，
 * 兼顾深度推理与合规准备动作。
 */
export class LLMPreparationExecutor implements PreparationExecutor {
    private readonly adapter: LLMAdapter;
    private readonly renderer: PromptBundleRenderer;
    private readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly trajectoryContextAssembler: TrajectoryModelContextAssembler | undefined;
    private readonly modelCapabilities: ModelCapabilities | undefined;
    private readonly maxThoughtChars: number;
    private readonly budgetPlanner: TokenBudgetPlanner | undefined;

    /** @param dependencies - LLM Adapter、共享 Renderer 与共享裁剪策略。 */
    constructor(dependencies: LLMPreparationExecutorDependencies) {
        this.adapter = dependencies.adapter;
        this.renderer = dependencies.renderer;
        this.contextCompactor = dependencies.contextCompactor;
        this.traceSink = dependencies.traceSink;
        this.trajectoryContextAssembler = dependencies.trajectoryContextAssembler;
        this.modelCapabilities = dependencies.modelCapabilities;
        this.maxThoughtChars = dependencies.maxThoughtChars ?? DEFAULT_MAX_THOUGHT_CHARS;
        if (this.modelCapabilities !== undefined) {
            this.budgetPlanner = new TokenBudgetPlanner(this.modelCapabilities);
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

        const mode = this.adapter.structuredOutputMode;

        if (mode === "two_stage") {
            // ==========================================
            // Stage 1: Think (自由文本推理生成 CoT)
            // ==========================================
            const basePlan = await buildPreparationRequest(
                goal,
                tools,
                this.renderer,
                this.contextCompactor,
                control?.signal,
                input.workingMemory,
                this.trajectoryContextAssembler,
                input.contextLookupResult,
                this.modelCapabilities,
                input.preparationInputEvidence,
                "two_stage",
            );
            throwIfAborted(control);

            const thinkingMessages: LLMMessage[] = [
                ...basePlan.request.messages,
                {
                    role: "user",
                    content: workflow.phase === "gathering_context"
                        ? "Please analyze the goal intent, conversation history, and missing information. Think step-by-step about what context is needed or whether context is ready. Do not output JSON."
                        : "Please analyze the gathered context, goal intent, and available tools. Think step-by-step about the execution plan, tasks, and completion criteria. Do not output JSON.",
                },
            ];

            const thinkingRequest: LLMRequest = {
                messages: thinkingMessages,
                ...(this.modelCapabilities !== undefined
                    ? { maxOutputTokens: this.modelCapabilities.maxOutputTokens }
                    : basePlan.request.maxOutputTokens !== undefined
                        ? { maxOutputTokens: basePlan.request.maxOutputTokens }
                        : {}),
            };

            const stage1StartedAt = Date.now();
            await recordLlmRequest(this.traceSink, goal, thinkingRequest);

            let stage1Response: Awaited<ReturnType<LLMAdapter["generate"]>>;
            try {
                stage1Response = await this.adapter.generate(thinkingRequest, control);
            } catch (error) {
                await recordLlmError(
                    this.traceSink,
                    goal,
                    error,
                    Date.now() - stage1StartedAt,
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
                stage1Response,
                Date.now() - stage1StartedAt,
            );

            const rawThought = stage1Response.content.trim();

            // 思考链 Token 预算防护与安全截断
            const truncatedThoughtResult = truncateThought(rawThought, {
                maxChars: this.maxThoughtChars,
                ...(this.budgetPlanner !== undefined ? { planner: this.budgetPlanner } : {}),
            });
            const sanitizedThought = truncatedThoughtResult.thought;

            // ==========================================
            // Stage 2: Decide (挂载 strict Schema 提取合规 PreparationResult)
            // ==========================================
            const decidePlan = await buildPreparationRequest(
                goal,
                tools,
                this.renderer,
                this.contextCompactor,
                control?.signal,
                input.workingMemory,
                this.trajectoryContextAssembler,
                input.contextLookupResult,
                this.modelCapabilities,
                input.preparationInputEvidence,
                "strict",
            );
            throwIfAborted(control);

            const decideMessages: LLMMessage[] = [
                ...decidePlan.request.messages,
                {
                    role: "user",
                    content: formatThinkingContext(sanitizedThought),
                },
            ];

            const decideRequest: LLMRequest = {
                messages: decideMessages,
                structuredOutput: decidePlan.request.structuredOutput ?? {
                    name: decidePlan.bundle.name,
                    schema: decidePlan.bundle.jsonSchema,
                },
                ...(this.modelCapabilities !== undefined
                    ? { maxOutputTokens: this.modelCapabilities.maxOutputTokens }
                    : decidePlan.request.maxOutputTokens !== undefined
                        ? { maxOutputTokens: decidePlan.request.maxOutputTokens }
                        : {}),
            };

            const stage2StartedAt = Date.now();
            await recordLlmRequest(this.traceSink, goal, decideRequest);

            let stage2Response: Awaited<ReturnType<LLMAdapter["generate"]>>;
            try {
                stage2Response = await this.adapter.generate(decideRequest, control);
            } catch (error) {
                await recordLlmError(
                    this.traceSink,
                    goal,
                    error,
                    Date.now() - stage2StartedAt,
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
                stage2Response,
                Date.now() - stage2StartedAt,
            );

            try {
                const result = parseModelOutput(
                    stage2Response.content,
                    decidePlan.bundle,
                );
                return result;
            } catch (error) {
                await recordLlmError(
                    this.traceSink,
                    goal,
                    error,
                    Date.now() - stage2StartedAt,
                    "response_parse",
                );
                throw error;
            }
        }

        const plan = await buildPreparationRequest(
            goal,
            tools,
            this.renderer,
            this.contextCompactor,
            control?.signal,
            input.workingMemory,
            this.trajectoryContextAssembler,
            input.contextLookupResult,
            this.modelCapabilities,
            input.preparationInputEvidence,
            mode,
        );
        throwIfAborted(control);
        const startedAt = Date.now();
        const providerRequest = this.modelCapabilities === undefined
            ? plan.request
            : { ...plan.request, maxOutputTokens: this.modelCapabilities.maxOutputTokens };
        await recordLlmRequest(this.traceSink, goal, providerRequest);
        let response: Awaited<ReturnType<LLMAdapter["generate"]>>;

        try {
            response = await this.adapter.generate(providerRequest, control);
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

        try {
            const result = parseModelOutput(
                response.content,
                plan.bundle,
            );
            return result;
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
}
