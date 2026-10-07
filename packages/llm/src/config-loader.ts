import {
    resolveLazyGoalHomePaths,
    parseTomlConfig,
    validateGepaConfig,
    loadRuntimeConfig,
    type LoadConfigOptions,
    type LLMConfig,
    type GepaConfig,
    type LazyGoalTomlConfig,
} from "../../config/src/index";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { TomlConfigurationError } from "../../config/src/index";
import { LLMConfigurationError } from "../../config/src/index";

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
        fileConfig = parseTomlConfig(content, configFile);
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
