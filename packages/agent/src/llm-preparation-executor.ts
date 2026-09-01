import type { LLMAdapter } from "../../llm/src/core/adapter";
import {
    resolveMemoryProtocol,
    resolveModelContextProtocol,
    type Goal,
} from "../../runtime/src/domain";
import type { ToolDefinition } from "../../runtime/src/tool";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
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
    parsePreparationResult,
    requestRequiresContextCheckpoint,
} from "./response-schema";
import { LLMResponseProtocolError } from "./errors";
import type { PromptBundleRenderer } from "./prompting/types";
import type { TrajectoryModelContextAssembler } from "./trajectory-model-context-assembler";
import type { DiagnosticTraceSink } from "../../runtime/src/index";
import {
    ModelCapabilitiesError,
    type ModelCapabilities,
} from "./model-context-budget";
import {
    recordLlmError,
    recordLlmRequest,
    recordLlmResponse,
} from "./llm-diagnostic-trace";

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
    /**
     * trajectory-layered@1 的调用级上下文组装器；未配置时 legacy 协议仍可执行，
     * 分层 Goal 会在主模型调用前失败。
     */
    readonly trajectoryContextAssembler?: TrajectoryModelContextAssembler;
    /** v2 模型能力；配置后会向 Provider 透传 maxOutputTokens。 */
    readonly modelCapabilities?: ModelCapabilities;
}

/** 使用 LLMAdapter 生成严格 PreparationResult 的准备阶段执行器。 */
export class LLMPreparationExecutor implements PreparationExecutor {
    private readonly adapter: LLMAdapter;
    private readonly renderer: PromptBundleRenderer;
    private readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly trajectoryContextAssembler: TrajectoryModelContextAssembler | undefined;
    private readonly modelCapabilities: ModelCapabilities | undefined;

    /** @param dependencies - LLM Adapter、共享 Renderer 与共享裁剪策略。 */
    constructor(dependencies: LLMPreparationExecutorDependencies) {
        this.adapter = dependencies.adapter;
        this.renderer = dependencies.renderer;
        this.contextCompactor = dependencies.contextCompactor;
        this.traceSink = dependencies.traceSink;
        this.trajectoryContextAssembler = dependencies.trajectoryContextAssembler;
        this.modelCapabilities = dependencies.modelCapabilities;
    }

    /**
     * @param goal - active gathering_context 或 planning Goal。
     * @param tools - Runtime 已解析的授权 Tool 描述；只有 v2 planning 会进入
     *   PromptContext，其它版本或 Phase 会忽略。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns 与当前 phase 严格匹配的 PreparationResult。
     * @throws LLMResponseProtocolError 响应不是合法 JSON、结构错误或分支与
     * phase 不匹配时抛出。
     * @throws Goal 不处于 active Preparation 阶段时抛出 Error。
     * @throws 执行信号中止时抛出 `ExecutionAbortedError`。
     * @throws Adapter 抛出的供应商或传输异常会原样传播。
     */
    async execute(input: PreparationExecutionInput): Promise<PreparationResult>;
    /** @deprecated 使用对象式 {@link PreparationExecutionInput} 输入。 */
    async execute(
        goal: Goal,
        tools: readonly ToolDefinition[],
        control?: ExecutionControl,
    ): Promise<PreparationResult>;
    async execute(
        inputOrGoal: PreparationExecutionInput | Goal,
        legacyTools: readonly ToolDefinition[] = [],
        legacyControl?: ExecutionControl,
    ): Promise<PreparationResult> {
        const input: PreparationExecutionInput = "goal" in inputOrGoal
            ? inputOrGoal
            : {
                goal: inputOrGoal,
                authorizedTools: legacyTools,
                ...(legacyControl === undefined ? {} : { control: legacyControl }),
            };
        const { goal, authorizedTools: tools, control } = input;

        throwIfAborted(control);
        const modelContextProtocol = resolveModelContextProtocol(goal.definition);
        if (
            modelContextProtocol.kind === "trajectory-layered"
            && modelContextProtocol.version === 2
            && this.modelCapabilities === undefined
        ) {
            throw new ModelCapabilitiesError(
                "trajectory-layered@2 requires ModelCapabilities before model call",
            );
        }
        const workflow = goal.state.workflow;

        if (
            workflow.phase === "executing"
            || workflow.preparation.status !== "active"
        ) {
            throw new Error(
                "Preparation request requires an active preparation Goal",
            );
        }

        const request = await buildPreparationRequest(
            goal,
            tools,
            this.renderer,
            this.contextCompactor,
            control?.signal,
            input.workingMemory,
            this.trajectoryContextAssembler,
            input.contextLookupResult,
            this.modelCapabilities,
        );
        throwIfAborted(control);
        const startedAt = Date.now();
        const providerRequest = this.modelCapabilities === undefined
            ? request
            : { ...request, maxOutputTokens: this.modelCapabilities.maxOutputTokens };
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
            const result = parsePreparationResult(
                response.content,
                workflow.phase,
                resolveMemoryProtocol(goal.definition),
                modelContextProtocol,
            );
            const checkpointRequired = requestRequiresContextCheckpoint(providerRequest);
            if (checkpointRequired && result.kind !== "context_checkpoint") {
                throw new LLMResponseProtocolError(
                    "checkpoint_required 请求只接受 context_checkpoint 结果",
                );
            }
            if (!checkpointRequired && result.kind === "context_checkpoint") {
                throw new LLMResponseProtocolError(
                    "context_checkpoint 只能在 checkpoint_required 请求中返回",
                );
            }
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
