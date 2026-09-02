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
                        gathering_context: "gathering-context@1",
                        planning: "planning@1",
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
            "gathering-context@1",
            "planning@1",
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
    assert.deepEqual(renderer.render(context({ phase: "gathering_context" })), renderer.render(context({ phase: "gathering_context" })));
    assert.throws(
        () => renderer.render(context({ promptBundleVersion: 8 })),
        /不支持的 Prompt Bundle 版本|UnsupportedPromptBundleVersionError/,
    );
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
