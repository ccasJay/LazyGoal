import type { Goal, StepRecord } from "../../runtime/src/domain";
import type { ToolDefinition } from "../../runtime/src/tool";
import type {
    ModelConversationMessage,
    ModelInferenceView,
    ModelPendingAction,
    ModelProfileView,
    ModelStepRecord,
    ModelToolDefinition,
    ModelWorkingContext,
    PreparationPhase,
} from "./model-inference-view";

/**
 * 从 Runtime State 派生 LLM Input View 的单向投影边界。
 *
 * @remarks
 * 只有本模块同时感知 Runtime 领域类型与 View DTO，并负责逐字段复制，保证
 * 两个 View 之间不共享可变对象。它不修改 Goal、不写入消息历史，也不序列化
 * Snapshot；Run 状态字段、Snapshot 版本与瞬时执行资源不会被投影。
 *
 * @example
 * ```ts
 * const projector = new ModelInferenceProjector();
 * const view = projector.project(goal, authorizedTools);
 * ```
 */
export class ModelInferenceProjector {
    /**
     * @param goal - 当前完整 Goal 快照。
     * @param tools - 当前 Profile 已授权且由 Registry 解析出的 Tool 描述。
     * @returns 与当前 phase 对应的全新 ModelInferenceView。
     * @throws Goal 当前状态不允许调用模型时抛出 Error。
     */
    project(
        goal: Goal,
        tools: readonly ToolDefinition[] = [],
    ): ModelInferenceView {
        const workingContext = this.projectWorkingContext(goal);
        const protocol: ModelInferenceView["protocol"] = workingContext.phase
            === "executing"
            ? "agent_decision"
            : workingContext.phase;

        return {
            protocol,
            profile: projectProfile(goal),
            conversation: projectConversation(goal),
            workingContext,
            authorizedTools: projectTools(tools),
        };
    }

    /** @param goal - 见 {@link project}。 */
    projectWorkingContext(goal: Goal): ModelWorkingContext {
        const workflow = goal.state.workflow;

        if (workflow.phase !== "executing") {
            const phase = assertActivePreparation(goal);

            return {
                phase,
                intent: goal.definition.intent,
            };
        }

        if (goal.state.run.status !== "running") {
            throw new Error("Step request requires a running executing Goal");
        }

        const maxSteps = goal.definition.executionPolicy.maxSteps;

        return {
            phase: "executing",
            intent: goal.definition.intent,
            task: {
                objective: workflow.task.objective,
                completionCriteria: [...workflow.task.completionCriteria],
            },
            execution: {
                stepCount: goal.state.run.stepCount,
                ...(maxSteps > 0 ? { maxSteps } : {}),
                ...(goal.state.run.checkpoint === undefined
                    ? {}
                    : { checkpoint: goal.state.run.checkpoint }),
                ...(goal.state.run.lastStep === undefined
                    ? {}
                    : { previousStep: projectStepRecord(goal.state.run.lastStep) }),
                ...(goal.state.run.pendingAction === undefined
                    ? {}
                    : {
                        pendingAction: projectPendingAction(
                            goal.state.run.pendingAction,
                        ),
                    }),
            },
        };
    }
}

function assertActivePreparation(goal: Goal): PreparationPhase {
    const workflow = goal.state.workflow;

    if (
        workflow.phase === "executing"
        || workflow.preparation.status !== "active"
    ) {
        throw new Error("Preparation request requires an active preparation Goal");
    }

    return workflow.phase;
}

function projectProfile(goal: Goal): ModelProfileView {
    const profile = goal.definition.profile;

    return {
        id: profile.id,
        ...(profile.name === undefined ? {} : { name: profile.name }),
        ...(profile.description === undefined
            ? {}
            : { description: profile.description }),
        systemPrompt: profile.systemPrompt,
        instructions: [...profile.instructions],
    };
}

function projectConversation(
    goal: Goal,
): readonly ModelConversationMessage[] {
    return goal.state.messages.map((message) => message.role === "user"
        ? { role: "user", content: message.content }
        : {
            role: "assistant",
            assistant: { profileId: message.assistant.profileId },
            content: message.content,
        });
}

function projectTools(
    tools: readonly ToolDefinition[],
): readonly ModelToolDefinition[] {
    return tools.map((tool) => ({
        id: tool.id,
        description: tool.description,
        inputSchema: structuredClone(tool.inputSchema),
    }));
}

function projectStepRecord(step: StepRecord): ModelStepRecord {
    return structuredClone(step);
}

function projectPendingAction(
    pendingAction: NonNullable<Goal["state"]["run"]["pendingAction"]>,
): ModelPendingAction {
    return structuredClone(pendingAction);
}