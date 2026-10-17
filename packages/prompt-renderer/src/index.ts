/**
 * Prompt 渲染机制的公共入口。
 *
 * @remarks
 * 该入口提供内存模板 Loader、封闭 Nunjucks 环境、编译与确定性渲染、Manifest 结构
 * 与模板引用检查、Section 注册机制、渲染契约与错误；不读取默认资产、工作区或
 * Runtime 状态，也不包含任何具体默认 Prompt 内容。
 */

export {
    createPromptEnvironment,
    normalizeNewlines,
} from "./environment";

export { InMemoryLoader } from "./loader";

export {
    PromptBundleConfigurationError,
    PromptRenderError,
    UnsupportedPromptBundleVersionError,
    PROMPT_BUNDLE_CONFIGURATION_ERROR_CODE,
    PROMPT_RENDER_ERROR_CODE,
    UNSUPPORTED_PROMPT_BUNDLE_VERSION_ERROR_CODE,
} from "./errors";

export { PromptBundleRegistry } from "./registry";

export { createPromptBundleRenderer } from "./renderer";

export { DynamicSectionRegistry } from "./dynamic-section-registry";
export type {
    DynamicSectionDefinition,
    DynamicSectionIdentity,
    DynamicSectionMessage,
    DynamicSectionProjection,
    DynamicSectionRole,
} from "./dynamic-section-registry";

export type {
    PromptBundleManifest,
    PromptBundleRenderer,
    PromptBundleSection,
    PromptTemplateAsset,
    PromptTemplateDefinition,
} from "./types";
