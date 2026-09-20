import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentProfile } from "../../../packages/runtime/src/agent-profile.js";
import {
    PromptEvaluationProfileError,
    derivePromptEvaluationProfile,
    fingerprintPromptEvaluationCandidate,
    validatePromptEvaluationProfile,
} from "../../src/prompt-evaluation/profile.js";

const baseProfile: AgentProfile = Object.freeze({
    id: "fixture-profile",
    name: "Fixture",
    description: "Fixture profile",
    systemPrompt: "Base system Prompt",
    instructions: Object.freeze(["Base instruction"]),
    toolIds: Object.freeze(["read_file", "submit"]),
});

const candidate = Object.freeze({
    id: "candidate-1",
    baseProfileId: "fixture-profile",
    systemPrompt: "Candidate system Prompt",
    instructions: Object.freeze(["Candidate instruction", "Submit only after verification"]),
});

test("derivePromptEvaluationProfile changes only Prompt fields and deep-freezes the result", () => {
    const profile = derivePromptEvaluationProfile(baseProfile, candidate);

    assert.deepEqual(profile, {
        ...baseProfile,
        systemPrompt: candidate.systemPrompt,
        instructions: [...candidate.instructions],
        toolIds: [...baseProfile.toolIds],
    });
    assert.notEqual(profile, baseProfile);
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(Object.isFrozen(profile.instructions), true);
    assert.equal(Object.isFrozen(profile.toolIds), true);
});

test("derivePromptEvaluationProfile rejects mismatched base identities and invalid Prompt fields", () => {
    assert.throws(
        () => derivePromptEvaluationProfile(baseProfile, { ...candidate, baseProfileId: "other" }),
        (error: unknown) => error instanceof PromptEvaluationProfileError
            && error.code === "BASE_PROFILE_MISMATCH"
            && error.field === "candidate.baseProfileId",
    );
    assert.throws(
        () => derivePromptEvaluationProfile(baseProfile, { ...candidate, instructions: [""] }),
        (error: unknown) => error instanceof PromptEvaluationProfileError
            && error.code === "INVALID_PROMPT"
            && error.field === "candidate.instructions[0]",
    );
});

test("validatePromptEvaluationProfile rejects frozen-field drift at the Worker boundary", () => {
    const profile = derivePromptEvaluationProfile(baseProfile, candidate);
    const restored = validatePromptEvaluationProfile(JSON.parse(JSON.stringify(profile)), baseProfile);
    assert.deepEqual(restored, profile);
    assert.equal(Object.isFrozen(restored.instructions), true);

    assert.throws(
        () => validatePromptEvaluationProfile({ ...profile, toolIds: ["bash"] }, baseProfile),
        (error: unknown) => error instanceof PromptEvaluationProfileError
            && error.code === "FROZEN_FIELD_CHANGED"
            && error.field === "profile.toolIds",
    );
    assert.throws(
        () => validatePromptEvaluationProfile({ ...profile, id: "candidate-profile" }, baseProfile),
        (error: unknown) => error instanceof PromptEvaluationProfileError
            && error.field === "profile.id",
    );
});

test("fingerprintPromptEvaluationCandidate is stable and excludes candidate identity", () => {
    const first = fingerprintPromptEvaluationCandidate(candidate);
    const samePrompt = fingerprintPromptEvaluationCandidate({
        systemPrompt: candidate.systemPrompt,
        instructions: [...candidate.instructions],
    });
    const changed = fingerprintPromptEvaluationCandidate({
        systemPrompt: `${candidate.systemPrompt}!`,
        instructions: candidate.instructions,
    });

    assert.equal(first.promptSha256, samePrompt.promptSha256);
    assert.notEqual(first.promptSha256, changed.promptSha256);
    assert.deepEqual(first.promptSummary, {
        systemPromptCharacters: 23,
        instructionCount: 2,
        instructionCharacters: 51,
    });
});
