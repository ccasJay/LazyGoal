import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelInferenceView } from "../../model-view/src/index";
import { createDefaultDynamicSectionRegistry } from "../src/index";

const view: ModelInferenceView = {
    prompt: {
        promptBundleVersion: 1,
        phase: "executing",
        stage: "decide",
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
    const runMode = first.find((section) => section.sectionId === "run_mode");
    assert.ok(runMode);
    assert.equal(Object.hasOwn(runMode.projection as object, "planRoute"), false);
});

test("Plan Run projection includes the complete route when Runtime provides it", () => {
    const registry = createDefaultDynamicSectionRegistry();
    const planView: ModelInferenceView = {
        ...view,
        dynamicContext: {
            ...view.dynamicContext,
            runMode: "plan",
            planRoute: {
                revision: 1,
                nextStageIndex: 0,
                stages: [{ stageId: "stage-1", revision: 1, status: "pending", target: "Inspect", acceptanceCriteria: ["Inspect completed"] }],
            },
        },
    };
    const runMode = registry.project(planView).find((section) => section.sectionId === "run_mode");
    assert.ok(runMode);
    assert.deepEqual((runMode.projection as { planRoute?: unknown }).planRoute, planView.dynamicContext.planRoute);
});

test("默认注册表身份与当前 Manifest 模板引用保持一致", () => {
    const registry = createDefaultDynamicSectionRegistry();

    assert.deepEqual(registry.templateIds(), [
        "run-mode@1",
        "approved-task@1",
        "goal-plan@1",
        "authorized-tools@1",
        "working-memory@1",
        "goal-context-navigation@1",
    ]);
});
