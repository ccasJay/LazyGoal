import { contract } from "../../../contracts/src/index";
import { browserNonEmptyStringContract } from "./common";

/** 结构化输出模式。 */
export const browserStructuredOutputModeContract = contract.enum([
    "strict",
    "prompt_only",
    "two_stage",
] as const);

/** 受管 Provider 档案的非敏感投影。 */
export const browserProviderProfileContract = contract.openObject({
    id: browserNonEmptyStringContract,
    label: browserNonEmptyStringContract,
    kind: browserNonEmptyStringContract,
    defaultModel: browserNonEmptyStringContract,
    baseURL: contract.optional(contract.string()),
    contextWindowTokens: contract.optional(contract.number()),
    maxOutputTokens: contract.optional(contract.number()),
    structuredOutputMode: contract.optional(browserStructuredOutputModeContract),
    hasApiKey: contract.boolean(),
    apiKeyMask: contract.string(),
});

/** 只读的 `config.toml` 回退来源投影。 */
export const browserProviderFallbackContract = contract.openObject({
    source: contract.literal("config"),
    provider: contract.string(),
    model: contract.string(),
});

/** 设置页读取结果。 */
export const browserProviderSettingsContract = contract.openObject({
    activeProfileId: contract.optional(browserNonEmptyStringContract),
    profiles: contract.array(browserProviderProfileContract),
    fallback: contract.optional(browserProviderFallbackContract),
});

/** 设置操作的稳定失败分类。 */
export const browserProviderSettingsErrorContract = contract.enum([
    "provider_profile_not_found",
    "provider_profile_conflict",
    "provider_profile_active",
    "provider_profile_invalid",
    "provider_profile_unavailable",
] as const);

/** 设置页读取结果。 */
export const browserProviderSettingsReadResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        settings: browserProviderSettingsContract,
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: browserProviderSettingsErrorContract,
    }),
]);

/** 创建或部分更新档案的输入。 */
export const browserProviderProfileInputContract = contract.object({
    label: browserNonEmptyStringContract,
    kind: browserNonEmptyStringContract,
    defaultModel: browserNonEmptyStringContract,
    apiKey: contract.optional(browserNonEmptyStringContract),
    baseURL: contract.optional(contract.nullable(browserNonEmptyStringContract)),
    contextWindowTokens: contract.optional(contract.nullable(
        contract.integer({ minimum: 1 }),
    )),
    maxOutputTokens: contract.optional(contract.nullable(
        contract.integer({ minimum: 1 }),
    )),
    structuredOutputMode: contract.optional(contract.nullable(
        browserStructuredOutputModeContract,
    )),
});

/** 创建或更新结果。 */
export const browserProviderProfileWriteResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        profile: browserProviderProfileContract,
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: browserProviderSettingsErrorContract,
        fields: contract.optional(contract.array(contract.string())),
    }),
]);

/** 删除结果。 */
export const browserProviderProfileDeleteResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        profile: browserProviderProfileContract,
        mayBeReferencedByGoals: contract.boolean(),
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: browserProviderSettingsErrorContract,
    }),
]);

/** 激活结果。 */
export const browserProviderProfileActivationResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        activeProfileId: browserNonEmptyStringContract,
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: browserProviderSettingsErrorContract,
    }),
]);

/** 连接测试的稳定失败分类。 */
export const browserProviderProfileTestErrorContract = contract.enum([
    "provider_profile_not_found",
    "model_catalog_authentication",
    "model_catalog_permission",
    "model_catalog_protocol",
    "model_catalog_unavailable",
] as const);

/** 连接测试结果。 */
export const browserProviderProfileTestResultContract = contract.union([
    contract.openObject({
        ok: contract.literal(true),
        modelCount: contract.integer({ minimum: 1 }),
    }),
    contract.openObject({
        ok: contract.literal(false),
        error: browserProviderProfileTestErrorContract,
    }),
]);

/** 未保存表单的在线模型查询。 */
export const browserProviderModelQueryContract = contract.object({
    kind: browserNonEmptyStringContract,
    apiKey: contract.optional(browserNonEmptyStringContract),
    baseURL: contract.optional(browserNonEmptyStringContract),
    profileId: contract.optional(browserNonEmptyStringContract),
});

/** 本模块建立的 Provider 合同。 */
export const providerWebContracts = [
    browserStructuredOutputModeContract,
    browserProviderProfileContract,
    browserProviderFallbackContract,
    browserProviderSettingsContract,
    browserProviderSettingsErrorContract,
    browserProviderSettingsReadResultContract,
    browserProviderProfileInputContract,
    browserProviderProfileWriteResultContract,
    browserProviderProfileDeleteResultContract,
    browserProviderProfileActivationResultContract,
    browserProviderProfileTestErrorContract,
    browserProviderProfileTestResultContract,
    browserProviderModelQueryContract,
] as const;
