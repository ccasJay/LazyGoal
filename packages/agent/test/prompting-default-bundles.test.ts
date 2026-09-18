import assert from "node:assert/strict";
import { test } from "node:test";

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

function context(overrides: Record<string, unknown> = {}) {
    return {
        promptBundleVersion: 1 as const,
        phase: "executing" as const,
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

test("v1 Prompt 明确 Working Memory、交互边界与区分任务状态", async () => {
    const renderer = await createDefaultPromptBundleRenderer();

    // 1. 无 task（计划期/未批准任务）
    const unapproved = renderer.render(context({ task: undefined }));
    assert.match(unapproved, /Plan Phase \(Task Not Yet Approved\)/);
    assert.match(unapproved, /authorized read-only tool, system_ask_user, system_context_lookup, or system_task_proposal/);
    assert.match(unapproved, /Writing tools and terminal completion decisions .* are strictly prohibited/);
    assert.match(unapproved, /User answers from system_ask_user or task proposals are not Tool\/Observation evidence/);
    assert.match(unapproved, /must never be cited as completion evidence/);

    // 2. 有 task（已批准任务）
    const approved = renderer.render(context({
        task: {
            objective: "实现目标",
            completionCriteria: [{ text: "标准1" }],
        },
    }));
    assert.match(approved, /Approved Goal Task Contract:/);
    assert.match(approved, /Objective: 实现目标/);
    assert.match(approved, /system_complete_task, system_wait_for_input, system_fail_goal, system_context_lookup, or system_ask_user/);
    assert.match(approved, /system_task_proposal is prohibited after a task has been approved/);
    assert.match(approved, /User answers from system_ask_user or task proposals are not Tool\/Observation evidence/);
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
    const rendered1 = renderer.render(context({ phase: "executing", task }));
    const rendered2 = renderer.render(context({ phase: "executing", task }));

    assert.equal(rendered1, rendered2);
    assert.match(rendered1, /Approved Goal Task Contract:/);
    assert.match(rendered1, /Objective: 完成测试目标/);
    assert.match(rendered1, /- \[0\] 标准1/);
    assert.match(rendered1, /native tool calls/);
    assert.match(rendered1, /system_complete_task/);
    assert.match(rendered1, /system_wait_for_input/);
});

