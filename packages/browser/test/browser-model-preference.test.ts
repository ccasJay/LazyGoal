import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveBrowserDraftModelCatalog, type BrowserModelSource } from "../src/index";

const models: readonly BrowserModelSource[] = [
    { provider: "openai", id: "configured", displayName: "Configured", availabilitySource: "configured", metadataSource: "configured", selectable: true },
    { provider: "openai", id: "remembered", displayName: "Remembered", availabilitySource: "live", metadataSource: "catalog", selectable: true },
];

const openaiSource = { provider: "openai", profileId: "profile-openai" } as const;

test("新 Goal 优先使用同来源的可选记忆模型", () => {
    const result = resolveBrowserDraftModelCatalog(openaiSource, "configured", { profileId: "profile-openai", modelId: "remembered" }, models);
    assert.equal(result.selected?.id, "remembered");
    assert.equal(result.catalog.currentModelId, "remembered");
    assert.equal(result.catalog.defaultModelNotice, undefined);
});

test("草稿目录投影携带档案标识与来源维度", () => {
    const sources = [
        { profileId: "profile-openai", kind: "openai", label: "主账号", active: true },
        { profileId: "profile-google", kind: "google", label: "备用", active: false },
    ] as const;
    const result = resolveBrowserDraftModelCatalog(
        { provider: "openai", profileId: "profile-openai", sources },
        "configured",
        { profileId: "profile-openai", modelId: "remembered" },
        models,
    );
    assert.equal(result.selected?.id, "remembered");
    assert.equal(result.catalog.profileId, "profile-openai");
    assert.deepEqual(result.catalog.sources, sources);
    assert.equal(result.catalog.defaultModelNotice, undefined);
});

test("来源改变或记忆模型不可用时展示原因并回到配置默认值", () => {
    for (const [preference, notice] of [
        [{ profileId: "profile-anthropic", modelId: "remembered" }, "provider_changed"],
        [{ profileId: "profile-openai", modelId: "missing" }, "model_unavailable"],
        [{ modelId: "remembered" }, "provider_changed"],
    ] as const) {
        const result = resolveBrowserDraftModelCatalog(openaiSource, "configured", preference, models);
        assert.equal(result.selected?.id, "configured");
        assert.equal(result.catalog.currentModelId, "configured");
        assert.equal(result.catalog.defaultModelNotice, notice);
    }
    const fallbackSource = { provider: "openai" } as const;
    const fallback = resolveBrowserDraftModelCatalog(fallbackSource, "configured", { modelId: "remembered" }, models);
    assert.equal(fallback.selected?.id, "remembered", "未使用受管档案时按同一回退来源匹配偏好");
    assert.equal(fallback.catalog.defaultModelNotice, undefined);

    const unavailable = resolveBrowserDraftModelCatalog(openaiSource, "configured", undefined, models.map((model) => ({ ...model, selectable: false })));
    assert.equal(unavailable.selected, undefined);
    assert.equal(unavailable.catalog.currentModelId, "configured");
});
