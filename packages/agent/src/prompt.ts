import type { LLMMessage, LLMRequest } from "../../llm/src/core/types";
import type { Goal, GoalTask, StepRecord } from "../../runtime/src/domain";
import type { PreparationPhase } from "./response-schema";

/**
 * 从 Goal 最新状态为当前模型轮次派生的非持久化控制上下文。
 *
 * @remarks
 * 准备阶段只携带稳定 intent；执行阶段额外携带已批准任务和累计执行状态。
 * `maxSteps = 0` 不输出上限，`previousStep` 只投影最近一次已消费 Step。
 */
export type WorkingContext =
    | {
        readonly phase: "gathering_context";
        readonly intent: string;
    }
    | {
        readonly phase: "planning";
        readonly intent: string;
    }
    | {
        readonly phase: "executing";
        readonly intent: string;
        readonly task: GoalTask;
        readonly execution: {
            readonly stepCount: number;
            readonly maxSteps?: number;
            readonly previousStep?: StepRecord;
        };
    };

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

function cloneStepRecord(step: StepRecord): StepRecord {
    return structuredClone(step);
}

/**
 * 从当前 Goal 派生本轮 Working Context。
 *
 * @param goal - active Preparation Goal 或 running executing Goal。
 * @returns 与当前 phase 对应的新上下文对象，不共享可变数组或结果对象。
 * @throws Goal 当前状态不允许调用模型时抛出 Error。
 */
export function buildWorkingContext(goal: Goal): WorkingContext {
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
            ...(goal.state.run.lastStep === undefined
                ? {}
                : { previousStep: cloneStepRecord(goal.state.run.lastStep) }),
        },
    };
}

function buildControlMessage(
    context: WorkingContext,
): Extract<LLMMessage, { readonly role: "user" }> {
    return {
        role: "user",
        content: JSON.stringify(context, null, 2),
    };
}

/**
 * 构造本轮发送给模型、但绝不写入 Goal.messages 的控制消息。
 */
export function buildWorkingContextMessage(
    goal: Goal,
): Extract<LLMMessage, { readonly role: "user" }> {
    return buildControlMessage(buildWorkingContext(goal));
}

/**
 * 构造执行阶段 Working Context 控制消息。
 *
 * @deprecated 使用 {@link buildWorkingContextMessage}；返回值不得持久化。
 */
export function buildStepUserMessage(
    goal: Goal,
): Extract<LLMMessage, { readonly role: "user" }> {
    const context = buildWorkingContext(goal);

    if (context.phase !== "executing") {
        throw new Error("Step request requires a running executing Goal");
    }

    return buildControlMessage(context);
}

function buildRequest(
    goal: Goal,
    protocol: string,
    context: WorkingContext,
): LLMRequest {
    return {
        messages: [
            {
                role: "system",
                content: buildProfileSystemContent(goal, protocol),
            },
            ...goal.state.messages.map((message) => ({
                role: message.role,
                content: message.content,
            })),
            buildControlMessage(context),
        ],
    };
}

/**
 * 将一个完整 Goal 快照转换为本轮 LLM 请求。
 * 该函数只读取状态并生成新字符串，不保存状态、不追加历史。
 */
export function buildStepRequest(goal: Goal): LLMRequest {
    const context = buildWorkingContext(goal);

    if (context.phase !== "executing") {
        throw new Error("Step request requires a running executing Goal");
    }

    return buildRequest(goal, STEP_RESULT_PROTOCOL, context);
}

/**
 * 构造 active Preparation Goal 的单轮 LLM 请求。
 *
 * @remarks
 * 生成的 Working Context 是最后一条 user 控制消息，只存在于当前请求，
 * 不会写入 Goal.messages。
 *
 * @param goal - active `gathering_context` 或 `planning` Goal。
 * @returns 保持真实消息顺序并附带当前阶段控制消息的请求。
 * @throws Goal 不处于 active Preparation 阶段时抛出 Error。
 */
export function buildPreparationRequest(goal: Goal): LLMRequest {
    const context = buildWorkingContext(goal);

    if (context.phase === "executing") {
        throw new Error("Preparation request requires an active preparation Goal");
    }

    return buildRequest(
        goal,
        PREPARATION_RESULT_PROTOCOL[context.phase],
        context,
    );
}
