import type { LLMAdapter } from "../../llm/src/core/adapter";
import type {
    LegacyRunState,
    RunState,
    StepResult,
} from "../../runtime/src/domain";
import type { StepExecutor } from "../../runtime/src/step-executor";
import { ToolsNotSupportedError } from "./errors";
import { buildStepRequest } from "./prompt";
import { parseStepResult } from "./response-schema";

export interface LLMStepExecutorDependencies {
    readonly adapter: LLMAdapter;
}

export class LLMStepExecutor implements StepExecutor {
    private readonly adapter: LLMAdapter;

    constructor(dependencies: LLMStepExecutorDependencies) {
        this.adapter = dependencies.adapter;
    }

    async execute(state: RunState): Promise<StepResult> {
        if (!("profile" in state)) {
            throw new Error(
                "LLM StepExecutor requires the pre-GoalStore RunState context",
            );
        }

        const profile = (state as LegacyRunState).profile;
        if (profile.toolIds.length > 0) {
            throw new ToolsNotSupportedError(profile.toolIds);
        }

        const request = buildStepRequest(state);
        const response = await this.adapter.generate(request);
        return parseStepResult(response.content);
    }
}
