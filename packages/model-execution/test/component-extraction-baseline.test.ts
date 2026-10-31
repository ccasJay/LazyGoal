/**
 * 模型执行组件的行为对照回归。
 *
 * @remarks
 * 读取 `fixtures/component-extraction-baseline/baseline.json`（由
 * `component-extraction-baseline.generate.ts` 生成）并重新计算当前行为逐项比较。
 * 测试不写入或刷新基线；行为差异必须修复实现，而不是重建基线。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildComponentExtractionBaseline } from "./component-extraction-baseline-scenarios";

const baseline = JSON.parse(
    readFileSync(
        new URL("./fixtures/component-extraction-baseline/baseline.json", import.meta.url),
        "utf8",
    ),
) as {
    readonly version: number;
    readonly sourceFingerprint: string;
    readonly templates: readonly { readonly id: string; readonly body: string }[];
    readonly scenarios: Record<string, unknown>;
};

test("保存的消息、契约、预算、frame、模板与调用后果保持一致", async () => {
    const current = await buildComponentExtractionBaseline();

    assert.deepEqual(current, baseline);
});

test("基线记录来源指纹与全部当前模板正文", () => {
    assert.equal(baseline.version, 1);
    assert.match(baseline.sourceFingerprint, /^sha256:[0-9a-f]{64}$/);
    for (const template of baseline.templates) {
        assert.ok(template.id.length > 0);
        assert.ok(template.body.length > 0);
    }
    assert.equal(
        baseline.templates.some((template) => template.id === "global-overview@1"),
        true,
    );
});
