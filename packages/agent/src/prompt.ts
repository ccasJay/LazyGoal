import type { LLMRequest } from "../../llm/src/core/types";
import type { Goal, WorkingMemory } from "../../runtime/src/domain";
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

export type { ModelInferenceView } from "./model-inference-view";
export type { PreparationPhase } from "./model-inference-view";

function project(
    goal: Goal,
    tools: readonly ToolDefinition[] = [],
    workingMemory?: WorkingMemory,
): ModelInferenceView {
    return new ModelInferenceProjector().project(goal, tools, workingMemory);
}

const conversationAdapter = new ConversationContextUnitAdapter();

async function assembleTrajectoryContext(
    goal: Goal,
    view: ModelInferenceView,
    renderer: PromptBundleRenderer,
    signal: AbortSignal | undefined,
    assembler: TrajectoryModelContextAssembler | undefined,
): Promise<ModelInferenceView> {
    if (view.prompt.modelContextProtocol?.kind !== "trajectory-layered") {
        if (view.trajectoryContext !== undefined) {
            throw new ModelContextAssemblyError(
                "conversation model context must omit Trajectory Context",
            );
        }
        return view;
    }

    if (assembler === undefined) {
        throw new ModelContextAssemblyError(
            "trajectory-layered model context requires a Context Assembler",
        );
    }

    const fixedInput = {
        messages: [
            {
                role: "system" as const,
                content: renderer.render(view.prompt),
            },
            ...view.conversation.map((message) => ({
                role: message.role,
                content: message.content,
            })),
            renderWorkingContextMessage(view.workingContext, view.workingMemory),
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
): Promise<LLMRequest> {
    const projected = project(goal, tools, workingMemory);

    if (projected.workingContext.phase !== "executing") {
        throw new Error("Step request requires a running executing Goal");
    }

    const view = await compactConversation(
        projected,
        contextCompactor,
        signal,
    );

    const assembled = await assembleTrajectoryContext(
        goal,
        view,
        renderer,
        signal,
        trajectoryContextAssembler,
    );

    return renderRequest(assembled, renderer);
}

/**
 * 构造 active Preparation Goal 的单轮 LLM 请求。
 *
 * @remarks
 * 生成的 Working Context 是最后一条 user 控制消息，只存在于当前请求，
 * 不会写入 Goal.messages。
 *
 * @param goal - active `gathering_context` 或 `planning` Goal。
 * @param tools - Runtime 已解析的授权 Tool 描述；v2 及以上版本的 planning 会
 *   投影，v1 与 gathering_context 始终忽略该输入。
 * @param renderer - 与 Executor 共享的 Prompt Bundle Renderer。
 * @param contextCompactor - 与执行阶段共享的异步 Conversation 裁剪策略。
 * @param signal - 可选的调用级中止信号，原样传给 Compactor。
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
): Promise<LLMRequest> {
    const projected = project(
        goal,
        goal.definition.promptBundleVersion >= 2
            && goal.state.workflow.phase === "planning"
            ? tools
        : [],
        workingMemory,
    );

    if (projected.workingContext.phase === "executing") {
        throw new Error("Preparation request requires an active preparation Goal");
    }

    const view = await compactConversation(
        projected,
        contextCompactor,
        signal,
    );

    const assembled = await assembleTrajectoryContext(
        goal,
        view,
        renderer,
        signal,
        trajectoryContextAssembler,
    );

    return renderRequest(assembled, renderer);
}
