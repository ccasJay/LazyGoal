import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelInferenceView } from "../src/model-inference-view";
import {
    DynamicSectionRegistry,
    createDefaultDynamicSectionRegistry,
} from "../src/prompting/dynamic-section-registry";

const view: ModelInferenceView = {
    prompt: {
        promptBundleVersion: 1,
        phase: "executing",
        profile: { id: "profile-1", systemPrompt: "system", instructions: [] },
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    },
    dynamicContext: { runMode: "normal", goalPlanWritable: false, authorizedTools: [] },
    conversation: [],
    workingContext: { phase: "executing", intent: "完成目标", execution: { stepCount: 0 } },
    workingMemory: {
        protocolVersion: 1,
        derivedThroughSequence: 0,
        facts: [],
        hypotheses: [],
        plan: [],
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

test("默认注册表稳定输出五个首版 section 的身份、来源、角色和顺序", () => {
    const registry = createDefaultDynamicSectionRegistry();
    const first = registry.project(view);
    const second = registry.project(view);

    assert.deepEqual(first, second);
    assert.deepEqual(first.map(({ sectionId, source, role, order }) => ({ sectionId, source, role, order })), [
        { sectionId: "run_mode", source: "Goal.intent + RunState.mode", role: "user", order: 10 },
        { sectionId: "authorized_tools", source: "Runtime.authorizedTools", role: "user", order: 40 },
        { sectionId: "working_memory", source: "WorkingMemory", role: "user", order: 50 },
    ]);
});

test("注册第六个 section 只需增加定义，通用注册表会按顺序投影", () => {
    const registry = new DynamicSectionRegistry([
        {
            id: "future_section",
            order: 60,
            source: "FutureState.value",
            role: "user",
            templateId: "future-section@1",
            project: (input) => ({ intent: input.workingContext.intent }),
        },
        {
            id: "earlier_section",
            order: 5,
            source: "FutureState.earlier",
            role: "user",
            templateId: "earlier-section@1",
            project: () => ({ enabled: true }),
        },
    ]);

    assert.deepEqual(registry.templateIds(), ["earlier-section@1", "future-section@1"]);
    assert.deepEqual(registry.project(view).map((section) => section.sectionId), [
        "earlier_section",
        "future_section",
    ]);
    assert.deepEqual(registry.project(view)[1]?.projection, { intent: "完成目标" });
});

test("注册表拒绝重复身份、顺序及非 user 角色", () => {
    const definition = {
        id: "section_one",
        order: 10,
        source: "Source.one",
        role: "user" as const,
        templateId: "section-one@1",
        project: () => ({ value: 1 }),
    };

    assert.throws(() => new DynamicSectionRegistry([definition, definition]), /Duplicate dynamic section ID/);
    assert.throws(() => new DynamicSectionRegistry([
        definition,
        { ...definition, id: "section_two", templateId: "section-two@1" },
    ]), /Duplicate dynamic section order/);
    assert.throws(() => new DynamicSectionRegistry([
        { ...definition, role: "system" as never },
    ]), /Unsupported role/);
});
