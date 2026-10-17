import assert from "node:assert/strict";
import { test } from "node:test";

import {
    truncateThought,
    formatThinkingContext,
    THOUGHT_TRUNCATION_MARKER,
    DEFAULT_MAX_THOUGHT_CHARS,
} from "../src/thought-budget";
import { TokenBudgetPlanner } from "../src/model-context-budget";

test("truncateThought 在思考链未超限时保持原样并标记未截断", () => {
    const original = "短思考文本，推演工具调用路径。";
    const result = truncateThought(original);

    assert.equal(result.thought, original);
    assert.equal(result.truncated, false);
});

test("truncateThought 在超出限制时准确截断并附加截断标记", () => {
    const longThought = "A".repeat(100);
    const maxChars = 50;
    const result = truncateThought(longThought, { maxChars });

    assert.equal(result.truncated, true);
    assert.ok(result.thought.endsWith(THOUGHT_TRUNCATION_MARKER));
    assert.equal(result.thought.length, maxChars);
    assert.ok(result.thought.startsWith("A".repeat(maxChars - THOUGHT_TRUNCATION_MARKER.length)));
});

test("truncateThought 配合 TokenBudgetPlanner 准确衡量 Token 开销", () => {
    const thought = "推演逻辑".repeat(20);
    const planner = new TokenBudgetPlanner({
        contextWindowTokens: 8192,
        maxOutputTokens: 2048,
        tokenEstimator: {
            unit: "token",
            estimate: (val: unknown) => typeof val === "string" ? val.length : 10,
        },
    });

    const result = truncateThought(thought, { planner, maxChars: 1000 });
    assert.equal(result.truncated, false);
    assert.equal(result.estimatedTokens, thought.length);
});

test("formatThinkingContext 规范化包装思考推演内容供 Stage 2 输入", () => {
    const cot = "分析当前目标后，决定调用 read_file 工具。";
    const formatted = formatThinkingContext(cot);

    assert.ok(formatted.includes("[Stage 1 Reasoning / CoT]"));
    assert.ok(formatted.includes(cot));
    assert.ok(formatted.includes("Based on the reasoning above"));
});
