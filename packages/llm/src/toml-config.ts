import { parse as parseToml } from "smol-toml";
import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";

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
 * `[llm]` 小节配置结构。
 */
export interface LlmTomlSection {
    /** 模型提供商标识（如 openai, google, openai-compatible 等）。 */
    provider?: string;
    /** 选用的模型名称。 */
    model?: string;
    /** API 访问密钥凭据。 */
    api_key?: string;
    /** 覆盖基础请求端点 URL。 */
    base_url?: string;
    /** 结构化输出模式（strict 或 prompt_only）。 */
    structured_output_mode?: string;
    /** 上下文窗口 Token 限制。 */
    context_window_tokens?: number;
    /** 最大输出 Token 限制。 */
    max_output_tokens?: number;
    /** Tokenizer 编码名称。 */
    tokenizer_encoding?: string;
}

/**
 * `[workspace]` 小节配置结构。
 */
export interface WorkspaceTomlSection {
    /** 默认工作区根目录路径。 */
    root?: string;
}

/**
 * `[profile]` 小节配置结构。
 */
export interface ProfileTomlSection {
    /** 默认激活的用户级 Profile 名称。 */
    active?: string;
}

/**
 * `[tui]` 小节配置结构。
 */
export interface TuiTomlSection {
    /** TUI 启动执行模式。 */
    execution_mode?: "autonomous" | "confirm";
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
 * ```
 */
export interface LazyGoalTomlConfig {
    llm?: LlmTomlSection;
    workspace?: WorkspaceTomlSection;
    profile?: ProfileTomlSection;
    tui?: TuiTomlSection;
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
    llm?: LlmTomlSection;
    tui?: TuiTomlSection;
}

const ALLOWED_CONFIG_SECTIONS = new Set(["llm", "workspace", "profile", "tui"]);
const ALLOWED_LLM_FIELDS = new Set([
    "provider", "model", "api_key", "base_url", "structured_output_mode",
    "context_window_tokens", "max_output_tokens", "tokenizer_encoding",
]);

/**
 * 解析并强校验主配置 TOML 文本。
 *
 * @param content - 原始 TOML 文本。
 * @param filePath - 可选的文件绝对路径，用于精准报错定位。
 * @returns 经过校验的配置对象。
 * @throws TomlConfigurationError 当语法错误或包含未知小节/字段时快速失败。
 * @example
 * ```ts
 * const config = parseTomlConfig("[llm]\nprovider = 'openai'", "config.toml");
 * ```
 */
export function parseTomlConfig(content: string, filePath?: string): LazyGoalTomlConfig {
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
    }

    return raw as LazyGoalTomlConfig;
}

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
 * const profile = await loadProfileToml("default", "~/.config/lazygoal/profiles");
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
