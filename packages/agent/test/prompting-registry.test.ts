import assert from "node:assert/strict";
import { test } from "node:test";

import {
    PromptBundleConfigurationError,
    UnsupportedPromptBundleVersionError,
} from "../src/prompting/errors";
import { PromptBundleRegistry } from "../src/prompting/registry";
import type {
    PromptBundleManifest,
    PromptBundleSection,
    PromptTemplateDefinition,
} from "../src/prompting/types";

const templates: readonly PromptTemplateDefinition[] = [
    { id: "global-overview@1", source: "global v1" },
    { id: "profile@1", source: "profile v1" },
    { id: "gathering-context@1", source: "gathering v1" },
    { id: "planning@1", source: "planning v1" },
    { id: "agent-decision@1", source: "decision v1" },
    { id: "authorized-tools@1", source: "tools v1" },
];

const globalSection: PromptBundleSection = {
    slot: "global_overview",
    templateId: "global-overview@1",
};
const profileSection: PromptBundleSection = {
    slot: "profile",
    templateId: "profile@1",
};
const phaseSection: PromptBundleSection = {
    slot: "phase_protocol",
    templates: {
        gathering_context: "gathering-context@1",
        planning: "planning@1",
        executing: "agent-decision@1",
    },
};
const toolsSection: PromptBundleSection = {
    slot: "authorized_tools",
    templateId: "authorized-tools@1",
};

const manifestV1: PromptBundleManifest = {
    version: 1,
    sections: [globalSection, profileSection, phaseSection, toolsSection],
};

test("Registry 构造期对模板注册顺序置换不敏感", () => {
    const reversed = [...templates].reverse();
    const registry = new PromptBundleRegistry({ templates: reversed, bundles: [manifestV1] });

    assert.deepEqual(registry.supportedVersions(), [1]);
    assert.equal(registry.getTemplateSource("global-overview@1"), "global v1");
    assert.equal(registry.getManifest(1).sections.length, 4);
});

test("Registry 拒绝重复的模板 ID", () => {
    assert.throws(
        () => new PromptBundleRegistry({
            templates: [...templates, { id: "profile@1", source: "dup" }],
            bundles: [manifestV1],
        }),
        PromptBundleConfigurationError,
    );
});

test("Registry 拒绝重复的 Bundle 版本", () => {
    assert.throws(
        () => new PromptBundleRegistry({ templates, bundles: [manifestV1, manifestV1] }),
        PromptBundleConfigurationError,
    );
});

test("Registry 拒绝非正整数的 Bundle 版本", () => {
    const invalid: PromptBundleManifest = { ...manifestV1, version: 0 };
    assert.throws(
        () => new PromptBundleRegistry({ templates, bundles: [invalid] }),
        PromptBundleConfigurationError,
    );
});

test("Registry 拒绝引用未注册模板的 Manifest", () => {
    const invalid: PromptBundleManifest = {
        ...manifestV1,
        sections: [
            { slot: "global_overview", templateId: "missing@1" },
            profileSection,
            phaseSection,
            toolsSection,
        ],
    };
    assert.throws(
        () => new PromptBundleRegistry({ templates, bundles: [invalid] }),
        PromptBundleConfigurationError,
    );
});

test("Registry 拒绝缺少 Phase 映射的 Manifest", () => {
    const incomplete: PromptBundleSection = {
        slot: "phase_protocol",
        templates: {
            gathering_context: "gathering-context@1",
            planning: "planning@1",
        },
    } as unknown as PromptBundleSection;
    const invalid: PromptBundleManifest = {
        ...manifestV1,
        sections: [globalSection, profileSection, incomplete, toolsSection],
    };
    assert.throws(
        () => new PromptBundleRegistry({ templates, bundles: [invalid] }),
        PromptBundleConfigurationError,
    );
});

test("Registry 拒绝 section 顺序错误的 Manifest", () => {
    const invalid: PromptBundleManifest = {
        ...manifestV1,
        sections: [profileSection, globalSection, phaseSection, toolsSection],
    };
    assert.throws(
        () => new PromptBundleRegistry({ templates, bundles: [invalid] }),
        PromptBundleConfigurationError,
    );
});

test("Registry 拒绝 section 数量不足的 Manifest", () => {
    const invalid: PromptBundleManifest = {
        ...manifestV1,
        sections: [globalSection, profileSection, phaseSection],
    };
    assert.throws(
        () => new PromptBundleRegistry({ templates, bundles: [invalid] }),
        PromptBundleConfigurationError,
    );
});

test("Registry 对未知版本抛出 UnsupportedPromptBundleVersionError 且不回退", () => {
    const registry = new PromptBundleRegistry({ templates, bundles: [manifestV1] });

    assert.throws(
        () => registry.getManifest(99),
        (error: unknown) => {
            assert.ok(error instanceof UnsupportedPromptBundleVersionError);
            assert.equal((error as UnsupportedPromptBundleVersionError).bundleVersion, 99);
            assert.deepEqual(
                (error as UnsupportedPromptBundleVersionError).supportedVersions,
                [1],
            );
            return true;
        },
    );
});

test("Registry 只允许已注册模板被查询，可信模板边界由注册表唯一决定", () => {
    const registry = new PromptBundleRegistry({ templates, bundles: [manifestV1] });

    assert.throws(
        () => registry.getTemplateSource("unregistered@1"),
        PromptBundleConfigurationError,
    );
});

test("Registry 支持多个版本且按升序返回受支持版本", () => {
    const manifestV2: PromptBundleManifest = {
        ...manifestV1,
        version: 2,
    };
    const registry = new PromptBundleRegistry({ templates, bundles: [manifestV2, manifestV1] });

    assert.deepEqual(registry.supportedVersions(), [1, 2]);
    assert.equal(registry.getManifest(2).version, 2);
});
