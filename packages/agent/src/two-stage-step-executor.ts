import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest } from "../../llm/src/core/types";
import type {
    AgentDecision,
    DiagnosticTraceSink,
    StepExecutionInput,
    StepExecutionResult,
    StepExecutor,
} from "../../runtime/src/index";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
} from "../../runtime/src/index";
import type { ContextCompactor } from "./context-compactor";
import type {
    ModelConversationMessage,
} from "./model-inference-view";
import type { PromptBundleRenderer } from "./prompting/types";
import {
    recordLlmError,
    recordLlmRequest,
    recordLlmResponse,
} from "./llm-diagnostic-trace";
import type { TrajectoryModelContextAssembler } from "./trajectory-model-context-assembler";
import {
    TokenBudgetPlanner,
    type ModelCapabilities,
} from "./model-context-budget";
import { buildStepRequest } from "./prompt";
import { parseModelOutput } from "./model-output";
import {
    DEFAULT_MAX_THOUGHT_CHARS,
    formatThinkingContext,
    truncateThought,
} from "./thought-budget";

/**
 * 构造 {@link TwoStageStepExecutor} 所需的依赖项。
 *
 * @example
 * ```ts
 * const deps: TwoStageStepExecutorDependencies = {
 *   adapter,
 *   renderer,
 *   contextCompactor,
 * };
 * ```
 */
export interface TwoStageStepExecutorDependencies {
    /** 负责与底层模型提供商通信的 Adapter。 */
    readonly adapter: LLMAdapter;
    /** 负责将结构化 Prompt 模板渲染为文本的 Renderer。 */
    readonly renderer: PromptBundleRenderer;
    /** 负责会话历史上下文超限时的裁剪器。 */
    readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    /** 负责捕获并记录模型请求与响应的诊断记录器（可选）。 */
    readonly traceSink?: DiagnosticTraceSink;
    /** 轨迹上下文组装器（可选）。 */
    readonly trajectoryContextAssembler?: TrajectoryModelContextAssembler;
    /** 模型上下文窗口与能力元数据配置（可选）。 */
    readonly modelCapabilities?: ModelCapabilities;
    /** 思考链允许保留的最大字符数（可选，缺省使用 {@link DEFAULT_MAX_THOUGHT_CHARS}）。 */
    readonly maxThoughtChars?: number;
}

/**
 * 同模型双阶段单步执行器。
 *
 * @remarks
 * 在单个决策步内依次串行触发两次同模型请求：
 * 1. Stage 1 (Think)：发起无任何 JSON Schema 结构约束的自由思考请求，引导模型进行深度推演并提取纯文本思考链（CoT）；
 * 2. 预算防护：将捕获的思考链通过 TokenBudgetPlanner 进行动态预算衡量与尾部安全截断；
 * 3. Stage 2 (Decide)：将截断后的思考链作为上下文依据注入消息列表，同时挂载原生 strict JSON Schema 发起结构化决策提取；
 * 4. 返回携带领域 AgentDecision 与原始思考链的 {@link StepExecutionResult}。
 *
 * @example
 * ```ts
 * const executor = new TwoStageStepExecutor({ adapter, renderer, contextCompactor });
 * const result = await executor.execute({ goal, authorizedTools });
 * console.log(result.decision, (result as StepExecutionResult).thought);
 * ```
 */
export class TwoStageStepExecutor implements StepExecutor {
    private readonly adapter: LLMAdapter;
    private readonly renderer: PromptBundleRenderer;
    private readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly trajectoryContextAssembler: TrajectoryModelContextAssembler | undefined;
    private readonly modelCapabilities: ModelCapabilities | undefined;
    private readonly maxThoughtChars: number;
    private readonly budgetPlanner: TokenBudgetPlanner | undefined;

    constructor(dependencies: TwoStageStepExecutorDependencies) {
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
     * 执行单步两阶段决策调度。
     *
     * @param input - 执行入参，包含目标快照、已授权工具、工作记忆与中止控制。
     * @returns 携带思考链的执行结果 {@link StepExecutionResult}。
     * @throws ExecutionAbortedError 当任一阶段收到取消信号时立即抛出。
     * @throws 其它模型传输或协议解析异常原样传播。
     */
    async execute(input: StepExecutionInput): Promise<StepExecutionResult> {
        const { goal, authorizedTools: tools, control } = input;
        throwIfAborted(control);

        // ==========================================
        // Stage 1: Think (自由文本推理生成 CoT)
        // ==========================================
        const basePlan = await buildStepRequest(
            goal,
            tools,
            this.renderer,
            this.contextCompactor,
            control?.signal,
            input.workingMemory,
            this.trajectoryContextAssembler,
            input.contextLookupResult,
            this.modelCapabilities,
            "two_stage",
        );
        throwIfAborted(control);

        // 构造 Stage 1 思考引导请求（不携带 structuredOutput）
        const thinkingMessages: ModelConversationMessage[] = [
            ...basePlan.request.messages,
            {
                role: "user",
                content: "Please analyze the goal, observation history, and available tools. Think step-by-step and write out your detailed reasoning in free-form text. Do not output JSON.",
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

        // ==========================================
        // 思考链 Token 预算防护与安全截断
        // ==========================================
        const truncatedThoughtResult = truncateThought(rawThought, {
            maxChars: this.maxThoughtChars,
            ...(this.budgetPlanner !== undefined ? { planner: this.budgetPlanner } : {}),
        });
        const sanitizedThought = truncatedThoughtResult.thought;

        // ==========================================
        // Stage 2: Decide (挂载 strict Schema 提取动作)
        // ==========================================
        const decidePlan = await buildStepRequest(
            goal,
            tools,
            this.renderer,
            this.contextCompactor,
            control?.signal,
            input.workingMemory,
            this.trajectoryContextAssembler,
            input.contextLookupResult,
            this.modelCapabilities,
            "strict",
        );
        throwIfAborted(control);

        // 注入思考上下文
        const decideMessages: ModelConversationMessage[] = [
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

        let decision: AgentDecision;
        try {
            decision = parseModelOutput(stage2Response.content, decidePlan.bundle);
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

        return {
            decision,
            thought: sanitizedThought,
        };
    }
}
