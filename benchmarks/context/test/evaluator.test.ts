import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate } from "../src/evaluator.js";
import { judgeExplanation } from "../src/judge.js";
test("Judge high score cannot override deterministic failure or isolation", async () => {
    const judge = await judgeExplanation({ structuredOutputMode: "prompt_only", generate: async () => ({ content: JSON.stringify({ score: 1, rationale: "verified", evidence: ["output"] }) }) }, "Explain", { output: "answer" }, new AbortController().signal);
    assert.equal(judge.usage, null);
    assert.equal(evaluate(false, judge, 0.8, []).combined, "failed");
    assert.equal(evaluate(true, judge, 0.8, ["artifact_modified"]).combined, "failed");
    assert.equal(evaluate(true, judge, 0.8, []).combined, "passed");
});
test("invalid, unavailable and uncited Judge responses stay incomplete", async () => {
    for (const response of ["bad JSON", JSON.stringify({ score: 1, rationale: "fine", evidence: ["absent"] })]) {
        const judge = await judgeExplanation({ structuredOutputMode: "prompt_only", generate: async () => ({ content: response }) }, "Explain", { output: "answer" }, new AbortController().signal);
        assert.equal(judge.status, "incomplete");
        assert.equal(evaluate(true, judge, 0.8, []).combined, "incomplete");
        assert.equal(evaluate(false, judge, 0.8, []).combined, "failed");
    }
    const judge = await judgeExplanation({ structuredOutputMode: "prompt_only", generate: async () => { throw new Error("Unavailable"); } }, "Explain", { output: "answer" }, new AbortController().signal);
    assert.equal(judge.status, "incomplete");
    assert.equal(judge.score, null);
});
