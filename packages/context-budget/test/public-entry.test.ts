import assert from "node:assert/strict";
import { test } from "node:test";

import {
    CharacterModelInputEstimator,
    DropOldestContextCompactor,
    TokenBudgetPlanner,
    compareCodeUnits,
    createModelContextBudgetPolicy,
    createTokenModelInputEstimator,
    stableJson,
    truncateThought,
    type ContextUnit,
} from "../src/index";

test("仅经公共入口即可完成字符与 Token 计量及预算分配", () => {
    const estimator = new CharacterModelInputEstimator();
    assert.equal(estimator.estimate("预算"), 2);

    const tokenEstimator = createTokenModelInputEstimator(
        (input) => JSON.stringify(input).length,
    );
    const policy = createModelContextBudgetPolicy(
        { modelInputBudget: 1_000, responseReserve: 100, warmShare: 0.25 },
        tokenEstimator,
    );
    const plan = policy.plan({ fixedInput: { task: "entry" } });

    assert.equal(plan.measuredAs, "token");
    assert.equal(plan.fixedInput.count, JSON.stringify({ task: "entry" }).length);
    assert.equal(plan.historyBudget, 900 - plan.fixedInput.count);
    assert.equal(plan.warmBudget, Math.floor((900 - plan.fixedInput.count) * 0.25));
    assert.equal(policy.reallocateHotBudget(plan, 100), plan.hotBudget + plan.warmBudget - 100);

    const planner = new TokenBudgetPlanner({
        contextWindowTokens: 100_000,
        maxOutputTokens: 5_000,
        tokenEstimator,
    });
    assert.equal(planner.measure("input").hardOverflow, false);
});

test("仅经公共入口使用完整连续单元选择与软超限保留", async () => {
    const compactor = new DropOldestContextCompactor(7);
    const units: readonly ContextUnit<string>[] = [
        { items: ["oldest"], characterCount: 5 },
        { items: ["middle"], characterCount: 4 },
        { items: ["newest"], characterCount: 3 },
    ];

    assert.deepEqual(
        await compactor.compact(units),
        [{ items: ["middle"], characterCount: 4 }, { items: ["newest"], characterCount: 3 }],
    );

    const oversized = await compactor.compact([
        { items: ["old"], characterCount: 1 },
        { items: ["oversized"], characterCount: 100 },
    ]);
    assert.deepEqual(oversized, [{ items: ["oversized"], characterCount: 100 }]);
    assert.deepEqual(units, [
        { items: ["oldest"], characterCount: 5 },
        { items: ["middle"], characterCount: 4 },
        { items: ["newest"], characterCount: 3 },
    ]);
});

test("仅经公共入口的取消语义保持原样", async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
        new DropOldestContextCompactor(10).compact(
            [{ items: ["content"], characterCount: 7 }],
            controller.signal,
        ),
        (error: unknown) => error instanceof DOMException && error.name === "AbortError",
    );
});

test("仅经公共入口使用确定性序列化与思考链截断", () => {
    const first = stableJson({ b: 1, a: [2, 1] });
    const second = stableJson({ a: [2, 1], b: 1 });

    assert.equal(first, second);
    assert.ok(compareCodeUnits("a", "b") < 0);

    const truncated = truncateThought("A".repeat(100), { maxChars: 50 });
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.thought.length, 50);
});
