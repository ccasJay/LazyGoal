import type { Environment } from "nunjucks";

import type { PromptContext, PromptPhase } from "../model-inference-view";
import {
    createPromptEnvironment,
    normalizeNewlines,
} from "./environment";
import {
    PromptBundleConfigurationError,
    PromptRenderError,
} from "./errors";
import { InMemoryLoader } from "./loader";
import { PromptBundleRegistry } from "./registry";
import type {
    PromptBundleManifest,
    PromptBundleRenderer,
    PromptBundleSection,
    PromptTemplateDefinition,
} from "./types";

/**
 * 移除 fragment 末尾的所有换行，供统一 `\n\n` 连接使用。
 */
function stripTrailingNewlines(text: string): string {
    return text.replace(/\n+$/, "");
}

/**
 * 把渲染出的 fragment 规范化为无结尾换行的 LF 文本。
 */
function normalizeFragment(text: string): string {
    return stripTrailingNewlines(normalizeNewlines(text));
}

/**
 * 把一个 section 解析为确定的模板 ID。
 *
 * @remarks
 * `phase_protocol` section 按当前 Phase 选模板；Registry 构造期已保证三个 Phase
 * 映射完整，此处的缺失检查仅作防御，理论上不可达。
 */
function resolveTemplateId(
    section: PromptBundleSection,
    phase: PromptPhase,
): string {
    if (section.slot !== "phase_protocol") {
        return section.templateId;
    }

    const templateId = section.templates[phase];

    if (templateId === undefined) {
        throw new Error(`Phase Protocol 缺少 ${phase} 阶段的模板映射`);
    }

    return templateId;
}

/**
 * 渲染单个 section 并规范化输出，渲染失败时封装为脱敏的 PromptRenderError。
 */
function renderSection(
    environment: Environment,
    section: PromptBundleSection,
    context: PromptContext,
): string {
    const templateId = resolveTemplateId(section, context.phase);

    try {
        return normalizeFragment(environment.render(templateId, context));
    } catch (error) {
        throw new PromptRenderError({
            bundleVersion: context.promptBundleVersion,
            slot: section.slot,
            templateId,
            cause: error,
        });
    }
}

/**
 * 由内存模板源码与 Bundle Manifest 创建确定性的 Prompt Bundle Renderer。
 *
 * @remarks
 * 构造期即完成 Registry 校验、按 ID 建立内存 Loader、创建封闭 Environment，并对
 * 所有被注册模板 eager compile，使模板语法错误在 Renderer 返回前暴露。`render`
 * 只读取传入的 `PromptContext`：按冻结版本取得 Manifest，按 Manifest 顺序逐个渲染
 * section，每个 section 使用同一个 `PromptContext` 单次渲染；Profile、Instructions
 * 与 ToolDefinition 仅作为变量值插入，值中的 `{{ ... }}` 或 `{% ... %}` 不会二次执行。
 * 各 fragment 移除末尾换行后以 `\n\n` 连接，且不追加结尾换行。
 *
 * @param input - 内存模板源码与 Bundle Manifest 集合。
 * @returns 可重复渲染的 `PromptBundleRenderer`。
 * @throws PromptBundleConfigurationError 模板重复、Manifest 非法、模板缺失或模板
 * 语法错误时抛出。
 *
 * @example
 * ```ts
 * const renderer = createPromptBundleRenderer({
 *     templates: [{ id: "global-overview@1", source: "Overview" }],
 *     bundles: [manifest],
 * });
 * const system = renderer.render(context);
 * ```
 */
export function createPromptBundleRenderer(input: {
    readonly templates: readonly PromptTemplateDefinition[];
    readonly bundles: readonly PromptBundleManifest[];
}): PromptBundleRenderer {
    const registry = new PromptBundleRegistry(input);

    const sources = new Map(
        input.templates.map((template) => [
            template.id,
            normalizeNewlines(template.source),
        ]),
    );
    const loader = new InMemoryLoader(sources);
    const environment = createPromptEnvironment(loader);

    for (const template of input.templates) {
        try {
            environment.getTemplate(template.id, true);
        } catch (error) {
            throw new PromptBundleConfigurationError(
                `模板 ${template.id} 编译失败`,
                error,
            );
        }
    }

    return {
        render(context: PromptContext): string {
            const manifest = registry.getManifest(
                context.promptBundleVersion,
                context.memoryProtocol,
                context.modelContextProtocol,
            );
            const fragments = manifest.sections.map((section) =>
                renderSection(environment, section, context),
            );

            return fragments.join("\n\n");
        },
    };
}
