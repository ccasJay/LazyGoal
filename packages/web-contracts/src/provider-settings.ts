/**
 * 受管 Provider 档案与设置页的数据传输对象 (DTO)。
 *
 * @remarks
 * 类型与约束的唯一来源是 [`wire.ts`](./wire.ts)；本模块只保留既有公开导入路径。
 * 本模块的所有投影都不含明文凭据：凭据只以 `hasApiKey` 与 `apiKeyMask` 表示。
 */

export type {
    BrowserProviderFallback,
    BrowserProviderModel,
    BrowserProviderModelQuery,
    BrowserProviderModels,
    BrowserProviderProfile,
    BrowserProviderProfileActivationResult,
    BrowserProviderProfileDeleteResult,
    BrowserProviderProfileInput,
    BrowserProviderProfileTestError,
    BrowserProviderProfileTestResult,
    BrowserProviderProfileWriteResult,
    BrowserProviderSettings,
    BrowserProviderSettingsError,
    BrowserProviderSettingsReadResult,
} from "./wire";
