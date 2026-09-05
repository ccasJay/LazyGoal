import type { LLMRequest, StructuredOutputMode } from "../../llm/src/core/types";
import type { Goal, WorkingMemory } from "../../runtime/src/domain";
import type { ContextLookupResult } from "../../runtime/src/context-retrieval";
import type { ToolDefinition } from "../../runtime/src/tool";
import type { ContextCompactor } from "./context-compactor";
import {
    ConversationContextUnitAdapter,
    flattenContextUnits,
} from "./conversation-context-unit-adapter";
import type {
    ModelConversationMessage,
    ModelInferenceView,
    ModelPreparationInputEvidence,
} from "./model-inference-view";
import { ModelInferenceProjector } from "./model-inference-projector";
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
    AuthorizedToolContract,
    ModelOutputContractBundle,
    PreparationResult,
} from "../../contracts/src/index";
import {
    createModelOutputContractBundle,
} from "../../contracts/src/index";

export type { ModelInferenceView } from "./model-inference-view";
export type { PreparationPhase } from "./model-inference-view";
export type { StructuredOutputMode } from "../../llm/src/core/types";

/**
 * 绑定单轮 LLM 请求与对应响应解析契约包的请求计划。
 *
 * @remarks
 * 请求计划成对提供渲染后的 {@link LLMRequest} 与专门用于解析其响应的 {@link ModelOutputContractBundle}，
 * 确保阶段分支、已授权工具以及 Context Checkpoint 在请求与解析两端保持绝对一致。
 *
 * @example
 * ```ts
 * const plan = await buildStepRequest(goal, tools, renderer, compactor);
 * const response = await adapter.generate(plan.request);
 * const decision = parseModelOutput(response.content, plan.bundle);
 * ```
 */
export interface ModelOutputRequestPlan<Result = PreparationResult | AgentDecision> {
    /** 渲染完成且计入预算的单轮 LLM 请求。 */
    readonly request: LLMRequest;
    /** 专门用于解析该响应的契约包。 */
    readonly bundle: ModelOutputContractBundle<Result>;
}

function project(
    goal: Goal,
    tools: readonly ToolDefinition[] = [],
    workingMemory?: WorkingMemory,
    contextLookupResult?: ContextLookupResult,
    preparationInputEvidence?: readonly ModelPreparationInputEvidence[],
): ModelInferenceView {
    return new ModelInferenceProjector().project(
        goal,
        tools,
        workingMemory,
        undefined,
        contextLookupResult,
        preparationInputEvidence,
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
): Promise<ModelInferenceView> {
    if (assembler === undefined) {
        throw new ModelContextAssemblyError(
            "trajectory-layered model context requires a Context Assembler",
        );
    }

    const fixedInputConversation = latestEpochConversation(view);
    const fixedInput = {
        messages: [
            {
                role: "system" as const,
                content: renderer.render(view.prompt),
            },
            ...fixedInputConversation.map((message) => ({
                role: message.role,
                content: message.content,
            })),
            renderWorkingContextMessage(
                view.workingContext,
                view.workingMemory,
                undefined,
                view.contextLookupResult,
                view.contextEpoch,
            ),
        ],
    };

    return assembler.assemble({
        goal,
        view,
        fixedInput,
        ...(signal === undefined ? {} : { control: { signal } }),
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
 * @returns 完成上下文裁剪与渲染后的单轮 LLM 请求。
 * @throws Goal 不处于 running executing 阶段时抛出；渲染失败同样在调用前抛出。
 */
export async function buildStepRequest(
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
): Promise<ModelOutputRequestPlan<AgentDecision>> {
    const projected = project(
        goal,
        tools,
        workingMemory,
        contextLookupResult,
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
    );

    const isInitialCheckpoint = assembled.contextEpoch?.control.status === "checkpoint_required";
    const initialBundle = isInitialCheckpoint
        ? (createModelOutputContractBundle({ kind: "checkpoint" }) as unknown as ModelOutputContractBundle<AgentDecision>)
        : (createModelOutputContractBundle({
            kind: "executing",
            authorizedTools: tools.map((t) => ({ id: t.id, inputContract: t.inputContract })),
        }) as unknown as ModelOutputContractBundle<AgentDecision>);

    return renderFinalRequest(assembled, renderer, initialBundle, modelCapabilities, structuredOutputMode);
}

/**
 * 构造 active Preparation Goal 的单轮 LLM 请求。
 *
 * @remarks
 * 生成的 Working Context 是最后一条 user 控制消息，只存在于当前请求，
 * 不会写入 Goal.messages。
 *
 * @param goal - active `gathering_context` 或 `planning` Goal。
 * @param tools - Runtime 已解析的授权 Tool 描述；当前 planning 阶段会投影，
 *   gathering_context 始终忽略该输入。
 * @param renderer - 与 Executor 共享的 Prompt Bundle Renderer。
 * @param contextCompactor - 与执行阶段共享的异步 Conversation 裁剪策略。
 * @param signal - 可选的调用级中止信号，原样传给 Compactor。
 * @param workingMemory - structured@1 的即时 Working Memory。
 * @param trajectoryContextAssembler - trajectory-layered@1 的本轮上下文组装器。
 * @param contextLookupResult - 上一轮已提交的历史 Lookup 结果；只存在于当前调用。
 * @param modelCapabilities - 模型能力配置。
 * @param preparationInputEvidence - 已提交 Preparation 用户输入的 hash-only provenance；
 *   只在 Preparation 请求中传递。
 * @param structuredOutputMode - 结构化输出模式。
 * @returns 保持真实消息顺序并附带当前阶段控制消息的请求计划。
 * @throws Goal 不处于 active Preparation 阶段时抛出；渲染失败同样在调用前抛出。
 */
export async function buildPreparationRequest(
    goal: Goal,
    tools: readonly ToolDefinition[],
    renderer: PromptBundleRenderer,
    contextCompactor: ContextCompactor<ModelConversationMessage>,
    signal?: AbortSignal,
    workingMemory?: WorkingMemory,
    trajectoryContextAssembler?: TrajectoryModelContextAssembler,
    contextLookupResult?: ContextLookupResult,
    modelCapabilities?: ModelCapabilities,
    preparationInputEvidence?: readonly ModelPreparationInputEvidence[],
    structuredOutputMode: StructuredOutputMode = "strict",
): Promise<ModelOutputRequestPlan<PreparationResult>> {
    const projected = project(
        goal,
        goal.state.workflow.phase === "planning"
            ? tools
            : [],
        workingMemory,
        contextLookupResult,
        preparationInputEvidence,
    );

    if (projected.workingContext.phase === "executing") {
        throw new Error("Preparation request requires an active preparation Goal");
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
    );

    const isInitialCheckpoint = assembled.contextEpoch?.control.status === "checkpoint_required";
    const initialBundle = isInitialCheckpoint
        ? (createModelOutputContractBundle({ kind: "checkpoint" }) as unknown as ModelOutputContractBundle<PreparationResult>)
        : (createModelOutputContractBundle({
            kind: goal.state.workflow.phase === "gathering_context" ? "gathering" : "planning",
        }) as unknown as ModelOutputContractBundle<PreparationResult>);

    return renderFinalRequest(assembled, renderer, initialBundle, modelCapabilities, structuredOutputMode);
}

/** 对最终 Renderer 输出执行完整单元回退和硬预算 fail-closed。 */
function renderFinalRequest<Result extends PreparationResult | AgentDecision>(
    view: ModelInferenceView,
    renderer: PromptBundleRenderer,
    initialBundle: ModelOutputContractBundle<Result>,
    modelCapabilities?: ModelCapabilities,
    structuredOutputMode: StructuredOutputMode = "strict",
): ModelOutputRequestPlan<Result> {
    let currentBundle = initialBundle;

    const render = (
        targetView: ModelInferenceView,
        bundle: ModelOutputContractBundle<Result>,
    ): LLMRequest => {
        const shapeGuide = structuredOutputMode === "prompt_only"
            ? bundle.shapeGuide
            : undefined;
        return renderRequest(targetView, renderer, shapeGuide);
    };

    const finalizePlan = (
        req: LLMRequest,
        bundle: ModelOutputContractBundle<Result>,
    ): ModelOutputRequestPlan<Result> => ({
        request: structuredOutputMode === "strict"
            ? {
                ...req,
                structuredOutput: {
                    name: bundle.name,
                    schema: bundle.jsonSchema,
                },
            }
            : req,
        bundle,
    });

    if (modelCapabilities === undefined) {
        return finalizePlan(render(view, currentBundle), currentBundle);
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

    return finalizePlan(request, currentBundle);
}
