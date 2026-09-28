import assert from "node:assert/strict";
import { test } from "node:test";

import { createRuntimeFeedback } from "../src/runtime-feedback";

test("RuntimeFeedback bounds issue count, paths, and untrusted text fields", () => {
    const feedback = createRuntimeFeedback({
        goalId: "goal-1",
        runId: "run-1",
        executionUnitId: "unit-1",
        stepOrdinal: 1,
        stage: "decide",
        origin: "output_contract",
        code: "C".repeat(100),
        attempt: 1,
        issues: Array.from({ length: 10 }, (_, index) => ({
            code: `issue-${index}`,
            path: Array.from({ length: 10 }, () => "p".repeat(100)),
            message: "m".repeat(300),
        })),
        constraints: Array.from({ length: 10 }, () => "c".repeat(300)),
    });

    assert.equal(feedback.code.length, 80);
    assert.equal(feedback.issues.length, 8);
    assert.equal(feedback.issues[0]?.path.length, 8);
    assert.equal(String(feedback.issues[0]?.path[0]).length, 80);
    assert.equal(feedback.issues[0]?.message.length, 240);
    assert.equal(feedback.constraints?.length, 8);
    assert.equal(feedback.constraints?.[0]?.length, 240);
});
