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
    StepExecutor,
} from "../../runtime/src/step-executor";
import type { ContextCompactor } from "./context-compactor";
import type { ModelConversationMessage } from "./model-inference-view";
import { buildStepRequest } from "./prompt";
import {
    parseAgentDecision,
    requestRequiresContextCheckpoint,
} from "./model-output";
import { LLMResponseProtocolError } from "./errors";
import type { PromptBundleRenderer } from "./prompting/types";
import type { TrajectoryModelContextAssembler } from "./trajectory-model-context-assembler";
import type { DiagnosticTraceSink } from "../../runtime/src/index";
import type { ModelCapabilities } from "./model-context-budget";
import {
    recordLlmError,
    recordLlmRequest,
    recordLlmResponse,
} from "./llm-diagnostic-trace";

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
    readonly adapter: LLMAdapter;
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
 * ToolDefinition 由 Runtime 在调用时传入；执行器不根据 Profile 自行解析 Tool，
 * 也不把未授权 Tool 暴露给模型。
 */
export class LLMStepExecutor implements StepExecutor {
    private readonly adapter: LLMAdapter;
    private readonly renderer: PromptBundleRenderer;
    private readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly trajectoryContextAssembler: TrajectoryModelContextAssembler | undefined;
    private readonly modelCapabilities: ModelCapabilities | undefined;

    /** @param dependencies - LLM Adapter、共享 Renderer 与共享裁剪策略。 */
    constructor(dependencies: LLMStepExecutorDependencies) {
        this.adapter = dependencies.adapter;
        this.renderer = dependencies.renderer;
        this.contextCompactor = dependencies.contextCompactor;
        this.traceSink = dependencies.traceSink;
        this.trajectoryContextAssembler = dependencies.trajectoryContextAssembler;
        this.modelCapabilities = dependencies.modelCapabilities;
    }

    /**
     * @param goal - 当前完整 Goal 快照。
     * @param tools - 当前已授权的 Tool 描述；为空时模型只能产生结束决策。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns 严格解析后的 AgentDecision。
     * @throws LLMResponseProtocolError 模型响应不符合严格协议时抛出。
     * @throws 执行信号中止时抛出 `ExecutionAbortedError`。
     * @throws Adapter 抛出的供应商或传输异常会原样传播。
     */
    async execute(input: StepExecutionInput): Promise<AgentDecision> {
        const { goal, authorizedTools: tools, control } = input;

        throwIfAborted(control);
        const request = await buildStepRequest(
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

        let decision: AgentDecision;

        try {
            decision = parseAgentDecision(
                response.content,
            );
            const checkpointRequired = requestRequiresContextCheckpoint(providerRequest);
            if (checkpointRequired && decision.kind !== "context_checkpoint") {
                throw new LLMResponseProtocolError(
                    "checkpoint_required 请求只接受 context_checkpoint 结果",
                );
            }
            if (!checkpointRequired && decision.kind === "context_checkpoint") {
                throw new LLMResponseProtocolError(
                    "context_checkpoint 只能在 checkpoint_required 请求中返回",
                );
            }
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
