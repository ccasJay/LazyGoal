import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolveLazyGoalHomePaths, type LazyGoalHomePaths } from "./home";
import {
    parseTomlConfig,
    loadProfileToml,
    validateGepaConfig,
    type LazyGoalTomlConfig,
    type ProfileTomlConfig,
    type LLMTomlSection,
    type GepaConfig,
    TomlConfigurationError,
} from "./toml-config";
import { LLMConfigurationError, type LLMConfig, type LLMProvider, type StructuredOutputMode } from "./llm-config";

/**
 * CLI 命令行传入的临时参数字典。
 */
export interface CliConfigOverrides {
    readonly provider?: string;
    readonly model?: string;
    readonly apiKey?: string;
    readonly baseUrl?: string;
    readonly structuredOutputMode?: string;
    readonly contextWindowTokens?: number;
    readonly maxOutputTokens?: number;
    readonly tokenizerEncoding?: string;
    readonly profile?: string;
    readonly workspaceRoot?: string;
    readonly executionMode?: "autonomous" | "confirm";
}

/**
 * 最终生成的 LazyGoal 运行时不可变配置。
 */
export interface LazyGoalRuntimeConfig {
    /** 已校验合法的 LLM 供应商连接配置。 */
    readonly llm: LLMConfig;
    /** 激活生效的 Profile 名称。 */
    readonly activeProfile?: string;
    /** 默认工作区根路径。 */
    readonly workspaceRoot?: string;
    /** TUI 相关配置。 */
    readonly tui?: {
        readonly executionMode?: "autonomous" | "confirm";
    };
    /** GEPA 运行时配置（若已在主配置中声明）。 */
    readonly gepa?: GepaConfig;
}

/**
 * 加载运行时配置的选项。
 *
 * @example
 * ```ts
 * const config = await loadRuntimeConfig({
 *     homePaths: resolveLazyGoalHomePaths(),
 *     cliArgs: { profile: "default" },
 * });
 * ```
 */
export interface LoadConfigOptions {
    /** 自定义环境变量（主要用于测试注入）。 */
    readonly env?: NodeJS.ProcessEnv;
    /** 预先指定的 LazyGoal Home 路径对象。 */
    readonly homePaths?: LazyGoalHomePaths;
    /** 显式指定的主配置文件路径（优先级高于 LazyGoal Home 默认路径）。 */
    readonly customConfigFile?: string;
    /** CLI 命令行传入的临时覆盖参数。 */
    readonly cliArgs?: CliConfigOverrides;
}

/**
 * 按照“内置默认值 → config.toml → profile.toml → CLI 参数”四层流水线加载运行时配置。
 *
 * @remarks
 * CLI 覆盖参数只在内存生效，绝不回写任何磁盘配置文件。
 * 缺少必填凭据时快速失败并给出清晰指引。
 *
 * @param options - 加载选项。
 * @returns 经过深度合并并校验合规的 LazyGoalRuntimeConfig。
 * @throws TomlConfigurationError TOML 语法或语义非法。
 * @throws LLMConfigurationError 必填 LLM 字段缺失或非法。
 * @example
 * ```ts
 * const config = await loadRuntimeConfig({ cliArgs: { model: "gpt-4o" } });
 * console.log(config.llm.model);
 * ```
 */
export async function loadRuntimeConfig(options: LoadConfigOptions = {}): Promise<LazyGoalRuntimeConfig> {
    const homePaths = options.homePaths ?? resolveLazyGoalHomePaths(options.env);
    const configFile = options.customConfigFile ?? homePaths.configFile;

    // 1. 加载 config.toml
    let fileConfig: LazyGoalTomlConfig = {};
    if (existsSync(configFile)) {
        const content = await readFile(configFile, "utf-8");
        fileConfig = parseTomlConfig(content, configFile);
    }

    // 2. 判定激活的 Profile 名称
    const activeProfileName = options.cliArgs?.profile
        ?? fileConfig.profile?.active
        ?? (existsSync(`${homePaths.profilesDir}/default.toml`) ? "default" : undefined);

    let profileConfig: ProfileTomlConfig = {};
    if (activeProfileName !== undefined) {
        profileConfig = await loadProfileToml(activeProfileName, homePaths.profilesDir);
    }

    // 3. 逐层合并配置（Defaults -> config.toml -> profile.toml -> CLI args）
    const mergedLlm: LLMTomlSection = {
        structured_output_mode: "prompt_only", // 内置默认值
        ...fileConfig.llm,
        ...profileConfig.llm,
    };

    // 应用 CLI 覆盖
    if (options.cliArgs?.provider) mergedLlm.provider = options.cliArgs.provider;
    if (options.cliArgs?.model) mergedLlm.model = options.cliArgs.model;
    if (options.cliArgs?.apiKey) mergedLlm.api_key = options.cliArgs.apiKey;
    if (options.cliArgs?.baseUrl) mergedLlm.base_url = options.cliArgs.baseUrl;
    if (options.cliArgs?.structuredOutputMode) mergedLlm.structured_output_mode = options.cliArgs.structuredOutputMode;
    if (options.cliArgs?.contextWindowTokens) mergedLlm.context_window_tokens = options.cliArgs.contextWindowTokens;
    if (options.cliArgs?.maxOutputTokens) mergedLlm.max_output_tokens = options.cliArgs.maxOutputTokens;
    if (options.cliArgs?.tokenizerEncoding) mergedLlm.tokenizer_encoding = options.cliArgs.tokenizerEncoding;

    // 4. 校验并构建标准 LLMConfig
    const missing: string[] = [];
    if (!mergedLlm.provider) missing.push("provider");
    if (!mergedLlm.model) missing.push("model");
    if (!mergedLlm.api_key) missing.push("api_key");

    if (missing.length > 0) {
        throw new LLMConfigurationError(
            missing,
            `缺少必要的 LLM 配置项: ${missing.join(", ")}。请在 ${configFile} 中配置，或通过 CLI 参数传入。`,
        );
    }

    const provider = mergedLlm.provider as LLMProvider;
    const mode = (mergedLlm.structured_output_mode as StructuredOutputMode | undefined) ?? "prompt_only";

    if (mergedLlm.structured_output_mode !== undefined && mode !== "strict" && mode !== "prompt_only" && mode !== "two_stage") {
        throw new LLMConfigurationError(
            [],
            `无效的 structured_output_mode "${mode}": 必须为 "strict"、"prompt_only" 或 "two_stage"`,
        );
    }

    if (mergedLlm.structured_output_mode !== undefined && (mode === "strict" || mode === "two_stage") && !["openai", "google", "openai-compatible"].includes(provider)) {
        throw new LLMConfigurationError(
            [],
            `供应商 "${provider}" 不支持 ${mode} 模式，请配置 prompt_only`,
        );
    }

    let verifiedLlmConfig: LLMConfig;
    if (provider === "openai-compatible") {
        if (!mergedLlm.base_url) throw new LLMConfigurationError(["base_url"], "openai-compatible 必须配置 base_url");
        if (!mergedLlm.context_window_tokens) throw new LLMConfigurationError(["context_window_tokens"], "openai-compatible 必须配置 context_window_tokens");
        if (!mergedLlm.max_output_tokens) throw new LLMConfigurationError(["max_output_tokens"], "openai-compatible 必须配置 max_output_tokens");

        verifiedLlmConfig = {
            provider,
            model: mergedLlm.model!,
            apiKey: mergedLlm.api_key!,
            structuredOutputMode: mode,
            baseURL: mergedLlm.base_url,
            contextWindowTokens: mergedLlm.context_window_tokens,
            maxOutputTokens: mergedLlm.max_output_tokens,
        };
    } else if (provider === "openai" || provider === "google") {
        verifiedLlmConfig = {
            provider,
            model: mergedLlm.model!,
            apiKey: mergedLlm.api_key!,
            structuredOutputMode: mode,
            ...(mergedLlm.base_url ? { baseURL: mergedLlm.base_url } : {}),
            ...(mergedLlm.max_output_tokens ? { maxOutputTokens: mergedLlm.max_output_tokens } : {}),
        };
    } else {
        verifiedLlmConfig = {
            provider,
            model: mergedLlm.model!,
            apiKey: mergedLlm.api_key!,
            structuredOutputMode: mode,
            ...(mergedLlm.max_output_tokens ? { maxOutputTokens: mergedLlm.max_output_tokens } : {}),
        };
    }

    const workspaceRoot = options.cliArgs?.workspaceRoot ?? fileConfig.workspace?.root;
    const executionMode = options.cliArgs?.executionMode
        ?? profileConfig.tui?.execution_mode
        ?? fileConfig.tui?.execution_mode;

    const gepa = fileConfig.gepa !== undefined
        ? validateGepaConfig(fileConfig.gepa, configFile)
        : undefined;

    return {
        llm: verifiedLlmConfig,
        ...(activeProfileName !== undefined ? { activeProfile: activeProfileName } : {}),
        ...(workspaceRoot !== undefined ? { workspaceRoot } : {}),
        ...(executionMode !== undefined ? { tui: { executionMode } } : {}),
        ...(gepa !== undefined ? { gepa } : {}),
    };
}

