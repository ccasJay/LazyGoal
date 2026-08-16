import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { Goal } from "../../runtime/src/domain";
import type {
    PreparationExecutor,
    PreparationResult,
} from "../../runtime/src/preparation-executor";
import { ToolsNotSupportedError } from "./errors";
import { buildPreparationRequest } from "./prompt";
import { parsePreparationResult } from "./response-schema";

/**
 * 创建 {@link LLMPreparationExecutor} 所需的供应商无关依赖。
 *
 * @example
 * ```ts
 * const dependencies: LLMPreparationExecutorDependencies = { adapter };
 * ```
 */
export interface LLMPreparationExecutorDependencies {
    /** 接收统一消息协议并返回模型原始文本的 Adapter。 */
    readonly adapter: LLMAdapter;
}

/** 使用 LLMAdapter 生成严格 PreparationResult 的准备阶段执行器。 */
export class LLMPreparationExecutor implements PreparationExecutor {
    private readonly adapter: LLMAdapter;

    /** @param dependencies - 具体供应商或测试实现的 LLMAdapter。 */
    constructor(dependencies: LLMPreparationExecutorDependencies) {
        this.adapter = dependencies.adapter;
    }

    /**
     * @param goal - active gathering_context 或 planning Goal。
     * @returns 与当前 phase 严格匹配的 PreparationResult。
     * @throws ToolsNotSupportedError Profile 声明了 Tool 时在调用 Adapter 前抛出。
     * @throws LLMResponseProtocolError 响应不是合法 JSON、结构错误或分支与
     * phase 不匹配时抛出。
     * @throws Goal 不处于 active Preparation 阶段时抛出 Error。
     * @throws Adapter 抛出的供应商或传输异常会原样传播。
     */
    async execute(goal: Goal): Promise<PreparationResult> {
        if (goal.definition.profile.toolIds.length > 0) {
            throw new ToolsNotSupportedError(goal.definition.profile.toolIds);
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

        const request = buildPreparationRequest(goal);
        const response = await this.adapter.generate(request);

        return parsePreparationResult(response.content, workflow.phase);
    }
}
