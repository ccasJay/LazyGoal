import assert from "node:assert/strict";
import { test } from "node:test";

import {
    CharacterModelInputEstimator,
    createDefaultModelContextBudgetPolicy,
    createModelContextBudgetPolicy,
    createTokenModelInputEstimator,
    resolveModelInputEstimator,
} from "../src/model-context-budget";

test("字符 Estimator 对字符串和稳定 JSON 结构计量", () => {
    const estimator = new CharacterModelInputEstimator();

    assert.equal(estimator.estimate("A😀答"), "A😀答".length);
    assert.equal(
        estimator.estimate({ z: 1, a: ["x", true] }),
        estimator.estimate({ a: ["x", true], z: 1 }),
    );
    assert.equal(estimator.estimate(undefined), "null".length);
});

test("字符 Estimator 拒绝无法序列化的输入", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    assert.throws(
        () => new CharacterModelInputEstimator().estimate(circular),
        /cannot be serialized/,
    );
});

test("Token Estimator 校验计量结果并保留 token 单位", () => {
    const estimator = createTokenModelInputEstimator(() => 12);

    assert.equal(estimator.unit, "token");
    assert.equal(estimator.estimate({}), 12);

    for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(
            () => createTokenModelInputEstimator(() => invalid).estimate("input"),
            /non-negative safe integer/,
        );
    }
});

test("缺少 tokenizer 时使用字符兜底，注入 tokenizer 时优先使用 token", () => {
    const fallback = resolveModelInputEstimator();
    assert.equal(fallback.unit, "character");

    const tokenEstimator = createTokenModelInputEstimator(() => 3);
    assert.equal(resolveModelInputEstimator(tokenEstimator), tokenEstimator);

    assert.throws(
        () => resolveModelInputEstimator(fallback),
        /must use token units/,
    );
});

test("预算计划先扣固定 View 和响应预留，再分配 Warm/Hot", () => {
    const policy = createModelContextBudgetPolicy({
        modelInputBudget: 1_000,
        responseReserve: 100,
        warmShare: 0.25,
    });
    const plan = policy.plan({ fixedInput: "x" });

    assert.equal(plan.measuredAs, "character");
    assert.equal(plan.fixedInput.count, 1);
    assert.equal(plan.historyBudget, 899);
    assert.equal(plan.warmBudget, 224);
    assert.equal(plan.hotBudget, 675);
    assert.equal(plan.softOverflow, false);
    assert.equal(policy.reallocateHotBudget(plan, 100), 799);
});

test("Warm 绝对上限和未使用预算回借到 Hot", () => {
    const policy = createModelContextBudgetPolicy({
        modelInputBudget: 1_000,
        responseReserve: 100,
        warmShare: 0.8,
        warmLimit: 200,
    });
    const plan = policy.plan({ fixedInput: "x" });

    assert.equal(plan.warmBudget, 200);
    assert.equal(plan.hotBudget, 699);
    assert.equal(policy.reallocateHotBudget(plan, 0), 899);
    assert.equal(policy.reallocateHotBudget(plan, 200), 699);
    assert.throws(
        () => policy.reallocateHotBudget(plan, 201),
        /must not exceed/,
    );
});

test("固定 View 软超限时保持结构但不给历史层预算", () => {
    const policy = createModelContextBudgetPolicy({
        modelInputBudget: 10,
        responseReserve: 2,
    });
    const plan = policy.plan({ fixedInput: "12345678" });

    assert.equal(plan.softOverflow, true);
    assert.equal(plan.historyBudget, 0);
    assert.equal(plan.warmBudget, 0);
    assert.equal(plan.hotBudget, 0);
});

test("默认策略和单位相关的大型输出 preview 有稳定值", () => {
    const fallback = createDefaultModelContextBudgetPolicy();
    assert.equal(fallback.modelInputBudget, 196_608);
    assert.equal(fallback.responseReserve, 19_660);
    assert.equal(fallback.largeOutputPreviewLimit, 8_192);

    const token = createModelContextBudgetPolicy(
        { modelInputBudget: 10_000 },
        createTokenModelInputEstimator(() => 1),
    );
    assert.equal(token.largeOutputPreviewLimit, 2_048);
});

test("预算策略拒绝非法配置和超出 Warm 配额的使用量", () => {
    for (const modelInputBudget of [0, -1, 1.5, Number.NaN]) {
        assert.throws(
            () => createModelContextBudgetPolicy({ modelInputBudget }),
            /positive safe integer/,
        );
    }

    assert.throws(
        () => createModelContextBudgetPolicy({
            modelInputBudget: 100,
            responseReserve: 100,
        }),
        /less than modelInputBudget/,
    );
    assert.throws(
        () => createModelContextBudgetPolicy({ modelInputBudget: 100, warmShare: 0 }),
        /warmShare/,
    );
    assert.throws(
        () => createModelContextBudgetPolicy({ modelInputBudget: 100, compactTriggerRatio: 2 }),
        /compactTriggerRatio/,
    );
    assert.throws(
        () => createModelContextBudgetPolicy({ modelInputBudget: 100, warmLimit: 0 }),
        /warmLimit/,
    );
    assert.throws(
        () => createModelContextBudgetPolicy({ modelInputBudget: 100, largeOutputPreviewLimit: 0 }),
        /largeOutputPreviewLimit/,
    );
});

test("预算规划不修改固定 View 且策略报告不可变", () => {
    const fixedInput = { task: "keep", nested: { value: 1 } };
    const before = structuredClone(fixedInput);
    const policy = createModelContextBudgetPolicy({ modelInputBudget: 100 });
    const plan = policy.plan({ fixedInput });

    assert.deepEqual(fixedInput, before);
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.fixedInput), true);
    assert.equal(Object.isFrozen(policy), true);
});
