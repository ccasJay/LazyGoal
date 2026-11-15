/**
 * 默认 Prompt Bundle 的公共入口。
 *
 * @remarks
 * 该入口拥有当前唯一模板真源、Manifest、具体 Section 定义、默认 Renderer 装配与
 * Runtime 协议适配；调用方从本包显式加载当前资产，不读取历史 frame。
 */

export {
    CURRENT_PROMPT_BUNDLE_VERSION,
    DEFAULT_PROMPT_BUNDLE_MANIFEST,
    DEFAULT_PROMPT_TEMPLATE_ASSETS,
    PROMPT_BUNDLE_V1_MANIFEST,
    createDefaultPromptBundleProtocolValidator,
    createDefaultPromptBundleRenderer,
} from "./default-bundles";

export { createDefaultDynamicSectionRegistry } from "./default-dynamic-sections";

export {
    CONTEXT_COMPACTION_TEMPLATE_ID,
    renderContextCompactionPrompt,
} from "./context-compaction/render";
export type { ContextCompactionPromptInput } from "./context-compaction/render";
