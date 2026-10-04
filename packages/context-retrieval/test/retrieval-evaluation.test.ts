import assert from "node:assert/strict";
import { test } from "node:test";

import { runFixedCorpusEvaluation } from "./evaluation-corpus";

test("固定语料检索评测：无需 Runtime 即可报告质量指标与耗时，且不低于迁移前基线", () => {
    const report = runFixedCorpusEvaluation();

    // 验证基线指标（拆分前基线：Recall@5 = 1.0, MRR = 1.0, negativeAccuracy = 1.0）
    assert.equal(report.positiveCount, 6);
    assert.equal(report.negativeCount, 2);
    assert.ok(report.recallAt5 >= 1.0, `Recall@5 should be >= 1.0, got ${report.recallAt5}`);
    assert.ok(report.mrr >= 1.0, `MRR should be >= 1.0, got ${report.mrr}`);
    assert.ok(report.negativeAccuracy >= 1.0, `negativeAccuracy should be >= 1.0, got ${report.negativeAccuracy}`);

    // 耗时只记录报告，不使用机器相关硬阈值断言失败
    assert.ok(report.tokenizationTimeMs >= 0);
    assert.ok(report.queryTimeMs >= 0);
});
