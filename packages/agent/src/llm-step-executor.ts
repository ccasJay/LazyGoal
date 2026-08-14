import type { LLMAdapter } from "../../llm/src/core/adapter";
import type {
    Goal,
    LegacyRunState,
    RunState,
    StepResult,
} from "../../runtime/src/domain";
import type {
    StepExecutionResult,
    StepExecutor,
} from "../../runtime/src/step-executor";
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

    async execute(goal: Goal): Promise<StepExecutionResult>;

    /**
     * 兼容 Task 3 之前的直接调用方；Runner 主链只使用上面的 Goal 契约。
     * @deprecated 迁移旧调用方后移除。
     */
    async execute(state: RunState): Promise<StepResult>;

    async execute(
        input: Goal | RunState,
    ): Promise<StepExecutionResult | StepResult> {
        const isGoal = "run" in input;
        const state = isGoal ? toLegacyRunState(input) : input;

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
        const result = parseStepResult(response.content);

        return isGoal
            ? { result, appendedMessages: [] }
            : result;
    }
}

function toLegacyRunState(goal: Goal): LegacyRunState {
    return {
        ...goal.run,
        goal: {
            id: goal.id,
            objective: goal.task.objective,
            completionCriteria: [...goal.task.completionCriteria],
        },
        profile: goal.profile,
    };
}
