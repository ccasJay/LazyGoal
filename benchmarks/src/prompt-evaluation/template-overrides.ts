import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type {
    ModelDynamicContext,
    ModelInferenceView,
    PromptContext,
} from "../../../packages/model-view/src/index.js";
import {
    DEFAULT_PROMPT_BUNDLE_MANIFEST,
    DEFAULT_PROMPT_TEMPLATE_ASSETS,
    createDefaultDynamicSectionRegistry,
} from "../../../packages/prompt-bundle/src/index.js";
import {
    createPromptBundleRenderer,
    normalizeNewlines,
    type PromptBundleRenderer,
    type PromptTemplateDefinition,
} from "../../../packages/prompt-renderer/src/index.js";

/** 允许外部优化器在 Prompt Evaluation 中覆盖的框架模板 ID 集合。 */
export const MUTABLE_PROMPT_TEMPLATE_IDS = Object.freeze([
    "global-overview@1",
    "agent-decision@1",
    "agent-think@1",
    "authorized-tools@1",
    "run-mode@1",
] as const);

/** 允许被候选覆盖的单个模板标识。 */
export type MutablePromptTemplateId = (typeof MUTABLE_PROMPT_TEMPLATE_IDS)[number];

/** 单个可覆盖模板的最大字符数上限。 */
export const MAX_TEMPLATE_OVERRIDE_CHARS = 128 * 1024;

const MUTABLE_TEMPLATE_ID_SET: ReadonlySet<string> = new Set<string>(MUTABLE_PROMPT_TEMPLATE_IDS);

/** 模板覆盖校验或 Golden Fixture 试渲染失败的错误码。 */
export type PromptTemplateOverrideErrorCode =
    | "INVALID_TEMPLATE_OVERRIDES"
    | "UNSUPPORTED_TEMPLATE_ID"
    | "EMPTY_TEMPLATE_SOURCE"
    | "TEMPLATE_TOO_LARGE"
    | "TEMPLATE_COMPILE_ERROR"
    | "GOLDEN_FIXTURE_ANCHOR_MISSING";

/**
 * 候选模板覆盖在预检或试渲染阶段违反契约时抛出的稳定错误。
 *
 * @remarks
 * 在任何容器创建或模型调用前拦截破坏 Nunjucks 语法或丢失必需动态插值锚点的模板。
 *
 * @example
 * ```ts
 * try {
 *   normalizeTemplateOverrides({ "profile@1": "illegal" });
 * } catch (error) {
 *   if (error instanceof PromptTemplateOverrideError) console.error(error.code);
 * }
 * ```
 */
export class PromptTemplateOverrideError extends Error {
    readonly name = "PromptTemplateOverrideError";

    constructor(
        readonly code: PromptTemplateOverrideErrorCode,
        readonly templateId: string,
        message: string,
        options: ErrorOptions = {},
    ) {
        super(message, options);
    }
}

/**
 * 校验并规范化未知的模板覆盖映射。
 *
 * @remarks
 * 只接受 {@link MUTABLE_PROMPT_TEMPLATE_IDS} 白名单内的模板 ID，将换行符统一规范化为 LF，
 * 并按模板 ID 字典序返回深冻结映射。纯数据容器模板（如 `profile@1`、`working-memory@1`）禁止覆盖。
 *
 * @param value - 来自请求或 ACP metadata 的未知 `templateOverrides` 值。
 * @returns 规范化并按 key 排序的只读模板覆盖字典；输入为 `undefined` 时返回 `undefined`。
 * @throws {@link PromptTemplateOverrideError} 结构非法、包含非白名单模板或正文为空/超长时抛出。
 * @example
 * ```ts
 * const normalized = normalizeTemplateOverrides({
 *   "global-overview@1": "Global Overview:\nFollow the contract.",
 * });
 * ```
 */
export function normalizeTemplateOverrides(
    value: unknown,
): Readonly<Record<string, string>> | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new PromptTemplateOverrideError(
            "INVALID_TEMPLATE_OVERRIDES",
            "$",
            "templateOverrides must be a plain object mapping mutable template IDs to source strings",
        );
    }
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const normalized: Record<string, string> = {};
    for (const key of sortedKeys) {
        if (!MUTABLE_TEMPLATE_ID_SET.has(key)) {
            throw new PromptTemplateOverrideError(
                "UNSUPPORTED_TEMPLATE_ID",
                key,
                `Template ${key} is not in MUTABLE_PROMPT_TEMPLATE_IDS (${MUTABLE_PROMPT_TEMPLATE_IDS.join(", ")})`,
            );
        }
        const rawSource = record[key];
        if (typeof rawSource !== "string" || rawSource.trim() === "") {
            throw new PromptTemplateOverrideError(
                "EMPTY_TEMPLATE_SOURCE",
                key,
                `Template override for ${key} must be a non-empty string`,
            );
        }
        const cleanSource = normalizeNewlines(rawSource);
        if (cleanSource.length > MAX_TEMPLATE_OVERRIDE_CHARS) {
            throw new PromptTemplateOverrideError(
                "TEMPLATE_TOO_LARGE",
                key,
                `Template override for ${key} exceeds ${MAX_TEMPLATE_OVERRIDE_CHARS} characters`,
            );
        }
        normalized[key] = cleanSource;
    }
    return Object.freeze(normalized);
}

/**
 * 使用内存中的默认模板定义与可选覆盖构建并校验 `PromptBundleRenderer`。
 *
 * @remarks
 * 在构造期完成 Nunjucks 编译，并对覆盖后的 Renderer 执行 Golden Fixture 锚点试渲染：
 * 1. 验证 `decide` 与 `think` 阶段固定指令可无错渲染，且保留当前协议标识（如 `structured@1`）；
 * 2. 验证 `authorized-tools@1` 动态 Section 仍完整输出 `section.projection` 的序列化工具 JSON；
 * 3. 验证 `run-mode@1` 动态 Section 在 `checkpoint_required`、`normal`、`plan` 三种状态下仍保留关键工具与意图插值。
 *
 * @param baseTemplates - 基准模板定义列表。
 * @param overrides - 可选的模板覆盖字典。
 * @returns 通过语法编译与 Golden Fixture 锚点校验的 `PromptBundleRenderer`。
 * @throws {@link PromptTemplateOverrideError} 编译失败或丢失必需协议/数据插值锚点时抛出。
 * @example
 * ```ts
 * const renderer = buildVerifiedPromptBundleRenderer(baseTemplates, {
 *   "agent-think@1": "Active Think Instructions: free-text output; Memory structured@1...",
 * });
 * ```
 */
export function buildVerifiedPromptBundleRenderer(
    baseTemplates: readonly PromptTemplateDefinition[],
    overrides?: Readonly<Record<string, string>>,
): PromptBundleRenderer {
    const normalizedOverrides = normalizeTemplateOverrides(overrides);
    const mergedTemplates: PromptTemplateDefinition[] = baseTemplates.map((template) => {
        const overridden = normalizedOverrides?.[template.id];
        return overridden === undefined
            ? { id: template.id, source: normalizeNewlines(template.source) }
            : { id: template.id, source: overridden };
    });

    let renderer: PromptBundleRenderer;
    try {
        renderer = createPromptBundleRenderer({
            templates: mergedTemplates,
            bundles: [DEFAULT_PROMPT_BUNDLE_MANIFEST],
            dynamicSectionRegistry: createDefaultDynamicSectionRegistry(),
        });
    } catch (error: unknown) {
        throw new PromptTemplateOverrideError(
            "TEMPLATE_COMPILE_ERROR",
            "$",
            `Failed to compile PromptBundleRenderer with templateOverrides: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
        );
    }

    if (normalizedOverrides !== undefined && Object.keys(normalizedOverrides).length > 0) {
        verifyGoldenFixtures(renderer, normalizedOverrides);
    }

    return renderer;
}

/**
 * 从磁盘加载默认 Prompt Bundle 模板资产，合并候选覆盖并执行 Golden Fixture 预检。
 *
 * @param overrides - 待验证的候选模板覆盖映射。
 * @returns 已验证通过的 `PromptBundleRenderer`。
 * @throws {@link PromptTemplateOverrideError} 模板覆盖非法、编译失败或锚点缺失时抛出。
 * @example
 * ```ts
 * const renderer = await loadAndVerifyPromptTemplateOverrides({
 *   "global-overview@1": "Global Overview:\nOperate safely in LazyGoal.",
 * });
 * ```
 */
export async function loadAndVerifyPromptTemplateOverrides(
    overrides?: Readonly<Record<string, string>>,
): Promise<PromptBundleRenderer> {
    const baseTemplates = await Promise.all(
        DEFAULT_PROMPT_TEMPLATE_ASSETS.map(async (asset) => ({
            id: asset.id,
            source: normalizeNewlines(await readFile(fileURLToPath(asset.sourceUrl), "utf8")),
        })),
    );
    return buildVerifiedPromptBundleRenderer(baseTemplates, overrides);
}

function verifyGoldenFixtures(
    renderer: PromptBundleRenderer,
    overrides: Readonly<Record<string, string>>,
): void {
    const decidePrompt = createFixturePromptContext("decide");
    const thinkPrompt = createFixturePromptContext("think");

    const decideText = renderSafely(renderer, () => renderer.render(decidePrompt), "agent-decision@1");
    if ("agent-decision@1" in overrides) {
        requireAnchor(decideText, "agent-decision@1", ["structured@1", "trajectory-layered@1", "bm25-lite@1"]);
    }
    if ("global-overview@1" in overrides) {
        requireAnchor(decideText, "global-overview@1", ["Global Overview"]);
    }

    const thinkText = renderSafely(renderer, () => renderer.render(thinkPrompt), "agent-think@1");
    if ("agent-think@1" in overrides) {
        requireAnchor(thinkText, "agent-think@1", ["structured@1", "trajectory-layered@1", "bm25-lite@1"]);
    }

    if ("authorized-tools@1" in overrides) {
        const toolView = createFixtureView({
            authorizedTools: [
                {
                    id: "read_file",
                    description: "GOLDEN_FIXTURE_READ_FILE_DESC",
                    inputSchema: { type: "object" },
                },
                {
                    id: "execute_program",
                    description: "GOLDEN_FIXTURE_PTC_DESC",
                    inputSchema: { type: "object" },
                },
            ],
        });
        const sections = renderSafely(
            renderer,
            () => renderer.renderDynamicSections(toolView),
            "authorized-tools@1",
        );
        const toolSection = sections.find((section) => section.sectionId === "authorized_tools")?.content ?? "";
        requireAnchor(toolSection, "authorized-tools@1", [
            "GOLDEN_FIXTURE_READ_FILE_DESC",
            "execute_program",
        ]);
    }

    if ("run-mode@1" in overrides) {
        const checkpointView = createFixtureView({}, { checkpoint: true });
        const checkpointSections = renderSafely(
            renderer,
            () => renderer.renderDynamicSections(checkpointView),
            "run-mode@1",
        );
        const checkpointText = checkpointSections.find((section) => section.sectionId === "run_mode")?.content ?? "";
        requireAnchor(checkpointText, "run-mode@1", [
            "system_context_checkpoint",
            "GOLDEN_FIXTURE_INTENT",
        ]);

        const normalView = createFixtureView({ runMode: "normal" });
        const normalSections = renderSafely(
            renderer,
            () => renderer.renderDynamicSections(normalView),
            "run-mode@1",
        );
        const normalText = normalSections.find((section) => section.sectionId === "run_mode")?.content ?? "";
        requireAnchor(normalText, "run-mode@1", [
            "system_complete_task",
            "system_find_tools",
            "GOLDEN_FIXTURE_INTENT",
        ]);
    }
}

function renderSafely<T>(
    _renderer: PromptBundleRenderer,
    fn: () => T,
    templateId: string,
): T {
    try {
        return fn();
    } catch (error: unknown) {
        throw new PromptTemplateOverrideError(
            "TEMPLATE_COMPILE_ERROR",
            templateId,
            `Failed to render Golden Fixture for ${templateId}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
        );
    }
}

function requireAnchor(
    renderedText: string,
    templateId: string,
    anchors: readonly string[],
): void {
    for (const anchor of anchors) {
        if (!renderedText.includes(anchor)) {
            throw new PromptTemplateOverrideError(
                "GOLDEN_FIXTURE_ANCHOR_MISSING",
                templateId,
                `Golden Fixture render for ${templateId} is missing required contract anchor: ${anchor}`,
            );
        }
    }
}

function createFixturePromptContext(stage: "decide" | "think"): PromptContext {
    return {
        promptBundleVersion: 1,
        phase: "executing",
        stage,
        profile: {
            id: "golden-fixture-profile",
            systemPrompt: "GOLDEN_FIXTURE_SYSTEM_PROMPT",
            instructions: ["GOLDEN_FIXTURE_INSTRUCTION_1"],
        },
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
    };
}

function createFixtureView(
    dynamicOverrides: Partial<ModelDynamicContext> = {},
    options: { readonly checkpoint?: boolean } = {},
): ModelInferenceView {
    return {
        prompt: createFixturePromptContext("decide"),
        dynamicContext: {
            runMode: "normal",
            goalPlanWritable: false,
            authorizedTools: [],
            ...dynamicOverrides,
        },
        conversation: [],
        workingContext: {
            phase: "executing",
            intent: "GOLDEN_FIXTURE_INTENT",
            execution: { stepCount: 0 },
        },
        workingMemory: {
            protocolVersion: 1,
            derivedThroughSequence: 0,
            facts: [],
            hypotheses: [],
            blockers: [],
        },
        contextEpoch: {
            protocolVersion: 1,
            epochNumber: 0,
            conversationStartIndex: 0,
            openedAtSequence: 0,
            control: options.checkpoint
                ? { status: "checkpoint_required", reason: "input_threshold" }
                : { status: "active" },
        },
    };
}
