import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolveXdgPaths, type XdgPaths } from "./xdg";
import {
    parseTomlConfig,
    loadProfileToml,
    validateGepaConfig,
    type LazyGoalTomlConfig,
    type ProfileTomlConfig,
    type LlmTomlSection,
    type GepaConfig,
    TomlConfigurationError,
} from "./toml-config";
import { LlmConfigurationError, type LlmConfig, type LlmProvider } from "./config";
import type { StructuredOutputMode } from "./core/types";

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
    readonly llm: LlmConfig;
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
 */
export interface LoadConfigOptions {
    /** 自定义环境变量（主要用于测试注入）。 */
    readonly env?: NodeJS.ProcessEnv;
    /** 预先指定的 XDG 路径对象。 */
    readonly xdgPaths?: XdgPaths;
    /** 显式指定的主配置文件路径（优先级高于 XDG 默认路径）。 */
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
 * @throws LlmConfigurationError 必填 LLM 字段缺失或非法。
 * @example
 * ```ts
 * const config = await loadRuntimeConfig({ cliArgs: { model: "gpt-4o" } });
 * console.log(config.llm.model);
 * ```
 */
export async function loadRuntimeConfig(options: LoadConfigOptions = {}): Promise<LazyGoalRuntimeConfig> {
    const xdgPaths = options.xdgPaths ?? resolveXdgPaths(options.env);
    const configFile = options.customConfigFile ?? xdgPaths.configFile;

    // 1. 加载 config.toml
    let fileConfig: LazyGoalTomlConfig = {};
    if (existsSync(configFile)) {
        const content = await readFile(configFile, "utf-8");
        fileConfig = parseTomlConfig(content, configFile);
    }

    // 2. 判定激活的 Profile 名称
    const activeProfileName = options.cliArgs?.profile
        ?? fileConfig.profile?.active
        ?? (existsSync(`${xdgPaths.profilesDir}/default.toml`) ? "default" : undefined);

    let profileConfig: ProfileTomlConfig = {};
    if (activeProfileName !== undefined) {
        profileConfig = await loadProfileToml(activeProfileName, xdgPaths.profilesDir);
    }

    // 3. 逐层合并配置（Defaults -> config.toml -> profile.toml -> CLI args）
    const mergedLlm: LlmTomlSection = {
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

    // 4. 校验并构建标准 LlmConfig
    const missing: string[] = [];
    if (!mergedLlm.provider) missing.push("provider");
    if (!mergedLlm.model) missing.push("model");
    if (!mergedLlm.api_key) missing.push("api_key");

    if (missing.length > 0) {
        throw new LlmConfigurationError(
            missing,
            `缺少必要的 LLM 配置项: ${missing.join(", ")}。请在 ${configFile} 中配置，或通过 CLI 参数传入。`,
        );
    }

    const provider = mergedLlm.provider as LlmProvider;
    const mode = (mergedLlm.structured_output_mode as StructuredOutputMode | undefined) ?? "prompt_only";

    if (mergedLlm.structured_output_mode !== undefined && mode !== "strict" && mode !== "prompt_only" && mode !== "two_stage") {
        throw new LlmConfigurationError(
            [],
            `无效的 structured_output_mode "${mode}": 必须为 "strict"、"prompt_only" 或 "two_stage"`,
        );
    }

    if (mergedLlm.structured_output_mode !== undefined && (mode === "strict" || mode === "two_stage") && !["openai", "google", "openai-compatible"].includes(provider)) {
        throw new LlmConfigurationError(
            [],
            `供应商 "${provider}" 不支持 ${mode} 模式，请配置 prompt_only`,
        );
    }

    let verifiedLlmConfig: LlmConfig;
    if (provider === "openai-compatible") {
        if (!mergedLlm.base_url) throw new LlmConfigurationError(["base_url"], "openai-compatible 必须配置 base_url");
        if (!mergedLlm.context_window_tokens) throw new LlmConfigurationError(["context_window_tokens"], "openai-compatible 必须配置 context_window_tokens");
        if (!mergedLlm.max_output_tokens) throw new LlmConfigurationError(["max_output_tokens"], "openai-compatible 必须配置 max_output_tokens");

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

/**
 * 加载并校验独立的 Reflection LM 运行时配置。
 *
 * @remarks
 * 强制读取主配置中的 `[gepa].reflection_profile`，并加载对应的独立 Profile。
 * 强制覆盖结构化输出模式为 `prompt_only`，且严禁回退到 default 或当前 active Profile。
 *
 * @param options - 加载选项。
 * @returns 经过校验的 Reflection LLM 配置及 Profile 元信息。
 * @throws TomlConfigurationError 当 [gepa] 未配置、同名为 default 或目标 profile 文件不存在时。
 * @throws LlmConfigurationError 当 Reflection profile 缺少必要凭据时。
 * @example
 * ```ts
 * const reflection = await loadReflectionRuntimeConfig();
 * const adapter = createLlmAdapter(reflection.llm);
 * ```
 */
export async function loadReflectionRuntimeConfig(options: LoadConfigOptions = {}): Promise<{
    readonly llm: LlmConfig;
    readonly profileName: string;
}> {
    const xdgPaths = options.xdgPaths ?? resolveXdgPaths(options.env);
    const configFile = options.customConfigFile ?? xdgPaths.configFile;
    let fileConfig: LazyGoalTomlConfig = {};
    if (existsSync(configFile)) {
        const content = await readFile(configFile, "utf-8");
        fileConfig = parseTomlConfig(content, configFile);
    }
    const gepa = validateGepaConfig(fileConfig.gepa, configFile);
    const runtimeConfig = await loadRuntimeConfig({
        ...options,
        cliArgs: {
            ...options.cliArgs,
            profile: gepa.reflectionProfile,
            structuredOutputMode: "prompt_only",
        },
    });
    return {
        llm: runtimeConfig.llm,
        profileName: gepa.reflectionProfile,
    };
}

/**
 * GEPA 双模型已解析运行时配置契约。
 *
 * @remarks
 * 聚合 GEPA 优化运行生命周期所需的两个独立 LLM 运行时配置：
 * 1. `working`：负责在基准任务上执行 Agent 循环与工具调用，固定从 `profiles/default.toml` 加载，不受用户活动 profile 变更干扰；
 * 2. `reflection`：负责根据失败轨迹生成变异 Prompt 反思文本，固定从 `[gepa].reflection_profile` 解析，且强制限制为 `prompt_only` 模式；
 * 两者在物理配置文件、模型凭据及运行时适配器上严格隔离，严禁同名与回退。
 *
 * @example
 * ```ts
 * const configs: GepaModelConfigs = {
 *     working: workingLlmConfig,
 *     reflection: reflectionLlmConfig,
 * };
 * ```
 */
export interface GepaModelConfigs {
    /** 负责基准评测任务执行的 Working LM 配置（固定从 default.toml 加载）。 */
    readonly working: LlmConfig;
    /** 负责 Prompt 变异反思的独立 Reflection LM 配置（固定从 reflection_profile 加载，模式为 prompt_only）。 */
    readonly reflection: LlmConfig;
    /** Working LM 实际解析使用的 Profile 名称，当前固定为 `default`。 */
    readonly workingProfileName: string;
    /** Reflection LM 实际解析使用的 Profile 名称，来自 `[gepa].reflection_profile`。 */
    readonly reflectionProfileName: string;
}

/**
 * 同时加载并校验 GEPA 运行所需的 Working LM 与 Reflection LM 双模型配置。
 *
 * @remarks
 * 严格执行双模型配置隔离契约：
 * 1. Working LM 固定锁定解析 `profiles/default.toml`，忽略 `config.toml` 中声明的 `[profile].active`；
 * 2. Reflection LM 强制读取 `config.toml` 中的 `[gepa].reflection_profile`，且强制覆盖为 `prompt_only` 模式；
 * 3. 若 Reflection Profile 缺失、同名为 default 或配置非法，在任何模型调用前快速失败。
 *
 * @param options - 配置加载选项。
 * @returns 包含独立 working 与 reflection 配置的对象。
 * @throws TomlConfigurationError 当配置语法错误、缺失必要 profile 或同名时。
 * @throws LlmConfigurationError 当缺少必要凭据时。
 * @example
 * ```ts
 * const configs = await loadGepaModelConfigs();
 * console.log(configs.workingProfileName, configs.reflectionProfileName);
 * ```
 */
export async function loadGepaModelConfigs(options: LoadConfigOptions = {}): Promise<GepaModelConfigs> {
    const reflectionRuntime = await loadReflectionRuntimeConfig(options);
    const workingRuntime = await loadRuntimeConfig({
        ...options,
        cliArgs: {
            ...options.cliArgs,
            profile: "default",
        },
    });
    return {
        working: workingRuntime.llm,
        reflection: reflectionRuntime.llm,
        workingProfileName: "default",
        reflectionProfileName: reflectionRuntime.profileName,
    };
}
