import assert from "node:assert/strict";
import { test } from "node:test";

import { compareCodeUnits, stableJson } from "../src/index";

test("stableJson 按代码单元顺序稳定输出对象键，空数组固定为 []", () => {
    const output = stableJson({ zebra: 1, apple: 2, mango: [3, 1, 2] });

    assert.ok(output.includes('"apple": 2'));
    assert.ok(output.includes('"zebra": 1'));
    assert.ok(output.indexOf('"apple"') < output.indexOf('"zebra"'));

    assert.equal(stableJson([]), "[]");
});

test("stableJson 递归排序嵌套对象键且保持数组顺序与标量值", () => {
    const output = stableJson({ b: { d: 1, c: [2, 1, 3] }, a: "text" });

    assert.equal(
        output,
        [
            "{",
            '  "a": "text",',
            '  "b": {',
            '    "c": [',
            "      2,",
            "      1,",
            "      3",
            "    ],",
            '    "d": 1',
            "  }",
            "}",
        ].join("\n"),
    );
});

test("stableJson 对不可序列化的 undefined 输出 null", () => {
    assert.equal(stableJson(undefined), "null");
});

test("compareCodeUnits 逐字符比较且不受 locale 影响", () => {
    assert.ok(compareCodeUnits("apple", "banana") < 0);
    assert.equal(compareCodeUnits("same", "same"), 0);
    assert.ok(compareCodeUnits("b", "a") > 0);
    assert.ok(compareCodeUnits("a", "ab") < 0);
    assert.deepEqual(["b", "A", "a"].sort(compareCodeUnits), ["A", "a", "b"]);
});
