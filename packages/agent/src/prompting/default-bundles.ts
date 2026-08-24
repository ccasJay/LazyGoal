import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
    GLOBAL_OVERVIEW_TEMPLATE_V1,
    GLOBAL_OVERVIEW_TEMPLATE_V2,
} from "../global-system-prompt/template";
import {
    GATHERING_CONTEXT_TEMPLATE_V1,
    GATHERING_CONTEXT_TEMPLATE_V2,
    PLANNING_TEMPLATE_V1,
    PLANNING_TEMPLATE_V2,
} from "../preparation-prompt/template";
import {
    AGENT_DECISION_TEMPLATE_V1,
    AGENT_DECISION_TEMPLATE_V2,
    AGENT_DECISION_TEMPLATE_V3,
} from "../step-prompt/template";
import { normalizeNewlines } from "./environment";
import { createPromptBundleRenderer } from "./renderer";
import type {
    PromptBundleManifest,
    PromptBundleRenderer,
    PromptTemplateAsset,
    PromptTemplateDefinition,
} from "./types";

/**
 * 当前 Agent 生效的 Prompt Bundle 版本。
 *
 * @remarks
 * 该值归 Agent 所有，由 TUI Composition Root 注入 Runtime 的
 * `LauncherDependencies.promptBundleVersion`，从而在新 Goal 创建时冻结。
 */
export const CURRENT_PROMPT_BUNDLE_VERSION = 3;

/**
 * 通用的 Profile 展示模板资产，归 prompting 基础设施所有。
 */
const PROFILE_TEMPLATE: PromptTemplateAsset = {
    id: "profile@1",
    sourceUrl: new URL("./profile@1.njk", import.meta.url),
};

/**
 * 通用的 Authorized Tools 展示模板资产，归 prompting 基础设施所有。
 */
const AUTHORIZED_TOOLS_TEMPLATE: PromptTemplateAsset = {
    id: "authorized-tools@1",
    sourceUrl: new URL("./authorized-tools@1.njk", import.meta.url),
};

/**
 * 默认 Renderer 注册的全部版本化模板描述符集合。
 *
 * @remarks
 * 该集合只保存稳定 ID 与 `.njk` 文件 URL，不复制业务 Prompt 文本；各业务模板
 * 文本由其业务模块就近维护。注册顺序不影响最终组成，Renderer 只按 Manifest 顺序
 * 渲染。
 */
export const DEFAULT_PROMPT_TEMPLATE_ASSETS: readonly PromptTemplateAsset[] = [
    GLOBAL_OVERVIEW_TEMPLATE_V1,
    GLOBAL_OVERVIEW_TEMPLATE_V2,
    PROFILE_TEMPLATE,
    GATHERING_CONTEXT_TEMPLATE_V1,
    GATHERING_CONTEXT_TEMPLATE_V2,
    PLANNING_TEMPLATE_V1,
    PLANNING_TEMPLATE_V2,
    AGENT_DECISION_TEMPLATE_V1,
    AGENT_DECISION_TEMPLATE_V2,
    AGENT_DECISION_TEMPLATE_V3,
    AUTHORIZED_TOOLS_TEMPLATE,
];

/**
 * v1 Prompt Bundle 的显式有序 Manifest。
 *
 * @remarks
 * 固定 slot 顺序为 Global Overview → Profile → Phase Protocol → Authorized Tools；
 * `phase_protocol` 显式给出三个 Phase 到模板 ID 的完整映射。
 */
export const PROMPT_BUNDLE_V1_MANIFEST: PromptBundleManifest = {
    version: 1,
    sections: [
        { slot: "global_overview", templateId: GLOBAL_OVERVIEW_TEMPLATE_V1.id },
        { slot: "profile", templateId: PROFILE_TEMPLATE.id },
        {
            slot: "phase_protocol",
            templates: {
                gathering_context: GATHERING_CONTEXT_TEMPLATE_V1.id,
                planning: PLANNING_TEMPLATE_V1.id,
                executing: AGENT_DECISION_TEMPLATE_V1.id,
            },
        },
        { slot: "authorized_tools", templateId: AUTHORIZED_TOOLS_TEMPLATE.id },
    ],
};

/**
 * v2 Prompt Bundle 的增量 Manifest。
 *
 * @remarks
 * Global Overview 与三个 Phase Protocol 均使用独立的 v2 模板，Profile 与
 * Authorized Tools 继续复用不可变的 v1 展示模板。本常量不改变新 Goal 当前冻结的
 * 默认版本。
 */
export const PROMPT_BUNDLE_V2_MANIFEST: PromptBundleManifest = {
    version: 2,
    sections: [
        { slot: "global_overview", templateId: GLOBAL_OVERVIEW_TEMPLATE_V2.id },
        { slot: "profile", templateId: PROFILE_TEMPLATE.id },
        {
            slot: "phase_protocol",
            templates: {
                gathering_context: GATHERING_CONTEXT_TEMPLATE_V2.id,
                planning: PLANNING_TEMPLATE_V2.id,
                executing: AGENT_DECISION_TEMPLATE_V2.id,
            },
        },
        { slot: "authorized_tools", templateId: AUTHORIZED_TOOLS_TEMPLATE.id },
    ],
};

/**
 * v3 Prompt Bundle 的增量 Manifest。
 *
 * @remarks
 * 仅 executing Phase Protocol 切换为 v3 模板（Tool 优先与 Bash 兜底规则）；
 * Global Overview、Preparation 两个 Phase 复用 v2 模板，Profile 与
 * Authorized Tools 继续复用 v1 展示模板，渲染输入协议不变。
 */
export const PROMPT_BUNDLE_V3_MANIFEST: PromptBundleManifest = {
    version: 3,
    sections: [
        { slot: "global_overview", templateId: GLOBAL_OVERVIEW_TEMPLATE_V2.id },
        { slot: "profile", templateId: PROFILE_TEMPLATE.id },
        {
            slot: "phase_protocol",
            templates: {
                gathering_context: GATHERING_CONTEXT_TEMPLATE_V2.id,
                planning: PLANNING_TEMPLATE_V2.id,
                executing: AGENT_DECISION_TEMPLATE_V3.id,
            },
        },
        { slot: "authorized_tools", templateId: AUTHORIZED_TOOLS_TEMPLATE.id },
    ],
};

/** 当前新 Goal 使用的 v3 Manifest。 */
export const DEFAULT_PROMPT_BUNDLE_MANIFEST = PROMPT_BUNDLE_V3_MANIFEST;

async function loadAsset(
    asset: PromptTemplateAsset,
): Promise<PromptTemplateDefinition> {
    const source = await readFile(fileURLToPath(asset.sourceUrl), "utf8");

    return { id: asset.id, source: normalizeNewlines(source) };
}

/**
 * 按固定 URL 读取、规范化并 eager compile 全部默认资产的 Renderer 工厂。
 *
 * @remarks
 * 该工厂在 TUI Composition Root 启动期间只调用一次；它读取所有 `.njk` 资产、
 * 统一换行为 LF，并把只含内存源码的定义交给 `createPromptBundleRenderer` 完成
 * Registry 校验与 eager compile。任何资产缺失、读取失败或模板语法错误都会在此
 * 抛出 `PromptBundleConfigurationError`，使 TUI 在创建 Goal 前启动失败。
 *
 * @returns 已加载并编译全部默认模板的 `PromptBundleRenderer`。
 * @throws PromptBundleConfigurationError 资产缺失、读取失败或模板语法错误时抛出。
 *
 * @example
 * ```ts
 * const renderer = await createDefaultPromptBundleRenderer();
 * ```
 */
export async function createDefaultPromptBundleRenderer(): Promise<PromptBundleRenderer> {
    const templates = await Promise.all(
        DEFAULT_PROMPT_TEMPLATE_ASSETS.map(loadAsset),
    );

    return createPromptBundleRenderer({
        templates,
        bundles: [
            PROMPT_BUNDLE_V1_MANIFEST,
            PROMPT_BUNDLE_V2_MANIFEST,
            PROMPT_BUNDLE_V3_MANIFEST,
        ],
    });
}
