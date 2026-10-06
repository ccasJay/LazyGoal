import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveBrowserDraftModelCatalog, type BrowserModelSource } from "../src/index";

const models: readonly BrowserModelSource[] = [
    { provider: "openai", id: "configured", displayName: "Configured", availabilitySource: "configured", metadataSource: "configured", selectable: true },
    { provider: "openai", id: "remembered", displayName: "Remembered", availabilitySource: "live", metadataSource: "catalog", selectable: true },
];

test("新 Goal 优先使用同 Provider 的可选记忆模型", () => {
    const result = resolveBrowserDraftModelCatalog("openai", "configured", { provider: "openai", modelId: "remembered" }, models);
    assert.equal(result.selected?.id, "remembered");
    assert.equal(result.catalog.currentModelId, "remembered");
    assert.equal(result.catalog.defaultModelNotice, undefined);
});

test("Provider 改变或记忆模型不可用时展示原因并回到配置默认值", () => {
    for (const [preference, notice] of [
        [{ provider: "anthropic", modelId: "remembered" }, "provider_changed"],
        [{ provider: "openai", modelId: "missing" }, "model_unavailable"],
    ] as const) {
        const result = resolveBrowserDraftModelCatalog("openai", "configured", preference, models);
        assert.equal(result.selected?.id, "configured");
        assert.equal(result.catalog.currentModelId, "configured");
        assert.equal(result.catalog.defaultModelNotice, notice);
    }
    const unavailable = resolveBrowserDraftModelCatalog("openai", "configured", undefined, models.map((model) => ({ ...model, selectable: false })));
    assert.equal(unavailable.selected, undefined);
    assert.equal(unavailable.catalog.currentModelId, "configured");
});
