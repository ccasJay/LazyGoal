import type {
    ModelInferenceView,
    ModelContextProtocol,
    ModelContextRetrievalProtocol,
    ModelMemoryProtocol,
    PromptContext,
    PromptPhase,
    PromptStage,
} from "../model-inference-view";
import type {
    DynamicSectionIdentity,
    DynamicSectionMessage,
} from "./dynamic-section-registry";

export type {
    PromptContext,
    PromptPhase,
    PromptStage,
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
 * 普通 section 直接引用模板 ID；`phase_protocol` section 必须显式给出全部受支持
 * `PromptStage` 到模板 ID 的映射。Render 顺序只由 `sections` 数组决定，
 * 不受模板注册顺序或文件遍历顺序影响。
 */
export type PromptBundleSection =
    | {
        readonly slot: "global_overview" | "profile";
        readonly templateId: string;
    }
    | {
        readonly slot: "phase_protocol";
        readonly templates: Readonly<Record<PromptStage, string>>;
    };

/**
 * 一个版本化的 Prompt Bundle：显式声明组成、推理阶段映射与渲染顺序的 Manifest。
 *
 * @remarks
 * 当前实现只支持 Bundle v1；`sections` 是有序只读数组，Registry 构造时强制其
 * slot 顺序为 Global Overview → Profile → Phase Protocol，且每个 slot 恰好出现一次；
 * Phase Protocol 必须同时声明 Decide 与 Think 模板。
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
 *                 decide: "agent-decision@1",
 *                 think: "agent-think@1",
 *             },
 *         },
 *     ],
 * };
 * ```
 */
export interface PromptBundleManifest {
    /** 当前唯一支持的 Bundle 版本。 */
    readonly version: 1;
    /** 参与组合的 section 及其确定顺序。 */
    readonly sections: readonly PromptBundleSection[];
    /** 该 Bundle 唯一匹配的 Memory 协议。 */
    readonly memoryProtocol: ModelMemoryProtocol;
    /** 该 Bundle 唯一匹配的模型上下文协议。 */
    readonly modelContextProtocol: ModelContextProtocol;
    /** 该 Bundle 唯一匹配的 Cold Trajectory 检索协议。 */
    readonly contextRetrievalProtocol: ModelContextRetrievalProtocol;
}

/**
 * 已按 Bundle 版本与 Think/Decide 推理阶段解析固定 system 前缀和动态 section 的 Renderer。
 *
 * @remarks
 * `render` 只读取固定 `PromptContext`；`renderDynamicSections` 只读取已投影的
 * `ModelInferenceView`。两者不得修改 Goal、会话历史、View 或 Snapshot；对未注册
 * 的 Bundle 版本必须抛出错误而非回退到其他版本。
 *
 * @example
 * ```ts
 * const system = renderer.render({
 *     promptBundleVersion: 1,
 *     phase: "executing",
 *     stage: "decide",
 *     profile,
 *     memoryProtocol: { kind: "structured", version: 1 },
 *     modelContextProtocol: { kind: "trajectory-layered", version: 1 },
 *     contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
 * });
 * ```
 */
export interface PromptBundleRenderer {
    /**
     * @param context - 本轮渲染所需的不可变 Prompt 上下文。
     * @returns 唯一一条 system 消息文本（LF 换行、无结尾换行）。
     * @throws PromptRenderError 变量缺失或模板渲染失败时抛出。
     */
    render(context: PromptContext): string;

    /**
     * @param view - 已完成 Runtime 单向投影的模型 View。
     * @returns 按注册顺序渲染的动态 section；元数据与正文保持分离。
     * @throws 动态模板缺失或渲染失败时抛出 `PromptRenderError`。
     */
    renderDynamicSections(view: ModelInferenceView): readonly DynamicSectionMessage[];

    /**
     * @returns 全部已注册动态 section 的稳定身份，包含当前投影缺省的可选 section。
     * @example
     * ```ts
     * const identities = renderer.dynamicSectionIdentities();
     * ```
     */
    dynamicSectionIdentities(): readonly DynamicSectionIdentity[];
}
