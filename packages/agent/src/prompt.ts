import type { LLMRequest } from "../../llm/src/core/types";
import type { Goal, WorkingMemory } from "../../runtime/src/domain";
import type { ContextLookupResult } from "../../runtime/src/context-retrieval";
import type { ToolDefinition } from "../../runtime/src/tool";
import type { ContextCompactor } from "./context-compactor";
import {
    ConversationContextUnitAdapter,
    flattenContextUnits,
} from "./conversation-context-unit-adapter";
import type { ModelConversationMessage } from "./model-inference-view";
import type { ModelInferenceView } from "./model-inference-view";
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

export type { ModelInferenceView } from "./model-inference-view";
export type { PreparationPhase } from "./model-inference-view";

function project(
    goal: Goal,
    tools: readonly ToolDefinition[] = [],
    workingMemory?: WorkingMemory,
    contextLookupResult?: ContextLookupResult,
): ModelInferenceView {
    return new ModelInferenceProjector().project(
        goal,
        tools,
        workingMemory,
        undefined,
        contextLookupResult,
    );
}

const conversationAdapter = new ConversationContextUnitAdapter();

/** 仅取当前 Epoch 的完整 Conversation 单元；旧 Epoch 仍由 Cold Lookup 提供。 */
function currentEpochConversationUnits(view: ModelInferenceView) {
    return conversationAdapter.adapt(
        view.conversation.slice(view.contextEpoch?.conversationStartIndex ?? 0),
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
    const units = conversationAdapter.adapt(view.conversation);
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
): Promise<LLMRequest> {
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

    return renderFinalRequest(assembled, renderer, modelCapabilities);
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
 * @returns 保持真实消息顺序并附带当前阶段控制消息的请求。
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
): Promise<LLMRequest> {
    const projected = project(
        goal,
        goal.state.workflow.phase === "planning"
            ? tools
            : [],
        workingMemory,
        contextLookupResult,
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

    return renderFinalRequest(assembled, renderer, modelCapabilities);
}

/** 对最终 Renderer 输出执行完整单元回退和硬预算 fail-closed。 */
function renderFinalRequest(
    view: ModelInferenceView,
    renderer: PromptBundleRenderer,
    modelCapabilities?: ModelCapabilities,
): LLMRequest {
    if (modelCapabilities === undefined) {
        return renderRequest(view, renderer);
    }

    const planner = new TokenBudgetPlanner(modelCapabilities);
    const units = currentEpochConversationUnits(view);
    const latest = units.length === 0 ? undefined : units[units.length - 1]!;
    const olderConversation = units.length <= 1 ? [] : units.slice(0, -1);
    const hot = [...(view.trajectoryContext?.hot ?? [])];
    const warm = [...(view.trajectoryContext?.warm ?? [])];
    let conversationPruned = false;

    const render = (): LLMRequest => {
        const conversation = latest === undefined
            ? []
            : flattenContextUnits([
                ...olderConversation,
                latest,
            ]);
        const candidate: ModelInferenceView = {
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
        return renderRequest(candidate, renderer);
    };

    let request = render();
    let measured = planner.measure(request);
    while (measured.hardOverflow && warm.length > 0) {
        warm.shift();
        request = render();
        measured = planner.measure(request);
    }
    while (measured.hardOverflow && olderConversation.length > 0) {
        conversationPruned = true;
        olderConversation.shift();
        request = render();
        measured = planner.measure(request);
    }
    while (measured.hardOverflow && hot.length > 0) {
        hot.shift();
        request = render();
        measured = planner.measure(request);
    }
    if (measured.hardOverflow) {
        throw new ModelContextHardOverflowError();
    }
    return request;
}
