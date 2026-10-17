import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ContextSelector,
    MODEL_CONTEXT_HARD_OVERFLOW,
    ModelContextHardOverflowError,
    TokenBudgetPlanner,
    type ContextSelectionUnit,
} from "../src/index";

function plannerWithHardLimit(hardInputLimit: number): TokenBudgetPlanner {
    // hardInputLimit = floor(contextWindowTokens * 0.95) - maxOutputTokens；
    // 固定 maxOutputTokens = 100 反解出 contextWindowTokens。
    const maxOutputTokens = 100;
    const contextWindowTokens = Math.ceil((hardInputLimit + maxOutputTokens) / 0.95);
    const planner = new TokenBudgetPlanner({
        contextWindowTokens,
        maxOutputTokens,
        tokenEstimator: {
            unit: "token",
            estimate: (input: unknown) => typeof input === "string" ? input.length : JSON.stringify(input).length,
        },
    });
    if (planner.hardInputLimit !== hardInputLimit) {
        throw new Error(`plannerWithHardLimit 反解失败：${planner.hardInputLimit} != ${hardInputLimit}`);
    }
    return planner;
}

function unit(id: string, value: string): ContextSelectionUnit<string> {
    return { id, value };
}

const render = (parts: {
    readonly authority: unknown;
    readonly conversation: readonly string[];
    readonly hot: readonly string[];
    readonly olderConversation: readonly string[];
    readonly warm: readonly string[];
}): unknown => [
    String(parts.authority),
    ...parts.conversation,
    ...parts.hot,
    ...parts.olderConversation,
    ...parts.warm,
].join("");

test("ContextSelector 按 Warm、旧 Conversation、Hot 顺序回退", () => {
    // 初始渲染 800 字符；上限 375 时依次丢 2 个 Warm、2 个旧 Conversation、1 个最旧 Hot。
    const selector = new ContextSelector<string>(plannerWithHardLimit(375));
    const reference = {
        authority: "A".repeat(100),
        latestConversation: unit("latest", "L".repeat(100)),
        hot: [unit("hot-1", "H".repeat(100)), unit("hot-2", "h".repeat(100))],
        olderConversation: [unit("older-1", "O".repeat(100)), unit("older-2", "o".repeat(100))],
        warm: [unit("warm-1", "W".repeat(100)), unit("warm-2", "w".repeat(100))],
        render,
    };
    const before = JSON.stringify(reference);

    const result = selector.select(reference);

    assert.deepEqual(result.conversation, ["L".repeat(100)]);
    assert.deepEqual(result.warm, []);
    assert.deepEqual(result.hot, ["h".repeat(100)]);
    assert.deepEqual(result.olderConversation, []);
    assert.equal(result.removedWarm, 2);
    assert.equal(result.removedOlderConversation, 2);
    assert.equal(result.removedHot, 1);
    assert.equal(result.hardOverflow, false);
    assert.equal(JSON.stringify(reference), before);
});

test("ContextSelector 先丢旧 Conversation，再丢最旧 Hot 单元", () => {
    const selector = new ContextSelector<string>(plannerWithHardLimit(300));
    const result = selector.select({
        authority: "A".repeat(100),
        latestConversation: unit("latest", "L".repeat(100)),
        hot: [unit("hot-1", "H".repeat(100)), unit("hot-2", "h".repeat(100))],
        olderConversation: [unit("older-1", "O".repeat(100)), unit("older-2", "o".repeat(100))],
        render,
    });

    assert.deepEqual(result.olderConversation, []);
    assert.deepEqual(result.hot, ["h".repeat(100)]);
    assert.equal(result.removedOlderConversation, 2);
    assert.equal(result.removedHot, 1);
    assert.equal(result.removedWarm, 0);
    assert.equal(result.hardOverflow, false);
});

test("权威输入无法装入硬预算时抛出 MODEL_CONTEXT_HARD_OVERFLOW", () => {
    const selector = new ContextSelector<string>(plannerWithHardLimit(300));

    assert.throws(
        () => selector.select({
            authority: "A".repeat(10_000),
            latestConversation: unit("latest", "L"),
            render,
        }),
        (error: unknown) => error instanceof ModelContextHardOverflowError
            && error.code === MODEL_CONTEXT_HARD_OVERFLOW,
    );
});

test("选择结果冻结且保留完整单元边界", () => {
    const selector = new ContextSelector<string>(plannerWithHardLimit(1_000));
    const hotUnit = unit("hot-1", "H");
    const result = selector.select({
        authority: "A",
        latestConversation: unit("latest", "L"),
        hot: [hotUnit],
        olderConversation: [unit("older-1", "O")],
        render,
    });

    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.hot), true);
    assert.equal(Object.isFrozen(result.olderConversation), true);
    assert.equal(Object.isFrozen(result.warm), true);
    assert.equal(Object.isFrozen(result.conversation), true);
    assert.deepEqual(result.hot, [hotUnit.value]);
});

test("ContextSelector 接受已构造的 TokenBudgetPlanner 与模型能力", () => {
    const planner = plannerWithHardLimit(1_000);
    const fromPlanner = new ContextSelector<string>(planner);
    const fromCapabilities = new ContextSelector<string>(planner.capabilities);

    const input = {
        authority: "A",
        latestConversation: unit("latest", "L"),
        render,
    };
    assert.equal(
        fromPlanner.select(input).inputTokens,
        fromCapabilities.select(input).inputTokens,
    );
});
