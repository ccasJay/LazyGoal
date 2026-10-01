import assert from "node:assert/strict";
import { test } from "node:test";

import { getEncoding } from "js-tiktoken";

import { createDefaultPromptBundleRenderer } from "../src/prompting/default-bundles";
import type { PromptContext, PromptStage } from "../src/model-inference-view";

const protocols = {
    memoryProtocol: { kind: "structured" as const, version: 1 as const },
    modelContextProtocol: { kind: "trajectory-layered" as const, version: 1 as const },
    contextRetrievalProtocol: { kind: "bm25-lite" as const, version: 1 as const },
};

function fixedInstructionText(rendered: string, stage: PromptStage): string {
    const profileStart = rendered.indexOf("\n\nProfile System Prompt:\n");
    const stageHeading = `\n\nActive ${stage === "decide" ? "Decide" : "Think"} Instructions:`;
    const stageStart = rendered.indexOf(stageHeading);

    assert.ok(profileStart >= 0, "rendered system prompt must preserve the Profile section");
    assert.ok(stageStart > profileStart, "rendered system prompt must include the selected stage instructions");

    return `${rendered.slice(0, profileStart)}\n\n${rendered.slice(stageStart + 2)}`;
}

test("Decide 与 Think 固定指令测量真实 tokens 并检查最低覆盖，不设长度上限", async (context) => {
    const renderer = await createDefaultPromptBundleRenderer();
    const profileBody = "Frozen profile text remains present but is excluded from the fixed instruction budget.";
    const base: Omit<PromptContext, "stage"> = {
        promptBundleVersion: 1,
        phase: "executing",
        profile: { id: "reference-profile", systemPrompt: profileBody, instructions: ["Frozen profile instruction"] },
        ...protocols,
    };
    const encoding = getEncoding("o200k_base");

    for (const stage of ["decide", "think"] as const) {
        const rendered = renderer.render({ ...base, stage });
        assert.match(rendered, new RegExp(profileBody));
        assert.match(rendered, /Frozen profile instruction/);

        const fixedText = fixedInstructionText(rendered, stage);
        assert.doesNotMatch(fixedText, /Frozen profile text|Frozen profile instruction/);
        assert.doesNotMatch(fixedText, /responseShapeGuide|Response Shape Guide/);
        const tokens = encoding.encode(fixedText).length;

        assert.ok(tokens >= 2_000, `${stage} fixed instructions are too short: ${tokens} tokens`);
        context.diagnostic(`${stage} fixed instructions: ${tokens} o200k_base tokens (no upper limit)`);

        if (stage === "decide") {
            assert.match(fixedText, /request_think/);
            assert.match(fixedText, /exactly one decision result/);
            assert.match(fixedText, /committed Tool\/Observation evidence/);
            assert.match(fixedText, /Plan Run without an approved task/);
        } else {
            assert.match(fixedText, /explicit Think goal/);
            assert.match(fixedText, /free-text output/);
            assert.match(fixedText, /This stage has no Tool execution interface/);
            assert.match(fixedText, /Previous Think text is another model's analysis/);
            assert.match(fixedText, /recommended next decision/);
        }
    }
});

test("Decide 与 Think 共享完全相同的固定基础指令且阶段模板不执行动态数据", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const context: Omit<PromptContext, "stage"> = {
        promptBundleVersion: 1,
        phase: "executing",
        profile: {
            id: "profile-literal",
            systemPrompt: "{{ profileInjected }} {% if true %}literal{% endif %}",
            instructions: ["{{ instructionInjected }}"],
        },
        ...protocols,
    };
    const decide = renderer.render({ ...context, stage: "decide" });
    const think = renderer.render({ ...context, stage: "think" });
    const decideFixed = fixedInstructionText(decide, "decide");
    const thinkFixed = fixedInstructionText(think, "think");

    const decideBase = decideFixed.slice(0, decideFixed.indexOf("\n\nActive Decide Instructions:"));
    const thinkBase = thinkFixed.slice(0, thinkFixed.indexOf("\n\nActive Think Instructions:"));
    assert.equal(decideBase, thinkBase);
    assert.match(decide, /\{\{ profileInjected \}\} \{% if true %\}literal\{% endif %\}/);
    assert.match(think, /\{\{ instructionInjected \}\}/);
});
