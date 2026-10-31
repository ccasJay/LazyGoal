import assert from "node:assert/strict";
import { test } from "node:test";

import { alfworldResetInputBinding } from "../alfworld/src/generated/alfworld-reset/binding.js";
import { alfworldStepInputBinding } from "../alfworld/src/generated/alfworld-step/binding.js";
import { submitAnswerInputBinding } from "../gaia/src/generated/submit-answer/binding.js";
import { contextShellInputBinding } from "../context/src/generated/context-shell/binding.js";

const cases = [
    {
        id: "alfworld_reset",
        binding: alfworldResetInputBinding,
        valid: {},
        invalid: null,
        unknown: { extra: 1 },
    },
    {
        id: "alfworld_step",
        binding: alfworldStepInputBinding,
        valid: { command: "look" },
        invalid: { command: 1 },
        unknown: { command: "look", extra: 1 },
    },
    {
        id: "submit_answer",
        binding: submitAnswerInputBinding,
        valid: { answer: "Paris" },
        invalid: {},
        unknown: { answer: "Paris", extra: 1 },
    },
    {
        id: "context_shell",
        binding: contextShellInputBinding,
        valid: { command: "ls" },
        invalid: { command: 1 },
        unknown: { command: "ls", extra: 1 },
    },
] as const;

test("评测与远程 Worker 的生成输入绑定共享读取语义", () => {
    for (const item of cases) {
        assert.match(item.binding.contractId, /^tool\.[a-z0-9_]+\.input$/u, item.id);

        const valid = item.binding.read(item.valid, "strip");
        assert.equal(valid.ok, true, `${item.id} valid input was rejected`);

        const invalid = item.binding.read(item.invalid, "strip");
        assert.equal(invalid.ok, false, `${item.id} accepted invalid known field`);

        const unknown = item.binding.read(item.unknown, "strip");
        assert.equal(unknown.ok, true, `${item.id} rejected unknown-only field`);
        if (unknown.ok) {
            assert.ok((unknown.diagnostic?.paths.length ?? 0) > 0, item.id);
        }
    }
});
