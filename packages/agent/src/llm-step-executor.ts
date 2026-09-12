import type { LLMAdapter } from "../../llm/src/core/adapter";
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
import type { DiagnosticTraceSink } from "../../runtime/src/index";
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
import { TwoStageStepExecutor } from "./two-stage-step-executor";

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
    /** 由 Composition Root 创建、与 Preparation Executor 共享的 Prompt Bundle Renderer。 */
    readonly renderer: PromptBundleRenderer;
    /** 由 Composition Root 创建、供所有 phase 共享的 Conversation 裁剪策略。 */
    readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    /** 可选的独立诊断通道；写入失败不会改变执行结果。 */
    readonly traceSink?: DiagnosticTraceSink;
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
    private readonly trajectoryContextAssembler: TrajectoryModelContextAssembler | undefined;
    private readonly modelCapabilities: ModelCapabilities | undefined;

    /** @param dependencies - LLM Adapter、共享 Renderer 与共享裁剪策略。 */
    constructor(dependencies: LLMStepExecutorDependencies) {
        this.renderer = dependencies.renderer;
        this.contextCompactor = dependencies.contextCompactor;
        this.traceSink = dependencies.traceSink;
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

        if (adapter.structuredOutputMode === "two_stage") {
            return new TwoStageStepExecutor({
                adapter,
                renderer: this.renderer,
                contextCompactor: this.contextCompactor,
                ...(this.traceSink !== undefined ? { traceSink: this.traceSink } : {}),
                ...(trajectoryContextAssembler !== undefined ? { trajectoryContextAssembler } : {}),
                ...(modelCapabilities !== undefined ? { modelCapabilities } : {}),
            }).execute(input);
        }

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

        let decision: AgentDecision;

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
}
