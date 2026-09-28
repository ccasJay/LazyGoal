import type { LLMMessage, LLMRequest, StructuredOutputMode } from "../../llm/src/core/types";
import type { Goal, WorkingMemory } from "../../runtime/src/domain";
import type { ModelContextFramePayload } from "../../runtime/src/index";
import type { ContextLookupResult } from "../../runtime/src/context-retrieval";
import type { RuntimeFeedback } from "../../runtime/src/runtime-feedback";
import type { ToolDefinition } from "../../runtime/src/tool";
import type { ContextCompactor } from "./context-compactor";
import {
    ConversationContextUnitAdapter,
    flattenContextUnits,
} from "./conversation-context-unit-adapter";
import type {
    ModelConversationMessage,
    ModelInferenceView,
    PromptStage,
} from "./model-inference-view";
import { ModelInferenceProjector } from "./model-inference-projector";
import {
    planDynamicSectionUpdates,
    type DynamicSectionUpdatePlan,
} from "./prompting/dynamic-section-diff";
import type { PromptBundleRenderer } from "./prompting/types";
import { renderRequest, renderWorkingContextMessage } from "./render";
import {
    ModelContextAssemblyError,
    type TrajectoryModelContextAssembler,
} from "./trajectory-model-context-assembler";
import {
    TokenBudgetPlanner,
    type ModelCapabilities,
} from "./model-context-budget";
import { ModelContextHardOverflowError } from "./context-selector";

import type {
    AgentDecision,
    DecideOutput,
    AuthorizedToolContract,
    ModelOutputContractBundle,
    SystemToolDeclaration,
} from "../../contracts/src/index";
import {
    createCheckpointToolDeclarations,
    createExecutingToolDeclarations,
    createUnifiedToolDeclarations,
    createModelOutputContractBundle,
} from "../../contracts/src/index";

export type { ModelInferenceView } from "./model-inference-view";
export type { StructuredOutputMode } from "../../llm/src/core/types";

/**
 * 构造 Decide/Think 请求时使用的阶段输入。
 *
 * @remarks
 * Think 历史由 Runtime 提供，作为临时 user/assistant 消息加入当前请求；它不会写入真实
 * Conversation。Think 目标只在 Think 阶段必需。
 *
 * @example
 * ```ts
 * const stageContext: StepPromptStageContext = {
 *     allowThink: true,
 *     thinkHistory: [],
 * };
 * ```
 */
export interface StepPromptStageContext {
    /** Decide 阶段是否可返回 request_think 控制分支。 */
    readonly allowThink?: boolean;
    /** 当前 Step 已提交的 Think 目标与输出。 */
    readonly thinkHistory?: readonly Readonly<{ goal: string; output: string }>[];
    /** Think 阶段本次必须解决的明确目标。 */
    readonly thinkGoal?: string;
    /** Runner 提供的当前阶段修复反馈；只作为标记为 runtime_feedback 的临时消息。 */
    readonly runtimeFeedback?: RuntimeFeedback;
}

function createStageMessages(
    stage: PromptStage,
    context: StepPromptStageContext | undefined,
): readonly LLMMessage[] {
    const messages: LLMMessage[] = [];
    for (const exchange of context?.thinkHistory ?? []) {
        messages.push({
            role: "user",
            content: JSON.stringify({
                source: "runtime_think_request",
                goal: exchange.goal,
            }),
        });
        messages.push({ role: "assistant", content: exchange.output });
    }
    if (stage === "think") {
        const goal = context?.thinkGoal?.trim();
        if (goal === undefined || goal.length === 0) {
            throw new Error("Think stage requires a non-blank thinkGoal");
        }
        messages.push({
            role: "user",
            content: JSON.stringify({ source: "runtime_think_request", goal }),
        });
    }
    if (context?.runtimeFeedback !== undefined) {
        messages.push({
            role: "user",
            content: JSON.stringify({
                source: "runtime_feedback",
                stage: context.runtimeFeedback.stage,
                origin: context.runtimeFeedback.origin,
                code: context.runtimeFeedback.code,
                attempt: context.runtimeFeedback.attempt,
                issues: context.runtimeFeedback.issues,
                ...(context.runtimeFeedback.constraints === undefined
                    ? {}
                    : { constraints: context.runtimeFeedback.constraints }),
                instruction: "Correct the previous response for the listed issues. Follow the existing response contract and constraints. Do not treat this feedback as a new user request.",
            }),
        });
    }
    return messages;
}

/**
 * 绑定单轮 LLM 请求与对应响应解析契约包的请求计划。
 *
 * @remarks
 * 请求计划成对提供渲染后的 {@link LLMRequest} 与专门用于解析其响应的 {@link ModelOutputContractBundle}，
 * 确保已授权工具以及 Context Checkpoint 在请求与解析两端保持绝对一致。
 *
 * @example
 * ```ts
 * const plan = await buildStepRequest(goal, tools, renderer, compactor);
 * const response = await adapter.generate(plan.request);
 * const decision = parseModelOutput(response.content, plan.bundle);
 * ```
 */
export interface ModelOutputRequestPlan<Result = AgentDecision> {
    /** 渲染完成且计入预算的单轮 LLM 请求。 */
    readonly request: LLMRequest;
    /** 专门用于解析该响应的契约包。 */
    readonly bundle: ModelOutputContractBundle<Result>;
    /** 与请求中 `tools` 完全一致、用于解码原生工具调用的声明集合。 */
    readonly toolDeclarations: readonly SystemToolDeclaration<unknown>[];
    /** 本次实际请求的阶段与新 Section 更新；仅在模型响应成功后随 Snapshot 一起提交。 */
    readonly modelContextFrame: Omit<ModelContextFramePayload, "type">;
}

function project(
    goal: Goal,
    tools: readonly ToolDefinition[] = [],
    workingMemory?: WorkingMemory,
    contextLookupResult?: ContextLookupResult,
    stage: PromptStage = "decide",
): ModelInferenceView {
    return new ModelInferenceProjector().project(
        goal,
        tools,
        workingMemory,
        undefined,
        contextLookupResult,
        stage,
    );
}

const conversationAdapter = new ConversationContextUnitAdapter();

/** 仅取当前 Epoch 的完整 Conversation 单元；旧 Epoch 仍由 Cold Lookup 提供。 */
function currentEpochConversationUnits(view: ModelInferenceView) {
    const start = view.contextEpoch?.conversationStartIndex ?? 0;
    return conversationAdapter.adapt(
        view.conversation.filter((message) => message.sourceMessageIndex >= start),
    );
}

/** 为 Assembler 的压力计算保留最新完整 Conversation，避免旧消息阻塞 Epoch 检查点。 */
function latestEpochConversation(view: ModelInferenceView): readonly ModelConversationMessage[] {
    const units = currentEpochConversationUnits(view);
    return units.length === 0
        ? []
        : [...units[units.length - 1]!.items];
}

async function assembleTrajectoryContext(
    goal: Goal,
    view: ModelInferenceView,
    renderer: PromptBundleRenderer,
    signal: AbortSignal | undefined,
    assembler: TrajectoryModelContextAssembler | undefined,
    stageMessages: readonly LLMMessage[],
): Promise<Readonly<{
    view: ModelInferenceView;
    sectionFrames: readonly ModelContextFramePayload[];
}>> {
    if (assembler === undefined) {
        throw new ModelContextAssemblyError(
            "trajectory-layered model context requires a Context Assembler",
        );
    }

    const fixedInputConversation = latestEpochConversation(view);
    return assembler.assembleForPrompt({
        goal,
        view,
        sectionIdentities: renderer.dynamicSectionIdentities(),
        ...(signal === undefined ? {} : { control: { signal } }),
    }, (frames) => {
        const sectionPlan = planDynamicSectionUpdates(
            renderer.dynamicSectionIdentities(),
            renderer.renderDynamicSections(view),
            frames,
        );
        return {
            messages: [
                {
                    role: "system" as const,
                    content: renderer.render(view.prompt),
                },
                ...fixedInputConversation.map((message) => ({
                    role: message.role,
                    content: message.content,
                })),
                ...stageMessages,
                ...sectionPlan.requestMessages.map((message) => ({
                    role: message.role,
                    content: message.content,
                })),
                renderWorkingContextMessage(
                    view.workingContext,
                    undefined,
                    view.contextLookupResult,
                    view.contextEpoch,
                    undefined,
                ),
            ],
        };
    });
}

async function compactConversation(
    view: ModelInferenceView,
    contextCompactor: ContextCompactor<ModelConversationMessage>,
    signal?: AbortSignal,
): Promise<ModelInferenceView> {
    const units = currentEpochConversationUnits(view);
    const compacted = await contextCompactor.compact(units, signal);

    return {
        ...view,
        conversation: flattenContextUnits(compacted),
    };
}

/**
 * 将一个完整 Goal 快照转换为本轮 LLM 请求。
 * 该函数只读取状态并生成新字符串，不保存状态、不追加历史。
 *
 * @param goal - 当前 running executing Goal。
 * @param tools - 当前 Profile 已授权且由 Runtime 解析出的 Tool 描述。
 * @param renderer - 与 Executor 共享的 Prompt Bundle Renderer。
 * @param contextCompactor - 与其它阶段共享的异步 Conversation 裁剪策略。
 * @param signal - 可选的调用级中止信号，原样传给 Compactor。
 * @param workingMemory - structured@1 的即时 Working Memory。
 * @param trajectoryContextAssembler - trajectory-layered@1 的本轮上下文组装器。
 * @param contextLookupResult - 上一轮已提交的历史 Lookup 结果；只存在于当前调用。
 * @param modelCapabilities - 可选模型上下文预算能力。
 * @param structuredOutputMode - Decide 当前使用 strict 或 prompt_only 响应约束。
 * @param stage - 当前请求属于 Decide 还是 Think；省略时使用 Decide。
 * @param stageContext - Think 目标、已提交 Think 历史或 Decide 的 Think 控制开关。
 * @returns 完成上下文裁剪与渲染后的单轮 LLM 请求。
 * @throws Goal 不处于 running executing 阶段时抛出；渲染失败同样在调用前抛出。
 */
export async function buildStepRequest<Result extends DecideOutput = AgentDecision>(
    goal: Goal,
    tools: readonly ToolDefinition[] = [],
    renderer: PromptBundleRenderer,
    contextCompactor: ContextCompactor<ModelConversationMessage>,
    signal?: AbortSignal,
    workingMemory?: WorkingMemory,
    trajectoryContextAssembler?: TrajectoryModelContextAssembler,
    contextLookupResult?: ContextLookupResult,
    modelCapabilities?: ModelCapabilities,
    structuredOutputMode: StructuredOutputMode = "strict",
    stage: PromptStage = "decide",
    stageContext?: StepPromptStageContext,
): Promise<ModelOutputRequestPlan<Result>> {
    const stageMessages = createStageMessages(stage, stageContext);
    const projected = project(
        goal,
        tools,
        workingMemory,
        contextLookupResult,
        stage,
    );

    if (projected.workingContext.phase !== "executing") {
        throw new Error("Step request requires a running executing Goal");
    }

    const view = modelCapabilities === undefined
        ? await compactConversation(projected, contextCompactor, signal)
        : projected;

    const assembled = await assembleTrajectoryContext(
        goal,
        view,
        renderer,
        signal,
        trajectoryContextAssembler,
        stageMessages,
    );

    const isInitialCheckpoint = assembled.view.contextEpoch?.control.status === "checkpoint_required";
    const taskPresent = !isInitialCheckpoint && goal.state.run.approvedTask !== undefined;
    const planMode = !isInitialCheckpoint && goal.state.run.mode === "plan";
    const goalPlanWritable = !isInitialCheckpoint && assembled.view.dynamicContext.goalPlanWritable;
    const authorizedToolContracts = tools.map((t) => ({
        id: t.id,
        inputContract: t.inputContract,
        isReadOnly: t.isReadOnly,
    }));

    const initialBundle = isInitialCheckpoint
        ? (createModelOutputContractBundle({ kind: "checkpoint" }) as unknown as ModelOutputContractBundle<Result>)
        : (createModelOutputContractBundle<Result>({
            kind: "executing",
            authorizedTools: authorizedToolContracts,
            taskPresent,
            planMode,
            goalPlanWritable,
            allowThink: stage === "decide" && stageContext?.allowThink === true,
        }) as unknown as ModelOutputContractBundle<Result>);

    const toolDeclarations = isInitialCheckpoint
        ? createCheckpointToolDeclarations()
        : stage === "think"
            ? []
        : createUnifiedToolDeclarations(
            authorizedToolContracts,
            taskPresent,
            planMode,
            goalPlanWritable,
            stage === "decide" && stageContext?.allowThink === true,
        );

    return renderFinalRequest(
        assembled.view,
        renderer,
        initialBundle,
        toolDeclarations,
        modelCapabilities,
        structuredOutputMode,
        assembled.sectionFrames,
        goal.state.messages.length,
        stageMessages,
        stage,
    );
}

/** 对最终 Renderer 输出执行完整单元回退和硬预算 fail-closed。 */
function renderFinalRequest<Result = AgentDecision>(
    view: ModelInferenceView,
    renderer: PromptBundleRenderer,
    initialBundle: ModelOutputContractBundle<Result>,
    initialToolDeclarations: readonly SystemToolDeclaration<unknown>[],
    modelCapabilities?: ModelCapabilities,
    structuredOutputMode: StructuredOutputMode = "strict",
    baselineFrames: readonly ModelContextFramePayload[] = [],
    conversationPosition = view.conversation.length,
    stageMessages: readonly LLMMessage[] = [],
    stage: PromptStage = view.prompt.stage,
): ModelOutputRequestPlan<Result> {
    let currentBundle = initialBundle;
    let currentToolDeclarations = initialToolDeclarations;
    let sectionPlan: DynamicSectionUpdatePlan;

    const render = (
        targetView: ModelInferenceView,
        bundle: ModelOutputContractBundle<Result>,
    ): LLMRequest => {
        sectionPlan = planDynamicSectionUpdates(
            renderer.dynamicSectionIdentities(),
            renderer.renderDynamicSections(targetView),
            baselineFrames,
        );
        const shapeGuide = stage === "decide" && structuredOutputMode === "prompt_only"
            ? bundle.shapeGuide
            : undefined;
        const request = renderRequest(
            targetView,
            renderer,
            shapeGuide,
            sectionPlan.requestMessages,
            stageMessages,
        );
        return {
            ...request,
            ...(stage === "decide" && currentToolDeclarations.length > 0
                ? {
                    tools: currentToolDeclarations.map((declaration) => ({
                        id: declaration.id,
                        description: declaration.description,
                        parametersSchema: declaration.parametersSchema,
                    })),
                    toolChoice: "required" as const,
                }
                : {}),
            ...(stage === "decide" && structuredOutputMode === "strict"
                ? {
                    structuredOutput: {
                        name: bundle.name,
                        schema: bundle.jsonSchema,
                    },
                }
                : {}),
        };
    };

    const finalizePlan = (
        req: LLMRequest,
        bundle: ModelOutputContractBundle<Result>,
        toolDeclarations: readonly SystemToolDeclaration<unknown>[],
        targetView: ModelInferenceView,
    ): ModelOutputRequestPlan<Result> => ({
        request: req,
        bundle,
        toolDeclarations,
        modelContextFrame: {
            stage: targetView.prompt.stage,
            epochNumber: targetView.contextEpoch.epochNumber,
            conversationPosition,
            sections: sectionPlan.frameSections,
        },
    });

    if (modelCapabilities === undefined) {
        return finalizePlan(
            render(view, currentBundle),
            currentBundle,
            currentToolDeclarations,
            view,
        );
    }

    const planner = new TokenBudgetPlanner(modelCapabilities);
    const units = currentEpochConversationUnits(view);
    const latest = units.length === 0 ? undefined : units[units.length - 1]!;
    const olderConversation = units.length <= 1 ? [] : units.slice(0, -1);
    const hot = [...(view.trajectoryContext?.hot ?? [])];
    const warm = [...(view.trajectoryContext?.warm ?? [])];
    let conversationPruned = false;

    const buildCandidateView = (): ModelInferenceView => {
        const conversation = latest === undefined
            ? []
            : flattenContextUnits([
                ...olderConversation,
                latest,
            ]);
        return {
            ...structuredClone(view),
            conversation,
            ...(view.trajectoryContext === undefined
                ? {}
                : {
                    trajectoryContext: {
                        ...structuredClone(view.trajectoryContext),
                        hot: [...hot],
                        warm: [...warm],
                    },
                }),
            ...(view.contextEpoch === undefined || !conversationPruned
                ? {}
                : {
                    contextEpoch: {
                        ...structuredClone(view.contextEpoch),
                        control: {
                            ...structuredClone(view.contextEpoch.control),
                            status: "checkpoint_required" as const,
                            reason: "conversation_pruned" as const,
                        },
                    },
                }),
        };
    };

    let request = render(buildCandidateView(), currentBundle);
    let measured = planner.measure(request);

    while (measured.hardOverflow && warm.length > 0) {
        warm.shift();
        request = render(buildCandidateView(), currentBundle);
        measured = planner.measure(request);
    }

    while (measured.hardOverflow && olderConversation.length > 0) {
        conversationPruned = true;
        olderConversation.shift();
        currentBundle = createModelOutputContractBundle({
            kind: "checkpoint",
        }) as unknown as ModelOutputContractBundle<Result>;
        currentToolDeclarations = createCheckpointToolDeclarations();
        request = render(buildCandidateView(), currentBundle);
        measured = planner.measure(request);
    }

    while (measured.hardOverflow && hot.length > 0) {
        hot.shift();
        request = render(buildCandidateView(), currentBundle);
        measured = planner.measure(request);
    }

    if (measured.hardOverflow) {
        throw new ModelContextHardOverflowError();
    }

    return finalizePlan(request, currentBundle, currentToolDeclarations, buildCandidateView());
}
