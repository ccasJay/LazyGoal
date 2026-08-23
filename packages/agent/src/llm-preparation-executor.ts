import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { Goal } from "../../runtime/src/domain";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../runtime/src/execution-control";
import type {
    PreparationExecutor,
    PreparationResult,
} from "../../runtime/src/preparation-executor";
import type { ContextCompactor } from "./context-compactor";
import type { ModelConversationMessage } from "./model-inference-view";
import { buildPreparationRequest } from "./prompt";
import { parsePreparationResult } from "./response-schema";
import type { PromptBundleRenderer } from "./prompting/types";

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
}

/** 使用 LLMAdapter 生成严格 PreparationResult 的准备阶段执行器。 */
export class LLMPreparationExecutor implements PreparationExecutor {
    private readonly adapter: LLMAdapter;
    private readonly renderer: PromptBundleRenderer;
    private readonly contextCompactor: ContextCompactor<ModelConversationMessage>;

    /** @param dependencies - LLM Adapter、共享 Renderer 与共享裁剪策略。 */
    constructor(dependencies: LLMPreparationExecutorDependencies) {
        this.adapter = dependencies.adapter;
        this.renderer = dependencies.renderer;
        this.contextCompactor = dependencies.contextCompactor;
    }

    /**
     * @param goal - active gathering_context 或 planning Goal。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns 与当前 phase 严格匹配的 PreparationResult。
     * @throws LLMResponseProtocolError 响应不是合法 JSON、结构错误或分支与
     * phase 不匹配时抛出。
     * @throws Goal 不处于 active Preparation 阶段时抛出 Error。
     * @throws 执行信号中止时抛出 `ExecutionAbortedError`。
     * @throws Adapter 抛出的供应商或传输异常会原样传播。
     */
    async execute(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<PreparationResult> {
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

        const request = await buildPreparationRequest(
            goal,
            this.renderer,
            this.contextCompactor,
            control?.signal,
        );
        throwIfAborted(control);
        let response: Awaited<ReturnType<LLMAdapter["generate"]>>;

        try {
            response = await this.adapter.generate(request, control);
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            throw error;
        }
        throwIfAborted(control);

        return parsePreparationResult(response.content, workflow.phase);
    }
}
