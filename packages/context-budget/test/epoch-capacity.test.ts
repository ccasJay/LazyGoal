import assert from "node:assert/strict";
import { test } from "node:test";

import {
    DEFAULT_COMPACT_THRESHOLD_PERCENT,
    EPOCH_CAPACITY_UNAVAILABLE,
    EpochCapacityError,
    exceedsCompactThreshold,
    resolveEpochCapacity,
} from "../src/index";

test("模型窗口已知时默认以标称容量为基数并使用默认阈值", () => {
    const capacity = resolveEpochCapacity({ modelContextWindowTokens: 200_000 });
    assert.deepEqual({ ...capacity }, {
        capacityTokens: 200_000,
        thresholdPercent: DEFAULT_COMPACT_THRESHOLD_PERCENT,
        source: "model",
    });
});

test("用户上限优先于模型窗口并接受自定义阈值", () => {
    const capacity = resolveEpochCapacity({
        modelContextWindowTokens: 200_000,
        configuredLimitTokens: 120_000,
        thresholdPercent: 65,
    });
    assert.deepEqual({ ...capacity }, {
        capacityTokens: 120_000,
        thresholdPercent: 65,
        source: "configured",
    });
});

test("模型窗口未知但配置了上限时以配置为基数", () => {
    const capacity = resolveEpochCapacity({ configuredLimitTokens: 90_000 });
    assert.equal(capacity.capacityTokens, 90_000);
    assert.equal(capacity.source, "configured");
});

test("模型窗口与配置上限都未知时拒绝解析并提示配置", () => {
    assert.throws(
        () => resolveEpochCapacity({}),
        (error: unknown) => error instanceof EpochCapacityError
            && error.code === EPOCH_CAPACITY_UNAVAILABLE
            && /epoch_limit_tokens/.test(error.message),
    );
});

test("配置上限超过已知模型窗口、非法阈值或非法容量都拒绝解析", () => {
    assert.throws(
        () => resolveEpochCapacity({ modelContextWindowTokens: 100_000, configuredLimitTokens: 120_000 }),
        (error: unknown) => error instanceof EpochCapacityError && /exceeds the model context window/.test(error.message),
    );
    for (const thresholdPercent of [0, 100, 80.5]) {
        assert.throws(
            () => resolveEpochCapacity({ modelContextWindowTokens: 100_000, thresholdPercent }),
            EpochCapacityError,
            String(thresholdPercent),
        );
    }
    assert.throws(() => resolveEpochCapacity({ configuredLimitTokens: 0 }), EpochCapacityError);
    assert.throws(() => resolveEpochCapacity({ modelContextWindowTokens: -1 }), EpochCapacityError);
});

test("占用严格超过阈值才触发整理", () => {
    const capacity = { capacityTokens: 100_000, thresholdPercent: 80 };
    assert.equal(exceedsCompactThreshold(80_000, capacity), false);
    assert.equal(exceedsCompactThreshold(80_001, capacity), true);
    assert.equal(exceedsCompactThreshold(Number.NaN, capacity), false);
});
