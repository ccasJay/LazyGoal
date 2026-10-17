import assert from "node:assert/strict";
import { test } from "node:test";

import {
    DEFAULT_LLM_CONVERSATION_CHAR_BUDGET,
    DropOldestContextCompactor,
} from "../src/context-compactor";
import type { ContextUnit } from "../src/context-unit";

test("默认预算固定为 196608", () => {
    assert.equal(DEFAULT_LLM_CONVERSATION_CHAR_BUDGET, 196608);
});

test("未超预算和精确边界时保留全部单元且不复用输入数组", async () => {
    const units = [unit("old", 3), unit("new", 4)] as const;

    for (const budget of [7, 8]) {
        const visible = await new DropOldestContextCompactor(budget)
            .compact(units);

        assert.deepEqual(visible, units);
        assert.notEqual(visible, units);
    }
});

test("超预算时保留可以整体容纳的连续最新后缀", async () => {
    const units = [unit("oldest", 5), unit("middle", 4), unit("newest", 3)];
    const visible = await new DropOldestContextCompactor(7).compact(units);

    assert.deepEqual(visible, units.slice(1));
});

test("遇到不能容纳的较新单元后不跳选更旧小单元", async () => {
    const units = [unit("small-old", 1), unit("large-middle", 100), unit("new", 1)];
    const visible = await new DropOldestContextCompactor(3).compact(units);

    assert.deepEqual(visible, units.slice(2));
});

test("最新单元自身超出软预算时仍完整保留", async () => {
    const units = [unit("old", 1), unit("oversized", 10)];
    const visible = await new DropOldestContextCompactor(5).compact(units);

    assert.deepEqual(visible, units.slice(1));
});

test("compact 从第一版即异步且重复调用结果确定", async () => {
    const units = [unit("old", 4), unit("new", 4)];
    const compactor = new DropOldestContextCompactor(4);
    const pending = compactor.compact(units);

    assert.ok(pending instanceof Promise);
    assert.deepEqual(await pending, await compactor.compact(units));
    assert.deepEqual(units, [unit("old", 4), unit("new", 4)]);
});

test("已中止信号使 compact 拒绝且不返回选择结果", async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
        new DropOldestContextCompactor(10).compact(
            [unit("content", 7)],
            controller.signal,
        ),
        (error: unknown) => error instanceof DOMException
            && error.name === "AbortError",
    );
});

test("构造器拒绝非正安全整数预算", () => {
    for (const budget of [
        0,
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.MAX_SAFE_INTEGER + 1,
    ]) {
        assert.throws(
            () => new DropOldestContextCompactor(budget),
            /positive safe integer/,
        );
    }
});

function unit(value: string, characterCount: number): ContextUnit<string> {
    return { items: [value], characterCount };
}
