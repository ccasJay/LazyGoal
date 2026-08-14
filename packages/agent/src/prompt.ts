import type { LLMMessage, LLMRequest } from "../../llm/src/core/types";
import type { Goal, GoalMessage } from "../../runtime/src/domain";

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

function buildSystemContent(goal: Goal): string {
    const instructions = goal.profile.instructions.length === 0
        ? "（无额外指令）"
        : goal.profile.instructions
            .map((instruction, index) => `${index + 1}. ${instruction}`)
            .join("\n");

    return [
        goal.profile.systemPrompt,
        `Instructions:\n${instructions}`,
        STEP_RESULT_PROTOCOL,
    ].join("\n\n");
}

function buildUserContent(goal: Goal): string {
    const context: {
        readonly objective: string;
        readonly completionCriteria: readonly string[];
        readonly stepCount: number;
        readonly lastResult?: Goal["run"]["lastResult"];
    } = {
        objective: goal.task.objective,
        completionCriteria: [...goal.task.completionCriteria],
        stepCount: goal.run.stepCount,
        ...(goal.run.lastResult === undefined
            ? {}
            : { lastResult: goal.run.lastResult }),
    };

    return JSON.stringify(context, null, 2);
}

/**
 * 构造本轮实际发送给模型的 user message。
 * 该消息不写入 Goal，只有 Executor 成功解析响应后才会追加到快照。
 */
export function buildStepUserMessage(goal: Goal): GoalMessage {
    return {
        role: "user",
        content: buildUserContent(goal),
    };
}

/**
 * 将一个完整 Goal 快照转换为本轮 LLM 请求。
 * 该函数只读取状态并生成新字符串，不保存状态、不追加历史。
 */
export function buildStepRequest(goal: Goal): LLMRequest {
    const currentUserMessage = buildStepUserMessage(goal);
    const messages: LLMMessage[] = [
        {
            role: "system",
            content: buildSystemContent(goal),
        },
        ...goal.messages.map((message) => ({
            role: message.role,
            content: message.content,
        })),
        {
            role: currentUserMessage.role,
            content: currentUserMessage.content,
        },
    ];

    return { messages };
}
