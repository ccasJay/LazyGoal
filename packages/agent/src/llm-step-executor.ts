import type { LLMAdapter } from "../../llm/src/core/adapter";
import type {
    Goal,
} from "../../runtime/src/domain";
import type {
    StepExecutionResult,
    StepExecutor,
} from "../../runtime/src/step-executor";
import { ToolsNotSupportedError } from "./errors";
import { buildStepRequest, buildStepUserMessage } from "./prompt";
import { parseStepResult } from "./response-schema";

/** 创建 {@link LLMStepExecutor} 所需的供应商无关依赖。 */
export interface LLMStepExecutorDependencies {
    readonly adapter: LLMAdapter;
}

/**
 * 使用 LLMAdapter 执行一个 Goal Step 的执行器。
 *
 * @remarks
 * 执行器从冻结 Profile、历史消息与当前 Run 构造请求，只调用 Adapter 一次，
 * 再以严格 StepResult 协议解析原始响应。解析成功后返回本轮 user/assistant
 * 消息，由 Runner 负责追加和持久化；执行器不会修改传入 Goal。
 *
 * 当前不支持 Tool Calling，Profile 含任意 toolId 时会在调用 Adapter 前失败。
 */
export class LLMStepExecutor implements StepExecutor {
    private readonly adapter: LLMAdapter;

    /** @param dependencies - 具体供应商或测试实现的 LLMAdapter。 */
    constructor(dependencies: LLMStepExecutorDependencies) {
        this.adapter = dependencies.adapter;
    }

    /**
     * @param goal - 当前完整 Goal 快照。
     * @returns 解析后的 StepResult 与本轮待追加消息。
     * @throws ToolsNotSupportedError Profile 声明了 Tool 时抛出。
     * @throws LLMResponseProtocolError 模型响应不符合严格协议时抛出。
     * @throws Adapter 抛出的供应商或传输异常会原样传播。
     */
    async execute(goal: Goal): Promise<StepExecutionResult> {
        if (goal.definition.profile.toolIds.length > 0) {
            throw new ToolsNotSupportedError(goal.definition.profile.toolIds);
        }

        const request = buildStepRequest(goal);
        const response = await this.adapter.generate(request);
        const result = parseStepResult(response.content);

        return {
            result,
            appendedMessages: [
                buildStepUserMessage(goal),
                {
                    role: "assistant",
                    assistant: { profileId: goal.definition.profile.id },
                    content: response.content,
                },
            ],
        };
    }
}
