import type { ContextUnit, ContextUnitAdapter } from "./context-unit";
import type { ModelConversationMessage } from "./model-inference-view";

// TODO(trajectory-context-adapter): Trajectory 必须通过独立 Adapter 映射为同一 ContextUnit，Compactor 不得依赖 Trajectory 类型。

/**
 * 把真实 Conversation 映射为不可分割的交互单元。
 *
 * @remarks
 * 每条 user 消息开始一个新单元，其后的连续 assistant 消息归入该单元；开头
 * 连续出现的 assistant 消息形成独立前缀单元。字符数只统计 `content.length`，
 * 即 JavaScript UTF-16 code unit 数，不计算角色或 assistant 来源元数据。
 * 输入消息会逐字段复制，返回值不与输入共享消息对象或数组。
 *
 * @example
 * ```ts
 * const units = new ConversationContextUnitAdapter().adapt([
 *     { role: "user", content: "继续" },
 * ]);
 * ```
 */
export class ConversationContextUnitAdapter implements ContextUnitAdapter<
    readonly ModelConversationMessage[],
    ModelConversationMessage
> {
    /**
     * @param source - Projector 生成的完整真实会话投影。
     * @returns 按原始顺序排列、每个至少包含一条消息的新单元列表。
     */
    adapt(
        source: readonly ModelConversationMessage[],
    ): readonly ContextUnit<ModelConversationMessage>[] {
        const units: ContextUnit<ModelConversationMessage>[] = [];
        let current: ModelConversationMessage[] = [];

        for (const message of source) {
            if (message.role === "user" && current.length > 0) {
                units.push(createUnit(current));
                current = [];
            }

            current.push(cloneMessage(message));
        }

        if (current.length > 0) {
            units.push(createUnit(current));
        }

        return units;
    }
}

/**
 * 按单元与单元内顺序展开上下文项。
 *
 * @param units - 已由 Adapter 或 Compactor 产生的有序完整单元。
 * @returns 不修改输入的新数组。
 */
export function flattenContextUnits<T>(
    units: readonly ContextUnit<T>[],
): readonly T[] {
    return units.flatMap((unit) => [...unit.items]);
}

function createUnit(
    items: readonly ModelConversationMessage[],
): ContextUnit<ModelConversationMessage> {
    return {
        items: [...items],
        characterCount: items.reduce(
            (total, message) => total + message.content.length,
            0,
        ),
    };
}

function cloneMessage(
    message: ModelConversationMessage,
): ModelConversationMessage {
    return message.role === "user"
        ? { role: "user", content: message.content }
        : {
            role: "assistant",
            assistant: { profileId: message.assistant.profileId },
            content: message.content,
        };
}
