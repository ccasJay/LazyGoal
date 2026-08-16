import type { LLMMessage, LLMRequest } from "../../llm/src/core/types";
import type { Goal, GoalMessage } from "../../runtime/src/domain";
import type { PreparationPhase } from "./response-schema";

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

/** Preparation 阶段对应的严格输出协议。 */
export const PREPARATION_RESULT_PROTOCOL: Readonly<
    Record<PreparationPhase, string>
> = {
    gathering_context: [
        "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
        '允许的形状为 {"kind":"question","question":"非空文本"} 或',
        '{"kind":"context_ready"}。',
        "不要返回任务提案或执行结果。",
    ].join("\n"),
    planning: [
        "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
        '唯一允许的形状为 {"kind":"task_proposal","task":',
        '{"objective":"非空文本","completionCriteria":["非空文本"]},',
        '"approvalRequest":"非空文本"}。',
        "不要返回问题、context_ready 或执行结果。",
    ].join("\n"),
};

function buildProfileSystemContent(goal: Goal, protocol: string): string {
    const instructions = goal.definition.profile.instructions.length === 0
        ? "（无额外指令）"
        : goal.definition.profile.instructions
            .map((instruction, index) => `${index + 1}. ${instruction}`)
            .join("\n");

    return [
        goal.definition.profile.systemPrompt,
        `Instructions:\n${instructions}`,
        protocol,
    ].join("\n\n");
}

function buildSystemContent(goal: Goal): string {
    return buildProfileSystemContent(goal, STEP_RESULT_PROTOCOL);
}

function buildPreparationSystemContent(
    goal: Goal,
    phase: PreparationPhase,
): string {
    return buildProfileSystemContent(
        goal,
        PREPARATION_RESULT_PROTOCOL[phase],
    );
}

function getActivePreparationPhase(goal: Goal): PreparationPhase {
    const workflow = goal.state.workflow;

    if (
        workflow.phase === "executing"
        || workflow.preparation.status !== "active"
    ) {
        throw new Error("Preparation request requires an active preparation Goal");
    }

    return workflow.phase;
}

function buildUserContent(goal: Goal): string {
    if (goal.state.workflow.phase !== "executing") {
        throw new Error("Step request requires an executing Goal");
    }

    const context: {
        readonly objective: string;
        readonly completionCriteria: readonly string[];
        readonly stepCount: number;
        readonly lastResult?: NonNullable<
            Goal["state"]["run"]["lastStep"]
        >["result"];
    } = {
        objective: goal.state.workflow.task.objective,
        completionCriteria: [...goal.state.workflow.task.completionCriteria],
        stepCount: goal.state.run.stepCount,
        ...(goal.state.run.lastStep === undefined
            ? {}
            : { lastResult: goal.state.run.lastStep.result }),
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
        ...goal.state.messages.map((message) => ({
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

/**
 * 构造 active Preparation Goal 的单轮 LLM 请求。
 *
 * @remarks
 * 本函数只负责准备阶段协议选择和最小控制上下文。生成的控制消息不会写入
 * Goal；完整三阶段 Working Context 由统一 Prompt Builder 继续演进。
 *
 * @param goal - active `gathering_context` 或 `planning` Goal。
 * @returns 保持真实消息顺序并附带当前阶段控制消息的请求。
 * @throws Goal 不处于 active Preparation 阶段时抛出 Error。
 */
export function buildPreparationRequest(goal: Goal): LLMRequest {
    const phase = getActivePreparationPhase(goal);
    const messages: LLMMessage[] = [
        {
            role: "system",
            content: buildPreparationSystemContent(goal, phase),
        },
        ...goal.state.messages.map((message) => ({
            role: message.role,
            content: message.content,
        })),
        {
            role: "user",
            content: JSON.stringify({
                phase,
                intent: goal.definition.intent,
            }, null, 2),
        },
    ];

    return { messages };
}
