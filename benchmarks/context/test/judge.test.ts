import assert from "node:assert/strict";
import { test } from "node:test";
import { judgeExplanation } from "../src/judge.js";
test("Judge saves independent rubric request, raw response, and actual usage", async () => {
    const response = { content: JSON.stringify({ score: 0.9, rationale: "Matches verified file", evidence: ["verifier"] }), providerMetadata: { usage: { inputTokens: 12, outputTokens: 4 } } };
    const result = await judgeExplanation({ structuredOutputMode: "prompt_only", generate: async () => response }, "Fixed rubric", { verifier: "Verified" }, new AbortController().signal);
    assert.equal(result.score, 0.9);
    assert.equal(result.response, response);
    assert.ok(result.request.messages[1]!.content.includes("Fixed rubric"));
    assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 4 });
});

test("missing explanation evidence prevents Judge acceptance", async () => {
    let calls = 0;
    const result = await judgeExplanation({ structuredOutputMode: "prompt_only", generate: async () => { calls++; throw new Error("Must not call"); } }, "Explain", { output: "" }, new AbortController().signal);
    assert.equal(calls, 0);
    assert.equal(result.status, "incomplete");
    assert.match(result.error!, /evidence missing/);
});
