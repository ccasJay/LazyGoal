import assert from "node:assert/strict";
import { test } from "node:test";

import type { PromptContext } from "../src/model-inference-view";
import { PromptRenderError } from "../src/prompting/errors";
import { createPromptBundleRenderer } from "../src/prompting/renderer";
import type {
    PromptBundleManifest,
    PromptTemplateDefinition,
} from "../src/prompting/types";

const templates: readonly PromptTemplateDefinition[] = [
    { id: "global-overview@1", source: "GLOBAL-OVERVIEW" },
    { id: "profile@1", source: "PROFILE {{ profile.systemPrompt }}" },
    { id: "gathering-context@1", source: "GATHERING" },
    { id: "planning@1", source: "PLANNING" },
    { id: "agent-decision@1", source: "DECISION" },
    { id: "authorized-tools@1", source: "TOOLS {{ authorizedTools | stableJson }}" },
];

const manifest: PromptBundleManifest = {
    version: 1,
    memoryProtocol: { kind: "structured", version: 1 },
    modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
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
};

function buildContext(overrides: Partial<PromptContext> = {}): PromptContext {
    return {
        promptBundleVersion: 1,
        phase: "gathering_context",
        profile: { id: "profile-1", systemPrompt: "base", instructions: [] },
        authorizedTools: [],
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        ...overrides,
    };
}

test("Renderer 对相同输入重复渲染产生字符级一致输出", () => {
    const renderer = createPromptBundleRenderer({ templates, bundles: [manifest] });
    const context = buildContext();

    const first = renderer.render(context);
    const second = renderer.render(context);

    assert.equal(first, second);
    assert.equal(
        first,
        "GLOBAL-OVERVIEW\n\nPROFILE base\n\nGATHERING\n\nTOOLS []",
    );
});

test("Renderer 按 Manifest section 顺序组成输出且不受模板注册顺序影响", () => {
    const reversed = createPromptBundleRenderer({
        templates: [...templates].reverse(),
        bundles: [manifest],
    });
    const normal = createPromptBundleRenderer({ templates, bundles: [manifest] });

    assert.equal(
        normal.render(buildContext()),
        reversed.render(buildContext()),
    );
});

test("Profile 与 ToolDefinition 中的 Nunjucks 语法只作为数据插入，不二次执行", () => {
    const renderer = createPromptBundleRenderer({ templates, bundles: [manifest] });
    const context = buildContext({
        profile: {
            id: "profile-1",
            systemPrompt: "{{ not_defined_var }} {% if true %}x{% endif %}",
            instructions: ["{{ another_missing }}"],
        },
        authorizedTools: [
            {
                id: "tool-1",
                description: "{{ injection }}",
                inputSchema: { note: "{% raw %}" },
            },
        ],
    });

    const output = renderer.render(context);

    assert.ok(output.includes("{{ not_defined_var }}"));
    assert.ok(output.includes("{% if true %}x{% endif %}"));
});

test("stableJson 按代码单元顺序稳定输出对象键，空数组固定为 []", () => {
    const renderer = createPromptBundleRenderer({ templates, bundles: [manifest] });
    const context = buildContext({
        authorizedTools: [
            {
                id: "tool-1",
                description: "d",
                inputSchema: { zebra: 1, apple: 2, mango: [3, 1, 2] },
            },
        ],
    });

    const output = renderer.render(context);

    assert.ok(output.includes('"apple": 2'));
    assert.ok(output.includes('"zebra": 1'));
    assert.ok(output.indexOf('"apple"') < output.indexOf('"zebra"'));

    assert.ok(
        createPromptBundleRenderer({ templates, bundles: [manifest] })
            .render(buildContext())
            .endsWith("TOOLS []"),
    );
});

test("模板源码 CRLF 统一为 LF，且输出无结尾换行", () => {
    const crlfTemplates: readonly PromptTemplateDefinition[] = [
        { id: "global-overview@1", source: "LINE-A\r\nLINE-B\r\n" },
        { id: "profile@1", source: "P" },
        { id: "gathering-context@1", source: "G" },
        { id: "planning@1", source: "P2" },
        { id: "agent-decision@1", source: "D" },
        { id: "authorized-tools@1", source: "T" },
    ];
    const renderer = createPromptBundleRenderer({
        templates: crlfTemplates,
        bundles: [manifest],
    });

    const output = renderer.render(buildContext());

    assert.equal(output, "LINE-A\nLINE-B\n\nP\n\nG\n\nT");
    assert.ok(!output.endsWith("\n"));
    assert.ok(!output.includes("\r"));
});

test("未知 Prompt Bundle 版本抛出 UnsupportedPromptBundleVersionError", () => {
    const renderer = createPromptBundleRenderer({ templates, bundles: [manifest] });

    assert.throws(
        () => renderer.render(buildContext({ promptBundleVersion: 99 as never })),
        /不支持的 Prompt Bundle 版本 99/,
    );
});

test("必需变量缺失时渲染失败且错误脱敏", () => {
    const withMissing: readonly PromptTemplateDefinition[] = [
        ...templates,
        {
            id: "missing-var@1",
            source: "SECRET {{ profile.systemPrompt }} {{ undefinedField }}",
        },
    ];
    const broken = createPromptBundleRenderer({
        templates: withMissing,
        bundles: [{
            ...manifest,
            sections: [
                { slot: "global_overview", templateId: "global-overview@1" },
                { slot: "profile", templateId: "missing-var@1" },
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
        }],
    });

    assert.throws(
        () => broken.render(buildContext()),
        (error: unknown) => {
            assert.ok(error instanceof PromptRenderError);
            assert.equal((error as PromptRenderError).bundleVersion, 1);
            assert.equal((error as PromptRenderError).slot, "profile");
            assert.equal((error as PromptRenderError).templateId, "missing-var@1");
            assert.ok(error instanceof Error);
            assert.ok(!(error as Error).message.includes("base"));
            return true;
        },
    );
});

test("模板语法错误在 Renderer 构造期即抛出配置错误", () => {
    assert.throws(
        () => createPromptBundleRenderer({
            templates: [
                { id: "global-overview@1", source: "{% if %}" },
                { id: "profile@1", source: "P" },
                { id: "gathering-context@1", source: "G" },
                { id: "planning@1", source: "P2" },
                { id: "agent-decision@1", source: "D" },
                { id: "authorized-tools@1", source: "T" },
            ],
            bundles: [manifest],
        }),
        /编译失败/,
    );
});
