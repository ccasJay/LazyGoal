import { parse as parseToml } from "smol-toml";
import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";

import { isAcceptableBaseUrl, isPositiveSafeInteger } from "./provider-rules";

/**
 * TOML 解析或语义校验失败的结构化异常。
 *
 * @remarks
 * 携带发生错误的文件路径、行号、列号及错误详情，用于 CLI 快速失败诊断。
 */
export class TomlConfigurationError extends Error {
    readonly code = "TOML_CONFIGURATION_ERROR";

    constructor(
        message: string,
        readonly filePath?: string,
        readonly line?: number,
        readonly column?: number,
    ) {
        const location = line !== undefined
            ? ` (${filePath ?? "config.toml"}:${line}${column !== undefined ? `:${column}` : ""})`
            : filePath ? ` (${filePath})` : "";
        super(`${message}${location}`);
        this.name = "TomlConfigurationError";
    }
}

/**
 * `[llm]` 选择小节：只引用 `providers.<family>.<name>` 中的供应商与模型。
 *
 * @example
 * ```ts
 * const llm: LLMTomlSection = { provider: "mistral-gateway", model: "mistral-large-latest" };
 * ```
 */
export interface LLMTomlSection {
    /** 引用的供应商标识，即 `providers.<family>.<name>` 中的 `name`。 */
    provider?: string;
    /** 该供应商 `models[]` 中声明的模型标识。 */
    model?: string;
}

/**
 * 供应商 `models[]` 中的单个模型声明。
 *
 * @remarks
 * `context_window` 与 `max_output_tokens` 必须为正整数且后者小于前者；
 * 能力位可选，缺省时由适配器或目录决定。
 *
 * @example
 * ```toml
 * [[providers.openai.main.models]]
 * id = "gpt-4o"
 * context_window = 128000
 * max_output_tokens = 16384
 * ```
 */
export interface ProviderModelTomlSection {
    /** 供应商内唯一的模型标识。 */
    id?: string;
    /** 面向用户的模型名称；省略时使用标识。 */
    display_name?: string;
    /** 上下文窗口 Token 容量。 */
    context_window?: number;
    /** 单次补全最大输出 Token。 */
    max_output_tokens?: number;
    /** 是否具备原生推理能力。 */
    reasoning?: boolean;
    /** 是否接受视觉输入。 */
    vision?: boolean;
    /** 是否支持工具调用。 */
    tools?: boolean;
    /** 是否接受强制工具选择。 */
    supports_required_tool_choice?: boolean;
    /** 是否原生约束结构化输出。 */
    native_structured_output?: boolean;
}

/**
 * `providers.<family>.<name>` 中的单个供应商连接。
 *
 * @example
 * ```toml
 * [providers.openai-compatible.mistral]
 * api_key = "..."
 * base_url = "https://gateway.example/v1"
 * ```
 */
export interface ProviderTomlSection {
    /** API 访问凭据。 */
    api_key?: string;
    /** 端点覆盖；`openai-compatible` 家族必填。 */
    base_url?: string;
    /** 该供应商声明的模型列表；至少一项。 */
    models?: ProviderModelTomlSection[];
}

/** `providers` 小节：家族 → 供应商标识 → 连接声明。 */
export type ProvidersTomlSection = Readonly<Record<string, Readonly<Record<string, ProviderTomlSection>>>>;

/**
 * `[workspace]` 小节配置结构。
 *
 * @example
 * ```ts
 * const workspace: WorkspaceTomlSection = { root: "/work/project" };
 * ```
 */
export interface WorkspaceTomlSection {
    /** 默认工作区根目录路径。 */
    root?: string;
}

/**
 * `[profile]` 小节配置结构。
 *
 * @example
 * ```ts
 * const profile: ProfileTomlSection = { active: "default" };
 * ```
 */
export interface ProfileTomlSection {
    /** 默认激活的用户级 Profile 名称。 */
    active?: string;
}

/**
 * `[tui]` 小节配置结构。
 *
 * @example
 * ```ts
 * const tui: TuiTomlSection = { execution_mode: "confirm" };
 * ```
 */
export interface TuiTomlSection {
    /** TUI 启动执行模式。 */
    execution_mode?: "autonomous" | "confirm";
}

/**
 * `[context]` 小节配置结构。
 *
 * @example
 * ```toml
 * [context]
 * epoch_limit_tokens = 120000
 * compact_threshold_percent = 80
 * ```
 */
export interface ContextTomlSection {
    /** Epoch 工作窗口的 Token 上限；省略时以模型标称容量为基数。 */
    epoch_limit_tokens?: number;
    /** 整理阈值百分比（1–99）；省略时默认 80。 */
    compact_threshold_percent?: number;
}

/**
 * `[gepa]` 小节配置结构契约。
 *
 * @remarks
 * 定义 GEPA 优化运行生命周期的专用配置，包括负责 Prompt 变异与反思的独立 Reflection Profile。
 *
 * @example
 * ```toml
 * [gepa]
 * reflection_profile = "gepa-reflection"
 * ```
 */
export interface GepaTomlSection {
    /** 负责 Prompt 变异与反思推理的独立 Profile 名称。 */
    reflection_profile?: string;
}

/**
 * GEPA 模块已校验的运行时配置契约。
 *
 * @remarks
 * 声明 GEPA 优化运行所需的独立 Reflection Profile 名称。
 * 契约约束：
 * 1. `reflectionProfile` 必须非空且必须为合法的安全 Profile 标识（不含路径遍历字符）；
 * 2. `reflectionProfile` 严禁与 Working Profile 同名（不区分大小写匹配 `"default"`），避免凭据、模型角色及反思上下文混淆；
 * 3. 必须在存在对应的 `profiles/<reflectionProfile>.toml` 时才能成功加载。
 *
 * @example
 * ```ts
 * const gepaConfig: GepaConfig = {
 *     reflectionProfile: "gepa-reflection",
 * };
 * ```
 */
export interface GepaConfig {
    /** 独立 Reflection LM 的 Profile 名称（必须非空且不能为 "default" 变体）。 */
    readonly reflectionProfile: string;
}

/**
 * LazyGoal 主配置文件（`config.toml`）的数据结构契约。
 *
 * @example
 * ```toml
 * [llm]
 * provider = "openai-compatible"
 * model = "gpt-4o"
 * api_key = "sk-..."
 *
 * [profile]
 * active = "default"
 *
 * [gepa]
 * reflection_profile = "gepa-reflection"
 * ```
 */
export interface LazyGoalTomlConfig {
    llm?: LLMTomlSection;
    providers?: ProvidersTomlSection;
    workspace?: WorkspaceTomlSection;
    profile?: ProfileTomlSection;
    tui?: TuiTomlSection;
    context?: ContextTomlSection;
    gepa?: GepaTomlSection;
}

/**
 * 用户级 Profile 文件（`profiles/<name>.toml`）的数据结构契约。
 *
 * @example
 * ```toml
 * name = "deepseek"
 * description = "DeepSeek 模型专用 Profile"
 *
 * [llm]
 * provider = "deepseek"
 * model = "deepseek-chat"
 * ```
 */
export interface ProfileTomlConfig {
    name?: string;
    description?: string;
    llm?: LLMTomlSection;
    tui?: TuiTomlSection;
}

const ALLOWED_CONFIG_SECTIONS = new Set(["llm", "providers", "workspace", "profile", "tui", "context", "gepa"]);
const ALLOWED_GEPA_FIELDS = new Set(["reflection_profile"]);
const ALLOWED_CONTEXT_FIELDS = new Set(["epoch_limit_tokens", "compact_threshold_percent"]);
const ALLOWED_LLM_FIELDS = new Set(["provider", "model"]);
const ALLOWED_PROVIDER_FIELDS = new Set(["api_key", "base_url", "models"]);
const ALLOWED_PROVIDER_MODEL_FIELDS = new Set([
    "id", "display_name", "context_window", "max_output_tokens",
    "reasoning", "vision", "tools", "supports_required_tool_choice", "native_structured_output",
]);

/** 解析主配置时可注入的校验事实。 */
export interface TomlParseOptions {
    /** 组合根已注册的供应商家族；省略时跳过家族校验。 */
    readonly knownProviderFamilies?: readonly string[] | undefined;
}

/**
 * 解析并强校验主配置 TOML 文本。
 *
 * @param content - 原始 TOML 文本。
 * @param filePath - 可选的文件绝对路径，用于精准报错定位。
 * @param options - 可选的可信供应商家族集合。
 * @returns 经过校验的配置对象。
 * @throws TomlConfigurationError 当语法错误或包含未知小节/字段时快速失败。
 * @example
 * ```ts
 * const config = parseTomlConfig("[llm]\nprovider = 'main'", "config.toml", { knownProviderFamilies: ["openai"] });
 * ```
 */
export function parseTomlConfig(
    content: string,
    filePath?: string,
    options: TomlParseOptions = {},
): LazyGoalTomlConfig {
    let raw: Record<string, unknown>;
    try {
        raw = parseToml(content) as Record<string, unknown>;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const lineMatch = message.match(/line (\d+)/i);
        const colMatch = message.match(/column (\d+)/i);
        const line = lineMatch?.[1] !== undefined ? parseInt(lineMatch[1], 10) : undefined;
        const column = colMatch?.[1] !== undefined ? parseInt(colMatch[1], 10) : undefined;
        throw new TomlConfigurationError(`TOML 语法错误: ${message}`, filePath, line, column);
    }

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new TomlConfigurationError("TOML 顶级内容必须为键值对象", filePath);
    }

    // 校验未知顶级小节
    for (const key of Object.keys(raw)) {
        if (!ALLOWED_CONFIG_SECTIONS.has(key)) {
            throw new TomlConfigurationError(`未知的配置小节: [${key}]`, filePath);
        }
    }

    // 校验 [llm] 小节字段
    if (raw.llm !== undefined) {
        if (typeof raw.llm !== "object" || raw.llm === null || Array.isArray(raw.llm)) {
            throw new TomlConfigurationError("[llm] 小节必须为键值对象", filePath);
        }
        const llm = raw.llm as Record<string, unknown>;
        for (const field of Object.keys(llm)) {
            if (!ALLOWED_LLM_FIELDS.has(field)) {
                throw new TomlConfigurationError(`[llm] 小节包含未知字段: ${field}`, filePath);
            }
        }
        for (const field of ["provider", "model"] as const) {
            if (llm[field] !== undefined && (typeof llm[field] !== "string" || (llm[field] as string).trim().length === 0)) {
                throw new TomlConfigurationError(`[llm].${field} 必须为非空字符串`, filePath);
            }
        }
    }

    // 校验 [providers] 小节
    if (raw.providers !== undefined) {
        validateProvidersSection(raw.providers, filePath, options.knownProviderFamilies);
    }

    // 校验 [context] 小节字段
    if (raw.context !== undefined) {
        if (typeof raw.context !== "object" || raw.context === null || Array.isArray(raw.context)) {
            throw new TomlConfigurationError("[context] 小节必须为键值对象", filePath);
        }
        const context = raw.context as Record<string, unknown>;
        for (const field of Object.keys(context)) {
            if (!ALLOWED_CONTEXT_FIELDS.has(field)) {
                throw new TomlConfigurationError(`[context] 小节包含未知字段: ${field}`, filePath);
            }
        }
        if (context.epoch_limit_tokens !== undefined
            && (typeof context.epoch_limit_tokens !== "number"
                || !Number.isSafeInteger(context.epoch_limit_tokens)
                || context.epoch_limit_tokens <= 0)) {
            throw new TomlConfigurationError("[context].epoch_limit_tokens 必须为正的安全整数", filePath);
        }
        if (context.compact_threshold_percent !== undefined
            && (typeof context.compact_threshold_percent !== "number"
                || !Number.isInteger(context.compact_threshold_percent)
                || context.compact_threshold_percent < 1
                || context.compact_threshold_percent > 99)) {
            throw new TomlConfigurationError("[context].compact_threshold_percent 必须为 1–99 的整数", filePath);
        }
    }

    // 校验 [gepa] 小节字段
    if (raw.gepa !== undefined) {
        if (typeof raw.gepa !== "object" || raw.gepa === null || Array.isArray(raw.gepa)) {
            throw new TomlConfigurationError("[gepa] 小节必须为键值对象", filePath);
        }
        const gepa = raw.gepa as Record<string, unknown>;
        for (const field of Object.keys(gepa)) {
            if (!ALLOWED_GEPA_FIELDS.has(field)) {
                throw new TomlConfigurationError(`[gepa] 小节包含未知字段: ${field}`, filePath);
            }
        }
        if (gepa.reflection_profile !== undefined && typeof gepa.reflection_profile !== "string") {
            throw new TomlConfigurationError("[gepa].reflection_profile 必须为字符串", filePath);
        }
    }

    return raw as LazyGoalTomlConfig;
}

const ALLOWED_PROFILE_KEYS = new Set(["name", "description", "llm", "tui"]);

/**
 * 解析并强校验单个 Profile TOML 文本。
 *
 * @param content - Profile TOML 文本。
 * @param filePath - 可选的文件绝对路径。
 * @returns 经过校验的 Profile 配置对象。
 * @throws TomlConfigurationError 当语法非法或结构异常时抛出。
 * @example
 * ```ts
 * const profile = parseProfileToml("name = 'default'\n[llm]\nmodel = 'gpt-4o'");
 * ```
 */
export function parseProfileToml(content: string, filePath?: string): ProfileTomlConfig {
    let raw: Record<string, unknown>;
    try {
        raw = parseToml(content) as Record<string, unknown>;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const lineMatch = message.match(/line (\d+)/i);
        const colMatch = message.match(/column (\d+)/i);
        const line = lineMatch?.[1] !== undefined ? parseInt(lineMatch[1], 10) : undefined;
        const column = colMatch?.[1] !== undefined ? parseInt(colMatch[1], 10) : undefined;
        throw new TomlConfigurationError(`Profile TOML 语法错误: ${message}`, filePath, line, column);
    }

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new TomlConfigurationError("Profile TOML 顶级内容必须为键值对象", filePath);
    }

    for (const key of Object.keys(raw)) {
        if (!ALLOWED_PROFILE_KEYS.has(key)) {
            throw new TomlConfigurationError(`Profile 包含未知配置项: ${key}`, filePath);
        }
    }

    if (raw.llm !== undefined) {
        const llm = raw.llm;
        if (typeof llm !== "object" || llm === null || Array.isArray(llm)) {
            throw new TomlConfigurationError("Profile 的 [llm] 必须为对象", filePath);
        }
        for (const [field, value] of Object.entries(llm as Record<string, unknown>)) {
            if (!ALLOWED_LLM_FIELDS.has(field)) {
                throw new TomlConfigurationError(`Profile 的 [llm] 包含未知字段: ${field}`, filePath);
            }
            if (typeof value !== "string" || value.trim().length === 0) {
                throw new TomlConfigurationError(`Profile 的 [llm].${field} 必须为非空字符串`, filePath);
            }
        }
    }

    return raw as ProfileTomlConfig;
}

/**
 * 从用户级 profiles 目录加载指定名称的 Profile 配置。
 *
 * @param profileName - 目标 Profile 名称（不带 .toml 后缀）。
 * @param profilesDir - 用户 Profile 目录路径。
 * @returns 加载并解析后的 Profile 对象。
 * @throws TomlConfigurationError 当指定的 Profile 不存在时抛出，并附带列出可用选项。
 * @example
 * ```ts
 * const profile = await loadProfileToml("default", "~/.lazygoal/profiles");
 * ```
 */
export async function loadProfileToml(profileName: string, profilesDir: string): Promise<ProfileTomlConfig> {
    const targetFile = join(profilesDir, `${profileName}.toml`);
    try {
        const content = await readFile(targetFile, "utf-8");
        return parseProfileToml(content, targetFile);
    } catch (err: unknown) {
        if (err instanceof TomlConfigurationError) throw err;

        // 如果文件不存在，列出目录下的可用候选
        let available: string[] = [];
        try {
            const files = await readdir(profilesDir);
            available = files
                .filter(file => file.endsWith(".toml"))
                .map(file => file.slice(0, -5));
        } catch {
            // 目录不存在
        }

        const suggestion = available.length > 0
            ? `。当前可用 Profile: ${available.join(", ")}`
            : "。当前 Profile 目录为空或不存在。";
        throw new TomlConfigurationError(
            `Profile "${profileName}" 不存在 (查找路径: ${targetFile})${suggestion}`,
            targetFile,
        );
    }
}

/** 校验 `[providers]` 小节的结构、字段、容量与标识唯一性。 */
function validateProvidersSection(
    value: unknown,
    filePath: string | undefined,
    knownProviderFamilies: readonly string[] | undefined,
): void {
    if (!isRecord(value)) {
        throw new TomlConfigurationError("[providers] 必须为以家族分组的对象", filePath);
    }
    const seenNames = new Set<string>();
    for (const [family, familyValue] of Object.entries(value)) {
        if (knownProviderFamilies !== undefined && !knownProviderFamilies.includes(family)) {
            throw new TomlConfigurationError(`未知的供应商家族: ${family}`, filePath);
        }
        if (!isRecord(familyValue)) {
            throw new TomlConfigurationError(`[providers.${family}] 必须为对象`, filePath);
        }
        for (const [name, providerValue] of Object.entries(familyValue)) {
            const label = `providers.${family}.${name}`;
            if (name.trim().length === 0) {
                throw new TomlConfigurationError(`[providers.${family}] 中的供应商标识不得为空`, filePath);
            }
            if (seenNames.has(name)) {
                throw new TomlConfigurationError(`供应商标识 "${name}" 重复`, filePath);
            }
            seenNames.add(name);
            if (!isRecord(providerValue)) {
                throw new TomlConfigurationError(`[${label}] 必须为对象`, filePath);
            }
            for (const field of Object.keys(providerValue)) {
                if (!ALLOWED_PROVIDER_FIELDS.has(field)) {
                    throw new TomlConfigurationError(`[${label}] 包含未知字段: ${field}`, filePath);
                }
            }
            const apiKey = providerValue.api_key;
            if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
                throw new TomlConfigurationError(`[${label}].api_key 必须为非空字符串`, filePath);
            }
            const baseURL = providerValue.base_url;
            if (baseURL !== undefined) {
                if (typeof baseURL !== "string" || !isAcceptableBaseUrl(baseURL)) {
                    throw new TomlConfigurationError(`[${label}].base_url 必须是不含凭据、查询与片段的 HTTP(S) URL`, filePath);
                }
            } else if (family === "openai-compatible") {
                throw new TomlConfigurationError(`[${label}] 必须声明 base_url`, filePath);
            }
            const models = providerValue.models;
            if (!Array.isArray(models) || models.length === 0) {
                throw new TomlConfigurationError(`[${label}] 必须声明至少一个模型`, filePath);
            }
            const seenIds = new Set<string>();
            for (const [index, modelValue] of models.entries()) {
                const modelLabel = `${label}.models[${index}]`;
                if (!isRecord(modelValue)) {
                    throw new TomlConfigurationError(`[${modelLabel}] 必须为对象`, filePath);
                }
                for (const field of Object.keys(modelValue)) {
                    if (!ALLOWED_PROVIDER_MODEL_FIELDS.has(field)) {
                        throw new TomlConfigurationError(`[${modelLabel}] 包含未知字段: ${field}`, filePath);
                    }
                }
                const id = modelValue.id;
                if (typeof id !== "string" || id.trim().length === 0) {
                    throw new TomlConfigurationError(`[${modelLabel}].id 必须为非空字符串`, filePath);
                }
                if (seenIds.has(id)) {
                    throw new TomlConfigurationError(`[${label}] 中的模型标识 "${id}" 重复`, filePath);
                }
                seenIds.add(id);
                if (modelValue.display_name !== undefined
                    && (typeof modelValue.display_name !== "string" || modelValue.display_name.trim().length === 0)) {
                    throw new TomlConfigurationError(`[${modelLabel}].display_name 必须为非空字符串`, filePath);
                }
                const contextWindow = modelValue.context_window;
                if (typeof contextWindow !== "number" || !isPositiveSafeInteger(contextWindow)) {
                    throw new TomlConfigurationError(`[${modelLabel}].context_window 必须为正的安全整数`, filePath);
                }
                const maxOutputTokens = modelValue.max_output_tokens;
                if (typeof maxOutputTokens !== "number" || !isPositiveSafeInteger(maxOutputTokens)) {
                    throw new TomlConfigurationError(`[${modelLabel}].max_output_tokens 必须为正的安全整数`, filePath);
                }
                if (maxOutputTokens >= contextWindow) {
                    throw new TomlConfigurationError(`[${modelLabel}].max_output_tokens 必须小于 context_window`, filePath);
                }
                for (const flag of [
                    "reasoning", "vision", "tools", "supports_required_tool_choice", "native_structured_output",
                ] as const) {
                    if (modelValue[flag] !== undefined && typeof modelValue[flag] !== "boolean") {
                        throw new TomlConfigurationError(`[${modelLabel}].${flag} 必须为布尔值`, filePath);
                    }
                }
            }
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 校验并提取 GEPA 配置契约。
 *
 * @remarks
 * 验证 `[gepa]` 配置的完整性与安全性，阻断同名 default（大小写不敏感匹配）、空值及路径穿越字符。
 *
 * @param section - 原始 `[gepa]` TOML 小节对象。
 * @param filePath - 配置文件绝对路径，用于精准定位报错信息。
 * @returns 经过语义校验的 GepaConfig。
 * @throws TomlConfigurationError 当小节缺失、缺少 reflection_profile、reflection_profile 为空、大小写不敏感等价于 "default" 或包含路径遍历与非法字符时抛出。
 * @example
 * ```ts
 * const gepa = validateGepaConfig({ reflection_profile: "gepa-reflection" }, "/path/to/config.toml");
 * ```
 */
export function validateGepaConfig(section?: GepaTomlSection, filePath?: string): GepaConfig {
    if (section === undefined || section.reflection_profile === undefined || section.reflection_profile.trim() === "") {
        throw new TomlConfigurationError(
            "缺少必要的 [gepa].reflection_profile 配置项",
            filePath,
        );
    }
    const profileName = section.reflection_profile.trim();
    if (profileName.toLowerCase() === "default") {
        throw new TomlConfigurationError(
            'reflection_profile 不能与 Working Profile 同名 ("default")',
            filePath,
        );
    }
    if (profileName.includes("/") || profileName.includes("\\") || profileName.includes("..") || !/^[a-zA-Z0-9_-]+$/.test(profileName)) {
        throw new TomlConfigurationError(
            `reflection_profile 包含非法字符: "${profileName}"`,
            filePath,
        );
    }
    return { reflectionProfile: profileName };
}
