import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { GLOBAL_OVERVIEW_TEMPLATE_V1 } from "../global-system-prompt/template";
import {
    GATHERING_CONTEXT_TEMPLATE_V1,
    PLANNING_TEMPLATE_V1,
} from "../preparation-prompt/template";
import { AGENT_DECISION_TEMPLATE_V1 } from "../step-prompt/template";
import { normalizeNewlines } from "./environment";
import { createPromptBundleRenderer } from "./renderer";
import {
    GoalProtocolError,
    isContextRetrievalProtocol,
    isMemoryProtocol,
    isModelContextProtocol,
    type GoalProtocolValidator,
} from "../../../runtime/src/domain";
import type {
    PromptBundleManifest,
    PromptBundleRenderer,
    PromptTemplateAsset,
    PromptTemplateDefinition,
} from "./types";

/** 当前 Agent 生效的唯一 Prompt Bundle 版本。 */
export const CURRENT_PROMPT_BUNDLE_VERSION = 1 as const;

/** 通用的 Profile 展示模板资产。 */
const PROFILE_TEMPLATE: PromptTemplateAsset = {
    id: "profile@1",
    sourceUrl: new URL("./profile@1.njk", import.meta.url),
};

/** 通用的 Authorized Tools 展示模板资产。 */
const AUTHORIZED_TOOLS_TEMPLATE: PromptTemplateAsset = {
    id: "authorized-tools@1",
    sourceUrl: new URL("./authorized-tools@1.njk", import.meta.url),
};

/** 默认 Renderer 使用的当前模板资产。 */
export const DEFAULT_PROMPT_TEMPLATE_ASSETS: readonly PromptTemplateAsset[] = [
    GLOBAL_OVERVIEW_TEMPLATE_V1,
    PROFILE_TEMPLATE,
    GATHERING_CONTEXT_TEMPLATE_V1,
    PLANNING_TEMPLATE_V1,
    AGENT_DECISION_TEMPLATE_V1,
    AUTHORIZED_TOOLS_TEMPLATE,
];

/**
 * 当前唯一 Prompt Bundle Manifest。
 *
 * @remarks
 * Bundle、Memory、模型上下文和联合检索协议必须同时使用 v1；旧 Bundle 不再注册，
 * 因而旧 Goal 不会通过 Renderer 获得兼容执行路径。
 */
export const PROMPT_BUNDLE_V1_MANIFEST: PromptBundleManifest = {
    version: 1,
    memoryProtocol: { kind: "structured", version: 1 },
    modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
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

/** 当前新 Goal 使用的唯一 Prompt Bundle Manifest。 */
export const DEFAULT_PROMPT_BUNDLE_MANIFEST = PROMPT_BUNDLE_V1_MANIFEST;

/**
 * 创建当前 Prompt Bundle 的协议校验器。
 *
 * @remarks
 * 校验器只接受 `structured@1 + trajectory-layered@1 + bm25-lite@1`，不提供旧版本
 * 默认值、迁移或回退。它不读取文件、不调用模型，也不修改输入。
 *
 * @returns 可注入 Runtime 组合根的只读协议校验器。
 * @throws GoalProtocolError 当 Bundle 或任一协议不是当前组合时抛出。
 *
 * @example
 * ```ts
 * const validator = createDefaultPromptBundleProtocolValidator();
 * validator.validate({
 *     promptBundleVersion: 1,
 *     memoryProtocol: { kind: "structured", version: 1 },
 *     modelContextProtocol: { kind: "trajectory-layered", version: 1 },
 *     contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
 * });
 * ```
 */
export function createDefaultPromptBundleProtocolValidator(): GoalProtocolValidator {
    return {
        validate(input): void {
            if (
                input.promptBundleVersion !== 1
                || !isMemoryProtocol(input.memoryProtocol)
                || !isModelContextProtocol(input.modelContextProtocol)
                || !isContextRetrievalProtocol(input.contextRetrievalProtocol)
            ) {
                throw new GoalProtocolError(
                    "仅支持 structured@1 + trajectory-layered@1 + bm25-lite@1 + Prompt Bundle v1",
                );
            }
        },
    };
}

async function loadAsset(
    asset: PromptTemplateAsset,
): Promise<PromptTemplateDefinition> {
    const source = await readFile(fileURLToPath(asset.sourceUrl), "utf8");

    return { id: asset.id, source: normalizeNewlines(source) };
}

/**
 * 按固定 URL 读取、规范化并 eager compile 当前全部模板资产。
 *
 * @returns 已加载并编译当前模板的 Renderer。
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
        bundles: [PROMPT_BUNDLE_V1_MANIFEST],
    });
}
