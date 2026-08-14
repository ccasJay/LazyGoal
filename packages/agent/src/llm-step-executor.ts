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

export interface LLMStepExecutorDependencies {
    readonly adapter: LLMAdapter;
}

export class LLMStepExecutor implements StepExecutor {
    private readonly adapter: LLMAdapter;

    constructor(dependencies: LLMStepExecutorDependencies) {
        this.adapter = dependencies.adapter;
    }

    async execute(goal: Goal): Promise<StepExecutionResult> {
        if (goal.profile.toolIds.length > 0) {
            throw new ToolsNotSupportedError(goal.profile.toolIds);
        }

        const request = buildStepRequest(goal);
        const response = await this.adapter.generate(request);
        const result = parseStepResult(response.content);

        return {
            result,
            appendedMessages: [
                buildStepUserMessage(goal),
                { role: "assistant", content: response.content },
            ],
        };
    }
}
