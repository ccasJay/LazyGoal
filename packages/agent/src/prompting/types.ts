import type {
    ModelContextProtocol,
    ModelMemoryProtocol,
    PromptContext,
    PromptPhase,
} from "../model-inference-view";

export type {
    PromptContext,
    PromptPhase,
};

/**
 * 业务模块注册的 `.njk` 模板资产的文件来源。
 *
 * @remarks
 * 业务模块导出稳定的模板 `id` 与代码内固定的 `sourceUrl`，由默认工厂在启动期
 * 一次性读取并规范化源码。模板 ID 必须包含组件版本（如 `global-overview@1`），
 * 且被受支持 Bundle 引用后不得再修改其内容。
 */
export interface PromptTemplateAsset {
    /** 含组件版本的稳定模板标识，例如 `global-overview@1`。 */
    readonly id: string;
    /** 指向 `.njk` 资产的固定文件 URL。 */
    readonly sourceUrl: URL;
}

/**
 * 已读取并规范化（换行统一为 LF）的内存模板源码。
 *
 * @remarks
 * 该对象是 `PromptTemplateAsset` 加载后的字符级产物，由 `createPromptBundleRenderer`
 * 直接接收，用于纯单元测试与默认工厂的最终构造。
 */
export interface PromptTemplateDefinition {
    /** 与 `PromptTemplateAsset.id` 一致的稳定模板标识。 */
    readonly id: string;
    /** 已规范化 LF 换行的 Nunjucks 模板文本。 */
    readonly source: string;
}

/**
 * Bundle 中的单个组合 section。
 *
 * @remarks
 * 普通 section 直接引用模板 ID；`phase_protocol` section 必须显式给出三个
 * `PromptPhase` 到模板 ID 的完整映射。Render 顺序只由 `sections` 数组决定，
 * 不受模板注册顺序或文件遍历顺序影响。
 */
export type PromptBundleSection =
    | {
        readonly slot: "global_overview" | "profile" | "authorized_tools";
        readonly templateId: string;
    }
    | {
        readonly slot: "phase_protocol";
        readonly templates: Readonly<Record<PromptPhase, string>>;
    };

/**
 * 一个版本化的 Prompt Bundle：显式声明组成、Phase 映射与渲染顺序的 Manifest。
 *
 * @remarks
 * `version` 是正整数；`sections` 是有序只读数组，Registry 构造时强制其 slot 顺序为
 * Global Overview → Profile → Phase Protocol → Authorized Tools，且每个 slot 恰好出现一次。
 *
 * @example
 * ```ts
 * const manifest: PromptBundleManifest = {
 *     version: 1,
 *     sections: [
 *         { slot: "global_overview", templateId: "global-overview@1" },
 *         { slot: "profile", templateId: "profile@1" },
 *         {
 *             slot: "phase_protocol",
 *             templates: {
 *                 gathering_context: "gathering-context@1",
 *                 planning: "planning@1",
 *                 executing: "agent-decision@1",
 *             },
 *         },
 *         { slot: "authorized_tools", templateId: "authorized-tools@1" },
 *     ],
 * };
 * ```
 */
export interface PromptBundleManifest {
    /** 冻结该组合的正整数版本。 */
    readonly version: number;
    /** 参与组合的 section 及其确定顺序。 */
    readonly sections: readonly PromptBundleSection[];
    /** 该 Bundle 唯一兼容的 Memory 协议；legacy Bundle 可省略以保持旧文件语义。 */
    readonly memoryProtocol?: ModelMemoryProtocol;
    /** 该 Bundle 唯一兼容的模型上下文协议；省略时按 `conversation@1` 解释。 */
    readonly modelContextProtocol?: ModelContextProtocol;
}

/**
 * 已按版本与 Phase 解析、可渲染完整 system prompt 的 Bundle Renderer。
 *
 * @remarks
 * 实现必须只读取传入的 `PromptContext`，不得修改 Goal、会话历史、PromptContext
 * 或已保存 Snapshot；对未注册的 Bundle 版本必须抛出错误而非回退到其他版本。
 *
 * @example
 * ```ts
 * const system = renderer.render({ promptBundleVersion: 1, phase: "executing", profile, authorizedTools });
 * ```
 */
export interface PromptBundleRenderer {
    /**
     * @param context - 本轮渲染所需的不可变 Prompt 上下文。
     * @returns 唯一一条 system 消息文本（LF 换行、无结尾换行）。
     * @throws PromptRenderError 变量缺失或模板渲染失败时抛出。
     */
    render(context: PromptContext): string;
}
