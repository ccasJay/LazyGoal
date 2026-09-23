import assert from "node:assert/strict";
import { test } from "node:test";
import { createCheckpointToolDeclarations, createUnifiedToolDeclarations } from "../../contracts/src/index";
import { renderWorkingContextMessage } from "../src/render";

import {
    CURRENT_PROMPT_BUNDLE_VERSION,
    DEFAULT_PROMPT_BUNDLE_MANIFEST,
    DEFAULT_PROMPT_TEMPLATE_ASSETS,
    PROMPT_BUNDLE_V1_MANIFEST,
    createDefaultPromptBundleProtocolValidator,
    createDefaultPromptBundleRenderer,
} from "../src/prompting/default-bundles";

const currentProtocols = {
    memoryProtocol: { kind: "structured" as const, version: 1 as const },
    modelContextProtocol: { kind: "trajectory-layered" as const, version: 1 as const },
    contextRetrievalProtocol: { kind: "bm25-lite" as const, version: 1 as const },
};

test("决策模板允许列表与真实系统工具声明一致，禁止列表不授予能力", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    for (const runMode of ["normal", "plan"] as const) {
        const states = runMode === "plan" ? [false, true] : [false];
        for (const taskPresent of states) {
            const text = renderer.render(context({
                runMode,
                ...(taskPresent ? { task: { objective: "Test", completionCriteria: [{ text: "Verified" }] } } : {}),
                ...(runMode === "plan" ? { goalPlan: { revision: 2, items: [] } } : {}),
            }));
            const allowed = text.match(/^Outside checkpoint, allowed system tools: (.+)\.$/m);
            assert.ok(allowed);
            assert.deepEqual(allowed[1]!.split(", ").sort(),
                createUnifiedToolDeclarations([], taskPresent, runMode === "plan").map(tool => tool.id).sort());
            assert.doesNotMatch(text, /system_ask_user|system_task_proposal|contextEpoch\.control|control\.status/);
            if (runMode === "normal") {
                assert.match(text, /act directly on the current user request/);
                assert.doesNotMatch(text, /system_propose_task_plan/);
            } else if (taskPresent) {
                assert.match(text, /system_propose_task_plan is prohibited/);
            } else {
                assert.match(text, /first submit a task proposal/);
                assert.match(text, /This ordering is a Prompt instruction/);
                assert.match(text, /Do not call system_complete_task, system_wait_for_input or system_fail_goal/);
            }
        }
    }
});

test("Checkpoint 指令引用实际控制字段并优先于普通决策", async () => {
    const text = (await createDefaultPromptBundleRenderer()).render(context());
    const message = renderWorkingContextMessage(
        { phase: "executing", intent: "Test", execution: { stepCount: 1 } },
        undefined, undefined, undefined,
        { protocolVersion: 1, epochNumber: 0, conversationStartIndex: 0, openedAtSequence: 0,
            control: { status: "checkpoint_required", reason: "input_threshold" } },
    );
    assert.equal(JSON.parse(message.content).checkpointRequired, true);
    const checkpoint = text.match(/Checkpoint takes precedence[^\n]+call only ([a-z_]+)\./);
    assert.ok(checkpoint);
    assert.deepEqual([checkpoint[1]], createCheckpointToolDeclarations().map(tool => tool.id));
    assert.match(text, /Do not emit an Action, completion, wait, question, proposal or GoalPlan update/);
    assert.match(text, /do not create a new PlanItem during executing/);
    assert.match(text, /may cite only committed Tool\/Observation sequences/);
    assert.match(text, /Runtime allocates and persists execution metadata/);
});

function context(overrides: Record<string, unknown> = {}) {
    return {
        promptBundleVersion: 1 as const,
        phase: "executing" as const,
        runMode: "normal" as const,
        profile: {
            id: "profile-1",
            systemPrompt: "system",
            instructions: [],
        },
        authorizedTools: [],
        ...currentProtocols,
        ...overrides,
    };
}

test("默认 Prompt Bundle 只有当前 v1 组合", async () => {
    assert.equal(CURRENT_PROMPT_BUNDLE_VERSION, 1);
    assert.equal(DEFAULT_PROMPT_BUNDLE_MANIFEST, PROMPT_BUNDLE_V1_MANIFEST);
    assert.deepEqual(
        DEFAULT_PROMPT_BUNDLE_MANIFEST,
        {
            version: 1,
            ...currentProtocols,
            sections: [
                { slot: "global_overview", templateId: "global-overview@1" },
                { slot: "profile", templateId: "profile@1" },
                {
                    slot: "phase_protocol",
                    templates: {
                        executing: "agent-decision@1",
                    },
                },
                { slot: "authorized_tools", templateId: "authorized-tools@1" },
            ],
        },
    );
    assert.deepEqual(
        DEFAULT_PROMPT_TEMPLATE_ASSETS.map((asset) => asset.id),
        [
            "global-overview@1",
            "profile@1",
            "agent-decision@1",
            "authorized-tools@1",
        ],
    );
});

test("默认 Renderer 可编译当前模板并拒绝历史 Bundle", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const rendered = renderer.render(context());

    assert.match(rendered, /trajectory-layered@1/);
    assert.match(rendered, /bm25-lite@1/);
    assert.deepEqual(renderer.render(context()), renderer.render(context()));
    assert.throws(
        () => renderer.render(context({ promptBundleVersion: 8 })),
        /不支持的 Prompt Bundle 版本|UnsupportedPromptBundleVersionError/,
    );
});

test("v1 Prompt 按 Run 模式规定提案、完成与证据协议", async () => {
    const renderer = await createDefaultPromptBundleRenderer();

    const normal = renderer.render(context({ runMode: "normal" }));
    assert.match(normal, /act directly on the current user request/);
    assert.match(normal, /evidenceSequences/);
    assert.match(normal, /system_complete_task, system_wait_for_input, system_fail_goal, system_context_lookup, ask_user/);
    assert.doesNotMatch(normal, /system_propose_task_plan|terminal completion decisions .* prohibited/);

    // Plan 未批准：先提案是 Prompt 顺序约束，Runtime 仍使用既有工具授权。
    const unapproved = renderer.render(context({ runMode: "plan" }));
    assert.match(unapproved, /first submit a task proposal/);
    assert.match(unapproved, /Outside checkpoint, allowed system tools: ask_user, system_context_lookup, system_propose_task_plan, system_update_goal_plan/);
    assert.match(unapproved, /This ordering is a Prompt instruction/);
    assert.match(unapproved, /Runtime still handles every business Tool request under existing Profile, Tool Policy and Action approval rules/);
    assert.match(unapproved, /Do not call system_complete_task, system_wait_for_input or system_fail_goal/);
    assert.match(unapproved, /Committed Tool\/Observation evidence has priority/);
    assert.match(unapproved, /User answers from ask_user or task proposals are not Tool\/Observation evidence/);
    assert.match(unapproved, /must never be cited as completion evidence/);

    // Plan 获批：仍逐条件验证提案中固定的完成条件。
    const approved = renderer.render(context({
        runMode: "plan",
        task: {
            objective: "实现目标",
            completionCriteria: [{ text: "标准1" }],
        },
    }));
    assert.match(approved, /Approved Goal Task Contract:/);
    assert.match(approved, /Objective: 实现目标/);
    assert.match(approved, /system_complete_task, system_wait_for_input, system_fail_goal, system_context_lookup, ask_user, system_update_goal_plan/);
    assert.match(approved, /completionEvidence/);
    assert.match(approved, /Continue from the latest committed Tool\/Observation evidence/);
    assert.match(approved, /system_propose_task_plan is prohibited after a task has been approved/);
    assert.match(approved, /User answers from ask_user or task proposals are not Tool\/Observation evidence/);
    assert.doesNotMatch(approved, /Plan Phase|probe/i);
});

test("默认协议校验器只接受唯一当前组合", () => {
    const validator = createDefaultPromptBundleProtocolValidator();
    validator.validate({ promptBundleVersion: 1, ...currentProtocols });

    for (const invalid of [
        { promptBundleVersion: 8, ...currentProtocols },
        {
            promptBundleVersion: 1,
            memoryProtocol: { kind: "checkpoint", version: 1 },
            modelContextProtocol: currentProtocols.modelContextProtocol,
            contextRetrievalProtocol: currentProtocols.contextRetrievalProtocol,
        },
        {
            promptBundleVersion: 1,
            memoryProtocol: currentProtocols.memoryProtocol,
            modelContextProtocol: { kind: "trajectory-layered", version: 2 },
            contextRetrievalProtocol: currentProtocols.contextRetrievalProtocol,
        },
        {
            promptBundleVersion: 1,
            memoryProtocol: currentProtocols.memoryProtocol,
            modelContextProtocol: currentProtocols.modelContextProtocol,
            contextRetrievalProtocol: { kind: "bm25-lite", version: 2 },
        },
    ]) {
        assert.throws(() => validator.validate(invalid as never), /仅支持/);
    }
});

test("Goal-stable 根前缀确定性渲染任务契约与决策分支", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const task = {
        objective: "完成测试目标",
        completionCriteria: [{ text: "标准1" }, { text: "标准2" }],
    };
    const rendered1 = renderer.render(context({ phase: "executing", runMode: "plan", task }));
    const rendered2 = renderer.render(context({ phase: "executing", runMode: "plan", task }));

    assert.equal(rendered1, rendered2);
    assert.match(rendered1, /Approved Goal Task Contract:/);
    assert.match(rendered1, /Objective: 完成测试目标/);
    assert.match(rendered1, /- \[0\] 标准1/);
    assert.match(rendered1, /native tool calls/);
    assert.match(rendered1, /system_complete_task/);
    assert.match(rendered1, /system_wait_for_input/);
});
