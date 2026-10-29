import assert from "node:assert/strict";
import { test } from "node:test";

import { roundRankedScore, roundScore } from "../src/index";

test("两种舍入公式在 6 位小数网格上等价", () => {
    for (let scaled = 0; scaled <= 200_000; scaled += 7) {
        const value = scaled / 1_000_000;

        assert.equal(roundScore(value), value);
        assert.equal(roundRankedScore(value), value);
    }
});

test("半微单位边界保留两种公式的 1e-6 差异", () => {
    const boundary = 1.0000004999999998;

    assert.equal(roundScore(boundary), 1);
    assert.equal(roundRankedScore(boundary), 1.000001);
});

test("两种公式对代表性输入保持幂等", () => {
    const inputs = [
        0,
        1e-7,
        0.1234565,
        0.1 + 0.2,
        1 / 3,
        2.675,
        123.4567895,
        999_999.9999995,
        1.0000004999999998,
    ];

    for (const value of inputs) {
        assert.equal(roundScore(roundScore(value)), roundScore(value));
        assert.equal(roundRankedScore(roundRankedScore(value)), roundRankedScore(value));
    }
});

test("两个共享函数不做领域校验且不抛错", () => {
    assert.ok(Number.isNaN(roundScore(Number.NaN)));
    assert.equal(roundRankedScore(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
    assert.equal(roundScore(-1), -1);
    assert.equal(roundRankedScore(-1), -1);
});
