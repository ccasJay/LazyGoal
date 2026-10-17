import assert from "node:assert/strict";
import { test } from "node:test";

import type { ModelInferenceView, PromptContext } from "../../model-view/src/index";
import {
    DynamicSectionRegistry,
    InMemoryLoader,
    PromptRenderError,
    createPromptBundleRenderer,
    createPromptEnvironment,
    normalizeNewlines,
} from "../src/index";

const templates = [
    { id: "global-overview@1", source: "GLOBAL" },
    { id: "profile@1", source: "PROFILE {{ profile.systemPrompt }}" },
    { id: "agent-decision@1", source: "DECIDE" },
    { id: "agent-think@1", source: "THINK" },
    { id: "run-mode@1", source: "MODE {{ section.projection.mode }}" },
];

const manifest = {
    version: 1 as const,
    memoryProtocol: { kind: "structured" as const, version: 1 as const },
    modelContextProtocol: { kind: "trajectory-layered" as const, version: 1 as const },
    contextRetrievalProtocol: { kind: "bm25-lite" as const, version: 1 as const },
    sections: [
        { slot: "global_overview" as const, templateId: "global-overview@1" },
        { slot: "profile" as const, templateId: "profile@1" },
        {
            slot: "phase_protocol" as const,
            templates: { decide: "agent-decision@1", think: "agent-think@1" },
        },
    ],
};

function prompt(stage: "decide" | "think"): PromptContext {
    return {
        promptBundleVersion: 1,
        phase: "executing",
        stage,
        profile: { id: "profile-1", systemPrompt: "base", instructions: [] },
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    };
}

function view(): ModelInferenceView {
    return {
        prompt: prompt("decide"),
        dynamicContext: { runMode: "normal", goalPlanWritable: false, authorizedTools: [] },
        conversation: [],
        workingContext: { phase: "executing", intent: "demo", execution: { stepCount: 0 } },
        workingMemory: {
            protocolVersion: 1,
            derivedThroughSequence: 0,
            facts: [],
            hypotheses: [],
            blockers: [],
        },
        contextEpoch: {
            protocolVersion: 1,
            epochNumber: 0,
            conversationStartIndex: 0,
            openedAtSequence: 0,
            control: { status: "active" },
        },
    };
}

test("仅经公共入口的内存模板即可渲染固定 system 与动态 Section，无需默认 Bundle", () => {
    const dynamicSectionRegistry = new DynamicSectionRegistry([{
        id: "run_mode",
        order: 10,
        source: "RunState.mode",
        role: "user",
        templateId: "run-mode@1",
        project: (input) => ({ mode: input.dynamicContext.runMode }),
    }]);
    const renderer = createPromptBundleRenderer({
        templates,
        bundles: [manifest],
        dynamicSectionRegistry,
    });

    assert.equal(renderer.render(prompt("decide")), "GLOBAL\n\nPROFILE base\n\nDECIDE");
    assert.equal(renderer.render(prompt("think")), "GLOBAL\n\nPROFILE base\n\nTHINK");
    const dynamic = renderer.renderDynamicSections(view());
    assert.equal(dynamic.length, 1);
    assert.match(dynamic[0]?.content ?? "", /^\[Dynamic section: run_mode; source: RunState\.mode\]\nMODE normal$/);
    assert.deepEqual(renderer.dynamicSectionIdentities().map((identity) => identity.sectionId), ["run_mode"]);
});

test("InMemoryLoader 拒绝未注册模板，渲染错误保持脱敏", () => {
    const loader = new InMemoryLoader(new Map([["profile@1", "P"]]));
    assert.throws(() => loader.getSource("missing@1"), /未注册/);

    const renderer = createPromptBundleRenderer({
        templates: [
            ...templates.filter((template) => template.id !== "agent-decision@1"),
            { id: "agent-decision@1", source: "{{ missingVar }}" },
        ],
        bundles: [manifest],
    });
    assert.throws(
        () => renderer.render(prompt("decide")),
        (error: unknown) => error instanceof PromptRenderError
            && error.slot === "phase_protocol"
            && error.templateId === "agent-decision@1"
            && !error.message.includes("base"),
    );
});

test("封闭环境与换行规范化保持确定性", () => {
    const environment = createPromptEnvironment(new InMemoryLoader(new Map()));
    assert.equal(environment.renderString("A{{ value }}B", { value: 1 }), "A1B");
    assert.equal(normalizeNewlines("a\r\nb\rc"), "a\nb\nc");

    const renderer = createPromptBundleRenderer({
        templates: templates.map((template) => ({
            ...template,
            source: normalizeNewlines(`${template.source}\r\n`),
        })),
        bundles: [manifest],
    });
    const first = renderer.render(prompt("decide"));
    assert.equal(first, renderer.render(prompt("decide")));
    assert.equal(first.endsWith("\n"), false);
});
