import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorkerOperation } from "../src/worker-protocol.js";
test("Worker operation rejects future prompts and hidden grading metadata", () => {
    assert.deepEqual(parseWorkerOperation({ operation: "continue", prompt: "now" }), { operation: "continue", prompt: "now" });
    for (const field of ["stages", "rubric", "verifier", "futurePrompt"]) assert.throws(() => parseWorkerOperation({ operation: "continue", prompt: "now", [field]: "hidden" }), /Unexpected/);
});
