import type { LLMMessage, LLMRequest } from "../../llm/src/core/types";
import type {
    LegacyRunState,
    RunState,
} from "../../runtime/src/domain";

/**
 * 约束模型只返回可被 StepResultSchema 验证的单个 JSON 对象。
 * 后续的解析器会把同一协议落成运行时 schema。
 */
export const STEP_RESULT_PROTOCOL = [
    "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
    '允许的形状为 {"kind":"continue","summary":"非空文本"}、',
    '{"kind":"wait","reason":"非空文本"}、',
    '{"kind":"complete","summary":"非空文本"} 或 {"kind":"fail","error":"非空文本"}。',
    "kind 必须与对应字段匹配，字段值必须是非空字符串。",
].join("\n");

function requireLegacyRunState(state: RunState): LegacyRunState {
    if (!("goal" in state) || !("profile" in state)) {
        throw new Error(
            "LLM prompt requires the pre-GoalStore RunState context",
        );
    }

    return state as LegacyRunState;
}

function buildSystemContent(state: RunState): string {
    const legacyState = requireLegacyRunState(state);
    const instructions = legacyState.profile.instructions.length === 0
        ? "（无额外指令）"
        : legacyState.profile.instructions
            .map((instruction, index) => `${index + 1}. ${instruction}`)
            .join("\n");

    return [
        legacyState.profile.systemPrompt,
        `Instructions:\n${instructions}`,
        STEP_RESULT_PROTOCOL,
    ].join("\n\n");
}

function buildUserContent(state: RunState): string {
    const legacyState = requireLegacyRunState(state);
    const context: {
        readonly objective: string;
        readonly completionCriteria: readonly string[];
        readonly stepCount: number;
        readonly lastResult?: RunState["lastResult"];
    } = {
        objective: legacyState.goal.objective,
        completionCriteria: [...legacyState.goal.completionCriteria],
        stepCount: state.stepCount,
        ...(state.lastResult === undefined ? {} : { lastResult: state.lastResult }),
    };

    return JSON.stringify(context, null, 2);
}

/**
 * 将一个 Run 快照转换为本轮 LLM 请求。
 * 该函数只读取状态并生成新字符串，不保存状态、不追加历史。
 */
export function buildStepRequest(state: RunState): LLMRequest {
    const messages: LLMMessage[] = [
        {
            role: "system",
            content: buildSystemContent(state),
        },
        {
            role: "user",
            content: buildUserContent(state),
        },
    ];

    return { messages };
}
