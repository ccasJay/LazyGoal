import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { test } from "node:test";

import {
    ALFWORLD_PROMPT_EVALUATION_SIDECAR_PATH,
    runPromptEvaluationCli,
} from "../../src/prompt-evaluation/cli.js";

test("Prompt Evaluation sidecar path resolves", async () => {
    assert.match(ALFWORLD_PROMPT_EVALUATION_SIDECAR_PATH, /\/benchmarks\/alfworld\/python\/sidecar\.py$/u);
    await access(ALFWORLD_PROMPT_EVALUATION_SIDECAR_PATH);
});

test("Prompt Evaluation execution fails clearly without invoking the legacy runner", async () => {
    const errors: string[] = [];
    const exitCode = await runPromptEvaluationCli({ writeError: (line) => errors.push(line) });

    assert.equal(exitCode, 1);
    assert.deepEqual(errors, ["Prompt Evaluation execution is currently unsupported by the Worker/Trigger runtime."]);
});
