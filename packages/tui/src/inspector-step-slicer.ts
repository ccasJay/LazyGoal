import type { Goal, GoalMessage } from "../../runtime/src/index";
import type { UiInspectorStep } from "./types.js";

/**
 * 轨迹切片输入的结构化选项。
 *
 * @example
 * ```ts
 * const steps = sliceTrajectorySteps({
 *     goalId: "goal-1",
 *     messages: [{ role: "user", content: "hello" }],
 * });
 * ```
 */
export interface SliceTrajectoryOptions {
    /** 目标 Goal 的唯一标识。 */
    readonly goalId: string;
    /** 可选的完整 Goal 快照对象。 */
    readonly goal?: Goal;
    /** 会话历史消息列表。若提供则优先使用，未提供时尝试从 `goal.messages` 读取。 */
    readonly messages?: readonly GoalMessage[];
}

/**
 * 从消息文本中提取模型思考过程（Reasoning/CoT）。
 *
 * @param content - 原始消息文本内容。
 * @returns 包含提取出的思考链内容（若有）和过滤后的展示文本。
 */
function extractReasoning(content: string): {
    readonly reasoning?: string;
    readonly cleanContent: string;
} {
    const thoughtMatch = /<thought>([\s\S]*?)<\/thought>/i.exec(content)
        ?? /<reasoning>([\s\S]*?)<\/reasoning>/i.exec(content);
    if (!thoughtMatch || thoughtMatch[1] === undefined) {
        return { cleanContent: content };
    }
    const reasoning = thoughtMatch[1].trim();
    const cleanContent = content.replace(thoughtMatch[0], "").trim();
    if (reasoning.length > 0) {
        return { reasoning, cleanContent };
    }
    return { cleanContent };
}

/**
 * 将 Goal 历史消息切片为便于在 Inspector 中按步浏览的不可变步骤集合。
 *
 * @remarks
 * 依据 Assistant 回复或轮次划分步骤：
 * 1. 初始的用户意图或连续用户消息作为第 0 步；
 * 2. 随后的每个 Assistant 回复（以及其伴随的观察结果）独立划分为后续步骤；
 * 3. 自动从消息正文中解析 `<thought>` 或 `<reasoning>` 标签作为思考链；
 * 4. 保证步骤索引自 0 单调递增且 `totalSteps` 一致。
 *
 * @param options - 切片所需的 Goal 快照或消息列表。
 * @returns 切片后的步骤集合。无消息时返回包含 1 个占位步骤的列表。
 *
 * @example
 * ```ts
 * const steps = sliceTrajectorySteps({
 *     goalId: "goal-1",
 *     messages: [
 *         { role: "user", content: "List workspace files" },
 *         {
 *             role: "assistant",
 *             assistant: { profileId: "default" },
 *             content: "<thought>Checking dir</thought>Done",
 *         },
 *     ],
 * });
 * console.log(steps.length); // 2
 * ```
 */
export function sliceTrajectorySteps(
    options: SliceTrajectoryOptions,
): UiInspectorStep[] {
    const messages = options.messages ?? options.goal?.state.messages ?? [];

    if (messages.length === 0) {
        return [
            {
                index: 0,
                totalSteps: 1,
                messages: [],
                rawJson: JSON.stringify(
                    {
                        goalId: options.goalId,
                        intent: options.goal?.definition.intent ?? "",
                        messages: [],
                    },
                    null,
                    2,
                ),
            },
        ];
    }

    const groupedMessages: GoalMessage[][] = [];
    let currentGroup: GoalMessage[] = [];

    for (const msg of messages) {
        if (msg.role === "assistant" && currentGroup.length > 0) {
            // 当遇到新的 assistant 消息且当前组已有内容时，开启新的一步
            // 如果当前组已经有 assistant 消息，则当前组归档，新建一组
            const hasAssistant = currentGroup.some((m) => m.role === "assistant");
            if (hasAssistant) {
                groupedMessages.push(currentGroup);
                currentGroup = [msg];
                continue;
            }
        }
        currentGroup.push(msg);
    }

    if (currentGroup.length > 0) {
        groupedMessages.push(currentGroup);
    }

    const totalSteps = groupedMessages.length;

    return groupedMessages.map((stepMessages, index) => {
        let extractedReasoning: string | undefined;

        for (const msg of stepMessages) {
            if (msg.role === "assistant") {
                const { reasoning } = extractReasoning(msg.content);
                if (reasoning !== undefined) {
                    extractedReasoning = reasoning;
                    break;
                }
            }
        }

        const rawData = {
            goalId: options.goalId,
            stepIndex: index,
            totalSteps,
            messages: stepMessages,
            ...(extractedReasoning !== undefined
                ? { reasoning: extractedReasoning }
                : {}),
        };

        return {
            index,
            totalSteps,
            messages: stepMessages,
            ...(extractedReasoning !== undefined
                ? { reasoning: extractedReasoning }
                : {}),
            rawJson: JSON.stringify(rawData, null, 2),
        };
    });
}
