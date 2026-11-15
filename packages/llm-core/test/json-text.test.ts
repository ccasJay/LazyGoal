import assert from "node:assert/strict";
import { test } from "node:test";

import { extractJsonText, parseJsonText, repairJsonText } from "../src/json-text";

test("提取裸 JSON 与完整代码块，保留原始正文", () => {
    assert.equal(extractJsonText(' {"answer":"ok"} '), '{"answer":"ok"}');
    assert.equal(extractJsonText("```json\n{\"answer\":\"ok\"}\n```"), '{"answer":"ok"}');
    assert.equal(extractJsonText("```\n[1,2]\n```"), "[1,2]");
});

test("模型不得从正文夹带中自动取值，提取保持原文并交由解析拒绝", () => {
    assert.equal(extractJsonText("说明：{\"answer\":\"ok\"}"), "说明：{\"answer\":\"ok\"}");
    assert.equal(extractJsonText("```json\n{\"answer\":\"ok\"}\n"), undefined);
    assert.equal(extractJsonText("   "), undefined);
});

test("修复只移除末尾逗号与不可见字符", () => {
    assert.equal(repairJsonText('{"a":[1,2,],}'), '{"a":[1,2]}');
    assert.equal(repairJsonText('\uFEFF{"a":1}'), '{"a":1}');
    assert.equal(repairJsonText('{"a":"x",}'), '{"a":"x"}');
    assert.equal(repairJsonText('{"a":1'), '{"a":1');
});

test("解析成功返回值，语法失败返回稳定原因", () => {
    assert.deepEqual(parseJsonText('```json\n{"a":1,}\n```'), { ok: true, value: { a: 1 } });
    assert.deepEqual(parseJsonText("not json"), { ok: false, reason: "invalid_syntax" });
    assert.deepEqual(parseJsonText("说明 {\"a\":1}"), { ok: false, reason: "invalid_syntax" });
    assert.deepEqual(parseJsonText(""), { ok: false, reason: "empty" });
});
