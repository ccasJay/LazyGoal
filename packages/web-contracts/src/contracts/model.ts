import { contract } from "../../../contracts/src/index";
import { browserNonEmptyStringContract } from "./common";

/** 模型元数据来源分类。 */
export const browserModelMetadataSourceContract = contract.enum([
    "live",
    "catalog",
    "execution",
    "configured",
    "mixed",
] as const);

/** 模型可用性来源。 */
export const browserModelAvailabilitySourceContract = contract.enum([
    "live",
    "catalog",
    "configured",
] as const);

/** 候选模型项的展示属性。 */
const browserModelOptionShape = {
    id: browserNonEmptyStringContract,
    displayName: browserNonEmptyStringContract,
    availabilitySource: browserModelAvailabilitySourceContract,
    metadataSource: browserModelMetadataSourceContract,
    selectable: contract.boolean(),
    contextWindowTokens: contract.optional(contract.integer({ minimum: 1 })),
    maxOutputTokens: contract.optional(contract.integer({ minimum: 1 })),
    reasoning: contract.optional(contract.boolean()),
    vision: contract.optional(contract.boolean()),
    unavailableReason: contract.optional(contract.string()),
} as const;

/** 候选模型项的展示属性。 */
export const browserModelOptionContract = contract.openObject(browserModelOptionShape);

/** 默认模型提示告警分类。 */
export const browserModelCatalogNoticeContract = contract.enum([
    "provider_changed",
    "model_unavailable",
] as const);

/** 浏览器模型目录读取的稳定失败分类。 */
export const browserModelCatalogErrorContract = contract.enum([
    "goal_not_found",
    "stale_run",
    "model_catalog_authentication",
    "model_catalog_permission",
    "model_catalog_protocol",
    "model_catalog_unavailable",
] as const);

/** 可供选择的模型来源。 */
export const browserModelSourceRefContract = contract.openObject({
    profileId: contract.optional(browserNonEmptyStringContract),
    kind: contract.string(),
    label: contract.string(),
    active: contract.boolean(),
});

/** 完整模型目录投影。 */
export const browserModelCatalogContract = contract.openObject({
    provider: browserNonEmptyStringContract,
    profileId: contract.optional(browserNonEmptyStringContract),
    sources: contract.optional(contract.array(browserModelSourceRefContract)),
    currentModelId: browserNonEmptyStringContract,
    defaultModelNotice: contract.optional(browserModelCatalogNoticeContract),
    models: contract.array(browserModelOptionContract),
});

/** 供投影目录的最小模型元数据来源。 */
export const browserModelSourceContract = contract.openObject({
    provider: browserNonEmptyStringContract,
    ...browserModelOptionShape,
});

/** 读取模型目录结果。 */
export const browserModelCatalogReadResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        catalog: browserModelCatalogContract,
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: browserModelCatalogErrorContract,
    }),
]);

/** 本模块建立的模型目录合同。 */
export const modelWebContracts = [
    browserModelMetadataSourceContract,
    browserModelAvailabilitySourceContract,
    browserModelOptionContract,
    browserModelCatalogNoticeContract,
    browserModelCatalogErrorContract,
    browserModelSourceRefContract,
    browserModelCatalogContract,
    browserModelSourceContract,
    browserModelCatalogReadResultContract,
] as const;
