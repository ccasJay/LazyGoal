import {
    resolveContextRetrievalProtocol,
    resolveMemoryProtocol,
    resolveModelContextProtocol,
    type Goal,
    type ModelContextEpochState,
    type StepRecord,
    type WorkingMemory,
} from "../../runtime/src/domain";
import type { ToolDefinition } from "../../runtime/src/tool";
import type { ContextLookupResult } from "../../runtime/src/context-retrieval";
import type {
    ModelConversationMessage,
    ModelInferenceView,
    ModelWorkingMemory,
    ModelPendingAction,
    ModelProfileView,
    ModelStepRecord,
    ModelToolDefinition,
    ModelWorkingContext,
    ModelMemoryProtocol,
    ModelContextProtocol,
    ModelContextRetrievalProtocol,
    ModelTrajectoryContext,
    ModelContextLookupResult,
    PreparationPhase,
    PromptContext,
} from "./model-inference-view";
import { projectContextLookupResult } from "./context-lookup-projection";
import { compareCodeUnits } from "./prompting/environment";

/**
 * 从 Runtime State 派生 LLM Input View 的单向投影边界。
 *
 * @remarks
 * 只有本模块同时感知 Runtime 领域类型与 View DTO，并负责逐字段复制，保证
 * 两个 View 之间不共享可变对象。它不修改 Goal、不写入消息历史，也不序列化
 * Snapshot；Run 状态字段、Storage schemaVersion 与瞬时执行资源不会被投影。
 * Goal 冻结的 Global System Prompt 版本属于模型契约选择，因此会被复制到 View。
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
     * @param workingMemory - structured@1 的即时 Working Memory 投影。
     * @param trajectoryContext - trajectory-layered@1 的本轮 Hot/Warm 投影；由
     * Assembler 在 Conversation 裁剪后提供。
     * @param contextLookupResult - 上一轮已提交的历史查询结果；只在启用
     * `bm25-lite@1` 时允许提供，且只存在于当前模型调用。
     * @returns 与当前 phase 对应的全新 ModelInferenceView。
     * @throws Goal 当前状态不允许调用模型时抛出 Error。
     */
    project(
        goal: Goal,
        tools: readonly ToolDefinition[] = [],
        workingMemory?: WorkingMemory,
        trajectoryContext?: ModelTrajectoryContext,
        contextLookupResult?: ContextLookupResult,
    ): ModelInferenceView {
        const memoryProtocol = resolveMemoryProtocol(goal.definition);
        const modelContextProtocol = resolveModelContextProtocol(goal.definition);
        const contextRetrievalProtocol = resolveContextRetrievalProtocol(goal.definition);

        if (
            modelContextProtocol.kind === "trajectory-layered"
            && memoryProtocol.kind !== "structured"
        ) {
            throw new Error(
                "trajectory-layered model context requires structured Memory protocol",
            );
        }

        if (
            contextRetrievalProtocol.kind === "bm25-lite"
            && (
                memoryProtocol.kind !== "structured"
                || modelContextProtocol.kind !== "trajectory-layered"
            )
        ) {
            throw new Error(
                "bm25-lite retrieval requires structured Memory and trajectory-layered model context",
            );
        }

        if (memoryProtocol.kind === "structured" && workingMemory === undefined) {
            throw new Error(
                "Structured Memory protocol requires a WorkingMemory projection",
            );
        }

        if (memoryProtocol.kind === "checkpoint" && workingMemory !== undefined) {
            throw new Error(
                "Checkpoint Memory protocol must not receive a WorkingMemory projection",
            );
        }

        if (
            modelContextProtocol.kind === "conversation"
            && trajectoryContext !== undefined
        ) {
            throw new Error(
                "conversation model context must not receive a Trajectory Context projection",
            );
        }

        if (
            trajectoryContext !== undefined
            && trajectoryContext.measuredAs !== "token"
            && trajectoryContext.measuredAs !== "character"
        ) {
            throw new Error("Trajectory Context measurement unit is invalid");
        }

        if (
            contextLookupResult !== undefined
            && contextRetrievalProtocol.kind !== "bm25-lite"
        ) {
            throw new Error(
                "Context Lookup Result requires bm25-lite retrieval",
            );
        }

        const projectedContextLookupResult = contextLookupResult === undefined
            ? undefined
            : projectContextLookupResult(contextLookupResult);

        const workingContext = this.projectWorkingContext(goal);

        const prompt: PromptContext = deepFreeze({
            promptBundleVersion:
                goal.definition.promptBundleVersion,
            phase: workingContext.phase,
            profile: projectProfile(goal),
            authorizedTools: projectTools(tools),
            ...(memoryProtocol.kind === "structured"
                ? { memoryProtocol: projectMemoryProtocol(memoryProtocol) }
                : {}),
            ...(modelContextProtocol.kind === "trajectory-layered"
                ? { modelContextProtocol: projectModelContextProtocol(modelContextProtocol) }
                : {}),
            ...(contextRetrievalProtocol.kind === "bm25-lite"
                ? { contextRetrievalProtocol: projectContextRetrievalProtocol(contextRetrievalProtocol) }
                : {}),
        });

        return {
            prompt,
            conversation: projectConversation(goal),
            workingContext,
            ...(workingMemory === undefined
                ? {}
                : { workingMemory: deepFreeze(projectWorkingMemory(workingMemory)) }),
            ...(trajectoryContext === undefined
                ? {}
                : { trajectoryContext: deepFreeze(structuredClone(trajectoryContext)) }),
            ...(projectedContextLookupResult === undefined
                ? {}
                : { contextLookupResult: projectedContextLookupResult }),
            ...(modelContextProtocol.kind === "trajectory-layered"
                && modelContextProtocol.version === 2
                ? { contextEpoch: projectContextEpoch(goal.state.run.contextEpoch) }
                : {}),
        };
    }

    /**
     * 将已经完成 Conversation 裁剪的基础 View 与本轮分层上下文合并。
     *
     * @remarks
     * 该方法供 Context Assembler 在异步读取 Trajectory 后调用，避免在读取完成前
     * 伪造一个不完整的 `trajectory-layered@1` View。输入 View 和上下文都会被复制
     * 并深冻结，原始 Goal、Working Memory 与 Trajectory 不会被修改。
     *
     * @param view - 已由 {@link project} 产生且完成 Conversation 裁剪的基础 View。
     * @param trajectoryContext - 当前调用选择出的 Hot/Warm 与预算报告。
     * @returns 带分层上下文的新 View。
     * @throws 当 View 不是 `trajectory-layered@1` 时抛出 Error。
     * @example
     * ```ts
     * const assembled = projector.withTrajectoryContext(baseView, context);
     * ```
     */
    withTrajectoryContext(
        view: ModelInferenceView,
        trajectoryContext: ModelTrajectoryContext,
    ): ModelInferenceView {
        if (view.prompt.modelContextProtocol?.kind !== "trajectory-layered") {
            throw new Error(
                "Trajectory Context projection requires trajectory-layered model context",
            );
        }

        const pressureReached = trajectoryContext.budget.fixedInput.count
            >= Math.floor((trajectoryContext.budget.modelInputBudget - trajectoryContext.budget.responseReserve) * 0.85);
        const suppressPressure = view.contextEpoch !== undefined
            && view.contextEpoch.epochNumber > 0
            && view.contextEpoch.conversationStartIndex
                >= Math.max(0, view.conversation.length - 2);
        const contextEpochStatus = suppressPressure
            ? "active" as const
            : pressureReached
                ? "checkpoint_required" as const
                : "active" as const;

        return deepFreeze({
            ...structuredClone(view),
            trajectoryContext: structuredClone(trajectoryContext),
            ...(view.contextEpoch === undefined
                ? {}
                : {
                    contextEpoch: {
                        ...structuredClone(view.contextEpoch),
                        control: {
                            status: contextEpochStatus,
                            ...(contextEpochStatus === "checkpoint_required"
                                ? { reason: "input_threshold" as const }
                                : {}),
                            inputTokens: trajectoryContext.budget.fixedInput.count,
                            hardInputLimit: trajectoryContext.budget.modelInputBudget - trajectoryContext.budget.responseReserve,
                            remainingTokens: Math.max(0, trajectoryContext.budget.modelInputBudget - trajectoryContext.budget.responseReserve - trajectoryContext.budget.fixedInput.count),
                        },
                    },
                }),
        });
    }

    /**
     * 将 Runtime Lookup Result 投影为带历史时效边界的模型 DTO。
     *
     * @param result - 当前调用级的 Context Lookup Result。
     * @returns 不共享输入、可安全交给模型渲染的结果投影。
     * @throws ContextLookupProtocolError 当 Result 不符合有界协议时。
     * @example
     * ```ts
     * const modelResult = projector.projectContextLookupResult(result);
     * ```
     */
    projectContextLookupResult(
        result: ContextLookupResult,
    ): ModelContextLookupResult {
        return projectContextLookupResult(result);
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

function projectContextEpoch(
    epoch: ModelContextEpochState | undefined,
): import("./model-inference-view").ModelContextEpochView {
    const state = epoch ?? {
        version: 1 as const,
        number: 0,
        conversationStartIndex: 0,
        openedAtSequence: 0,
    };
    if (
        state.version !== 1
        || !Number.isSafeInteger(state.number)
        || state.number < 0
        || !Number.isSafeInteger(state.conversationStartIndex)
        || state.conversationStartIndex < 0
        || !Number.isSafeInteger(state.openedAtSequence)
        || state.openedAtSequence < 0
    ) {
        throw new Error("Invalid Model Context Epoch state");
    }
    return deepFreeze({
        protocolVersion: 1 as const,
        epochNumber: state.number,
        conversationStartIndex: state.conversationStartIndex,
        openedAtSequence: state.openedAtSequence,
        control: {
            status: "active" as const,
            inputTokens: 0,
            hardInputLimit: 0,
            remainingTokens: 0,
        },
    });
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
    const seen = new Set<string>();
    const projected = tools.map((tool) => {
        if (seen.has(tool.id)) {
            throw new Error(`重复的 Tool ID：${tool.id}`);
        }

        seen.add(tool.id);

        return {
            id: tool.id,
            description: tool.description,
            inputSchema: structuredClone(tool.inputSchema),
        };
    });

    projected.sort((a, b) => compareCodeUnits(a.id, b.id));

    return projected;
}

/**
 * 递归冻结对象与数组，使 PromptContext 在运行时不可变。
 *
 * @remarks
 * 只作用于从 Runtime 投影出的 DTO，不修改原始 Goal。冻结后任何修改尝试在严格
 * 模式下都会抛出，从而保证 Renderer 只读取 PromptContext、不改变模型输入。
 */
function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === "object") {
        Object.freeze(value);

        for (const key of Object.keys(value)) {
            deepFreeze((value as Record<string, unknown>)[key]);
        }
    }

    return value;
}

function projectStepRecord(step: StepRecord): ModelStepRecord {
    return structuredClone(step);
}

function projectPendingAction(
    pendingAction: NonNullable<Goal["state"]["run"]["pendingAction"]>,
): ModelPendingAction {
    return structuredClone(pendingAction);
}

function projectMemoryProtocol(
    protocol: ReturnType<typeof resolveMemoryProtocol>,
): ModelMemoryProtocol {
    return {
        kind: protocol.kind,
        version: protocol.version,
    };
}

function projectModelContextProtocol(
    protocol: ReturnType<typeof resolveModelContextProtocol>,
): ModelContextProtocol {
    return protocol as ModelContextProtocol;
}

function projectContextRetrievalProtocol(
    protocol: ReturnType<typeof resolveContextRetrievalProtocol>,
): ModelContextRetrievalProtocol {
    return protocol as ModelContextRetrievalProtocol;
}

function projectWorkingMemory(
    memory: WorkingMemory,
): ModelWorkingMemory {
    return structuredClone(memory);
}
