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
    type ProviderTomlSection,
    type ProvidersTomlSection,
    type GepaConfig,
    TomlConfigurationError,
} from "./toml-config";
import { LLMConfigurationError, type LLMConfig, type StructuredOutputMode } from "../../llm-core/src/index";

/**
 * CLI 命令行传入的临时参数字典。
 *
 * @example
 * ```ts
 * const overrides: CliConfigOverrides = { model: "gpt-4o" };
 * ```
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
 *
 * @example
 * ```ts
 * const config = await loadRuntimeConfig();
 * console.log(config.llm.provider, config.llm.model);
 * ```
 */
export interface LazyGoalRuntimeConfig {
    /** 已校验合法的 LLM 供应商连接配置。 */
    readonly llm: LLMConfig;
    /** 配置声明的供应商与模型事实；不含凭据。 */
    readonly providers?: readonly RuntimeProviderDeclaration[];
    /** 激活生效的 Profile 名称。 */
    readonly activeProfile?: string;
    /** 默认工作区根路径。 */
    readonly workspaceRoot?: string;
    /** TUI 相关配置。 */
    readonly tui?: {
        readonly executionMode?: "autonomous" | "confirm";
    };
    /** Context Epoch 工作窗口配置。 */
    readonly context?: {
        readonly epochLimitTokens?: number;
        readonly compactThresholdPercent?: number;
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
    /** 组合根已注册的供应商家族；用于拒绝未知家族。 */
    readonly knownProviderFamilies?: readonly string[];
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
        fileConfig = parseTomlConfig(content, configFile, {
            ...(options.knownProviderFamilies === undefined
                ? {}
                : { knownProviderFamilies: options.knownProviderFamilies }),
        });
    }

    // 2. 判定激活的 Profile 名称
    const activeProfileName = options.cliArgs?.profile
        ?? fileConfig.profile?.active
        ?? (existsSync(`${homePaths.profilesDir}/default.toml`) ? "default" : undefined);

    let profileConfig: ProfileTomlConfig = {};
    if (activeProfileName !== undefined) {
        profileConfig = await loadProfileToml(activeProfileName, homePaths.profilesDir);
    }

    // 3. 解析供应商选择（config.toml → profile.toml → CLI 参数）
    const providers = fileConfig.providers ?? {};
    const selection: LLMTomlSection = {
        ...fileConfig.llm,
        ...profileConfig.llm,
    };
    if (options.cliArgs?.provider) selection.provider = options.cliArgs.provider;
    if (options.cliArgs?.model) selection.model = options.cliArgs.model;

    const missing: string[] = [];
    if (!selection.provider) missing.push("provider");
    if (!selection.model) missing.push("model");
    if (missing.length > 0) {
        throw new LLMConfigurationError(
            missing,
            `缺少必要的 LLM 选型: ${missing.join(", ")}。请在 [providers.<family>.<name>] 中声明供应商，并在 [llm] 中引用 provider 与 model。`,
        );
    }

    const entry = findProviderEntry(providers, selection.provider!);
    if (entry === undefined) {
        throw new LLMConfigurationError(
            ["provider"],
            `未知供应商 "${selection.provider}"；请在 [providers.<family>.<name>] 中声明。`,
        );
    }
    const model = (entry.provider.models ?? []).find(candidate => candidate.id === selection.model);
    if (model === undefined) {
        throw new LLMConfigurationError(
            ["model"],
            `供应商 "${entry.name}" 未声明模型 "${selection.model}"`,
        );
    }

    const mode = resolveStructuredOutputMode(
        options.cliArgs?.structuredOutputMode,
        entry.family,
    );
    const apiKey = options.cliArgs?.apiKey?.trim() || entry.provider.api_key!;
    const baseURL = options.cliArgs?.baseUrl?.trim() || entry.provider.base_url;
    const verifiedLlmConfig: LLMConfig = {
        provider: entry.name,
        apiKey,
        model: model.id!,
        structuredOutputMode: mode,
        ...(baseURL === undefined ? {} : { baseURL }),
        contextWindowTokens: model.context_window!,
        maxOutputTokens: model.max_output_tokens!,
        ...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }),
        ...(model.vision === undefined ? {} : { vision: model.vision }),
        ...(model.supports_required_tool_choice === undefined
            ? {}
            : { supportsRequiredToolChoice: model.supports_required_tool_choice }),
        ...(model.native_structured_output === undefined
            ? {}
            : { nativeStructuredOutput: model.native_structured_output }),
    };
    const runtimeProviders = toRuntimeProviders(providers);

    const workspaceRoot = options.cliArgs?.workspaceRoot ?? fileConfig.workspace?.root;
    const executionMode = options.cliArgs?.executionMode
        ?? profileConfig.tui?.execution_mode
        ?? fileConfig.tui?.execution_mode;

    const gepa = fileConfig.gepa !== undefined
        ? validateGepaConfig(fileConfig.gepa, configFile)
        : undefined;

    const context = fileConfig.context === undefined
        ? undefined
        : {
            ...(fileConfig.context.epoch_limit_tokens === undefined
                ? {}
                : { epochLimitTokens: fileConfig.context.epoch_limit_tokens }),
            ...(fileConfig.context.compact_threshold_percent === undefined
                ? {}
                : { compactThresholdPercent: fileConfig.context.compact_threshold_percent }),
        };

    return {
        llm: verifiedLlmConfig,
        ...(runtimeProviders.length === 0 ? {} : { providers: runtimeProviders }),
        ...(activeProfileName !== undefined ? { activeProfile: activeProfileName } : {}),
        ...(workspaceRoot !== undefined ? { workspaceRoot } : {}),
        ...(executionMode !== undefined ? { tui: { executionMode } } : {}),
        ...(context === undefined ? {} : { context }),
        ...(gepa !== undefined ? { gepa } : {}),
    };
}

/**
 * 仅加载 `config.toml` 的 `[context]` 小节。
 *
 * @remarks
 * 供不经过完整 LLM 凭据校验的宿主读取 Epoch 工作窗口配置；缺失文件或小节时返回空对象，
 * 字段校验与完整加载一致。
 *
 * @param options - Home 路径与可选的显式配置文件路径。
 * @returns 已校验的 Epoch 上限与整理阈值；均未配置时为 `undefined`。
 * @throws TomlConfigurationError 当 `[context]` 结构或字段值非法时。
 * @example
 * ```ts
 * const context = await loadContextConfig({ homePaths });
 * ```
 */
export async function loadContextConfig(options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly homePaths?: LazyGoalHomePaths;
    readonly customConfigFile?: string;
} = {}): Promise<{ readonly epochLimitTokens?: number; readonly compactThresholdPercent?: number } | undefined> {
    const homePaths = options.homePaths ?? resolveLazyGoalHomePaths(options.env);
    const configFile = options.customConfigFile ?? homePaths.configFile;
    if (!existsSync(configFile)) return undefined;
    const parsed = parseTomlConfig(await readFile(configFile, "utf-8"), configFile);
    const section = parsed.context;
    if (section === undefined) return undefined;
    return {
        ...(section.epoch_limit_tokens === undefined ? {} : { epochLimitTokens: section.epoch_limit_tokens }),
        ...(section.compact_threshold_percent === undefined
            ? {}
            : { compactThresholdPercent: section.compact_threshold_percent }),
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
 * @throws LLMConfigurationError 当 Reflection profile 缺少必要凭据时。
 * @example
 * ```ts
 * const reflection = await loadReflectionRuntimeConfig();
 * const adapter = createLlmAdapter(reflection.llm);
 * ```
 */
export async function loadReflectionRuntimeConfig(options: LoadConfigOptions = {}): Promise<{
    readonly llm: LLMConfig;
    readonly profileName: string;
}> {
    const homePaths = options.homePaths ?? resolveLazyGoalHomePaths(options.env);
    const configFile = options.customConfigFile ?? homePaths.configFile;
    let fileConfig: LazyGoalTomlConfig = {};
    if (existsSync(configFile)) {
        const content = await readFile(configFile, "utf-8");
        fileConfig = parseTomlConfig(content, configFile, {
            ...(options.knownProviderFamilies === undefined
                ? {}
                : { knownProviderFamilies: options.knownProviderFamilies }),
        });
    }
    const gepa = validateGepaConfig(fileConfig.gepa, configFile);
    const runtimeConfig = await loadRuntimeConfig({
        ...options,
        homePaths,
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
 * 1. `working`：负责在基准任务上执行 Agent 循环与工具调用，固定从 LazyGoal Home 的 `profiles/default.toml` 加载，不受用户活动 profile 变更干扰；
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
    readonly working: LLMConfig;
    /** 负责 Prompt 变异反思的独立 Reflection LM 配置（固定从 reflection_profile 加载，模式为 prompt_only）。 */
    readonly reflection: LLMConfig;
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
 * 1. Working LM 固定锁定解析 LazyGoal Home 的 `profiles/default.toml`，忽略 `config.toml` 中声明的 `[profile].active`；
 * 2. Reflection LM 强制读取 `config.toml` 中的 `[gepa].reflection_profile`，且强制覆盖为 `prompt_only` 模式；
 * 3. 若 Reflection Profile 缺失、同名为 default 或配置非法，在任何模型调用前快速失败。
 *
 * @param options - 配置加载选项。
 * @returns 包含独立 working 与 reflection 配置的对象。
 * @throws TomlConfigurationError 当配置语法错误、缺失必要 profile 或同名时。
 * @throws LLMConfigurationError 当缺少必要凭据时。
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

/** 配置声明的单个模型事实；不含凭据与端点。 */
export interface RuntimeModelDeclaration {
    readonly id: string;
    readonly displayName: string;
    readonly contextWindowTokens: number;
    readonly maxOutputTokens: number;
    readonly reasoning?: boolean | undefined;
    readonly vision?: boolean | undefined;
    readonly tools?: boolean | undefined;
    readonly supportsRequiredToolChoice?: boolean | undefined;
    readonly nativeStructuredOutput?: boolean | undefined;
}

/** 配置声明的供应商事实；凭据只保留在已解析的 `llm` 连接中。 */
export interface RuntimeProviderDeclaration {
    /** 供应商标识，即 `providers.<family>.<name>` 中的 `name`。 */
    readonly provider: string;
    /** 适配器家族，即 `providers.<family>.<name>` 中的 `family`。 */
    readonly family: string;
    /** 端点覆盖；省略时由适配器使用默认端点。 */
    readonly baseURL?: string | undefined;
    /** 该供应商声明的模型列表。 */
    readonly models: readonly RuntimeModelDeclaration[];
}

interface ProviderEntry {
    readonly family: string;
    readonly name: string;
    readonly provider: ProviderTomlSection;
}

/** 只接受原生约束的原生供应商家族；请求驱动适配器不受此限制。 */
const STRICT_OUTPUT_FAMILIES = new Set(["openai", "google", "openai-compatible"]);

function findProviderEntry(providers: ProvidersTomlSection, name: string): ProviderEntry | undefined {
    for (const [family, entries] of Object.entries(providers)) {
        const provider = entries[name];
        if (provider !== undefined) return { family, name, provider };
    }
    return undefined;
}

function resolveStructuredOutputMode(raw: string | undefined, family: string): StructuredOutputMode {
    const mode = raw === undefined || raw.trim().length === 0 ? "prompt_only" : raw.trim();
    if (mode !== "strict" && mode !== "prompt_only" && mode !== "two_stage") {
        throw new LLMConfigurationError(
            [],
            `无效的 structured_output_mode "${mode}": 必须为 "strict"、"prompt_only" 或 "two_stage"`,
        );
    }
    if ((mode === "strict" || mode === "two_stage") && !STRICT_OUTPUT_FAMILIES.has(family)) {
        throw new LLMConfigurationError([], `供应商家族 "${family}" 不支持 ${mode} 模式`);
    }
    return mode;
}

function toRuntimeProviders(providers: ProvidersTomlSection): RuntimeProviderDeclaration[] {
    const declarations: RuntimeProviderDeclaration[] = [];
    for (const [family, entries] of Object.entries(providers)) {
        for (const [name, provider] of Object.entries(entries)) {
            declarations.push({
                provider: name,
                family,
                ...(provider.base_url === undefined ? {} : { baseURL: provider.base_url }),
                models: (provider.models ?? []).map(model => ({
                    id: model.id!,
                    displayName: model.display_name ?? model.id!,
                    contextWindowTokens: model.context_window!,
                    maxOutputTokens: model.max_output_tokens!,
                    ...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }),
                    ...(model.vision === undefined ? {} : { vision: model.vision }),
                    ...(model.tools === undefined ? {} : { tools: model.tools }),
                    ...(model.supports_required_tool_choice === undefined
                        ? {}
                        : { supportsRequiredToolChoice: model.supports_required_tool_choice }),
                    ...(model.native_structured_output === undefined
                        ? {}
                        : { nativeStructuredOutput: model.native_structured_output }),
                })),
            });
        }
    }
    return declarations;
}
