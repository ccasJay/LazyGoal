import type {
    ModelContextProtocol,
    ModelContextRetrievalProtocol,
    ModelMemoryProtocol,
    PromptPhase,
} from "../model-inference-view";
import {
    isContextRetrievalProtocol,
    isModelContextProtocol,
    isMemoryProtocol,
} from "../../../runtime/src/domain";
import {
    PromptBundleConfigurationError,
    UnsupportedPromptBundleVersionError,
} from "./errors";
import type {
    PromptBundleManifest,
    PromptBundleSection,
    PromptTemplateDefinition,
} from "./types";

/**
 * 每个 Bundle 必须出现且保持顺序的四个 slot。
 *
 * @remarks
 * 该顺序是当前 Prompt 协议的固定组成：Global Overview → Profile → Phase Protocol
 * → Authorized Tools。Registry 构造时强制校验，避免模板注册顺序影响最终结果。
 */
const SLOT_ORDER: readonly PromptBundleSection["slot"][] = [
    "global_overview",
    "profile",
    "phase_protocol",
    "authorized_tools",
];

const PHASES: readonly PromptPhase[] = [
    "gathering_context",
    "planning",
    "executing",
];

function buildTemplateIndex(
    templates: readonly PromptTemplateDefinition[],
): ReadonlyMap<string, string> {
    const index = new Map<string, string>();

    for (const template of templates) {
        if (template.id.trim().length === 0) {
            throw new PromptBundleConfigurationError("模板 ID 不能为空");
        }

        if (index.has(template.id)) {
            throw new PromptBundleConfigurationError(`重复的模板 ID：${template.id}`);
        }

        index.set(template.id, template.source);
    }

    return index;
}

function assertTemplateExists(
    label: string,
    templateId: string,
    templates: ReadonlyMap<string, string>,
): void {
    if (!templates.has(templateId)) {
        throw new PromptBundleConfigurationError(
            `${label} 引用了未注册的模板：${templateId}`,
        );
    }
}

function validateManifest(
    manifest: PromptBundleManifest,
    templates: ReadonlyMap<string, string>,
): void {
    const label = `Prompt Bundle v${manifest.version}`;

    if (manifest.version !== 1) {
        throw new PromptBundleConfigurationError(
            `${label} 不是当前唯一支持的 Prompt Bundle v1`,
        );
    }

    if (!isMemoryProtocol(manifest.memoryProtocol)) {
        throw new PromptBundleConfigurationError(
            `${label} 的 Memory 协议无效`,
        );
    }

    if (
        !isModelContextProtocol(manifest.modelContextProtocol)
    ) {
        throw new PromptBundleConfigurationError(
            `${label} 的模型上下文协议无效`,
        );
    }

    if (
        !isContextRetrievalProtocol(manifest.contextRetrievalProtocol)
    ) {
        throw new PromptBundleConfigurationError(
            `${label} 的 Context Retrieval 协议无效`,
        );
    }

    const slots = manifest.sections.map((section) => section.slot);

    if (slots.length !== SLOT_ORDER.length) {
        throw new PromptBundleConfigurationError(
            `${label} 必须包含且仅包含 ${SLOT_ORDER.length} 个 section，`
            + `实际为 ${slots.length} 个`,
        );
    }

    for (let i = 0; i < SLOT_ORDER.length; i += 1) {
        if (slots[i] !== SLOT_ORDER[i]) {
            throw new PromptBundleConfigurationError(
                `${label} 的 section 顺序必须为 ${SLOT_ORDER.join(" → ")}，`
                + `实际为 ${slots.join(" → ")}`,
            );
        }
    }

    for (const section of manifest.sections) {
        if (section.slot === "phase_protocol") {
            for (const phase of PHASES) {
                const templateId = section.templates[phase];

                if (templateId === undefined) {
                    throw new PromptBundleConfigurationError(
                        `${label} 缺少 ${phase} 阶段的 Phase Protocol 模板映射`,
                    );
                }

                assertTemplateExists(label, templateId, templates);
            }
        } else {
            assertTemplateExists(label, section.templateId, templates);
        }
    }
}

function buildManifestIndex(
    bundles: readonly PromptBundleManifest[],
    templates: ReadonlyMap<string, string>,
): ReadonlyMap<number, PromptBundleManifest> {
    const index = new Map<number, PromptBundleManifest>();

    for (const manifest of bundles) {
        if (index.has(manifest.version)) {
            throw new PromptBundleConfigurationError(
                `重复的 Prompt Bundle 版本：${manifest.version}`,
            );
        }

        validateManifest(manifest, templates);
        index.set(manifest.version, manifest);
    }

    return index;
}

function protocolMatches(
    manifest: PromptBundleManifest,
    protocol: ModelMemoryProtocol,
    modelContextProtocol: ModelContextProtocol,
    contextRetrievalProtocol: ModelContextRetrievalProtocol,
): boolean {
    return manifest.memoryProtocol.kind === protocol.kind
        && manifest.memoryProtocol.version === protocol.version
        && manifest.modelContextProtocol.kind === modelContextProtocol.kind
        && manifest.modelContextProtocol.version === modelContextProtocol.version
        && manifest.contextRetrievalProtocol.kind === contextRetrievalProtocol.kind
        && manifest.contextRetrievalProtocol.version === contextRetrievalProtocol.version;
}

/**
 * 以内存模板 ID 与 Bundle 版本为索引的 Prompt Bundle Registry。
 *
 * @remarks
 * 构造期即完成全部校验：重复模板 ID、重复 Bundle、非当前 v1 版本、缺失模板引用、
 * Phase 映射不完整、slot 数量或顺序错误。模板注册输入先转成按 ID 查找的 Map，
 * 因此调用方传入顺序不影响结果。当前 Bundle 引用的模板一旦发布即视为不可变。
 *
 * @example
 * ```ts
 * const registry = new PromptBundleRegistry({
 *     templates: [{ id: "global-overview@1", source: "..." }],
 *     bundles: [manifest],
 * });
 * const source = registry.getTemplateSource("global-overview@1");
 * ```
 */
export class PromptBundleRegistry {
    private readonly templateSources: ReadonlyMap<string, string>;
    private readonly manifests: ReadonlyMap<number, PromptBundleManifest>;

    /**
     * @param input - 内存模板源码与 Bundle Manifest 集合。
     * @throws PromptBundleConfigurationError 输入存在重复、引用缺失、Phase 映射
     * 不完整、非法版本或 slot 顺序错误时抛出。
     */
    constructor(input: {
        readonly templates: readonly PromptTemplateDefinition[];
        readonly bundles: readonly PromptBundleManifest[];
    }) {
        this.templateSources = buildTemplateIndex(input.templates);
        this.manifests = buildManifestIndex(input.bundles, this.templateSources);
    }

    /**
     * @param templateId - 已注册模板的稳定 ID。
     * @returns 规范化后的模板源码。
     * @throws PromptBundleConfigurationError 模板 ID 未注册时抛出。
     */
    getTemplateSource(templateId: string): string {
        const source = this.templateSources.get(templateId);

        if (source === undefined) {
            throw new PromptBundleConfigurationError(`未注册的模板：${templateId}`);
        }

        return source;
    }

    /**
     * @param version - 需要解析的 Prompt Bundle 版本。
     * @returns 与该版本对应的 Manifest。
     * @throws UnsupportedPromptBundleVersionError 版本未注册时抛出，不回退到其他版本。
     */
    getManifest(
        version: number,
        memoryProtocol: ModelMemoryProtocol,
        modelContextProtocol: ModelContextProtocol,
        contextRetrievalProtocol: ModelContextRetrievalProtocol,
    ): PromptBundleManifest {
        const manifest = this.manifests.get(version);

        if (
            manifest === undefined
            || !protocolMatches(
                manifest,
                memoryProtocol,
                modelContextProtocol,
                contextRetrievalProtocol,
            )
        ) {
            const compatibleVersions = [...this.manifests.entries()]
                .filter(([, candidate]) => protocolMatches(
                    candidate,
                    memoryProtocol,
                    modelContextProtocol,
                    contextRetrievalProtocol,
                ))
                .map(([candidateVersion]) => candidateVersion)
                .sort((a, b) => a - b);
            throw new UnsupportedPromptBundleVersionError(
                version,
                compatibleVersions,
            );
        }

        return manifest;
    }

    /**
     * @returns 当前受支持的 Bundle 版本，按升序排列。
     */
    supportedVersions(): readonly number[] {
        return [...this.manifests.keys()].sort((a, b) => a - b);
    }
}
