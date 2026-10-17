export const PROMPT_BUNDLE_CONFIGURATION_ERROR_CODE =
    "PROMPT_BUNDLE_CONFIGURATION" as const;
export const UNSUPPORTED_PROMPT_BUNDLE_VERSION_ERROR_CODE =
    "UNSUPPORTED_PROMPT_BUNDLE_VERSION" as const;
export const PROMPT_RENDER_ERROR_CODE = "PROMPT_RENDER_ERROR" as const;

/**
 * Prompt Bundle 配置或资产加载失败。
 *
 * @remarks
 * 在 Registry 构造或默认工厂启动期间抛出，表示重复 ID/版本、非法 Manifest、
 * 缺失资产、无法读取文件或模板语法错误。TUI 应在创建 Goal 前启动失败。
 */
export class PromptBundleConfigurationError extends Error {
    readonly code = PROMPT_BUNDLE_CONFIGURATION_ERROR_CODE;
    readonly cause?: unknown;

    constructor(message: string, cause?: unknown) {
        super(`${PROMPT_BUNDLE_CONFIGURATION_ERROR_CODE}: ${message}`);
        this.name = "PromptBundleConfigurationError";

        if (cause !== undefined) {
            this.cause = cause;
        }
    }
}

/**
 * Goal 引用了未注册的 Prompt Bundle 版本。
 *
 * @remarks
 * 由 Renderer 抛出，表示恢复的 Goal 冻结了当前 Agent 不支持的 Bundle 版本。
 * 该错误不回退到其他版本，也不包含 Profile、Tool Schema 或 Conversation 原文。
 */
export class UnsupportedPromptBundleVersionError extends Error {
    readonly code = UNSUPPORTED_PROMPT_BUNDLE_VERSION_ERROR_CODE;
    readonly bundleVersion: number;
    readonly supportedVersions: readonly number[];

    constructor(bundleVersion: number, supportedVersions: readonly number[]) {
        const supported = supportedVersions.length === 0
            ? "（无）"
            : supportedVersions.join(", ");
        super(
            `${UNSUPPORTED_PROMPT_BUNDLE_VERSION_ERROR_CODE}: `
            + `不支持的 Prompt Bundle 版本 ${bundleVersion}（受支持：${supported}）`,
        );
        this.name = "UnsupportedPromptBundleVersionError";
        this.bundleVersion = bundleVersion;
        this.supportedVersions = [...supportedVersions];
    }
}

/**
 * 必需变量缺失或 Nunjucks 模板渲染失败。
 *
 * @remarks
 * 错误信息包含 Bundle 版本、section slot 与模板 ID，但不包含 Profile、Tool Schema
 * 或 Conversation 原文。原始 Nunjucks 异常通过 `cause` 保留。该错误保证发生在
 * LLM Adapter 调用之前，Executor 不重试、不修复 Prompt。
 */
export class PromptRenderError extends Error {
    readonly code = PROMPT_RENDER_ERROR_CODE;
    readonly bundleVersion: number;
    readonly slot: string;
    readonly templateId: string;
    readonly cause?: unknown;

    constructor(details: {
        bundleVersion: number;
        slot: string;
        templateId: string;
        cause?: unknown;
    }) {
        super(
            `${PROMPT_RENDER_ERROR_CODE}: Prompt Bundle v${details.bundleVersion} `
            + `的 ${details.slot} section 渲染模板 ${details.templateId} 失败`,
        );
        this.name = "PromptRenderError";
        this.bundleVersion = details.bundleVersion;
        this.slot = details.slot;
        this.templateId = details.templateId;

        if (details.cause !== undefined) {
            this.cause = details.cause;
        }
    }
}
