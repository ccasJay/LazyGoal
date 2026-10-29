import assert from "node:assert/strict";
import { test } from "node:test";

import {
    canonicalizeJson,
    canonicalJson,
    compareCodeUnits,
    deepFreeze,
    isRecord,
} from "../src/index";

test("canonicalJson 输出紧凑且按代码单元排序的键", () => {
    assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
    assert.equal(
        canonicalJson({ zebra: { d: 1, c: [3, 1, 2] }, apple: "text" }),
        '{"apple":"text","zebra":{"c":[3,1,2],"d":1}}',
    );
    assert.equal(canonicalJson({}), "{}");
    assert.equal(canonicalJson([]), "[]");
    assert.equal(canonicalJson({ emptyArray: [], emptyObject: {} }), '{"emptyArray":[],"emptyObject":{}}');
});

test("canonicalJson 对 Unicode 键按 UTF-16 code unit 排序", () => {
    assert.equal(
        canonicalJson({ "😀": 3, "é": 1, e: 2 }),
        '{"e":2,"é":1,"😀":3}',
    );
});

test("canonicalJson 保留整数样式键的引擎枚举顺序", () => {
    assert.equal(
        canonicalJson({ "10": "a", "2": "b", "1": "c" }),
        '{"1":"c","2":"b","10":"a"}',
    );
});

test("canonicalJson 输出两空格缩进 golden", () => {
    assert.equal(
        canonicalJson({ b: 1, a: { d: 2, c: [] } }, { indent: 2 }),
        [
            "{",
            '  "a": {',
            '    "c": [],',
            '    "d": 2',
            "  },",
            '  "b": 1',
            "}",
        ].join("\n"),
    );
});

test("canonicalJson 对不可序列化的顶层值返回 null 字符串", () => {
    assert.equal(canonicalJson(undefined), "null");
    assert.equal(canonicalJson(() => 1), "null");
    assert.equal(canonicalJson(Symbol("ignored")), "null");
    assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
    assert.equal(canonicalJson([undefined, 1]), "[null,1]");
});

test("canonicalJson 继承 JSON.stringify 的 Date 与自有 toJSON 语义", () => {
    assert.equal(canonicalJson(new Date("2020-01-01T00:00:00.000Z")), "{}");
    assert.equal(
        canonicalJson({ when: new Date("2020-01-01T00:00:00.000Z") }),
        '{"when":{}}',
    );
    assert.equal(
        canonicalJson({
            id: "a",
            toJSON(): unknown {
                return { replaced: true };
            },
        }),
        '{"replaced":true}',
    );
});

test("canonicalJson 将自有 __proto__ 键当作普通键且不污染原型", () => {
    const input = JSON.parse('{"__proto__":{"polluted":true},"a":1}') as Record<string, unknown>;
    const normalized = canonicalizeJson(input) as Record<string, unknown>;

    assert.equal(canonicalJson(input), '{"__proto__":{"polluted":true},"a":1}');
    assert.ok(Object.hasOwn(normalized, "__proto__"));
    assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
    assert.equal(Object.getPrototypeOf(input), Object.prototype);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("canonicalJson 对 BigInt 继续抛出 TypeError", () => {
    assert.throws(() => canonicalJson({ big: 1n }), TypeError);
});

test("canonicalizeJson 递归复制且不修改输入", () => {
    const input = { b: { d: 1, c: 2 }, a: [3, 1] };
    const before = JSON.stringify(input);
    const normalized = canonicalizeJson(input);

    assert.deepEqual(normalized, { a: [3, 1], b: { c: 2, d: 1 } });
    assert.equal(JSON.stringify(input), before);
    assert.notEqual(normalized, input);
});

test("compareCodeUnits 逐字符比较且不受 locale 影响", () => {
    assert.ok(compareCodeUnits("apple", "banana") < 0);
    assert.equal(compareCodeUnits("same", "same"), 0);
    assert.ok(compareCodeUnits("b", "a") > 0);
    assert.ok(compareCodeUnits("a", "ab") < 0);
    assert.deepEqual(["b", "A", "a"].sort(compareCodeUnits), ["A", "a", "b"]);
});

test("isRecord 只排除 null 与数组", () => {
    class Example {
        readonly value = 1;
    }

    assert.equal(isRecord({}), true);
    assert.equal(isRecord({ a: 1 }), true);
    assert.equal(isRecord(new Date()), true);
    assert.equal(isRecord(new Map()), true);
    assert.equal(isRecord(new Set()), true);
    assert.equal(isRecord(new Example()), true);
    assert.equal(isRecord(null), false);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord([1]), false);
    assert.equal(isRecord("value"), false);
    assert.equal(isRecord(1), false);
    assert.equal(isRecord(true), false);
    assert.equal(isRecord(undefined), false);
    assert.equal(isRecord(() => 1), false);
});

test("deepFreeze 返回同一引用并先冻结子值", () => {
    const child = { value: 1 };
    const parent = { child };
    const frozen = deepFreeze(parent);

    assert.equal(frozen, parent);
    assert.ok(Object.isFrozen(child));
    assert.ok(Object.isFrozen(parent));
    assert.throws(() => {
        (child as { value: number }).value = 2;
    }, TypeError);
});

test("deepFreeze 在循环引用处终止", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const cyclicArray: unknown[] = [];
    cyclicArray.push(cyclicArray);

    assert.equal(deepFreeze(cyclic), cyclic);
    assert.equal(cyclic.self, cyclic);
    assert.ok(Object.isFrozen(cyclic));
    assert.equal(deepFreeze(cyclicArray), cyclicArray);
    assert.ok(Object.isFrozen(cyclicArray));
});
