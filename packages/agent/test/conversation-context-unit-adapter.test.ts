import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ConversationContextUnitAdapter,
    flattenContextUnits,
} from "../src/conversation-context-unit-adapter";
import type { ModelConversationMessage } from "../src/model-inference-view";

const adapter = new ConversationContextUnitAdapter();

test("空 Conversation 产生空单元列表", () => {
    assert.deepEqual(adapter.adapt([]), []);
});

test("按 user 边界分组并保留前导 assistant 单元", () => {
    const conversation: readonly ModelConversationMessage[] = [
        assistant("先说明", "profile-1", 0),
        assistant("再提问", "profile-1", 1),
        { role: "user", content: "回答一", sourceMessageIndex: 2 },
        assistant("追问一", "profile-1", 3),
        assistant("追问二", "profile-2", 4),
        { role: "user", content: "回答二", sourceMessageIndex: 5 },
        { role: "user", content: "补充", sourceMessageIndex: 6 },
    ];

    const units = adapter.adapt(conversation);

    assert.deepEqual(units.map(({ items }) => items), [
        conversation.slice(0, 2),
        conversation.slice(2, 5),
        conversation.slice(5, 6),
        conversation.slice(6, 7),
    ]);
    assert.deepEqual(units.map(({ characterCount }) => characterCount), [
        "先说明再提问".length,
        "回答一追问一追问二".length,
        "回答二".length,
        "补充".length,
    ]);
    assert.deepEqual(flattenContextUnits(units), conversation);
});

test("字符数使用 UTF-16 code unit 且输出不共享输入对象或数组", () => {
    const conversation: ModelConversationMessage[] = [
        { role: "user", content: "A😀", sourceMessageIndex: 4 },
        assistant("答", "profile-1", 5),
    ];
    const before = structuredClone(conversation);
    const units = adapter.adapt(conversation);
    const first = units[0];

    assert.ok(first !== undefined);
    assert.equal(first.characterCount, "A😀答".length);
    assert.notEqual(first.items, conversation);
    assert.notEqual(first.items[0], conversation[0]);
    assert.notEqual(
        (first.items[1] as Extract<ModelConversationMessage, { role: "assistant" }>).assistant,
        (conversation[1] as Extract<ModelConversationMessage, { role: "assistant" }>).assistant,
    );
    assert.deepEqual(conversation, before);
});

function assistant(
    content: string,
    profileId: string,
    sourceMessageIndex: number,
): Extract<ModelConversationMessage, { role: "assistant" }> {
    return {
        role: "assistant",
        assistant: { profileId },
        content,
        sourceMessageIndex,
    };
}
