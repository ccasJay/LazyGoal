import { createModels } from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";

import type { CatalogModel } from "../../model-catalog/src/index";

const STATIC_FACTORIES = {
    openai: openaiProvider,
    google: googleProvider,
    anthropic: anthropicProvider,
    openrouter: openrouterProvider,
    deepseek: deepseekProvider,
    "opencode-go": opencodeGoProvider,
} as const;

/** 可读取静态目录的供应商标识。 */
export type StaticCatalogProvider = keyof typeof STATIC_FACTORIES;

let cachedModels: ReturnType<typeof createModels> | undefined;

function models() {
    if (cachedModels === undefined) {
        cachedModels = createModels({
            authContext: { env: async () => undefined, fileExists: async () => false },
        });
        for (const factory of Object.values(STATIC_FACTORIES)) {
            cachedModels.setProvider(factory());
        }
    }
    return cachedModels;
}

/**
 * 读取锁定版本 pi-ai 静态目录中的模型事实。
 *
 * @param provider - 目标供应商。
 * @returns 目录算法可直接消费的静态模型元数据。
 *
 * @example
 * ```ts
 * const models = readStaticCatalogModels("openai");
 * ```
 */
export function readStaticCatalogModels(provider: StaticCatalogProvider): CatalogModel[] {
    return models().getModels(provider).map(model => ({
        id: model.id,
        displayName: model.name === undefined || model.name.length === 0 ? model.id : model.name,
        contextWindowTokens: model.contextWindow,
        maxOutputTokens: model.contextWindow > 1 ? Math.min(model.maxTokens, model.contextWindow - 1) : model.maxTokens,
        reasoning: model.reasoning,
        vision: model.input.includes("image"),
        isTextGeneration: model.input.includes("text"),
    }));
}
