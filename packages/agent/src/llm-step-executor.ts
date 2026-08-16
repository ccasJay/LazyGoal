import type { LLMAdapter } from "../../llm/src/core/adapter";
import type {
    AgentDecision,
    Goal,
} from "../../runtime/src/domain";
import type { ToolDefinition } from "../../runtime/src/tool";
import type { StepExecutor } from "../../runtime/src/step-executor";
import { buildStepRequest } from "./prompt";
import { parseAgentDecision } from "./response-schema";

/** 创建 {@link LLMStepExecutor} 所需的供应商无关依赖。 */
export interface LLMStepExecutorDependencies {
    readonly adapter: LLMAdapter;
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

    /** @param dependencies - 具体供应商或测试实现的 LLMAdapter。 */
    constructor(dependencies: LLMStepExecutorDependencies) {
        this.adapter = dependencies.adapter;
    }

    /**
     * @param goal - 当前完整 Goal 快照。
     * @param tools - 当前已授权的 Tool 描述；为空时模型只能产生结束决策。
     * @returns 严格解析后的 AgentDecision。
     * @throws LLMResponseProtocolError 模型响应不符合严格协议时抛出。
     * @throws Adapter 抛出的供应商或传输异常会原样传播。
     */
    async execute(
        goal: Goal,
        tools: readonly ToolDefinition[],
    ): Promise<AgentDecision> {
        const request = buildStepRequest(goal, tools);
        const response = await this.adapter.generate(request);
        const decision = parseAgentDecision(response.content);

        return decision;
    }
}
