import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeGroups } from "../src/report.js";
test("report denominator includes failed groups and unknown usage is null", () => {
    const common = { stages: [], model: "execution", durationMs: 10, imageId: "image", artifacts: null, score: null, errors: [] };
    const report = summarizeGroups([
        { ...common, group: "restore", category: "infrastructure_error", calls: [] },
        { ...common, group: "full", category: "completed", calls: [null, { inputTokens: 3, outputTokens: 4 }] },
    ], false);
    assert.equal(report.planned, 2);
    assert.equal(report.attempted, 2);
    assert.equal(report.completed, 1);
    assert.equal(report.incomplete, 1);
    assert.equal(report.scoringIncomplete, 2);
    assert.equal(report.passRate, 0);
    assert.equal(report.costs[1]!.inputTokens, null);
    assert.equal(report.costs[1]!.missingCalls, 1);
});
